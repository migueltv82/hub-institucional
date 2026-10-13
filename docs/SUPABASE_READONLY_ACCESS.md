# Acceso read-only a Supabase para auditoría

## Estado posterior del acceso y límites

El bloqueo CLI/403 descrito debajo es **HISTÓRICO / SUPERADO**: el [discovery 02.5](SUPABASE_DRIFT_AUDIT.md) registra recuperación de acceso al remoto original y consulta read-only exitosa. No acredita disponibilidad actual de credenciales/conectores ni permisos sobre cualquier otro proyecto. El procedimiento de desbloqueo se conserva para referencia y no debe repetirse automáticamente.

Staging existe y fue inicializado/verificado, según [baseline](../supabase/baseline/STAGING_BASELINE_RESULT.md); baseline local descartable PASS, 9 SQL aplicados y 40 tablas public con RLS. [Security 1](../supabase/baseline/STAGING_SECURITY_1_RESULT.md) acredita su alcance SQL; no supone cobertura integral ni convierte este procedimiento read-only en autorización de fixtures/mutaciones. Portal Docente v1 read-only certificado en Staging.

Production sigue **NO-GO**. Frontend sin deploy, Vercel READY técnico; candidato Git reproducible, proyecto/origin web Staging, CORS real, backup/restore, rollback, observabilidad, E2E/UAT y release closure pendientes. Branch protection remota no verificada/configurada. Toda ejecución futura requiere verificar destino y permisos; conservar todas las prohibiciones y reglas de sanitización siguientes.

Fecha: 2026-09-25. Alcance: remediación 02.5-R. Este documento define el acceso mínimo para ejecutar discovery de drift sin mutaciones.

## Objetivo

Habilitar una auditoría de Supabase que pueda leer catálogo y metadata de seguridad sin modificar el proyecto remoto:

- funciones y definiciones (`pg_proc`, `pg_get_functiondef`);
- grants/privilegios (`proacl`, `has_function_privilege`);
- triggers (`information_schema.triggers`, `pg_trigger`);
- RLS y policies (`pg_class`, `pg_policies`);
- Storage buckets y policies sin listar ni descargar archivos de usuarios;
- configuración Auth no sensible visible desde el dashboard.

## Estado local observado histórico — previo a la recuperación acreditada

- Supabase CLI instalado: `2.109.1`.
- La sesión CLI está autenticada: `projects list` y `orgs list` responden `exit=0`.
- El link local apunta a `qwrw…mibx` / `Hub-Institucional`.
- La sesión CLI actual lista dos proyectos accesibles: `EXAMENES` e `AutoEstetica Tucuman`.
- El proyecto vinculado `Hub-Institucional` no aparece entre los proyectos accesibles de la sesión actual.
- `supabase db query --linked` falla con `403` al inicializar el rol de login.
- El pooler configurado resuelve DNS y tiene puerto `5432` abierto, pero la connection string local no contiene password.

Conclusión operativa: hay sesión CLI válida, pero no hay acceso suficiente al proyecto vinculado y tampoco hay credencial Postgres completa para usar el pooler.

## Requisitos

Elegir una de estas vías, en orden de preferencia:

1. **PostgreSQL read-only directo**: usuario dedicado de auditoría con permiso de lectura de catálogo y metadata, sin DDL/DML.
2. **SQL Editor con rol Read-Only del dashboard**: ejecutar únicamente scripts `SELECT` desde una cuenta con rol read-only si el plan lo permite.
3. **CLI/API con permisos suficientes sobre el proyecto correcto**: usar una sesión Supabase CLI que pueda acceder al proyecto vinculado.
4. **Ejecución manual supervisada**: un Owner/Admin ejecuta el script read-only y comparte solo evidencia sanitizada.

No usar `service_role` de la aplicación como sustituto de acceso administrativo a PostgreSQL.

## CLI

Comandos seguros para diagnóstico:

```powershell
node_modules\.bin\supabase.cmd --version
node_modules\.bin\supabase.cmd projects list --output-format json
node_modules\.bin\supabase.cmd orgs list --output-format json
node_modules\.bin\supabase.cmd db query --linked "select current_database(), current_user;"
```

Reglas:

- Enmascarar project refs, organization IDs y cualquier URL sensible antes de copiar salidas a documentación.
- No ejecutar `db push`, `migration up`, `functions deploy`, `secrets set`, `link`, `reset`, `repair` ni comandos mutantes durante esta auditoría.
- Si el proyecto vinculado no aparece en `projects list`, no relinkear automáticamente: primero confirmar cuál proyecto es el esperado.

