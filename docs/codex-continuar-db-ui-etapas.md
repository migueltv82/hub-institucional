# Prompt para continuar DB-UI por etapas

Copiar y pegar este bloque al retomar el trabajo.

---

Estamos trabajando en el repo `hub-institucional`. En esta PC esta en
`C:\Users\User\Desktop\hub-institucional`; en otra PC/oficina, abrir la ruta
local equivalente antes de continuar.

Objetivo general: adaptar Supabase a la UI actual, en etapas chicas, sin borrar la base y respetando primero el funcionamiento real del frontend.

Estado actualizado al 2026-09-10:

- Etapa 0 cerrada: existe `docs/db-ui-contract.md` como contrato DB-UI.
- Etapa 1 cerrada en remoto: foundation + RPCs P0 de superadmin verificadas y probadas desde la UI.
- Etapa 2 cerrada estructuralmente en remoto: `student_records` y `teacher_records` compatibles con UI, verificacion resumen 11/11 OK.
- Etapa 3 cerrada estructuralmente en remoto: `05_workspace_operational_compat.sql` aplicado y verificacion resumen 19/19 OK.
- Etapa 3: carga y descarga de planillas confirmadas por el usuario el 2026-09-10; conteos posteriores recibidos y reconfirmados: 3 archivos, 226 materias y 505 relaciones de correlatividad. Siguen abiertos disponibilidad/carga docente y cronograma: el conteo del 2026-09-10 17:11:03.457+00 todavia muestra tablas y fuentes del snapshot en 0.

Estado para retomar desde la oficina:

- No repetir el smoke de carga/descarga de plantillas salvo que aparezca una regresion nueva: el usuario ya confirmo que pudo cargar y descargar.
- Seguir con los flujos funcionales pendientes de etapa 3: disponibilidad docente, carga horaria docente y guardado de cronograma.
- Trabajar sobre la institucion `3f9dd1a0-19b8-462f-bdd8-7e849d90ae04`, workspace `main`.
- Mantener desactivada la opcion **Schema relacional en panel admin** mientras se prueban cargas operativas desde `/app`.
- No avanzar a etapa 4 hasta registrar conteos nuevos donde los flujos pendientes hayan sido ejercitados o quede documentado explicitamente por que no pudieron completarse.

Revision 2026-09-11 para continuar:

- El repo local no mostraba cambios pendientes antes de esta nota de continuidad.
- La continuidad real ahora esta en etapa 5 funcional: etapa 4 ya quedo cerrada y etapa 5 esta cerrada estructuralmente en remoto, pero falta confirmar el smoke del portal alumno contra `subject_enrollments`.
- El mensaje actual del portal alumno, `La tabla academica relacional no confirmo el alta`, apunta a que la Edge Function `admin-users` remota no esta devolviendo `sources.relational = true`.
- En el codigo local, `admin-users` ya llama a `upsert_subject_enrollment_from_portal` para `enroll_subject`/`withdraw_subject` y devuelve `sources.relational`, `sources.relational_error`, `transition` y `warnings`. Si el remoto esta actualizado y la RPC falla, deberia aparecer un error mas especifico o un warning en `admin_audit_logs`.
- Orden recomendado: asegurar que `supabase/schema/07_academic_operations.sql` este aplicado despues de la correccion de la RPC, redeploy manual de `supabase/functions/admin-users/index.ts`, repetir una inscripcion desde el portal alumno y ejecutar `supabase/docs/verify_05_student_portal_enrollment_diagnostics.sql`.
- Si el diagnostico devuelve `recent_subject_enrollments > 0`, el smoke del portal alumno queda confirmado. Si devuelve `recent_dual_write_warnings > 0`, revisar `relational_errors`. Si ambos quedan en 0 despues de una prueba reciente, el deploy de `admin-users` sigue desactualizado o la prueba no pego contra esa funcion.
- El 2026-09-12 el usuario volvio a probar y recibio: `No se pudo confirmar la inscripcion en las tablas academicas. La tabla academica relacional no confirmo el alta.` Se amplio `supabase/docs/verify_05_student_portal_enrollment_diagnostics.sql` para incluir presencia/firma de la RPC y configuracion `academic_relational_transition`, ademas de conteos recientes y warnings. Proximo paso: ejecutar ese diagnostico ampliado despues de una prueba reciente y decidir entre reaplicar `07_academic_operations.sql`, redeploy de `admin-users` o corregir el error relacional concreto.
- Resultado del diagnostico ampliado recibido el 2026-09-12: `rpc_signature_present = 1`, `transition_config = {}`, `recent_subject_enrollments = 0`, `recent_dual_write_warnings = 0`, `relational_errors` vacio. Interpretacion: la RPC esperada existe, pero no hubo ningun intento relacional reciente; con `transition_config = {}`, una Edge Function remota vieja queda en `snapshot_only`. Se agrego `supabase/docs/repair_05_enable_academic_transition_dual_write.sql` para crear/activar `academic_relational_transition` en modo `dual_write` con fallback a snapshot y `strict_drift_block_enabled = false`. Si tras correrlo y repetir el smoke siguen `recent_subject_enrollments = 0` y warnings `0`, entonces el siguiente paso obligatorio es redeploy manual de `supabase/functions/admin-users/index.ts`.
- Resultado posterior a activar `dual_write` recibido el 2026-09-12: `transition_config` ya muestra `stage = dual_write`, `write_mode = dual_write` y `dual_write_enabled = true`, pero `recent_subject_enrollments = 0`, `recent_dual_write_warnings = 0` y `relational_errors` sigue vacio. Con la RPC presente y la configuracion activa, esto descarta un problema de schema/configuracion. La conclusion operativa es que la Edge Function `admin-users` remota sigue desactualizada o la prueba no esta pegando contra esa funcion. Proximo paso: redeploy manual de `supabase/functions/admin-users/index.ts` siguiendo `supabase/docs/deploy_admin_users.md`; luego repetir inscripcion y diagnostico.
- Redeploy de `admin-users` realizado contra el proyecto remoto `qwrwwansdblcixkjmibx`. Diagnostico posterior recibido el 2026-09-12: `rpc_signature_present = 1`, `transition_config` en `dual_write`, `recent_subject_enrollments = 1`, `recent_dual_write_warnings = 0`, `relational_errors` vacio. Resultado: el smoke funcional de inscripcion desde portal alumno contra `subject_enrollments` queda confirmado. No repetir este smoke salvo regresion nueva.
- Como continuacion, se agrego `supabase/docs/verify_05_teacher_portal_functional_counts.sql` para cerrar el smoke docente de etapa 5. Probar desde portal docente: abrir una materia con alumnos inscriptos, guardar asistencia de una clase y confirmar al menos una nota. Luego ejecutar esa consulta y esperar `recent_subject_class_sessions > 0`, `recent_subject_attendance_records > 0` y `recent_student_grades > 0`. Si alguno queda en 0, revisar el mensaje de UI/consola antes de avanzar.
- Antes del smoke docente se corrigio el encabezado del portal docente: los emails tecnicos generados como `dni@docentes.<institution_id>.local` ya no se muestran como email de contacto; el header muestra `Falta cargar` hasta que el docente cargue un email real en **Mi informacion**. El email tecnico se conserva internamente para login/asociacion y para precargar el formulario de acceso. Verificacion local: `npm.cmd test -- src/modules/docentes/TeacherPortalModule.examsView.test.jsx` y `npm.cmd run lint` pasaron.
- Tambien se corrigio el conteo del dashboard docente: `teacherPortalData` ya no usa el fallback por carrera/materia cuando una fila de horario/asignacion trae identidad explicita de otro docente (`profesor`, `docente`, `teacher_id`, `email`, `dni`, etc.). Esto evita inflar horas semanales y materias asignadas con datos institucionales completos. Ademas `horariosDocentes` ahora reconoce `materia_codigo` al enriquecer la fila. Verificacion local: `npm.cmd test -- src/modules/docentes/services/teacherPortalData.test.js src/modules/docentes/TeacherPortalModule.examsView.test.jsx` y `npm.cmd run lint` pasaron.
- Correccion adicional del portal docente el 2026-09-12: se encontro la causa raiz del inflado persistente. `matchesTeacherIdentity()` consideraba cualquier fila como propia cuando el `profile_id` del registro docente coincidia con el usuario actual, aunque la fila no trajera ese `profile_id`; ahora solo matchea si el `profile_id`/`teacher_id` de la fila coincide. Tambien se cerro la segunda entrada de inflado: `subject_teacher_assignments` ya no puede crear tarjetas extra cuando ya existen grupos funcionales filtrados del docente; solo enriquece/fusiona las materias que el snapshot/roster filtrado reconoce como dictadas por ese docente. Verificacion local: `npm.cmd test -- src/modules/docentes/services/teacherPortalData.test.js src/modules/docentes/services/teacherSubjectCards.test.js src/modules/docentes/TeacherPortalModule.examsView.test.jsx` y `npm.cmd run lint` pasaron.
- Error funcional detectado en baja de alumno desde materia docente: el remoto devolvio `Could not find the function public.teacher_remove_student_subject_records(...) in the schema cache`. Se agregaron a `supabase/schema/07_academic_operations.sql` las RPC `teacher_remove_student_subject_records(...)` y `teacher_reset_student_subject_academic_records(...)`, ambas `security definer`, revocadas para `public/anon/authenticated` y concedidas solo a `service_role` porque las llama `admin-users` luego de validar la contraseÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â±a del docente. Tambien se creo `supabase/docs/repair_05_teacher_student_removal_reset_rpcs.sql` para aplicar en el SQL Editor remoto y forzar `notify pgrst, 'reload schema'`. Verificacion local: `npm.cmd test -- src/modules/docentes/services/teacherStudentRemoval.test.js src/modules/docentes/services/teacherStudentAcademicReset.test.js` paso.
- Correccion posterior de la baja docente: si la RPC relacional marcaba `subject_enrollments.deleted_at`, el listado podia recuperar de nuevo al alumno desde `workspace_snapshots.payload.enrollments`. Se actualizo `supabase/functions/admin-users/index.ts` para que `teacher_remove_student_subject_records` limpie tambien la inscripcion del snapshot de esa materia, reutilizando la identidad completa del alumno. El frontend ahora envia el objeto `student` completo en baja/reset, y la Edge Function reconoce identidades `studentId/studentRecordId/fullName` y `student_id/student_record_id/full_name`. Esto requiere redeploy de `admin-users` ademas del repair SQL. Verificacion local: `npm.cmd test -- src/modules/docentes/services/teacherStudentRemoval.test.js src/modules/docentes/services/teacherStudentAcademicReset.test.js src/services/adminUsersEdgeFunctionSecurity.test.js` y `npm.cmd run lint` pasaron.
- Inicio del bloque "conexiones portal alumno/docente": se agregaron a `supabase/schema/07_academic_operations.sql` las RPC de lectura `academic_get_teacher_subject_rosters(...)` y `academic_get_student_subject_teacher_notices(...)`. La primera devuelve el roster activo de alumnos solo para materias asignadas al docente autenticado; la segunda devuelve avisos de licencia/reemplazo docente solo para materias en las que el alumno autenticado esta inscripto. Se actualizo `supabase/docs/verify_05_academic_operations_summary.sql` para esperar 6 RPCs autenticadas y se creo `supabase/docs/repair_05_portal_connection_read_rpcs.sql` para aplicar estas conexiones en remoto con `notify pgrst, 'reload schema'`. Verificacion local: `npm.cmd test -- src/modules/docentes/services/subjectRoster.test.js src/modules/alumnos/services/studentPortalData.test.js src/modules/alumnos/services/studentPortalSecureReadModel.test.js src/modules/alumnos/services/academicRelationalData.test.js src/modules/alumnos/services/academicRelationalData.fetch.test.js` y `npm.cmd run lint` pasaron.
- Correccion de conexion de notas docente -> alumno: el portal docente confirmaba `Notas confirmadas. El alumno ya puede ver la informacion en su portal`, pero el portal alumno podia no mostrar nada si la nota relacional no era visible por `student_id = auth.uid()` o si dependia de `student_record_id`/inscripcion. Se agrego `academic_get_student_portal_grades(...)`, que resuelve las notas propias por `student_id`, `student_record_id` y `subject_enrollment_id`; el frontend (`academicRelationalData.js`) la usa como fuente primaria y mantiene fallback directo a `student_grades` si la RPC aun no existe. Se actualizo `supabase/docs/repair_05_portal_connection_read_rpcs.sql` para incluirla y el verificador de etapa 5 ahora espera 7 RPCs autenticadas. Verificacion local: `npm.cmd test -- src/modules/alumnos/services/academicRelationalData.fetch.test.js src/modules/alumnos/services/academicRelationalDataFetch.test.js src/modules/alumnos/lib/gradeMatching.test.js src/modules/alumnos/pages/StudentGradesPage.test.jsx` y `npm.cmd run lint` pasaron.
- Correccion critica de persistencia portal alumno: al refrescar pagina, la lectura segura `get_student_portal_workspace_snapshot` devuelve `enrollments: []` y el frontend solo leia `subject_enrollments` si el modo era `hybrid_read`/`relational_primary`. Con `read_mode = snapshot_only`, una inscripcion confirmada en la tabla relacional podia desaparecer visualmente tras recargar, obligando a reinscribir al alumno. Se cambio `academicRelationalData.js` para leer siempre las inscripciones y mesas propias desde las tablas relacionales en remoto; `enrollmentsLoaded=true` vuelve autoritativa esa lectura y evita que el snapshot seguro vacio o viejo tape la persistencia. Verificacion local: `npm.cmd test -- src/modules/alumnos/services/academicRelationalData.fetch.test.js src/modules/alumnos/services/academicRelationalDataFetch.test.js src/modules/alumnos/services/academicRelationalData.test.js src/modules/alumnos/lib/gradeMatching.test.js src/modules/alumnos/pages/StudentGradesPage.test.jsx` y `npm.cmd run lint` pasaron.

Archivos clave recientes:

- `docs/db-ui-contract.md`
- `docs/WORKLOG.md`
- `supabase/schema/05_workspace_operational_compat.sql`
- `supabase/docs/verify_03_workspace_operational_compat_summary.sql`
- `supabase/docs/verify_03_workspace_functional_counts.sql`
- `supabase/docs/repair_02_student_records_duplicate_upsert_keys.sql`
- `supabase/docs/verify_01_foundation_p0.sql`
- `supabase/docs/verify_02_roster_records_ui_compat.sql`
- `supabase/docs/verify_02_roster_records_ui_compat_summary.sql`

