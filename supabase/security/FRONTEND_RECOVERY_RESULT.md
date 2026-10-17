# Frontend contra el backend recuperado: validación local

Fecha: 2026-10-16. Tarjeta: https://trello.com/c/WnSssE8z . Ensayo 6ddb5a97f8151217: PASS funcional para acceso y aislamiento. Evidencia completa en [FRONTEND_RECOVERY_EVIDENCE.json](./FRONTEND_RECOVERY_EVIDENCE.json).

## Qué se probó

`node scripts/validateFrontendRecovery.mjs` encadena la recuperación integrada DB/Auth/Storage, la Data API (PostgREST v16.1) y un navegador real:

- Vite local del propio repo, con proxy loopback solo a `/auth/v1`, `/rest/v1` y `/storage/v1` del destino restaurado. Únicamente la clave pública `anon` llega al frontend; `VITE_DISABLE_AUTH=false`, sin `.env` leído y sin sesiones precargadas.
- Cuatro cuentas sintéticas restauradas (docente y alumno en cada una de dos instituciones). Por cuenta: login desde el formulario contra la institución ajena (rechazado con el mensaje de permisos y vuelta a `/login`), login en la institución propia (portal correcto, institución activa correcta, nombre de la institución ajena ausente), logout y `/app` redirige a `/login`.
- Todo request a un origen distinto del servidor local se aborta y se cuenta.

## Resultado

| Control | Resultado |
| --- | --- |
| Recuperación integrada DB/Auth/Storage | PASS: 4 logins restaurados, 2 descargas SHA256 exactas, filas y estructura iguales, Auth 77 migraciones |
| Data API | PASS: own 1 / foreign 0 / memberships ajenas 0 / PATCH ajeno 0, JWT inválido 401, anónimo 0 filas |
| Navegador, 4 cuentas | PASS: rechazo ajeno, institución propia, logout y ruta protegida tras logout |
| Requests externos / errores de página / errores del servidor | 0 / 0 / 0 |
| Errores HTTP fuera de Edge | 0 |
| Cleanup | 0 bases, contenedores, volúmenes y archivos temporales; navegador y servidor propios cerrados |

Tiempos del ensayo (fixture sintético pequeño, no SLA): backup 461 ms, restore 8644 ms, recuperación hasta descarga 14099 ms.

## Hallazgo: Edge Functions fuera del backend recuperado

En las dos cuentas docentes, el portal llamó a `POST /functions/v1/admin-users` (acción `teacher_subject_rosters`) y recibió 404, porque el backend recuperado no incluye Edge Functions. `src/modules/docentes/services/subjectRoster.js` cae entonces al RPC `academic_get_teacher_subject_rosters`, y el portal cargó sin errores.

El primer ensayo (1c2044403fb927db) quedó BLOQUEADO por ese 404: el harness trataba todo HTTP >= 400 como fallo. Por decisión explícita del usuario se acotó el harness (`edgeOutOfScope` en `scripts/validateRecoveredFrontend.mjs`): solo un **404** de un endpoint Edge **conocido** (`admin-users`, `source-file-storage`) se registra en `browserEdgeOutOfScope`; cualquier otro estado de Edge (401, 403, 500...), un endpoint Edge desconocido o un error de auth/rest/storage/frontend sigue fallando. El reporte marca `edgeCertified: false`. No se modificó la app.

**Riesgo residual:** en una recuperación sin Edge, las operaciones que dependen de `admin-users` no funcionan (por ejemplo perfil docente, bajas y reseteos de alumno, mutaciones del portal alumno, alta de accesos). La recuperación de Edge queda como unidad separada.

## Diferencias de entorno respecto de los ensayos anteriores

Ensayo ejecutado en una sesión cloud Linux, no en la PC Windows:

- Stack fuente recreado con Supabase CLI 2.121.0 (`project_id = codex-baseline-local-7725bdda`), imágenes fijadas a `public.ecr.aws/supabase/postgres:17.6.1.165`, `gotrue:v2.196.0` y `storage-api:v1.70.7`. Historial Storage de la fuente: 65 (en la PC era 63 y la recuperación agregaba 2); el resultado del destino es el mismo, 65.
- Playwright usa el canal `chrome`; en este entorno ese canal apunta al Chromium 141 provisto, no a Google Chrome estable.

## Límites

Certifica acceso, pertenencia a institución y aislamiento visibles en el navegador para las cuatro cuentas, no todos los módulos académicos. No certifica Edge Functions, SMTP/OAuth ni configuración o secretos externos. Sin auditor independiente: revisión propia del delta del harness. Sin Staging, Production, SQL remoto ni deploy.

Typecheck: NO DISPONIBLE (JS). Lint: PASS. Tests: PASS. Build: PASS. Browser/E2E: PASS local acotado. Database/RLS: PASS para las operaciones verificadas. QUALITY GATE global de release: FAIL hasta cerrar Edge, aceptación integral y configuración externa.
