# ws security patch - 2026-10-13

WS PATCH - PASS LOCAL. QUALITY GATE: FAIL global por dependencias restantes.

Delta contra lock posterior a Vite: unicamente node_modules/ws8.20.0->8.22.0. package.json intacto respecto de microtarea ws. Padre @supabase/realtime-js2.104.0 rango^8.18.2; @supabase/supabase-js2.104.0 intacto. Registry npm oficial y SHA512; engines>=10 compatibleNode24.12.0; peers opcionales sin cambios. npm ls ws PASS.

Advisory primario: https://github.com/websockets/ws/security/advisories/GHSA-96hv-2xvq-fx4p, fix>=8.21.0 en major8. Changelog: https://github.com/websockets/ws/releases/tag/8.22.0 (opcion protocols y close con argumentos invalidos). No overrides globales ni upgrade Supabase/major.

Validacion: suite2381tests/291archivos PASS, lint/audit:repo/build/audit:prod(114files) PASS; CodeReview/Adversarial CHIEF CODE AUDITOR PASS sin hallazgos nuevos. Smoke WebSocket REAL loopback: echo con2fragmentos PASS y exceso3fragmentos con maxFragments2 rechazado por WS_ERR_TOO_MANY_BUFFERED_PARTS PASS; sockets/servidores propios cerrados. Primera expectativa de smoke usaba otro nombre de error; se corrigio tras comprobar receiver.js publicado, sin modificar dependencia ni debilitar el rechazo. No prueba Realtime Supabase remoto.

Typecheck NO DISPONIBLE; Browser/E2E NO APLICA(interfaz intacta); Database/RLS NO APLICA; Security del cambio PASS; Performance NO APLICA. npm audit posterior19vulnerabilidades(8high/10moderate/1low), antes20(9high). ws ya no figura vulnerable. Permanecen high @xmldom/xmldom,brace-expansion,browserslist,js-yaml,react-router,react-router-dom,tmp,undici.

No cambios app/Auth/SQL/secrets/config/remoto/DR/fixtures/deploy/commit/push. Staging/Production=NONE. Riesgo residual: otras8high bloquean release y dependencia nativa vieja bloqueada ya registrada en parche Vite. Evidencia global de tests/build no reemplaza una prueba remota Realtime.

QUALITY GATE: FAIL
