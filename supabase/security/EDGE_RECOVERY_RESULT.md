# Edge Function admin-users sobre el backend recuperado: validación local

Fecha: 2026-10-16. Tarjeta: https://trello.com/c/btzptnJ9 . Ensayo 638e7917e69d960c: PASS funcional. Evidencia completa en [EDGE_RECOVERY_EVIDENCE.json](./EDGE_RECOVERY_EVIDENCE.json). Continúa la unidad de frontend ([FRONTEND_RECOVERY_RESULT.md](./FRONTEND_RECOVERY_RESULT.md)), que había dejado Edge fuera de alcance.

## Cómo se arma

`node scripts/validateEdgeRecovery.mjs` corre la recuperación integrada DB/Auth/Storage, la Data API y el navegador, y suma Edge sobre el mismo destino restaurado:

- **Función empaquetada sin red.** `admin-users/index.ts` importa `@supabase/supabase-js@2` desde esm.sh en tiempo de ejecución. El ensayo no descarga código remoto: `scripts/validateRecoveredEdge.mjs` la empaqueta con rolldown usando la versión exacta instalada en el repo (2.104.0) y aborta ante cualquier otra importación remota. La función no se modificó.
- **Edge Runtime v1.77.4** (`supabase/edge-runtime`, la versión que fija la Supabase CLI 2.121.0), con la función como servicio principal, montada de solo lectura y publicada solo en loopback.
- **Gateway mínimo** (`nginx:1.27-alpine`) que cumple el papel de Kong: una sola `SUPABASE_URL` con `/auth/v1`, `/rest/v1` y `/storage/v1` hacia los contenedores restaurados por la red interna de Docker; cualquier otra ruta responde 404.
- **Secretos:** claves `anon` y `service_role` firmadas con el secreto JWT efímero del ensayo, pasadas por entorno del proceso, nunca en archivos ni al frontend. `ADMIN_USERS_ALLOWED_ORIGINS` fijado al origen loopback de Vite, reservado antes de arrancar Edge.
- **Frontend:** Vite agrega `/functions/v1` al proxy loopback. Con Edge presente, la tolerancia al 404 de la unidad anterior queda desactivada: cualquier error de Edge vuelve a fallar.

## Resultado

| Control | Resultado |
| --- | --- |
| Recuperación integrada y Data API | PASS (sin cambios respecto de la unidad anterior) |
| Navegador, 4 cuentas | PASS: rechazo ajeno, portal propio, logout y ruta protegida; externos 0, errores 0 |
| Padrón docente vía Edge en el navegador | 200 en las 2 cuentas docentes (`edgeRosterLoads: 2`), sin fallback |
| Auditoría tras el navegador | Solo 2 filas `teacher_subject_rosters` de docentes sintéticos, `success` |
| Token de sesión revocada por logout global | 401 |
| Docente: padrón de su institución / ajena | 200 / 403 (ambas docentes) |
| Docente: `teacher_profile_update` en institución ajena | 403 (ambas docentes) |
| Alumno: acción de docente | 403 (ambos alumnos) |
| JWT inválido / sin Authorization | 401 / 401 |
| Origen no permitido | 403 |
| Mutación permitida (docente tenant 0 actualiza su teléfono) | 200; solo su `teacher_records` cambia, el tenant ajeno no |
| Tablas alteradas por la mutación | solo `public.teacher_records`, `public.profiles`, `public.admin_audit_logs`, `auth.users`, `auth.identities`, `auth.audit_log_entries` |
| Auditoría final | 4 `teacher_subject_rosters` + 1 `teacher_profile_update`, todas de docentes y `success`; las denegaciones no auditan porque fallan antes de autenticar |
| Gateway y Edge | corriendo, 0 reinicios |
| Cleanup | 0 bases, contenedores, volúmenes y archivos temporales (incluye el bundle y la configuración del gateway) |

Tiempos del ensayo (fixture sintético, no SLA): backup 447 ms, restore 8463 ms, recuperación integrada completa con API, navegador y Edge 90343 ms.

## Hallazgo durante la unidad

El primer ensayo con Edge (e5eb291c5180c046) quedó BLOQUEADO con 401 en el primer control: los tokens de la fase Data API se habían emitido antes del navegador, y el logout del navegador revoca globalmente las sesiones del usuario. Edge valida la sesión contra GoTrue, así que el 401 es el comportamiento correcto. El harness ahora inicia sesiones nuevas para los controles de Edge y comprueba explícitamente que el token revocado sea rechazado (`edgeRevokedSessionStatus: 401`).

Regresión sin Edge (`node scripts/validateFrontendRecovery.mjs`, run be19a67c88491b4b): PASS, con el 404 de `admin-users` registrado fuera de alcance y `edgeCertified: false`, igual que en la unidad anterior.

## Diferencias respecto de producción

- Producción descarga `supabase-js@2` de esm.sh en cada arranque en frío (versión 2.x vigente); el ensayo usa la 2.104.0 del lockfile.
- Kong se reemplaza por un gateway nginx mínimo; no se ensayan rate limiting ni el chequeo de `apikey` de Kong.
- Imágenes de Edge Runtime y nginx tomadas de Docker Hub, porque public.ecr.aws limitó las descargas en esta sesión.
- Ensayo en sesión cloud Linux; en Windows el bind mount del bundle depende de que la ruta temporal no contenga comas.

## Límites

Certifica la autenticación, la autorización por rol e institución, CORS y una mutación propia de `admin-users` sobre el destino restaurado. No cubre `source-file-storage`, las acciones de Super Admin o administrador institucional, las mutaciones del portal alumno ni la creación masiva de accesos. No cubre SMTP, OAuth ni secretos externos. Sin auditor independiente: revisión propia del delta. Sin Staging, Production, SQL remoto ni deploy.

Typecheck: NO DISPONIBLE (JS). Lint: PASS. Tests: PASS. Build: PASS. Browser/E2E: PASS local acotado. Edge: PASS local acotado. QUALITY GATE global de release: FAIL hasta cerrar la aceptación integral y la configuración externa.
