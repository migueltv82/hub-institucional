# Recuperación local DB/Auth — 2026-10-13

Resultado funcional: PASS. Run 78638876b4d4cadc. Trello: https://trello.com/c/Yu0qTa3C

Se creó una fuente descartable desde schema-only del CLI, conservando únicamente bookkeeping Auth, y se aplicaron los nueve SQL canónicos. Usuarios iniciales e instituciones: cero. Fixture: dos instituciones, cuatro cuentas creadas mediante Auth Admin API local (docente y alumno en cada institución), cuatro perfiles/membresías y dos legajos.

Backup real pg_dump custom-format de 739860 bytes, mantenido en memoria. Restauración transaccional pg_restore en una base creada con template0 y sin tablas de aplicación. Backup:350ms; restore:699ms; recuperación hasta cuatro logins correctos:23737ms (incluye comprobación exhaustiva de integridad). RPO observado: cero filas sintéticas comprometidas perdidas en snapshot congelado. Son métricas del ensayo pequeño local, no objetivos ni estimaciones productivas.

Todas las filas de tablas auth/public/storage conservaron conteos y SHA256 antes de nuevos logins, incluyendo UUID, identities y FKs. Las secuencias conservaron last_value/is_called. Catálogo idéntico: owners, ACL/grants, RLS, policies, funciones, constraints, triggers e índices. Historial Auth77/77 y catálogo revalidados después de arrancar GoTrue y hacer login. Versiones PostgreSQL17.6.1.165 y GoTrue2.196.0; credencial estándar sin resets ni ampliación de grants.

Aislamiento negativo con rol authenticated y claims propios de cada una de las cuatro cuentas: institución propia visible, institución ajena y membresías ajenas cero filas; UPDATE ajeno cero filas, transacción revertida. No acredita exhaustivamente todas las RPC/tablas del dominio. Login probado por API, no frontend.

Cleanup verificado: cero bases y contenedores del ensayo; cero backups en disco; buffer del archive sobrescrito. Se preservó el contenedor CLI original. Sin Staging, Production, SQL remoto, deploy, commit ni push.

CHIEF CODE AUDITOR: Code Review PASS; Adversarial Review PASS. Dos P2 detectados y corregidos (verificación posterior a Auth y recuperación de creación parcial). Sin hallazgos nuevos abiertos. Limitaciones: terminación abrupta puede impedir finally, fallos parciales no inyectados y normalización ACL limitada a roles estándar.

Archivos: scripts/validateLocalDbAuthRecovery.mjs y su test; este informe, JSON de evidencia y docs/WORKLOG.md. Typecheck:NO DISPONIBLE. Lint:PASS. Tests:PASS (2383 en292archivos). Build:PASS (audit114archivos). Browser/E2E:NO APLICA al script, Auth API realPASS. Database:PASS. RLS:PASS en alcance A/B descrito. Security:PASS en alcance local (0high/critical,9moderate/1low inventariados). Performance:WARNING, solo medición local pequeña. Code Review:PASS. Adversarial Review:PASS.

DB/Auth local queda cerrado. Storage bytes, configuración/secretos, rollback y aceptación global siguen pendientes. El ensayo no certifica DR integral ni autoriza release. Por los P1 globales pendientes: QUALITY GATE: FAIL (release global); comando quality:full local:PASS.
