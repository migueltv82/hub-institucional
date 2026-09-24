# Alcance obligatorio del primer release

Este documento especifica qué probar para el MVP definido en [preparación para producción](PRODUCTION_READINESS.md). Describe código disponible al 2026-09-23, no resultados de pruebas remotas ni una certificación de despliegue. Todos los casos siguientes son obligatorios.

## Preparación y evidencia

Usar un ambiente remoto aislado con dos instituciones ficticias A/B, un usuario por rol, alumnos con y sin condición regular, docentes con materias distintas, planillas compatibles y un período de mesas regulares. Preparar inscripciones a materias para el roster: una inscripción a mesa no equivale a una inscripción a cursada.

Por caso registrar versión, ambiente, fecha, ejecutor, datos de prueba anonimizados, pasos, resultado esperado/observado, evidencia y estado `pendiente`, `aprobado` o `fallido`. Verificar persistencia después de recargar y desde otra sesión cuando corresponda. No marcar aprobado a partir de mocks, demo local o únicamente un toast.

## P01 — Login por rol

**Disponible:** enrutamiento por perfil y protección de Super Admin en [App.jsx](../src/App.jsx), con autenticación en [AuthContext.jsx](../src/auth/AuthContext.jsx).

1. Ingresar como `admin_instituto`, `alumno`, `docente` y `superadmin`; comprobar dashboard institucional, portal alumno, portal docente y panel global respectivamente.
2. Recargar, cerrar sesión y volver a ingresar; comprobar que no quedan datos visibles de la sesión anterior.
3. Intentar acceso directo a rutas y operaciones ajenas al rol, con sesión vencida, cuenta bloqueada y membresía inválida. Deben rechazarse sin filtrar datos de otra institución.

**Aprobado cuando:** cada rol accede a su circuito autorizado, y las restricciones se sostienen en el servidor. Los alias históricos de roles no amplían permisos.

## P02 — Carga de planillas y workspace

**Disponible:** carga y gestión en [GeneradorCronograma.jsx](../src/components/GeneradorCronograma.jsx); persistencia en [workspaceSnapshot.js](../src/services/workspaceSnapshot.js) y [sourceFiles.js](../src/services/sourceFiles.js).

1. Como administrador de A, cargar horarios docentes, docentes, alumnos, plan de estudios y correlatividades con las plantillas del dashboard. Revisar conteos, identidades y errores informados.
2. Reemplazar una planilla con una corrección controlada y comprobar su efecto en el workspace y la necesidad de revisar/regenerar mesas afectadas.
3. Recargar y abrir una segunda sesión autorizada: comprobar datasets, archivos y estado persistido. Probar un archivo inválido y una falla de red; no aceptar una carga fallida como guardada.
4. Con un usuario de B, comprobar que no se pueden leer ni reemplazar los datos o archivos de A, incluso solicitando sus identificadores.

**Aprobado cuando:** los datos remotos recuperados coinciden con lo validado por el operador y no hay acceso entre instituciones. La limpieza destructiva se prueba únicamente sobre el fixture aislado.

## P03 — Armado, revisión y publicación de mesas regulares

**Disponible:** el camino operativo es “Armar mesas”, implementado en [ExamEngineV21FieldTestPage.jsx](../src/features/exams/ExamEngineV21FieldTestPage.jsx), pese al nombre histórico del archivo. Construye el cronograma publicable mediante [examEngineV21FieldTestService.js](../src/features/exams/examEngineV21FieldTestService.js) y lo entrega a `publicarCronogramaFinalDesdeMotor` en el generador. Existen servicios de [revisión de asignaciones docentes](../src/services/examTeacherAssignments.js), incluidos plazo de objeción y reconciliación bajo demanda. No es una promesa de ejecución programada en segundo plano.

**Dependencia pendiente de acreditar:** la [guía de esquema](../supabase/schema/00_README.md) señala pendientes de persistencia operativa de mesas. La existencia de UI y servicios no demuestra que sus tablas/RPC estén disponibles. P03 y la inscripción de P04 permanecen pendientes hasta verificar ese contrato completo en el ambiente remoto.

1. Con datos revisados, configurar el período y generar el precronograma por el camino V2.1; inspeccionar fechas, materias, docentes, advertencias y tribunales antes de continuar.
2. Publicar asignaciones para revisión docente. Desde la sesión docente, comprobar sus mesas, confirmar una y objetar otra; verificar el estado recuperado por el administrador y resolver la objeción antes de la revisión final.
3. En el ambiente de prueba, comprobar el vencimiento del plazo y su reconciliación al consultar. Verificar por separado la confirmación administrativa existente con un administrador autorizado y el rechazo con rol docente. Registrar quién confirma; no presentar el bypass administrativo como confirmación personal del docente.
4. Confirmar la revisión final y publicar. Verificar que las mesas publicables llegan al cronograma persistido y a los portales correctos, con fecha, materia y tribunal coincidentes.
5. Comprobar que borradores o mesas pendientes no se muestran como mesas habilitadas para inscripción. Repetir la lectura tras recargar y verificar que un error de publicación no queda acreditado como éxito.

