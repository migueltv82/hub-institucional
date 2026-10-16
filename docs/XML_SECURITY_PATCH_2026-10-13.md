# XML / Mammoth security patch - 2026-10-13

XML PATCH - PASS LOCAL. QUALITY GATE: FAIL global3high.

Unico delta lock @xmldom/xmldom0.8.13->0.8.15; Mammoth1.12.0 y manifest intactos, rango^0.8.6 compatible; sin override/salto0.9. Registryoficial/SHA512/engines>=10 compatiblesNode24.12. npm ls PASS.

Fuente: https://github.com/xmldom/xmldom/releases/tag/0.8.15 confirma correcciones de complejidad de namespaces/atributos/endtags/recovery y validacion serializer/entity. APIs/constantes/parser Mammoth revisados. XML malformado antes tolerado puede reportar error que Mammoth rechaza con errorHandler; comportamiento de seguridad esperado, no regresion detectada en DOCX valido.

Suite2381/291 incluyendo import PASS; lint/audit:repo/build/audit:prod114files PASS; CHIEF CODE AUDITOR CodeReview/Adversarial PASS sin nuevos hallazgos. Smoke REAL memoria: XML con namespace/entidad ampersand, serialize conserva escape, entityname invalido rechazado; DOCX sintetico ZIP convertido con Mammoth.extractRawText y convertToHtml preserva texto/escape PASS. Sin archivos sensibles ni red. No benchmark ni explotacion DoS grande.

Audit14vulnerabilidades(3high/10moderate/1low), antes15(4high); xmldom fueraadvisories. Restantes high:brace-expansion,browserslist,js-yaml. Typecheck NO DISPONIBLE; Browser/E2E,Database,RLS,Performance NO APLICA(parche parser, no UI); Security del cambio PASS. Staging/Production/deploy/DR/fixtures/commit/push=NONE. Residual3high y no corpusDOCX institucionalreal ensayado.

QUALITY GATE: FAIL
