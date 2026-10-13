# Alcance obligatorio del primer release

## Alcance vigente v1

Portal Docente v1: Mesas es **SOLO LECTURA**, certificado en Staging. Validar asignación propia, rol, confirmation_status y objection_reason cuando exista, mensaje de gestión no habilitada, ausencia de controles de decisiones/reubicación y de requests RPC legacy. Confirmación, objeción, reasignación y reconciliación docente están DIFERIDAS post-v1 y no son criterios de aceptación v1; los servicios legacy conservados no habilitan su uso.

Baseline local descartable PASS, 9 SQL aplicados, 40 tablas public con RLS y Staging aplicado/verificado: [evidencia](../supabase/baseline/STAGING_BASELINE_RESULT.md). La RPC de inscripción existe y está validada, usando JWT del usuario vía `context.userClient` y `auth.uid() = actor_user_id = target_student_id`, con profile/membership/legajo del tenant-workspace validados; sin vía operativa `adminClient`/`service_role`. Ver [contrato vigente](contracts/upsert_exam_enrollment_from_portal.md).

La evaluación de implementación de septiembre y las referencias siguientes a RPC/schema ausentes son **HISTÓRICAS / SUPERADAS**. Los criterios P03 de escritura docente quedan explícitamente diferidos; el resto de pruebas integrales no se da por aprobado con esta actualización. Production sigue **NO-GO**: branch protection remota, backup/restore, rollback, observabilidad, E2E/UAT y release closure pendientes. `EX-001` vence 2026-10-17, sin cobertura posterior automática.

Este documento especifica qué probar para el MVP definido en [preparación para producción](PRODUCTION_READINESS.md). Describe código disponible al 2026-09-24, no resultados de pruebas remotas ni una certificación de despliegue. Todos los casos siguientes son obligatorios.

Las etiquetas describen lo comprobable en el repositorio: `IMPLEMENTADO` significa que el flujo y sus dependencias locales principales existen; `IMPLEMENTADO PARCIALMENTE`, que falta una pieza local necesaria; `NO IMPLEMENTADO`, que no existe un camino funcional; y `NO VERIFICABLE`, que depende exclusivamente del estado de un ambiente remoto. Ninguna etiqueta `IMPLEMENTADO` acredita por sí sola despliegue, RLS efectiva ni datos remotos compatibles.

| Caso | Estado actual | Evidencia resumida |
| --- | --- | --- |
| P01 Login, rol, logout y bloqueo de usuario | `IMPLEMENTADO` | Auth, perfil, enrutamiento por rol, logout y rechazo de perfiles bloqueados tienen caminos locales comprobables. |
| P02 Carga y recuperación de workspace | `IMPLEMENTADO PARCIALMENTE` | Importación y persistencia existen, pero la lectura del snapshot se concede a cualquier miembro del tenant y no satisface mínimo privilegio por rol. |
| P03 Generación, revisión y publicación de mesas | `IMPLEMENTADO PARCIALMENTE` | El flujo de UI/motor existe, pero el esquema canónico declara pendiente la persistencia relacional completa de mesas y confirmaciones. |
| P04 Portal alumno e inscripción a examen | `IMPLEMENTADO PARCIALMENTE` | Lectura, elegibilidad y mutación existen; el RPC autoritativo de inscripción no está definido en `supabase/schema/`. |
| P05 Portal docente: materias, roster, asistencia y notas | `IMPLEMENTADO PARCIALMENTE` | Pantallas, servicios y RPC cubren el circuito, pero las policies genéricas de lectura académica no prueban acceso limitado a las materias propias. |
| P06 Super Admin | `IMPLEMENTADO PARCIALMENTE` | Instituciones, usuarios, bloqueo y reset existen; suspensión efectiva y consulta operativa del historial administrativo no están completas. |

Estado transversal del despliegue Supabase, Edge Function, variables, políticas y datos del ambiente destino: `NO VERIFICABLE` desde este checkout. Debe comprobarse en staging antes del go.

