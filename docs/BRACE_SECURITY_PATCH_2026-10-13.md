# Brace-expansion security patch - 2026-10-13

BRACE PATCH - PASS LOCAL. QUALITY GATE: FAIL global2high.

Unicos deltas lock: ramas1.1.14->1.1.21 y2.1.0->2.1.7; padres/manifest intactos. Resolucion minimatch3/ESLint plugin a1.1.21 y minimatch5/readdir-glob/ExcelJS a2.1.7 compatible, sin hoisting entre ramas. Registryoficial/SHA512 y npm ls PASS.

Fuente https://github.com/juliangruber/brace-expansion/security/advisories/GHSA-q2hr-2g5m-vwhr. Limites de cantidad/longitud/profundidad/rewrites, patrones extremos pueden truncarse/devolverse literales como proteccion documentada.

Suite2381/291, lint/audit:repo/build/audit:prod114files y CHIEF CODE AUDITOR CodeReview/Adversarial PASS; sin hallazgos nuevos. Smoke ambas ramas instaladas: secuencias, padding, nesting y rewrite adversarial acotado(2000llaves) PASS. No benchmark comparativo ni payload DoS grande.

Audit13vulnerabilidades(2high/10moderate/1low), antes14(3high); brace fueraadvisories. Typecheck NO DISPONIBLE; Browser/E2E,Database,RLS,Performance NO APLICA; Security del cambio PASS. Sinapp/Auth/SQL/remoto/DR/fixtures/deploy/commit/push. Staging/Production=NONE. Residual2high, moderate/low inventariados. Limite temporal de permisos interrumpio primero smoke/auditor, ambos reanudados y finalizados tras continuacion del usuario.

QUALITY GATE: FAIL
