# Modelo canonico de mesas de examen

Fecha: 2026-09-26. Alcance: ETAPA 02.8C-2, contract/data model design only. No implementa tablas, RPC, SQL funcional, migraciones ni runtime. No ejecuta Supabase CLI y no modifica Staging ni Production.

## 1. Inventario encontrado

| Artefacto | Clasificacion | Evidencia | Uso en el modelo |
| --- | --- | --- | --- |
| `careers`, `study_plans`, `subjects`, `study_plan_subjects`, `subject_prerequisites`, `student_records`, `student_career_plans`, `student_academic_statuses`, `teacher_records`, `teacher_subject_assignments` | CANONICAL | `supabase/schema/02_academic_relational_schema.sql` | Base academica y tenant-safe para carreras, planes, materias, correlativas, alumnos y docentes. |
| `subject_enrollments`, `student_grades`, `student_financial_status` | CANONICAL | `supabase/schema/07_academic_operations.sql` | Fuente actual para regularidad, notas/condicion academica y deuda. |
| `workspace_snapshots`, `exam_engine_v21_states` | CANONICAL de workspace/engine, no canonico de mesa | `supabase/schema/03_workspace_data.sql` | Persistencia legacy/operativa; no debe ser FK academica de inscripcion. |
| `teacher_exam_date_exclusions` | CANONICAL auxiliar | `supabase/schema/04_teacher_exam_date_exclusions.sql` | Restricciones de disponibilidad docente para generacion/revision. |
| `legacy_exam_sessions` | HISTORICAL / COMPATIBILITY | `supabase/schema/05_workspace_operational_compat.sql:159-217` | Mapeo legacy del cronograma; no debe seguir siendo identidad canonica. |
| `workspaceSnapshot.cronograma` | RUNTIME CONTRACT legacy | `supabase/schema/05_student_portal_secure_read.sql:202-224`, `src/components/GeneradorCronograma.jsx:478-502` | Fuente de lectura transicional; debe migrarse a `exam_tables`. |
| `exam_teacher_assignments` repair | REPAIR | `supabase/docs/repair_06_exam_teacher_assignments.sql:27-115` | Evidencia de columnas y flujos docentes, pero no baseline. |
| `exam_enrollments` repair | REPAIR | `supabase/docs/repair_06_exam_teacher_assignments.sql:116-145` | Evidencia de inscripciones, pero `exam_table_id text` queda obsoleto. |
| `academic_*exam_assignment` RPC repair | REPAIR / RUNTIME CONTRACT parcial | `supabase/docs/repair_06_exam_teacher_assignments.sql:247-516` | Flujo docente confirmado/objetado a redisenar sobre FK real. |
| `academic_admin_reset_exam_process` | REPAIR | `supabase/docs/repair_06_exam_process_reset_rpc.sql:15-87` | Reset historico; no debe borrar inscripciones canonicas. |
| `upsert_exam_enrollment_from_portal` | RUNTIME CONTRACT faltante | `docs/contracts/upsert_exam_enrollment_from_portal.md` | RPC a desbloquear despues de este modelo. |
| Portal alumno y Edge Function `admin-users` | RUNTIME CONTRACT | `src/modules/alumnos/...`, `supabase/functions/admin-users/index.ts:2533-2584` | Caller actual: status `registered`/`dropped`, `exam_table_id` textual legacy. |
| ADR academica | CANONICAL DESIGN GUIDANCE | `docs/adr/ADR-ACADEMIC-CATALOG-AND-COURSE-OFFERING.md:185-194` | Define `ExamTable -> ExamEnrollment -> ExamAct -> ExamResult`. |
| Auditoria lifecycle | HISTORICAL AUDIT | `docs/ACADEMIC_LIFECYCLE_INTEGRAL_AUDIT_2026-07.md:185-202` | Confirma brecha: mesa oficial en snapshot mutable y `exam_table_id` sin FK. |
| Tests de visibilidad de mesas | TEST | `supabase/security/student_portal_exam_visibility_tests.sql` | Evidencia de reglas de visibilidad snapshot y pending teacher confirmations. |

Busqueda en historial local: 02.8C-1 ya confirmo que no hay `create function` local recuperable para `public.upsert_exam_enrollment_from_portal`; las menciones historicas no aportan una implementacion SQL autoritativa.

## 2. Modelo actual reconstruido

El estado real combina tres capas:

1. Catalogo academico relacional: carreras, planes, materias, legajos, correlativas, docentes y estados academicos viven en `supabase/schema/02_academic_relational_schema.sql`.
2. Operacion academica parcial: regularidad/calificaciones/deuda viven en `supabase/schema/07_academic_operations.sql`.
3. Mesas de examen no canonicas: el cronograma oficial que ve el alumno proviene de `workspace_snapshots.payload->'cronograma'`; `legacy_exam_sessions` conserva ids textuales; `exam_teacher_assignments` y `exam_enrollments` solo existen en repairs historicos.

La consecuencia bloqueante es que la inscripcion a mesa no puede validar estructuralmente:

- que la mesa exista como entidad academica oficial;
- que la materia/carrera de la mesa correspondan al catalogo canonico;
- que `exam_enrollments.exam_table_id` apunte por FK a la mesa;
- que un docente asignado pertenezca al mismo tenant;
- que los estados de inscripcion sean consistentes entre runtime y DB.

## 3. Modelo canonico propuesto

El bloque canonico minimo es:

1. `exam_tables`: entidad oficial de mesa/turno/call en un tenant y workspace. No posee una unica carrera autoritativa porque el motor permite mesas compactadas intercarrera.
2. `exam_table_subjects`: materias/carreras/planes canonicos incluidos en la mesa. Es obligatorio porque el motor soporta `materiasAgrupadas`; una mesa puede representar una o mas materias/plan-subjects y una o mas carreras permitidas por reglas del motor.
3. `exam_teacher_assignments`: tribunal asociado por FK real a la mesa y al docente.
4. `exam_enrollments`: inscripcion de un legajo a una mesa/materia canonica.
5. `exam_enrollment_events`: ledger append-only minimo para alta/cancelacion/correccion y trazabilidad de idempotencia.
6. `exam_table_events`: ledger append-only minimo para creacion, publicacion, apertura, cierre, cancelacion y cambios de tribunal/estado.

Entidades diferidas pero previstas por FK/extension posterior, sin bloquear este contrato:

- `exam_acts`, `exam_results`.
- `exam_absence_penalties` queda definido contractualmente en `docs/contracts/exam_absence_penalties.md` como entidad canonica de ausencia/castigo pendiente de implementacion SQL. No cambia PK, FKs, estados ni tenant boundaries de mesas e inscripciones definidos aqui.

Decision de identidad: los consumidores nuevos deben referenciar `exam_tables.id` (`uuid`). Los ids textuales historicos se conservan como `legacy_exam_table_id` y nunca vuelven a ser FK.

## 4. Entidades y campos

### `exam_tables`

Representa una mesa oficial o candidata a oficial dentro de una institucion/workspace.

Campos conceptuales:

- `id uuid primary key`.
- `institution_id uuid not null`.
- `workspace_key text not null`.
- `primary_career_id uuid null`: solo display/compatibilidad para mesas simples; no es autoridad de elegibilidad ni FK usada por inscripciones.
- `primary_study_plan_id uuid null`: solo display/compatibilidad para mesas simples; no es autoridad de elegibilidad.
- `exam_period_key text not null`: periodo/turno institucional, por ejemplo `2026-12`.
- `exam_call_key text not null`: llamado dentro del periodo, por ejemplo `first`, `second` o codigo institucional.
- `exam_call_label text not null`.
- `exam_type text not null`: `regular` o `special`.
- `modality text null`: presencial/virtual/hibrida si el negocio lo carga.
- `scheduled_starts_at timestamptz not null`.
- `scheduled_ends_at timestamptz null`.
- `room text null`.
- `capacity integer null`.
- `enrollment_opens_at timestamptz not null`.
- `enrollment_closes_at timestamptz not null`.
- `closed_at timestamptz null`.
- `status text not null`.
- `legacy_exam_table_id text null`.
- `legacy_snapshot_id text null`.
- `source text not null`: `exam_engine_v21`, `legacy_snapshot`, `admin_manual`, etc.
- `metadata jsonb not null default '{}'`.
- `lock_version integer not null default 1`.
- `created_by uuid null`.
- `updated_by uuid null`.
- `created_at`, `updated_at`.

Justificacion de campos:

- `institution_id` y `workspace_key`: necesarios para RLS, compatibilidad operativa y evitar joins ambiguos contra snapshot.
- `primary_career_id`/`primary_study_plan_id`: conservan compatibilidad visual en mesas simples. La autoridad academica vive en `exam_table_subjects` para soportar compactacion multicarrera/multiplan sin elegir una carrera arbitraria.
- `exam_period_key`/`exam_call_key`: modelan llamados sin inventar aun una tabla de periodos.
- `legacy_*`: migracion sin perdida y compatibilidad de callers existentes.
- `lock_version`: cierre/apertura y cambios administrativos concurrentes.

### `exam_table_subjects`

Relaciona la mesa con una o mas materias canonicas.

Campos conceptuales:

- `id uuid primary key`.
- `institution_id uuid not null`.
- `exam_table_id uuid not null`.
- `career_id uuid not null`.
- `study_plan_id uuid null`.
- `study_plan_subject_id uuid not null`.
- `subject_id uuid not null`.
- `display_order integer not null default 1`.
- `is_primary boolean not null default false`.
- `legacy_subject_id text null`.
- `legacy_program_id text null`.
- `metadata jsonb not null default '{}'`.

La mesa simple tendra una fila; una mesa compactada por el motor tendra varias, incluso de carreras distintas cuando las reglas de compactacion intercarrera lo permitan. El RPC valida que `target_subject_id`/`target_program_id` correspondan exactamente a una fila de esta tabla, no al texto enviado por el cliente.

