# AGENTS.md

Contexto permanente para agentes que trabajen en este repositorio.

Leer primero `CLAUDE.md` y `CONSTRAINTS.md`. No debilitar `CONSTRAINTS.md`, tests, lint, auditorias o scripts de calidad para hacer pasar un cambio.

## MANDATORY QUALITY GATE

Esta regla forma parte permanente de la Definition of Done del proyecto y se aplica automaticamente despues de cada modificacion de codigo.

Ninguna tarea que modifique codigo se considera terminada solo porque compila, renderiza visualmente, pasa el happy path, termina el build o pasan algunos tests.

Despues de cada cambio relevante ejecutar, segun corresponda al alcance:

1. Implementacion.
2. Typecheck, si existe para el stack tocado. Este repo principal es JavaScript/JSX puro, sin TypeScript.
3. Lint.
4. Tests relacionados y luego suite completa cuando el cambio pueda afectar flujo compartido.
5. Security review con `security-and-hardening` cuando intervengan usuarios, Auth, permisos, Supabase, base de datos, formularios, uploads, APIs, Edge Functions, RPC, storage o informacion sensible.
6. Database/Supabase review con `supabase` y `supabase-postgres-best-practices` cuando se toque Supabase, PostgreSQL, RLS, RPC, migrations, policies, indexes, constraints, relaciones o queries.
7. Performance review con `performance-optimization` cuando haya queries, listados grandes, multiples requests, payloads pesados, renders costosos, bundles o procesamiento intensivo. Medir antes de declarar una mejora.
8. Browser/real UI review con `browser-testing-with-devtools` o Playwright cuando cambie una interfaz o flujo visible.
9. Observability review con `observability-and-instrumentation` cuando se creen procesos criticos, integraciones o flujos donde diagnosticar fallos aporte valor. Nunca registrar secretos ni datos sensibles innecesarios.
10. Code review con `code-review` y `code-review-and-quality`.
11. Adversarial review con `doubt-driven-development` para cambios no triviales: preguntar como se puede romper la implementacion.
12. Resultado con estado de quality gate.

No ocultar problemas: no borrar tests porque fallan, no debilitar assertions, no agregar suppressions injustificadas, no silenciar errores con `catch {}`, `eslint-disable`, `@ts-ignore`, casts innecesarios o fallbacks silenciosos.

Prioridad de decision:

1. Correccion funcional.
2. Perdida o corrupcion de datos.
3. Seguridad.
4. Regresiones.
5. Integridad de base de datos.
6. Rendimiento.
7. Mantenibilidad.
8. Estilo.

## CHIEF CODE AUDITOR

Para cambios no triviales, crear o invocar un revisor independiente llamado `CHIEF CODE AUDITOR`.

Responsabilidad:

- Trabajar inicialmente en modo read-only.
- Revisar el diff completo y codigo relacionado, no solo las lineas modificadas.
- No asumir que el agente implementador acerto.
- Buscar defectos, regresiones, vulnerabilidades, perdida/corrupcion de datos, inconsistencias frontend/backend, fallos parciales, race conditions, N+1, payloads excesivos, errores silenciosos y fallbacks peligrosos.
- Clasificar hallazgos como P0, P1, P2, P3 o Needs Investigation con evidencia.
- Bloquear P0/P1 introducidos por el cambio hasta que se corrijan y se repita la auditoria.

El agente implementador no debe ser el unico que evalua cambios importantes.

## Required Final Report

Cada tarea que modifique codigo debe terminar informando:

- Archivos modificados.
- Typecheck: PASS / FAIL / NO DISPONIBLE.
- Lint: PASS / FAIL / NO DISPONIBLE.
- Tests: PASS / FAIL / NO DISPONIBLE.
- Build: PASS / FAIL / NO DISPONIBLE.
- Browser/E2E: PASS / FAIL / NO APLICA.
- Database: PASS / FAIL / NO APLICA.
- RLS: PASS / FAIL / NO APLICA.
- Security: PASS / FAIL.
- Performance: PASS / WARNING / NO APLICA.
- Code Review: PASS / FAIL.
- Adversarial Review: PASS / FAIL.
- Hallazgos P0/P1/P2/P3/Needs Investigation.
- Riesgo residual: que no se pudo comprobar.

El estado final debe ser exactamente uno de:

- QUALITY GATE: PASS
- QUALITY GATE: PASS WITH WARNINGS
- QUALITY GATE: FAIL
- QUALITY GATE: CRITICAL FAIL

No usar PASS si existe P0 abierto, P1 abierto, build fallando, test obligatorio fallando, vulnerabilidad grave conocida o riesgo confirmado de corrupcion de datos.

## Production Safety

La auditoria y los tests no autorizan desplegar produccion, modificar datos productivos, borrar datos, aplicar migraciones destructivas, cambiar Auth productivo, cambiar RLS productivo ni modificar secretos salvo pedido expreso del usuario.