## PostgreSQL

Método preferido cuando exista una credencial read-only dedicada:

1. Confirmar que la connection string no es de `postgres`, `service_role` ni otro rol privilegiado.
2. Confirmar que el usuario tiene solo permisos de lectura necesarios.
3. Probar primero:

```sql
select current_database(), current_user;
```

4. Ejecutar después:

```text
supabase/security/remote_readonly_discovery.sql
```

Permisos mínimos sugeridos para un usuario dedicado:

- conexión a la base;
- lectura de `pg_catalog` e `information_schema`;
- lectura de definiciones de funciones, triggers, policies y privilegios;
- lectura de metadata de Storage necesaria para buckets/policies;
- sin permisos `INSERT`, `UPDATE`, `DELETE`, `TRUNCATE`, `CREATE`, `ALTER`, `DROP`, `GRANT`, `REVOKE`.

Si hace falta crear este usuario, esa creación es una tarea separada y mutante: requiere aprobación explícita, staging/backup según corresponda y no forma parte de 02.5-R.

## SQL Editor

Alternativa manual si no se quiere entregar connection string:

1. Abrir Supabase Dashboard.
2. Seleccionar el proyecto correcto.
3. Confirmar ambiente: development, staging o production.
4. Abrir SQL Editor.
5. Pegar `supabase/security/remote_readonly_discovery.sql`.
6. Revisar que el script contiene solo `SELECT`.
7. Ejecutar.
8. Exportar o copiar resultados.
9. Sanitizar antes de compartir:
   - no tokens;
   - no passwords;
   - no connection strings completas;
   - no emails, DNI, nombres de alumnos/docentes, notas ni asistencia;
   - project refs solo como `abcd…wxyz`.

Según la documentación de Supabase Access Control, el rol Read-Only del dashboard puede ejecutar consultas `SELECT` en SQL Editor usando un usuario read-only de base; si el plan no dispone de ese rol, usar una ejecución manual por Owner/Admin con el mismo script y con revisión humana.

## Procedimiento histórico de desbloqueo 02.5 — no repetir automáticamente

1. Abrir Supabase Dashboard con una cuenta Owner/Admin del proyecto esperado.
2. Ir a la organización donde debe vivir `Hub-Institucional`.
3. Verificar si existe un proyecto llamado `Hub-Institucional`.
4. Comparar el ref visible del dashboard con el ref local enmascarado `qwrw…mibx`.
5. Si coincide:
   - agregar la cuenta usada por Codex/CLI al proyecto u organización con el menor rol que permita lectura de DB/SQL;
   - preferir rol **Read-Only** si está disponible;
   - si no está disponible, ejecutar manualmente el script desde SQL Editor y compartir salida sanitizada.
6. Si no coincide:
   - no ejecutar `supabase link` todavía;
   - informar cuál es el proyecto correcto y autorizar explícitamente la corrección del link en una tarea separada.
7. Volver a ejecutar:

```powershell
node_modules\.bin\supabase.cmd projects list --output-format json
node_modules\.bin\supabase.cmd db query --linked "select current_database(), current_user;"
```

8. Si la consulta inocua pasa, repetir la etapa 02.5 con `remote_readonly_discovery.sql`.

## Prohibiciones

- `supabase db push`
- `supabase migration up`
- `supabase migration repair`
- `supabase db reset`
- `supabase functions deploy`
- `supabase secrets set`
- cualquier `INSERT`, `UPDATE`, `DELETE`, `ALTER`, `CREATE`, `DROP`, `GRANT`, `REVOKE`, `TRUNCATE`
- uso de service-role para saltar permisos
- creación de staging, clonación, restore o copia de datos en esta remediación

## Sanitización

Nunca copiar a logs, issues, commits, docs ni chat:

- passwords;
- personal access tokens;
- JWT;
- service-role;
- `sb_secret_*`;
- connection strings completas;
- emails, DNI, nombres de alumnos/docentes, notas, asistencia o datos personales;
- archivos de usuarios de Storage.

Permitido documentar:

- nombres lógicos de proyecto cuando no sean secretos;
- región;
- estado general del proyecto;
- project refs solo enmascarados (`abcd…wxyz`);
- mensajes de error sanitizados.

