# Teacher Course Roster Internal Preview

Fecha: 2026-07-18  
Estado: `READY_FOR_INTERNAL_TEACHER_COURSE_ROSTER_PREVIEW`  
Alcance: local/desarrollo, lectura interna, no oficial.

## 1. Objetivo

El preview permite que un docente autenticado consulte sus ofertas y padrones
sin inferir alumnos por carrera o anio. La cadena autorizada es exclusivamente:

```txt
TeachingAssignment
-> CourseOffering
-> CourseEnrollment
-> StudentCareerEnrollment ACTIVE
-> StudentRecord
```

La RPC no lee `workspaceSnapshot`, `horariosDocentes`, carrera textual del
alumno ni listas manuales. `LEGACY_STUDENT_ROSTER_BY_CAREER_YEAR` solo se
informa como diagnostico y nunca agrega alumnos.

## 2. Auditoria previa del portal docente

| Funcionalidad | Fuente actual clasica | Estado | Riesgo | Fuente autorizada futura |
| --- | --- | --- | --- | --- |
| Identidad docente | coincidencia por email, DNI o nombre en `teacher_records`/snapshot | Legacy mixto | homonimos y registros sin Auth | `auth.uid()` + Profile + Membership + `TeachingAssignment.teacher_record_id` |
| Materias asignadas | `horariosDocentes` filtrado por identidad o carrera/materia | Legacy | inferencia y alias textuales | `teaching_assignments` + `course_offerings` |
| Horarios | `workspaceSnapshot.horariosDocentes` | Legacy | filas duplicadas y campos textuales | `course_schedules` de ofertas asignadas |
| Carga horaria | duracion calculada de filas horarias | Legacy | doble conteo | `teaching_assignments.weekly_hours` |
| Cantidad de alumnos | estado academico o fallback carrera/anio | Riesgo alto | incluye alumnos no inscriptos | `course_enrollments` validos por oferta |
| Lista nominal | `student_records` filtrado por carrera/anio | Riesgo alto | exceso de datos y falso padron | cadena relacional completa del RPC |
| Carrera | texto de horario/ficha | Legacy | alias no canonicos | `academic_careers` desde oferta |
| Plan | `planesEstudio` del snapshot | Legacy | falta de FK | `academic_study_plans` desde oferta |
| Anio | fila de plan o alumno | Legacy | anio de cursada ambiguo | `study_plan_subjects.year_level` + `academic_years` |
| Comision | no canonica | Incompleto | mezcla de grupos | `course_offerings.commission_code` |

El portal clasico no fue modificado funcionalmente. Se agrego metadata segura a
su warning legacy:

```js
{
  code: 'LEGACY_STUDENT_ROSTER_BY_CAREER_YEAR',
  sourceType: 'LEGACY_FALLBACK',
  safeForOfficialRoster: false,
  safeForInternalComparison: true
}
```

## 3. Migracion y RPC

Archivo: `supabase/setup_multi_tenant/09_teacher_course_roster_preview.sql`.

RPC:

```txt
academic_get_teacher_course_roster_preview(p_institution_id, p_teacher_id)
```

- exige `auth.uid()`, Profile activo y Membership;
- en modo docente ignora el target libre y fuerza el actor autenticado;
- rechaza que un docente consulte otro docente;
- en modo admin valida permiso institucional y pertenencia del target al tenant;
- usa `security definer` para producir una proyeccion minima y no concede nuevas
  lecturas globales sobre tablas;
- solo `authenticated` tiene `EXECUTE`; `anon` no;
- no realiza escrituras.

La identidad estructurada se considera resuelta cuando una asignacion vincula
el Profile con `teacher_record_id` del mismo tenant. Un docente sin asignaciones
activas queda `BLOCKED`, con diagnostico explicito.

## 4. Contrato de salida

La respuesta contiene:

- `status`: `READY`, `EMPTY`, `PARTIAL` o `BLOCKED`;
- docente e identidad estructurada;
- opciones de docentes solo para administradores;
- asignaciones con carrera, plan, anio, periodo, comision, rol y horas;
- horarios activos;
- docentes asignados a la oferta;
- padron nominal estructurado;
- totales, cobertura, warnings y diagnosticos sin filas crudas.

