# Runbook — Deploy de Producción v1 y rollback

Tarjeta: [CLAUDE] 07.2 (https://trello.com/c/bCd1q27s). Fecha de redacción: 2026-10-16. Fecha objetivo del deploy: 2026-10-21.

Este documento **no autoriza** el deploy. Se ejecuta solo si la matriz Go/No-Go está verde y Miguel dio el GO por escrito en la tarjeta [HUMANO]. Si algún paso falla y no está previsto acá: detenerse, no improvisar, aplicar la sección de rollback que corresponda y registrar.

Convenciones:

- `PROD_REF` y `STG_REF` son variables de la sesión del operador. No se escriben en el repo, en Trello ni en la evidencia: se muestran como `abcd…wxyz`.
- Toda evidencia se guarda sin secretos, sin tokens y sin datos personales.
- "Operador" es quien ejecuta en su máquina; "Verificador" es otra persona o agente que confirma con lectura, sin escribir.

## 0. Roles

| Rol | Quién | Hace | No hace |
| --- | --- | --- | --- |
| Aprobador | Miguel ([HUMANO]) | GO/NO-GO, aprueba cada paso remoto, carga secretos, decide rollback | — |
| Operador | Miguel, o Codex con aprobación explícita en el chat para cada paso remoto | Ejecuta backup, SQL, deploy de Edge y frontend, smoke | Cargar secretos por Codex/Claude; saltear un paso |
| Verificador | Claude (auditoría) | Lee evidencia y salidas; confirma PASS/FAIL de cada paso; redacta el cierre | Ejecutar escrituras remotas |

Ventana sugerida: horario de baja actividad institucional, con al menos 3 horas de margen. Canal de comunicación único durante la ventana: la tarjeta del deploy en Trello.

## 1. Precondiciones (día anterior, todas obligatorias)

| # | Precondición | Evidencia esperada | Dueño |
| --- | --- | --- | --- |
| P1 | Matriz Go/No-Go verde salvo el propio deploy | Tarjeta "[CLAUDE] 09.0 · Matriz Go/No-Go" | Claude |
| P2 | Commit candidato fijado: un hash de `release/v1` con CI remoto verde (job `Quality gate (Node 22.13)`) | Link al run de CI.1 | Codex |
| P3 | `npm run quality:full` PASS sobre ese hash; EX-001 cerrada o renovada por Miguel | Comentario de cierre EX-001 | Codex / Miguel |
| P4 | Staging corre exactamente ese hash: STG0 (drift) sin diferencias, o STG1 aplicada y re-verificada | `STAGING_DRIFT_RESULT.md` | Codex |
| P5 | Staging security 2 PASS (GoTrue HTTP + Edge con tokens reales) | `STAGING_SECURITY_*` | Codex |
| P6 | UAT de 4 roles en Staging firmado por Miguel | Comentario en [HUMANO] | Miguel |
| P7 | **PROD0: drift read-only de Producción** contra el candidato. Sin esto no se sabe qué SQL hay que aplicar | `PRODUCTION_DRIFT_RESULT.md` | Codex (con aprobación) |
| P8 | Saber si Producción tiene datos reales (Auth, `public`, Storage) y cuántos. Define la severidad del rollback | Conteos read-only de PROD0 | Codex / Miguel |
| P9 | Config externa de Producción cargada y verificada (sección 7) | Checklist sección 7 completo | Miguel |
| P10 | Plan de Supabase de Producción con **backups diarios o PITR activos** y la hora del último backup visible. Es **obligatorio**: RB.1 demostró que el archive propio no se puede restaurar completo como `postgres` (ver §9) | Captura del dashboard sin datos | Miguel |
| P11 | Branch protection de `main` activa con el check requerido | Captura de Settings → Branches | Miguel |
| P12 | PR `release/v1` → `main` aprobado y mergeado; el hash de `main` coincide con el candidato | Link al PR | Miguel |

Contexto que hace obligatorio P7: el último discovery de Producción (2026-09-25, `docs/SUPABASE_DRIFT_AUDIT.md`) encontró la vulnerabilidad P1 de `handle_new_user` activa y 12 RPC ausentes. Staging recibió el baseline después; Producción no. No hay evidencia posterior del estado de Producción.

## 2. T-30 min — Congelamiento y verificación del destino

1. Avisar a la institución que hay una ventana de mantenimiento. No crear usuarios, no cargar notas, no publicar mesas durante la ventana.
2. En el dashboard de Supabase, abrir el proyecto **Hub-Institucional** (Producción) y confirmar en Project Settings que el ref coincide con `PROD_REF`. Confirmar que `PROD_REF ≠ STG_REF`.
3. Consulta inocua en el SQL Editor de Producción:

   ```sql
   select current_database(), current_user, now();
   ```

4. Registrar en la tarjeta: hora, ref enmascarado, hash candidato, versión actual del frontend en Vercel (deployment id) y versión actual de cada Edge Function (fecha y versión que muestra el dashboard). **Esa es la versión de retorno para el rollback.**

## 3. T-0 — Backup previo (obligatorio, aunque el plan tenga backups automáticos)

El método es el mismo que se ensayó localmente en tq01D3Bz (rollback DB + bytes) y to6OoXZC (recuperación integrada DB + Auth + Storage): archive custom de PostgreSQL más los bytes de Storage, y restore sobre una base **vacía**. El método `pg_restore --clean` sobre una base existente falló en el ensayo y está retirado: no usarlo.

1. **Base de datos** (desde la máquina del operador, con la cadena de conexión de Producción cargada en una variable de sesión, nunca en un archivo del repo):

   ```powershell
   pg_dump --format=custom --no-owner --no-privileges `
     --schema=public --schema=auth --schema=storage `
     --file "$env:BACKUP_DIR\prod_pre_v1_$(Get-Date -Format yyyyMMdd_HHmm).dump" `
     $env:PROD_DB_URL
   pg_restore --list "<archivo>.dump" | Measure-Object -Line   # el archive se lee y no está vacío
   ```

   `BACKUP_DIR` está fuera del repo y fuera de carpetas sincronizadas públicas. El archive contiene datos personales: tratarlo como dato sensible.

2. **Storage**: listar el bucket `workspace-source-files` y descargar todos los objetos al mismo `BACKUP_DIR`. Registrar cantidad de objetos, bytes totales y SHA256 por archivo.
3. **Snapshot de catálogo** (read-only, sirve para comparar después):

   ```sql
   begin; set transaction read only;
   select n.nspname, p.proname, md5(pg_get_functiondef(p.oid)) as body_md5, p.prosecdef
   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' order by 1, 2;
   select schemaname, tablename, policyname from pg_policies order by 1, 2, 3;
   rollback;
   ```

4. Si P10 indica backups diarios o PITR, anotar además la hora del último backup automático. **Es complemento, no reemplazo** del archive propio.
5. Criterio para seguir: archive legible, conteo de objetos Storage igual al listado y SHA256 registrados. Si falla: **NO-GO, fin de la ventana**.

## 4. Aplicación de SQL

Fuente de verdad: `supabase/schema/` del hash candidato. Los archivos son autocontenidos e idempotentes y se aplican enteros (ver `supabase/schema/00_README.md`). El orden canónico, igual al aplicado en Staging (`supabase/baseline/STAGING_BASELINE_RESULT.md`), es:

```
01_foundation.sql
02_academic_relational_schema.sql
03_workspace_data.sql
04_teacher_exam_date_exclusions.sql
05_workspace_operational_compat.sql
06_subject_teacher_assignments.sql
07_academic_operations.sql
08_exam_tables.sql
05_student_portal_secure_read.sql   ← va al final: depende de 07 y 08
```

Después del baseline: **`supabase/security/source_file_storage_gateway.sql`**, el enforcement del gateway de Storage. En Staging se aplicó el 05/10 como migration `storage_source_file_gateway_enforcement` (ver `supabase/baseline/STAGING_SECURITY_2_RESULT.md`), y el código de release/v1 (Edge `source-file-storage`) depende de sus RPC. El script **no es idempotente** (`create table` sin `if not exists`): aplicarlo una sola vez, solo si PROD0 muestra que falta (`source_file_storage_*` ausentes). Si ya está, no reaplicarlo.

Reglas:

1. Aplicar **solo** los archivos que PROD0 marcó con drift, en ese orden relativo. Si PROD0 marcó todos, aplicar los nueve.
2. Un archivo por vez en el SQL Editor. Después de cada uno, guardar la salida y verificar que no hubo error. `Success. No rows returned` es la salida normal de un DDL: **no es** la verificación.
3. Antes de `01_foundation.sql`: el bloque final de seed del primer superadmin requiere que el usuario exista en Authentication → Users con el email de `target_email`. Si ya existe un superadmin en Producción, revisar el bloque con el Verificador antes de correrlo.
4. Nunca ejecutar en Producción scripts de `supabase/security/2026-09-05_*`, `supabase/docs/repair_*`, ni el rollback histórico de `examenes`. No pertenecen al baseline (`supabase/baseline/BASELINE_MANIFEST.md`).
5. Si un archivo falla a mitad: **detenerse**. No reintentar con cambios manuales. Ir a la sección 9.

Verificación post-SQL (read-only):

```sql
begin; set transaction read only;
-- handle_new_user endurecido: el rol sale de raw_app_meta_data, nunca de raw_user_meta_data
select pg_get_functiondef('public.handle_new_user()'::regprocedure) !~ 'raw_user_meta_data\s*->>\s*''(account_role|is_global_admin)'''
   as handle_new_user_ok;
-- RPC de inscripción a mesas presente con una sola firma
select count(*) as firmas from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'upsert_exam_enrollment_from_portal';
-- RLS habilitado en todas las tablas public
select count(*) filter (where not c.relrowsecurity) as tablas_sin_rls, count(*) as tablas
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r';
rollback;
```

Esperado: `handle_new_user_ok = true`, `firmas = 1`, `tablas_sin_rls = 0`. Las pruebas negativas de RLS con usuarios y tenants sintéticos **no** se corren en Producción: ya se acreditaron en local (03.2) y en Staging (P5). En Producción alcanza con estas verificaciones de catálogo más el smoke de la sección 8. Si cualquier verificación falla: sección 9.

### 4.1 Modo de transición académica: dual_write (decisión de Miguel, 17/10)

Con el modo por defecto (`snapshot_only`), la inscripción a mesa del portal se guarda solo en `workspace_snapshots` y la RPC autoritativa `upsert_exam_enrollment_from_portal` no se ejecuta. v1 sale en `dual_write`: escribe también en las tablas relacionales a través de la RPC y sigue leyendo del snapshot.

Es una **escritura de datos**: pedir OK puntual a Miguel en el momento. Antes, leer el valor actual (lo informa PROD0):

```sql
select value from public.app_settings where key = 'academic_relational_transition';
```

Aplicar:

```sql
insert into public.app_settings (key, value, is_public)
values ('academic_relational_transition',
        '{"stage":"dual_write","write_mode":"dual_write","read_mode":"snapshot_only","dual_write_enabled":true}'::jsonb,
        false)
on conflict (key) do update set value = excluded.value, updated_at = timezone('utc', now());
select value->>'write_mode' as write_mode from public.app_settings where key = 'academic_relational_transition';  -- debe dar dual_write
-- (get_academic_transition_config() exige sesión de usuario: en el SQL Editor responde AUTH_REQUIRED, y es lo correcto)
```

Rollback (R3): reponer el `value` leído antes, o borrar la fila para volver al default `snapshot_only`. El modo queda acreditado por QA.1, que ensaya los dos modos.

## 5. Deploy de Edge Functions

Desde el hash candidato, con la CLI autenticada y **apuntando explícitamente** a `PROD_REF`:

```powershell
supabase functions deploy admin-users --project-ref $env:PROD_REF --no-verify-jwt
supabase functions deploy source-file-storage --project-ref $env:PROD_REF --no-verify-jwt
```

- `admin-users` y `source-file-storage` van con `--no-verify-jwt`: las dos validan el Bearer internamente (`handler.js` usa `auth.getUser()`) y la verificación de la plataforma rompe el preflight CORS. Staging ya las tiene así (STG0). `config.toml` solo declara `admin-users`; ver tarjeta SEC.1.
- Los secrets (sección 7) tienen que estar cargados **antes** del deploy.

Verificación:

1. `GET https://<PROD_REF>.supabase.co/functions/v1/admin-users` → **405** (publicada). 404 = no publicada.
2. `OPTIONS` con `Origin` del dominio productivo → 200 con `Access-Control-Allow-Origin` igual a ese dominio.
3. `OPTIONS` con `Origin: https://ejemplo.invalid` → sin ese origin en la respuesta.
4. `POST` sin `Authorization` → 401.

## 6. Deploy del frontend (Vercel)

1. Confirmar en Vercel → Project → Settings → Environment Variables (Production) que existen **solo** las tres variables aprobadas: `VITE_SUPABASE_URL` (del proyecto de Producción), `VITE_SUPABASE_PUBLISHABLE_KEY` (clave publicable del mismo proyecto) y `VITE_DISABLE_AUTH=false`. Ninguna variable con `SERVICE_ROLE` o `SECRET` en el nombre.
2. Promover el deployment del commit candidato de `main` a Production. El build corre `audit:prod`; si falla, no promover.
3. Anotar el deployment id nuevo junto al anterior (registrado en el paso 2.4).
4. Los env guards (`src/lib/envGuards.js`) cortan el arranque si la configuración es inválida. Una pantalla de error de configuración es un FAIL del deploy, no algo a esquivar.

## 7. Checklist de configuración externa (por nombre, nunca valores)

La carga la hace Miguel en el dashboard correspondiente. La verificación se hace sin leer el secreto: se mira que el nombre exista y se prueba el comportamiento.

| Componente | Nombre / ajuste | Dónde | Cómo verificar sin leerlo |
| --- | --- | --- | --- |
| Edge `admin-users` | `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Automáticos de Supabase Functions | La Edge responde 401/403 coherentes, no 500 |
| Edge `admin-users` | `ADMIN_USERS_ALLOWED_ORIGINS` = dominio productivo exacto, sin `*` ni localhost | Edge Functions → Secrets | Prueba CORS del paso 5.2 y 5.3 |
| Edge `source-file-storage` | `SOURCE_FILE_STORAGE_ALLOWED_ORIGINS` = dominio productivo exacto | Edge Functions → Secrets | Preflight desde el dominio productivo OK; desde un dominio ajeno, rechazado |
| Auth | Site URL = dominio productivo HTTPS | Auth → URL Configuration | Un email de reseteo apunta al dominio correcto |
| Auth | Redirect URLs: solo el dominio productivo; sin localhost ni comodines amplios | Auth → URL Configuration | Revisión visual de la lista |
| Auth | Signup público **deshabilitado**; anónimo deshabilitado | Auth → Providers / Sign In | `POST /auth/v1/signup` con anon key → rechazado |
| Auth | SMTP propio (host, puerto, usuario, remitente) | Auth → SMTP Settings | Enviar un reseteo de contraseña a una casilla de prueba de la institución |
| Auth | OAuth: solo si v1 lo usa. Si no, todos los providers externos apagados | Auth → Providers | Revisión visual |
| Storage | Bucket `workspace-source-files` existe y es **privado** | Storage | URL pública de un objeto → 400/404 |
| Vercel | Las 3 variables de la sección 6.1 | Vercel → Settings | Revisión de nombres; build con `audit:prod` OK |
| Vercel | Dominio productivo con HTTPS y headers de `vercel.json` (CSP) | Vercel → Domains | `curl -I` muestra `Content-Security-Policy` |
| GitHub | Branch protection de `main` con `Quality gate (Node 22.13)` requerido | Settings → Branches | Captura (ver `docs/BRANCH_PROTECTION.md`) |

Si la service role se expuso alguna vez (log, chat, captura): rotarla en Project Settings → API **antes** del deploy y volver a cargar los secrets de las Edge.

## 8. Smoke post-deploy (≤ 15 min)

1. Automático: `node scripts/smokeCheck.mjs --supabase-url https://<PROD_REF>.supabase.co --anon-key <clave publicable> --frontend-url https://<dominio>`. Es read-only, nunca usa service role y la rechaza si se la pasan. En Producción no usar `--skip`. Detalle en `supabase/security/SMOKE_CHECK_LOCAL_RESULT.md`.
2. Manual, por rol, con cuentas reales de la institución piloto. Sin altas masivas ni datos de prueba:
   - Super Admin: login, ver la institución, logout.
   - Admin: login, ver padrones, logout. No crear usuarios en el smoke salvo que Miguel lo pida.
   - Docente: login, Mis materias carga, ver alumnos.
   - Alumno: login, materias y estado académico cargan.
3. Revisar en Supabase → Logs (Auth, Edge, Postgres) que no haya errores 5xx nuevos en los 15 minutos posteriores.

Criterio: todos los checks PASS → **deploy cerrado**; avisar a la institución que terminó la ventana. Cualquier FAIL → sección 9.

## 9. Rollback

Decide Miguel. El Verificador propone el nivel según qué falló. Se revierte **del componente más externo al más interno** y solo lo necesario.

| Nivel | Cuándo | Acción | Pérdida de datos |
| --- | --- | --- | --- |
| R1 Frontend | Falla de UI o config Vercel, con DB y Edge sanas | Vercel → Deployments → promover el deployment anterior (registrado en 2.4) | Ninguna |
| R2 Edge | Falla de `admin-users` o `source-file-storage` | Redeploy de la versión anterior de la función, desde el commit anterior. Si no existía, borrar la función nueva | Ninguna |
| R3 SQL de funciones | Falla de una RPC sin cambio de tablas ni datos | Re-aplicar el archivo SQL correspondiente **del commit anterior** (son idempotentes). Revisar con el Verificador antes | Ninguna |
| R4 Restore completo | Daño de datos, migración a medias que cambió tablas, o fallo de seguridad (RLS) que no se corrige en minutos | Ver abajo | Todo lo escrito después del backup del paso 3 |

Procedimiento R4:

1. Poner la app en mantenimiento: R1 a un deployment estático de mantenimiento, o pausar el dominio.
2. Restaurar con el **restore gestionado de Supabase** (Database → Backups, o PITR al minuto previo al deploy). Es el único camino de restore completo (Auth + datos) acreditado como viable para v1; por eso P10 es obligatorio.
   - **El archive propio del §3 NO sirve para un restore completo.** RB.1 (`supabase/security/RUNBOOK_COMMANDS_LOCAL_RESULT.md`) lo ensayó como `postgres`, el rol que tiene el operador en un proyecto Supabase:
     · `pg_restore --single-transaction` aborta porque los schemas ya existen (`public`, `auth`);
     · `--data-only` aborta por el orden de las FK (`auth.identities` antes que `auth.users`);
     · `--disable-triggers` exige ser dueño de las tablas de `auth`.
     Además, el trigger `handle_new_user` recrearía los perfiles con rol `alumno`.
   - El archive sirve para dos cosas: verificar el restore gestionado (conteos y catálogo) y la reparación puntual de filas de `public` (**R4b**, abajo), con el Verificador y aprobación de Miguel.
   - Si el restore gestionado no está disponible: abrir un ticket a soporte de Supabase con el archive. No improvisar un restore manual sobre Producción.
3. Restaurar los bytes de Storage desde `BACKUP_DIR` y verificar los SHA256 contra los registrados en el paso 3.2.
4. Verificar: conteos de filas iguales a los del backup; logins de una cuenta por rol; catálogo (funciones y policies) igual al snapshot del paso 3.3.
5. Volver a R1 con el frontend anterior.

Procedimiento R4b — reparación puntual de filas de `public` desde el archive del §3.1 (ensayado en RB.2, `supabase/security/PUBLIC_REPAIR_LOCAL_RESULT.md`).

Cuándo usarlo: el daño está acotado a pocas tablas de `public` de una institución (filas borradas o pisadas) y no hace falta tocar Auth. Antes: mantenimiento (R4 paso 1) y escrituras congeladas.

1. En `BACKUP_DIR`, extraer del archive solo los datos de cada tabla dañada y apuntar el `COPY` a la tabla temporal:

   ```powershell
   foreach ($t in 'student_grades','subject_enrollments','profiles') {
     pg_restore --data-only --schema=public --table=$t --file "repair_$t.sql" "<archivo>.dump"
     (Get-Content "repair_$t.sql") -replace "^COPY public\.$t ", "COPY pg_temp.repair_$t " | Set-Content "repair_$t.sql"
   }
   ```

2. Copiar `supabase/security/public_repair_template.sql` a `BACKUP_DIR` y dejar solo las tablas dañadas. Para otra tabla, repetir el patrón con su clave primaria y su filtro de institución.
3. Correr el template como `postgres`, en una sola transacción:

   ```powershell
   psql -X -v inst=<institution_id> -f public_repair_template.sql $env:PROD_DB_URL
   ```

   El template:
   - carga el archive en tablas temporales (`on commit drop`);
   - hace `INSERT … ON CONFLICT (pk) DO UPDATE` solo de las filas de esa institución que difieren del archive;
   - no desactiva triggers, no toca `auth.*` y no pasa por `handle_new_user`.
4. Verificar con el Verificador:
   - conteos y contenido de las tablas reparadas;
   - las otras instituciones intactas;
   - logins de una cuenta por rol.

Límites de R4b:
- Filas creadas después del backup: no se borran.
- Las columnas que mantiene un trigger (`updated_at` de `student_grades` y `subject_enrollments`) quedan con la hora de la reparación.
- Si el upsert de una tabla con unique parcial choca con una fila nueva de la misma clave natural (por ejemplo, una nota recargada después del backup), la transacción aborta y no cambia nada: resolver a mano con el Verificador.
- `postgres` tiene `BYPASSRLS`: la reparación no pasa por RLS, por eso se filtra por institución en el propio SQL.
- No sirve para `auth.*` ni para los bytes de Storage.

Límites conocidos (de tq01D3Bz / to6OoXZC): los ensayos fueron con fixtures sintéticos chicos y snapshot congelado. No hay SLA medido para el volumen real; el restore local tardó ~25 s con datos mínimos. No se ensayó rollback con escritores concurrentes ni sobre Supabase gestionado. Por eso el paso 2.1 (congelar escrituras) es obligatorio.

## 10. Cierre

Comentario en la tarjeta del deploy con: hash, hora de inicio y fin, archivos SQL aplicados, versiones de Edge y frontend (nueva y anterior), resultado del smoke, incidentes, rollback si hubo, y PASS/FAIL. Entrada en `docs/WORKLOG.md`. Claude audita y recién entonces se mueve el hito "Go/No-Go Producción v1" a HECHO.

## Gaps detectados al escribir este runbook

| Gap | Tarjeta |
| --- | --- |
| No hay drift read-only de Producción posterior al 2026-09-25 (P7, P8) | [CODEX] PROD0 |
| `SOURCE_FILE_STORAGE_ALLOWED_ORIGINS` no está documentado en `docs/SECURITY.md` ni en el checklist de Staging | Incluido en PROD0 como verificación; doc a cargo de Codex |
| Plan de Supabase de Producción y existencia de backups automáticos/PITR sin confirmar (P10) | [HUMANO] |
| R4 sobre Supabase gestionado nunca ensayado; RB.1 descartó el restore manual del archive | Ensayar un restore gestionado en Staging, o aceptar el riesgo por escrito: decide [HUMANO] |
| Smoke automático | Resuelto: `scripts/smokeCheck.mjs` (07.1) |
