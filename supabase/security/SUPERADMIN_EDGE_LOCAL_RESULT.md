# Super Admin y administración multitenant vía Edge: validación local

Fecha: 2026-10-16. Épica 04–06 (Super Admin / multitenant). Ensayo 397df57e38ab57ee: PASS. Evidencia: [SUPERADMIN_EDGE_LOCAL_EVIDENCE.json](./SUPERADMIN_EDGE_LOCAL_EVIDENCE.json).

## Cómo

`node scripts/validateSuperAdminEdgeLocal.mjs` levanta el stack compartido de `scripts/localSupabaseStack.mjs` (base con baseline canónico, GoTrue v2.196.0, PostgREST v16.1, gateway nginx en loopback) y Edge Runtime v1.77.4 con `admin-users` empaquetada sin red (ver [EDGE_RECOVERY_RESULT.md](./EDGE_RECOVERY_RESULT.md)). Actores con sesiones reales: Super Admin global, owner y viewer de la institución A, owner de la institución B.

## Resultado

| Acción | Actor | Resultado |
| --- | --- | --- |
| `create_tenant_with_admin` | owner A, viewer A, owner B | 403; sin instituciones nuevas |
| `create_tenant_with_admin` | Super Admin | 200; el admin creado queda `admin_instituto`, sin admin global, owner solo de la institución nueva |
| `bulk_create_students` en institución ajena | owner A → B, owner B → A | 403; sin usuarios Auth creados |
| `bulk_create_students` como viewer | viewer A → A | 403; sin usuarios Auth creados |
| `bulk_create_students` en institución propia | owner A → A | 200; alumno `alumno`, sin admin global, membresías solo en A |
| `set_user_password` | owner A, viewer A | 403 |
| Auditoría | — | 2 filas `success` (alta de institución y alta masiva); las denegaciones fallan antes de auditar |

Cleanup: 0 bases, 0 contenedores, 0 archivos temporales (incluido el bundle de Edge).

## Límites

Local y sintético. Cubre la autorización de cuatro acciones de `admin-users`; no cubre `create_or_assign_institution_user`, `bulk_create_teachers`, reseteos académicos ni la UI del panel Super Admin. Sin rate limiting (riesgo residual ya listado en SECURITY.md). Sin auditor independiente.
