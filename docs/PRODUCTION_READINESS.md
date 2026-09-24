# Preparación para producción

Fecha de definición: 2026-09-23. Aplica exclusivamente a este repo (`examenes`, React + Vite + JavaScript), sin cambio de stack.

Este documento define la puerta de salida del primer release; **no certifica que el producto ni una base remota ya estén listos**. La revisión del código confirma caminos implementados, pero su funcionamiento integrado y el SQL desplegado requieren evidencia del ambiente elegido. Los documentos históricos y sus conteos de tests no sustituyen esa evidencia.

### Brechas verificadas en este checkout

- El README histórico referencia `supabase/setup_multi_tenant/` y `supabase/security/rls_negative_tests.sql`, pero esas rutas no están presentes. No seguirlas como instrucciones ejecutables ni traer SQL de otro repo sin revisar compatibilidad.
- La [guía del esquema disponible](../supabase/schema/00_README.md) documenta bloques operativos y pendientes de tablas/RPC de mesas. Hay reparaciones puntuales en `supabase/docs/`, pero su existencia no acredita una instalación completa ni su aplicación remota.
- Por lo tanto, falta acreditar un procedimiento reproducible de base compatible y pruebas negativas ejecutables para este checkout. Son bloqueos de salida hasta resolverlos y adjuntar evidencia; no se corrigen en esta entrega documental.

## MVP de producción

Primer release: piloto institucional controlado, con instituciones y operadores identificados, un período de mesas regulares y planillas previamente revisadas. Debe completar todos los casos de [alcance obligatorio](PRODUCTION_SCOPE.md):

- `admin_instituto`: acceder a su institución, cargar y recuperar el workspace, revisar el armado de mesas y publicar el cronograma confirmado.
- `alumno`: consultar sus materias y calificaciones e inscribirse a una mesa publicada únicamente cuando la condición académica admitida sea `regular`.
- `docente`: consultar materias y roster propios, registrar asistencia y nota/condición, y participar en la revisión de sus mesas.
- `superadmin`: administrar instituciones y accesos, bloquear usuarios y restablecer contraseñas mediante las operaciones servidor existentes.

El aislamiento entre instituciones, la persistencia remota y el rechazo de operaciones no autorizadas son parte del MVP. Una demo local, un mensaje de éxito o una exportación aislada no acreditan esos requisitos.

## Ambientes

| Ambiente | Uso y datos | Condición de validación |
| --- | --- | --- |
| Local demo | Desarrollo y capacitación con datos ficticios; `VITE_DISABLE_AUTH=true`. | Valida navegación y ejemplos locales. No acredita Auth, RLS, Storage, Edge Functions ni persistencia compartida. |
| Staging (recomendado) | Frontend y proyecto Supabase separados de producción, Auth real, datos sintéticos y dos instituciones de prueba. | Ejecutar el alcance completo con la versión candidata, SQL compatible y `admin-users` desplegada. No copiar datos personales de producción. |
| Producción | Dominio definitivo, proyecto y secretos propios, datos institucionales autorizados; `VITE_DISABLE_AUTH=false`. | Verificar configuración y despliegue reales, luego una prueba breve controlada por rol. No ejecutar scripts destructivos ni pruebas masivas sobre datos reales. |

Si no existe staging, registrar el ambiente remoto aislado equivalente usado para las pruebas. Validar solo en modo demo implica **no-go**. Nunca compartir credenciales entre ambientes ni versionar `.env` reales. El frontend recibe únicamente configuración pública; las credenciales privilegiadas permanecen del lado servidor.

## Configuración obligatoria del frontend en Vercel

Las únicas variables de la app aprobadas para el frontend son:

| Variable | Valor de producción |
| --- | --- |
| `VITE_SUPABASE_URL` | URL pública del proyecto Supabase del ambiente destino. |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Clave publicable del mismo proyecto; nunca `service_role` ni clave secreta. |
| `VITE_DISABLE_AUTH` | `false`. |

