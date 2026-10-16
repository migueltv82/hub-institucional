# 07.1 — Smoke check post-deploy (read-only)

Fecha: 2026-10-16. Implementado por Claude mientras Codex no estaba disponible; la auditoría queda para Codex.

## Qué es

`scripts/smokeCheck.mjs` da un PASS/FAIL en segundos después de cualquier deploy. Hace solo GET, nunca escribe y rechaza cualquier clave que no sea pública (`service_role`, `sb_secret_…`, JWT con otro rol).

| Check | Pasa si |
| --- | --- |
| `auth` | `GET /auth/v1/health` → 200 |
| `rest` | `GET /rest/v1/institutions` con anon → 200 |
| `storage` | `GET /storage/v1/status` → 200 |
| `edge` | `GET /functions/v1/admin-users` → **405** (publicada; 404 = no desplegada) |
| `anonSensitive` | anon recibe 0 filas, o 401/403/404, en `profiles`, `memberships`, `student_records`, `teacher_records`, `student_grades`, `subject_enrollments`, `exam_enrollments`, `admin_audit_logs`, `workspace_snapshots` |
| `invalidJwt` | Bearer inválido → 401 |
| `frontend` | `/` → 200 con `#root`; hasta 5 assets `/assets/*` → 200; ruta inexistente → 200 (fallback SPA) |

La salida es JSON con el estado de cada check. El ref aparece enmascarado (`abcd…wxyz`). Exit code 1 si algún check da FAIL. Un check salteado figura como `SKIPPED`, nunca como PASS.

## Cómo correrlo en Staging o Producción

```powershell
node scripts/smokeCheck.mjs --supabase-url https://<REF>.supabase.co --anon-key <clave publica> --frontend-url https://<dominio>
```

La clave pública es la misma que usa el frontend (`VITE_SUPABASE_PUBLISHABLE_KEY`). No hace falta ni se acepta la service role. En Producción no saltear ningún check.

## Validación local

`node scripts/validateSmokeCheckLocal.mjs`: stack descartable (`localSupabaseStack.mjs`, Auth + PostgREST detrás del gateway) con filas sembradas en `profiles`, `memberships`, `student_records` y `admin_audit_logs`, más `vite preview` de `dist/`.

- Smoke: **PASS** en `auth`, `rest`, `anonSensitive` (9 tablas, 0 filas visibles para anon con datos presentes), `invalidJwt` y `frontend`. `storage` y `edge` quedan `SKIPPED`: no forman parte de ese stack. El 405 de `admin-users` se acreditó en EDGE_RECOVERY y SUPERADMIN_EDGE_LOCAL.
- Clave `service_role` del mismo stack: rechazada.
- Control negativo con el gateway apagado: **FAIL** (`auth`, `rest`, `anonSensitive`, `invalidJwt`).
- Cleanup: 0 bases, 0 contenedores, 0 archivos temporales.

Test focal `scripts/smokeCheck.test.js`: 7/7. Cubre caso sano y solo GET, fuga en tabla sensible, 401/404 aceptados y 500 rechazado, Edge 404, JWT inválido aceptado, error de red, skips y rechazo de claves privadas.

Staging, Production, SQL remoto y deploy: NONE.