**Aprobado cuando:** se completa generación → revisión → publicación → lectura remota, sin mesas pendientes presentadas como oficiales ni cruces de institución. Un preview, CSV exportado o generación aislada no alcanza. Si faltan RPC, columnas o persistencia compatible, el caso falla aunque exista un fallback local; no se reduce el alcance a “solo generar”.

## P04 — Portal alumno: materias e inscripción con condición regular

**Disponible:** lectura en [studentPortalData.js](../src/modules/alumnos/services/studentPortalData.js), escrituras por [studentPortalMutations.js](../src/modules/alumnos/services/studentPortalMutations.js) y criterio visual en [examEligibility.js](../src/modules/alumnos/lib/examEligibility.js). La autoridad para la inscripción es el RPC `upsert_exam_enrollment_from_portal`; `admin-users` agrega validaciones en el camino de mutación.

1. Ingresar con un alumno vinculado al padrón y verificar sus materias/carrera y mesas publicadas. No debe recibir el padrón completo ni datos académicos ajenos.
2. Registrar desde el docente una condición `regular` para la materia y carrera exactas. Inscribir al alumno a una mesa publicada y comprobar persistencia al recargar.
3. Repetir el envío y verificar que no genera inscripciones duplicadas.
4. Probar sin condición y con condición `libre`, `promocionado`, `approved` o `failed`: rechazar la inscripción tanto desde UI como mediante una solicitud directa autorizada solo como alumno. También rechazar intentos sobre otro alumno o institución.

**Aprobado cuando:** UI y servidor coinciden en admitir únicamente la última condición no `pending` igual a `regular` para esa materia/carrera, con IDs canónicos y vínculo al registro del alumno cuando exista. No se promete una regla adicional de caducidad por años por el solo uso de la expresión “regular vigente”.

## P05 — Portal docente: roster, asistencia y nota

**Disponible:** [TeacherPortalModule.jsx](../src/modules/docentes/TeacherPortalModule.jsx), [teacherAcademicRecords.js](../src/services/teacherAcademicRecords.js), [subjectAttendance.js](../src/services/subjectAttendance.js) y [studentGrades.js](../src/services/studentGrades.js).

1. Ingresar como docente con identidad y materias asignadas; abrir el roster de una materia con inscripciones a cursada preparadas y comprobar alumnos esperados.
2. Registrar asistencia y una nota/condición académica. Recargar y confirmar que corresponden al mismo alumno, materia, carrera e institución.
3. Desde el alumno, verificar la calificación/condición publicada y usar esa condición para completar P04. Comprobar asistencia persistida desde el portal docente.
4. Intentar modificar registros de una materia no asignada o de otra institución; rechazar la escritura. Probar error de guardado y reintento sin duplicación.

**Aprobado cuando:** las escrituras persisten y el circuito docente → alumno mantiene la identidad académica correcta. Este caso no acredita actas oficiales ni cierre de examen; no confundir nota de cursada/condición con una nota de mesa certificada.

## P06 — Super Admin: instituciones y usuarios

**Disponible:** páginas `SuperAdmin*`, [superAdmin.js](../src/services/superAdmin.js) y la [Edge Function admin-users](../supabase/functions/admin-users/index.ts) existente. Su extensión actual no implica migración del frontend a TypeScript.

1. Crear una institución de prueba con administrador; crear o asignar usuarios institucionales y verificar rol, membresía y acceso efectivo con cada cuenta.
2. Actualizar los datos/estado de la institución y verificar que se recuperan correctamente. Probar la restricción de acceso correspondiente al suspenderla; si no se cumple, registrar bloqueo de salida.
3. Bloquear un usuario y verificar rechazo de operaciones con sesión nueva y previamente abierta; desbloquear y comprobar recuperación autorizada.
4. Restablecer una contraseña mediante `set_user_password`; comprobar que la nueva permite ingresar y la anterior deja de servir. Entregar la credencial de prueba por un canal seguro y excluirla de logs/evidencias.
5. Como alumno, docente y administrador institucional, intentar operaciones globales de Super Admin y reset de usuarios ajenos. Deben rechazarse en servidor.

**Aprobado cuando:** Auth, perfil y membresía son coherentes y las operaciones sensibles usan autorización servidor. El reset administrativo existente no promete envío de correo ni recuperación autoservicio. Borrados masivos o purgas no forman parte del recorrido obligatorio.

## Cierre del alcance

P01–P06 aprobados son necesarios, pero no suficientes: también debe completarse el checklist de seguridad, datos, operación y soporte de [preparación para producción](PRODUCTION_READINESS.md). Cualquier falta encontrada se registra como brecha pendiente; este documento no introduce cambios de runtime ni aplica SQL.
