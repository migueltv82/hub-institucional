# Identidad: altas reales en Auth con metadata manipulada

Fecha: 2026-10-16. Tarjeta: https://trello.com/c/CoWY3nWx (épica 03 — Datos e identidad). Ensayo 2e1054471a740485: PASS. Evidencia en [IDENTITY_AUTH_LOCAL_EVIDENCE.json](./IDENTITY_AUTH_LOCAL_EVIDENCE.json).

## Por qué

El gate de release exige `handle_new_user` endurecido y validado. Hasta ahora estaba validado solo por SQL (Staging security 1, "sin Auth HTTP/E2E"). [SECURITY.md](../../docs/SECURITY.md) pedía probar altas reales con metadata manipulada.

## Cómo

`node scripts/validateIdentityAuthLocal.mjs`: base descartable con el baseline canónico (9 SQL) y GoTrue v2.196.0 real, con **signup público abierto y autoconfirmado solo en este ensayo**, como peor caso de configuración. `supabase/config.toml` lo mantiene deshabilitado, y el contrato compartido de recuperación no acepta esos overrides (lo cubre un test). Las altas pasan por la API HTTP de GoTrue, nunca por inserts en `auth.users`.

## Resultado

| Caso | Perfil resultante |
| --- | --- |
| Signup con `account_role: superadmin`, `is_global_admin: true` en user_metadata | `alumno`, sin admin global, 0 membresías |
| Signup con `account_role: admin_instituto` | `alumno`, 0 membresías |
| Admin API con solo user_metadata manipulada | `alumno`, 0 membresías |
| Admin API con app_metadata `docente` | `alumno` (ver nota) |
| Admin API con app_metadata `superadmin` + `is_global_admin` | `alumno` (ver nota) |

- `display_name` sí toma el nombre de user_metadata (dato de presentación permitido).
- Usuario autenticado: `PUT /user` sobre su user_metadata → 200 sin ningún efecto en `profiles`; sobre su app_metadata → **403**. `raw_app_meta_data` intacto y el token nuevo no trae rol en app_metadata.
- EXECUTE de `public.handle_new_user()`: denegado para public, anon y authenticated. Trigger `on_auth_user_created` presente y habilitado.
- Censo final: 0 perfiles privilegiados, 0 membresías.
- Cleanup: 0 bases y 0 contenedores.

**Nota sobre el camino legítimo.** En GoTrue 2.196.0 el `app_metadata` enviado al crear un usuario no es visible para el trigger en el INSERT, así que el trigger deja el perfil mínimo. No es un riesgo: `admin-users` crea el usuario por Admin API y después escribe `profiles` explícitamente (`upsertProfile`), como establece SECURITY.md. La rama de `raw_app_meta_data` del trigger queda como defensa adicional, no como el mecanismo de asignación de roles.

## Límites

Local y sintético. No aplica nada en Staging ni Production: el gate exige además desplegar y validar el trigger endurecido en Staging, con aprobación humana. No cubre altas por OAuth/SSO ni magic link. El escalamiento por Data API (editar `profiles`/`memberships` con tokens reales) es la siguiente unidad, 03.2. Sin auditor independiente.

Typecheck: NO DISPONIBLE (JS). Lint: PASS. Tests: PASS. Auth HTTP real: PASS local. Database: PASS local.