### `exam_teacher_assignments`

Forma parte obligatoria del baseline porque la visibilidad de mesas de alumno hoy depende de confirmaciones docentes y porque el flujo docente/admin ya existe como repair/runtime.

Campos conceptuales:

- `id uuid primary key`.
- `institution_id uuid not null`.
- `workspace_key text not null`.
- `exam_table_id uuid not null`.
- `exam_table_subject_id uuid null`: null cuando el rol aplica a toda la mesa; informado cuando preserva titularidad/tribunal cruzado de una materia agrupada especifica. Si se informa, debe pertenecer al mismo `exam_table_id` de la asignacion.
- `teacher_record_id uuid not null`.
- `teacher_id uuid null`: perfil/auth user id usado por callers actuales; compatibilidad transicional y RLS docente.
- `role text not null`: `TITULAR`, `VOCAL_1`, `VOCAL_2`, `TRIBUNAL_CRUZADO`.
- `status text not null`: `active`, `inactive`.
- `confirmation_status text not null`: `pending`, `confirmed`, `objected`, `reset`.
- `objection_reason text null`.
- `objection_deadline timestamptz null`.
- `confirmed_at`, `objected_at`, `reset_at`.
- `created_by`, `updated_by`.
- `metadata jsonb not null default '{}'`.
- `lock_version integer not null default 1`.
- `created_at`, `updated_at`.

### `exam_enrollments`

Representa la inscripcion de un legajo a una mesa y materia canonica.

Campos conceptuales:

- `id uuid primary key`.
- `institution_id uuid not null`.
- `workspace_key text not null`.
- `exam_table_id uuid not null`.
- `exam_table_subject_id uuid not null`.
- `student_id uuid not null`: usuario/profile del alumno, para compatibilidad y RLS.
- `student_record_id uuid not null`: legajo canonico; es la identidad academica para deduplicar.
- `student_career_plan_id uuid not null`: carrera/plan vigente del legajo.
- `subject_id text not null`: codigo canonico legacy de materia para lectores actuales; se deriva/valida contra `exam_table_subjects`, no contra input crudo.
- `program_id text not null`: nombre/codigo canonico legacy de carrera para lectores actuales; se deriva/valida contra `exam_table_subjects`, no contra input crudo.
- `status text not null`: vocabulario canonico definido abajo.
- `enrolled_at timestamptz null`.
- `cancelled_at timestamptz null`.
- `created_by uuid null`.
- `cancelled_by uuid null`.
- `client_mutation_id text null`.
- `client_request_hash text null`: hash conceptual del payload normalizado para detectar reuso inseguro del idempotency key.
- `legacy_snapshot_id text null`.
- `legacy_enrollment_id text null`.
- `deleted_at timestamptz null`: compatibilidad transicional porque lectores actuales filtran `deleted_at is null`; el modelo canonico no lo usa para cancelar.
- `metadata jsonb not null default '{}'`.
- `lock_version integer not null default 1`.
- `created_at`, `updated_at`.

No se recomienda `deleted_at` como mecanismo canonico. Se conserva como columna transicional por compatibilidad con lectores actuales; debe permanecer `null` para filas canonicas y la historia academica se preserva por estado y eventos.

### `exam_enrollment_events`

Ledger append-only para acciones sobre inscripciones.

Campos conceptuales:

- `id uuid primary key`.
- `institution_id uuid not null`.
- `exam_enrollment_id uuid not null`.
- `event_type text not null`: `registered`, `cancelled`, `reactivated`, `rejected`, `corrected`.
- `actor_user_id uuid null`.
- `reason_code text null`.
- `client_mutation_id text null`.
- `request_hash text null`.
- `metadata jsonb not null default '{}'`.
- `created_at timestamptz not null`.

### `exam_table_events`

Ledger append-only para ciclo de vida de la mesa.

Campos conceptuales:

- `id uuid primary key`.
- `institution_id uuid not null`.
- `exam_table_id uuid not null`.
- `event_type text not null`: `created`, `published_for_review`, `teacher_assignment_changed`, `confirmed`, `opened`, `closed`, `cancelled`, `completed`, `corrected`.
- `actor_user_id uuid null`.
- `reason_code text null`.
- `metadata jsonb not null default '{}'`.
- `created_at timestamptz not null`.

## 5. PK/FK/UNIQUE/CHECK conceptuales

### Primary keys

- Todas las nuevas entidades usan `uuid primary key`.
- Se mantiene consistencia con el repo actual, que ya usa `gen_random_uuid()` en foundation/academico. Si el baseline futuro adopta UUIDv7/ULID, puede cambiar el generador sin cambiar el tipo contractual.

### Foreign keys

