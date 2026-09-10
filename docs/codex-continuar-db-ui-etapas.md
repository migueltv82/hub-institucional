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
- Etapa 3: carga y descarga de planillas confirmadas por el usuario el 2026-09-10; conteos posteriores recibidos: 3 archivos, 226 materias y 505 relaciones de correlatividad. Falta ejercitar disponibilidad/carga docente y cronograma, cuyas fuentes y tablas siguen vacias.

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

Siguiente paso:

1. En la misma institucion `3f9dd1a0-19b8-462f-bdd8-7e849d90ae04`, workspace `main`, probar **Docentes > Disponibilidad > Agregar disponibilidad**, con una franja real de un docente.
2. Probar **Docentes > Carga horaria > Generar desde horarios** si existen horarios validos, o **Agregar carga horaria** con datos reales. Importar docentes no llena automaticamente esos dos arrays.
3. Esperar la sincronizacion y recargar; comprobar que los registros permanezcan. Ejecutar otra vez `supabase/docs/verify_03_workspace_functional_counts.sql` y revisar que las dos tablas docentes tengan filas cuando sus fuentes ya las tengan.
4. La sincronizacion de `legacy_exam_sessions` queda pendiente hasta generar y guardar un cronograma valido en modo operativo; no es necesario publicar mesas para probarla. No inventar asignaciones o disponibilidad para forzar su generacion.
5. No avanzar a etapa 4 ni declarar cerrada toda la etapa 3 hasta completar o documentar explicitamente los flujos funcionales pendientes.

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