Cambios locales relevantes aun no necesariamente commiteados:

- `src/components/generadorCronograma/UploadsSection.jsx`: corrige la UX del boton Cargar/Reemplazar y aclara el bloqueo de la fuente relacional.
- `src/components/GeneradorCronograma.jsx`: pasa a `UploadsSection` el contexto de fuente relacional y permisos de superadmin.
- `src/components/generadorCronograma/UploadsSection.test.jsx`: tests focales del boton, handlers, modo readonly y enlace de configuracion.
- `supabase/docs/verify_03_workspace_functional_counts.sql`: consulta de smoke funcional con conteos contra fuentes del snapshot.
- `docs/codex-continuar-db-ui-etapas.md`: este documento de continuidad.

Hechos confirmados de etapa 3:

- `workspace_source_files` existe.
- Bucket privado `workspace-source-files` existe.
- Policies de Storage existen.
- `teacher_availability_records` y `teacher_workload_records` existen.
- `legacy_subjects_catalog`, `legacy_subject_prerequisites` y `legacy_exam_sessions` existen.
- `legacy_exam_sessions.exam_date` queda como `text` porque la UI puede mandar timestamps completos desde `buildExams()`.
- Tests locales de etapa 3 pasaron: 5 archivos, 37 tests.
- `npm.cmd run build` paso, incluido `audit:prod`; solo warnings conocidos de chunks grandes.

Situacion anterior al smoke (historica; estos conteos no son los actuales):

- La consulta de conteos dio 0 en todas las tablas de etapa 3.
- Se verifico que `workspace_snapshots` si tiene datos:
  - `docentes = 65`
  - `planes = 226`
  - `correlatividades = 226`
  - `disponibilidad_docente = 0`
  - `carga_docente = 0`
  - `cronograma = 0`
- Descargar archivos originales devolvio: `No hay archivos originales almacenados para esta institucion`.
- Ese error es esperado mientras `workspace_source_files = 0`; la etapa 3 no reconstruye archivos originales desde snapshots viejos.

Bloqueo de carga identificado al retomar:

- Si esta habilitada la opcion **Schema relacional en panel admin**, el panel lee las tablas relacionales y bloquea intencionalmente la carga de planillas, incluso para administradores.
- El marcador `schema-relacional` no es un Excel almacenado. La UI anterior lo mostraba como si fuera un archivo reemplazable, aunque el selector estuviera deshabilitado.
- Para este smoke, entrar a **Superadmin > Instituciones**, desactivar **Schema relacional en panel admin** para la institucion de prueba y volver a abrir `/app`. Verificar que indique **Supabase seguro** antes de cargar.
- Correccion local de `UploadsSection`: boton nativo para Cargar/Reemplazar, motivo visible del bloqueo y enlace de configuracion para superadmin. La fuente relacional se muestra como **Datos de la institucion**, sin ofrecer un reemplazo inexistente.
- No quitar el bloqueo de escritura de la vista relacional: primero se debe recuperar el workspace operativo. No se cambio la configuracion remota durante esta correccion.
- Verificacion local de la correccion: 34 tests aprobados en `UploadsSection`, `useCronogramaFiles`, `useWorkspacePersistence` y `relationalPreviewFlow`; lint y build con `audit:prod` aprobados. La carga/descarga real fue confirmada posteriormente por el usuario; no fue observada mediante automatizacion de navegador.

Resultado funcional confirmado:

- El usuario confirmo: "listo ya pude cargar y descargar las plantillas".
- Carga/descarga de originales aprobada por confirmacion del usuario. No volver a pedir ese mismo smoke salvo una regresion nueva.
- El usuario compartio la grilla de `verify_03_workspace_functional_counts.sql`, con `snapshot_actualizado = 2026-09-10 16:59:42.795+00` para todas las filas:

| Tabla | Filas guardadas | Fuente | Filas fuente |
| --- | ---: | --- | ---: |
| workspace_source_files | 3 | No aplica | No aplica |
| teacher_availability_records | 0 | disponibilidadDocente | 0 |
| teacher_workload_records | 0 | cargaHorariaDocente | 0 |
| legacy_subjects_catalog | 226 | planesEstudio | 226 |
| legacy_subject_prerequisites | 505 | correlatividades | 226 |
| legacy_exam_sessions | 0 | cronograma | 0 |

- Confirmados los registros de originales y la poblacion de catalogo/correlatividades despues del guardado. No repetir ese mismo smoke sin una regresion nueva.
- `505` relaciones frente a `226` entradas fuente es compatible con el constructor: una fila puede producir varias relaciones y se incluyen correlativas indirectas. La diferencia sola no indica duplicados ni un error; estos conteos tampoco certifican una comparacion fila a fila.
- Los ceros docentes y de mesas coinciden con fuentes vacias: no son evidencia de falla de sincronizacion. La escritura de esos tres flujos todavia no fue ejercitada.

Conteo posterior recibido:

- El usuario compartio una nueva grilla de `verify_03_workspace_functional_counts.sql`, con `snapshot_actualizado = 2026-09-10 17:11:03.457+00` para todas las filas:

| Tabla | Filas guardadas | Fuente | Filas fuente |
| --- | ---: | --- | ---: |
| workspace_source_files | 3 | No aplica | No aplica |
| teacher_availability_records | 0 | disponibilidadDocente | 0 |
| teacher_workload_records | 0 | cargaHorariaDocente | 0 |
| legacy_subjects_catalog | 226 | planesEstudio | 226 |
| legacy_subject_prerequisites | 505 | correlatividades | 226 |
| legacy_exam_sessions | 0 | cronograma | 0 |

- Este conteo reconfirma que archivos originales, catalogo y correlatividades siguen persistidos.
- No cierra los flujos funcionales pendientes: `disponibilidadDocente`, `cargaHorariaDocente` y `cronograma` permanecen vacios en el snapshot y en las tablas espejo. Etapa 3 sigue abierta y no se avanza a etapa 4.
- Investigacion posterior: la plantilla descargable ya incluye la hoja `disponibilidad_docente` y puede precargarla desde `horarios_docentes`, pero el importador no estaba leyendo esa hoja ni estaba materializando `cargaHorariaDocente` en el snapshot al cargar planillas. Por eso los conteos podian seguir en 0 aunque los archivos originales estuvieran guardados.
- Correccion local aplicada: el parser XLSX lee `disponibilidad_docente` en plantilla maestra/docente, el flujo de carga persiste `disponibilidadDocente`, y `cargaHorariaDocente` se deriva desde `horariosDocentes` para que el snapshot tenga filas sincronizables.
- Verificacion local posterior: pasaron 62 tests en `importTemplateV2Workbook`, `useCronogramaFiles`, `teacherAcademicAdmin`, `teacherAcademicRecords`, `workspaceSnapshotTeacherAcademicRecords` y `TeacherRosterSection`. `npm.cmd run build` tambien paso con `audit:prod`; solo quedaron los warnings conocidos de chunks grandes. No se detecto rotura local en parseo XLSX, merge/persistencia del snapshot, validacion, alta en UI, mapeo ni sincronizacion docente.
- Aclaracion del usuario: la carga y descarga de planillas ya habia funcionado correctamente en la etapa anterior. No volver a pedir ese smoke como prueba. Cualquier nueva importacion solo tendria sentido para validar el mapeo corregido de planilla a snapshot, no para volver a demostrar que el boton carga/descarga.