- `exam_tables.institution_id -> institutions.id`.
- `(exam_tables.institution_id, exam_tables.primary_career_id) -> careers(institution_id, id)`, cuando no sea null y solo para display/compatibilidad.
- `(exam_tables.institution_id, exam_tables.primary_study_plan_id) -> study_plans(institution_id, id)`, cuando no sea null y solo para display/compatibilidad.
- `(exam_table_subjects.institution_id, exam_table_subjects.exam_table_id) -> exam_tables(institution_id, id)`.
- `(exam_table_subjects.institution_id, exam_table_subjects.career_id) -> careers(institution_id, id)`.
- `(exam_table_subjects.institution_id, exam_table_subjects.study_plan_id) -> study_plans(institution_id, id)`, cuando no sea null.
- `(exam_table_subjects.institution_id, exam_table_subjects.study_plan_subject_id) -> study_plan_subjects(institution_id, id)`.
- `(exam_table_subjects.institution_id, exam_table_subjects.subject_id) -> subjects(institution_id, id)`.
- `(exam_teacher_assignments.institution_id, exam_teacher_assignments.exam_table_id) -> exam_tables(institution_id, id)`.
- `(exam_teacher_assignments.institution_id, exam_teacher_assignments.exam_table_id, exam_teacher_assignments.exam_table_subject_id) -> exam_table_subjects(institution_id, exam_table_id, id)`, cuando `exam_table_subject_id` no sea null; si PostgreSQL exige soporte, agregar unique/index equivalente en `exam_table_subjects(institution_id, exam_table_id, id)`.
- `(exam_teacher_assignments.institution_id, exam_teacher_assignments.teacher_record_id) -> teacher_records(institution_id, id)`.
- `(exam_enrollments.institution_id, exam_enrollments.exam_table_id) -> exam_tables(institution_id, id)`.
- `(exam_enrollments.institution_id, exam_enrollments.exam_table_id, exam_enrollments.exam_table_subject_id) -> exam_table_subjects(institution_id, exam_table_id, id)`.
- `(exam_enrollments.institution_id, exam_enrollments.student_record_id) -> student_records(institution_id, id)`.
- `(exam_enrollments.institution_id, exam_enrollments.student_career_plan_id) -> student_career_plans(institution_id, id)`.

### Unique constraints / indexes

- `exam_tables`: unique parcial `(institution_id, workspace_key, legacy_exam_table_id)` where `legacy_exam_table_id is not null`.
- `exam_tables`: unique operativa adicional solo si la migracion demuestra una llave no colisionante por periodo/llamado/fecha/aula/source/legacy id. No debe incluir una unica `career_id` autoritativa ni reemplazar al PK.
- `exam_table_subjects`: unique `(institution_id, exam_table_id, study_plan_subject_id)`.
- `exam_table_subjects`: unique `(institution_id, exam_table_id, id)` para FKs hijas que deban probar pertenencia a la misma mesa.
- `exam_table_subjects`: unique parcial `(institution_id, exam_table_id) where is_primary = true`.
- `exam_teacher_assignments`: unique parcial `(institution_id, exam_table_id, role) where status = 'active' and exam_table_subject_id is null and role in ('TITULAR','VOCAL_1','VOCAL_2')`.
- `exam_teacher_assignments`: unique parcial `(institution_id, exam_table_subject_id, role) where status = 'active' and exam_table_subject_id is not null`.
- `exam_teacher_assignments`: unique parcial `(institution_id, exam_table_id, teacher_record_id, coalesce(exam_table_subject_id, exam_table_id)) where status = 'active'` expresada en implementacion como indice funcional o constraint equivalente segura.
- `exam_enrollments`: unique parcial `(institution_id, exam_table_subject_id, student_record_id) where status = 'registered'`.
- `exam_enrollments`: unique parcial `(institution_id, student_id, client_mutation_id) where client_mutation_id is not null`.
- `exam_enrollment_events`: index `(institution_id, exam_enrollment_id, created_at)`.
- `exam_table_events`: index `(institution_id, exam_table_id, created_at)`.

La llave de idempotencia academica es `institution_id + exam_table_subject_id + student_record_id` para filas activas. Parte del analisis minimo `institution + exam_table + student`, pero agrega la materia canonica porque el motor soporta mesas agrupadas (`materiasAgrupadas`) y una mesa puede contener mas de una unidad academica rendible. No incluye `workspace_key`, `career_id` ni textos `subject_id`/`program_id` porque `exam_table_subject_id` ya cuelga por FK de una mesa tenant-safe y de `study_plan_subjects`; usar textos del cliente permitiria duplicados o bypass.

### Checks

- `exam_tables.enrollment_opens_at < exam_tables.enrollment_closes_at`.
- `exam_tables.scheduled_ends_at is null or scheduled_ends_at > scheduled_starts_at`.
- `exam_tables.capacity is null or capacity > 0`.
- `exam_tables.lock_version >= 1`.
- `exam_tables.status in ('draft','teacher_review','confirmed','open','closed','cancelled','completed')`.
- `exam_tables.exam_type in ('regular','special')`.
- `exam_teacher_assignments.role in ('TITULAR','VOCAL_1','VOCAL_2','TRIBUNAL_CRUZADO')`.
- `exam_teacher_assignments.status in ('active','inactive')`.
- `exam_teacher_assignments.confirmation_status in ('pending','confirmed','objected','reset')`.
- `exam_enrollments.status in ('registered','cancelled')`.
- `exam_enrollments.lock_version >= 1`.
- `exam_enrollments.cancelled_at is not null` when `status = 'cancelled'`.

