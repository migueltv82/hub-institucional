# I2d — Accesos: no pisar contraseñas y cambio obligatorio de la contraseña inicial (local)

Fecha: 2026-10-19. Ejecutó: Claude. Entorno: stack local descartable con GoTrue v2.196.0 y Edge Runtime `supabase/edge-runtime:v1.77.4` sobre el bundle real de `admin-users`. Staging y Producción: **NONE**.

## Qué cambió (`supabase/functions/admin-users/index.ts`)

- **Bug corregido: re-crear accesos docentes pisaba la contraseña.** Antes, volver a correr "Crear accesos" sobre un docente existente le reseteaba la contraseña al DNI. Ahora solo actualiza nombre, rol y DNI en la metadata.
- **Bug corregido: re-crear accesos docentes desbloqueaba.** El upsert del perfil forzaba `is_blocked: false`. Ahora el desbloqueo inicial vale solo para un alta nueva.
- **Alta con DNI:** el alta de alumnos y docentes marca `app_metadata.must_change_password = true`. El usuario no puede editar `app_metadata`: GoTrue responde 403, ver `IDENTITY_AUTH_LOCAL_RESULT.md`.
- **Acción nueva `complete_initial_password_change`**, abierta a cualquier usuario autenticado y no bloqueado:
  - exige la contraseña actual;
  - la nueva tiene que tener 8 caracteres o más, ser distinta de la actual y no contener el DNI;
  - cambia la contraseña y limpia la marca en una sola llamada de Auth Admin;
  - la auditoría guarda los campos de contraseña como `[redacted]`.
- **Frontend:**
  - `AuthContext` expone `mustChangePassword`, leído solo de `app_metadata`.
  - `App` muestra `ForcePasswordChangePage` en lugar de todas las rutas mientras la marca esté activa.
  - El servicio `initialPasswordChange.js`, después de cambiar la contraseña, vuelve a entrar con la nueva, porque Auth revoca la sesión vieja.

## Resultado

`node scripts/validateInitialPasswordLocal.mjs` → **PASS**, run `0b0c7c4b9b4bba02`, cleanup 0.

| Caso | Resultado |
|---|---|
| Alta de docente y de alumno | Marca en `true`, visible en la sesión y en el JWT; se entra con el DNI |
| Llamada anónima | 401 |
| Contraseña actual incorrecta | 401; sin cambios |
| Nueva igual a la actual | 400; sin cambios |
| Nueva de menos de 8 caracteres | 400; sin cambios |
| Nueva que contiene el DNI | 400; sin cambios |
| Cambio válido | 200 y marca en `false`. El DNI deja de funcionar y la nueva funciona. El refresh token de la sesión con DNI queda revocado (`refresh_token_not_found`). El JWT nuevo trae la marca en `false` |
| Re-crear accesos del mismo docente, ya bloqueado | `updated`. Sigue bloqueado, conserva su contraseña (el DNI no vuelve) y la marca no se reactiva |
| Usuario bloqueado intenta la acción | 403 |
| Auditoría | El cambio queda registrado; ni la contraseña nueva ni el DNI aparecen en sus filas |

**El harness detecta los bugs.** Con el código anterior, una corrida por cada fix revertido falló justo en ese punto: "Re-provisioning overwrote the password" y "Re-provisioning unblocked the teacher".

Regresiones: `validateSuperAdminEdgeLocal` y `validateIntegratedAcceptanceLocal` PASS. `npm run check` PASS (2674).

## Pendiente

- **Redeploy de `admin-users` en Producción:** lo hace Miguel. Frontend y Edge se pueden desplegar en cualquier orden: la marca solo existe en cuentas creadas por la Edge nueva, y el frontend viejo la ignora.
- **Auditoría independiente COMPLETA:** toca la Edge.
- **Riesgo residual:** la marca la hace cumplir la interfaz, no RLS (ver `docs/SECURITY.md`, riesgos residuales). Las cuentas creadas antes de I2d no tienen la marca.
