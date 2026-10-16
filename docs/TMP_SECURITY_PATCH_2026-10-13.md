# tmp security patch - 2026-10-13

TMP PATCH - PASS LOCAL. QUALITY GATE: FAIL global5high.

Unico delta lock tmp0.2.5->0.2.7; ExcelJS4.4.0 y manifest intactos, rango^0.2.0 compatible; registry/SHA512/engines>=14.14 compatiblesNode24.12. npm ls PASS.

Fuentes: https://github.com/raszi/node-tmp/security/advisories/GHSA-ph9p-34f9-6g65 (path traversal,fix0.2.6); https://github.com/raszi/node-tmp/security/advisories/GHSA-7c78-jf6q-g5cm (type confusion bypass,fix0.2.7); https://github.com/raszi/node-tmp/releases/tag/v0.2.7. Changelog escaso; no se atribuyen detalles no publicados. ExcelJS usa tmp.file(callback) sin opciones y setGracefulCleanup; contratos revisados.

Suite2381/291 incluyendo import/export PASS; lint/audit:repo/build/audit:prod114files PASS; CHIEF CODE AUDITOR CodeReview/Adversarial PASS sin hallazgos nuevos. Smoke REAL tmp.fileSync y roundtrip XLSX(write/read) con contenido sintetico PASS y archivo propio eliminado(cleanup0).

Audit posterior16vulnerabilidades(5high/10moderate/1low), antes17(6high); tmp fuera advisories. Typecheck NO DISPONIBLE; Browser/E2E,Database,RLS,Performance NO APLICA; Security del cambio PASS. Sin cambiosapp/Auth/SQL/UI/DR/fixtures/secrets/remoto/deploy/commit/push. Staging/Production=NONE. Residual5high y sin explotacion adversarial de traversal ejecutada (parche acreditado por advisory y smoke positivo).

QUALITY GATE: FAIL
