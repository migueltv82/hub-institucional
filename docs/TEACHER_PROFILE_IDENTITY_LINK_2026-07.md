# Teacher Profile Identity Link

Fecha: 2026-07-18  
Estado: `READY_FOR_INTERNAL_TEACHER_IDENTITY_LINKING`  
Alcance: local/desarrollo, herramienta administrativa interna.

## Decision

`teacher_records.profile_id` es el vinculo canonico entre la ficha institucional
y `profiles.user_id`. El enlace es nullable para conservar registros legacy y
unico por institucion/perfil.

No se ejecuta backfill automatico. Nombre, email, DNI, telefono y contenido de
`raw_payload` no se usan para decidir identidad.

## Migracion 10

`supabase/setup_multi_tenant/10_teacher_profile_identity_link.sql` agrega:

- columna `teacher_records.profile_id`;
- FK a `profiles.user_id` con `ON DELETE SET NULL`;
- indice unico parcial `(institution_id, profile_id)`;
- trigger que exige Profile docente activo y Membership del mismo tenant;
- RPC minimizada de candidatos;
- RPC administrativa auditada de enlace explicito.

RPC:

```txt
academic_admin_get_teacher_profile_link_candidates(p_institution_id)
academic_admin_link_teacher_record_profile(p_teacher_record_id, p_profile_id, p_reason)
```

Solo `authenticated` puede invocarlas y la autorizacion administrativa se
revalida en servidor. No se conceden escrituras directas sobre
`teacher_records`.

## Integracion con el preview docente

`academic_get_teacher_course_roster_preview` resuelve primero el enlace
canonico. El recorrido por `teaching_assignments.teacher_record_id` permanece
solo como compatibilidad transitoria para fichas aun no vinculadas.

Un docente con Profile y TeacherRecord vinculados, pero sin asignaciones, queda:

```txt
structuredIdentityStatus: RESOLVED
status: BLOCKED
warning: NO_ACTIVE_TEACHING_ASSIGNMENTS
```

La falta de asignaciones ya no se confunde con identidad no resuelta.

## UI administrativa

Ubicacion:

```txt
Generador de Cronograma
-> Seccion avanzada
-> Materias y padrones estructurados
-> Identidad docente estructurada
```

La herramienta muestra exclusivamente nombres e IDs tecnicos. El administrador
selecciona manualmente ficha, Profile y motivo. Cada alta efectiva agrega un
evento `TEACHER_PROFILE_LINKED`; repetir el mismo enlace devuelve
`ALREADY_LINKED` sin duplicar auditoria.

## Validacion local

```powershell
powershell -ExecutionPolicy Bypass -File scripts\validateTeacherCourseRosterPreviewLocal.ps1
```

Resultado fisico: 42 invariantes aprobadas. Incluye idempotencia de migraciones
09/10, tenant, roles, candidatos sin PII, enlace, auditoria, rechazo
cross-tenant, preview posterior y limpieza en cero.

## Riesgos pendientes

1. Las fichas legacy deben vincularse manualmente; no se infieren.
2. Todavia no existe comando para desvincular o reemplazar un enlace. Debe
   disenarse con historial y confirmacion reforzada antes de agregarlo.
3. La politica historica general de `student_records` sigue fuera de este corte.
4. No se aplico la migracion a un proyecto remoto o productivo.

Este estado no habilita produccion ni modifica el motor de examenes.