No devuelve DNI, email, telefono ni domicilio. El cliente vuelve a aplicar una
lista blanca al contrato para impedir que una ampliacion accidental del RPC
exponga esos campos.

## 5. Estados y diagnosticos

- `READY`: identidad, asignaciones, horarios y relaciones consistentes.
- `EMPTY`: asignaciones validas sin inscripciones estructuradas.
- `PARTIAL`: falta horario o existe una inscripcion con relacion incompleta.
- `BLOCKED`: falta target admin, identidad estructurada o asignacion activa.
- `ERROR`: fallo de transporte o autorizacion mostrado por la UI.

Warnings soportados:

```txt
TEACHER_IDENTITY_NOT_RESOLVED
NO_ACTIVE_TEACHING_ASSIGNMENTS
ASSIGNMENT_WITHOUT_COURSE_OFFERING
ASSIGNMENT_WITHOUT_SCHEDULE
COURSE_OFFERING_WITHOUT_ENROLLMENTS
ENROLLMENT_WITHOUT_ACTIVE_STUDENT_CAREER_LINK
ENROLLMENT_WITHOUT_STUDENT_RECORD
CROSS_TENANT_RELATION_DETECTED
LEGACY_FALLBACK_AVAILABLE_BUT_NOT_USED
```

Las FK compuestas rechazan relaciones cross-tenant. El runner induce una y
comprueba el rechazo fisico.

## 6. UI y feature flag

Flag, apagada por defecto:

```env
VITE_ENABLE_TEACHER_COURSE_ROSTER_INTERNAL_PREVIEW=false
```

Requisitos simultaneos: `DEV`, URL Supabase local, flag activa, sesion Auth
real, institucion activa y rol docente o administrativo autorizado.

Rutas:

```txt
Panel docente -> Mis materias -> /app/docente/cursadas-preview
Panel administrativo -> Seccion avanzada -> Materias y padrones estructurados
```

La UI no contiene controles de asistencia, notas, regularidad ni cierre.

## 7. Validacion local reproducible

```powershell
powershell -ExecutionPolicy Bypass -File scripts\validateTeacherCourseRosterPreviewLocal.ps1
```

La fixture reserva IDs `3900.../3910...` y crea dos instituciones, dos docentes
con asignaciones, un docente vacio, tres ofertas, dos horarios y cuatro alumnos.
Prueba docente ajeno, tenant ajeno, alumno, anon, usuario sin membership,
administrador externo, vinculo invalidado, oferta vacia, falta de horario,
minimizacion de datos y limpieza completa.

Resultado validado: 42 invariantes y cero filas restantes, incluyendo el
vinculo canonico agregado por la migracion 10.

## 8. Riesgos pendientes

1. Las fichas legacy sin `teacher_records.profile_id` requieren vinculacion
   administrativa explicita. No existe backfill por nombre, email o DNI.
2. La politica historica `members can read student records` es mas amplia que el
   contrato de esta RPC. Este corte no agrega ni utiliza esa lectura, pero debe
   endurecerse en una migracion separada con caracterizacion del portal clasico.
3. La comparacion legacy administrativa calcula solo cantidad y diferencia; no
   devuelve ni mezcla una lista nominal legacy.
4. No existe una semantica oficial de asistencia, evaluacion o condicion final.
5. No se aplico ninguna migracion remota ni productiva.

## 9. Prueba manual

1. Iniciar Supabase local y la app en DEV.
2. Definir la flag en `true` solo en `.env.local`.
3. Iniciar sesion Auth local como docente fixture/institucional.
4. Abrir `Panel docente -> Mis materias`.
5. Verificar que cada alumno tenga `CourseEnrollment` en la oferta.
6. Como admin, abrir `Seccion avanzada` y seleccionar un docente del tenant.
7. Apagar la flag y comprobar que la ruta y ambos paneles desaparecen.

La gestion del vinculo canonico esta documentada en
`docs/TEACHER_PROFILE_IDENTITY_LINK_2026-07.md`.

Este estado no autoriza produccion ni convierte el padron en oficial.
