# 06.3 — Suspensión de institución efectiva en el servidor

Fecha: 2026-10-17. Decisión humana: entra en v1. Implementado por Claude mientras Codex no estaba disponible; la auditoría queda para Codex. Toca RLS, así que la auditoría tiene que ser completa.

## Problema

`institutions.status = 'suspended'` solo se aplicaba en el cliente: `auth.js` rechaza el login y el selector público lista solo las activas. Del lado del servidor, en cambio, un miembro con sesión abierta de una institución suspendida seguía leyendo y escribiendo. Fueron tres caminos:

1. **RLS.** `public.is_member_of_institution` (usada por las policies y por varias RPC) no miraba el estado de la institución.
2. **RPC de autogestión del alumno.** `upsert_subject_enrollment_from_portal` y `upsert_exam_enrollment_from_portal` validan la membership por su cuenta, sin pasar por el helper.
3. **Edge `admin-users`.** `requireStudentPortalMember`, `requireTeacherPortalMember` y `requireInstitutionAdmin` leen `memberships` con service role, sin RLS.

Los puntos 2 y 3 no estaban en la tarjeta. Los encontró el harness: el alumno de la institución suspendida seguía inscribiéndose a mesa.

## Cambio

| Archivo | Cambio |
| --- | --- |
| `supabase/schema/01_foundation.sql` | `is_member_of_institution` agrega un join con `institutions` y la condición `status = 'active'`. Firma, `SECURITY DEFINER`, `search_path` y grants sin cambios. `is_super_admin` no cambia. |
| `supabase/schema/07_academic_operations.sql` | `upsert_subject_enrollment_from_portal`: el chequeo de membership exige institución activa. |
| `supabase/schema/08_exam_tables.sql` | `upsert_exam_enrollment_from_portal`: mismo cambio. Es el RPC autoritativo de mesas; el espejo `examEligibility.js` no cambia, porque un alumno suspendido no llega a leer datos. |
| `supabase/functions/admin-users/index.ts` | `assertInstitutionActive` nuevo, invocado al final de los tres `require*` de institución. Responde 403 "la institucion esta suspendida". El superadmin no pasa por este chequeo. |

No se tocó ninguna policy una por una.

## Verificación

| Prueba | Resultado |
| --- | --- |
| `node scripts/validateInstitutionSuspensionLocal.mjs` (`INSTITUTION_SUSPENSION_LOCAL_EVIDENCE.json`) | **PASS**, cleanup 0 |
| Mismo harness con `--control` (`INSTITUTION_SUSPENSION_LOCAL_CONTROL_EVIDENCE.json`) | **FAIL**, como se esperaba |
| Contrato de `is_member_of_institution` | `SECURITY DEFINER`, `search_path=public, pg_temp`, EXECUTE anon = false, authenticated = true |
| Regresiones locales | identidad 03.2 (`validateIdentityAuthLocal`, `validateIdentityEscalationLocal`), paridad 03.3, escritura 03.5b, round trip y Edge superadmin: todas **PASS**, cleanup 0 |
| `validateIntegratedAcceptanceLocal` (QA.1, WIP de Codex) | FAIL en "student exam registration persisted", **idéntico con y sin este cambio**. Es el comportamiento conocido de `snapshot_only`; no lo causa 06.3. |
| Tests | `scripts/validateInstitutionSuspensionLocal.test.js` 5/5; `adminUsersEdgeFunctionSecurity.test.js` +2 (Edge y SQL); `adminUsersStudentIdentity.test.js` +1 (admin de institución suspendida → 403 sin escrituras) |
| `npm run quality:full` | OK: 315 archivos, 2486 tests. `npm audit`: 7 moderadas, sin cambios respecto de DEP.1 |

Cómo corre el control: carga el baseline quitando exactamente los bloques marcados `06.3`. Con eso:
- admin, docente y alumno de A siguen leyendo 8 tablas de A estando suspendida;
- el snapshot del admin, la nota del docente, la cursada y la mesa del alumno se aceptan.

Cómo corre el harness:
- base descartable con el baseline de 9 SQL y el fixture A/B de 03.3, más la cursada, la titularidad de FIX-A-01 y un superadmin;
- las sondas corren como `authenticated` con el `sub` de cada usuario, el mismo mecanismo que usa PostgREST con el JWT, igual que en 03.3 y 03.5b; cada sonda es una transacción con `ROLLBACK`;
- el superadmin suspende y reactiva A con un `UPDATE` directo bajo RLS, la misma ruta que usa `SuperAdminInstitutionsPage`.

| Fase | Admin A | Docente A | Alumno A (mesa) | Alumno A (cursada) | Admin B |
| --- | --- | --- | --- | --- | --- |
| activa | lee 9 · escribe | lee 9 · escribe | lee 9 · escribe | lee 9 · escribe | lee 7 · escribe |
| suspendida | 0 · 42501 | 0 · `ACADEMIC_COMMAND_FORBIDDEN` | 0 · `ACADEMIC_COMMAND_FORBIDDEN` | 0 · `ACADEMIC_COMMAND_FORBIDDEN` | lee 7 · escribe |
| reactivada | lee 9 · escribe | lee 9 · escribe | lee 9 · escribe | lee 9 · escribe | lee 7 · escribe |

## Efectos y riesgos residuales

- Un miembro con sesión abierta cuando se suspende la institución pasa a ver datos vacíos y le rechazan las escrituras. No hay un mensaje dedicado: el login ya no le ofrece la institución, porque el selector público solo lista activas.
- `teacher_reset_student_subject_academic_records` y `teacher_remove_student_subject_records` solo las ejecuta `service_role`. Quedan cubiertas por el chequeo nuevo de la Edge.
- **Aplicación remota.** Va en STG1 (Staging) y PROD1, con el OK humano de ese momento. Archivos: `01_foundation.sql`, `07_academic_operations.sql`, `08_exam_tables.sql`, más el redeploy de `admin-users`. Staging/Production: NONE en esta tarjeta.
