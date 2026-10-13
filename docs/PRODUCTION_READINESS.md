# Preparación para producción

## Estado vigente y límites del release

Production sigue **NO-GO**. Baseline local descartable PASS: 9 SQL canónicos aplicados y 40 tablas public con RLS; Staging aplicado/verificado según [baseline](../supabase/baseline/STAGING_BASELINE_RESULT.md) y [validación local](../supabase/baseline/LOCAL_AB_RLS_RPC_RESULT.md). Portal Docente v1 read-only certificado en Staging; confirmación, objeción, reasignación y reconciliación docente quedan DIFERIDAS post-v1, sin exigirlas como aceptación v1.

La RPC de inscripción ya existe y está validada: JWT del usuario mediante `context.userClient`, con `auth.uid() = actor_user_id = target_student_id` y validación de profile/membership/legajo tenant-workspace. No hay bypass operativo `adminClient`/`service_role` para ese flujo; ver [contrato vigente](contracts/upsert_exam_enrollment_from_portal.md).

Las descripciones posteriores de Staging no inicializado, baseline parcial, RPC ausente y hardening sin aplicar son **HISTÓRICAS / SUPERADAS** para el alcance certificado; se conservan como trazabilidad. No cerrar automáticamente las casillas de aceptación integral. Branch protection remota sigue no verificada/configurada; backup/restore, rollback, observabilidad, E2E/UAT y release closure siguen pendientes. Vercel tiene readiness técnica READY, sin deploy acreditado. `EX-001` vence 2026-10-17 y no cubre fechas posteriores sin nueva validación. Git → local → Staging → QA → aprobación humana → Production sigue siendo la secuencia de promoción; esta nota no autoriza Production.

Fecha de definición: 2026-09-24. Aplica exclusivamente a `migueltv82/hub-institucional` (paquete npm `examenes`, React + Vite + JavaScript), sin cambio de stack.

Este documento define la puerta de salida del primer release; **no certifica que el producto ni una base remota ya estén listos**. La revisión del código confirma caminos implementados, pero su funcionamiento integrado y el SQL desplegado requieren evidencia del ambiente elegido. Los documentos históricos y sus conteos de tests no sustituyen esa evidencia.

### Brechas históricas del checkout — separar de los gates vigentes anteriores

