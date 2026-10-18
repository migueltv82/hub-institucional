# Contrato recuperado: `public.upsert_exam_enrollment_from_portal`

## Contrato vigente

Actualización 2026-10-12: schema y RPC canónicos ya existen y están validados. Esta sección prevalece sobre la recuperación histórica conservada debajo.

- La RPC se ejecuta con el JWT del usuario autenticado, mediante `context.userClient`; no mediante `adminClient` ni `service_role`.
- La identidad debe cumplir `auth.uid() = actor_user_id = target_student_id`. Un caller ajeno o con identidad nula se rechaza.
- Deben validarse el profile del alumno no bloqueado, su membership institucional y el student_record vinculado al alumno dentro del tenant/workspace correspondiente.
- No existe bypass operativo ni excepción privilegiada mediante `adminClient`/`service_role` para este flujo. Las recomendaciones históricas de grants privilegiados no son instrucciones vigentes.
- Los positivos propios y los rechazos de identidad ajena/nula ya están acreditados en PostgreSQL local. Los tests focales de contrato verifican estas reglas.
- Actualización 2026-10-18 (EX.8): las reglas de elegibilidad (regularidad, deuda, sanción por ausencia y correlativas) se movieron sin cambios a `exam_enrollment_assert_eligible`. Es una función interna, sin EXECUTE para ningún rol de la API. La llaman esta RPC y `admin_enroll_student_in_exam_table`, que es la inscripción especial del personal de gestión: se saltea solo el plazo, con motivo obligatorio y evento `admin_special_enrollment`. La firma de esta RPC no cambió (14 parámetros). El plazo del portal sigue saliendo de `exam_tables.enrollment_closes_at`, que la publicación fija 24 h antes de la mesa.

## HISTÓRICO / OBSOLETO — recuperación de septiembre de 2026

Todo el contenido restante conserva el diagnóstico y las propuestas de aquella etapa. Las referencias a caller `adminClient`, ausencia de schema/RPC, alternativas con `service_role`, grants privilegiados, incógnitas y blockers describen ese estado histórico; no sustituyen el contrato vigente ni autorizan cambios de permisos. Las reglas adicionales de diseño se conservan como trazabilidad, sin acreditar aquí comportamientos nuevos.

Fecha: 2026-09-26. Alcance: ETAPA 02.8C-1, recuperación de contrato solamente. No implementa SQL, no ejecuta migraciones, no modifica Supabase remoto y no despliega Edge Functions.

Actualización 2026-09-27 / ETAPA 02.8C-4A: el blocker específico de ausencia/castigo queda resuelto a nivel contrato con `docs/contracts/exam_absence_penalties.md`. No se implementó SQL ni se ejecutaron migraciones; la futura RPC debe consultar `public.exam_absence_penalties` como fuente canónica, no snapshots ni espejos frontend.

## Decisión 02.8C-1

`MODELO DE DATOS BLOQUEA LA IMPLEMENTACIÓN`

El contrato runtime pudo reconstruirse con evidencia suficiente para diseñar la RPC, pero la implementación segura queda bloqueada por el modelo de mesas: `exam_enrollments` y `exam_teacher_assignments` viven en repairs históricos, no en `supabase/schema/`, y `exam_table_id` es texto sin FK a una mesa canónica. Una RPC nueva no debe consolidar ese modelo como baseline sin reconciliar antes el bloque canónico de mesas.

## Callers encontrados

| Caller | Ubicación | Rol |
| --- | --- | --- |
| Portal alumno, página de mesas | `src/modules/alumnos/pages/StudentExamEnrollmentPage.jsx:178-204` | Construye payload local con `exam_session_id`, `exam_table_id`, `subject_id`, `program_id`, `student_id`, `student_record_id` y `status = 'registered'`. |
| Layout portal alumno | `src/modules/alumnos/StudentPortalModule.jsx:402-423` y `src/modules/alumnos/StudentPortalModule.jsx:448-461` | En sesión remota llama `mutateStudentPortal` para `register_exam` y `cancel_exam`. |
| Servicio frontend | `src/modules/alumnos/services/studentPortalMutations.js:15-60` | Invoca Edge Function `admin-users` con `action = 'student_portal_mutation'`. |
| Edge Function | `supabase/functions/admin-users/index.ts:2533-2584` | HISTÓRICO / OBSOLETO: caller directo de `adminClient.rpc('upsert_exam_enrollment_from_portal', ...)`; vigente: JWT del usuario mediante `context.userClient`. |
| Lectura posterior | `src/modules/alumnos/services/academicRelationalData.js:188-220` y `supabase/schema/05_student_portal_secure_read.sql:610-629` | Lee `exam_enrollments` relacionales propias cuando la transición lo permite. |
| Espejos de UX/defensa | `src/modules/alumnos/lib/examEligibility.js:122-174`, `src/modules/alumnos/lib/prerequisites.js:100-143`, `supabase/functions/admin-users/index.ts:1663-1702` | Replican la regla para bloquear antes de llamar o como defensa adicional en Edge. |

