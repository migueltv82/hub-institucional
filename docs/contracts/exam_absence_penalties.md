# Contrato canónico: `exam_absence_penalties`

Fecha: 2026-09-27. Alcance original: ETAPA 02.8C-4A, contract/design only. No implementó SQL, no ejecutó migraciones, no modificó Supabase local/remoto y no migró datos reales.

Actualización 2026-09-28 / ETAPA 02.8C-4B: el modelo quedó implementado localmente como `public.exam_absence_penalties` en `supabase/schema/08_exam_tables.sql`. No se ejecutó SQL, no se crearon migrations, no se modificó Supabase local/remoto, no se migraron datos reales y no se implementó `public.upsert_exam_enrollment_from_portal`.

## Decisión 02.8C-4A

`MODELO CANÓNICO exam_absence_penalties DEFINIDO — LISTO PARA IMPLEMENTACIÓN`

No existe una fuente compat existente que pueda declararse autoritativa de forma segura para ausencia/castigo. Los rastros actuales (`snapshot.grades`, campos `ausente`/`fecha_ausencia` en UI, `student_grades.academic_status = absent` y tests de UX) sirven como evidencia histórica y espejo de experiencia, pero no cumplen simultáneamente:

- institución;
- identidad académica por `student_record_id`;
- materia/plan canonizados;
- mesa o convocatoria fuente;
- mesa o convocatoria bloqueada;
- fecha de ausencia;
- regla/vigencia de penalización;
- estado activo/inactivo;
- trazabilidad mínima de actor, fuente e idempotencia.

La fuente canónica queda definida como tabla propia: `public.exam_absence_penalties`.

## Fuentes investigadas

| Fuente | Estado | Decisión |
| --- | --- | --- |
| `src/modules/alumnos/lib/examEligibility.js` | Espejo UX: deriva castigo desde `grades` con `ausente` y `fecha_ausencia`. | No es autoridad server-side. |
| `src/modules/alumnos/services/studentPortalData.js` | Normaliza snapshot/planillas y conserva `ausente`/`fecha_ausencia`. | Compatibilidad de lectura, no modelo canónico. |
| `src/components/generadorCronograma/StudentRosterSection.jsx` | UI manual para marcar ausencia por materia en ficha académica. | Entrada operativa legacy, sin mesa canónica ni ciclo de penalidad. |
| `supabase/schema/07_academic_operations.sql` | `student_grades` permite `academic_status`; no tiene `fecha_ausencia`, `absence_date`, `absent_at`, mesa bloqueada ni vigencia. | Insuficiente como fuente compat. |
| `supabase/schema/08_exam_tables.sql` | Define mesas, inscripciones, penalidades por ausencia y eventos. | Base FK e implementación local del modelo nuevo desde 02.8C-4B. |
| `docs/ACADEMIC_LIFECYCLE_INTEGRAL_AUDIT_2026-07.md` | Clasifica “Sanción por ausencia” y “Bloqueo del próximo llamado” como MISSING. | Evidencia contra aceptar compat ambiguo. |
| `docs/adr/ADR-ACADEMIC-CATALOG-AND-COURSE-OFFERING.md` | Define `ExamPenalty` como entidad futura con alcance/vigencia. | Guía de diseño. |
| `docs/WORKLOG.md` | Registra que la migración histórica 15 habría portado la regla al servidor, pero no hay SQL versionado recuperable. | Evidencia histórica, no fuente ejecutable. |

## Modelo mínimo

### `exam_absence_penalties`

Campos conceptuales:

- `id uuid primary key`.
- `institution_id uuid not null`.
- `workspace_key text not null default 'main'`.
- `student_record_id uuid not null`.
- `student_id uuid null`: perfil/Auth del alumno, compatibilidad/RLS; no reemplaza al legajo.
- `student_career_plan_id uuid null`: plan/carrera vigente cuando la penalidad pueda asociarse sin ambigüedad.
- `subject_id text not null`: código canónico de materia para compatibilidad con `student_grades`/lectores actuales.
- `program_id text not null default ''`: carrera/programa canónico legacy; no debe ser autoridad única.
- `source_exam_table_id uuid null`.
- `source_exam_table_subject_id uuid null`.
- `source_enrollment_id uuid null`.
- `source_exam_result_id uuid null`: reservado para el futuro cierre de actas/resultados.
- `blocked_exam_table_id uuid null`.
- `blocked_exam_table_subject_id uuid null`.
- `blocked_exam_period_key text null`.
- `blocked_exam_call_key text null`.
- `absent_at timestamptz not null`.
- `penalty_from timestamptz not null`.
- `penalty_until timestamptz null`.
- `status text not null`.
- `scope_type text not null`.
- `reason_code text not null`.
- `source text not null`.
- `source_event_key text not null`.
- `absence_semantic_key text not null`.
- `created_by uuid null`: solo puede ser null para migraciones/importaciones técnicas identificadas por `source`.
- `created_at timestamptz not null`.
- `fulfilled_at timestamptz null`.
- `fulfilled_by uuid null`.
- `voided_at timestamptz null`.
- `voided_by uuid null`.
- `void_reason text null`.
- `metadata jsonb not null default '{}'::jsonb`.

### Estados

- `active`: bloquea inscripción.
- `pending_review`: falta resolver con certeza la mesa/alcance; la futura RPC debe tratarlo fail-closed solo dentro del mismo `institution_id` + `workspace_key` + `student_record_id` + `subject_id` + `program_id`.
- `fulfilled`: penalidad cumplida.
- `voided`: anulada por justificación/corrección administrativa.
- `expired`: vencida por regla institucional explícita.

### `scope_type`

Valor mínimo inicial:

- `next_exam_call_for_subject`: castigo asociado al siguiente llamado oficial de la misma materia/carrera.

Valores futuros permitidos por diseño, no habilitados hasta política institucional:

- `specific_exam_table_subject`
- `exam_period_for_subject`
- `manual_policy`

## Semántica

### ¿Qué evento genera una penalidad?

Una ausencia no justificada en una inscripción/resultado de examen oficial. Mientras no exista `exam_results`/`exam_acts`, el modelo permite carga administrativa o migración legacy, pero cada fila debe conservar `source`, `source_event_key` y referencias fuente suficientes.

Una ausencia justificada no debe crear una penalidad activa. Si una ausencia ya registrada se justifica después, la fila debe pasar a `voided` con `voided_by`, `voided_at` y `void_reason`.

La carga administrativa/importación no debe inferir por heurística libre: si no puede resolver carrera/programa, workspace, materia canónica y mesa fuente o destino, debe crear como máximo una fila `pending_review` y nunca una penalidad `active`.

### ¿Cuándo comienza?

La penalidad comienza cuando la ausencia queda registrada como evento académico autoritativo. `penalty_from` debe ser el instante desde el cual se considera vigente; por defecto puede coincidir con `absent_at` o con el cierre/carga oficial que la confirma, según el comando que la genere.

### ¿Qué mesa bloquea?

Debe bloquear de forma explícita, sin heurísticas al momento de inscribir.

Para `scope_type = 'next_exam_call_for_subject'`, el comando que crea o resuelve la penalidad debe elegir el primer llamado oficial futuro, no una mesa draft aislada. El llamado queda identificado por `blocked_exam_period_key` + `blocked_exam_call_key` dentro del mismo `institution_id` y `workspace_key`.

Regla mínima para resolver el llamado:

- considerar solo mesas oficiales con `exam_tables.status in ('confirmed', 'open')`;
- excluir `draft`, `teacher_review`, `cancelled`, `closed` y `completed` como destino nuevo;
- exigir misma materia/carrera operacional: `subject_id` + `program_id`;
- exigir que la primera mesa candidata del llamado tenga `scheduled_starts_at >= greatest(absent_at, penalty_from)`;
- si hay múltiples mesas del mismo llamado para la misma materia/carrera, bloquear todo el llamado con `blocked_exam_period_key` + `blocked_exam_call_key`;
- si no hay llamado oficial resoluble o hay empate ambiguo entre llamados, la penalidad debe quedar `pending_review`.

Una penalidad `active` con `scope_type = 'next_exam_call_for_subject'` aplica si el target pertenece al mismo `blocked_exam_period_key` + `blocked_exam_call_key`, al mismo `institution_id` + `workspace_key` + `subject_id` + `program_id`, y `target_exam.scheduled_starts_at` está dentro de `penalty_from`/`penalty_until`.

Una penalidad `active` con `scope_type = 'specific_exam_table_subject'` aplica si `target_exam_table_subject_id = blocked_exam_table_subject_id`, `target_exam.scheduled_starts_at >= penalty_from` y (`penalty_until is null` o `target_exam.scheduled_starts_at <= penalty_until`).