Conteo funcional posterior a generar carga horaria desde horarios:

- El usuario compartio una nueva grilla de `verify_03_workspace_functional_counts.sql`, con `snapshot_actualizado = 2026-09-10 23:34:24.139+00` para todas las filas:

| Tabla | Filas guardadas | Fuente | Filas fuente |
| --- | ---: | --- | ---: |
| workspace_source_files | 3 | No aplica | No aplica |
| teacher_availability_records | 0 | disponibilidadDocente | 0 |
| teacher_workload_records | 177 | cargaHorariaDocente | 177 |
| legacy_subjects_catalog | 226 | planesEstudio | 226 |
| legacy_subject_prerequisites | 505 | correlatividades | 226 |
| legacy_exam_sessions | 0 | cronograma | 0 |

- Resultado: `teacher_workload_records` queda probado funcionalmente. La UI genero carga horaria desde horarios y el snapshot/tablas espejo guardaron `177` filas.
- Sigue pendiente `teacher_availability_records`: la UI mostro disponibilidad derivada desde horarios docentes, pero `disponibilidadDocente` sigue en 0 en el snapshot y en la tabla espejo. Falta decidir si se materializa automaticamente desde horarios, se importa desde `disponibilidad_docente`, o se documenta como disponibilidad visual derivada no persistida.
- Sigue pendiente `legacy_exam_sessions`: no hay cronograma guardado todavia. Etapa 3 sigue abierta y no se avanza a etapa 4.

Inicio de etapa 4:

- El usuario habilito iniciar etapa 4 con los pendientes de etapa 3 ya documentados explicitamente.
- Alcance de etapa 4 segun `docs/db-ui-contract.md`: crear `subject_teacher_assignments` compatible con la UI y los RPCs `academic_resolve_member_profile_by_email`, `academic_create_teacher_subject_leave` y `academic_update_teacher_assignment_condition`.
- Preparacion local: agregado `supabase/schema/06_subject_teacher_assignments.sql` y `supabase/docs/verify_04_subject_teacher_assignments_summary.sql`.
- La tabla queda pensada para `institution_id = 3f9dd1a0-19b8-462f-bdd8-7e849d90ae04`, workspace `main`, pero el bloque es multi-institucion y no hardcodea esa institucion.
- No se aplico todavia en remoto ni se declara cerrada la etapa 4 hasta correr el SQL en Supabase, ejecutar el verificador y probar desde UI alta/baja/cambio de condicion/licencia.

Verificacion remota inicial de etapa 4:

- El usuario ejecuto `supabase/schema/06_subject_teacher_assignments.sql` y luego `supabase/docs/verify_04_subject_teacher_assignments_summary.sql`.
- Resultado recibido: 9 checks OK y 1 FAIL aparente.
- Checks OK: columnas, constraints, indices, campos requeridos, duplicados activos, policies RLS, grants de tabla, RPCs presentes y grants de RPC.
- FAIL aparente: `subject_teacher_assignments_updated_at_trigger` devolvio `found=2/1`.
- Diagnostico: no indica necesariamente duplicacion real; `information_schema.triggers` puede devolver una fila por evento del mismo trigger (`INSERT` y `UPDATE`). Se corrigio el verificador local para contar `distinct trigger_name`.
- El usuario volvio a ejecutar `supabase/docs/verify_04_subject_teacher_assignments_summary.sql` actualizado y el resultado fue 10/10 OK:

| Check | Estado | Detalle |
| --- | --- | --- |
| subject_teacher_assignments_columns | OK | columnas esperadas presentes |
| subject_teacher_assignments_constraints | OK | found=8/8 expected constraints |
| subject_teacher_assignments_indexes | OK | found=5/5 expected indexes |
| subject_teacher_assignments_required_fields | OK | bad_required=0, bad_role=0, bad_status=0 |
| subject_teacher_assignments_active_duplicates | OK | duplicate_groups=0, duplicate_extra_rows=0 |
| subject_teacher_assignments_rls_policies | OK | found=4/4 expected read/insert/update/delete policies |
| subject_teacher_assignments_authenticated_grants | OK | found=4/4 expected SELECT/INSERT/UPDATE/DELETE grants |
| assignment_rpcs_present | OK | found=3/3 expected RPCs |
| assignment_rpcs_authenticated_grants | OK | found=3/3 expected EXECUTE grants |
| subject_teacher_assignments_updated_at_trigger | OK | found=1/1 expected touch trigger |

- Etapa 4 queda cerrada estructuralmente en remoto y probada funcionalmente desde UI por confirmacion del usuario.
- Smoke funcional confirmado: alta de asignacion, bloqueo de duplicado, cambio de condicion, baja y licencia con reemplazante funcionan correctamente.
- No repetir este smoke salvo que aparezca una regresion nueva.

Inicio de etapa 5:

- Alcance segun `docs/db-ui-contract.md`: agregar inscripciones a materias, notas, asistencia y deuda.
- Preparacion local: agregado `supabase/schema/07_academic_operations.sql` y `supabase/docs/verify_05_academic_operations_summary.sql`.
- El bloque cubre `subject_enrollments`, `student_grades`, `subject_class_sessions`, `subject_attendance_records` y `student_financial_status`.
- RPCs incluidas: `upsert_subject_enrollment_from_portal`, `academic_teacher_create_class_session`, `academic_teacher_upsert_attendance_records` y `academic_teacher_upsert_student_grade`.
- Queda fuera de esta etapa `exam_enrollments` y confirmaciones/objeciones de mesas; corresponde a etapa 6 junto con `exam_teacher_assignments`.
- Verificacion local: pasaron 41 tests en `subjectEnrollments`, `studentGrades`, `subjectAttendance`, `subjectRoster` y lecturas relacionales del portal alumno.
- Verificacion local: `npm.cmd run build` paso con `audit:prod`; solo quedaron warnings conocidos de chunks grandes.
- El usuario ejecuto `supabase/schema/07_academic_operations.sql` y luego `supabase/docs/verify_05_academic_operations_summary.sql`.
- Verificacion remota etapa 5: 18/18 checks OK. Columnas, indices unicos, triggers `updated_at`, campos requeridos, duplicados, RPCs, grants y policies RLS quedaron validados.
- Etapa 5 queda cerrada estructuralmente en remoto.
- Pendiente: smoke funcional desde UI admin/alumno/docente antes de cerrar etapa 5 completa.
- Smoke funcional portal alumno: el usuario confirmo que la inscripcion funciona, pero detecto que la lista muestra codigos de materias sin nombres.
- Correccion local aplicada: el mapper del portal alumno ahora reconoce codigos desde `materia_codigo`, `materiaCodigo`, `codigo_materia` y `subjectCode`; tambien reconoce nombres desde `materia_nombre`, `materiaNombre`, `nombre_materia` y `subjectName`, ademas de los aliases previos.
- Segundo hallazgo del smoke portal alumno: al confirmar inscripcion, la UI mostro `No se pudo confirmar la inscripcion en las tablas academicas`.
- Diagnostico: `upsert_subject_enrollment_from_portal` es llamada por la Edge Function `admin-users` con service role, luego de validar al alumno. La RPC local exigia `actor_user_id = auth.uid()`, pero en esta ruta `auth.uid()` no representa al alumno final. Se corrigio para validar `actor_user_id = target_student_id` y la membresia/perfil activo del alumno.
- El usuario repitio el smoke y el portal siguio mostrando el mensaje generico `La tabla academica relacional no confirmo el alta`.
- Diagnostico actualizado: si la Edge Function remota estuviera corriendo la version actual y la RPC fallara, deberia devolver un error estricto o un detalle de `relational_error`. El mensaje generico indica que la respuesta llego sin confirmacion relacional ni detalle, compatible con `admin-users` remoto desactualizado o sin el bloque obligatorio de dual-write de inscripciones.
- Pendiente remoto: volver a ejecutar `supabase/schema/07_academic_operations.sql` si no se aplico despues de la correccion y redeploy manual de `supabase/functions/admin-users/index.ts` desde el dashboard de Supabase, siguiendo `supabase/docs/deploy_admin_users.md` / nota de `docs/codex-continuar-fase-2.md` (este proyecto no usa deploy CLI desde esta maquina).
- Despues de redeploy, repetir smoke de inscripcion del portal alumno y correr `supabase/docs/verify_05_student_portal_enrollment_diagnostics.sql`.

