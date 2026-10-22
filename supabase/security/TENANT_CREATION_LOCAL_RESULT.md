# I2f / I2g — Alta de institución + admin y asignación de usuarios (local)

Fecha: 2026-10-19. Ejecutó: Claude. Entorno: stack local descartable con GoTrue v2.196.0 y Edge Runtime `supabase/edge-runtime:v1.77.4` sobre el bundle real de `admin-users`. Staging y Producción: **NONE**.

## Qué estaba mal en `create_tenant_with_admin`

1. **Institución huérfana.** Insertaba la institución antes de crear el usuario Auth. Si algo fallaba después (contraseña corta, error de Auth, perfil o membresía), quedaba la institución sin admin y con el slug ocupado.
2. **Pisaba identidades existentes.** Si el email ya existía, `upsertProfile` le forzaba `account_role='admin_instituto'`, `is_global_admin=false` e `is_blocked=false`, y además le cambiaba la contraseña. Con el email de un Super Admin, lo degradaba; con el de un alumno, lo volvía admin; a un usuario bloqueado, lo desbloqueaba.

## Qué cambió (`supabase/functions/admin-users/index.ts`)

- **Antes de escribir nada**, busca el email y rechaza con 409 si pertenece a un Super Admin, a otro rol o a un admin bloqueado. Para un admin nuevo exige 8 caracteres o más.
- **Slug duplicado** → 409 con mensaje claro, sin crear usuario.
- **Admin existente** (`admin_instituto`, no bloqueado): conserva su contraseña, su rol y su estado; solo se le suma la institución como owner. La respuesta trae `admin_reused: true` y la app avisa que la contraseña ingresada no se usó.
- **Compensación:** si falla cualquier paso después de crear la institución, se borra la institución (las membresías caen en cascada) y, si el usuario Auth se creó en esta llamada, se borra también (el perfil cae en cascada). Un usuario que ya existía nunca se borra. Si la compensación misma falla, el error lo dice y nombra el slug a revisar.

## Resultado

`node scripts/validateTenantCreationLocal.mjs` → **PASS**, run `112564c3a7b201b4`, cleanup 0.

| Caso | Resultado |
|---|---|
| Institución nueva con admin nuevo | 200; perfil `admin_instituto`, membresía owner y login OK |
| Slug duplicado | 409; no se crea ningún usuario Auth |
| Contraseña corta para admin nuevo | 400; no queda institución |
| Email de Super Admin, de alumno o de admin bloqueado | 409; perfil, contraseña e instituciones sin cambios |
| Email de admin existente | 200, `admin_reused: true`; la contraseña vieja sigue andando y la ingresada no |
| Falla inducida al crear el usuario Auth (trigger en `auth.users`) | Error que dice "no quedo nada creado"; la institución no queda |
| Falla inducida en la membresía (trigger en `memberships`) | Lo mismo; tampoco quedan el usuario Auth nuevo ni su perfil |
| La misma falla con un admin existente | No queda la institución y el admin existente sigue intacto y puede entrar |
| Reintento con el mismo slug después del rollback | 200 (el slug quedó libre) |

**El harness detecta el bug.** Contra el handler anterior (al que solo se le agregaron el 409 por slug y el campo `admin_reused` para que la corrida llegue al caso), falla en "Short password left an institution": la institución quedó huérfana.

Regresiones: `validateSuperAdminEdgeLocal`, `validateInitialPasswordLocal` y `validateIntegratedAcceptanceLocal` PASS. `npm run check` PASS (2678).

## Pendiente

- **Redeploy de `admin-users`** en Producción: lo hace Miguel, junto con el de I2d.
- **Auditoría independiente COMPLETA:** toca la Edge.
- **I2g (resuelto, ver abajo):** el mismo patrón en `create_or_assign_institution_user`.

## I2g — "Asignar usuario a institución" (`create_or_assign_institution_user`)

Tenía los mismos dos problemas que el alta de institución:
- con un email existente, degradaba, promovía o desbloqueaba la identidad y le cambiaba la contraseña;
- si la asignación fallaba (rol inválido, lista vacía o institución inexistente) después de crear el usuario Auth, ese usuario quedaba huérfano.

**Cambio:** los dos handlers comparten ahora `findReusableInstitutionAdmin`, `createInstitutionAdminUser` y `markReusedInstitutionAdmin`.
- Antes de crear el usuario se validan el rol, que la lista de instituciones no esté vacía, que existan todas y la identidad.
- Si la membresía falla, se borra el usuario creado en esa llamada, y su perfil y membresías caen en cascada.
- La respuesta trae `user_reused`, y la app avisa que conserva su contraseña.
- `createOrReuseAuthUser` se retiró.

