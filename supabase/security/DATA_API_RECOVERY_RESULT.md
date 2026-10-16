# Data API del destino recuperado: validación local

Fecha: 2026-10-15. Tarjeta: https://trello.com/c/5Dwngn8c . Ensayo 5916bdf0f6eaadb9: PASS funcional. quality:full exit0: 2403 pruebas en 298 archivos, lint/build/auditrepo/auditprod114 y auditoría de dependencias PASS. Cero high/critical, nueve moderate y una low inventariadas. Regresiones reales GoTrue e integración: PASS, ambas con cleanup cero.

El harness restaura un único snapshot sintético DB/Auth/Storage y arranca PostgREST v16.1 contra ese destino descartable, usando authenticator y su credencial estándar local, comprobada por TCP. Solo se expone public, con configuración explícita y overrides desde DB desactivados. Puerto aleatorio publicado únicamente en loopback; secreto JWT efímero y credenciales/tokens en memoria, sin variables frontend ni ampliación de permisos.

Los cuatro tokens emitidos por GoTrue después del restore fueron aceptados por PostgREST. Cada cuenta obtuvo su institución (una fila), cero instituciones ajenas y cero membresías ajenas. PATCH sobre institución ajena devolvió 200 con cero filas; una comparación completa de Auth/public/Storage confirmó ausencia de mutaciones. Token inválido:401. GET anónimo directo a /institutions: cero filas. Cinco muestras HTTP correctas, contenedor estable sin reinicios; catálogo, owners/ACL, RLS e historiales conservados. Dos archivos recuperados conservaron tamaño y SHA256.

La prueba detectó una omisión del builder de Auth: faltaban GOTRUE_JWT_DEFAULT_GROUP_NAME y GOTRUE_JWT_AUD. Tres intentos previos quedaron BLOQUEADOS; el tercero acreditó credencial authenticator válida, proceso PostgREST activo y HTTP401/código22023. No se contaron como PASS y su cleanup fue cero. Se fijaron ambos valores a authenticated y se exige el rol al crear usuarios y role/sub correctos en el token restaurado. El ensayo final pasó sin modificar SQL ni grants ni debilitar assertions HTTP. La evidencia previa de integración acreditaba login y aislamiento mediante claims SQL, no acceso Data API con tokens reales.

Fuentes primarias verificadas para la configuración: [PostgREST16](https://docs.postgrest.org/en/stable/references/configuration.html), [GoTrue2.196.0 configuración](https://raw.githubusercontent.com/supabase/auth/v2.196.0/internal/conf/configuration.go) y [creación Admin](https://raw.githubusercontent.com/supabase/auth/v2.196.0/internal/api/admin.go). En esta versión Admin usa DefaultGroupName cuando no se proporciona role.

Backup1359ms,restore26475ms,recuperación completa con API107123ms. Muestra sintética pequeña: no SLA productivo. Archives sobrescritos y cleanup del ensayo final:0DB/containers/volumes/archivos temporales propios. Siete directorios runtime de diagnóstico Docker externos, preservados previamente, permanecen fuera de esta limpieza.

CHIEF independiente: Code Review PASS / Adversarial PASS, sin P0–P3 nuevos. Revisó cambios y corrección de configuración; no ejecutó personalmente los ensayos. Alcance limitado a las tablas y operaciones verificadas, sin certificar toda la API, Edge, navegador ni integraciones externas. Una terminación abrupta puede impedir finally.

Archivos: scripts/localRecoveryConfiguration.mjs y.test.js; scripts/validateStorageLocalHarness.mjs; scripts/validateDataApiRecovery.mjs y.test.js; supabase/security/LOCAL_CONFIGURATION_CONTRACT.md; informe, JSON de evidencia y docs/WORKLOG.md. Cambios previos preservados. Sin Staging/Production/SQL remoto/deploy/commit/push. QUALITY GATE global de release: FAIL por aceptación pendiente.

Typecheck: NO DISPONIBLE (JS). Lint: PASS. Tests: PASS. Build: PASS. Browser/E2E: NO APLICA; API HTTP real PASS. Database: PASS local. RLS: PASS para operaciones verificadas. Security: PASS local. Performance: WARNING (fixture pequeño). Code Review: PASS. Adversarial Review: PASS.


