import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

// Generador sin conexion: comprobar nombre/ref por get_project antes de ejecutar.
// No crea funciones/tablas, no modifica grants, no usa Storage ni credenciales.
export function compileFullMatrix(source) {
  const stack = [];
  const lines = [];
  for (const line of source.split(/\r?\n/)) {
    if (line.startsWith('\\if ')) {
      if (!/^\\if :\{\?(attendance|grade|notices|roster)_tenant_focal\}$/.test(line)) {
        throw new Error('Condicional desconocido');
      }
      stack.push(false);
    } else if (line === '\\else') {
      if (!stack.length) throw new Error('else sin if');
      stack[stack.length - 1] = !stack.at(-1);
    } else if (line === '\\endif') {
      if (!stack.length) throw new Error('endif sin if');
      stack.pop();
    } else if (stack.every(Boolean)) {
      lines.push(line);
    }
  }
  if (stack.length) throw new Error('Condicional sin cerrar');
  return lines.join('\n');
}

export function checkpoint(name) {
  if (!/^[a-zA-Z0-9_]+$/.test(name)) throw new Error('Checkpoint invalido');
  return `do $acceptance$ begin
    perform set_config('acceptance.cases',
      (coalesce(nullif(current_setting('acceptance.cases', true), ''), '[]')::jsonb
       || jsonb_build_array('${name}'))::text, true);
  end $acceptance$;`;
}

function omitSavepoint(sql, name) {
  const pattern = new RegExp(`savepoint ${name};[\\s\\S]*?rollback to savepoint ${name};`, 'g');
  if (!pattern.test(sql)) throw new Error(`Savepoint esperado ausente: ${name}`);
  return sql.replace(pattern, `-- Omitido en Staging: ${name}.`);
}

export function buildStagingSecurityQuery(source, authNegative) {
  let sql = compileFullMatrix(source);
  for (const name of ['legacy_invalid_record', 'historical_invalid_leave', 'historical_invalid_replacement', 'public_contract_filtering']) {
    sql = omitSavepoint(sql, name);
  }
  for (const name of ['focal_legacy_invalid_record_hidden', 'notices_historical_foreign_records_fail_closed', 'public_login_suspended_and_private_setting_hidden']) {
    sql = sql.replace(`\\echo PASS ${name}`, `-- NO EJECUTADO en Staging: ${name}`);
  }
  sql = sql.replace(/^\\echo PASS ([a-zA-Z0-9_]+)$/gm, (_, name) => checkpoint(name));
  sql = sql.replace(/^begin;$/m, () => `begin;
set local statement_timeout = '60s';
do $$ begin
  if exists (select 1 from auth.users) or exists (select 1 from public.institutions)
  then raise exception 'HARNESS_TARGET_NOT_EMPTY'; end if;
end $$;
${authNegative}
${checkpoint('handle_new_user_untrusted_metadata_denied')}`);
  // El resultado se devuelve antes del rollback. Cleanup se verifica en otra llamada.
  sql = sql.replace(/^rollback;\s*$/m, `reset role;
select current_setting('acceptance.cases')::jsonb as passed_cases;
rollback;`);
  if (/^\s*(?:alter|create|drop|grant|revoke|truncate|commit)\b/im.test(sql)
    || /^\\/m.test(sql) || /\bstorage\s*\./i.test(sql)
    || !/rollback;\s*$/.test(sql)) throw new Error('SQL fuera del alcance permitido');
  return sql;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const source = readFileSync(new URL('./local_ab_rls_rpc_validation.sql', import.meta.url), 'utf8');
  const authNegative = readFileSync(new URL('./staging_security_1_auth_negative.sql.inc', import.meta.url), 'utf8');
  process.stdout.write(buildStagingSecurityQuery(source, authNegative));
}