Resultado: mismo harness, **PASS**, run `a90ea76aa8aec64d`, cleanup 0.

| Caso | Resultado |
|---|---|
| Admin nuevo asignado | 200; perfil `admin_instituto` y login OK |
| Rol inválido, lista vacía, institución inexistente, contraseña corta | 400; no se crea ningún usuario Auth |
| Email de Super Admin, de alumno o de admin bloqueado | 409; perfil, membresías y contraseña sin cambios |
| Admin existente | 200, `user_reused: true`; conserva la contraseña y suma la membresía |
| Falla inducida en la membresía, usuario nuevo | No quedan usuario Auth ni perfil |
| La misma falla con un admin existente | El usuario existente no se borra |

**El harness detecta el bug.** Contra el handler anterior (con solo `user_reused` agregado), falla en "assign bad-role created an Auth user": queda un usuario huérfano.

Regresiones: `validateSuperAdminEdgeLocal`, `validateInitialPasswordLocal` y `validateIntegratedAcceptanceLocal` PASS. `npm run check` PASS (2684).

## Corrección de AUD.I2f (Codex, FAIL: un P1 y dos P2) — 2026-10-20

**P1 — el rollback borraba al admin de otra alta exitosa.** Solución:
- `createInstitutionAdminUser` crea la cuenta con `app_metadata.institution_admin_provisioning = true`, en la misma llamada a Auth, sin ventana.
- Ningún camino de reutilización toma una cuenta así: admin (`findReusableInstitutionAdmin`), docente (`createOrReuseTeacherAuthUser`) y alumno (`assertStudentProvisioningIdentity`) responden 409 "alta en curso".
- La marca la libera solo la misma alta, al terminar (`finishInstitutionAdminProvisioning`).
- La compensación (`discardProvisionalInstitutionAdmin`) relee la cuenta y la borra solo si sigue en alta. Si ya se liberó, la conserva y lo informa como "no se pudo deshacer: usuario".
- No hay TOCTOU: mientras la cuenta está en alta nadie más la usa, y una vez liberada nadie la borra.

**P2 — una cuenta sin perfil se reutilizaba como admin.** Ahora responde 409 y no se inventa el perfil.

**P2 — se pisaba una democión concurrente.**
- La reutilización ya no escribe el perfil: se retiró `markReusedInstitutionAdmin`.
- `readReusableAdminProfile` se vuelve a correr después de dar la membresía. Si el usuario dejó de ser `admin_instituto` o quedó bloqueado:
  - en el alta, se deshace la institución, y la membresía cae en cascada;
  - en "Asignar usuario", se borran las membresías nuevas y se restauran las previas con su rol.

Harness `scripts/validateTenantCreationLocal.mjs`, con los escenarios de la auditoría reproducidos con Auth, PostgREST y Edge reales (`supabase/edge-runtime:v1.77.4`). **PASS**, run `2f1af00344ba0b0f`, cleanup 0:

| Escenario de la auditoría | Antes (Codex) | Ahora |
|---|---|---|
| A en alta con falla demorada, B reutiliza el mismo email | B 200; A borra la cuenta y B queda sin admin | B **409**; A deshace su cuenta; B reintenta y crea → 200 con login OK |
| A en alta lenta y exitosa, B en el medio | — | B 409 mientras dura; al terminar A, B reutiliza → 200; 2 owners |
| Cuenta Auth sin perfil | 200, perfil `admin_instituto` inventado | **409**, sin perfil ni institución |
| Democión a alumno durante el alta | 200; vuelve a `admin_instituto` + owner | **409**; sigue `alumno`, sin institución ni membresía |
| La misma democión en "Asignar usuario" | — | **409**; membresía previa restaurada (`viewer`), sin la nueva |

**Control negativo:** el mismo harness contra la Edge anterior (`041cc82`) falla en el P1: "B reused an admin still being provisioned", con B 200 y `admin_reused: true`. Cleanup 0.

**Riesgo residual:** si el proceso de la Edge muere entre crear la cuenta y liberarla, la cuenta queda "en alta". Esa cuenta puede iniciar sesión, pero no se puede reutilizar (409). Para recuperarla, un Super Admin pone `institution_admin_provisioning` en `false` desde Authentication → Users, o borra la cuenta si no tiene membresías.
