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
