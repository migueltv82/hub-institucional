# Student career link management

Fecha: 2026-07-18

## Alcance

Gestion administrativa interna y local del vinculo:

```txt
profiles.user_id -> student_records.id -> carrera -> plan -> ciclo lectivo
```

No modifica snapshots, cronograma, motor de mesas ni flujos productivos.

## Migracion 08

Archivo:

```txt
supabase/setup_multi_tenant/08_student_career_enrollment_admin_commands.sql
```

Es aditiva e idempotente. Agrega a `student_career_enrollments`:

```txt
supersedes_enrollment_id
superseded_by_enrollment_id
correction_reason
```

No borra registros ni modifica destructivamente los scripts `05`, `06` o `07`.

## RPC

```txt
academic_admin_create_student_career_enrollment
academic_admin_correct_student_career_enrollment
academic_admin_invalidate_student_career_enrollment
academic_admin_get_student_career_enrollment_history
```

CREATE recibe `student_id` y `student_record_id` explicitamente. El tenant se
deriva desde `career_id`; el servidor valida actor, membership del alumno,
registro institucional, carrera, plan y ciclos. No usa email ni nombres como
identidad autorizada.

CORRECT invalida el vinculo anterior y crea su reemplazo en una unica
transaccion. INVALIDATE conserva fisicamente el vinculo y todas las
`course_enrollments`; si hay cursadas activas devuelve
`ACTIVE_COURSE_ENROLLMENTS_EXIST`.

## Seguridad

- `auth.uid()` identifica al actor;
- `can_admin_academic_institution` autoriza el tenant derivado;
- `SECURITY DEFINER` usa `search_path = public, pg_temp`;
- no hay SQL dinamico;
- public y anon no ejecutan las RPC;
- authenticated solo recibe EXECUTE y conserva lectura RLS;
- no se concede INSERT, UPDATE o DELETE directo;
- alumno, docente y administrador de otro tenant quedan bloqueados.

## Idempotencia y auditoria

Tipos de comando:

```txt
CREATE_STUDENT_CAREER_ENROLLMENT
CORRECT_STUDENT_CAREER_ENROLLMENT
INVALIDATE_STUDENT_CAREER_ENROLLMENT
```

La clave es `institution_id + request_id + command_type`. El mismo request ID
devuelve exactamente el resultado almacenado. Los eventos se agregan mediante
`academic_append_domain_audit_event` y mantienen secuencia, `previous_hash` y
SHA-256.

## UI interna

Ruta administrativa:

```txt
Generador de Cronograma -> Avanzado -> Preview interno de inscripcion al cursado
```

El panel permite CREATE, CORRECT e INVALIDATE con resumen, motivo, confirmacion
explicita, estado PROCESSING, request ID y resultado del servidor. Los casos
legacy ambiguos requieren seleccion manual adicional. El historial no contiene
controles de edicion.

La feature flag sigue apagada por defecto:

```txt
VITE_ENABLE_STUDENT_COURSE_ENROLLMENT_INTERNAL_PREVIEW=false
```

## Validacion fisica local

Comando:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\validateStudentCareerAdminCommandsLocal.ps1
```

Resultado:

```txt
createStatus: CREATED
correctionStatus: CORRECTED
invalidationStatus: INVALIDATED
concurrentRequests: 2
rollbackComplete: true
activeCourseEnrollmentsPreserved: 1
auditHashesValid: true
auditChainValid: true
studentBlocked: true
teacherBlocked: true
crossTenantBlocked: true
directWriteBlocked: true
auditMutationBlocked: true
rowsAfterCleanup: 0
REMOTE_SUPABASE_NOT_USED
```

La migracion 08 se aplico dos veces consecutivas sin errores.

## Prueba manual

1. Iniciar Supabase local y aplicar `05`, `06`, `07` y `08`.
2. Activar la feature flag solo en `.env.local` y usar la URL publica local.
3. Iniciar sesion como administrador local con membership `owner` o `admin`.
4. Abrir el panel avanzado y seleccionar usuario, registro de padron, carrera,
   plan y ciclos.
5. Escribir motivo, revisar el resumen y confirmar explicitamente.
6. Repetir con el mismo request ID desde el flujo de reintento y verificar que
   el resultado no cambie.
7. Corregir un vinculo y comprobar que el anterior quede INVALIDATED y ambos
   aparezcan relacionados en el historial.
8. Invalidar un vinculo con cursadas activas y comprobar la advertencia sin
   borrado de inscripciones.

## Riesgos pendientes

1. No existe historia academica canonica; `student_grades` sigue transitorio.
2. No existe un workflow productivo para resolver identidades de padron
   ambiguas; la preview exige seleccion administrativa.
3. No se definio aun la politica sobre `course_enrollments` activas cuando se
   invalida un vinculo.
4. La validacion es local y sintetica. No autoriza produccion.

## Resultado

```txt
READY_FOR_INTERNAL_STUDENT_CAREER_LINK_MANAGEMENT
LOCAL_ENVIRONMENT_CONFIRMED
REMOTE_SUPABASE_NOT_USED
```

No significa listo para produccion.
