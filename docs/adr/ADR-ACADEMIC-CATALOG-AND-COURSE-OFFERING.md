# ADR: catalogo academico y oferta de cursada

- Estado: `READY_FOR_LOCAL_SCHEMA_REVIEW`
- Fecha: 2026-07-16
- Rama de trabajo: `codex/academic-catalog-course-offering`
- Alcance: diseno de dominio, contratos puros, esquema local no destructivo y RLS.
- Fuera de alcance: UI productiva, motor de mesas, Supabase productivo y migracion de datos legacy.

## 1. Contexto

La auditoria `docs/ACADEMIC_LIFECYCLE_INTEGRAL_AUDIT_2026-07.md` encontro una
base parcial formada por padrones, snapshots, asignaciones por materia,
inscripciones basicas y notas genericas. No existe una separacion canonica entre
la materia estable de un plan y su oferta concreta en un ciclo lectivo. Tampoco
existe una frontera transaccional unica para inscribir, cerrar cursadas o derivar
historia academica.

Agregar mas pantallas sobre los arrays actuales aumentaria el dual-write y
convertiria estados derivados en autoridad. Esta decision crea la base relacional
minima sin conectar todavia los flujos productivos.

## 2. Decision

1. Separar catalogo estable (`Career`, `StudyPlan`, `StudyPlanSubject`) de oferta
   temporal (`CourseOffering`, `CourseSchedule`).
2. Vincular docentes y alumnos exclusivamente a una oferta mediante
   `TeachingAssignment` y `CourseEnrollment`.
3. Reservar altas, invalidaciones y transiciones criticas a comandos server-side
   transaccionales. `authenticated` solo obtiene lectura RLS en este corte.
4. Mantener snapshot y tablas actuales como fallback legacy, sin backfill
   automatico y sin borrado.
5. Tratar la ausencia de historia como `NOT_TAKEN`; nunca inferir `REGULAR`.
6. Conservar auditoria relacional append-only, encadenada por hash y separada de
   las tablas de estado.
7. Definir las entidades posteriores, pero no crear aun asistencia,
   evaluaciones, cierres, historia, actas ni sanciones.

## 3. Diagrama textual

```txt
Institution
  |-- Career
  |     |-- StudyPlan
  |           |-- StudyPlanSubject
  |
  |-- AcademicYear
  |     |-- AcademicTerm
  |
  |-- CourseOffering
        |-- references Career + StudyPlan + StudyPlanSubject
        |-- references AcademicYear + optional AcademicTerm
        |-- CourseSchedule [0..n]
        |-- TeachingAssignment [1..n]
        |     `-- Teacher/Profile
        `-- CourseEnrollment [0..n]
              `-- Student/Profile