## Preparación y evidencia

Usar un ambiente remoto aislado con dos instituciones ficticias A/B, un usuario por rol, alumnos con y sin condición regular, docentes con materias distintas, planillas compatibles y un período de mesas regulares. Preparar inscripciones a materias para el roster: una inscripción a mesa no equivale a una inscripción a cursada.

Por caso registrar versión, ambiente, fecha, ejecutor, datos de prueba anonimizados, pasos, resultado esperado/observado, evidencia y estado `pendiente`, `aprobado` o `fallido`. Verificar persistencia después de recargar y desde otra sesión cuando corresponda. No marcar aprobado a partir de mocks, demo local o únicamente un toast.

## P01 — Login por rol

**Estado actual: `IMPLEMENTADO`.** Enrutamiento por perfil y protección de Super Admin en [App.jsx](../src/App.jsx), autenticación y bloqueo de usuario en [AuthContext.jsx](../src/auth/AuthContext.jsx), acceso institucional y logout en [auth.js](../src/services/auth.js), y formularios en [LoginPage.jsx](../src/pages/LoginPage.jsx). La suspensión de una institución se evalúa por separado en P06.

1. Ingresar como `admin_instituto`, `alumno`, `docente` y `superadmin`; comprobar dashboard institucional, portal alumno, portal docente y panel global respectivamente.
2. Recargar, cerrar sesión y volver a ingresar; comprobar que no quedan datos visibles de la sesión anterior.
3. Intentar acceso directo a rutas y operaciones ajenas al rol, con sesión vencida, cuenta bloqueada y membresía inválida. Deben rechazarse sin filtrar datos de otra institución.

**Aprobado cuando:** cada rol accede a su circuito autorizado, y las restricciones se sostienen en el servidor. Los alias históricos de roles no amplían permisos.

## P02 — Carga de planillas y workspace

**Estado actual: `IMPLEMENTADO PARCIALMENTE`.** Carga y gestión en [GeneradorCronograma.jsx](../src/components/GeneradorCronograma.jsx); persistencia en [workspaceSnapshot.js](../src/services/workspaceSnapshot.js) y [sourceFiles.js](../src/services/sourceFiles.js). La policy local de `workspace_snapshots` permite lectura a cualquier miembro de la institución; el aislamiento entre tenants existe en el predicado, pero el mínimo privilegio entre roles no está resuelto.

1. Como administrador de A, cargar horarios docentes, docentes, alumnos, plan de estudios y correlatividades con las plantillas del dashboard. Revisar conteos, identidades y errores informados.
2. Reemplazar una planilla con una corrección controlada y comprobar su efecto en el workspace y la necesidad de revisar/regenerar mesas afectadas.
3. Recargar y abrir una segunda sesión autorizada: comprobar datasets, archivos y estado persistido. Probar un archivo inválido y una falla de red; no aceptar una carga fallida como guardada.
4. Con un usuario de B, comprobar que no se pueden leer ni reemplazar los datos o archivos de A, incluso solicitando sus identificadores.

**Aprobado cuando:** los datos remotos recuperados coinciden con lo validado por el operador y no hay acceso entre instituciones. La limpieza destructiva se prueba únicamente sobre el fixture aislado.

## P03 — Armado, revisión y publicación de mesas regulares

**Estado actual: `IMPLEMENTADO PARCIALMENTE`.** El camino operativo es “Armar mesas”, implementado en [ExamEngineV21FieldTestPage.jsx](../src/features/exams/ExamEngineV21FieldTestPage.jsx), pese al nombre histórico del archivo. Construye el cronograma publicable mediante [examEngineV21FieldTestService.js](../src/features/exams/examEngineV21FieldTestService.js) y lo entrega a `publicarCronogramaFinalDesdeMotor` en el generador. Existen servicios de [revisión de asignaciones docentes](../src/services/examTeacherAssignments.js), incluidos plazo de objeción y reconciliación bajo demanda. No es una promesa de ejecución programada en segundo plano.