Usar [.env.example](../.env.example) como plantilla pública. No copiar variables de scripts administrativos ni flags internos al proyecto frontend. Revisar Production y Preview por separado y reconstruir el despliegue después de cambiar variables. La compatibilidad legacy con `VITE_SUPABASE_ANON_KEY` no amplía esta lista aprobada.

Los guards bloquean `VITE_DISABLE_AUTH=true` en producción y nombres privados `VITE_*SERVICE_ROLE*` no vacíos, antes de montar React y antes de crear el cliente Supabase. Esto no sustituye revisar el contenido de la clave pública, el proyecto destino ni retirar/rotar un secreto ya publicado. Ver los detalles, tests y headers en [configuración de seguridad](SECURITY.md#únicas-variables-del-frontend-en-vercel).

## Checklist go/no-go

Cada casilla requiere responsable, fecha, ambiente, versión y enlace a evidencia sin secretos ni datos personales. Una casilla pendiente o fallida bloquea el go. Las mejoras expresamente excluidas del alcance no bloquean; un flujo obligatorio incompleto sí.

### Seguridad — responsable técnico

- [ ] Probar los cuatro roles, acceso por URL directa, sesión vencida, usuario bloqueado y usuario sin membresía válida. Verificar rechazo servidor, además del comportamiento visual.
- [ ] Con usuarios de dos instituciones, intentar lectura y escritura cruzadas de padrones, snapshots, notas, inscripciones y archivos. No debe haber acceso cruzado; probar también un docente sobre una materia ajena y un alumno sobre otro alumno.
- [ ] Disponer de pruebas negativas ejecutables de RLS y Storage compatibles con este esquema y ejecutarlas en el ambiente de prueba, conservando casos y resultados sin fallos. El script histórico `rls_negative_tests.sql` está ausente: no afirmar `SECURITY_TESTS_OK` sin una ejecución real. Los [diagnósticos disponibles](../supabase/security/2026-09-05_security_diagnostics.sql) no sustituyen las pruebas de acceso con roles reales.
- [ ] Validar `admin-users`: acciones autorizadas funcionan; solicitudes sin autenticación, con rol incorrecto o institución ajena se rechazan. Verificar orígenes permitidos conforme a la [guía de despliegue](../supabase/docs/deploy_admin_users.md). Que la función responda no acredita su autorización.
- [ ] Revisar configuración del build y ausencia de secretos en archivos versionados, bundle y evidencias. No exponer `service_role` ni activar modo demo en producción.
- [ ] Verificar en Vercel las tres variables públicas de la sección anterior, generar un despliegue con esa configuración y comprobar arranque remoto y headers HTTP reales. No acreditar este punto solo con un build local o de CI.
- [ ] Resolver la entrega segura y el cambio de credenciales iniciales antes del acceso real. Los flujos documentados usan DNI como contraseña inicial: no considerar ese valor una credencial definitiva ni asumir que existe cambio obligatorio automático. Si el procedimiento seguro no puede completarse, no-go.

### Datos — responsable institucional y técnico

- [ ] Validar planillas, carreras, códigos de materia, identidades de alumno/docente y asignaciones con el operador. Registrar volumen del piloto y resolver duplicados o vínculos ambiguos antes de publicar.
- [ ] Completar los casos P01–P06 de [alcance](PRODUCTION_SCOPE.md), incluyendo recarga y lectura desde otra sesión. Contrastar snapshot y registros académicos remotos; no aceptar éxito basado únicamente en caché local.
- [ ] Verificar rechazo servidor de inscripción sin condición `regular`, persistencia sin duplicados al reintentar y correspondencia exacta de materia, carrera y alumno.
- [ ] Inventariar el SQL necesario desde la [guía del esquema disponible](../supabase/schema/00_README.md), incluyendo las reparaciones operativas necesarias, y contrastar tablas, firmas RPC, permisos y políticas con el ambiente real. Resolver los pendientes de mesas y documentar el orden reproducible de instalación. Registrar diferencias y verificaciones posteriores; un archivo SQL en git no demuestra aplicación.
- [ ] Obtener un respaldo previo a la salida y ensayar restauración en un ambiente aislado. Cubrir base, archivos de Storage y configuración necesaria; registrar tiempo medido y pérdida de datos máxima aceptada por la institución.

### Operación — responsable de despliegue

- [ ] Aplicar y verificar las [reglas de protección de `main`](BRANCH_PROTECTION.md): PR revisado, CI verde y configuración manual de GitHub acreditada. La existencia del workflow no demuestra protección activa.
- [ ] Ejecutar `npm.cmd run check` sobre la versión candidata y conservar salida completa. Incluye auditoría del repo, lint, tests, build y auditoría de producción; si corta antes del build, la validación está incompleta.
- [ ] Verificar dominio HTTPS, rutas SPA al recargar, configuración Auth y conectividad de frontend, Storage y `admin-users` en el destino. Registrar versión del frontend y de la función.
- [ ] Probar carga, generación y lectura con el volumen acordado del piloto; registrar tiempos y límites aceptados. No prometer capacidad no medida.
- [ ] Probar fallos de red y errores de guardado: deben ser visibles, permitir recuperación y no presentarse como operaciones persistidas exitosamente.
- [ ] Definir quién revisa errores del frontend, Auth, RPC y Edge Function, dónde se registran incidentes y cómo se detecta una caída. No presuponer alertas automáticas existentes.
- [ ] Registrar versión anterior recuperable, pasos y responsable de reversión. Distinguir reversión del frontend/función de restauración de datos; no ejecutar rollback SQL genérico sin revisar su impacto.

### Soporte — responsable del piloto

- [ ] Designar contacto institucional y técnico, canal, horario de atención y procedimiento para incidencias de acceso, inscripción o nota incorrecta.
- [ ] Capacitar al operador en revisión antes de publicar, errores de importación, recuperación de acceso y escalamiento. Usar el [runbook](RUNBOOK.md) y el [checklist funcional](TESTING_CHECKLIST.md) como apoyo.
- [ ] Acordar tratamiento de datos personales, acceso de soporte y conservación de evidencias. Revisar los [borradores legales](legal/README.md); su existencia no equivale a aprobación institucional.
- [ ] Registrar aprobación del responsable institucional y técnico, sin incidentes bloqueantes abiertos, antes de habilitar usuarios reales.

## Resultado esperado de la puerta de calidad local

Comando obligatorio antes de merge a `main` y antes de desplegar: `npm run check` (en Windows/PowerShell, `npm.cmd run check`). Seguir el [procedimiento del runbook](RUNBOOK.md#puerta-de-calidad-obligatoria-antes-de-merge-y-despliegue).

| Etapa | Resultado exigido |
| --- | --- |
| `audit:repo` | `[repository-security-audit] OK`, sin relajar controles de secretos. |
| `lint` | ESLint sin errores. |
| `test` | Vitest sin fallos; revisar tests omitidos y conservar el resumen real. |
| `build` | Vite genera `dist/` y la auditoría incluida termina con `[production-build-audit] OK`. |
| `check` completo | Código de salida `0`; ninguna etapa pendiente. |

Referencia histórica verificada por lectura de README/CLAUDE.md: aproximadamente **1600 tests**, detallados allí como 1602 pasando y 2 omitidos (1604 total), en 166 archivos, con build OK. Es una referencia documental anterior, **no evidencia de que esa suite pase hoy**. No usar esos números como umbral fijo ni actualizar el conteo contando archivos: registrar el resumen de una ejecución real. Las advertencias históricas por tamaño de chunks no equivalen a un fallo; cualquier error o salida no cero sí bloquea.

### Ejecución local observada — 2026-09-23

Checkout basado en `c689e59`, con cambios documentales locales; Windows, Node `v25.8.0`, npm `11.11.0`. Esta observación no declara esas versiones como matriz de soporte ni acredita un entorno remoto.

| Comando / etapa | Resultado observado |
| --- | --- |
| `npm.cmd run check` | Falló, código `1`, durante Vitest. No apto para merge/despliegue. |
| `audit:repo` dentro de check | OK. Reglas y excepciones sin cambios. |
| `lint` dentro de check | OK. |
| Vitest dentro de check | 2184 tests aprobados y 7 fallidos, 2191 total; 271 archivos aprobados y 5 fallidos, 276 total. Aproximadamente 2200 tests en esta ejecución. |
| Build dentro de check | No ejecutado: la cadena cortó por los tests. |
| `npm.cmd run build`, ejecutado por separado | OK, código `0`; Vite generó `dist/` y `audit:prod` aprobó 136 archivos. Advertencias de tamaño de chunks y tiempo de plugins, sin error de build. |

Fallos que deben resolverse antes de repetir la puerta completa:

- [frontendSupabaseWritePosture.test.js](../src/services/frontendSupabaseWritePosture.test.js): 1 fallo; detecta escrituras directas fuera de la lista explícita en `deletedPersonRecords.js`, `examEngineV21State.js` y `legacyExamSessions.js`. Requiere revisión del contrato de escrituras, no ampliar excepciones para ocultar el fallo.
- [subjectEnrollments.test.js](../src/services/subjectEnrollments.test.js): 2 fallos por uso de `select('*')` donde se exigen columnas explícitas.
- [subjectTeacherAssignments.test.js](../src/services/subjectTeacherAssignments.test.js): 2 fallos por el mismo contrato de columnas explícitas.
- [fetchAcademicRelationalTables.test.js](../src/utils/examEngine/relationalSource/fetchAcademicRelationalTables.test.js): 1 fallo por selección `*`.
- [workspaceSnapshotLocalPreference.test.js](../src/services/workspaceSnapshotLocalPreference.test.js): 1 fallo; espera una llamada y observa cuatro en la prueba de deduplicación. La salida también informa `query.is is not a function` en el doble de consulta; requiere diagnosticar el contrato del mock y la lectura antes de cambiar la expectativa.

Los scripts existen y ejecutan sus herramientas; los fallos observados son aserciones de tests del producto, no un comando roto. Esta tarea documental no modifica runtime, tests ni controles para forzar un resultado verde. El build aprobado por separado **no convierte el check fallido en aprobado**. Reemplazar esta evidencia con una nueva ejecución completa tras resolver los fallos.

## Registro de decisión

Copiar esta ficha en el registro de la entrega y completar; no guardar contraseñas, tokens ni listados nominales.

| Campo | Valor a completar |
| --- | --- |
| Versión candidata / fecha | Pendiente |
| Ambiente y despliegue verificados | Pendiente |
| Instituciones, período y volumen del piloto | Pendiente |
| Responsable técnico / institucional / soporte | Pendiente |
| Evidencia de check, P01–P06 y seguridad | Pendiente |
| SQL y Edge Function contrastados con el destino | Pendiente |
| Respaldo, restauración y reversión | Pendiente |
| Incidentes abiertos y riesgos aceptados | Pendiente |
| Decisión go/no-go y aprobadores | Pendiente: no habilitar hasta completar |

## Fuera del primer release

- Reescritura a TypeScript/Next o adopción del stack de otro repo.
- Lanzamiento masivo sin acompañamiento, escala o disponibilidad garantizadas sin mediciones.
- Motores alternativos, comparativas, rutas de preview interno y escenarios experimentales como caminos operativos soportados.
- Generación sin revisión humana, resolución automática de cualquier incompatibilidad o garantía de encontrar un cronograma para datos inviables.
- Mesas libres/especiales y reglas académicas adicionales no verificadas en el circuito regular de este alcance.
- Actas oficiales, firma digital, simulación del día de examen y cierre integral de mesa con trazabilidad certificada de su nota. El registro académico de notas existente no acredita ese circuito.
- Inscripción automática completa a carreras/cursadas y previews de ofertas académicas como requisito del release. El roster usa inscripciones a materias preparadas por el operador.
- Pagos, facturación, integraciones externas, notificaciones automáticas y recuperación autoservicio de contraseñas como compromisos del MVP.

Estas exclusiones delimitan el compromiso de salida; no afirman que cada funcionalidad esté ausente del repositorio. Ampliar el alcance exige nuevos casos de aceptación y evidencia.
