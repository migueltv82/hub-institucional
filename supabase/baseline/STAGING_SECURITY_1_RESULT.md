# STAGING SECURITY 1 — 2026-10-04

## Target y alcance

Target confirmado por get_project: Hub-Institucional-Staging, ref `lzjpycejdjpzkdyzaeco`, ACTIVE_HEALTHY. No se consulto ni modifico Production.

Aceptacion ejecutada en PostgreSQL remoto de Staging: trigger Auth real al insertar auth.users sinteticos; RLS y RPC como roles authenticated/anon mediante SET LOCAL ROLE y claims de sesion controlados por el harness. No signup/login HTTP ni JWT emitidos por GoTrue: no declarar validacion E2E de Auth/API. No passwords, tokens, service-role ni secretos.

## Reproduccion

1. Confirmar por API nombre/ref exactos de Staging, nunca usar link implicito ni Production.
2. Generar SQL con `node supabase/baseline/staging_security_1.mjs`.
3. Revisar SQL y ejecutar en una sola llamada/sesion contra el target confirmado, sin autocommit entre sentencias.
4. Exigir resultado passed_cases con los 73 checkpoints listados abajo; cualquier excepcion detiene la ejecucion y revierte la transaccion.
5. Ejecutar en una llamada independiente la consulta READ ONLY generada por `node supabase/baseline/staging_baseline_verifier.mjs` y contar auth.users/auth.identities/auth.sessions.
6. Cleanup solo se declara cerrado si todos los datos sinteticos estan en cero.

El generador reutiliza el script A/B existente, desactiva ramas focales psql y convierte checkpoints en resultado JSON. Excluye tres savepoints que retiran FKs y el bloque que cambia app_settings: NO ejecutados, NO contados como PASS. No DDL, grants/RLS, repairs, migraciones, seeds persistentes ni despliegues. Todo fixture vive en BEGIN/ROLLBACK. Precondicion interna: auth.users e institutions vacios; se detiene antes de fixtures si no se cumple.

Fixtures: 2 instituciones A/B, 2 admins, 4 docentes (titular/reemplazante), 2 alumnos, 1 blocked, 1 sin membership y 1 atacante con raw_user_meta_data malicioso; carreras/planes/materias/legajos/asignaciones/inscripciones/clases/notas/asistencias/mesa/snapshot sinteticos. Emails @fixture.invalid y nombres Fixture.

## Resultados reales

- 73/73 checkpoints PASS, sin excepciones de seguridad.
- handle_new_user: raw_user_meta_data.role/account_role=superadmin e is_global_admin=true no elevan privilegios; perfil alumno/is_global_admin=false, cero memberships; is_super_admin=false incluso con user_metadata malicioso en claims.
- Contrato EXECUTE verificado por catalogo para las 28 funciones Auth/academicas enumeradas en staging_security_1_auth_negative.sql.inc: PUBLIC sin EXECUTE; anon solo APIs publicas login/mantenimiento; authenticated segun contrato, sin helpers internos/trigger/RPC service-only. Existencia/no sobrecarga de 8 RPC criticas comprobada.
- Student A/B, membership docente/alumno, blocked y sin membership, CRUD cross-tenant student_records/subject_enrollments/subject_teacher_assignments: PASS.
- Subject/exam enrollment, grade, attendance, roster, notices, resolver, profile resolver, permisos y RPC administrativas: positivos intra-tenant y negativos cross-tenant/auth nulo PASS conforme casos abajo.
- Guards FK legajo/enrollment/docente, UUID enrollment ajeno en grade/attendance, lote asistencia atomico y borrado SET NULL/CASCADE sintetico: PASS.
- Snapshot y confirmacion pending/confirmed/mapping legacy fail-closed: PASS.

Primer intento: error de harness `42601: syntax error at or near "$", LINE 29: do $ begin`. JS replace con replacement string interpreto delimitadores $$. Se corrigio solo el generador con callback que preserva $$ y test de regresion. Comprobacion posterior independiente: auth.users/institutions/profiles/memberships=0. Segundo intento, con SQL corregido: 73 checkpoints PASS y ROLLBACK. No fallo de schema ni P0/P1 de seguridad confirmado; no reparacion remota.

### Checkpoints devueltos por Staging