No se encontró definición SQL local canónica de la RPC en `supabase/schema/`, `supabase/docs/`, `src/` ni `scripts/`. La búsqueda de historial local por `upsert_exam_enrollment_from_portal` encontró menciones y callers, pero no un `create function` recuperable.

## Flujo runtime completo

1. El alumno abre `Mesas de examen` y la UI lista mesas desde el snapshot/overlay académico.
2. `StudentExamEnrollmentPage` calcula elegibilidad en cliente con `getExamEnrollmentEligibility`.
3. Si `canRegister` es true, construye el payload de inscripción con el id de mesa, materia/carrera canónicas y `student_record_id` si existe.
4. `StudentPortalModule` llama `mutateStudentPortal({ mutationType: 'register_exam' })`; para cancelar usa `mutationType: 'cancel_exam'`.
5. `studentPortalMutations.js` invoca la Edge Function `admin-users`.
6. `admin-users` valida origen, bearer token, usuario autenticado, perfil no bloqueado, rol de alumno en `profiles.account_role` y membresía en la institución.
7. Para `register_exam`, `admin-users` busca la mesa en `snapshot.cronograma`, rechaza mesas especiales/admin-only y revalida condición académica.
8. Según configuración de transición, la Edge Function puede escribir snapshot, relacional o ambos.
9. Cuando corresponde escritura relacional, `writeExamEnrollmentRelational` llama la RPC con 14 argumentos.
10. La lectura futura se espera desde `exam_enrollments` relacional, filtrada por institución/workspace/alumno y `deleted_at is null`.

## Firma esperada

Firma inferida desde `supabase/functions/admin-users/index.ts:2561-2580` y `docs/db-ui-contract.md:542-561`:

```sql
public.upsert_exam_enrollment_from_portal(
  target_institution_id uuid,
  target_workspace_key text,
  actor_user_id uuid,
  target_student_id uuid,
  target_student_record_id uuid default null,
  target_exam_table_id text,
  target_subject_id text default null,
  target_program_id text default null,
  target_status text default 'registered',
  target_enrolled_at timestamptz default null,
  target_cancelled_at timestamptz default null,
  target_legacy_snapshot_id text default null,
  target_client_mutation_id text default null,
  target_metadata jsonb default '{}'::jsonb
)
```

El orden es relevante: `CLAUDE.md` documenta que la firma válida histórica de fase 12 tenía catorce parámetros y `target_student_record_id` como quinto parámetro.

## DTO esperado

Entrada desde frontend/Edge:

- `exam_session_id` / `exam_table_id`: requerido.
- `subject_id`: canónico si está disponible.
- `program_id`: canónico si está disponible.
- `profile_id` / `student_id`: usuario alumno.
- `student_record_id`: legajo cuando existe.
- `status`: `registered` al alta. En cancelación, el flujo snapshot actual marca el resultado como `dropped`; luego `writeExamEnrollmentRelational` usa ese `enrollment.status` antes del fallback a `cancelled`. La futura RPC debe tratar este mismatch explícitamente, preferentemente normalizando `dropped -> cancelled` antes de persistir en `exam_enrollments`.
- `created_at` / `enrolled_at`, `cancelled_at` / `dropped_at`.
- `id`: id legacy del snapshot, usado como `target_legacy_snapshot_id`.
- `client_mutation_id`: opcional; si falta, la Edge usa el id legacy.

Salida mínima esperada:

- Debe devolver una fila/objeto de inscripción compatible con `exam_enrollments`: `id`, `institution_id`, `workspace_key`, `student_id`, `student_record_id`, `exam_table_id`, `subject_id`, `program_id`, `status`, `enrolled_at`, `cancelled_at`, `legacy_snapshot_id`, `lock_version`, `created_at`, `updated_at`.
- El frontend tolera `result.data`, `result.enrollment` o un objeto con `id`/`exam_session_id`, pero el contrato seguro debería devolver una fila relacional estable.

## Modelo de datos implicado

Modelo canónico disponible:

- `profiles`, `memberships`, `institutions`: foundation.
- `student_records`: legajo del alumno.
- `subject_enrollments`, `student_grades`, `student_financial_status`: `supabase/schema/07_academic_operations.sql`.
- `exam_absence_penalties`: modelo canónico contractual definido en `docs/contracts/exam_absence_penalties.md`, pendiente de implementación SQL.

Modelo no canónico o bloqueante:

- `exam_enrollments` está definido solo en `supabase/docs/repair_06_exam_teacher_assignments.sql:116-141`.
- `exam_teacher_assignments` está definido solo en `supabase/docs/repair_06_exam_teacher_assignments.sql:27-109`.
- `academic_admin_reset_exam_process` borra `exam_enrollments` si existe desde un repair, no desde schema canónico (`supabase/docs/repair_06_exam_process_reset_rpc.sql:63-69`).
- `exam_table_id` es texto; `docs/ACADEMIC_LIFECYCLE_INTEGRAL_AUDIT_2026-07.md:197-201` documenta que no hay FK a mesa canónica.
- `docs/BASELINE_READINESS.md` y `supabase/baseline/BASELINE_MANIFEST.md` ya clasifican el bloque de mesas como pendiente de reconciliación.

## Identidad y autorización

La RPC no debe confiar en `user_metadata`.

Reglas mínimas esperadas para diseño seguro:

- Rechazar si `auth.uid()` es null.
- Rechazar si `actor_user_id <> target_student_id`.
- Rechazar si `actor_user_id <> auth.uid()` salvo que se defina formalmente que solo `service_role` la ejecuta desde Edge; en ese caso la función igual debe validar actor/target y tenant.
- Verificar `profiles.user_id = target_student_id`, `profiles.account_role in ('alumno', 'student')` y `profiles.is_blocked = false`.
- Verificar membresía activa en `target_institution_id`.
- Verificar que `target_student_record_id`, si viene informado, pertenece a la misma institución/workspace y al mismo alumno/correo según el modelo canónico que se adopte.
- No aceptar institución/workspace/materia/carrera desde el cliente como autoridad única si se puede resolver contra datos canónicos.

Privilegios recomendados para la etapa de diseño — HISTÓRICOS / OBSOLETOS, no aplicar:

- `PUBLIC`: sin `EXECUTE`.
- `anon`: sin `EXECUTE`.
- `authenticated`: solo si el frontend va a llamar la RPC directamente. La evidencia actual muestra caller vía Edge Function.
- `service_role`: si se mantiene caller vía Edge Function, grant mínimo a `service_role` y validaciones internas obligatorias.

## Reglas de negocio recuperadas

1. Alta permitida solo para alumno autenticado sobre sí mismo.
2. No inscribir a mesas especiales o `inscription_mode = 'admin_only'`.
3. Materia/carrera se comparan con match exacto de `subject_id` y `program_id`, sin normalizar mayúsculas/tildes y sin comodín por carrera vacía.
4. La última condición académica no-pending en `student_grades` para materia/carrera debe ser `regular`.
5. Si no hay condición cargada, el alta debe rechazar con semántica equivalente a “Todavía no hay condición regular cargada”.
6. `libre`, `promocionado`, `approved`, `failed` u otros estados no habilitan la inscripción regular.
7. Todas las correlativas para rendir deben figurar aprobadas/promocionadas; no alcanza regularidad.
8. La penalidad por ausencia debe bloquear la mesa castigo correspondiente usando `exam_absence_penalties`; si la penalidad está `pending_review`, la RPC debe fallar cerrada para la misma materia/alumno hasta resolverla.
9. Si `student_financial_status.adeuda_cuota` está activo para el legajo, la inscripción debe rechazarse.
10. Cancelación debe afectar solo la inscripción propia y dejar trazabilidad (`cancelled_at`, `deleted_at` o estado cancelado según modelo final).

Las reglas 7-9 están documentadas en la entrada histórica de `docs/WORKLOG.md` que menciona la “migración 15” y espejadas en `examEligibility.js`/`prerequisites.js`; no se recuperó SQL histórico que las implemente. Para ausencia/castigo, la fuente canónica nueva queda definida por `docs/contracts/exam_absence_penalties.md`.

## Idempotencia y concurrencia

Evidencia:

- `docs/academic-transition-phase3.md:16-23` documenta RPCs atómicas, con `pg_advisory_xact_lock`, upsert idempotente y sin escritura directa a `workspace_snapshots`.
- `repair_06_exam_teacher_assignments.sql:139-141` define índice único parcial por `(institution_id, workspace_key, exam_table_id, student_id)` para `exam_enrollments`.
- `docs/db-ui-contract.md:523-561` lista `lock_version`, `target_client_mutation_id` y `target_metadata`.

Contrato mínimo:

- Alta repetida para la misma institución/workspace/mesa/alumno no debe duplicar filas.
- Cancelación repetida no debe crear una fila nueva ni reactivar una inscripción.
- `target_client_mutation_id` debe persistirse en `metadata` o en una columna canónica futura para deduplicación/auditoría.
- Se requiere bloqueo transaccional por institución/workspace/mesa/alumno o constraint única compatible con `ON CONFLICT`.
- `lock_version` debe incrementarse en updates.

