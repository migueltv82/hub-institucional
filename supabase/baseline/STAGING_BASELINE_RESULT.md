# Staging baseline — aplicación y verificación básica

Fecha: 2026-10-04. Target confirmado mediante API de proyectos: `Hub-Institucional-Staging`, ref `lzjpycejdjpzkdyzaeco`, ACTIVE_HEALTHY. Distinto de Production `Hub-Institucional` (`qwrw…mibx`). No se modificó el link local.

Precondición read-only comprobada ANTES de aplicar: tablas public = 0, auth.users = 0, storage.objects = 0, storage.buckets = 0. Sin copia de datos/usuarios/objetos productivos.

## Scripts aplicados

Se aplicó el contenido íntegro de cada archivo mediante apply_migration, en el siguiente orden. Todos devolvieron success=true:

1. `01_foundation.sql`
2. `02_academic_relational_schema.sql`
3. `03_workspace_data.sql`
4. `04_teacher_exam_date_exclusions.sql`
5. `05_workspace_operational_compat.sql`
6. `06_subject_teacher_assignments.sql`
7. `07_academic_operations.sql`
8. `08_exam_tables.sql`
9. `05_student_portal_secure_read.sql`

No repairs ni SQL ad hoc de instalación. El baseline genera sus objetos, grants/RLS, bucket/policies y configuración canónica. Auth estaba vacío: no se creó usuario bootstrap. No frontend/Edge deploy ni cambios de configuración Auth del Dashboard.

## Read-only verify

Comprobaciones obtenidas:

- 40 tablas public presentes, todas con RLS habilitado.
- 37 funciones canónicas presentes; RPC críticas con firma esperada.
- RPC privadas sin EXECUTE PUBLIC/anon; authenticated según contrato. Helpers internos/trigger y RPC service-only sin EXECUTE authenticated. APIs públicas de login/mantenimiento accesibles a anon según baseline.
- Trigger `on_auth_user_created` habilitado, función `handle_new_user` SECURITY DEFINER/search_path vacío, usa app_metadata para autoridad y no user_metadata.account_role.
- Bucket `workspace-source-files` privado; cuatro policies base SELECT/INSERT/UPDATE/DELETE para authenticated.
- Cuatro FKs compuestas presentes y validadas; tres índices UNIQUE tenant/workspace/UUID presentes y válidos.
- RPC examen incluye la revalidación local aprobada: row SHARE lock y clock_timestamp.
- Auth users = 0; Storage objects = 0 después de aplicar.

## Primer error SQL de verificación — histórico, resuelto por verificador

```text
ERROR: 42P01: relation "public.exam_engine_v" does not exist
```

La consulta read-only de conteos utilizó un nombre truncado por la extracción local del inventario (`[a-z_]+` omitió los dígitos de `exam_engine_v21_states`). No falló ningún archivo de instalación ni se demostró ausencia de la tabla canónica: la metadata previa sí mostró `exam_engine_v21_states`.

No se corrigió ni reintentó esta consulta. Dos consultas de metadata ya agrupadas en la misma llamada de herramientas completaron después del error; fueron exclusivamente READ ONLY. Al recibir el resultado se detuvo toda ejecución SQL posterior, sin reparación ni mutación adicional.

Pendiente: comprobación final de conteos de las 40 tablas public, separando la configuración de baseline de datos reales. No se declara PASS ni Security Acceptance. P0/P1 de schema/datos no confirmados; gate de verificación incompleto por error del verificador.

Staging mutations: nueve aplicaciones canónicas exitosas (schema, funciones, grants/RLS, bucket/policies y configuración inicial). Production mutations: NONE. Sin datos reales ni secretos expuestos en este informe.

Estado de la ejecución inicial: STAGING BASELINE — BLOQUEADO — error 42P01 en consulta read-only de conteos (verificador).

## Cierre READ-ONLY del verificador — 2026-10-04

Target reconfirmado por API: `Hub-Institucional-Staging`, ref `lzjpycejdjpzkdyzaeco`, ACTIVE_HEALTHY. En esta tarea no se consultó ni modificó Production; no se reaplicó baseline.

Nombre real identificado desde `03_workspace_data.sql:16` y catálogo remoto: `public.exam_engine_v21_states`. Se agregó el verificador reproducible `staging_baseline_verifier.mjs`: extrae identificadores con `[a-z_][a-z0-9_]*`, valida nombres y genera exclusivamente SELECT de conteos dentro de BEGIN READ ONLY/COMMIT. No conecta ni ejecuta SQL por sí mismo. Comando local para obtener la consulta: `node supabase/baseline/staging_baseline_verifier.mjs`.

La consulta generada fue ejecutada solamente en Staging. Resultado final:

- 40/40 tablas canónicas presentes y con RLS habilitado.
- 39 tablas con 0 filas; `app_settings` con 1 fila, únicamente `maintenance_mode` público y disabled según configuración canónica. Ninguna fila de usuarios, instituciones, padrones, actividad académica, snapshots, auditoría o archivos.
- `auth.users` = 0 y `storage.objects` = 0.
- 37/37 funciones canónicas presentes; ninguna faltante. RPC críticas/grants revisados de nuevo: EXECUTE PUBLIC revocado en las SECURITY DEFINER; anon solo en las dos APIs públicas; authenticated según contrato, excluyendo helpers internos, trigger y funciones service-only.
- Trigger `on_auth_user_created` habilitado, `handle_new_user` endurecido con search_path vacío, autoridad app_metadata y sin EXECUTE anon/authenticated.
- Un bucket `workspace-source-files`, privado, y las cuatro policies authenticated de SELECT/INSERT/UPDATE/DELETE.
- 4/4 FKs compuestas presentes/validadas, con tenant/workspace/UUID y SET NULL limitado al vínculo; 3/3 índices UNIQUE válidos sobre tenant/workspace/UUID.
- No se detectaron objetos esperados faltantes ni datos reales. Verificación de existencia/metadata básica, no sustituto de Security Acceptance funcional.

Pruebas locales: test de regresión del nombre, SQL read-only e identificadores inválidos, 3/3 PASS; ESLint focal PASS; diff de archivos tocados sin errores de whitespace, avisos LF/CRLF únicamente. CHIEF CODE AUDITOR independiente: PASS del código/tests, sin P0/P1/P2/P3; no simuló segunda ejecución remota independiente.

Archivos de esta corrección: verificador, test focal `stagingBaselineVerifier.test.js` e informe. No schema, DDL/DML, seeds/repairs, migration, Edge/frontend deploy ni cambios de grants/RLS. No suite global/build por alcance exclusivamente del verificador.

Remote mutations de esta tarea: NONE. Staging mutations de esta tarea: NONE. Production mutations: NONE.

STAGING BASELINE VERIFY — PASS — LISTO PARA SECURITY ACCEPTANCE