**Dependencia pendiente de acreditar:** la [guía de esquema](../supabase/schema/00_README.md) señala pendientes de persistencia operativa de mesas. La existencia de UI y servicios no demuestra que sus tablas/RPC estén disponibles. P03 y la inscripción de P04 permanecen pendientes hasta verificar ese contrato completo en el ambiente remoto.

1. Con datos revisados, configurar el período y generar el precronograma por el camino V2.1; inspeccionar fechas, materias, docentes, advertencias y tribunales antes de continuar.
2. Para v1, comprobar desde la sesión docente sus mesas en modo solo lectura según «Alcance vigente v1». HISTÓRICO / DIFERIDO post-v1: publicar asignaciones para revisión docente, confirmar una y objetar otra, verificar el estado administrativo y resolver la objeción antes de la revisión final.
3. HISTÓRICO / DIFERIDO post-v1, no ejecutar como aceptación v1: comprobar vencimiento/reconciliación y confirmación administrativa del flujo legacy. Ese criterio no habilita bypass ni decisiones docentes en v1.
4. Confirmar la revisión final y publicar. Verificar que las mesas publicables llegan al cronograma persistido y a los portales correctos, con fecha, materia y tribunal coincidentes.
5. Comprobar que borradores o mesas pendientes no se muestran como mesas habilitadas para inscripción. Repetir la lectura tras recargar y verificar que un error de publicación no queda acreditado como éxito.

**Aprobado cuando:** se completa generación → revisión → publicación → lectura remota, sin mesas pendientes presentadas como oficiales ni cruces de institución. Un preview, CSV exportado o generación aislada no alcanza. Si faltan RPC, columnas o persistencia compatible, el caso falla aunque exista un fallback local; no se reduce el alcance a “solo generar”.

## P04 — Portal alumno: materias e inscripción con condición regular

**Estado actual: `IMPLEMENTADO PARCIALMENTE`.** Lectura en [studentPortalData.js](../src/modules/alumnos/services/studentPortalData.js), escrituras por [studentPortalMutations.js](../src/modules/alumnos/services/studentPortalMutations.js) y criterio visual en [examEligibility.js](../src/modules/alumnos/lib/examEligibility.js). La autoridad para la inscripción es el RPC `upsert_exam_enrollment_from_portal`; [admin-users](../supabase/functions/admin-users/index.ts) agrega validaciones en el camino de mutación, pero el RPC no está definido en la fuente canónica local `supabase/schema/`.

1. Ingresar con un alumno vinculado al padrón y verificar sus materias/carrera y mesas publicadas. No debe recibir el padrón completo ni datos académicos ajenos.
2. Registrar desde el docente una condición `regular` para la materia y carrera exactas. Inscribir al alumno a una mesa publicada y comprobar persistencia al recargar.
3. Repetir el envío y verificar que no genera inscripciones duplicadas.
4. Probar sin condición y con condición `libre`, `promocionado`, `approved` o `failed`: rechazar la inscripción tanto desde UI como mediante una solicitud directa autorizada solo como alumno. También rechazar intentos sobre otro alumno o institución.

**Aprobado cuando:** UI y servidor coinciden en admitir únicamente la última condición no `pending` igual a `regular` para esa materia/carrera, con IDs canónicos y vínculo al registro del alumno cuando exista. No se promete una regla adicional de caducidad por años por el solo uso de la expresión “regular vigente”.

## P05 — Portal docente: roster, asistencia y nota

**Estado actual: `IMPLEMENTADO PARCIALMENTE`.** [TeacherPortalModule.jsx](../src/modules/docentes/TeacherPortalModule.jsx), [SubjectDetailView.jsx](../src/modules/docentes/pages/SubjectDetailView.jsx), [subjectRoster.js](../src/modules/docentes/services/subjectRoster.js), [subjectAttendance.js](../src/services/subjectAttendance.js) y [studentGrades.js](../src/services/studentGrades.js). Las RPC docentes aplican controles propios, pero las policies locales de lectura sobre tablas académicas son más amplias que el alcance de materias asignadas.