- PASS `handle_new_user_untrusted_metadata_denied`
- PASS `positive_subject_enrollment_A`
- PASS `negative_subject_enrollment_cross_tenant`
- PASS `negative_subject_enrollment_null_auth_uid`
- PASS `student_records_select_A_B`
- PASS `student_records_insert_cross_tenant_denied`
- PASS `student_records_update_delete_cross_tenant_denied`
- PASS `blocked_user_denied`
- PASS `no_membership_denied`
- PASS `teacher_identity_membership_without_assignment`
- PASS `student_identity_membership_without_management`
- PASS `subject_enrollment_resolve_student_A`
- PASS `subject_enrollment_resolve_admin_A`
- PASS `subject_enrollment_resolve_assigned_teacher_A`
- PASS `subject_enrollment_resolve_null_auth_uid_denied`
- PASS `subject_enrollment_resolve_cross_tenant_denied`
- PASS `positive_exam_enrollment_A`
- PASS `negative_exam_enrollment_cross_tenant`
- PASS `negative_exam_enrollment_null_auth_uid`
- PASS `teacher_roster_A_and_cross_tenant_denied`
- PASS `teacher_roster_B_cannot_read_A`
- PASS `student_grades_A_and_cross_tenant_denied`
- PASS `student_grades_B_cannot_read_A`
- PASS `teacher_create_class_session_A`
- PASS `teacher_create_class_session_cross_tenant_denied`
- PASS `subject_enrollments_crud_cross_tenant_denied`
- PASS `exam_enrollments_direct_crud_denied`
- PASS `teacher_upsert_grade_A`
- PASS `teacher_upsert_grade_cross_tenant_denied`
- PASS `teacher_upsert_attendance_A`
- PASS `class_session_select_and_attendance_cross_tenant_denied`
- PASS `member_profile_resolve_admin_A`
- PASS `profile_and_notices_cross_tenant_denied`
- PASS `student_portal_snapshot_A`
- PASS `pending_exam_hidden_from_student_A`
- PASS `confirmed_exam_visible_to_student_A`
- PASS `student_portal_snapshot_cross_tenant_denied`
- PASS `unmapped_pending_exam_fail_closed`
- PASS `empty_exam_mapping_fail_closed`
- PASS `assignment_condition_and_leave_cross_tenant_denied`
- PASS `assignment_condition_and_leave_admin_A`
- PASS `foundation_admin_rpcs_cross_tenant_denied`
- PASS `academic_transition_config_auth_guard`
- PASS `internal_rpc_grants_denied`
- PASS `subject_teacher_assignments_crud_cross_tenant_denied`
- PASS `student_teacher_notices_A`
- PASS `blocked_student_reads_denied`
- PASS `no_membership_student_reads_denied`
- PASS `blocked_teacher_reads_and_permission_denied`
- PASS `no_membership_teacher_reads_and_permission_denied`
- PASS `null_auth_analogous_rpcs_denied`
- PASS `roster_cross_tenant_legajo_denied`
- PASS `focal_student_teacher_B_and_cross_tenant`
- PASS `focal_rpc_cross_tenant_record_and_null_auth_denied`
- PASS `focal_foreign_student_profile_hidden`
- PASS `focal_workspace_guard_and_record_delete_set_null`
- PASS `notices_cross_tenant_insert_update_rpc_denied`
- PASS `notices_cross_tenant_teacher_record_denied`
- PASS `notices_blocked_and_null_auth_denied`
- PASS `notices_foreign_profile_fallbacks_hidden`
- PASS `notices_workspace_guard_and_delete_set_null`
- PASS `grade_foreign_enrollment_denied`
- PASS `grade_teacher_B_valid_insert_resolve_update`
- PASS `grade_blocked_and_null_auth_denied`
- PASS `grade_fk_direct_cross_tenant_writes_denied`
- PASS `grade_fk_delete_set_null`
- PASS `attendance_foreign_enrollment_denied`
- PASS `attendance_B_valid_insert_resolve_update`
- PASS `attendance_batch_atomic_rejection`
- PASS `attendance_blocked_and_null_auth_denied`
- PASS `attendance_fk_cross_tenant_and_delete_semantics`
- PASS `remaining_class_attendance_grade_crud_and_helpers`
- PASS `public_login_contract_and_internal_grants`

## Cleanup independiente

Consulta posterior READ ONLY: 40 tablas canonicas, 39 con 0 filas; app_settings=1, maintenance_mode enabled=false/is_public=true, configuracion original intacta. auth.users=0; auth.identities=0; auth.sessions=0. Incluye instituciones/perfiles/memberships/legajos/enrollments/assignments/notas/asistencias/eventos/snapshots/auditoria todos=0.

cleanup=0 fixtures residuales. Ningun DELETE masivo de limpieza: se revirtieron los fixtures por ROLLBACK.

## Gates y riesgos

Test focal del generador: 3/3 PASS. Lint focal PASS. Diff-check sin errores de whitespace, solo avisos LF/CRLF. No suite global/build: no codigo de aplicacion/schema/grants/RLS modificado. Typecheck NO DISPONIBLE (JS). Browser/E2E NO APLICA al alcance SQL; Auth HTTP queda no probado. Performance NO APLICA: no se declara mejora ni prueba de carga.

Focales finales: stagingSecurityAcceptance + supabaseFunctionSecurityMatrix + examEnrollmentRpcContract, 3 archivos/24 tests PASS. El primer run adicional detecto que el fragmento Auth .sql se catalogaba incorrectamente como script baseline independiente; se marco como .sql.inc, solo consumido por el generador. No se debilito la expectativa existente ni se cambio SQL de aplicacion. Lint focal y diff-check PASS. Archivos tocados: generador, include Auth, test focal, este informe y entrada en docs/WORKLOG.md.

Database/RLS/Security/Code Review/Adversarial Review: PASS en alcance SQL sintetico de primera fase. Typecheck: NO DISPONIBLE. Build: NO EJECUTADO (alcance harness). Browser/E2E: NO APLICA. Performance: NO APLICA. QUALITY GATE: PASS WITH WARNINGS por limites explicitos, no equivalente a release global.

CHIEF CODE AUDITOR independiente: harness apto para ejecucion, revision adversarial sin P0/P1/P2/P3 nuevos abiertos; test de delimitadores corregido y 3/3 PASS. Dictamen final de evidencia: PASS para aceptacion SQL acotada, sin reejecucion remota por el auditor.

P0=0/P1=0 en ejecucion. P3 previo: error distinto para UUID inexistente/no autorizado en academic_update_teacher_assignment_condition (oracle limitado, sin autorizacion ni datos), no modificado. No concurrency real entre sesiones en Staging, ni branches focales de combinaciones de contexto grade/attendance adicionales; no reapertura de pruebas locales cerradas. No Storage/Edge/frontend, ni Auth rate-limit/mail/GoTrue/signup/login/revocacion HTTP. Estos limites no deben presentarse como validacion global o de Production.

Staging mutations realizadas: solo DML sintetico transaccional (incluido trigger y RPC), revertido integramente; persistentes NONE. Production mutations: NONE. Schema/grants/RLS mutations: NONE. Storage/Edge/frontend changes: NONE.

STAGING SECURITY 1 — PASS — LISTO PARA STORAGE/EDGE
