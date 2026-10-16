# Undici security patch - 2026-10-13

UNDICI PATCH - PASS LOCAL. QUALITY GATE: FAIL global4high.

Unico delta lock undici7.25.0->7.30.0. Padrejsdom29.1.0/rango^7.25.0 y manifest intactos. Engines>=20.18.1 compatiblesNode24.12; npm ls PASS; registryoficial/SHA512. Sin salto8 ni overrides. APIs jsdom Dispatcher/DecoratorHandler/getGlobalDispatcher/fetch/WebSocket/internalhandlers revisadas por auditor.

Fuentes: https://github.com/nodejs/undici/releases/tag/v7.29.1 (correccionesTLS/cache/cookies/DoS/retry/streams); https://github.com/nodejs/undici/releases/tag/v7.30.0 (backpressure/lifecycle/cierreHTTP2WebSocket). Actualiza paquete npm instalado, no Undici integrado en Node.

Suite2381/291 DOM PASS; lint/audit:repo/build/audit:prod114files PASS; CodeReview/Adversarial CHIEF CODE AUDITOR PASS sin hallazgos nuevos. SmokeHTTP REAL loopback Pool3requests chunkedJSON, status/header/body correctos y pool/servidor propios cerrados PASS; sinredexterna/datosreales. TLS/cache ataques no reproducidos.

Audit15vulnerabilidades(4high/10moderate/1low), antes16(5high); Undici fueraadvisories. Typecheck NO DISPONIBLE; Browser/E2E,Database,RLS,Performance NO APLICA; Security del cambio PASS. Sin app/Auth/SQL/remoto/DR/fixtures/deploy/commit/push. Staging/Production=NONE. Residual4high bloqueanrelease.

QUALITY GATE: FAIL
