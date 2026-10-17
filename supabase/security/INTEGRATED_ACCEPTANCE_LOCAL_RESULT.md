# QA.1 — Aceptación integrada local: bloqueo de configuración

Fecha: 2026-10-17. Base: release/v1 03bf2ab. **QUALITY GATE: FAIL** para la aceptación: falta resolver la configuración que debe acreditar la RPC. No se declara fallo del producto por este modo de operación ni aceptación E2E PASS.

## Evidencia real

Run final `2b63fb0c651fc86a`, servicios reales locales: PostgreSQL, GoTrue, PostgREST, nginx, Edge Runtime admin-users, Vite y Chrome aislado. Las imágenes nginx1.27-alpine y Edge1.77.4 tienen los digests exactos aprobados por Claude, registrados en EVIDENCE.json. El stack se comprobó antes con run eb4ffe9b0995c507, arranque/teardown PASS.

El fixture compartido A/B crea diez usuarios por la API real GoTrue; cuatro son las cuentas de navegador previstas (alumnos A/B, docente A y admin A), seis son auxiliares del fixture SQL y no se autentican. Contraseñas aleatorias y claves efímeras solo en memoria/entorno; sin storageState, trazas, capturas ni tokens persistidos. El navegador bloquea orígenes externos.

Alcanzado con alumno A:
- formulario de login real y rechazo visible de institución B;
- login en A, rol alumno, institución activa correcta y materia FIX-A-01 visible;
- mesa futura publicada visible y botón Inscribirme;
- petición real a admin-users: HTTP200; aparece Cancelar inscripción;
- respuesta Edge: sources.snapshot=true, sources.relational=false, read_mode=snapshot_only;
- consulta real: exam_enrollments del alumno A contiene **0 filas**. La assertion exige1 y falla.

No ejecutados por el corte: logout, restantes actores, carga docente, relectura del alumno y alta administrativa. La existencia de esos pasos en el harness no acredita ejecución.

## Contradicción que debe resolver Claude

HACER2 pide inscripción por RPC del portal. `admin-users/index.ts` exige relacional para enroll_subject/withdraw_subject; register_exam depende del modo de transición. `studentPortalMutations.js` exige confirmación relacional en hybrid_read/relational_primary. El fixture compartido y el baseline arrancan en snapshot_only.

Pregunta enviada en la tarjeta: A) definir flags de transición solo para el fixture y acreditar el camino relacional, o B) correctivo separado si el comportamiento por defecto debe ser diferente. Recomendación A si la aceptación representa el modo relacional; registrar explícitamente sus límites. **No se cambian flags por suposición, defaults de la app, schema, RPC ni grants.**

## Preparación corregida y límites

Ensayos anteriores e50b2c9f43e25ba4,46708ed011f18d46,96f5bd9e8e22fc6f y eb902742907ccff1 quedaron FAIL y limpiados. Se corrigió el fixture: usuarios SQL incompletos se reemplazaron por altas Auth API; se confirmó el docente y se completó fecha futura/publicación del snapshot, precondiciones ya exigidas por la aplicación. [GoTrue2.196.0 acepta IDs sintéticos para Admin API](https://github.com/supabase/auth/blob/v2.196.0/internal/api/admin.go).

El nuevo harness verifica IDs de Auth, digests antes de crear recursos, errores HTTP sanitizados, red local y datos docentes exactos por alumno/materia/carrera. El stack compartido permite recuperar CREATE parcial con marcador null únicamente para nombre generado previamente ausente y owner estándar; verifica ausencia final. Revisión independiente cerró los dos P2 de cleanup y correlación de datos. Code/Adversarial Review PASS, sin P0/P1/P2 abiertos en el diff; los pasos UI no alcanzados siguen sin certificar.

Cleanup del último ensayo: 0 bases,0 contenedores,0 temporales,0 errores. Logs locales ignorados y entregables se conservan. Imágenes descargadas son dependencias autorizadas, no residuos de fixtures. Sin cambios en contenedores supabase_* preexistentes. Staging/Production/SQL remoto/deploy NONE.

## Verificación reproducible

`node scripts/validateIntegratedAcceptanceLocal.mjs` reproduce el FAIL explícito en el modo actual; no usarlo como smoke remoto.

Tests focales y consumidores del stack:10PASS. Lint focal PASS. quality:full PASS exit0:2470tests/312archivos,lint,auditoría repo,build1,66s,auditoría producción114archivos,dependencias0high/critical y7moderate. Typecheck NO DISPONIBLE(JS). Browser/E2E FAIL(incompleto por configuración); Database PASS para el conteo0 observado y cleanup; RLS NO APLICA como certificación completa; Security/CodeReview/Adversarial PASS para el harness. Performance WARNING: fixture pequeño, sin benchmark de producción. Auditoría final reservada a Claude.

RESPUESTA CLAUDE posterior exige acreditar ambos modos en un run. Se pidió precisar la clave: el código lee academic_relational_transition, mientras la respuesta decía academic_transition_config. Además se requiere aclarar cómo acreditar rechazo RPC del no regular cuando UI y Edge impiden llegar a la RPC. Propuesta: negativoUI más llamada adversarial autenticada desde el navegador, sin persistir token. Ambos puntos están pendientes; esta entrega WIP conserva el ensayo snapshot_only y no implementa silenciosamente un sustituto.