Siguiente paso:

1. En la misma institucion `3f9dd1a0-19b8-462f-bdd8-7e849d90ae04`, workspace `main`, abrir `/app` con **Schema relacional en panel admin** desactivado y estado **Supabase seguro**.
2. No repetir descarga/carga como smoke. La carga horaria docente ya quedo probada con `177` filas sincronizadas.
3. Para cerrar disponibilidad, validar si la planilla ya cargada contenia `disponibilidad_docente`. Si no la contenia, probar **Docentes > Disponibilidad > Agregar disponibilidad** con una franja real de un docente y volver a ejecutar conteos. Si se decide que la disponibilidad derivada desde horarios debe persistirse automaticamente, implementar ese mapeo explicitamente.
4. La sincronizacion de `legacy_exam_sessions` queda pendiente hasta generar y guardar un cronograma valido en modo operativo; no es necesario publicar mesas para probarla. No inventar asignaciones o disponibilidad para forzar su generacion.
5. No declarar cerrada toda la etapa 3 hasta completar o documentar explicitamente los flujos funcionales pendientes. La etapa 4 puede continuar porque esos pendientes ya quedaron documentados.

Consulta de conteos para pegar despues del smoke:

```sql
with params as (
  select '3f9dd1a0-19b8-462f-bdd8-7e849d90ae04'::uuid as institution_id, 'main'::text as workspace_key
)
select 'workspace_source_files' as table_name, count(*) from public.workspace_source_files, params where workspace_source_files.institution_id = params.institution_id and workspace_source_files.workspace_key = params.workspace_key
union all
select 'teacher_availability_records', count(*) from public.teacher_availability_records, params where teacher_availability_records.institution_id = params.institution_id and teacher_availability_records.workspace_key = params.workspace_key
union all
select 'teacher_workload_records', count(*) from public.teacher_workload_records, params where teacher_workload_records.institution_id = params.institution_id and teacher_workload_records.workspace_key = params.workspace_key
union all
select 'legacy_subjects_catalog', count(*) from public.legacy_subjects_catalog, params where legacy_subjects_catalog.institution_id = params.institution_id and legacy_subjects_catalog.workspace_key = params.workspace_key
union all
select 'legacy_subject_prerequisites', count(*) from public.legacy_subject_prerequisites, params where legacy_subject_prerequisites.institution_id = params.institution_id and legacy_subject_prerequisites.workspace_key = params.workspace_key
union all
select 'legacy_exam_sessions', count(*) from public.legacy_exam_sessions, params where legacy_exam_sessions.institution_id = params.institution_id and legacy_exam_sessions.workspace_key = params.workspace_key;
```

Si despues de subir/guardar sigue todo en 0:

- Revisar consola del navegador y Network por errores de Supabase.
- Revisar si el frontend desplegado corresponde al codigo actual.
- Revisar si `saveWorkspaceSnapshot()` esta llegando a `syncLegacySubjectsCatalog`, `syncLegacySubjectPrerequisites`, `syncLegacyExamSessions` y `syncTeacherAcademicRecords`.
- No avanzar a etapa 4 hasta entender por que el sync de etapa 3 no escribe.

Frase sugerida para retomar:

> Continuemos desde `docs/codex-continuar-db-ui-etapas.md`. Ya estan confirmados la carga/descarga, 3 archivos originales, 226 materias y 505 correlatividades. Falta probar disponibilidad, carga horaria docente y sincronizacion de cronograma de etapa 3.

Prompt recomendado para empezar desde la oficina:

> Continuemos desde `docs/codex-continuar-db-ui-etapas.md` en el repo `hub-institucional`. No repitas el smoke de carga/descarga de plantillas: ya fue confirmado el 2026-09-10 con 3 archivos originales, 226 materias y 505 correlatividades. La etapa 3 sigue abierta solo por los flujos funcionales pendientes: disponibilidad docente, carga horaria docente y guardado/sincronizacion de cronograma. Usa la institucion `3f9dd1a0-19b8-462f-bdd8-7e849d90ae04`, workspace `main`. Primero revisa el estado del repo, despues guiame para probar en `/app` con **Schema relacional en panel admin** desactivado, y cuando te pase los nuevos conteos de `supabase/docs/verify_03_workspace_functional_counts.sql`, actualiza este documento sin avanzar a etapa 4 hasta que quede probado o explicitamente documentado lo pendiente.



Actualizacion 2026-09-14 - preparacion para cerrar cronograma real de etapa 3:

- Se encontro la causa por la que `legacy_exam_sessions` podia quedar en 0 aunque existiera un cronograma generado en el snapshot: `syncLegacyExamSessions` reutilizaba `buildExams()` del portal alumno, y ese helper filtra mesas con estado `pendiente`. El motor oficial genera mesas inicialmente como `estado = pendiente`, por lo que el espejo relacional descartaba el cronograma completo.
- Correccion local aplicada: `src/services/legacyExamSessions.js` ahora construye el espejo operativo directo desde `snapshot.cronograma`, incluyendo mesas pendientes y especiales, excluyendo solo `inscription_mode = admin_only`. Tambien limpia las filas previas de `legacy_exam_sessions` del workspace antes de volver a insertar el cronograma actual, para evitar filas viejas despues de regenerar o borrar cronograma.
- Verificacion local: `npm.cmd test -- src/services/legacyExamSessions.test.js src/services/legacySubjectPrerequisites.test.js src/hooks/useWorkspacePersistence.test.js src/hooks/useCronogramaGeneration.test.js`, `npm.cmd run lint` y `npm.cmd run build` pasaron.
- Proximo smoke manual para cerrar este pendiente: en `/app`, con workspace editable y Supabase seguro, generar un cronograma real, esperar que el estado de guardado quede sincronizado y ejecutar `supabase/docs/verify_03_workspace_functional_counts.sql`. Para considerar cerrado `legacy_exam_sessions`, la fila `legacy_exam_sessions` debe tener `filas_guardadas > 0` y `filas_fuente > 0`; idealmente ambos conteos deben coincidir para el cronograma generado.

Actualizacion 2026-09-14 - cierre funcional de etapa 5:

- El usuario confirmo que ya funcionan los puntos que quedaban del smoke funcional de etapa 5: portal alumno, persistencia de inscripciones, conexion docente-alumno, notas visibles en portal alumno y gadget **CompaÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â±eros**. La mensajeria interna queda documentada como mejora futura y no forma parte del cierre de etapa 5.
- Con esta confirmacion, etapa 5 queda cerrada funcionalmente. No repetir los smokes de inscripcion, notas, persistencia ni companieros salvo que aparezca una regresion nueva.
- Lo que queda del plan DB-UI ya no es etapa 5: quedan pendientes historicos de etapa 3 (`teacher_availability_records` y `legacy_exam_sessions`/cronograma real) y la futura etapa 6 vinculada a mesas/examenes (`exam_enrollments`, confirmaciones/objeciones de mesas y `exam_teacher_assignments`).


Actualizacion 2026-09-14 - nuevo smoke de etapa 3 y refuerzo de guardado de cronograma:

- Conteo recibido: `teacher_workload_records = 177` y `cargaHorariaDocente = 177`, por lo que la carga horaria docente ya sincroniza correctamente desde el snapshot operativo.
- `legacy_exam_sessions` sigue en `0` porque la fuente `cronograma` tambien vino en `0`. Esto confirma que no habia cronograma oficial guardado en `workspace_snapshots.payload.cronograma`; no es un problema de la tabla espejo en esta corrida.
- Se reforzo el flujo del motor de examenes 2.1: al publicar el cronograma final oficial, `GeneradorCronograma` ahora llama `saveSnapshotNow()` inmediatamente con `cronograma` actualizado y `requiereRegeneracion = false`. `ExamEngineV21FieldTestPage` espera esa persistencia antes de mostrar exito, para no depender solo del autosave.
- Validaciones ejecutadas: `npm.cmd test -- src\features\exams\examEngineV21FieldTestService.test.js src\services\legacyExamSessions.test.js`, `npm.cmd run lint` y `npm.cmd run build`.
- Proximo smoke: en `/app`, entrar al motor de mesas, completar el flujo hasta **Cronograma final** y presionar **Publicar cronograma**. Luego ejecutar `supabase/docs/verify_03_workspace_functional_counts.sql`. Si el cronograma se publico, `legacy_exam_sessions` debe dejar de estar en 0 y la fuente `cronograma` tambien debe ser mayor que 0.

Actualizacion 2026-09-14 - RPC faltante para reiniciar proceso de mesas:

- El boton **Reiniciar proceso** fallaba porque Supabase no tenia registrada la funcion `public.academic_admin_reset_exam_process(target_institution_id, target_workspace_key)`.
- Se agrego el script `supabase/docs/repair_06_exam_process_reset_rpc.sql`. Ejecutarlo una vez en el SQL Editor de Supabase para crear la RPC.
- La RPC limpia `workspace_snapshots.payload.cronograma`, `examEnrollments` y estados/revisiones administrativas del proceso de mesas; desactiva `exam_teacher_assignments` si la tabla existe; borra `exam_enrollments` si existe; y elimina filas de `legacy_exam_sessions` del workspace.
- Se corrigio el mensaje del frontend para que apunte a `supabase/docs/repair_06_exam_process_reset_rpc.sql` en vez de una ruta inexistente.
- Validaciones ejecutadas: `npm.cmd test -- src\services\examTeacherAssignments.test.js src\services\legacyExamSessions.test.js`, `npm.cmd run lint` y `npm.cmd run build`.

Actualizacion 2026-09-14 - tabla faltante para publicar precronograma docente:

- Al publicar el precronograma, Supabase informo que no existia `public.exam_teacher_assignments` en el schema cache.
- Se agrego `supabase/docs/repair_06_exam_teacher_assignments.sql`. Ejecutarlo una vez en el SQL Editor de Supabase para crear `exam_teacher_assignments`, `exam_enrollments` basica, policies, indices y las RPCs docentes `academic_teacher_confirm_exam_assignment` / `academic_teacher_object_exam_assignment`.
- Se mejoro el mensaje del frontend: si falta esa tabla, ahora indica ejecutar `supabase/docs/repair_06_exam_teacher_assignments.sql`.
- Validaciones ejecutadas: `npm.cmd test -- src\services\examTeacherAssignments.test.js src\modules\docentes\services\teacherExamAssignments.test.js`, `npm.cmd run lint` y `npm.cmd run build`.

Actualizacion 2026-09-14 - publicacion de precronograma desbloqueada:

- El usuario confirmo que ya pudo publicar el precronograma despues de aplicar el SQL de `exam_teacher_assignments`.
- Queda habilitado el siguiente smoke de etapa 6: entrar como docente, verificar que aparecen las mesas asignadas, confirmar u objetar una mesa, volver al panel admin, refrescar estado docente, auto-confirmar/importar revision final si corresponde y publicar el cronograma final.
- Despues de publicar el cronograma final, ejecutar `supabase/docs/verify_03_workspace_functional_counts.sql` para confirmar que `workspace_snapshots.payload.cronograma` y `legacy_exam_sessions` quedan con filas mayores a 0.

Actualizacion 2026-09-14 - persistencia del avance del motor de mesas:

- Causa del problema reportado: el precronograma y el avance del wizard de mesas 2.1 quedaban en estado local de `ExamEngineV21FieldTestPage`. Al refrescar la pagina, `workspace_snapshots` recuperaba datos base y cronograma final si existia, pero no restauraba `draftResult`, `tribunalResult`, `tribunalReviewExport`, `finalResult` ni el paso actual del proceso. Por eso el usuario tenia que volver a generar.
- Correccion aplicada: se agrego `examEngineV21State` al snapshot operativo. `GeneradorCronograma` lo hidrata, lo incluye en `snapshotPayload` y lo guarda inmediatamente mediante `saveSnapshotNow()` cuando el motor cambia de etapa.
- El motor 2.1 ahora persiste y restaura el avance al generar precronograma, armar mesas especiales, combinar mesas, preparar envio a docentes, refrescar estado docente, importar/auto-confirmar revision final y reiniciar proceso.
- El normalizador `normalizeWorkspaceSnapshot()` conserva `examEngineV21State`; antes cualquier clave nueva de este tipo se descartaba al guardar/leer.
- El SQL de reset `supabase/docs/repair_06_exam_process_reset_rpc.sql` tambien limpia `examEngineV21State` para no revivir procesos viejos despues de reiniciar.
- Correccion posterior por timeout: guardar `examEngineV21State` con `saveSnapshotNow()` estaba disparando tambien las sincronizaciones operativas pesadas del snapshot (`roster`, carga docente, materias, correlatividades y mesas heredadas). En cada avance del wizard eso podia terminar en `canceling statement due to statement timeout`.
- Ajuste aplicado: `saveWorkspaceSnapshot()` ahora acepta `syncOperational = false`, `useWorkspacePersistence.saveSnapshotNow()` reenvia esa opcion, y `GeneradorCronograma.persistirEstadoMotorMesas()` guarda el avance del motor sin ejecutar sincronizaciones operativas. El cronograma final publicado sigue usando el guardado completo para sincronizar `legacy_exam_sessions`.
- Correccion adicional del mismo timeout: el autosave general de `useWorkspacePersistence` y el flush al salir/desmontar tambien podian ejecutar el guardado completo y mostrar `No se pudo guardar el workspace en Supabase: canceling statement due to statement timeout`. Se cambiaron esos guardados automaticos a `syncOperational = false`. Las acciones explicitas que modifican datos operativos o publican el cronograma siguen usando sincronizacion completa.
- Validaciones ejecutadas: `npm.cmd test -- src\features\exams\ExamEngineV21FieldTestPage.test.jsx src\services\workspaceSnapshot.test.js src\services\workspaceSnapshotTeacherAcademicRecords.test.js src\hooks\useWorkspacePersistence.test.js`, `npm.cmd run lint` y `npm.cmd run build`.
Mejora futura pendiente - comunicaciones institucionales y mensajeria interna:

- Objetivo de producto: evolucionar los avisos actuales hacia un sistema de comunicaciones institucionales dentro de la app, sin mezclarlo con los fixes funcionales de etapa 5.
- Etapa sugerida 1: avisos institucionales masivos desde administracion hacia alumnos, docentes o ambos. Casos: cronogramas de mesas regulares/especiales, actos, feriados, dias sin actividad, cambios importantes. Deben mostrarse como aviso destacado/modal visible y quedar registrables como leidos/cerrados.
- Etapa sugerida 2: bandeja de **Comunicaciones** en portal alumno y portal docente, con historial de avisos recibidos y estado leido/no leido.
- Etapa sugerida 3: mensajeria docente-alumno vinculada a materia/cursada. El docente escribe solo a alumnos de sus materias y el alumno responde dentro de ese contexto.
- Etapa sugerida 4: mensajeria alumno-alumno solo entre companieros que comparten materia activa. Requiere permisos estrictos, controles de abuso y decision de moderacion.
- Etapa sugerida 5: moderacion/reportes/bloqueos, auditoria administrativa, adjuntos y notificaciones en tiempo real si hacen falta.
- Modelo probable: `message_threads`, `message_participants`, `message_entries`, `message_read_receipts` y, si conviene separar avisos masivos, `institution_announcements`.
- Regla de seguridad minima: ningun alumno debe poder descubrir usuarios por fuera de su institucion, materias activas o conversaciones en las que participa. Los avisos masivos deben ser creados solo por administracion.

Actualizacion 2026-09-14 - etapa 6: cierre de loop revision docente -> cronograma final:

- Se completo el puente funcional entre la revision docente real y la revision final del admin. El panel de **Revision docente** ahora permite:
  - refrescar confirmaciones/objeciones;
  - confirmar como admin una asignacion docente puntual;
  - confirmar como admin todas las asignaciones pendientes de una mesa;
  - armar la revision final solo con las mesas que tienen todas sus asignaciones publicadas en `confirmed`.
- El boton automatico historico **Confirmar sin cambios** se mantiene como bypass total/manual, pero el nuevo boton **Confirmar mesas listas** evita publicar mesas objetadas o pendientes por accidente.
- `publishExamTeacherAssignmentsForReview()` ahora guarda `objection_deadline` a 24 horas desde la publicacion del precronograma.
- Las lecturas admin/docente llaman de forma perezosa a `academic_reconcile_expired_exam_confirmations`. Si la RPC aun no esta aplicada, no rompe la lectura; cuando exista, confirma automaticamente las filas `pending` vencidas.
- Se agrego `confirmExamAssignmentAsAdmin()` contra la RPC `academic_admin_confirm_exam_assignment`.
- `supabase/docs/repair_06_exam_teacher_assignments.sql` fue actualizado para agregar `objection_deadline`, indice de vencimientos, `academic_reconcile_expired_exam_confirmations`, `academic_admin_confirm_exam_assignment`, grants y `notify pgrst, 'reload schema'`.
- Antes del smoke remoto hay que volver a ejecutar `supabase/docs/repair_06_exam_teacher_assignments.sql` en el SQL Editor de Supabase, aunque la tabla ya exista, porque ahora agrega columna/RPCs nuevas.
- Validaciones locales ejecutadas: `npm.cmd test -- src\services\examTeacherAssignments.test.js src\modules\docentes\services\teacherExamAssignments.test.js src\features\exams\examEngineV21FieldTestService.test.js src\features\exams\components\TeacherConfirmationStatusPanel.test.jsx src\features\exams\ExamEngineV21FieldTestPage.test.jsx`, `npm.cmd run lint` y `npm.cmd run build` pasaron.
- Proximo smoke funcional:
  1. Re-ejecutar `supabase/docs/repair_06_exam_teacher_assignments.sql`.
  2. En `/app`, publicar o reutilizar el precronograma ya enviado a docentes.
  3. Entrar como docente, confirmar una mesa y objetar otra.
  4. Volver al admin, abrir **Envio a docentes**, presionar **Actualizar** y verificar contadores.
  5. Usar **Confirmar mesas listas** para pasar solo las mesas totalmente confirmadas a **Cronograma final**.
  6. Para una mesa pendiente/objetada que se quiera incluir igual, usar **Confirmar** en el rol o **Confirmar mesa** y volver a presionar **Confirmar mesas listas**.
  7. Presionar **Publicar cronograma**.
  8. Ejecutar `supabase/docs/verify_03_workspace_functional_counts.sql`; `legacy_exam_sessions` y fuente `cronograma` deben quedar mayores a 0.

Actualizacion 2026-09-14 - smoke docente parcial y bloqueo remoto etapa 6:

- Se reviso `git status` antes de tocar archivos: hay cambios locales sin commitear ya esperados en 13 archivos del flujo de etapa 6, sin untracked nuevos.
- Smoke remoto parcial desde esta maquina: el login docente contra la institucion `3f9dd1a0-19b8-462f-bdd8-7e849d90ae04`, workspace `main`, funciona con cuenta tecnica docente. En `/app/mesas` el portal muestra el **Precronograma en revision** con 7 mesas publicadas para ese docente y botones **Confirmar** / **Objetar** visibles.
- Se ejercio una confirmacion docente por la misma RPC que usa la UI (`academic_teacher_confirm_exam_assignment`) sobre una mesa publicada. La lectura posterior dejo la fila en `confirmation_status = confirmed` con `confirmed_at` presente.
- Estado global leido con sesion docente miembro: `exam_teacher_assignments` tiene 294 asignaciones activas, 98 mesas distintas, 287 pendientes, 7 confirmadas y 0 mesas completas. Con estos datos, **Confirmar mesas listas** todavia no deberia promover filas a revision final salvo que se confirmen mas docentes o un admin use el bypass por rol/mesa.
- Bloqueo remoto confirmado: la tabla remota todavia no tiene la columna `objection_deadline` (`42703`). Antes de probar vencimientos, auto-confirmacion por plazo o botones admin nuevos, volver a ejecutar `supabase/docs/repair_06_exam_teacher_assignments.sql` en el SQL Editor de Supabase. Si se quiere que las filas ya publicadas tengan plazo, republicar el precronograma despues de aplicar el SQL.
- Correccion local posterior: publicar el precronograma ahora reintenta sin `objection_deadline` si Supabase devuelve que esa columna no existe en el schema cache. Esto desbloquea la publicacion contra esquemas remotos viejos, pero los plazos y RPCs admin nuevas siguen requiriendo aplicar `supabase/docs/repair_06_exam_teacher_assignments.sql`.
- Correccion local posterior 2: confirmar una mesa como admin ahora reintenta con un `update` directo sobre `exam_teacher_assignments` si falta la RPC `academic_admin_confirm_exam_assignment`. El fallback usa solo columnas base y queda protegido por RLS; si el usuario no tiene rol `owner`/`admin`/`editor` o superadmin, seguira fallando. Aplicar `supabase/docs/repair_06_exam_teacher_assignments.sql` sigue siendo necesario para dejar activa la RPC oficial.
- No se pudo cerrar el tramo admin desde esta sesion: CUA no expuso navegador disponible, no hay service role ni credenciales admin locales en `.env`, y la cuenta docente usada tiene membership `viewer`. Queda pendiente abrir el admin real, presionar **Actualizar**, confirmar/esperar mesas hasta tener al menos una mesa completa, usar **Confirmar mesas listas** y publicar el cronograma final.