Una fila `active` debe tener destino resuelto: para `next_exam_call_for_subject`, `blocked_exam_period_key` y `blocked_exam_call_key` no pueden ser null; para `specific_exam_table_subject`, `blocked_exam_table_id` y `blocked_exam_table_subject_id` no pueden ser null. Si el destino no está resuelto, el estado correcto es `pending_review`, no `active`.

Si el llamado/mesa bloqueado se cancela, se reprograma de forma que deja de ser el primer llamado oficial aplicable, o aparece antes otra convocatoria oficial para la misma materia/carrera, el comando administrativo que modifica `exam_tables` debe re-resolver las penalidades afectadas en la misma operación o dejarlas `pending_review`. Hasta que eso ocurra, la futura RPC debe tratar una penalidad `active` cuyo destino ya no es oficial/aplicable como fail-closed equivalente a `pending_review` para el mismo `institution_id` + `workspace_key` + `student_record_id` + `subject_id` + `program_id`.

Si el proceso que crea la penalidad no puede resolver de forma determinista la mesa bloqueada, la penalidad queda en `pending_review`; la futura RPC debe responder `BLOCKED_BY_ABSENCE_PENALTY` para el mismo `institution_id` + `workspace_key` + `student_record_id` + `subject_id` + `program_id` hasta que se resuelva, se cumpla o se anule.

### ¿Bloquea por materia, convocatoria o período?

El contrato mínimo bloquea por materia y llamado/mesa, no por carrera completa. El alcance exacto se expresa con `scope_type`, `blocked_exam_table_subject_id`, `penalty_from` y `penalty_until`.

Si la institución decide un alcance distinto, debe configurarse/documentarse antes de activar la regla en production. No se fija un número arbitrario de días ni períodos en este contrato.

### ¿Cómo vence?

Vence por una de estas transiciones explícitas:

- `fulfilled`: el llamado bloqueado completo (`blocked_exam_period_key` + `blocked_exam_call_key`) o la mesa exacta bloqueada cerró/completó y el sistema registró que esa penalidad ya fue consumida; para el MVP puede hacerlo un comando administrativo o el futuro cierre de acta/resultado.
- `voided`: ausencia justificada o corrección administrativa.
- `expired`: regla institucional explícita con `penalty_until`.

Sin transición explícita, una penalidad `pending_review` no debe asumirse vencida por heurística de frontend. Una penalidad `active` con `blocked_exam_table_subject_id` exacto no debe bloquear mesas distintas a ese destino; si queda vieja sin transición, debe reportarse como deuda operativa, no ampliarse por inferencia.

### ¿Puede anularse administrativamente?

Sí, solo con motivo y actor: `voided_by`, `voided_at`, `void_reason`. La anulación debe ser auditable y no debe borrar la fila.

## Tenant boundaries

FKs compuestas requeridas e implementadas localmente en 02.8C-4B:

- `(institution_id, student_record_id) -> student_records(institution_id, id)`.
- `(institution_id, student_career_plan_id) -> student_career_plans(institution_id, id)`, cuando no sea null.
- `(institution_id, source_exam_table_id) -> exam_tables(institution_id, id)`, cuando no sea null.
- `(institution_id, source_exam_table_id, source_exam_table_subject_id) -> exam_table_subjects(institution_id, exam_table_id, id)`, cuando no sea null.
- `(institution_id, source_enrollment_id) -> exam_enrollments(institution_id, id)`, cuando no sea null.
- `(institution_id, blocked_exam_table_id) -> exam_tables(institution_id, id)`, cuando no sea null.
- `(institution_id, blocked_exam_table_id, blocked_exam_table_subject_id) -> exam_table_subjects(institution_id, exam_table_id, id)`, cuando no sea null.

Validaciones por trigger/RPC, no FK simple:

- `source_exam_table_id` y `source_exam_table_subject_id` deben ser ambos null o ambos no null.
- `blocked_exam_table_id` y `blocked_exam_table_subject_id` deben ser ambos null o ambos no null.
- `status = 'active' and scope_type = 'next_exam_call_for_subject'` exige `blocked_exam_period_key` y `blocked_exam_call_key` no null.
- `status = 'active' and scope_type = 'specific_exam_table_subject'` exige `blocked_exam_table_id` y `blocked_exam_table_subject_id` no null.
- La mesa fuente y la mesa bloqueada, si existen, deben pertenecer a la misma institución.
- `source_exam_table_subject_id` y `blocked_exam_table_subject_id` deben corresponder a la misma materia canónica y al mismo programa/carrera operacional salvo override administrativo explícito.
- `source_enrollment_id`, si existe, debe pertenecer al mismo `institution_id`, `workspace_key`, `student_record_id`, `source_exam_table_id` y `source_exam_table_subject_id`; no alcanza con que la FK exista.
- `student_career_plan_id`, si existe, debe pertenecer al mismo `student_record_id`.
- `subject_id`/`program_id` deben derivarse o validarse contra la materia/carrera canónica, no confiarse desde el cliente.

## Identidad

La identidad académica es `student_record_id`.

`student_id` solo ayuda a compatibilidad/RLS y debe validarse contra `student_records.profile_id` cuando exista. La regla no debe usar `user_metadata` ni IDs cliente sin validar.

## RLS y privilegios

La implementación SQL local 02.8C-4B arranca default-deny:

- RLS habilitado en `exam_absence_penalties`.
- Sin `INSERT`, `UPDATE` ni `DELETE` directos para `anon` ni `authenticated`.
- Sin grants a `public`.
- Lectura de alumno: como máximo sus propias penalidades por `student_id = auth.uid()` o `student_record_id` validado contra su perfil, y solo campos necesarios para explicar el bloqueo.
- Lectura docente: no por defecto; solo mediante read model o RPC institucional si el flujo de actas lo requiere.
- Admin institucional: lectura dentro de su institución/workspace; cambios solo mediante comandos/RPC con motivo y auditoría.
- Escritura: exclusivamente comandos server-side/RPC administrativas o de cierre de acta/resultado, con validación interna de rol/tenant/actor.
- Edge/service-role puede ejecutar comandos necesarios, pero las funciones deben validar actor, tenant, estado y motivo; no confiar en `service_role` como permiso de negocio.

La futura RPC de inscripción no crea/anula/cumple penalidades; solo consulta la fuente canónica para decidir elegibilidad.

## Idempotencia

La implementación debe evitar duplicados por doble procesamiento, retry, reimportación o repetición del mismo evento.

Llave natural recomendada:

- `unique (institution_id, source_event_key)`.
- `unique (institution_id, absence_semantic_key)` para la misma ausencia académica aunque llegue por snapshot, importación o carga manual.

Formato conceptual de `source_event_key`:

- `exam_enrollment:<source_enrollment_id>:absent`
- `exam_result:<source_exam_result_id>:absent`
- `legacy:<legacy_snapshot_id>:<student_record_id>:<subject_id>:<absent_at>`
- `admin_manual:<stable_client_mutation_id>`

Formato conceptual de `absence_semantic_key`:

- `<workspace_key>:<student_record_id>:<subject_id>:<program_id>:<absent_at-iso-or-source-result-id>:<scope_type>`

Si una importación o carga manual detecta una fila existente con la misma `absence_semantic_key`, debe actualizar/conciliar esa fila mediante comando auditado o reportar conflicto; no debe crear una segunda penalidad paralela.

Además, para penalidades activas con destino resuelto:

- impedir más de una penalidad `active`/`pending_review` para el mismo `(institution_id, workspace_key, student_record_id, subject_id, program_id, blocked_exam_period_key, blocked_exam_call_key)` cuando `scope_type = 'next_exam_call_for_subject'` y las keys no sean null.
- impedir más de una penalidad `active`/`pending_review` para el mismo `(institution_id, workspace_key, student_record_id, subject_id, program_id, blocked_exam_table_subject_id)` cuando `scope_type = 'specific_exam_table_subject'` y `blocked_exam_table_subject_id` no sea null.
- impedir más de una penalidad `pending_review` sin destino para el mismo `(institution_id, workspace_key, student_record_id, subject_id, program_id, scope_type, absent_at)` o equivalente implementable por `absence_semantic_key`. Si el origen legacy solo tiene fecha sin hora, la importación debe conservar esa granularidad en `absence_semantic_key` y reportar posibles colisiones en preflight.

## Auditoría y trazabilidad

La tabla conserva trazabilidad mínima suficiente para la primera implementación:

- fuente (`source`, `source_event_key`);
- identidad semántica deduplicable (`absence_semantic_key`);
- referencias al evento fuente;
- actor de creación/anulación/cumplimiento;
- timestamps;
- motivo (`reason_code`, `void_reason`);
- metadata mínima.

No se requiere un event ledger separado para desbloquear 02.8C-4. Si después se implementan actas/resultados con alto volumen de correcciones, se puede agregar `exam_absence_penalty_events` sin cambiar la identidad de la penalidad.

Invariantes mínimas de transición:

- `reason_code` debe ser no vacío.
- `created_by` puede ser null solo cuando `source in ('legacy_migration', 'compat_import', 'system')` y `source_event_key` identifica la fuente.
- `voided` exige `voided_at` y `void_reason`; `voided_by` solo puede ser null para corrección técnica/importación identificada.
- `fulfilled` exige `fulfilled_at`; `fulfilled_by` puede ser null si lo marca un cierre automático de mesa/acta identificado en `metadata`.
- Las transiciones no deben borrar la fila ni sobrescribir `source_event_key`.
- Las conciliaciones de fuentes equivalentes deben preservar la fila original, sumar evidencia mínima en `metadata` o evento futuro y no cambiar `absence_semantic_key` salvo corrección administrativa auditada.

## Integración con `public.upsert_exam_enrollment_from_portal`

La futura RPC debe consultar `exam_absence_penalties` dentro de la misma transacción que valida identidad, regularidad, correlativas, deuda y upsert/cancelación.

Para alta `registered`, debe responder determinísticamente:

- `ELIGIBLE`: no existe penalidad activa ni pendiente aplicable.
- `BLOCKED_BY_ABSENCE_PENALTY`: existe penalidad `active` de llamado para el mismo `exam_period_key` + `exam_call_key` + `institution_id` + `workspace_key` + `student_record_id` + `subject_id` + `program_id` dentro de su ventana `penalty_from`/`penalty_until`; o existe penalidad `active` exacta para `blocked_exam_table_subject_id = target_exam_table_subject_id`; o existe penalidad `pending_review` para el mismo `institution_id` + `workspace_key` + `student_record_id` + `subject_id` + `program_id` cuya ausencia ocurrió antes de la mesa objetivo; o existe una penalidad `active` obsoleta por cancelación/reprogramación no reconciliada para ese mismo contexto.

La RPC no debe derivar castigos desde `snapshot.grades`, `student_grades.metadata`, `user_metadata` ni heurísticas de frontend.

Cancelaciones no deben crear, cumplir ni anular penalidades salvo contrato administrativo separado.

## Migración / legacy

Estrategia conceptual:

1. No borrar ni reescribir legacy en este paso.
2. Preflight read-only para detectar:
   - filas de snapshot con `ausente`/`fecha_ausencia`;
   - `student_grades.academic_status = 'absent'`;
   - ausencia de `student_record_id`;
   - materias sin match canónico;
   - mesas fuente/bloqueadas no resolubles;
   - duplicados por alumno/materia/fecha.
3. Backfill futuro solo a `pending_review` cuando no pueda resolverse mesa bloqueada con certeza.
4. Backfill a `active` solo cuando se pueda derivar sin ambigüedad `student_record_id`, materia canónica, fuente, fecha y destino de castigo.
5. Orphans o duplicados quedan en reporte; no se fusionan silenciosamente.

## Riesgos residuales

| Severidad | Riesgo |
| --- | --- |
| P1 | La política institucional exacta de duración/alcance debe confirmarse antes de production si se quiere algo distinto de “siguiente llamado/materia”. |
| P2 | Existe SQL local en `supabase/schema/08_exam_tables.sql`, pero falta validación dinámica de `exam_absence_penalties` en PostgreSQL local/staging descartable. |
| P2 | Datos legacy pueden no tener mesa fuente/destino resoluble y requerir revisión humana. |
| P3 | Un event ledger propio puede ser conveniente si crecen las correcciones administrativas. |

## Confirmación de alcance

- SQL funcional modificado: SÍ, local-only en `supabase/schema/08_exam_tables.sql` durante 02.8C-4B.
- Runtime modificado: NO.
- Migrations creadas: NO.
- Supabase CLI ejecutada: NO.
- Staging/Production modificados: NO.
- Service-role utilizada: NO.
- Secrets expuestos: NO.

REMOTE MUTATIONS: NONE.
