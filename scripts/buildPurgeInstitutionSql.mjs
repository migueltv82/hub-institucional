import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// I3: SQL para borrar una institucion de PRUEBA completa antes de cargar datos reales. Se pega en el SQL Editor.
// - Sin --ejecutar (por defecto) solo CUENTA lo que borraria: no modifica nada.
// - Con --ejecutar borra en una sola transaccion: todas las filas con institution_id de esa institucion (de
//   hijos a padres), la institucion y los usuarios Auth que eran SOLO de ella (nunca un Super Admin ni alguien
//   con membresia o legajo en otra institucion). Aborta sin borrar nada si quedan archivos en Storage: esos se
//   borran antes desde el Dashboard (Storage no permite borrarlos por SQL). Los registros de auditoria se conservan.

export const SOURCE_FILES_BUCKET = 'workspace-source-files';

export function sqlText(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

export function parseArgs(argv) {
  const options = { ejecutar: false, salida: 'purga-institucion.sql' };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--ejecutar') options.ejecutar = true;
    else if (arg === '--institucion') options.institucion = argv[++index];
    else if (arg === '--salida') options.salida = argv[++index];
    else throw new Error(`Argumento desconocido: ${arg}`);
  }
  if (!String(options.institucion ?? '').trim()) throw new Error('Falta --institucion "<nombre exacto de la institucion de prueba>".');
  if (/[\r\n\0]/.test(options.institucion)) throw new Error('El nombre de la institucion no puede tener saltos de linea.');
  if (!String(options.salida ?? '').trim()) throw new Error('Falta el archivo de --salida.');
  return options;
}

// Comun a los dos modos: resuelve la institucion (exactamente una) y arma la lista de usuarios a evaluar.
function targetSql(institution) {
  return `create temporary table purge_target as
select id, name from public.institutions where name = ${sqlText(institution)};

do $$
declare n integer;
begin
  select count(*) into n from purge_target;
  if n <> 1 then
    raise exception 'PURGE_INSTITUTION_NOT_FOUND: hay % instituciones con ese nombre exacto (tiene que haber 1).', n;
  end if;
end $$;

-- Tablas de public con institution_id (incluye las del gateway de Storage y cualquier tabla futura).
create temporary table purge_tables as
select c.table_name::text as table_name
from information_schema.columns c
join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name and t.table_type = 'BASE TABLE'
where c.table_schema = 'public' and c.column_name = 'institution_id' and c.table_name <> 'institutions';

-- Usuarios ligados a la institucion: membresias y legajos (alumnos y docentes).
create temporary table purge_users as
select distinct user_id as id from (
  select m.user_id from public.memberships m where m.institution_id = (select id from purge_target)
  union all select s.profile_id from public.student_records s where s.institution_id = (select id from purge_target) and s.profile_id is not null
  union all select t.profile_id from public.teacher_records t where t.institution_id = (select id from purge_target) and t.profile_id is not null
) linked;

-- Solo se borran los que no son Super Admin y no tienen nada en otra institucion.
create temporary table purge_users_exclusive as
select u.id from purge_users u
where not exists (select 1 from public.profiles p where p.user_id = u.id and p.is_global_admin)
  and not exists (select 1 from public.memberships m where m.user_id = u.id and m.institution_id <> (select id from purge_target))
  and not exists (select 1 from public.student_records s where s.profile_id = u.id and s.institution_id <> (select id from purge_target))
  and not exists (select 1 from public.teacher_records t where t.profile_id = u.id and t.institution_id <> (select id from purge_target));

create temporary table purge_report (item text primary key, cantidad bigint not null);

do $$
declare tbl text; n bigint;
begin
  for tbl in select table_name from purge_tables order by table_name loop
    execute format('select count(*) from public.%I where institution_id = $1', tbl) into n using (select id from purge_target);
    insert into purge_report values ('filas ' || tbl, n);
  end loop;
  insert into purge_report values
    ('usuarios ligados', (select count(*) from purge_users)),
    ('usuarios a borrar (solo de esta institucion)', (select count(*) from purge_users_exclusive)),
    ('usuarios que se conservan (otra institucion o Super Admin)', (select count(*) from purge_users) - (select count(*) from purge_users_exclusive)),
    ('filas source_file_storage_operations (por recurso)', case when to_regclass('public.source_file_storage_operations') is null then 0 else (select count(*) from public.source_file_storage_operations o join public.source_file_storage_resources r on r.id = o.resource_id where r.institution_id = (select id from purge_target)) end),
    ('archivos en Storage (borrar antes desde el Dashboard)', (select count(*) from storage.objects o where o.bucket_id = '${SOURCE_FILES_BUCKET}' and o.name like (select id::text from purge_target) || '/%'));
end $$;
`;
}