## Transaccionalidad

La validación de identidad, estado académico, correlativas, deuda, ausencia y el upsert/cancelación deben ejecutarse en una única transacción PostgreSQL. El contrato no debe depender de que la Edge Function haya leído antes un snapshot consistente, porque esa defensa es bypassable si la RPC queda ejecutable fuera del camino previsto.

## Threat model

| Riesgo | Severidad | Control esperado |
| --- | --- | --- |
| Alumno se inscribe a una mesa de otra institución | P1 | Validar membresía e institución en DB; no confiar en payload. |
| Alumno inscribe a otro alumno | P1 | `auth.uid()`, `actor_user_id` y `target_student_id` deben coincidir, o Edge/service-role debe estar estrictamente validado. |
| Inscripción sin regularidad | P1 | Consulta autoritativa a `student_grades`, no solo UI. |
| Bypass de correlativas, ausencia o deuda | P1 | Reglas en RPC; espejos frontend solo UX. |
| Duplicados por doble click/retry | P2 | Unique key/upsert/lock transaccional/client mutation id. |
| Mesa inexistente o borrador visible | P1 | Requiere mesa canónica; hoy bloqueado por modelo no canónico. |
| Fuga de datos de otros alumnos | P2 | Retornar solo fila propia; RLS y grants mínimos. |
| Escalada por `SECURITY DEFINER` | P1 | `search_path = ''`, referencias calificadas, revokes explícitos, validaciones internas. |

## Evidencia histórica

- `git log --all --oneline -S"upsert_exam_enrollment_from_portal"` devuelve commits con menciones/callers, no definición SQL recuperable.
- `git grep -n "upsert_exam_enrollment_from_portal" ba17eaf -- src supabase docs scripts` muestra documentación, espejos y caller Edge, pero no `create function`.
- `docs/academic-transition-phase3.md:11-23` describe la intención histórica de RPCs atómicas para el portal.
- `docs/db-ui-contract.md:542-561` lista la RPC y sus parámetros esperados.
- `CLAUDE.md` documenta la verificación de firma remota de catorce parámetros.
- `docs/WORKLOG.md` registra reglas añadidas a la migración 15, pero no incluye SQL versionado.

## Incógnitas históricas — no representan el estado vigente

1. Nombre y forma final de la entidad canónica de mesa (`exam_tables`, `legacy_exam_sessions`, snapshot `cronograma` u otra).
2. Si `exam_enrollments.status` debe usar `registered` o normalizar a `active/enrolled/cancelled/pending`; el repair actual no admite `registered`.
3. Cómo modelar actas, cierre de padrón y resultados sin mutar inscripciones históricas.
4. Relación exacta entre `student_record_id`, `student_id` y carreras múltiples.
5. Fuente canónica de correlativas para la RPC: snapshot, tablas relacionales futuras o materialización.
6. Implementación SQL de `exam_absence_penalties` y su integración transaccional con la RPC.
7. Si la RPC será callable por `authenticated` directo o exclusivamente por Edge con `service_role`.

## Riesgos históricos — no representan el estado vigente

| Severidad | Hallazgo |
| --- | --- |
| P0 | Ninguno confirmado en esta etapa documental. |
| P1 | Modelo de mesas no canónico: implementar la RPC ahora consolidaría `exam_table_id` textual sin FK ni mesa oficial. |
| P1 | La autoridad server-side de inscripción a mesa sigue ausente; cualquier modo relacional/híbrido depende de un contrato no implementado. |
| P1 | La RPC sigue sin implementación SQL local. |
| P2 | Correlativas/deuda/ausencia ya tienen contrato local suficiente, pero requieren implementación SQL y tests antes de habilitar escritura relacional. |
| P2 | Status mismatch: frontend/Edge pueden mandar `registered` en alta y `dropped` en cancelación, mientras el repair acepta `active/enrolled/cancelled/pending`; la futura RPC debe normalizar o rechazar explícitamente esos estados. |
| P2 | El patrón local de `upsert_subject_enrollment_from_portal` existe pero no cumple hardening moderno (`search_path = public, pg_temp`) y no debe copiarse sin rediseño. |
| P3 | Los mensajes de error están duplicados entre frontend, Edge y documentación. |

## Resultado histórico — OBSOLETO

`MODELO DE DATOS BLOQUEA LA IMPLEMENTACIÓN`

Siguiente paso recomendado: diseñar primero el bloque canónico de mesas y luego implementar la RPC con tests de contrato, negativos por rol/tenant, idempotencia, concurrencia y reglas académicas.

REMOTE MUTATIONS: NONE.
