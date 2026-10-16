# Browserslist security patch - 2026-10-13

BROWSERSLIST PATCH - PASS LOCAL. QUALITY GATE: FAIL global1high.

Browserslist4.28.2->4.29.3 y cinco dependencias requeridas: baseline-browser-mapping2.10.20->2.11.28,caniuse-lite1.0.30001788->1.0.30001816,electron-to-chromium1.5.340->1.5.453,node-releases2.0.37->2.0.58,update-browserslist-db1.2.3->1.3.4. Padres Babel/helper/lint y manifest intactos. Registry/SHA512/semver compatibles; node-releases exigeNode>=18, entorno24.12 cumple. npm ls PASS.

Fuentes https://github.com/browserslist/browserslist/releases/tag/4.29.1 (proteccion config Windows) y /4.29.3 (FirefoxESR). Datasets pueden cambiar targets dinamicos y transformaciones; no se afirma optimizacion.

Suite2381/291, lint/audit:repo/build/audit:prod114files PASS; CHIEF CODE AUDITOR CodeReview/Adversarial PASS sin hallazgos nuevos. Smoke targets explicitosChrome120/Firefox121, lastChrome/negacion y queryinvalida rechazada PASS; datos locales, sin red externa. Auditor tambien comprueba integracion Babel.

Audit11vulnerabilidades(1high/9moderate/1low), antes13(2high/10moderate/1low); browserslist y baseline-browser-mapping fueraadvisories. Pendientehigh js-yaml. Typecheck NO DISPONIBLE; Browser/E2E,Database,RLS,Performance NO APLICA; Security del cambio PASS. Staging/Production/deploy/DR/fixtures/commit/push=NONE. Residualdatasets y moderate/low.

QUALITY GATE: FAIL