Actualizacion 2026-09-14 - performance de confirmaciones y creacion de accesos:

- Causa de la demora al confirmar mesas como admin: el frontend estaba confirmando una asignacion docente por vez y, con la RPC `academic_admin_confirm_exam_assignment` ausente en el schema cache remoto, cada rol hacia primero una llamada RPC fallida y despues el fallback. En mesas con varios docentes eso multiplicaba viajes a Supabase.
- Correccion local aplicada: el admin ahora usa `confirmExamAssignmentsAsAdmin()`, agrupa confirmaciones por mesa y, si la RPC falta, hace un `update` directo por mesa con todos los docentes pendientes. Tambien recuerda que la RPC falta para no repetir el error de schema cache en cada click.
- Causa de la demora en creacion de accesos: la Edge Function `admin-users` buscaba usuarios Auth por email fila por fila, y las llamadas grandes podian quedar demasiado pesadas.
- Correccion local aplicada: `studentAccess` y `teacherAccess` procesan tandas chicas con concurrencia acotada; `teacherAccess` ya no manda todos los docentes en una sola invocacion. Ademas `admin-users` precarga/cachea usuarios Auth por tanda para evitar un `listUsers` por cada alumno/docente.
- Efecto esperado: confirmar una mesa y crear accesos deberia volver a sentirse mucho mas rapido. La mejora de frontend aplica al refrescar la app local; la mejora interna de `admin-users` requiere redeploy de esa Edge Function para impactar en remoto.
- Validaciones locales ejecutadas: `npm.cmd test -- src\services\examTeacherAssignments.test.js src\features\exams\ExamEngineV21FieldTestPage.test.jsx src\services\studentAccess.test.js src\services\teacherAccess.test.js`, `npm.cmd test -- src\services\adminUsersEdgeFunctionSecurity.test.js`, `npm.cmd run lint` y `npm.cmd run build` pasaron.

Actualizacion 2026-09-14 - decision sobre disponibilidad docente de etapa 3:

- Decision tecnica: `teacher_availability_records` no se debe materializar automaticamente desde `horariosDocentes`. Los horarios representan clases/carga docente; la disponibilidad para mesas es una declaracion operativa distinta.
- La materializacion valida queda por dos vias ya existentes: importar la hoja `disponibilidad_docente` de la plantilla maestra o cargar filas desde **Docentes > Disponibilidad manual**. El guardado del workspace sincroniza esas filas hacia `teacher_availability_records`.
- La grilla/resumen derivado desde horarios sigue siendo informacion visual de apoyo y no cuenta como fuente persistida de `teacher_availability_records`.
- Para cerrar completamente este pendiente historico de etapa 3, agregar o importar al menos una disponibilidad explicita real, guardar el workspace y volver a ejecutar `supabase/docs/verify_03_workspace_functional_counts.sql`; ahi `teacher_availability_records` y `disponibilidadDocente` deberian quedar mayores a 0. Si la institucion decide no declarar disponibilidad explicita, dejarlo documentado como disponibilidad visual derivada no persistida y no exigir filas en esa tabla.

Estado practico para continuar en casa:

- Al llegar a casa, abrir el repo local `hub-institucional` y traer este trabajo con `git pull`.
- No repetir smokes de etapa 5: portal alumno, persistencia de inscripciones, notas, conexion docente-alumno y **Companieros** ya quedaron cerrados funcionalmente.
- Refrescar/reiniciar la app local para tomar los cambios de frontend. Las confirmaciones admin de mesas ahora deberian ser mucho mas rapidas porque se agrupan por mesa y no repiten la RPC faltante en cada rol.
- En Supabase remoto, volver a ejecutar `supabase/docs/repair_06_exam_teacher_assignments.sql` desde el SQL Editor. Aunque el frontend ya tiene fallbacks, este SQL deja el esquema correcto: `objection_deadline`, reconciliacion por vencimiento y RPC admin oficial.
- Redeployar `supabase/functions/admin-users/index.ts` para que la mejora de performance de creacion de accesos impacte en remoto. Sin ese deploy, el frontend ya manda tandas mas chicas, pero la Edge Function remota puede seguir haciendo busquedas Auth viejas.
- Smoke pendiente de etapa 6:
  1. Entrar al admin en `/app`.
  2. Publicar o reutilizar el precronograma enviado a docentes.
  3. Entrar como docente y confirmar u objetar alguna mesa desde `/app/mesas`.
  4. Volver al admin, abrir **Envio a docentes** y presionar **Actualizar**.
  5. Usar **Confirmar mesas listas** para pasar a revision final solo mesas con todas sus asignaciones confirmadas.
  6. Si se quiere forzar una mesa pendiente u objetada, usar **Confirmar** por rol o **Confirmar mesa** y luego volver a presionar **Confirmar mesas listas**.
  7. Presionar **Publicar cronograma**.
  8. Ejecutar `supabase/docs/verify_03_workspace_functional_counts.sql`.
- Criterio de cierre para cronograma real: en la verificacion, `workspace_snapshots.payload.cronograma` y `legacy_exam_sessions` deben quedar con filas mayores a 0.
- Pendiente historico de etapa 3: `teacher_workload_records` ya quedo confirmado con 177 filas. `teacher_availability_records` solo debe exigirse si la institucion carga/importa disponibilidad explicita; no se va a materializar automaticamente desde horarios docentes.
- Si al confirmar mesas vuelve a aparecer `Could not find the function public.academic_admin_confirm_exam_assignment(...) in the schema cache`, el fallback local deberia completar igual la confirmacion. Si no completa, revisar permisos del usuario admin y confirmar que tenga membership `owner`/`admin`/`editor` o superadmin.
- Si al publicar precronograma vuelve a aparecer `Could not find the 'objection_deadline' column`, el fallback local deberia republicar sin esa columna. Aplicar el repair SQL sigue siendo el cierre correcto para no depender del fallback.

Prompt recomendado para retomar en casa:

> Continuemos desde `docs/codex-continuar-db-ui-etapas.md` en el repo `hub-institucional`. Ya estan cerrados etapa 5, carga horaria docente y los fixes locales de performance para confirmacion de mesas/accesos. Primero revisa `git status`, confirma que estoy sobre el commit pusheado mas reciente, y retomemos el smoke pendiente de etapa 6: aplicar `supabase/docs/repair_06_exam_teacher_assignments.sql` si aun no se aplico, redeployar `supabase/functions/admin-users/index.ts` si necesito performance remota de accesos, confirmar/objetar mesas desde docente, refrescar en admin, usar **Confirmar mesas listas**, publicar cronograma y correr `supabase/docs/verify_03_workspace_functional_counts.sql`. No repetir smokes de etapa 5 salvo regresion.


