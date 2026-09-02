# Student course enrollment internal preview

Fecha: 2026-07-17

## Alcance

Interfaz interna para probar, exclusivamente en desarrollo y contra Supabase
local, el circuito:

```txt
alumno -> vinculo carrera-plan -> ofertas -> inscripcion -> auditoria
```

La pantalla se identifica como `DEV / PREVIEW INTERNA / NO OFICIAL`. No cambia
el cronograma oficial, el motor clasico, `cronogramaInteligente.js` ni los
snapshots.

## Feature flag y acceso

```env
VITE_ENABLE_STUDENT_COURSE_ENROLLMENT_INTERNAL_PREVIEW=true
VITE_SUPABASE_URL=http://127.0.0.1:54321
```

La vista requiere simultaneamente:

- `import.meta.env.DEV === true`;
- feature flag en `true`;
- hostname Supabase `localhost`, `127.0.0.1` o `::1`;
- sesion real de Supabase Auth;
- institucion y usuario activos;
- rol alumno para vista propia, o rol administrativo autorizado.

El bypass DEV de autenticacion no habilita esta funcionalidad. La clave
`service_role` no se usa en el navegador.

## Rutas

Alumno:

```txt
Panel alumno -> Inscripcion al cursado
/app/inscripcion-cursado-preview
```

Administracion:

```txt
Generador de Cronograma -> Avanzado -> Preview interno de inscripcion al cursado
```

Con la flag apagada no se agrega navegacion ni ruta de alumno, y el panel
administrativo no se monta.

## Contrato de datos

La lectura se realiza mediante:

```txt
academic_get_student_course_enrollment_preview(institution_id, student_career_enrollment_id)
```

La proyeccion incluye relaciones carrera-plan, oferta, horarios, docentes,
correlatividades `TO_ENROLL`, inscripciones y command requests. Auditoria y
metricas institucionales se devuelven solo a administradores.

Las unicas escrituras disponibles llaman a los adaptadores existentes:

```txt
enrollFirstYearStudent
enrollStudentInCourseOffering
```

Ambos adaptadores invocan RPC transaccionales. La UI no hace INSERT, UPDATE,
DELETE o UPSERT sobre tablas protegidas y no guarda snapshots.

## Funcionalidad

- diagnostico del vinculo alumno-carrera-plan;
- diagnostico legacy read-only, con ambiguedades visibles;
- ofertas limitadas a institucion, carrera y plan seleccionados;
- horarios, docentes y correlatividades por oferta;
- inscripcion automatica de primer anio con request ID estable;
- inscripcion individual con decision final de la RPC;
- traduccion de rechazos tecnicos;
- inscripciones read-only;
- metricas, command requests y auditoria para administradores;
- advertencia administrativa sobre el uso transitorio de `student_grades`.

La migracion local `08_student_career_enrollment_admin_commands.sql` agrega RPC
autorizadas para crear, corregir e invalidar `student_career_enrollments`, mas
una consulta read-only de historial. La administracion usa esas RPC desde el
panel avanzado. No se hace backfill automatico y los casos ambiguos exigen
seleccion explicita.

## Prueba fisica local

El runner es:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\validateStudentCourseEnrollmentPreviewLocal.ps1
```

Usa una institucion sintetica reservada con IDs `3500...` y cubre:

- ingresante de primer anio;
- alumno de segundo anio;
- alumno de otra carrera;
- materia aprobada;
- correlatividad incumplida;
- oferta cerrada;
- inscripcion existente;
- reintento idempotente;
- alumno intentando consultar otro vinculo;
- docente no autorizado;
- administrador sin membership en otro tenant;
- escritura directa bloqueada.

Resultado validado:

```txt
firstYearCreated: 1
individualCreated: true
sameRequestIdempotent: true
directWriteBlocked: true
otherStudentBlocked: true
teacherBlocked: true
crossTenantAdminBlocked: true
commands: 7
auditEvents: 8
rowsAfterCleanup: 0
REMOTE_SUPABASE_NOT_USED
```

El SQL `07` tambien se aplico dos veces consecutivas para confirmar
idempotencia.

## Prueba manual

1. Iniciar Supabase local y aplicar `05`, `06` y `07` en ese orden.
2. Configurar la URL publica local y activar la feature flag en `.env.local`.
3. Iniciar la app con `npm.cmd run dev`.
4. Iniciar sesion con un usuario Auth local vinculado a la institucion.
5. Como alumno, abrir `Inscripcion al cursado` y comprobar que solo aparecen su
   carrera, plan, ofertas e inscripciones.
6. Como administrador, abrir `Avanzado` y revisar diagnostico, metricas y
   auditoria.
7. Repetir una solicitud con el mismo request ID desde el flujo de reintento y
   confirmar que no se duplica la inscripcion.

## Riesgos pendientes

1. La historia academica canonica no existe; la materia aprobada se valida
   temporalmente desde `student_grades`.
2. La prueba es local y sintetica. No autoriza despliegue remoto ni uso
   productivo.
3. La administracion de oferta, horarios y correlatividades sigue fuera de este
   preview.
4. El primer vinculo entre `profiles.user_id` y `student_records.id` requiere
   seleccion administrativa explicita; no se infiere por email.

## Resultado

```txt
READY_FOR_INTERNAL_STUDENT_ENROLLMENT_PREVIEW
LOCAL_ENVIRONMENT_CONFIRMED
REMOTE_SUPABASE_NOT_USED
```

Este estado habilita pruebas internas controladas en Supabase local. No significa
listo para produccion.
