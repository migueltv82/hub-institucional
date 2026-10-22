# PROD0 — Drift read-only de Producción contra release/v1

Fecha: 2026-10-17. Aprobación: Miguel (chat 17/10). La base de Producción rechaza la conexión directa del conector (ECONNREFUSED; probablemente restricciones de red). Miguel corrió `supabase/security/remote_drift_snapshot_compact.sql` en el SQL Editor de `Hub-Institucional` (`qwrw…mibx`) y pegó el resultado. Solo SELECT. Escrituras: NONE.

## Datos (solo conteos agregados)

| Tabla | Filas |
| --- | ---: |
| `auth.users` | 434 |
| `public.profiles` | 433 (alumno 304 · docente 126 · admin_instituto 2 · superadmin 1) |
| `public.institutions` | 1 |
| `public.memberships` | 368 |
| `public.student_records` / `teacher_records` | 312 / 63 |
| `public.subject_enrollments` / `student_grades` | 23 / 3 |
| `public.exam_enrollments` | 0 |
| `public.workspace_snapshots` | 1 |
| `storage.objects` | 6 |
| `public.exam_tables` | no existe |

**Producción tiene usuarios reales.** El deploy de v1 no es una instalación: es una migración de un sistema con datos.

Modo de transición: **ya está en `dual_write`** (`updated_by: "manual enable stage5 student portal smoke"`).

## Catálogo contra release/v1

| Tipo | Iguales | Faltan en Prod | Distintos | Solo en Prod |
| --- | ---: | ---: | ---: | ---: |
| Funciones | 22 | 5 | 10 | 5 |
| Tablas | 23 | 6 | 11 | 0 |
| Policies | 89 | 5 | 0 | 8 |
| Triggers | 15 | 3 | 0 | 2 |
| Buckets | 1 | 0 | 0 | 0 |

Faltan:
- `upsert_exam_enrollment_from_portal`: la RPC autoritativa de inscripción a mesa. Con `dual_write` activo, `admin-users` (`index.ts:~2617`) la llama y no existe.
- `get_academic_transition_config`: el portal cae a `snapshot_only`, sin romperse.
- El modelo canónico de mesas de `08_exam_tables.sql`: `exam_tables`, `exam_table_subjects`, `exam_table_events`, `exam_enrollment_events`, `exam_absence_penalties`, más sus 3 funciones de validación y triggers.
- `exam_engine_v21_states` y sus policies.
- La policy de Storage `canonical actor paths`.

Distintos:
- `handle_new_user()`: el 25/09 tenía el P1 (rol tomado de `raw_user_meta_data`). **Hay que confirmar si sigue vulnerable.**
- `academic_teacher_upsert_student_grade`: 03.5b.
- `academic_can_manage_subject`, `academic_resolve_subject_enrollment`, `academic_get_*` (3), `academic_teacher_upsert_attendance_records`, `get_student_portal_workspace_snapshot` y `upsert_subject_enrollment_from_portal`.
- 11 tablas con columnas, constraints o grants distintos, entre ellas `exam_enrollments` y `exam_teacher_assignments` (versión legacy de `supabase/docs/repair_06_*`), `student_grades`, `subject_enrollments` y `subject_teacher_assignments`.

Solo en Prod:
- 5 RPC del flujo de confirmación y objeción docente (`academic_*_exam_assignment`, `academic_admin_reset_exam_process`, `academic_reconcile_expired_exam_confirmations`), **diferido post-v1**.
- Policies `admins *` en `exam_enrollments` y `exam_teacher_assignments`.

No está aplicado el gateway de Storage (`source_file_storage_*` ausentes). Edge Functions: no relevadas (conector sin acceso).

## Consecuencias para el 21/10

1. Los 9 archivos se pensaron como "autocontenidos e idempotentes" para una base nueva. Sobre esta base hay **tablas existentes con otra forma**: `create table if not exists` no las va a alinear, y `08_exam_tables.sql` puede chocar con el `exam_enrollments` y el `exam_teacher_assignments` legacy. **Aplicar el runbook tal cual sobre Producción no está ensayado y puede fallar a mitad.**
2. Hace falta un **ensayo de migración** sobre una copia del esquema de Producción, sin datos, antes del GO (tarjeta PROD1).
3. El rollback de datos depende de backups/PITR (RB.1), y acá hay 434 usuarios reales. **P10 es crítico.**
4. Hoy probablemente está fallando la inscripción a mesas por la vía relacional en Producción (RPC ausente con `dual_write`). Conviene que Miguel lo confirme con los usuarios.

Evidencia: `PRODUCTION_DRIFT_COMPACT_2026-10-17.txt` (una línea `tipo|objeto|hash8`; sin datos personales).