### Reglas por trigger/RPC, no FK simple

- `exam_table_subjects.study_plan_subject_id` debe pertenecer al `study_plan_id`/`career_id` declarados en la misma fila de `exam_table_subjects`. Las tablas actuales no tienen una FK compuesta directa que lo garantice sin agregar constraints auxiliares; el RPC de publicacion y/o trigger debe validarlo.
- `exam_enrollments.student_career_plan_id` debe pertenecer al mismo legajo y a la `career_id`/`study_plan_id` de la fila `exam_table_subjects` elegida.
- Una inscripcion solo puede crearse si la mesa esta `open`, no vencida y con tribunal confirmado.
- Capacidad maxima, si se usa, requiere lock/update atomico contra la mesa o contador derivado transaccional.

## 6. Estados y transiciones

### Estados de mesa

| Estado canonico | Significado | Transiciones permitidas | Terminal | Compatibilidad historica |
| --- | --- | --- | --- | --- |
| `draft` | Mesa generada/preparada, no visible para alumno. | `teacher_review`, `cancelled` | No | Precronograma/borrador del motor. |
| `teacher_review` | Tribunal publicado para confirmacion/objecion docente. | `confirmed`, `cancelled`, `draft` por reset auditado | No | `exam_teacher_assignments.confirmation_status = pending`. |
| `confirmed` | Tribunal listo; aun no necesariamente abierta a alumnos. | `open`, `cancelled`, `teacher_review` por correccion auditada | No | `estado = confirmada` en cronograma legacy. |
| `open` | Inscripcion estudiantil habilitada. | `closed`, `cancelled` | No | Cronograma visible con `auto_enrollment_enabled = true`. |
| `closed` | Padron cerrado; no acepta altas/cancelaciones normales. | `completed`, `cancelled` por caso administrativo | No | Cierre de inscripcion faltante hoy. |
| `cancelled` | Mesa anulada. | Ninguna salvo correccion administrativa excepcional por nueva mesa | Si | Reset/anulacion actual. |
| `completed` | Acta/resultados cerrados. | Ninguna salvo correccion auditada fuera de esta tabla | Si | Futuro acta/resultado. |

### Estados de inscripcion

| Estado canonico | Significado | Transiciones permitidas | Terminal | Compatibilidad historica |
| --- | --- | --- | --- | --- |
| `registered` | Alumno inscripto activamente. | `cancelled` antes del cierre; permanece tras `closed/completed` como padron historico | No como fila, si como registro historico tras cierre | Mapea desde `registered`, `active`, `enrolled`, `pending` si la migracion valida que eran altas reales. |
| `cancelled` | Inscripcion cancelada por alumno/admin antes del cierre o por correccion. | `registered` solo por reactivacion explicita antes de cierre, auditada con evento `reactivated` | No antes del cierre; terminal despues del cierre | Mapea desde `dropped`, `cancelled`; no debe borrarse. |

Se descartan como estados canonicos:

- `active`: redundante con `registered`.
- `enrolled`: redundante con `registered`.
- `pending`: ambiguo; si existe validacion asincronica debe modelarse como evento/rechazo, no como inscripcion activa.
- `dropped`: se normaliza a `cancelled` porque es el vocabulario legacy del frontend/snapshot.

## 7. Modelo de inscripciones

`exam_enrollments` se escribe solo por RPC o proceso server-side equivalente. El cliente nunca decide tenant, carrera, materia o elegibilidad.

Alta:

1. Resolver `exam_table_id` canonico. Durante transicion, si llega texto legacy, buscar `exam_tables.legacy_exam_table_id` dentro de `(institution_id, workspace_key)`.
2. Validar actor/autenticacion: alumno autenticado sobre si mismo, o Edge/service-role con actor/target explicitamente validados.
3. Validar `student_record_id`, `student_career_plan_id` y pertenencia al tenant/carrera/plan de la mesa.
4. Validar que `exam_table_subject_id` corresponde a la materia exacta pedida.
5. Validar mesa `open`, dentro de ventana, no `special` admin-only salvo flujo admin.
6. Validar regularidad, correlativas aprobadas, ausencia/castigo y deuda.
7. Insertar o reactivar de forma atomica con unique `(institution_id, exam_table_subject_id, student_record_id) where status='registered'`.
8. Escribir evento append-only.

Cancelacion:

1. Resolver inscripcion propia activa por `(institution_id, exam_table_subject_id, student_record_id)`.
2. Validar ventana de cancelacion antes de cierre.
3. Actualizar `status = 'cancelled'`, `cancelled_at`, `cancelled_by`, `lock_version + 1`.
4. Escribir evento append-only.
5. Repetir cancelacion debe devolver la misma fila cancelada o un resultado idempotente equivalente, sin crear filas nuevas.

## 8. Teacher assignments