export function buildPurgeSql({ institution, ejecutar }) {
  const header = `-- I3: ${ejecutar ? 'BORRADO' : 'SIMULACION (no borra nada)'} de la institucion de prueba ${sqlText(institution)}.
-- Generado por scripts/buildPurgeInstitutionSql.mjs. Pegar TODO en el SQL Editor y apretar Run.
`;
  if (!ejecutar) {
    return `${header}begin;
${targetSql(institution)}
select item, cantidad from purge_report
union all select 'institucion: ' || (select name from purge_target) || ' (' || (select id::text from purge_target) || ')', 1
order by item;
rollback;
`;
  }
  return `${header}-- Una sola transaccion: si algo falla no se borra nada.
begin;
${targetSql(institution)}
do $$
declare
  target uuid := (select id from purge_target);
  pending text[];
  tbl text;
  remaining boolean;
  attempts integer := 0;
begin
  if (select cantidad from purge_report where item like 'archivos en Storage%') > 0 then
    raise exception 'PURGE_STORAGE_FILES_PENDING: quedan archivos en Storage (bucket ${SOURCE_FILES_BUCKET}, carpeta %). Borrarlos desde el Dashboard y volver a correr.', target;
  end if;

  -- Las operaciones del gateway de Storage no tienen institution_id: se borran por su recurso.
  if to_regclass('public.source_file_storage_operations') is not null then
    delete from public.source_file_storage_operations o
    using public.source_file_storage_resources r
    where r.id = o.resource_id and r.institution_id = target;
  end if;

  -- Hijos antes que padres: pasadas completas hasta que no quede ninguna fila. Una tabla bloqueada por FK
  -- se reintenta en la pasada siguiente; y como algun trigger (revisiones del gateway) puede volver a escribir
  -- al borrar otra tabla, se termina recien cuando todas quedan en cero.
  loop
    attempts := attempts + 1;
    if attempts > 50 then
      raise exception 'PURGE_FK_BLOCKED: no se pudo vaciar %', pending;
    end if;
    pending := array[]::text[];
    for tbl in select table_name from purge_tables order by table_name loop
      begin
        execute format('delete from public.%I where institution_id = $1', tbl) using target;
      exception when foreign_key_violation then
        null;
      end;
      execute format('select exists (select 1 from public.%I where institution_id = $1)', tbl) into remaining using target;
      if remaining then pending := array_append(pending, tbl); end if;
    end loop;
    exit when coalesce(array_length(pending, 1), 0) = 0;
  end loop;

  delete from public.institutions where id = target;
  delete from auth.users where id in (select id from purge_users_exclusive);
end $$;

-- Verificacion antes de confirmar: no queda ninguna fila de la institucion.
do $$
declare tbl text; n bigint;
begin
  for tbl in select table_name from purge_tables loop
    execute format('select count(*) from public.%I where institution_id = $1', tbl) into n using (select id from purge_target);
    if n <> 0 then raise exception 'PURGE_VERIFY_FAILED: quedan % filas en %', n, tbl; end if;
  end loop;
  if exists (select 1 from public.institutions where id = (select id from purge_target)) then
    raise exception 'PURGE_VERIFY_FAILED: la institucion sigue existiendo';
  end if;
end $$;
commit;

select item, cantidad from purge_report
union all select 'BORRADA: ' || (select name from purge_target) || ' (' || (select id::text from purge_target) || ')', 1
order by item;
`;
}

export function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  writeFileSync(resolve(options.salida), buildPurgeSql({ institution: options.institucion, ejecutar: options.ejecutar }), 'utf8');
  console.log(JSON.stringify({ institucion: options.institucion, modo: options.ejecutar ? 'BORRADO' : 'SIMULACION', salida: options.salida }, null, 2));
  return options;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { main(); } catch (error) { console.error(`ERROR: ${error.message}`); process.exitCode = 1; }
}