- Documentación histórica del proyecto referencia `supabase/setup_multi_tenant/` y `supabase/security/rls_negative_tests.sql`, pero esas rutas no están presentes. No seguirlas como instrucciones ejecutables ni traer SQL de otro repo sin revisar compatibilidad.
- La [guía del esquema disponible](../supabase/schema/00_README.md) documenta bloques operativos y pendientes de tablas/RPC de mesas. Hay reparaciones puntuales en `supabase/docs/`, pero su existencia no acredita una instalación completa ni su aplicación remota.
- Existe una prueba SQL focalizada de visibilidad de mesas del alumno en [`student_portal_exam_visibility_tests.sql`](../supabase/security/student_portal_exam_visibility_tests.sql). No sustituye una batería negativa completa para todas las tablas, RPC, Storage y roles.
- La auditoría documental 02.1 dejó inventariados 34 scripts SQL locales en [SECURITY_LOW_RISK_APPLY_CHECKLIST.md](SECURITY_LOW_RISK_APPLY_CHECKLIST.md): 12 de lectura/validación y 22 con mutaciones reales, propuestas o capacidades mutantes. El inventario está preparado para revisión y staging, pero **no acredita** SQL aplicado local, staging aprobado ni producción actualizada.
- La auditoría 02.3 confirmó una vulnerabilidad en la fuente SQL versionada anterior: `handle_new_user()` copiaba `raw_user_meta_data.account_role` a `profiles.account_role`. El checkout actual prepara el hardening para dejar de confiar en metadata editable por cliente y caer a `alumno` como rol mínimo, pero **no acredita** que ese SQL ya esté aplicado en ningún Supabase remoto.
- La auditoría 02.4 dejó una [matriz local de funciones y RPC](SECURITY_FUNCTION_MATRIX.md): 57 definiciones SQL versionadas, 47 `SECURITY DEFINER` y 36 RPC invocadas desde frontend/servicios/Edge Function. No encontró P0/P1 nuevo local, pero sí 12 RPC invocadas sin definición SQL local auditable; esas firmas deben verificarse contra staging/remoto antes de cualquier go.
- La etapa 02.5 ya pudo ejecutar discovery remoto read-only contra `Hub-Institucional`, dentro de transacciones `READ ONLY` con `ROLLBACK`. [SUPABASE_DRIFT_AUDIT.md](SUPABASE_DRIFT_AUDIT.md) deja el estado en **ETAPA 02.5 BLOQUEADA — DRIFT DE SEGURIDAD**: `handle_new_user()` remoto conserva la vulnerabilidad 02.3, las 12 RPC investigadas están ausentes en remoto, y RLS/Storage fueron inventariados pero no probados negativamente por rol/tenant.
- La remediación 02.5-R queda cerrada como bloqueo de autenticación: la CLI volvió a tener acceso al proyecto vinculado y el `403` no persiste. No repetir `supabase link`; el próximo paso seguro es staging aislado, respaldo y aplicación controlada de correcciones, no mutación automática del remoto actual.
- La etapa 02.7 confirmó que `Hub-Institucional-Staging` existe como proyecto Supabase separado, `ACTIVE_HEALTHY`, en la misma región `sa-east-1`, con ref distinta a production (`lzjp…aeco` frente a `qwrw…mibx`). El link local sigue apuntando a production y no se modificó. Staging está aislado, pero todavía no tiene schema del Hub, seeds sintéticos, bucket validado, Auth configurado ni Edge Function desplegada; por lo tanto no levanta ningún bloqueo de producción.
- La etapa 02.8A creó [BASELINE_READINESS.md](BASELINE_READINESS.md) y [BASELINE_MANIFEST.md](../supabase/baseline/BASELINE_MANIFEST.md). El baseline queda **parcial con bloqueos**: no hay implementación autoritativa localizada para `get_academic_transition_config` ni `upsert_exam_enrollment_from_portal`, y el modelo canónico de mesas todavía debe reconciliarse. No se creó SQL ejecutable de baseline ni migrations.
- Hay al menos un script de riesgo CRÍTICO (`repair_02_student_records_duplicate_upsert_keys.sql`) porque fusiona/elimina duplicados; no puede ejecutarse sin respaldo recuperable y restauración ensayada.
- Hay reparaciones históricas duplicadas o candidatas a obsoletas frente a `supabase/schema/` (`repair_05_*`, `repair_07_*`) y un archivo de schema (`05_student_portal_secure_read.sql`) fuera del orden canónico documentado. Deben reconciliarse antes de cualquier aplicación.
- Las policies locales usan `is_member_of_institution(institution_id)` para lectura de snapshots y varias tablas académicas. Ese predicado separa instituciones, pero no limita por rol dentro del tenant: un alumno o docente autenticado puede conservar acceso REST directo a conjuntos más amplios que los RPC de portal. Es un **bloqueo de producción** hasta demostrar y aplicar mínimo privilegio por recurso.
- `is_member_of_institution` comprueba membresía y perfil no bloqueado, pero no el estado de `institutions`. Marcar una institución como `suspended` no acredita que sus sesiones existentes pierdan acceso a datos; debe corregirse o existir otro control servidor verificable antes del go.
- La pantalla actual de Super Admin llamada “Auditoría” compara snapshot y padrones. Los RPC y la Edge Function escriben `admin_audit_logs`, pero no se comprobó una interfaz operativa que consulte ese historial; no presentar el control de drift como auditoría de acciones administrativas.
- Por lo tanto, falta acreditar un procedimiento reproducible de base compatible y pruebas negativas integrales ejecutadas contra staging. Son bloqueos de salida hasta resolverlos y adjuntar evidencia; no se corrigen en esta entrega documental.

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
| Desarrollo/local | Trabajo diario contra servicios locales o un proyecto Supabase de desarrollo, con `VITE_DISABLE_AUTH=false` cuando se valida integración. | Ejecutar checks automáticos y pruebas funcionales sin datos reales; registrar qué servicios son locales y cuáles remotos. No acredita staging. |
| Demo local | Capacitación y navegación con datos ficticios; `VITE_DISABLE_AUTH=true`. | Valida UI y ejemplos locales. No acredita Auth, RLS, Storage, Edge Functions ni persistencia compartida. |
| Staging (creado, no inicializado) | `Hub-Institucional-Staging`, proyecto Supabase separado de producción, actualmente sin schema del Hub ni datos sintéticos. | Inicializar desde artefactos reconciliados, no desde datos productivos; ejecutar el alcance completo con Auth real, dos instituciones ficticias, SQL compatible y `admin-users` staging desplegada. No copiar datos personales de producción. |
| Producción | Dominio definitivo, proyecto y secretos propios, datos institucionales autorizados; `VITE_DISABLE_AUTH=false`. | Verificar configuración y despliegue reales, luego una prueba breve controlada por rol. No ejecutar scripts destructivos ni pruebas masivas sobre datos reales. |