`exam_teacher_assignments` es parte del baseline obligatorio, no un modulo opcional, por tres razones:

1. La visibilidad segura del alumno depende de que no haya confirmaciones pendientes/objetadas.
2. El portal docente ya tiene contrato de confirmar/objetar.
3. El reset/admin review actual ya opera sobre esta entidad, aunque como repair.

Restricciones minimas:

- Una mesa activa requiere exactamente un `TITULAR`, un `VOCAL_1` y un `VOCAL_2` de alcance mesa (`exam_table_subject_id is null`) antes de pasar a `confirmed`.
- En mesas agrupadas, las titularidades/casos `TRIBUNAL_CRUZADO` por materia se preservan con `exam_table_subject_id` informado. Esto evita perder el titular institucional de una materia compactada cuando el tribunal logistico de la mesa es compartido.
- Un mismo `teacher_record_id` no puede ocupar dos roles activos en la misma mesa con el mismo alcance; duplicidades intencionales entre alcance mesa y alcance materia requieren evento auditado.
- Cada docente asignado debe pertenecer a la misma `institution_id`.
- `teacher_id`, si existe, debe resolver al perfil vinculado del `teacher_record_id`; RLS docente debe usar esta relacion, no un email ni metadata del cliente.
- Confirmacion/objecion docente solo puede mutar su propia asignacion y solo campos de confirmacion, no la mesa ni otros docentes.

## 9. Multi-tenancy

El modelo conserva `institution_id` redundante en todas las tablas hijas. Esta redundancia esta justificada porque:

- permite RLS simple y verificable por tenant;
- permite FKs compuestas `(institution_id, id)` que impiden referencias cross-tenant;
- evita que un UUID valido de otra institucion sea aceptado por una inscripcion manipulada;
- facilita auditoria y particion logica sin depender de joins profundos.

Controles por amenaza:

| Amenaza | Control canonico |
| --- | --- |
| Mesa de institucion A con carrera B | FK compuesta en `exam_table_subjects(institution_id, career_id) -> careers(institution_id, id)` y validacion RPC/trigger de plan-subject. |
| Alumno A inscripto en mesa B | FKs compuestas a `student_records`, `student_career_plans`, `exam_tables` y `exam_table_subjects`; validacion de membresia y actor. |
| Docente A asignado a mesa B | FK compuesta a `teacher_records`; RLS docente por `teacher_id` vinculado a `auth.uid()`. |
| IDs manipulados cross-tenant | Todas las busquedas usan `(institution_id, id)`; no se resuelve por `id` solo. |
| Workspace equivocado | `workspace_key` vive en mesa e inscripcion; al resolver legacy id se exige `(institution_id, workspace_key, legacy_exam_table_id)`. |

## 10. RLS conceptual

Separar READ de WRITE.

### Alumno

- SELECT: solo sus propias `exam_enrollments` por `student_id = auth.uid()` y mesas `open/closed/completed` que correspondan a su institucion/carrera, sin exponer inscripciones de otros alumnos.
- INSERT/UPDATE/DELETE directo: no permitido. Alta/cancelacion via RPC.

### Docente

- SELECT: sus propias `exam_teacher_assignments` y metadatos minimos de la mesa asociada.
- UPDATE directo: no recomendado. Confirmar/objetar via RPC con validacion de `teacher_id = auth.uid()` y consistencia con `teacher_record_id`.
- Sin acceso a padrones completos salvo rol institucional explicito.

### Lectura docente v1 implementada localmente

Policy SELECT propia para authenticated: teacher_id = auth.uid(), membership
institucional, institucion activa y legajo vinculado al mismo perfil, tenant y
workspace_key. El perfil debe ser docente y no estar bloqueado. El legajo es
el vinculo autorizado de workspace; no se usa la seleccion del frontend.
Una identidad con vinculos validos en varios tenants puede leer sus propias
asignaciones en cada uno. No hay bypass superadmin en esta policy.

status='active' pertenece al reader, no a RLS: las asignaciones propias inactivas
siguen siendo legibles. No se abren escrituras ni lectura de exam_tables.
Se reutiliza is_member_of_institution; no se crea SECURITY DEFINER ni GRANT.
Los lookups a profiles, institutions y teacher_records respetan sus RLS existentes.
Validacion PostgreSQL focal: supabase/security/teacher_assignment_select_rls.sql,
con rollback de policy y fixtures. No aplicado a Staging/Production por esta tarea.

### Admin institucion

- SELECT: mesas, asignaciones e inscripciones de su institucion/workspace.
- WRITE: preferentemente via RPC administrativas para publicar, abrir/cerrar, resetear y corregir; si hay writes directos, limitados por policies de rol `owner/admin/editor`.

### Superadmin

- SELECT global para auditoria.
- WRITE global solo por operaciones administrativas auditadas, no por policies amplias sin razon.

### Edge/service-role

- Puede ejecutar RPC server-side necesarias, pero la funcion debe validar actor, target, tenant, estado y elegibilidad. No confiar en que `service_role` implica permiso de negocio.