Future:
CourseOffering -> ClassSession -> AttendanceRecord
CourseOffering -> Assessment -> AssessmentResult
CourseEnrollment -> CourseClosure -> AcademicRecord
AcademicRecord + ExamPenalty -> ExamEnrollment eligibility
ExamTable -> ExamEnrollment -> ExamAct -> ExamResult -> AcademicRecord
```

Las claves foraneas compuestas incluyen `institution_id` para impedir que una
relacion conecte agregados de tenants distintos, aun con IDs UUID validos.

## 4. Entidades de catalogo

| Entidad | Responsabilidad e identidad | Relaciones y estado | Escritura, cierre, borrado y auditoria |
| --- | --- | --- | --- |
| `Institution` | Tenant academico. ID UUID existente. | Raiz de todas las entidades. Estado existente `active/suspended`. | Creacion superadmin; administracion institucional acotada. No se modifica en esta migracion. |
| `Career` | Carrera canonica institucional. `academic_careers.id`. | Pertenece a Institution. `ACTIVE/INACTIVE/ARCHIVED`. Codigo unico por institucion. | Admin mediante comando servidor. Se archiva; no se borra si tiene planes/ofertas. Evento de dominio futuro. |
| `StudyPlan` | Version normativa de un plan. `academic_study_plans.id`. | Pertenece a Career. `DRAFT/ACTIVE/INACTIVE/ARCHIVED`; vigencia opcional. | Admin. Tras activacion, los cambios estructurales requieren nueva version. Borrado no permitido con materias/ofertas. |
| `StudyPlanSubject` | Materia estable dentro de un plan. `study_plan_subjects.id`. | Pertenece a StudyPlan; codigo unico por plan; anio obligatorio. `ACTIVE/INACTIVE/ARCHIVED`. | Admin. No se edita para alterar historia pasada; se versiona el plan. Sin borrado fisico. |
| `AcademicYear` | Ciclo lectivo institucional. `academic_years.id`. | `PLANNED/ACTIVE/CLOSED/ARCHIVED`; numero unico por institucion. | Admin por comando. Se cierra cuando no admite nuevas ofertas/transiciones operativas. Sin borrado con ofertas. |
| `AcademicTerm` | Periodo dentro del ciclo. `academic_terms.id`. | Pertenece a AcademicYear. `PLANNED/OPEN/CLOSED/ARCHIVED`; fechas contenidas en el ciclo se validaran en comando. | Admin. Se cierra por comando. Sin borrado con ofertas. |

`StudyPlanSubject` no es una cursada. Una materia del plan puede originar muchas
ofertas por ciclo, periodo o comision sin duplicar el catalogo.

## 5. Entidades de oferta

### 5.1 CourseOffering

- Responsabilidad: apertura concreta de una materia para carrera, plan, ciclo,
  periodo, comision y modalidad.
- Identificador: UUID.
- Relaciones obligatorias: Institution, Career, StudyPlan, StudyPlanSubject y
  AcademicYear. AcademicTerm es opcional para ofertas anuales.
- Identidad natural: institucion + carrera + plan + materia de plan + ciclo +
  periodo (o anual) + comision.
- Invariantes: todas las referencias pertenecen a la misma institucion; la
  materia pertenece al plan; el plan pertenece a la carrera; capacidad positiva;
  ventana de inscripcion ordenada.
- Creacion: administrador mediante comando servidor.
- Modificacion: metadata operativa en estados abiertos; transiciones criticas
  solo por comando y trigger defensivo.
- Cierre: `COURSE_CLOSED` impide inscripciones y cierres nuevos no autorizados.
- Borrado: no. `CANCELLED` y luego `ARCHIVED`.
- Auditoria: un evento por creacion/transicion/correccion.

### 5.2 TeachingAssignment

- Responsabilidad: asignar un docente autenticado a una oferta concreta.
- Campos: `id`, `institution_id`, `course_offering_id`, `teacher_id`,
  `teacher_record_id`, `role`, `weekly_hours`, `status`, `valid_from`, `valid_to`,
  `created_at`, `created_by`, invalidacion y metadata.
- Roles: `TITULAR`, `CO_TITULAR`, `ADJUNTO`, `AUXILIAR`, `REEMPLAZANTE`.
- Estados: `ACTIVE`, `INACTIVE`, `INVALIDATED`, `ARCHIVED`.
- Invariantes: horas positivas; vigencia ordenada; oferta y docente del tenant;
  una asignacion invalidada conserva fecha, actor y motivo.
- Creacion/modificacion: administrador mediante comando servidor. El docente no
  puede editar su propia asignacion.
- Cierre/borrado: fin de vigencia o invalidacion, nunca delete.
- Auditoria: evento por alta, reemplazo, cambio de horas e invalidacion.

### 5.3 CourseSchedule

- Responsabilidad: horario recurrente de una oferta, no disponibilidad docente.
- Identificador: UUID; relacion obligatoria con CourseOffering.
- Estado: `ACTIVE`, `INACTIVE`, `ARCHIVED`.
- Invariantes: dia 1..7, `end_time > start_time`, vigencia ordenada.
- Escritura: administrador mediante comando; lectura solo si el actor puede leer
  la oferta.
- Borrado: no cuando haya sesiones o evidencia; se archiva.
- Auditoria: evento de oferta por alta/cambio/archivo.

### 5.4 CourseEnrollment

- Responsabilidad: vinculo institucional entre alumno y oferta.
- Identificador: UUID; unicidad institucion + alumno + oferta.
- Tipos: `AUTOMATIC_FIRST_YEAR`, `STUDENT_SELECTED`, `ADMINISTRATIVE`,
  `MIGRATED_LEGACY`.
- Estados: `ENROLLED`, `IN_PROGRESS`, `WITHDRAWN`, `COURSE_CLOSED`,
  `INVALIDATED`.
- Invariantes: alumno y oferta del mismo tenant; una sola fila por alumno/oferta;
  una invalidacion requiere fecha y motivo; la condicion final no se escribe en
  esta entidad.
- Creacion: solo comando transaccional. Alumno puede solicitar, no insertar.
- Modificacion: retiro/invalidez/cierre por comandos autorizados.
- Cierre: `COURSE_CLOSED` tras crear el cierre de cursada futuro.
- Borrado: nunca. Se retira o invalida.
- Auditoria: evento obligatorio dentro de la misma transaccion.

## 6. Estados de CourseOffering

| Desde | Hacia permitidos | Condicion principal |
| --- | --- | --- |
| `DRAFT` | `OPEN_FOR_ENROLLMENT`, `CANCELLED` | Catalogo y ventana validados. |
| `OPEN_FOR_ENROLLMENT` | `IN_PROGRESS`, `CLOSED_FOR_ENROLLMENT`, `CANCELLED` | Inicio o cierre administrativo. |
| `IN_PROGRESS` | `CLOSED_FOR_ENROLLMENT`, `PENDING_COURSE_CLOSURE`, `CANCELLED` | Cierre de padron o fin de cursada. |
| `CLOSED_FOR_ENROLLMENT` | `IN_PROGRESS`, `PENDING_COURSE_CLOSURE`, `CANCELLED` | Reanudacion controlada o cierre. |
| `PENDING_COURSE_CLOSURE` | `COURSE_CLOSED`, `IN_PROGRESS` | Cierres completos o reapertura justificada. |
| `COURSE_CLOSED` | `ARCHIVED` | Retencion cumplida. |
| `CANCELLED` | `ARCHIVED` | Sin actividad pendiente. |
| `ARCHIVED` | ninguna | Terminal. |

Reasignar estados con toggles no es valido. El trigger SQL rechaza saltos aunque
una funcion de servidor tenga un defecto.

## 7. Actividad academica posterior (definida, no implementada)

| Entidad | Responsabilidad e invariantes | Autoridad y auditoria |
| --- | --- | --- |
| `ClassSession` | Instancia real de clase de una oferta. Fecha, horario, estado `PLANNED/HELD/CANCELLED`. No se deriva solo del horario recurrente. | Docente asignado propone/registrar; admin corrige. Evento por cancelacion/correccion. |
| `AttendanceRecord` | Estado por sesion e inscripcion: `PRESENT/ABSENT/LATE/JUSTIFIED/NOT_APPLICABLE`. Unico por sesion+inscripcion. | Docente asignado; correcciones con motivo y version. Sin delete. |
| `Assessment` | Evaluacion tipada, fecha, escala, ponderacion y minimo. Estado `DRAFT/PUBLISHED/CLOSED/VOIDED`. | Docente asignado; cierre inmutable salvo correccion auditada. |
| `AssessmentResult` | Resultado por evaluacion e inscripcion. No equivale a condicion final. | Docente asignado; versiones/correcciones auditadas. |
| `CourseClosure` | Evidencia y decision final de una inscripcion. Separa calculado de confirmado y override. | Docente asignado o admin. Un cierre activo; reemplazo por correccion, no update silencioso. |
| `AcademicRecord` | Ledger/proyeccion canonica de estados academicos. | Solo comandos de cierre, examen, correccion o migracion. Nunca UI directa. |

Estados de historia autorizados:

```txt
NOT_TAKEN, ENROLLED, IN_PROGRESS, REGULAR, PROMOTED, FREE, PASSED, FAILED,
REGULARITY_EXPIRED, WITHDRAWN, PENDING_REVIEW
```

Fuentes autorizadas: CourseEnrollment, CourseClosure, ExamResult,
AdministrativeCorrection y LegacyMigration. Sin filas es `NOT_TAKEN`; evidencia
contradictoria es `PENDING_REVIEW`.

## 8. Examenes futuros (relacion, no implementacion)

| Entidad | Relacion con este ADR | Regla de autoridad |
| --- | --- | --- |
| `ExamTable` | Referencia StudyPlanSubject, llamado y version oficial. | Solo comando de confirmacion con reglas duras. |
| `ExamEnrollment` | Requiere AcademicRecord/elegibilidad y mesa confirmada. | Alta transaccional server-side; no insert directo. |
| `ExamAct` | Congela mesa, tribunal y padron. | Append-only/versionada tras cierre. |
| `ExamResult` | Resultado por inscripcion y acta. | Actualiza AcademicRecord en la misma transaccion. |
| `ExamPenalty` | Sancion por ausencia con alcance y vigencia. | Evento idempotente; participa en elegibilidad. |

El motor clasico y `workspaceSnapshot.cronograma` no se modifican en este corte.

## 9. Contratos transaccionales

### 9.1 enrollFirstYearStudentAtomically

Entrada:

```txt
institutionId, studentId, careerId, studyPlanId, academicYearId, actorId
```

Dentro de una transaccion:

1. Lock del alumno y validacion de activo, carrera, plan e ingresante.
2. Lock/listado de ofertas de primer anio abiertas para ese plan y ciclo.
3. Lock/listado de inscripciones existentes.
4. Insert de faltantes con tipo `AUTOMATIC_FIRST_YEAR` usando la unique key.
5. Append de `FIRST_YEAR_COURSE_ENROLLMENT_COMPLETED`.
6. Retorno de creadas, existentes, rechazadas, reason codes y audit event.

La funcion pura y su puerto transaccional estan en
`src/utils/academicDomain/courseEnrollmentContracts.js`. No llaman Supabase.

### 9.2 enrollStudentInCourseOfferingAtomically

Entrada:

```txt
institutionId, studentId, courseOfferingId, actorId
```

Valida en la misma transaccion: alumno activo; tenant/carrera/plan; oferta
`OPEN_FOR_ENROLLMENT`; materia no aprobada; ausencia de duplicado;
correlatividades; bloqueo administrativo y capacidad. Inserta
`STUDENT_SELECTED` y agrega evento. La UI futura solo envia el comando.

Reason codes minimos:

```txt
STUDENT_NOT_FOUND, STUDENT_INACTIVE, CAREER_MISMATCH, STUDY_PLAN_MISMATCH,
OFFERING_NOT_FOUND, OFFERING_NOT_OPEN, OFFERING_CANCELLED, ALREADY_ENROLLED,
SUBJECT_ALREADY_PASSED, PREREQUISITES_NOT_MET, ADMINISTRATIVE_BLOCK,
CAPACITY_EXCEEDED
```

### 9.3 closeCourseEnrollmentAtomically (contrato futuro)

Entrada:

```txt
courseEnrollmentId, calculatedStatus, confirmedStatus, actorId, overrideReason
```

Debe bloquear enrollment/oferta, comprobar actor asignado o admin, estado
`PENDING_COURSE_CLOSURE`, evidencia minima y ausencia de cierre activo. Un
override requiere motivo. Crea CourseClosure, AcademicRecord y DomainAuditEvent
en una transaccion. No se implementa porque faltan asistencia y evaluaciones.

## 10. Matriz de fronteras atomicas

| Operacion | Funcion servidor futura | Tablas/locks | Validaciones y evento | Error recuperable / no recuperable |
| --- | --- | --- | --- | --- |
| Alta primer anio | `enroll_first_year_student` | student, offerings, enrollments | Plan/carrera/ingresante; evento resumen | Oferta rechazada / tenant invalido |
| Alta manual | `enroll_student_in_course_offering` | student, offering, enrollment, record | Oferta/correlativas/capacidad; evento alta | Correlativa/cupo / identidad invalida |
| Retiro/invalidez | `change_course_enrollment_status` | enrollment | Transicion, actor, motivo; evento | Ya retirado / tenant invalido |
| Asignacion docente | `assign_teacher_to_course_offering` | offering, assignments | Rol, vigencia, solapamiento; evento | Duplicado / docente ajeno |
| Cierre de cursada | `close_course_enrollment` | offering, enrollment, evidence, closure, record | Evidencia/override; tres escrituras + evento | Evidencia incompleta / historia corrupta |
| Historia academica | solo dentro de comandos fuente | record + source aggregate | Transicion autorizada y version | Revision pendiente / contradiccion no resuelta |
| Inscripcion a examen | `enroll_student_in_exam` | record, penalty, table, enrollment | Elegibilidad y cierre 24h; evento | No elegible / mesa ajena |
| Confirmacion de mesa | `confirm_exam_table` | draft, tribunal, availability | Reglas duras y version; evento | Warning / violacion dura |
| Cierre de acta | `close_exam_act` | act, enrollments, results, records | Padron completo y doble control; eventos | Resultado faltante / acta alterada |
| Sancion | `create_exam_penalty` | exam result, penalty | Ausencia, alcance e idempotencia; evento | Ya creada / resultado invalido |

Locks recomendados: `SELECT ... FOR UPDATE` sobre agregados y unique constraints
como ultima defensa; `pg_advisory_xact_lock` por alumno/oferta para altas masivas
y por agregado para secuencia de auditoria.

## 11. Auditoria append-only

`DomainAuditEvent` usa:

```txt
id, institutionId, aggregateType, aggregateId, sequenceNumber, eventType,
actorId, occurredAt, payload, previousHash, eventHash
```

`academic_append_domain_audit_event` toma lock por agregado, obtiene el ultimo
hash, calcula SHA-256 sobre metadata canonica e inserta la siguiente secuencia.
Triggers bloquean UPDATE y DELETE. Solo `service_role` puede ejecutar la funcion.

La infraestructura experimental de promociones aporta los conceptos de
serializacion estable, hash y append-only, pero no puede reutilizarse como
autoridad: vive en un snapshot cliente y no ofrece transaccion ni RLS. Se
reutiliza el patron, no la coleccion ni su hash como firma de servidor.

## 12. RLS y permisos

- Alumno: lee ofertas abiertas/activas de su carrera y sus inscripciones. La
  relacion temporal con carrera usa email de profile + student_record; es un
  bridge legacy documentado, no el modelo final. No inserta ni actualiza.
- Docente: lee ofertas y alumnos solo cuando tiene TeachingAssignment activo.
  Lee su propia asignacion; no la modifica.
- Administrador: lee datos de su institucion. Las mutaciones quedan reservadas a
  comandos server-side para que el rol de cliente no saltee invariantes.
- Superadmin: `can_admin_academic_institution` le da lectura explicita. Toda
  mutacion futura debe auditar actor y motivo.
- Usuario bloqueado, sin profile o sin membership: no accede.
- `anon`: sin permisos.
- `service_role`: select/insert/update, sin DELETE; auditoria select/insert.

El script `supabase/security/academic_catalog_rls_tests.sql` crea actores
sinteticos, prueba permisos positivos y negativos y ejecuta `ROLLBACK`.

## 13. Compatibilidad y fuentes

| Fuente actual | Clasificacion transitoria | Destino/uso | Warning requerido |
| --- | --- | --- | --- |
| `student_records` | `SOURCE_OF_TRUTH` de identidad/padron; `LEGACY_FALLBACK` de carrera textual | Vincular explicitamente alumno, carrera y plan en una fase posterior. | `LEGACY_STUDENT_CAREER_TEXT_MATCH` |
| `workspace_snapshots` | `LEGACY_FALLBACK` | Read compatibility y respaldo; no autoridad de nuevas mutaciones. | `LEGACY_WORKSPACE_SNAPSHOT_SOURCE` |
| `subject_enrollments` y arrays actuales | `LEGACY_FALLBACK` | Plan de migracion a CourseEnrollment; no dual-write automatico aun. | `LEGACY_SUBJECT_ENROLLMENT_SOURCE` |
| `student_grades` y notas snapshot | `UNKNOWN`/`LEGACY_FALLBACK` | No equivalen a AssessmentResult o CourseClosure. Requieren auditoria. | `LEGACY_GRADE_WITHOUT_ASSESSMENT` |
| `planesEstudio`/materias snapshot | `LEGACY_FALLBACK` | Migracion asistida a Career/StudyPlan/StudyPlanSubject. | `LEGACY_STUDY_PLAN_CATALOG_SOURCE` |
| `teacher_records` | `SOURCE_OF_TRUTH` de padron docente | Teacher/Profile sigue siendo identidad; asignacion vive en TeachingAssignment. | Ninguno si existe vinculo Auth. |
| `horariosDocentes` | `DEPRECATED` para oferta; `LEGACY_FALLBACK` operativo | CourseSchedule + TeachingAssignment. No eliminar aun. | `LEGACY_TEACHER_SCHEDULE_SOURCE` |
| `subject_teacher_assignments` | `LEGACY_FALLBACK` | Migrar a TeachingAssignment cuando se resuelva CourseOffering. | `LEGACY_SUBJECT_TEACHER_ASSIGNMENT` |
| `teacher_workload_records` | `DERIVED`/fuente del motor de mesas | No sustituye TeachingAssignment de cursada. | `TEACHER_WORKLOAD_NOT_COURSE_ASSIGNMENT` |
| Fallback listado carrera+anio | `DEPRECATED` y riesgoso | Ya encapsulado con `LEGACY_STUDENT_ROSTER_BY_CAREER_YEAR`. | Implementado en read model docente. |

Los warnings son observabilidad de desarrollo, no autorizacion para persistir.

## 14. Migracion local

Archivo:

```txt
supabase/setup_multi_tenant/05_academic_catalog_and_course_offerings.sql
```

Caracteristicas:

- aditiva e idempotente para tablas, indices, funciones, triggers y policies;
- sin backfill, delete, rename ni cambios a tablas legacy;
- UUID, FK multi-tenant, unique/check constraints y timestamps;
- estados `text + CHECK`, evitando dependencia de enums existentes;
- no modifica snapshots, cronograma ni motor de mesas;
- debe revisarse en Supabase local/desarrollo antes de promoverse a migracion
  versionada.

Orden local:

```txt
00_all_in_one.sql
01_academic_relational_tables.sql
05_academic_catalog_and_course_offerings.sql
academic_catalog_rls_tests.sql
```

## 15. Tests de dominio incluidos

- oferta sin materia de plan y oferta duplicada;
- transiciones validas/invalidas;
- oferta cancelada;
- alta automatica completa, idempotencia, otro plan, no ingresante y rollback;
- alta manual valida, aprobada, otra carrera, duplicado, cerrada y correlativa;
- historia vacia `NOT_TAKEN`, aprobada `PASSED` y contradiccion
  `PENDING_REVIEW`.

## 16. Riesgos y decisiones posteriores

1. `student_records` no tiene FK a Profile, Career ni StudyPlan. El bridge por
   email/carrera textual solo es aceptable durante la transicion local.
2. Falta decidir la entidad canonica de matricula del alumno a carrera/plan antes
   de activar CourseEnrollment productivo.
3. Correlatividades siguen en snapshot y cliente; deben migrarse antes de abrir
   inscripcion real.
4. No se validan aun solapamientos temporales de TeachingAssignment; el comando
   futuro debe hacerlo con lock y puede incorporar exclusion constraints.
5. `service_role` es una frontera tecnica, no una API de dominio. Las RPC/Edge
   Functions todavia deben implementarse, autenticar actor y usar transaccion.
6. La migracion no fue aplicada a produccion ni debe serlo desde esta rama.
7. El test RLS requiere una instancia Supabase local; el test Vitest solo valida
   que el guion contenga las garantias esperadas.

## 17. Consecuencias

Positivas:

- una materia del plan deja de confundirse con una cursada anual;
- inscripciones y asignaciones obtienen claves y tenant boundaries reales;
- las operaciones criticas tienen contratos y reason codes testeables;
- la historia deja de asumir `REGULAR` por ausencia;
- el snapshot continua disponible sin ser autoridad de las nuevas operaciones.

Costos:

- antes de UI se necesita modelar matricula alumno-carrera-plan y portar
  correlatividades;
- los portales seguiran usando fallbacks durante la transicion;
- se requiere infraestructura server-side para ejecutar los comandos atomicos.

## 18. Conclusion

```txt
READY_FOR_LOCAL_SCHEMA_REVIEW
```

Esta conclusion autoriza revisar y ejecutar el esquema solo en un entorno local
o de desarrollo descartable. No autoriza migracion productiva, nueva UI,
autoinscripcion oficial, historia academica oficial ni cambios al motor de mesas.

## 19. Addendum: ejecucion transaccional local

El corte `LOCAL_SCHEMA_EXECUTION_AND_TRANSACTIONAL_ENROLLMENT` implementa y
valida localmente lo siguiente:

- `student_career_enrollments`, con `profiles.user_id` como identidad autorizada
  y `student_records.id` como registro institucional explicito;
- `study_plan_subject_prerequisites`, con deteccion recursiva de ciclos;
- `domain_command_requests`, con idempotencia por tenant, request y comando;
- RPC atomicas para primer anio e inscripcion individual;
- RLS sin escritura directa para `authenticated`;
- auditoria append-only y validacion de solapamientos docentes;
- adapters JavaScript aislados que solo llaman RPC.

La ejecucion fisica aprobada comprende 13 pruebas RLS, 30 pruebas
transaccionales y dos solicitudes PostgreSQL concurrentes que producen una sola
inscripcion. El informe reproducible esta en
`docs/LOCAL_SCHEMA_EXECUTION_AND_TRANSACTIONAL_ENROLLMENT_2026-07.md`.

Nuevo estado local:

```txt
READY_FOR_LOCAL_TRANSACTIONAL_REVIEW
```

Esto no modifica la decision de no desplegar en produccion. La historia
academica canonica y el backfill administrado siguen pendientes.

## 20. Addendum: gestion administrativa local del vinculo alumno-carrera

La migracion local `08_student_career_enrollment_admin_commands.sql` implementa
comandos independientes para crear, corregir e invalidar
`student_career_enrollments`, y una RPC read-only de historial.

Decision de identidad:

- `student_id` sigue siendo `profiles.user_id`;
- `student_record_id` se selecciona explicitamente por un administrador;
- ambos IDs se validan dentro del tenant derivado desde la carrera o el vinculo;
- el servidor rechaza contradicciones con asociaciones existentes;
- email y carrera textual no participan como autoridad;
- no hay backfill ni vinculacion automatica de ambiguedades.

La correccion es versionada: invalida el registro anterior, crea uno nuevo y
los relaciona mediante `supersedes_enrollment_id` y
`superseded_by_enrollment_id`. Todos los comandos usan
`domain_command_requests`, locks e historial append-only SHA-256. La validacion
fisica local cubre concurrencia, rollback, RLS e inmutabilidad.

Nuevo estado local:

```txt
READY_FOR_INTERNAL_STUDENT_CAREER_LINK_MANAGEMENT
```

Este estado solo habilita preview interna local; no autoriza despliegue remoto.

## 21. Addendum: preview interno del padron docente por oferta

La migracion local `09_teacher_course_roster_preview.sql` agrega una proyeccion
read-only para el portal docente. La fuente autorizada del padron es la cadena
`TeachingAssignment -> CourseOffering -> CourseEnrollment ->
StudentCareerEnrollment ACTIVE -> StudentRecord`.

Decisiones:

- el actor docente queda fijado a `auth.uid()`;
- un target docente opcional solo se acepta para administradores del tenant;
- no se infiere ningun alumno por carrera, anio o snapshot;
- el fallback clasico queda disponible exclusivamente como warning;
- la RPC minimiza datos personales y no concede SELECT global nuevo;
- la feature requiere DEV, Supabase local, Auth real y flag explicita.

La validacion fisica local cubre 31 invariantes, aislamiento de dos tenants,
rechazo cross-tenant, ausencia de PII y limpieza completa. Detalles en
`docs/TEACHER_COURSE_ROSTER_INTERNAL_PREVIEW_2026-07.md`.

Nuevo estado local:

```txt
READY_FOR_INTERNAL_TEACHER_COURSE_ROSTER_PREVIEW
```

No autoriza uso productivo, asistencia, evaluaciones, notas ni historia
academica oficial.

## 22. Addendum: identidad docente canonica

La migracion local `10_teacher_profile_identity_link.sql` agrega la FK nullable
`teacher_records.profile_id -> profiles.user_id`. El vinculo es explicito,
unico por institucion y validado contra rol docente y Membership.

No se adopta matching automatico. Una RPC administrativa lista candidatos
minimizados y otra registra el enlace con motivo y evento append-only. El
preview docente prioriza esta identidad y conserva la resolucion por asignacion
solo como compatibilidad transitoria.

Estado local:

```txt
READY_FOR_INTERNAL_TEACHER_IDENTITY_LINKING
```

No autoriza backfill automatico, despliegue remoto ni cambios al motor.