1. Ingresar como docente con identidad y materias asignadas; abrir el roster de una materia con inscripciones a cursada preparadas y comprobar alumnos esperados.
2. Registrar asistencia y una nota/condición académica. Recargar y confirmar que corresponden al mismo alumno, materia, carrera e institución.
3. Desde el alumno, verificar la calificación/condición publicada y usar esa condición para completar P04. Comprobar asistencia persistida desde el portal docente.
4. Intentar modificar registros de una materia no asignada o de otra institución; rechazar la escritura. Probar error de guardado y reintento sin duplicación.

**Aprobado cuando:** las escrituras persisten y el circuito docente → alumno mantiene la identidad académica correcta. Este caso no acredita actas oficiales ni cierre de examen; no confundir nota de cursada/condición con una nota de mesa certificada.

## P06 — Super Admin: instituciones y usuarios

**Estado actual: `IMPLEMENTADO PARCIALMENTE`.** Páginas `SuperAdmin*`, incluida una [auditoría de drift de padrones](../src/pages/SuperAdminAuditPage.jsx), [superAdmin.js](../src/services/superAdmin.js) y la [Edge Function admin-users](../supabase/functions/admin-users/index.ts) existente. El backend registra acciones en `admin_audit_logs`, pero no se verificó una pantalla que consulte ese historial. Además, la suspensión de una institución no está incorporada al helper RLS de membresía. Su extensión actual no implica migración del frontend a TypeScript.

Subflujos: instituciones, usuarios, bloqueo/desbloqueo y reset de contraseña están `IMPLEMENTADO`; auditoría de drift de padrones está `IMPLEMENTADO`; consulta operativa de `admin_audit_logs` está `NO IMPLEMENTADO`; efectividad servidor de la suspensión institucional está `IMPLEMENTADO PARCIALMENTE`.

1. Crear una institución de prueba con administrador; crear o asignar usuarios institucionales y verificar rol, membresía y acceso efectivo con cada cuenta.
2. Actualizar los datos/estado de la institución y verificar que se recuperan correctamente. Probar la restricción de acceso correspondiente al suspenderla; si no se cumple, registrar bloqueo de salida.
3. Bloquear un usuario y verificar rechazo de operaciones con sesión nueva y previamente abierta; desbloquear y comprobar recuperación autorizada.
4. Restablecer una contraseña mediante `set_user_password`; comprobar que la nueva permite ingresar y la anterior deja de servir. Entregar la credencial de prueba por un canal seguro y excluirla de logs/evidencias.
5. Como alumno, docente y administrador institucional, intentar operaciones globales de Super Admin y reset de usuarios ajenos. Deben rechazarse en servidor.
6. Consultar los eventos administrativos de creación, cambio de rol, bloqueo y reset, verificando actor, objetivo, fecha y resultado sin exponer secretos. Mientras no exista un camino operativo documentado para leer `admin_audit_logs`, este paso falla.

**Aprobado cuando:** Auth, perfil y membresía son coherentes; las operaciones sensibles usan autorización servidor; suspender una institución corta sus accesos activos; y existe una forma operativa documentada de consultar los eventos administrativos registrados. El reset administrativo existente no promete envío de correo ni recuperación autoservicio. Borrados masivos o purgas no forman parte del recorrido obligatorio.

## Cierre del alcance

P01–P06 aprobados son necesarios, pero no suficientes: también debe completarse el checklist de seguridad, datos, operación y soporte de [preparación para producción](PRODUCTION_READINESS.md). Cualquier falta encontrada se registra como brecha pendiente; este documento no introduce cambios de runtime ni aplica SQL.