Si no existe staging, registrar el ambiente remoto aislado equivalente usado para las pruebas. Validar solo en modo demo implica **no-go**. Nunca compartir credenciales entre ambientes ni versionar `.env` reales. El frontend recibe únicamente configuración pública; las credenciales privilegiadas permanecen del lado servidor.

## Configuración obligatoria del frontend en Vercel

Las únicas variables de la app aprobadas para el frontend son:

| Variable | Valor de producción |
| --- | --- |
| `VITE_SUPABASE_URL` | URL pública del proyecto Supabase del ambiente destino. |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Clave publicable del mismo proyecto; nunca `service_role` ni clave secreta. |
| `VITE_DISABLE_AUTH` | `false`. |

Usar [.env.example](../.env.example) como plantilla pública. No copiar variables de scripts administrativos ni flags internos al proyecto frontend. Revisar Production y Preview por separado y reconstruir el despliegue después de cambiar variables. En produccion, `VITE_SUPABASE_URL` debe ser HTTPS y terminar en `.supabase.co`; URLs locales quedan limitadas a desarrollo. La compatibilidad legacy con `VITE_SUPABASE_ANON_KEY` no amplía esta lista aprobada.

Los guards bloquean `VITE_DISABLE_AUTH=true` en producción, URL/clave pública Supabase faltante o incompatible, nombres privados `VITE_*SERVICE_ROLE*` no vacíos y valores `VITE_*` que parezcan `service_role`, `sb_secret` o JWT privilegiado. Corren antes de montar React y antes de crear el cliente Supabase. Esto no sustituye revisar el proyecto destino ni retirar/rotar un secreto ya publicado. Ver los detalles, tests y headers en [configuración de seguridad](SECURITY.md#únicas-variables-del-frontend-en-vercel).

## Checklist go/no-go

Cada casilla requiere responsable, fecha, ambiente, versión y enlace a evidencia sin secretos ni datos personales. Una casilla pendiente o fallida bloquea el go. Las mejoras expresamente excluidas del alcance no bloquean; un flujo obligatorio incompleto sí.

### Seguridad

- [ ] `npm.cmd run audit:repo` y la revisión del bundle no detectan secretos; ninguna clave `service_role` llega al frontend, git, logs ni evidencias.
- [ ] El audit de dependencias no deja hallazgos high/critical sin triage de alcance, responsable, mitigación y vencimiento vigentes.
- [ ] La entrega de credenciales iniciales no usa el DNI como contraseña definitiva y exige cambio por un canal seguro antes de operar datos reales.

### Autenticación

- [ ] Los cuatro roles pueden iniciar y cerrar sesión; una sesión vencida, un perfil bloqueado o un usuario sin perfil válido queda rechazado sin datos residuales.
- [ ] El modo demo está desactivado en staging/producción y no existe alta automática desde el login.
- [ ] `handle_new_user()` en staging/producción no usa `raw_user_meta_data.account_role`; un alta con metadata manipulada queda como `alumno` o sin privilegios hasta que `admin-users` escriba perfil y membresía.

### Autorización

- [ ] Acceso por URL y solicitudes directas de otro rol se rechazan en servidor; ocultar botones no cuenta como control.
- [ ] Alumno y docente solo acceden a sus propios registros o materias asignadas. Las policies genéricas de lectura por membresía detectadas actualmente bloquean el go.

### RLS

- [ ] Ejecutar pruebas negativas por tabla, RPC y Storage con `anon`, alumno, docente, admin y superadmin; conservar `failed_count = 0` o evidencia equivalente.
- [ ] La prueba de [visibilidad de mesas del alumno](../supabase/security/student_portal_exam_visibility_tests.sql) aprueba. No sustituye la matriz integral; el script histórico `rls_negative_tests.sql` no existe en este checkout.
- [ ] Restringir y verificar el acceso directo actual de miembros a snapshots, padrones, notas, asistencia, estado financiero y archivos de la institución.
- [ ] Comparar las funciones remotas con [SECURITY_FUNCTION_MATRIX.md](SECURITY_FUNCTION_MATRIX.md): `SECURITY DEFINER`, `search_path`, grants/revokes, callers, validación de `auth.uid()` y rechazo cross-tenant.
- [ ] Resolver [SUPABASE_DRIFT_AUDIT.md](SUPABASE_DRIFT_AUDIT.md) y ejecutar la matriz de [STAGING_SECURITY_TEST_MATRIX.md](STAGING_SECURITY_TEST_MATRIX.md) antes de declarar GO.

### Integridad de datos

- [ ] Planillas, carreras, materias, identidades y asignaciones del piloto fueron validadas; no quedan duplicados ni vínculos ambiguos.
- [ ] Reintentos no duplican inscripciones, notas, asistencias ni publicaciones; materia, carrera, institución y alumno conservan IDs canónicos.
- [ ] La inscripción sin última condición no pendiente igual a `regular` se rechaza en servidor.

### Multi-tenant

- [ ] Con instituciones ficticias A/B, toda lectura y escritura cruzada de tablas, RPC, snapshots y Storage se rechaza.
- [ ] Dentro del mismo tenant se aplica mínimo privilegio por rol, no solo pertenencia a la institución.
- [ ] Suspender una institución corta lecturas y escrituras con sesiones nuevas y ya emitidas; el helper local actual no consulta `institutions.status` y bloquea el go.

### Migraciones

- [ ] El orden reproducible parte de [supabase/schema/00_README.md](../supabase/schema/00_README.md), sin copiar migraciones del repo histórico.
- [x] Manifest de baseline preparado: [BASELINE_MANIFEST.md](../supabase/baseline/BASELINE_MANIFEST.md), con inventario completo y orden futuro.
- [ ] Baseline ejecutable completo: pendiente por blockers de RPC y mesas documentados en [BASELINE_READINESS.md](BASELINE_READINESS.md).
- [x] Inventario SQL local preparado: [SECURITY_LOW_RISK_APPLY_CHECKLIST.md](SECURITY_LOW_RISK_APPLY_CHECKLIST.md) clasifica scripts, riesgos, precondiciones, staging, rollback, duplicados y GO/NO-GO.
- [ ] Staging SQL verificado: pendiente. Ningún script mutante de 02.1 fue ejecutado localmente ni contra Supabase remoto.
- [x] Staging identificado y aislado: `Hub-Institucional-Staging` visible y distinto de production; link local conservado en production. Esto no acredita schema ni tests de staging.
- [ ] Producción SQL verificada: pendiente. No hay evidencia nueva de aplicación remota en esta etapa documental.
- [ ] Scripts duplicados/obsoletos reconciliados contra la fuente canónica antes de aplicar.
- [ ] Tablas, columnas, constraints, firmas RPC, grants y policies del destino coinciden con el inventario; las reparaciones requeridas están incorporadas a una fuente de verdad revisable.
- [ ] La persistencia canónica de mesas, `exam_teacher_assignments`, `exam_enrollments` y el RPC autoritativo de inscripción dejan de figurar como pendientes.

### Edge Functions

- [ ] `admin-users` está desplegada desde la versión candidata con secrets y `ADMIN_USERS_ALLOWED_ORIGINS` correctos.
- [ ] Solicitudes sin autenticación, con rol incorrecto, institución suspendida o tenant ajeno se rechazan; acciones autorizadas generan auditoría sin datos sensibles.

### Configuración de entorno

- [ ] Vercel Production y Preview tienen solo las tres variables públicas aprobadas; `VITE_DISABLE_AUTH=false`, URL HTTPS de Supabase y clave publicable corresponden al mismo proyecto.
- [ ] El despliegue reconstruido inicia, sirve rutas SPA por HTTPS y expone headers esperados. Un build local no acredita esta casilla.

### CI

- [x] CI definida: [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) ejecuta `npm ci` y `npm run check` en PR hacia `main` y push a `main`.
- [ ] CI remota verificada: falta observar una ejecución real verde del workflow `CI` / job `Quality gate (Node 22.13)` sobre el commit candidato.
- [x] Política branch protection documentada: ver [BRANCH_PROTECTION.md](BRANCH_PROTECTION.md).
- [ ] Branch protection remota verificada: no confirmada. La lectura de rulesets devolvió `[]` y el endpoint de branch protection clásica no fue accesible con el conector disponible (`403`).
- [ ] La auditoría manual `Dependency Audit` fue ejecutada o sus advisories high/critical quedaron aceptados formalmente bajo una excepción vigente.
- [ ] La [protección de `main`](BRANCH_PROTECTION.md) exige los checks correctos y revisión de PR; la existencia de YAML no demuestra configuración activa.

### Tests

- [ ] `npm.cmd run check` termina con código `0`; si corta antes del build, la puerta queda incompleta.
- [ ] `npm.cmd run quality:full` termina en verde o cada advisory aceptado cumple la excepción documentada en `CONSTRAINTS.md`; no se debilitan tests ni auditorías.

### Build

- [ ] `npm.cmd run build` genera `dist/` y `[production-build-audit] OK` con `VITE_DISABLE_AUTH=false`.
- [ ] Las advertencias de chunks quedan registradas y el volumen real del piloto se mide antes de prometer capacidad.

### Backup

- [ ] Existe respaldo previo de base, Storage y configuración necesaria; una restauración en ambiente aislado fue ensayada con RTO/RPO aceptados.

### Rollback

- [ ] Se registran versión anterior, responsable y pasos separados para revertir frontend, Edge Function y cambios de datos.
- [ ] Ningún rollback SQL genérico se ejecuta sin revisar impacto y respaldo.

### Operación

- [ ] Fallos de red/guardado son visibles, recuperables y nunca se presentan como éxito; existe responsable para frontend, Auth, RPC y Edge Function.
- [ ] Hay un procedimiento para consultar `admin_audit_logs`; la pantalla actual de auditoría de padrones no sustituye el historial de acciones.

### Soporte

- [ ] Están designados contacto institucional/técnico, canal, horario y escalamiento para acceso, inscripción o nota incorrecta.
- [ ] Operadores fueron capacitados con [RUNBOOK.md](RUNBOOK.md) y [TESTING_CHECKLIST.md](TESTING_CHECKLIST.md); tratamiento de datos y borradores legales fueron aprobados por responsables, no solo versionados.

### Smoke tests

- [ ] P01–P06 de [PRODUCTION_SCOPE.md](PRODUCTION_SCOPE.md) aprueban en staging con dos tenants, recarga y segunda sesión; mocks, demo local o un toast no cuentan.
- [ ] Tras desplegar, una prueba controlada por rol confirma login, workspace, publicación, lectura alumno/docente y administración sin usar datos productivos masivos.

## Resultado esperado de la puerta de calidad local

La entrada de validación local es `npm.cmd run check`. Seguir el [Quality Gate antes de merge](RUNBOOK.md#quality-gate-antes-de-merge). La puerta estricta de `CONSTRAINTS.md` exige además el audit nativo de dependencias: ejecutar `quality:deps` después de `check`, o `quality:full` como cadena combinada equivalente para evitar duplicar auditoría, lint, tests y build. Aprobar el check local permite cerrar 00.2; no levanta los bloqueos de producción ni los requisitos estrictos de merge/CI.

| Etapa | Resultado exigido |
| --- | --- |
| `audit:repo` | `[repository-security-audit] OK`, sin relajar controles de secretos. |
| `lint` | ESLint sin errores. |
| `test` | Vitest sin fallos; revisar tests omitidos y conservar el resumen real. |
| `build` | Vite genera `dist/` y la auditoría incluida termina con `[production-build-audit] OK`. |
| `check` completo | Código de salida `0`; ninguna etapa pendiente. |
| `quality:deps` | Sin high/critical abiertos, salvo excepción documentada con alcance, responsable y vencimiento. |
| `quality:full` | Código de salida `0`, o decisión `NO-GO` hasta resolver/aceptar formalmente los hallazgos. |

El criterio estable es auditoría PASS, lint PASS, todos los tests PASS y build PASS, con salida `0`. Cualquier cantidad indicada abajo es un **resultado observado en esta ejecución**, no un requisito contractual permanente. Las advertencias de chunks no equivalen a un fallo; cualquier error o salida no cero sí bloquea.

### Ejecución local observada — 2026-09-24

La evidencia de esta sección corresponde al checkout base `4dfd85a` con los cambios locales documentados de 00.1/00.2. Esta observación no acredita un entorno remoto ni reemplaza una ejecución sobre la versión candidata definitiva.

| Comando / etapa | Resultado observado |
| --- | --- |
| `npm.cmd run check` | OK, código `0`; cadena completa finalizada. |
| `audit:repo` dentro de check | OK: `[repository-security-audit] OK`. |
| `lint` dentro de check | OK: ESLint finalizó sin errores. |
| Vitest dentro de check | OK: 277 archivos aprobados, 2203 tests aprobados, 0 fallos. |
| Build dentro de check | OK: Vite generó `dist/`; `audit:prod` aprobó 119 archivos. Hubo advertencias no bloqueantes de tamaño de chunks. |
| Test focal previo | OK: `src/services/adminUsersEdgeFunctionSecurity.test.js`, 8 tests aprobados, cubriendo LF y CRLF para `persistStudentRecord`. |
| `quality:deps` | En 01.1 falló con advisories preexistentes: 45 vulnerabilidades reportadas por npm audit, 31 high, 13 moderate y 1 low. Sigue rigiendo la excepción documentada en `CONSTRAINTS.md` hasta su triage específico; no se corrigieron dependencias en esta etapa. |

### Integración continua localmente preparada — 2026-09-24

Se actualizó [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) para ejecutar `npm ci` y luego `npm run check` en pull requests hacia `main` y pushes a `main`, con Node `22.13.0`, cache npm por `package-lock.json`, permisos `contents: read`, timeout de 25 minutos y cancelación de ejecuciones obsoletas por PR/ref. No define secretos, `service_role`, credenciales Supabase ni variables `VITE_*`.

La auditoría `quality:deps` queda separada en [`.github/workflows/quality.yml`](../.github/workflows/quality.yml) como ejecución manual, porque el audit nativo conserva deuda preexistente cubierta por `EX-001`. Esto no habilita producción ni sustituye branch protection: falta confirmar una ejecución real en GitHub Actions y configurar los checks requeridos de `main`.

### Política de `main` documentada — 2026-09-24

Se definió en [BRANCH_PROTECTION.md](BRANCH_PROTECTION.md) la política objetivo para `main`: PR obligatorio, CI principal requerido, rama actualizada antes del merge, conversaciones resueltas, force push y borrado de `main` deshabilitados, reglas aplicadas también a administradores salvo bypass de emergencia documentado, reviews realistas para un repo de mantenedor único y preferencia por `squash merge` en PRs pequeños.

Estado remoto real: GitHub confirma repositorio `migueltv82/hub-institucional` y default branch `main`; la metadata visible informa habilitados `allow_squash_merge`, `allow_merge_commit` y `allow_rebase_merge`. No hay rulesets visibles por el conector (`[]`). La branch protection clásica no pudo leerse por falta de acceso del integration al endpoint administrativo; por lo tanto queda **pendiente de verificación/configuración manual**. El required check esperado es `Quality gate (Node 22.13)`, pero debe confirmarse tras la primera ejecución remota antes de marcarlo como requerido.

Diagnóstico resuelto: el fallo reproducido en [adminUsersEdgeFunctionSecurity.test.js](../src/services/adminUsersEdgeFunctionSecurity.test.js) no indicaba pérdida de la protección de `persistStudentRecord`. La expresión regular del test dependía de finales LF exactos y fallaba cuando el archivo de la Edge Function se leía con CRLF. El test ahora normaliza solo saltos de línea antes de extraer el bloque y conserva las mismas comprobaciones de seguridad: workspace fijo, carrera, búsqueda por `workspace_key`/`email`/`career`, `onConflict` correcto y rechazo de `institution_id,external_code`.

La ejecución fallida anterior del 2026-09-24 y la ejecución del 2026-09-23 quedaron obsoletas por este diagnóstico y la repetición completa del check. No reutilizarlas como evidencia del estado actual.

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

## NO incluido en el primer release

- Reescritura a TypeScript/Next o adopción del stack de otro repo.
- Lanzamiento masivo sin acompañamiento, escala o disponibilidad garantizadas sin mediciones.
- Motores alternativos, comparativas, rutas de preview interno y escenarios experimentales como caminos operativos soportados.
- Generación sin revisión humana, resolución automática de cualquier incompatibilidad o garantía de encontrar un cronograma para datos inviables.
- Mesas libres/especiales y reglas académicas adicionales no verificadas en el circuito regular de este alcance.
- Actas oficiales, firma digital, simulación del día de examen y cierre integral de mesa con trazabilidad certificada de su nota. El registro académico de notas existente no acredita ese circuito.
- Inscripción automática completa a carreras/cursadas y previews de ofertas académicas como requisito del release. El roster usa inscripciones a materias preparadas por el operador.
- Pagos, facturación, integraciones externas, notificaciones automáticas y recuperación autoservicio de contraseñas como compromisos del MVP.

Estas exclusiones delimitan el compromiso de salida; no afirman que cada funcionalidad esté ausente del repositorio. Ampliar el alcance exige nuevos casos de aceptación y evidencia.
