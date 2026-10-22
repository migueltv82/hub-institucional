# PB.4 — Inscripción a mesa sin drift entre snapshot y tablas (local)

Fecha: 2026-10-19. Ejecutó: Claude. Entorno: aceptación integrada local (`validateIntegratedAcceptanceLocal`) con navegador real, GoTrue, Edge Runtime y PostgREST. Staging y Producción: **NONE**.

## Problema (hallazgo P2 de la auditoría de PB.1)

`student_portal_mutation` escribía primero el snapshot del workspace y después la tabla relacional (la RPC). Además, `register_exam` y `cancel_exam` no eran estrictas: si la RPC de mesa fallaba en `dual_write` con lectura `snapshot_only`, la Edge respondía 200 con un warning. Quedaba el snapshot con la inscripción y la tabla sin ella. Las cursadas eran estrictas, pero tiraban el error **después** de escribir el snapshot ("El snapshot se actualizo, pero fallo…"), así que también dejaban drift.

## Cambio (`supabase/functions/admin-users/index.ts`)

- **Orden:** primero la escritura relacional y después el snapshot. Si la escritura estricta falla, se responde 409 con el motivo de la RPC ("No se guardo el cambio: …") y el snapshot no se toca.
- **Mesas estrictas:** `register_exam` y `cancel_exam` se suman a las mutaciones estrictas, porque la RPC es la autoridad de la regla de mesas. El espejo del frontend (`studentPortalMutations.js`) también.
- **Efecto en modo `default` (sin `dual_write`):** la inscripción a mesa ahora también escribe `exam_enrollments`, igual que ya pasaba con las cursadas. Es lo que lee el roster del titular (EX.8/F1).
- **Inscripciones solo en snapshot:** cancelar una inscripción vieja que solo existe en el snapshot ahora se rechaza en vez de "pasar con aviso". Producción hoy solo tiene datos de prueba.

## Resultado

`node scripts/validateIntegratedAcceptanceLocal.mjs` → **PASS**, cleanup 0.
- **Ciclos de mesa:** en los 3 ciclos (`dual_write`, `default`, `dual_write`), inscribirse escribe tabla y snapshot, y cancelar los deja en 0.
- **Falla inducida de la RPC en `dual_write`** (trigger en `exam_enrollments`): 409, y tabla y snapshot en 0.

**El harness detecta el bug.** Contra la Edge anterior, con las mesas estrictas pero el orden viejo: 500 y `{ relational: 0, snapshot: 1 }`, es decir, drift.

Regresiones: `validateSuperAdminEdgeLocal`, `validateInitialPasswordLocal`, `validateTenantCreationLocal` y `validateRoundTripLocal` PASS. `npm run check` PASS (2688).

## Pendiente

- Redeploy de `admin-users` (el mismo de I2d, I2f e I2g).
- Auditoría independiente COMPLETA: toca la Edge.
