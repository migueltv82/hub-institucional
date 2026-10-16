# React Router security patch - 2026-10-13

REACT ROUTER PATCH - PASS LOCAL. QUALITY GATE: FAIL global6high.

package.json pin react-router-dom7.18.4; lock solo react-router-dom y react-router7.14.1->7.18.4 contra snapshots previos. Node>=20 y React>=18 compatibles24.12/19; npm ls PASS. Fuentes registry oficial/SHA512, sin otros paquetes cambiados.

Fuentes primarias: https://raw.githubusercontent.com/remix-run/react-router/react-router@7.18.4/CHANGELOG.md ; https://github.com/remix-run/react-router/security/advisories/GHSA-wrjc-x8rr-h8h6 (fix>=7.18.0); https://github.com/remix-run/react-router/security/advisories/GHSA-qwww-vcr4-c8h2 (fix7.18.2, soloRSC). Aplicacion usa BrowserRouter declarativo, noSSR/RSC; no se presume explotabilidad de cada advisory. App/Auth/permisos/SQL intactos.

Gate:18tests focales/5archivos PASS; suite2381/291 PASS; lint/audit:repo/build/audit:prod114files PASS; CodeReview/Adversarial CHIEF CODE AUDITOR PASS sin P0-P3 nuevos.

Browser REAL Chrome via Playwright aislado: /,/app,/app/primario,/super-admin,/super-admin/instituciones,/unknown-router-check -> /login PASS; login desktop1366 y mobile390 visible; pageerrors0, externalrequests0. Auth habilitado pero backend sin configurar por env del proceso de prueba; no sesiones ni credenciales reales. Navegador y servidor propios cerrados. Login autenticado real no probado; roles cubiertos por focales. Chromium headless-shell no disponible, se uso Chrome instalado con perfil temporal, sin downloads.

Audit actual17vulnerabilidades(6high/10moderate/1low), antes19(8high); react-router/react-router-dom ya no figuran vulnerables. Typecheck NO DISPONIBLE; Browser/E2E PASS en alcance descrito; Database/RLS NO APLICA; Security del cambio PASS; Performance NO APLICA. Riesgos residuales:6high restantes, sin e2eAuth real. Staging/Production/deploy/DR/fixtures/commit/push=NONE.

QUALITY GATE: FAIL
