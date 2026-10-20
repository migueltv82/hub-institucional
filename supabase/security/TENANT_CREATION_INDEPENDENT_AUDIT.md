# AUD.I2f — Auditoría independiente de alta de institución y admin

Fecha: 2026-10-20. Implementación: Claude, `64986f7`, integrada en `c4fabb3`. Auditor: Codex, más CHIEF CODE AUDITOR independiente read-only. No se utilizó la implementación alternativa de Codex conservada en stash. No se modificó código funcional.

**Veredicto funcional y de seguridad: FAIL.** La compensación original elimina las instituciones fallidas, pero puede destruir una cuenta que otra alta concurrente ya reutilizó y dejar esa segunda institución sin administrador. No aprobar I2f ni desplegar este correctivo sin resolver P1 y repetir auditoría.

## P1 — El rollback borra al administrador de otra alta exitosa

Archivo: `supabase/functions/admin-users/index.ts:793–795` (creación y publicación del perfil en `:767–770`; reutilización en `:739`, `:764`). Cascadas: `supabase/schema/01_foundation.sql:53,72`.

El identificador `createdUserId` solo prueba que A creó la cuenta; no prueba que siga siendo exclusiva de A cuando se compensa. Después de crear Auth y perfil, otra solicitud B ya puede verla mediante `findReusableInstitutionAdmin`, asignarla como owner y devolver HTTP 200. Si la membresía de A falla, A borra esa misma cuenta por Auth Admin API. Las cascadas eliminan perfil y membresía de B. La institución de B permanece y el acceso deja de funcionar.

Reproducción local: extender el harness `scripts/validateTenantCreationLocal.mjs` antes de su cierre, conservando Auth, PostgREST y Edge reales. Instalar en la base descartable un trigger BEFORE INSERT en `public.memberships` que solo para el slug sintético de A ejecute `pg_sleep(12)` y después `raise exception 'AUDIT_I2F_DELAYED_FAILURE'`. Lanzar A con email nuevo; esperar a que su perfil `admin_instituto` sea visible en otra conexión. Lanzar B con otro slug y el mismo email. Guardar su respuesta y contar su membership antes de esperar el fallo de A. Volver a contar y probar login tras terminar A. El trigger no toca otras altas y solo existe en la base descartable.

Run `14dcda00425780c8`, `supabase/edge-runtime:v1.77.4`:

| Observación | Resultado |
|---|---|
| Alta B | HTTP 200, `admin_reused=true` |
| Antes del rollback de A | Auth=1, membresía de B=1 |
| Alta A | HTTP 500; mensaje «no quedó nada creado» |
| Después del rollback | Auth=0, membresías de B=0, institución B=1 |
| Login con contraseña original de A | HTTP 400 |
| Institución fallida A | 0 |

El harness de regresión existente también pasó en ese mismo stack. El campo `result: PASS` del runner significa que terminó la instrumentación; el escenario propio registra `defectReproduced: true`. No es una aprobación del comportamiento.

Corrección a cargo del implementador: evitar borrar una identidad ya publicada y reutilizable mediante una compensación local sin coordinación. Un SELECT de membresías antes de `deleteUser` tampoco basta: vuelve a abrir una ventana TOCTOU. La exclusividad debe garantizarse entre todos los caminos de provisión/reutilización o conservarse la cuenta para recuperación explícita.

## P2 — Se reutiliza una cuenta sin perfil como admin

Archivo: `supabase/functions/admin-users/index.ts:618–625,657`.

`maybeSingle()` sin resultado produce `existingProfile=null`. El rol vacío derivado evita el rechazo y `markReusedInstitutionAdmin` crea un perfil `admin_instituto`, seguido de owner. Se permite la reutilización sin prueba del rol previo, aunque el comentario de contrato exige un admin existente.

Reproducción: en la base descartable, crear por GoTrue una cuenta y poner su perfil en `alumno` como hace el fixture. Eliminar solo ese perfil para representar una identidad incompleta; mantener Auth. Ejecutar `create_tenant_with_admin` con su email. Run `57d8936f23e3e4b2`: HTTP 200, perfil final `admin_instituto,false,false`, membresías=1. No es un bypass de la autorización del caller: el endpoint sigue exigiendo superadmin. Es un fallo de validación de la identidad reutilizada; debería rechazarse o repararse mediante un flujo explícito.

## P2 — Se sobrescribe una democión concurrente

Archivo: `supabase/functions/admin-users/index.ts:619,657,739,764`.

La validación de rol ocurre antes de crear la institución; la reutilización vuelve a escribir `account_role='admin_instituto'` sin condición. Otra operación puede cambiar el rol a alumno durante esa ventana. La solicitud continúa, revierte esa decisión y agrega owner.

Reproducción local: trigger BEFORE INSERT en `public.institutions`, limitado al slug sintético de esta prueba, con `pg_sleep(3)`. Lanzar alta reutilizando un admin. Esperar `pg_stat_activity.wait_event='PgSleep'` para confirmar que ya pasó la validación y está insertando la institución. Desde otra conexión cambiar su perfil a alumno y comprobarlo; esperar el alta. Run `af0109758336fb9b`: antes de continuar, `alumno,false,false`; respuesta HTTP 200 con `admin_reused=true`; después, `admin_instituto,false,false` y una membresía. Ese run también repite P2 de perfil ausente. Cleanup = 0.

La primera variante de este escenario (`57d8936f23e3e4b2`) con demora de ocho segundos devolvió 500 y conservó alumno; no reproduce el hallazgo y no se presenta como evidencia positiva. La repetición más corta evita que un timeout oculte la ventana. Corregir la coordinación/revalidación entre validación y escritura sin borrar una decisión concurrente.

## Verificaciones y límites

- Harness de regresión completo ejecutado con fallos de Auth y owner inducidos; instituciones, recursos Storage, usuarios nuevos y perfiles fallidos se compensan en ejecución secuencial; slug reutilizable. Cuenta admin existente mantiene contraseña; superadmin/alumno/bloqueado con perfil se rechazan.
- Suites relacionadas: `validateTenantCreationLocal.test.js` y `adminUsersEdgeFunctionSecurity.test.js`, 2 archivos / 25 tests PASS.
- Stacks de las reproducciones `14dcda00425780c8`, `57d8936f23e3e4b2` y `af0109758336fb9b`: cleanup de bases, contenedores y temporales = 0, sin errores.
- No se ejecutó SQL remoto, deploy ni cambios de Edge. No se leyeron `.env`. No se modificaron TeacherPortalModule, examActas ni `08_exam_tables.sql`.
- No se sostiene un desbloqueo concurrente: el upsert no escribe `is_blocked` sobre el perfil existente.

**QUALITY GATE: FAIL por P1 confirmado**, aun si tests, lint y build están verdes. Hallazgos entregados sin corregir al implementador.

Gate automatizado final: `npm.cmd run check` PASS, 351 archivos / 2702 tests, lint, auditoría del repo, build y auditoría del bundle (120 archivos). Aviso preexistente de chunks >500 kB. Typecheck no disponible; navegador no ejecutado; pruebas de base/Auth/Edge locales completadas. Revisión independiente: coincide con P1 y dos P2 y aprueba la fidelidad del informe. Seguridad/corrección/adversarial: FAIL por los hallazgos descritos. No se alteraron tests para conseguir verde.
