# Aplicación en Producción · 06, 07 y 08 (punto 3, punto 1, carga masiva y vigencia)

Proyecto: `lzjp…aeco` (PostgreSQL 17.6). Lo corre **Miguel en el SQL Editor**, como rol `postgres`. El conector de Claude corta a los 60 s y estos archivos no entran.

## Condición previa

**Recomendado:** reauditoría del agente (`GATE_C_FIXES_AGENT_REAUDIT.md`) en PASS y gate de Codex (🔍 AUDITAR, ítems 1–3) en PASS sobre `8120b35` o posterior.

Si Miguel decide aplicar antes del gate de Codex, porque Prod hoy solo tiene datos de prueba, queda registrado como decisión suya en la tarjeta GATE.C. Codex audita después sobre lo aplicado.

## Foto "antes" (tomada por Claude, solo lectura, 21/10)

| Tabla | Filas | max(updated_at) |
|---|---|---|
| subject_enrollments | 3 | 2026-10-20 13:22:32.424684+00 |
| student_grades | 3 | 2026-10-20 13:22:32.426612+00 |
| subject_class_sessions | 1 | 2026-10-20 13:22:32.42754+00 |
| subject_attendance_records | 1 | 2026-10-20 13:22:32.428447+00 |
| subject_teacher_assignments | 3 | 2026-10-18 15:50:24.891094+00 |
| student_financial_status | 0 | — |

Columnas nuevas del 06: 0. Columna `study_plan_subject_id` del 07: 0. Es decir, nada de esto está aplicado todavía.

## Pasos (en este orden, un archivo por vez, pegando el archivo ENTERO)

1. `supabase/schema/06_subject_teacher_assignments.sql` → tiene que terminar en "Success".
2. `supabase/schema/07_academic_operations.sql` → "Success".
3. `supabase/schema/08_exam_tables.sql` → "Success".

Si cualquiera da error: **frenar**, no correr el siguiente y avisar a Claude con el mensaje exacto. Los tres archivos son idempotentes: se pueden volver a correr.

## Verificación (después de los tres; la puede correr Claude en solo lectura)

```sql
select 'subject_enrollments' tabla, count(*) filas, max(updated_at)::text max_updated, count(study_plan_subject_id) con_referencia from public.subject_enrollments
union all select 'student_grades', count(*), max(updated_at)::text, count(study_plan_subject_id) from public.student_grades
union all select 'subject_class_sessions', count(*), max(updated_at)::text, count(study_plan_subject_id) from public.subject_class_sessions
union all select 'subject_attendance_records', count(*), max(updated_at)::text, null from public.subject_attendance_records
union all select 'subject_teacher_assignments', count(*), max(updated_at)::text, count(study_plan_subject_id) from public.subject_teacher_assignments;

select
  (select count(*) from information_schema.columns where table_schema='public' and table_name='subject_teacher_assignments' and column_name in ('starts_on','ends_on','end_reason','replaces_assignment_id')) as columnas_06,            -- 4
  (select count(*) from pg_constraint where conname in ('subject_teacher_assignments_end_reason_check','subject_teacher_assignments_dates_check','subject_teacher_assignments_replaces_self_check','subject_teacher_assignments_replaces_scope_fkey')) as constraints_06, -- 4
  (select count(*) from pg_proc where pronamespace='public'::regnamespace and proname in ('academic_end_teacher_assignment','academic_teacher_assignment_grants_access','academic_try_iso_date','academic_try_uuid','academic_resolve_plan_subject_id','academic_set_plan_subject_reference')) as funciones_nuevas, -- 6
  (select count(*) from pg_trigger where tgname='set_plan_subject_reference') as triggers_07,                                                                 -- 4
  (select count(*) from pg_proc where pronamespace='public'::regnamespace and prosrc like '%academic_teacher_assignment_grants_access(%' and proname <> 'academic_teacher_assignment_grants_access') as funciones_con_vigencia, -- 7
  (select count(*) from public.subject_teacher_assignments where status='inactive' and end_reason is null) as bajas_sin_motivo,                               -- 0
  (select count(*) from pg_proc p where p.pronamespace='public'::regnamespace and p.proname in ('academic_teacher_assignment_grants_access','academic_try_iso_date','academic_try_uuid','academic_resolve_plan_subject_id') and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'))) as internas_expuestas; -- 0
```

Esperado:
- Las mismas filas y el **mismo `max(updated_at)`** que en la foto "antes". Las filas ya estaban normalizadas, así que re-correr el 07 no puede tocarlas.
- `con_referencia` igual a `filas` en las 4 tablas, porque en Prod todas las materias están en el catálogo (0 huérfanas al 20/10).
- Los valores comentados en la segunda consulta.

## Después del SQL

- **Front:** publicar `release/v1`. Todo lo nuevo tolera la base vieja, pero "Dar de baja" necesita el 06.
- **Edge `admin-users`:** **no** redeployar todavía. El código nuevo incluye la vigencia del padrón, pero el redeploy espera la auditoría de los ítems 5 y 6 de 🔍 AUDITAR (I2d, I2g, `repair_student_access`). Mientras tanto, la Edge vieja muestra en el padrón (solo lectura) a un suplente fuera de su período. Las escrituras las protege la base.
