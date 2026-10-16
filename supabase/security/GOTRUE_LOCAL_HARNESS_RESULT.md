# GoTrue local harness — 2026-10-13

GOTRUE HARNESS FIX — PASS LOCAL. QUALITY GATE: FAIL global por auditoria de dependencias; no acredita release ni DR completo.

## Cambio

Harness reproducible: `scripts/validateGoTrueLocalHarness.mjs`. Tests: `scripts/validateGoTrueLocalHarness.test.js`.
Ejecutar desde raiz del repo: `node scripts/validateGoTrueLocalHarness.mjs`.
Solo acepta el contenedor y red local existentes y las imagenes cacheadas fijadas; no utiliza Supabase remoto ni hace pulls.

La credencial se obtiene en memoria de la configuracion estandar del CLI `/etc/postgresql.schema.sql`: variable psql `pgpass` que referencia `PGPASSWORD`, alimentada por `POSTGRES_PASSWORD` del contenedor. No se ejecuta el comando del archivo ni se imprime el valor. Se verifica por TCP como `supabase_auth_admin` y se pasa a GoTrue mediante environment, sin argumentos ni archivos secretos. No se cambian contrasenas, roles, owners o grants.

## Evidencia ejecutada

Run exitoso: `3ba88102f0056fef`, PostgreSQL imagen `17.6.1.165`, GoTrue `v2.196.0`.
Base descartable nueva, clonacion schema-only sin filas de usuarios/aplicacion. Unico contenido copiado: historial `auth.schema_migrations`. Se reaplican los nueve SQL canonicos en orden; no es el ensayo integral de backup/restore.

- Fuente/destino: 77/77 migraciones; igualdad completa de versiones antes y despues de GoTrue.
- Rol efectivo TCP: `supabase_auth_admin`; 8 entradas en `pg_stat_statements` del mismo rol/base.
- Sesiones abiertas al muestrear: 0. El pool cierra conexiones idle; los contadores acreditan consultas ejecutadas.
- GoTrue healthy: cinco muestras HTTP 200, proceso running y cero reinicios.
- GET `/admin/users` con JWT sintetico temporal: 200 y lista vacia; solo lectura.
- Logs stdout y stderr: sin SQLSTATE 42501/28P01.
- Owners y ACL Auth iguales antes/despues baseline y GoTrue; se normaliza solo el orden de grants.
- Fixtures: 0. Sin backup/restore completo.
- Cleanup verificado por el harness y control posterior: 0 bases y 0 contenedores del harness; 0 archivos temporales sensibles.
- Staging = NONE; Production = NONE; deploy/commit/push = NONE.

## Quality gate

Typecheck NO DISPONIBLE (proyecto JS); audit:repo PASS; lint PASS; tests focales 5/5 PASS; suite 2381 tests/291 archivos PASS; build/audit:prod PASS; sintaxis final PASS; diff-check PASS. Browser/E2E y RLS NO APLICA; Database PASS; Security del cambio PASS; Performance NO APLICA.

CHIEF CODE AUDITOR: Code Review y Adversarial PASS despues de corregir tres P2 (cleanup de creacion con respuesta perdida, captura stderr y exigir exactamente 77 migraciones). Ningun P0/P1/P2/P3 introducido abierto. Cambio posterior de observacion de sesiones a contadores revisado en cierre.

Auditoria nativa de dependencias: FAIL, 24 vulnerabilidades (13 high, 10 moderate, 1 low). Dependencias sin modificar; requiere triage separado. No se amplian excepciones ni autorizaciones de release.

Limites: no se ensayaron kill abrupto/timeout durante creacion; `finally` no se ejecuta ante terminacion forzada. Normalizacion ACL acotada a roles estandar actuales (no nombres con comas). No acredita login, fixtures, aislamiento A/B ni recuperacion integral DB/Auth/Storage.

QUALITY GATE: FAIL
