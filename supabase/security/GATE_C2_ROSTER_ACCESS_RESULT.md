# GATE.C2a — permisos del padrón docente (N1/N2)

2026-10-22. Base release/v1 294a260. Implementación Codex; revisión independiente CHIEF CODE AUDITOR.

## Cambio
- Las asignaciones relacionales autorizan por teacher_id de la sesión, status activo, sin borrado y dentro de fechas nativas. Un legajo anterior u homónimo no sustituye la identidad.
- Cuando una materia/carrera tiene asignaciones relacionales, el snapshot no puede restituir el acceso por vigencia, licencia, baja o reasignación. Se conserva la compatibilidad de materias genuinamente snapshot-only.
- Consulta paginada de asignaciones con fechas nativas, bajas y otras identidades; errores propagan, sin habilitar fallback. Fechas de licencia: ISO exacto y calendario válido como academic_try_iso_date.
- El espejo del portal consulta y usa fechas nativas. Selectores de QA.1 actualizados a las tildes ya presentes en la interfaz, sin saltar comprobaciones.

## Evidencia ejecutada
- Regresión inicial: 12 fallos / 15 pruebas sobre código previo. Revisión independiente encontró además identidad por legajo obsoleto y fechas legacy de UI: ambas regresiones fallaron antes y pasaron después del correctivo.
- Suite completa: 362 archivos / 2784 pruebas PASS; lint y audit:repo PASS; build y audit:prod PASS (120 archivos). VITEST_MAX_WORKERS=4, sin aumentar timeouts ni modificar assertions. Primer intento sin límite de procesos: timeout en matriz SQL, cancelado; la repetición completa pasó.
- Harness HTTP `node scripts/validateTeacherRosterAccessLocal.mjs`: PASS, run e30011cbc96dffad. 13 grupos: permisos temporales, fechas malformadas, bajas, reasignación con legajo obsoleto, institución ajena y rol alumno. GoTrue + PostgREST + Edge reales, exclusivamente local. Cleanup: 0 bases, contenedores y temporales; errores=0.
- Control negativo: mismo harness ejecutado contra 294a260, run 54688f44d94062ff: FAIL esperado en suplencia futura (padrón 1 en vez de 0); cleanup=0. Confirma que el ensayo detecta N1.
- QA.1 navegador: PASS, login/logout y aislamiento de alumno/docente/admin, inscripción/cancelación/reinscripción, notas/asistencia, PB.4 con 409 sin drift. Sin peticiones externas ni excepciones inesperadas, cleanup=0. Primer intento detectó selectores sin tilde desactualizados; corregidos los tres selectores y repetido recorrido completo.
- Auditor independiente: Code Review PASS, sin nuevos P0/P1/P2 tras resolver sus dos hallazgos. Su ejecución propia de Vitest encontró EPERM de caché; revisó diff, pruebas y evidencia HTTP/navegador. Los ensayos ejecutables del principal sí pasaron fuera del sandbox restringido.

## Estado y límites
Typecheck: NO DISPONIBLE (JS/JSX); lint/tests/build/browser: PASS. Database/Auth/Edge local: PASS. RLS: denegación entre instituciones y roles PASS, sin cambios SQL ni recertificación de toda la matriz. Security, Code Review y Adversarial Review del correctivo: PASS. Performance: WARNING, lectura paginada de asignaciones históricas; sin prometer mejoras de rendimiento.

La auditoría npm actual detectó 1 high (Vite) y 7 moderate preexistentes al cambio: quality:deps FAIL. Es un bloqueo separado de dependencias, sin excepción implícita. La serie de herramientas se corrige en otra unidad y requiere repetir quality:full.

N3/N4 (cambio de institución), N5 (avisos SQL), revisión restante del control maestro y aplicación remota siguen pendientes. Ningún SQL remoto, despliegue ni cambio de datos de Producción. Este informe no autoriza desplegar admin-users ni cierra Fase 1.

Estado al registrar 09281ea: QUALITY GATE FAIL por dependencia high abierta; el correctivo funcional N1/N2 y su revisión local estaban aprobados.

## Validación integrada después de DEP.2

Vite actualizado a8.3.5 en unidad separada; ver docs/DEPENDENCY_TRIAGE_2026-10-22.md. Se repitió quality:full completo: exit0, 362 archivos/2784 tests PASS, lint/audit:repo/build/audit:prod PASS (114 archivos), dependencias0 high/critical y7 moderate. Misma configuración de4workers; sin cambios de assertions ni timeouts. El navegador integral se repitió con esta versión: PASS, cleanup0 y sin errores inesperados. Revisión independiente de dependencia y lock: PASS, única directa Vite y transitivas correspondientes; requisitos de Node compatibles con CI22.13.

El fallo inicial de dependencias queda resuelto en la rama integrada. Quedan advertencias por7 moderate inventariadas, tamaño de bundle y límites de verificación local. CI/CodeQL remoto se comprueba después del push. N3/N4/N5, aplicación remota y cierre de Fase1 siguen fuera de esta unidad.

**QUALITY GATE: PASS WITH WARNINGS** para N1/N2+DEP.2 en local; no es autorización de despliegue ni aprobación global de Fase1.
