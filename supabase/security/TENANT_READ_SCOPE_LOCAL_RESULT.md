# SEC.3 — RLS de lectura dentro de la institución: el alumno lee solo lo propio

Fecha: 2026-10-17. Hallazgo P1 de la auditoría independiente de SEC.2, verificado por Claude. Decisión de Miguel (chat 17/10): se corrige antes del GO. Staging y Production: NONE en esta tarjeta.

## Problema

Las policies `… members read` exigían solo `is_member_of_institution(institution_id)`. Cualquier alumno o docente leía por PostgREST, fuera de la UI, todo lo de su institución:
- legajos con email, teléfono y DNI;
- notas, asistencia y estado de cuotas;
- el snapshot completo del workspace;
- las planillas subidas a Storage;
- los registros de bajas.

## Cambio

- `01_foundation.sql`:
  - nuevo `is_staff_of_institution(inst)`: owner/admin/editor, o un miembro con `account_role` docente;
  - `deleted_person_records` pasa a leerlo solo el personal.
- `02_academic_relational_schema.sql`:
  - el catálogo (carreras, planes, materias, correlativas, equivalencias, horarios y asignaciones de materias) sigue visible para cualquier miembro;
  - `student_records`, `teacher_records`, `student_career_plans` y `student_academic_statuses` pasan a: personal o fila propia (`profile_id` o legajo propio vía `current_user_owns_student_record`).
- `07_academic_operations.sql`:
  - `subject_enrollments`, `student_grades` y `subject_attendance_records`: personal o `student_id` propio;
  - `student_financial_status`: personal o legajo propio;
  - `subject_class_sessions`: personal, o sesión de una materia en la que el alumno está inscripto o tiene asistencia.
- `03`, `04` y `05`:
  - `workspace_snapshots`, `exam_engine_v21_states`, `teacher_exam_date_exclusions`, `workspace_source_files`, disponibilidad y carga docente pasan a solo personal;
  - los objetos de Storage `workspace-source-files` también pasan a solo personal;
  - los catálogos legacy siguen igual.
- Las ramas de "fila propia" también exigen membresía activa, así que se mantiene la suspensión de 06.3.
- Las escrituras no cambian.

## Verificación

| Prueba | Run | Resultado |
| --- | --- | --- |
| `node scripts/validateTenantReadScopeLocal.mjs` (matriz de 3 roles × 19 tablas) | `6a9ab51c61ac7b9a` | **PASS**. Admin y docente ven todo. El alumno ve solo lo propio en las 16 tablas con datos personales (0 en snapshot, archivos, bajas y datos docentes) y todo el catálogo |
| Mismo harness con `--control` (policies anteriores) | `e1ff328bc659ed2e` | **FAIL**, como se esperaba: 16 violaciones, el alumno veía filas ajenas en las 16 tablas |
| QA.1, aceptación integrada (portales completos desde la UI) | `68a29c62b5ed0518` | **PASS**: alumno, docente, admin y los 3 ciclos de mesa |
| Matriz RLS A/B completa (`local_ab_rls_rpc_validation.sql`) | — | 75 PASS, 0 errores |
| Regresiones | — | Todas PASS: suspensión 06.3 `e49d106f3a15f722`, identidad 03.2 `a8fa6f85ec3200b1` y `bb127cf95d3d2103`, paridad 03.3 `b4fece5b583a5a5e`, escritura 03.5b `11a42acd51473a8f`, round trip `ba8fac3f3c53e9cf`, SEC.2 `9b25fa46a725a1b1`, Storage `84cc302093b0c3e6`, Edge superadmin `ea9b4d3be83f8724`, reparación R4b `99fb11115a1ad5f4` |

El fixture garantiza que cada tabla con datos personales tenga filas de otro alumno: si no, la sonda no probaría nada y el harness falla.

## Riesgo residual (v1.1)

El docente sigue leyendo toda su institución, porque el portal docente necesita hoy el snapshot completo y el padrón entero. Queda documentado en `docs/SECURITY.md`. En v1.1 el portal docente pasa a una RPC segura y la policy se acota a las materias asignadas.
