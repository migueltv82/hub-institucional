# SEC.2 — `academic_resolve_member_profile_by_email` exige rol de panel admin

Fecha: 2026-10-17. Origen: la auditoría independiente de HARD.1 (P2) marcó una enumeración de PII dentro del tenant. Ejecutado por Claude; la auditoría independiente queda pendiente. Staging y Production: NONE.

## Problema

La RPC solo exigía `is_member_of_institution(inst)`, sin rol. Cualquier miembro, incluso un alumno o un docente (membership `viewer`), podía obtener de otro miembro de su institución, a partir de su email:
- `user_id`, nombre, `account_role`, `is_blocked`;
- ids de legajo docente y de alumno.

Las únicas llamadas legítimas salen del panel admin: `StudentSubjectEnrollmentSection`, `TeacherRosterSection` y `examTeacherAssignments`.

## Cambio

En `supabase/schema/06_subject_teacher_assignments.sql` el chequeo pasa a `is_member_of_institution(inst, array['owner', 'admin', 'editor'])`. El superadmin no cambia. Firma, `SECURITY DEFINER`, `search_path` y grants tampoco.

## Verificación

| Prueba | Run | Resultado |
| --- | --- | --- |
| `node scripts/validateMemberProfileLookupLocal.mjs` | `5334eb3e49d9b62e` | **PASS**. Admin A → 1 fila (docente y alumno); superadmin → 1; alumno y docente A → 0; admin B sobre A → 0 |
| Mismo harness con `--control` (filtro sin rol) | `b1ab4c0cedc9439e` | **FAIL**, como se esperaba: alumno y docente A obtienen 1 fila cada uno. Confirma la fuga |
| Contrato de la función | — | secdef = true, anon = false, authenticated = true |
| Regresiones | — | round trip `9a4b79ec3ea0e958`, identidad 03.2 `5162b05753dcf30a`, paridad 03.3 `a322df389767e39d`, suspensión 06.3 `2cedd5b676034c92`: todas PASS |
| Tests | — | `scripts/validateMemberProfileLookupLocal.test.js` 3/3 |

Aplicar en Staging requiere un OK puntual: solo esta función, extraída de 06.
