# Local schema execution and transactional enrollment

Fecha: 2026-07-17

## Alcance

Validacion fisica del catalogo academico y de la inscripcion transaccional en
Supabase local. No se uso ningun proyecto remoto y no se ejecutaron `supabase
link`, `supabase db push`, `--linked` ni migraciones productivas.

Entorno confirmado:

```txt
PostgreSQL local: contenedor supabase_db_*
Host API local: 127.0.0.1
Puerto PostgreSQL local: 54322
Base: postgres
Rama: codex/academic-catalog-course-offering
LOCAL_ENVIRONMENT_CONFIRMED
REMOTE_SUPABASE_NOT_USED
```

No se registran contrasenas, tokens ni claves en este documento.

## Orden ejecutado

```txt
00_all_in_one.sql
01_academic_relational_tables.sql
05_academic_catalog_and_course_offerings.sql
06_transactional_course_enrollment.sql
academic_transactional_schema_validation.sql
academic_catalog_rls_tests.sql
academic_transactional_enrollment_tests.sql
validateAcademicEnrollmentConcurrencyLocal.ps1
```

Los scripts `00`, `01`, `05` y `06` se repitieron correctamente. `06` se
ejecuto dos veces consecutivas en la validacion final. La instalacion es aditiva:
no elimina tablas, no trunca y no realiza backfill automatico.

## Correcciones surgidas de PostgreSQL real

1. Los seeds de `00_all_in_one.sql` asumian un email personal existente. Ahora
   se omiten con `NOTICE` cuando el usuario no existe.
2. `pgcrypto` esta instalado en el schema `extensions`; el hash de auditoria usa
   `extensions.digest` de forma explicita.
3. El fixture Auth activaba el trigger de perfiles y podia duplicar `profiles`.
   El test usa `ON CONFLICT DO UPDATE`.
4. La correlatividad de prueba tenia una vigencia futura y no era aplicable. Se
   fijo una fecha vigente para comprobar realmente `TO_ENROLL`.
5. La primera version del runner de concurrencia perdia los claims por
   autocommit. Cada sesion ahora conserva claims y RPC dentro de una unica
   transaccion.

Cada correccion fue seguida por una nueva ejecucion fisica satisfactoria.

## Modelo incorporado

### Vinculacion alumno-carrera-plan

`student_career_enrollments` usa:

- `student_id = profiles.user_id` como identidad autorizada;
- `student_record_id = student_records.id` como registro institucional;
- FK compuestas con `institution_id` para alumno, carrera, plan y ciclos;
- estados `ACTIVE`, `PAUSED`, `COMPLETED`, `WITHDRAWN`, `TRANSFERRED` e
  `INVALIDATED`;
- invalidacion sin borrado fisico;
- unicidad activa por institucion, alumno, carrera y plan.

El diagnostico legacy es read-only y clasifica coincidencias como
`READY_FOR_RELATIONAL_LINK`, ambiguas, faltantes o duplicadas. Devuelve
cantidades y porcentajes, no persiste backfills y no expone email en el resultado.

### Correlatividades

`study_plan_subject_prerequisites` conserva materia y requisito dentro del mismo
plan e institucion, impide autorreferencias, duplicados activos y ciclos directos
o indirectos. En este corte las RPC evaluan solamente `TO_ENROLL`.

### Idempotencia y RPC

`domain_command_requests` tiene unicidad por:

```txt
institution_id + request_id + command_type
```

Las RPC publicas son:

```txt
academic_enroll_first_year_student(uuid, uuid, uuid)
academic_enroll_student_in_course_offering(uuid, uuid, uuid)
```

Ambas resuelven actor mediante `auth.uid()`, validan tenant/rol/relacion,
ejecutan como `SECURITY DEFINER` con `search_path = public, pg_temp`, registran
auditoria y no aceptan email, nombre de carrera ni actor confiable desde cliente.
`authenticated` solo recibe `EXECUTE`; no tiene escritura directa sobre las
tablas transaccionales.

## Resultados fisicos

### Catalogo PostgreSQL

```txt
TRANSACTIONAL_SCHEMA_VALIDATION_OK
Policies nuevas: 3
Triggers relevantes: 7
```

Se confirmaron tablas, funciones, constraints de unicidad, RLS, ausencia de
DELETE para `service_role`, ausencia de INSERT/UPDATE/DELETE para
`authenticated`, y permisos RPC limitados.

### RLS catalogo

```txt
13/13 pruebas aprobadas
```

Incluye aislamiento de alumno, docente, administrador, usuario sin membership e
inmutabilidad operativa.

### RPC y transacciones

```txt
30/30 pruebas aprobadas
```

Incluye primer anio, mismo y distinto `request_id`, rollback inducido completo,
no ingresante, plan distinto en la misma carrera, otra carrera, otro tenant,
oferta cerrada, capacidad agotada, materia aprobada, correlatividad incumplida,
duplicados, ciclo indirecto, RLS y cadena SHA-256 append-only.

### Concurrencia real

Dos procesos `psql` simultaneos invocaron la misma RPC con el mismo request ID:

```json
{
  "ok": true,
  "concurrentRequests": 2,
  "persistedEnrollments": 1,
  "persistedCommandRequests": 1,
  "auditEvents": 1,
  "identicalStoredResults": true,
  "remoteSupabaseUsed": false
}
```

La fixture usa IDs sinteticos `3300...` y se elimina en `finally`. La
comprobacion posterior dio cero instituciones, inscripciones, commands y eventos
de esa fixture.

### Solapamientos docentes

PostgreSQL acepta franjas consecutivas (`18:20-19:00`, `19:00-19:40`) y rechaza
franjas superpuestas para el mismo docente, dia y vigencias coincidentes.

## JavaScript aislado

`academicEnrollmentCommands.js` llama exclusivamente a RPC. No escribe tablas,
no guarda snapshots y no esta conectado a UI productiva. El diagnostico legacy
tambien es puro y read-only.

## Riesgos pendientes

1. La historia academica canonica aun no existe. La comprobacion temporal de
   materias aprobadas consulta `student_grades` mediante el UUID estable de la
   materia almacenado como texto.
2. No se ejecuto backfill de alumnos legacy; los casos ambiguos requieren
   resolucion administrativa.
3. `domain_command_requests.FAILED` queda preparado, pero un error SQL inesperado
   hace rollback completo, incluida la fila PROCESSING. La trazabilidad del error
   tecnico debe resolverse fuera de la transaccion en una futura capa servidor.
4. La validacion es local y no autoriza despliegue, UI productiva ni inscripcion
   oficial.

## Resultado

```txt
READY_FOR_LOCAL_TRANSACTIONAL_REVIEW
```

Este estado no significa listo para produccion.

Confirmaciones:

```txt
Supabase productivo no utilizado.
Proyecto remoto no utilizado.
Migraciones productivas no ejecutadas.
UI productiva sin cambios.
Motor clasico sin cambios.
cronogramaInteligente.js sin cambios.
Cronograma oficial sin cambios.
```
