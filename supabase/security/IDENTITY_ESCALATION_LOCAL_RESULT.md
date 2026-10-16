# Identidad: escalamiento de privilegios vía Data API con tokens reales

Fecha: 2026-10-16. Tarjeta: https://trello.com/c/FwctiuJd (épica 03 — Datos e identidad). Ensayo dc2524d602355068: PASS. Evidencia en [IDENTITY_ESCALATION_LOCAL_EVIDENCE.json](./IDENTITY_ESCALATION_LOCAL_EVIDENCE.json). Continúa [IDENTITY_AUTH_LOCAL_RESULT.md](./IDENTITY_AUTH_LOCAL_RESULT.md).

## Cómo

`node scripts/validateIdentityEscalationLocal.mjs` corre la validación de altas de 03.1 y suma PostgREST v16.1 real (rol `authenticator`) sobre la misma base descartable con el baseline canónico. Usuarios creados por Admin API de GoTrue; perfiles y membresías escritos del lado servidor, como lo hace `admin-users`. Tokens obtenidos por login real.

Actores, en dos instituciones: alumno, docente y **owner institucional** del tenant 0, alumno del tenant 1 y un alumno **bloqueado** del tenant 0.

## Resultado

69 intentos, todos denegados: 36 con 403 y 33 con 200 sin filas afectadas. Antes y después se comparan completas las filas de `profiles`, `memberships`, `institutions`, el conteo de `admin_audit_logs` y el `app_metadata` de `auth.users`: **sin cambios**.

Cada actor intentó:

- subir su `account_role` a superadmin, activar `is_global_admin`, desbloquearse;
- subir su membresía a owner, insertarse como owner en su institución o como miembro en la ajena;
- insertar un perfil fantasma superadmin, borrar su perfil, renombrar la institución ajena;
- llamar las cuatro RPC `SECURITY DEFINER` que escriben perfiles o membresías (`update_membership_role`, `remove_user_membership`, `set_user_access_status`, `delete_institution_user`).

El owner institucional, además, intentó promover a un miembro, agregar a un usuario de otra institución, desbloquear a un miembro y cambiar el `account_role` de otro: todo denegado. Administrar personas es exclusivo del Super Admin o de `admin-users` del lado servidor.

Lecturas: el alumno ve solo su perfil y su membresía; el owner ve las 4 membresías de su institución y 0 de la ajena; el alumno ajeno ve 0 membresías y 0 instituciones del tenant 0.

**Control positivo:** un Super Admin real cambia un rol con `update_membership_role` (204), el cambio se aplica y queda 1 fila de auditoría. Las denegaciones no son vacías.

**Guardia de regresión:** un test recorre `supabase/schema` y exige que toda RPC `SECURITY DEFINER` que escriba `profiles` o `memberships` y esté concedida a `authenticated` figure en la lista que esta prueba ataca.

Cleanup: 0 bases y 0 contenedores. Regresión de 03.1 sin la fase de escalamiento: PASS.

## Límites

Local y sintético, sobre el baseline del repo: no prueba que Staging o Production tengan las mismas policies y grants (eso lo cubren las verificaciones de drift y Staging security). Cubre `profiles`, `memberships` e `institutions`; el aislamiento de las tablas académicas ya tiene su matriz A/B. Sin auditor independiente.

Typecheck: NO DISPONIBLE (JS). Lint: PASS. Tests: PASS. Data API real: PASS local. RLS: PASS para las tablas verificadas.