## 11. Concurrencia e idempotencia

Casos y resolucion:

| Caso | Debe resolver DB | Debe resolver RPC |
| --- | --- | --- |
| Doble click de alta | Unique parcial de inscripcion activa por `exam_table_subject_id`; `ON CONFLICT`/lock | Devolver fila existente o resultado idempotente. |
| Dos sesiones del mismo alumno | Unique parcial + transaction lock | Revalidar ventana/estado dentro de la transaccion. |
| Retry de Edge Function | Unique `client_mutation_id` + `client_request_hash` | Si mismo key distinto payload, rechazar con conflicto/validacion. |
| Alta y cancelacion simultanea | Lock por `(institution_id, exam_table_subject_id, student_record_id)` o lock de fila | Ordenar transiciones y `lock_version`. |
| Cierre durante alta | Lock/update de mesa o `select ... for update` conceptual | Revalidar `status='open'` y `enrollment_closes_at` antes del insert. |
| Admin modifica mesa | `lock_version` de `exam_tables` | Rechazar updates con version vieja o registrar correccion. |
| Capacidad limitada | Unique/contador atomico bajo lock de mesa | Rechazar cuando inscritos activos >= capacity. |

La clave logica de idempotencia academica es la unique parcial de inscripcion activa. `client_mutation_id` complementa, pero no reemplaza, la constraint academica porque puede faltar o ser generado mal por el cliente.

## 12. Auditoria

Reutilizacion:

- `admin_audit_logs` existe en foundation y sirve para acciones administrativas generales.
- No existe tabla canonica local `academic_audit_events`; los docs la mencionan como futuro/ADR, no como schema implementado.

Modelo recomendado:

- Para este bloque, usar `exam_table_events` y `exam_enrollment_events` como auditoria academica especifica, append-only.
- Acciones administrativas de Edge/admin pueden ademas registrar resumen en `admin_audit_logs`, sin sustituir el ledger academico.

Eventos obligatorios:

- Creacion de mesa.
- Cambio de fecha/hora/aula/capacidad/ventana.
- Publicacion a revision docente.
- Asignacion/reemplazo de docente.
- Confirmacion/objecion/reset docente.
- Apertura/cierre/cancelacion/completado de mesa.
- Alta/cancelacion/reactivacion/rechazo/correccion de inscripcion.
- Override administrativo con motivo.

Nunca registrar secretos ni payloads completos con PII innecesaria. Metadata debe ser minima, estructurada y con reason codes.

## 13. Estrategia de migracion

Conceptual, sin crear migracion en esta etapa.

1. Preflight read-only:
   - contar `workspace_snapshots.payload->'cronograma'`;
   - contar `legacy_exam_sessions`;
   - contar repairs `exam_teacher_assignments`/`exam_enrollments` si existen;
   - detectar duplicados por `(institution_id, workspace_key, exam_table_id)`;
   - detectar filas huerfanas de docentes/alumnos/materias.
2. Crear tablas canonicas vacias en una migracion futura, con RLS/grants cerrados por defecto.
3. Backfill de `exam_tables` desde `legacy_exam_sessions` y/o snapshot oficial, preservando `legacy_exam_table_id`.
4. Backfill de `exam_table_subjects` resolviendo `legacy_subject_id`/`legacy_program_id` contra `subjects`, `careers`, `study_plans`, `study_plan_subjects`.
5. Backfill de `exam_teacher_assignments` desde repair, preservando `teacher_id` como perfil/auth user id y mapeandolo a `teacher_records` para poblar `teacher_record_id`.
6. Backfill de `exam_enrollments` desde repair/snapshot, mapeando:
   - `active`, `enrolled`, `pending`, `registered` -> `registered` solo si la fila representa alta vigente;
   - `dropped`, `cancelled` -> `cancelled`.
   - poblar `subject_id`, `program_id` y `deleted_at` transicionales para no romper lectores actuales mientras se actualizan a `exam_table_subject_id` y estados canonicos.
7. Duplicados:
   - no fusionar silenciosamente;
   - elegir una fila ganadora por fecha/evento;
   - registrar rejects en tabla temporal de migracion o reporte;
   - exigir aprobacion humana para casos ambiguos.
8. Orfandad:
   - no inventar FK;
   - dejar fila en reporte de preflight;
   - bloquear deploy si afecta mesas abiertas o inscripciones reales.
9. Postflight:
   - comparar conteos legacy/canonico;
   - validar FKs;
   - validar que cada inscripcion activa tenga mesa, materia y legajo;
   - ejecutar tests negativos RLS A/B;
   - validar RPC en staging con fixtures sinteticos.
   - antes de activar lectura relacional, actualizar `academicRelationalData.js` y `05_student_portal_secure_read.sql` para aceptar `registered/cancelled` o entregar una vista de compatibilidad probada; no activar `read_mode` relacional si siguen filtrando solo `active/enrolled`.
10. Rollback:
   - mantener legacy intacto durante transicion;
   - no borrar `legacy_exam_sessions` ni snapshot en la misma migracion;
   - feature flag/transition config decide lectura canonica vs legacy.

