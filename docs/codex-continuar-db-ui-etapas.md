# Prompt para continuar DB-UI por etapas

Copiar y pegar este bloque al retomar el trabajo.

---

Estamos trabajando en `C:\Users\tinla\Desktop\Miguel\hub-institucional`.

Objetivo general: adaptar Supabase a la UI actual, en etapas chicas, sin borrar la base y respetando primero el funcionamiento real del frontend.

Estado al corte del 2026-09-09:

- Etapa 0 cerrada: existe `docs/db-ui-contract.md` como contrato DB-UI.
- Etapa 1 cerrada en remoto: foundation + RPCs P0 de superadmin verificadas y probadas desde la UI.
- Etapa 2 cerrada estructuralmente en remoto: `student_records` y `teacher_records` compatibles con UI, verificacion resumen 11/11 OK.
- Etapa 3 cerrada estructuralmente en remoto: `05_workspace_operational_compat.sql` aplicado y verificacion resumen 19/19 OK.
- Etapa 3 todavia no esta cerrada funcionalmente porque Miguel no tenia planillas originales disponibles para probar subida/descarga desde la UI.

Archivos clave recientes:

- `docs/db-ui-contract.md`
- `docs/WORKLOG.md`
- `supabase/schema/05_workspace_operational_compat.sql`
- `supabase/docs/verify_03_workspace_operational_compat_summary.sql`
- `supabase/docs/repair_02_student_records_duplicate_upsert_keys.sql`
- `supabase/docs/verify_01_foundation_p0.sql`
- `supabase/docs/verify_02_roster_records_ui_compat.sql`
- `supabase/docs/verify_02_roster_records_ui_compat_summary.sql`

Hechos confirmados de etapa 3:

- `workspace_source_files` existe.
- Bucket privado `workspace-source-files` existe.
- Policies de Storage existen.
- `teacher_availability_records` y `teacher_workload_records` existen.
- `legacy_subjects_catalog`, `legacy_subject_prerequisites` y `legacy_exam_sessions` existen.
- `legacy_exam_sessions.exam_date` queda como `text` porque la UI puede mandar timestamps completos desde `buildExams()`.
- Tests locales de etapa 3 pasaron: 5 archivos, 37 tests.
- `npm.cmd run build` paso, incluido `audit:prod`; solo warnings conocidos de chunks grandes.

Situacion funcional pendiente:

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

Al retomar:

1. Recargar la app con Ctrl+F5.
2. Entrar a la institucion `3f9dd1a0-19b8-462f-bdd8-7e849d90ae04`, workspace `main`.
3. Subir una planilla fuente real desde la UI.
4. Esperar autosave/guardado.
5. Probar descargar archivos originales.
6. Guardar un workspace que tenga planes/correlatividades y revisar que se pueblen las tablas legacy.

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

> Continuemos desde `docs/codex-continuar-db-ui-etapas.md`. Ya tengo planillas para probar el smoke funcional de etapa 3.