## 14. Compatibilidad con RPC

| Requisito RPC | Entidad/campo/constraint que lo satisface | Estado |
| --- | --- | --- |
| Resolver mesa existente | `exam_tables.id` y unique legacy `(institution_id, workspace_key, legacy_exam_table_id)` | DEFINIDO |
| Evitar `exam_table_id` textual sin FK | `exam_enrollments.exam_table_id uuid -> exam_tables` | DEFINIDO |
| Match exacto materia/carrera | `exam_table_subjects.career_id/study_plan_id/study_plan_subject_id` + `study_plan_subjects` | DEFINIDO |
| Alumno solo sobre si mismo | `student_id`, `student_record_id`, membership/profile validation en RPC | DEFINIDO |
| Legajo canonico | FK a `student_records` y `student_career_plans` | DEFINIDO |
| Regularidad | `student_grades`/`student_academic_statuses` consultados transaccionalmente | DEFINIDO |
| Correlativas | `subject_prerequisites` + estados academicos aprobados/promocionados | DEFINIDO |
| Deuda | `student_financial_status` por `student_record_id` | DEFINIDO |
| Ausencia/castigo | `exam_absence_penalties`, contrato en `docs/contracts/exam_absence_penalties.md` | DEFINIDO COMO DEPENDENCIA NO PK |
| No mesas especiales self-service | `exam_tables.exam_type` + metadata/policy de inscripcion | DEFINIDO |
| Ventana de inscripcion | `enrollment_opens_at`, `enrollment_closes_at`, `status='open'` | DEFINIDO |
| Idempotencia | Unique parcial `(institution_id, exam_table_subject_id, student_record_id) where status='registered'` + `client_mutation_id` por alumno | DEFINIDO |
| Cancelacion | Estado `cancelled`, `cancelled_at`, eventos | DEFINIDO |
| DTO compatible | `exam_enrollments` conserva `student_id`, `student_record_id`, `exam_table_id`, `subject_id`, `program_id`, `status`, timestamps, `deleted_at`, legacy ids | DEFINIDO |
| RLS/grants futuros | Writes via RPC, reads por rol/tenant | DEFINIDO |

El modelo es suficiente para implementar `public.upsert_exam_enrollment_from_portal` sin consolidar los repairs historicos como baseline.

## 15. Incognitas restantes

No quedan incognitas que cambien PK, FKs, tenant boundaries, estados o idempotencia.

Incognitas no bloqueantes para la implementacion inicial:

1. Implementacion SQL de `exam_absence_penalties` antes o junto con la RPC; la decision contractual ya no altera identidad ni constraints de mesa/inscripcion.
2. Si `exam_periods` se normaliza como tabla propia; el contrato actual usa keys textuales para no bloquear.
3. Si se expone `authenticated` directo a la RPC o solo Edge/service-role; el modelo exige las mismas validaciones internas.
4. Forma exacta de `exam_acts`/`exam_results`, diferida hasta cierre de actas.

## 16. P0/P1/P2/P3

| Severidad | Hallazgo |
| --- | --- |
| P0 | Ninguno. |
| P1 | Ninguno introducido por el diseño. El P1 previo "modelo de mesas no canonico" queda resuelto a nivel contrato, pendiente de implementacion local. |
| P2 | Ausencia/castigo ya tiene contrato canonico, pero falta implementacion SQL y validacion DB. |
| P2 | Migracion de datos reales puede encontrar duplicados/huerfanos y debe bloquear si no hay resolucion humana. |
| P2 | RLS negativa A/B todavia no ejecutada porque esta etapa no crea SQL. |
| P3 | Normalizar `exam_periods` como tabla futura podria mejorar reportes, pero no es necesario para desbloquear RPC. |

## 17. Dictamen de arquitectura

Decision: `A. MODELO CANONICO DEFINIDO - LISTO PARA IMPLEMENTACION`.

La definicion resuelve:

- PK canonica `uuid` para mesas.
- Compatibilidad con ids textuales legacy sin mantenerlos como FK.
- FKs compuestas por tenant.
- Modelo de materias agrupadas.
- Vocabulario unico de estados.
- Idempotencia estructural en DB.
- Separacion RLS READ/WRITE.
- Auditoria append-only minima.
- Estrategia de migracion sin perdida y sin borrar legacy durante transicion.

## 18. Archivos relacionados

- Este contrato: `docs/contracts/exam_tables_canonical_model.md`.
- Contrato RPC previo: `docs/contracts/upsert_exam_enrollment_from_portal.md`.
- Baseline readiness: `docs/BASELINE_READINESS.md`.
- Worklog: `docs/WORKLOG.md`.

## 19. Confirmacion de alcance

- SQL funcional modificado: NO.
- Runtime modificado: NO.
- Migrations creadas: NO.
- Supabase CLI ejecutada: NO.
- Staging/Production modificados: NO.
- Service-role utilizada: NO.
- Secrets expuestos: NO.

REMOTE MUTATIONS: NONE.
