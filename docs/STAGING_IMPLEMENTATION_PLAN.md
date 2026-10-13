# Etapa 02.6 — Staging isolation & remediation plan

## Estado vigente frente al plan histórico

Staging existe y fue inicializado/verificado; baseline local descartable PASS, 9 SQL canónicos aplicados y 40 tablas public con RLS. Ver [baseline](../supabase/baseline/STAGING_BASELINE_RESULT.md), [RLS/RPC local](../supabase/baseline/LOCAL_AB_RLS_RPC_RESULT.md), [Security 1](../supabase/baseline/STAGING_SECURITY_1_RESULT.md) y [Security 2 con estado posterior](../supabase/baseline/STAGING_SECURITY_2_RESULT.md). Security acceptance está validada en esos alcances, sin certificar toda prueba propuesta. Portal Docente v1 read-only certificado; decisiones/reasignación/reconciliación docente diferidas post-v1.

Los estados de partida 02.6/02.7 y checkpoint 02.8A conservados debajo son **HISTÓRICOS / SUPERADOS** cuando describen baseline parcial, DB pendiente, Staging no inicializado y RPC/schema necesarios ausentes. No extender esa conclusión a las RPC de features incompletas. El plan de creación/remediación preserva trazabilidad y no autoriza repetir mutaciones ni extrapolar el discovery del remoto original al Staging actual.

Production sigue **NO-GO**. Frontend sin deploy, Vercel READY técnico; pendientes candidato Git reproducible, proyecto/origin web Staging, CORS de dominio real, backup/restore, rollback, observabilidad, E2E/UAT y release closure. Branch protection remota no verificada/configurada. Ninguna autorización de ejecución surge de esta nota.

Fecha: 2026-09-26. Alcance: planificación y preparación documental para `migueltv82/hub-institucional`. Esta etapa no crea staging, no modifica Supabase remoto, no ejecuta SQL, no aplica 02.3, no despliega Edge Functions y no cambia runtime.

## Estado de partida histórico

La etapa 02.5 confirmó:

- `Hub-Institucional` está `ACTIVE_HEALTHY`.
- El acceso remoto CLI fue recuperado y el link local coincide con el proyecto (`qwrw…mibx`).
- El discovery remoto fue read-only, con `ROLLBACK`.
- `public.handle_new_user()` remoto conserva la vulnerabilidad 02.3: lee `raw_user_meta_data.account_role`.
- Las 12 RPC investigadas están ausentes en remoto y no tienen definición SQL local auditable.
- RLS y Storage fueron inventariados, pero faltan pruebas negativas reales por rol/tenant.
- 30 funciones remotas tienen `EXECUTE` para `anon` y/o `authenticated`; no hay `PUBLIC EXECUTE`.
- Producción/remoto queda `NO-GO`.

Referencias oficiales verificadas para el diseño futuro:

- Supabase recomienda ambientes separados para staging y producción, y advierte que un proyecto ya modificado para parecerse a producción no sirve como staging inicial si el CLI debe reaplicar cambios: https://supabase.com/docs/guides/deployment/managing-environments
- Supabase Branching crea ambientes separados con credenciales propias; los branches son data-less por defecto para proteger datos sensibles: https://supabase.com/docs/guides/deployment/branching
- Las migrations versionan cambios de schema; una vez adoptadas, los cambios remotos deben pasar por archivos de migration, no por cambios manuales en remoto: https://supabase.com/docs/guides/deployment/database-migrations
- Los secrets de Edge Functions deben ser propios del ambiente y no vivir en el frontend: https://supabase.com/docs/guides/functions/secrets

## Topología actual

Metadata read-only disponible:

| Proyecto visible | Relación con Hub Institucional | Estado | Observación |
| --- | --- | --- | --- |
| `Hub-Institucional` | Producto actual | `ACTIVE_HEALTHY` | Único proyecto Supabase visible que corresponde al producto; link local activo. |
| `cs automotores` | No corresponde al producto | `INACTIVE` | Otro producto/negocio; no tratar como staging ni development de Hub. |
| `Lulu Torres Ceramica` | No corresponde al producto | `INACTIVE` | Otro producto/negocio; no tratar como staging ni development de Hub. |

Conclusión:

- No hay evidencia de un proyecto remoto de staging para Hub Institucional.
- No hay evidencia de un proyecto remoto de development para Hub Institucional.
- `Hub-Institucional` debe tratarse como el único ambiente remoto del producto hasta que se cree un staging aislado.
- No se pudo determinar qué ambiente consume un frontend desplegado sin acceder a configuración externa de hosting o secretos; los archivos versionados solo contienen placeholders y guardas para `VITE_SUPABASE_URL`/`VITE_SUPABASE_PUBLISHABLE_KEY`.

## Estado histórico de staging — 02.7, SUPERADO en el alcance acreditado

Fecha de verificación: 2026-09-26. Alcance: metadata/read-only con Supabase CLI y documentación. No se ejecutaron migrations, `db push`, `supabase link`, Edge Functions, SQL mutante ni cambios de Auth/RLS/Storage/datos/secrets.

| Ambiente | Proyecto | Estado | Región | Link local | Ref documentada |
| --- | --- | --- | --- | --- | --- |
| Production | `Hub-Institucional` | `ACTIVE_HEALTHY` | `sa-east-1` | Sí | `qwrw…mibx` |
| Staging | `Hub-Institucional-Staging` | `ACTIVE_HEALTHY` | `sa-east-1` | No | `lzjp…aeco` |

Conclusiones 02.7:

- Producción y staging son proyectos distintos; las refs verificadas no coinciden.
- Staging fue creado sin costo adicional informado por el usuario (`NINGUNO`) y aparece operativo como `ACTIVE_HEALTHY`.
- El link local actual se conserva apuntando a producción (`Hub-Institucional`, `qwrw…mibx`).
- La metadata del link local vive en `supabase/.temp/` (`project-ref`, `linked-project.json` y metadata auxiliar), y `supabase/.gitignore` ignora `.temp`, por lo que no queda versionada por Git.
- Riesgo operativo: cualquier comando que use `--linked` apunta a producción mientras este checkout conserve ese link. El nombre del proyecto y el ref deben verificarse explícitamente antes de cualquier operación remota.
- `supabase db query` permite `--linked`, `--local` o `--db-url`, pero no ofrece `--project-ref`. Por eso no se ejecutó conexión SQL read-only contra staging: hacerlo sin `db-url` válido exigiría cambiar el link local, lo cual está prohibido para 02.7.
- Resultado de schema staging: `HUB APPLICATION SCHEMA: NOT DEPLOYED` como estado operativo documentado para esta etapa; no se cargó schema, no se aplicó 02.3 y no se ejecutó discovery remoto contra staging. No es una comprobación de catálogo SQL porque 02.7 no tiene mecanismo seguro para consultar staging sin `db-url` o relink.
- Auth, Storage y base de datos staging quedan aislados por ser un proyecto Supabase separado. No se copiaron usuarios, buckets, objetos ni datos reales.

Antes de cualquier trabajo remoto futuro debe registrarse una ficha de objetivo:

```text
TARGET ENVIRONMENT:
PROJECT NAME:
PROJECT REF:
LINK MODE:
COMMAND CLASS:
HUMAN APPROVAL:
```

Regla obligatoria: para mutaciones remotas el link local no alcanza como prueba de destino. Verificar `TARGET ENVIRONMENT`, `PROJECT NAME` y `PROJECT REF` en la misma sesión. Toda mutación contra production requiere aprobación humana explícita y separada.

## Topología objetivo

| Ambiente | Proyecto / runtime | Responsabilidad | Datos | Mutabilidad |
| --- | --- | --- | --- | --- |
| Production | `Hub-Institucional` | Operación real del producto y datos institucionales autorizados. | Datos reales mínimos necesarios. | Solo cambios controlados después de staging, backup/restore verificado y revisión humana. |
| Staging | Proyecto Supabase separado, propio de Hub Institucional | Validar schema, Auth, Edge Functions, RLS, Storage, frontend y remediaciones sin afectar producción. | Datos sintéticos y configuración no personal. | Destruible/recreable; puede resetearse. |
| Local Development | Supabase local vía CLI cuando resulte viable | Desarrollo diario y validación rápida contra schema reproducible. | Seeds sintéticos chicos. | Reset frecuente; no contiene datos reales. |

Staging no debe ser una copia improvisada de producción. Debe tener nombre inequívoco, URL/keys propias, secrets propios, bucket propio y usuarios sintéticos.

## Fuente de verdad futura

Objetivo:

```text
Git → schema/migrations controladas → staging → production
```

No aceptar como flujo operativo:

```text
production → cambios manuales → Git eventualmente
```

Reglas:

1. Git debe contener la fuente reproducible de schema, functions, RLS, grants, Storage policies y seeds sintéticos.
2. Staging debe construirse desde Git, no desde producción con datos reales.
3. Producción solo debe recibir cambios que ya pasaron por staging.
4. Las reparaciones históricas (`repair_*`) no se aplican como lote: se reconcilian contra la fuente canónica.
5. La evidencia de remoto se usa para diagnosticar drift, no para copiar definiciones sin revisión.

## Estrategia de migrations

Estado actual: no existe `supabase/migrations/`. El repo usa:

- `supabase/schema/*.sql` como fuente canónica por capítulos.
- `supabase/security/*.sql` como diagnósticos/hardening/revisión.
- `supabase/docs/repair_*.sql` como reparaciones históricas o condicionales.

Opciones evaluadas:

| Opción | Descripción | Ventajas | Riesgos |
| --- | --- | --- | --- |
| A | Crear un baseline migration único desde schema canónico reconciliado. | Simple para crear staging desde cero. | Puede ocultar decisiones históricas y mezclar reparaciones obsoletas si no se reconcilia antes. |
| B | Mantener schema canónico y agregar migrations incrementales desde un punto de corte. | Respeta la estructura actual y permite transición gradual. | Si no hay baseline ejecutable, staging sigue dependiendo de orden manual. |
| C | Híbrida: reconciliar `schema/` + `security/` + `repair_*`, crear un baseline reproducible para staging y desde el corte usar migrations incrementales. | Se adapta al repo real, permite staging limpio y evita inventar historia falsa. | Requiere una etapa explícita de reconciliación antes de crear `supabase/migrations/`. |

Recomendación para este repositorio: **Opción C**.

Motivo: el schema real ya está organizado por capítulos, hay reparaciones históricas duplicadas y el remoto tiene drift confirmado. Un baseline prematuro copiaría deuda; migraciones incrementales sin baseline no reconstruyen staging. La transición correcta es:

1. Reconciliar el schema canónico.
2. Clasificar legacy SQL.
3. Definir un baseline reproducible para staging.
4. Crear `supabase/migrations/` en una etapa posterior.
5. Desde el baseline, todo cambio futuro entra como migration.

No crear `supabase/migrations/` en 02.6.

## Mapa de reconstrucción de base

| Capa | Elementos | Fuente actual | Dependencias | Acción futura |
| --- | --- | --- | --- | --- |
| Foundation/Auth profiles | `profiles`, `memberships`, `institutions`, `app_settings`, `admin_audit_logs`, helpers/RPC superadmin, `handle_new_user()` | `supabase/schema/01_foundation.sql` + security hardening 02.3 | Auth users; roles Supabase; RLS | Reconciliar con 02.3 antes de baseline. |
| Académico relacional | carreras, planes, materias, correlativas, padrones alumno/docente, horarios | `02_academic_relational_schema.sql` | Foundation | Schema only + seed sintético mínimo. |
| Workspace/snapshots | `workspace_snapshots`, `exam_engine_v21_states` | `03_workspace_data.sql` | Foundation/academic | Schema only; snapshot sintético si se testea motor. |
| Bloqueos docentes | `teacher_exam_date_exclusions` | `04_teacher_exam_date_exclusions.sql` | `teacher_records` | Seed sintético opcional. |
| Storage/operacional legacy | `workspace_source_files`, bucket, helper Storage, legacy tables, disponibilidad/carga docente | `05_workspace_operational_compat.sql` | Foundation, Storage | Crear bucket staging separado; fixtures sintéticos. |
| Portal alumno seguro | RPC de snapshot alumno | `05_student_portal_secure_read.sql` | Foundation, academic, workspace | Integrar al orden canónico antes de baseline. |
| Asignaciones docente-materia | `subject_teacher_assignments` y RPC admin relacionadas | `06_subject_teacher_assignments.sql` | Foundation, academic | Seed docente/curso sintético. |
| Operaciones académicas | cursadas, asistencia, notas, estado financiero, RPC docente/alumno | `07_academic_operations.sql` | Foundation, academic, assignments | Seed mínimo para RLS/RPC. |
| Mesas/confirmaciones | `exam_enrollments`, `exam_teacher_assignments`, RPC de mesas | `supabase/docs/repair_06_exam_teacher_assignments.sql` | Academic/teacher records | Reconciliar: hoy está fuera de schema canónico. |
| Hardening 02.3 | `handle_new_user()` seguro, grants/revokes | `01_foundation.sql` + `supabase/security/*` | Auth trigger | Aplicar primero en staging y probar exploit negativo. |
| Edge Function | `admin-users` | `supabase/functions/admin-users/index.ts` | Auth Admin API, service role secret de staging, CORS staging | Desplegar solo en etapa futura, con secrets staging. |
| Frontend staging | variables públicas staging | Vercel/hosting futuro, `.env.example` | Proyecto Supabase staging | No usar secrets ni bypass auth. |

## Datos staging

| Categoría | Tablas/datos | Estrategia |
| --- | --- | --- |
| SCHEMA ONLY | `admin_audit_logs`, `deleted_person_records`, `exam_engine_v21_states`, `workspace_snapshots`, tablas legacy de importación, auditorías históricas | Crear estructura sin datos reales. Insertar solo filas generadas por pruebas sintéticas. |
| CONFIGURATION SEED | `app_settings`, configuración de transición académica si se usa, institución A/B, carreras/planes/materias mínimas | Semillas no personales, versionadas, con nombres ficticios. |
| SEED SINTÉTICO | `profiles`, `memberships`, `student_records`, `teacher_records`, `careers`, `study_plans`, `subjects`, `study_plan_subjects`, `subject_prerequisites`, `course_schedules`, `subject_teacher_assignments`, `subject_enrollments`, `student_grades`, `subject_class_sessions`, `subject_attendance_records`, `teacher_*`, `exam_*` | Datos ficticios para dos instituciones, suficientes para probar RLS/RPC y flujos alumno/docente/admin. |
| DATOS REALES PROHIBIDOS | nombres reales, DNI, emails personales, alumnos, docentes, familias, calificaciones, asistencia, archivos subidos, contraseñas, tokens, audit logs reales | No copiar. Si se necesita forma/volumen, generar fixtures sintéticos con IDs y correos de dominio reservado. |
| STORAGE FIXTURES | bucket `workspace-source-files` de staging | Archivos de texto/CSV sintéticos sin PII. Nunca copiar objetos productivos. |

## Identidades ficticias

No crear usuarios en 02.6. Diseño futuro:

| Identidad | Rol esperado | Institución | Propósito |
| --- | --- | --- | --- |
| `superadmin.staging@example.test` | superadmin | Global | Administración global y validación de autoridad server-side. |
| `admin.a@example.test` | admin/owner | Institución A | Alta/gestión dentro del tenant A. |
| `admin.b@example.test` | admin/owner | Institución B | Alta/gestión dentro del tenant B. |
| `docente.a@example.test` | docente | Institución A | Roster, asistencia, notas solo de materias asignadas A. |
| `docente.b@example.test` | docente | Institución B | Cross-tenant negativo contra A. |
| `alumno.a@example.test` | alumno | Institución A | Portal alumno, notas, inscripción propia. |
| `alumno.b@example.test` | alumno | Institución B | Cross-tenant negativo contra A. |
| `bloqueado.a@example.test` | alumno/admin sintético bloqueado | Institución A | Validar `is_blocked` y rechazo de operaciones protegidas. |
| `sin-membership@example.test` | usuario autenticado sin membresía | Ninguna | Validar rechazo por falta de tenant. |

Usar contraseñas temporales generadas para staging y cambiarlas/rotarlas según flujo de prueba; nunca DNI ni credenciales productivas.

## Fixture multi-tenant

### Institución A

- Institución: `Instituto Staging A`.
- Carrera: `Profesorado Staging A`.
- Plan: `Plan A 2026`.
- Materias mínimas: `A-MAT-01`, `A-MAT-02`.
- Docente A asignado a `A-MAT-01`.
- Alumno A con legajo, plan de carrera, inscripción a cursada y al menos una nota/condición.
- Un archivo sintético en Storage bajo path de institución A.

### Institución B

- Institución: `Instituto Staging B`.
- Carrera: `Profesorado Staging B`.
- Plan: `Plan B 2026`.
- Materias mínimas: `B-MAT-01`, `B-MAT-02`.
- Docente B asignado a `B-MAT-01`.
- Alumno B con legajo, plan de carrera, inscripción a cursada y al menos una nota/condición.
- Un archivo sintético en Storage bajo path de institución B.

Pruebas obligatorias:

- Alumno A no ve datos de Alumno B.
- Docente A no ve ni modifica cursos B.
- Admin A no administra B.
- Usuario bloqueado no lee ni escribe datos protegidos.
- Superadmin solo opera con autoridad proveniente de `profiles`/server-side, no de metadata editable.

## Prueba específica de `handle_new_user()` / 02.3

| Caso | Preparación futura | Resultado esperado |
| --- | --- | --- |
| Alta legítima alumno | Crear usuario por flujo autorizado y escribir `profiles`/`memberships` desde server-side. | Perfil/membresía correctos, sin depender de metadata editable. |
| Ataque metadata | Intentar alta con `raw_user_meta_data.account_role=superadmin` o `admin_instituto`. | `profiles.account_role` queda como rol mínimo (`alumno`) o sin privilegio efectivo; `is_global_admin=false`. |
| App metadata legítima | Si se usa `raw_app_meta_data` escrito por servidor, crear usuario con metadata administrativa controlada. | Rol esperado solo si el flujo server-side lo valida y escribe `profiles`/`memberships`. |
| Trigger Auth | Confirmar que el trigger `auth.users` sigue funcionando sin `EXECUTE` directo para `anon`/`authenticated`. | Alta no rompe, pero caller directo queda bloqueado. |

## 12 RPC ausentes

| RPC | Consumidor | Clasificación | Riesgo | Acción futura |
| --- | --- | --- | --- | --- |
| `academic_admin_create_student_career_enrollment` | `StudentCareerLinkAdminPanel` vía `studentCareerEnrollmentAdminCommands.js`; gated por preview interno/local | FEATURE INCOMPLETA | UI interna falla si se habilita contra remoto; no hay implementación. | Mantener fuera de producción o versionar implementación real después de diseño. |
| `academic_admin_correct_student_career_enrollment` | `StudentCareerLinkAdminPanel`; preview interno/local | FEATURE INCOMPLETA | Corrección administrativa sin backend. | Igual: no inventar; diseñar contrato y tests. |
| `academic_admin_get_student_career_enrollment_history` | `StudentCareerLinkAdminPanel`; preview interno/local | FEATURE INCOMPLETA | Lectura administrativa sin backend. | Implementar solo si la feature pasa a runtime real. |
| `academic_admin_get_teacher_profile_link_candidates` | `TeacherProfileIdentityLinkPanel`; preview interno/local | FEATURE INCOMPLETA | Puede exponer identidad si se implementa mal. | Diseñar con RLS/RPC admin y datos sintéticos. |
| `academic_admin_invalidate_student_career_enrollment` | `StudentCareerLinkAdminPanel`; preview interno/local | FEATURE INCOMPLETA | Invalidación sensible sin backend. | Requiere diseño transaccional/auditoría. |
| `academic_admin_link_teacher_record_profile` | `TeacherProfileIdentityLinkPanel`; preview interno/local | FEATURE INCOMPLETA | Vinculación identidad-legajo sensible. | Requiere autorización admin y auditoría. |
| `academic_enroll_first_year_student` | `StudentCourseEnrollmentInternalPreview`; preview interno/local | FEATURE INCOMPLETA | Inscripción transaccional ausente. | No producción hasta schema/RPC canónica. |
| `academic_enroll_student_in_course_offering` | `StudentCourseEnrollmentInternalPreview`; preview interno/local | FEATURE INCOMPLETA | Inscripción a cursada ausente. | No producción hasta schema/RPC canónica. |
| `academic_get_student_course_enrollment_preview` | `studentCourseEnrollmentPreviewService.js`; preview interno/local | FEATURE INCOMPLETA | Preview alumno ausente. | Mantener feature flag local; diseñar antes de staging funcional. |
| `academic_get_teacher_course_roster_preview` | `teacherCourseRosterPreviewService.js`; preview interno/local | FEATURE INCOMPLETA | Preview docente ausente. | Mantener feature flag local; diseñar antes de staging funcional. |
| `get_academic_transition_config` | `academicRelationalData.js` en portal alumno | NECESARIA | Runtime puede fallar o degradar transición académica. | Versionar definición real o retirar llamada si la transición ya no existe. |
| `upsert_exam_enrollment_from_portal` | `admin-users` para inscripción/cancelación de mesa; frontend lo documenta como autoridad | NECESARIA | Fuente autoritativa de inscripción a mesas ausente. | Prioridad alta: localizar implementación real o diseñarla desde contrato/tests; no inventar sin evidencia. |

Búsqueda 02.6:

- No hay definición actual en `supabase/`, `docs/` ni `src/` para estas RPC.
- El historial local de Git solo muestra menciones/consumidores, no una implementación canónica disponible.
- Si en el futuro aparece una definición en otro repo/branch, debe importarse como evidencia revisable, no pegarse a ciegas.

## 30 EXECUTE remotos

02.5 observó 30 funciones con `EXECUTE` para `anon` y/o `authenticated`, 0 con `PUBLIC EXECUTE`.

Clasificación propuesta por grant:

| Categoría | Cantidad | Funciones relevantes | Acción futura |
| --- | ---: | --- | --- |
| EXPECTED | 2 grants `anon`; 25 grants `authenticated` aproximados | `get_public_app_status`, `list_active_login_institutions` para `anon`; RPC de usuario/admin que validan internamente para `authenticated`. | Confirmar con pruebas negativas y matriz de callers. |
| OVERPERMISSION | 28 grants `anon`; 5 grants `authenticated` directos | `handle_new_user`, `foundation_require_super_admin`, `foundation_active_institution_admin_count`, `teacher_remove_student_subject_records`, `teacher_reset_student_subject_academic_records`; además `anon` no debería ejecutar RPC admin/académicas privadas. | Preparar `REVOKE` por función en staging, nunca en remoto actual. |
| NEEDS INVESTIGATION | 0–varias según prueba funcional | RPC admin/académicas que hoy parecen esperadas para `authenticated` pero dependen de validación interna: `delete_institution_user`, `update_membership_role`, `academic_admin_confirm_exam_assignment`, `upsert_subject_enrollment_from_portal`, etc. | Demostrar rechazo con usuario sin rol, cross-tenant y bloqueado antes de producción. |

Regla: no ejecutar `REVOKE` en 02.6. La remediación se diseña y se valida en staging.

## RLS negative matrix ejecutable futura

| Actor | Debe poder | Debe fallar |
| --- | --- | --- |
| `anon` | Leer solo RPC públicas intencionales (`get_public_app_status`, `list_active_login_institutions`) si siguen siendo públicas. | Tablas tenant, Storage privado, RPC admin/alumno/docente. |
| Alumno A | Leer perfil propio, materias/notas/inscripciones propias y datos permitidos de su institución. | Alumno B, institución B, escritura directa de notas/asistencia, Storage B. |
| Docente A | Leer roster/asistencia/notas de materias asignadas A; escribir solo lo permitido por RPC. | Cursos no asignados, institución B, datos de alumno B. |
| Admin A | Gestionar usuarios/datos de A según rol. | Gestionar institución B, elevarse a superadmin, operar si está bloqueado. |
| Superadmin | Operar por autoridad server-side legítima (`profiles.is_global_admin`). | Obtener autoridad por `raw_user_meta_data`; operar si bloqueado. |
| Bloqueado | Nada protegido. | Cualquier lectura/escritura/RPC protegida. |
| Sin membership | Login básico si Auth lo permite. | Recursos tenant, RPC institucionales, Storage. |

La matriz debe ejecutarse con fixtures sintéticos A/B y reportar `PASS/FAIL` por caso, sin PII ni tokens.

## Storage

Staging debe tener bucket separado:

- Bucket: `workspace-source-files` en proyecto staging, privado.
- No copiar objetos productivos.
- Usar archivos sintéticos chicos: CSV/XLSX/texto sin nombres reales.
- Probar:
  - `anon` no lee objetos privados.
  - Usuario A lee/sube solo path de institución A si su rol lo permite.
  - Usuario A no lee path de institución B.
  - Path malformado no rompe helper `storage_object_institution_id()`.
  - Límites de tamaño/MIME deben definirse antes de uso público.

## Edge Functions

Función en alcance: `admin-users`.

Plan futuro:

| Aspecto | Staging |
| --- | --- |
| Deploy | Solo después de crear proyecto staging y secrets staging. |
| Secrets requeridos | `SERVICE_ROLE_KEY` de staging; `ADMIN_USERS_ALLOWED_ORIGINS` con dominio/preview staging. |
| Secrets prohibidos | Service-role productiva, origins productivos reutilizados sin necesidad, tokens personales en repo. |
| JWT | `verify_jwt=false` en config local exige validación interna estricta del JWT en la función. |
| CORS | Solo origins staging/local autorizados; nunca `*`. |
| Llamadas Supabase | Usar URL/key/service-role de staging. |
| Verificación | Preflight, rechazo sin JWT, rechazo cross-tenant, auditoría sintética y no filtrado de secrets en logs. |

No desplegar en 02.6.

## Frontend staging

Variables públicas por ambiente:

```text
VITE_SUPABASE_URL=https://<STAGING_REF>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<PUBLISHABLE_KEY_STAGING>
VITE_DISABLE_AUTH=false
```

Prohibido:

- `service_role` en Vite.
- Secrets productivos.
- `VITE_DISABLE_AUTH=true` en staging público.
- Reusar URL/key de producción.

Identificación visual sugerida:

- Banner persistente “STAGING”.
- Color/acento diferente al production.
- Nombre del ambiente visible en panel admin.
- Confirmación extra antes de acciones destructivas sintéticas.

No modificar frontend en 02.6; solo queda como requisito futuro.

## Backup / restore antes de producción

Antes de cualquier cambio productivo:

1. Backup Postgres completo.
2. Backup/configuración de Storage necesaria.
3. Inventario de Auth/Edge Functions/secrets sin exponer valores.
4. Ensayo de restore en ambiente aislado.
5. Tiempo de restore medido.
6. Punto de rollback definido.
7. Responsable y ventana de cambio.

Un backup que nunca fue restaurado no cuenta como backup válido.

## Orden futuro de remediación

1. Crear staging separado o branch persistente equivalente, con decisión explícita.
2. Configurar URL/keys/secrets propios de staging.
3. Reconciliar schema canónico local.
4. Preparar baseline reproducible, sin crear aún producción.
5. Construir schema en staging.
6. Crear bucket/policies staging.
7. Cargar configuration seed y seed sintético A/B.
8. Crear identidades ficticias.
9. Ejecutar baseline tests y discovery read-only de staging.
10. Reproducir vulnerabilidad 02.3 con usuario sintético.
11. Aplicar fix 02.3 en staging.
12. Repetir exploit negativo y validar alta legítima.
13. Clasificar e implementar solo RPC necesarias, con tests.
14. Mantener features incompletas deshabilitadas o proveer backend versionado.
15. Revisar `EXECUTE` y aplicar revokes en staging.
16. Ejecutar matriz negativa RLS/RPC.
17. Validar Storage.
18. Desplegar y validar `admin-users` staging.
19. Validar frontend contra staging.
20. Ejecutar `npm.cmd run check` y pruebas focales de staging.
21. Ensayar backup/restore production.
22. Preparar release SQL productivo desde artefactos probados.
23. Revisión humana independiente.
24. Aplicación controlada en producción.
25. Post-deploy verification y rollback si falla.

## Checkpoint histórico 02.8A — SUPERADO por el baseline certificado

Resultado local 2026-09-26:

- Manifest creado: `supabase/baseline/BASELINE_MANIFEST.md`.
- Readiness report creado: `docs/BASELINE_READINESS.md`.
- SQL canónico local identificado: `supabase/schema/01_foundation.sql` a `07_academic_operations.sql`, incluyendo `05_student_portal_secure_read.sql`.
- Orden futuro definido, pero no ejecutable todavía como baseline completo.
- No se creó `supabase/migrations/`.
- No se creó SQL ejecutable de baseline porque faltan implementaciones autoritativas.
- Bloqueos principales:
  - `get_academic_transition_config`: `BASELINE BLOCKER — RPC IMPLEMENTATION MISSING`.
  - `upsert_exam_enrollment_from_portal`: `BASELINE BLOCKER — RPC IMPLEMENTATION MISSING`.
  - Bloque canónico de mesas: pendiente de reconciliar desde repairs históricos.
- Estado de reproducibilidad: `LOCAL BASELINE EXECUTION PENDING`.
- Staging no fue tocado.
- Production no fue tocado.

Antes de desplegar a staging:

1. Resolver las dos RPC necesarias o retirar formalmente sus consumidores.
2. Reconciliar el bloque de mesas (`exam_teacher_assignments`, `exam_enrollments`, confirmaciones, reset).
3. Ejecutar el baseline en un Supabase local descartable, previa verificación de que no contiene trabajo del usuario.
4. Ejecutar matriz negativa RLS/RPC/Storage con institución A/B.
5. Recién después preparar deploy controlado a staging.

## Legacy SQL

| Tipo | Archivos / ejemplos | Decisión |
| --- | --- | --- |
| CANONICAL | `supabase/schema/01_foundation.sql` a `07_academic_operations.sql` | Fuente base a reconciliar. |
| CANONICAL PENDIENTE DE ORDEN | `supabase/schema/05_student_portal_secure_read.sql` | Integrar explícitamente al orden de baseline. |
| REPAIR ONLY | `supabase/docs/repair_01_*`, `repair_05_*`, `repair_06_*`, `repair_07_*` | Aplicar solo si una brecha confirmada lo exige; reconciliar duplicados. |
| DIAGNOSTIC | `supabase/docs/verify_*`, `supabase/security/2026-09-05_security_diagnostics.sql`, `remote_readonly_discovery.sql` | Mantener como lectura/verificación. |
| SECURITY REVIEW / HARDENING | `supabase/security/2026-09-05_low_risk_*`, `2026-09-05_rls_function_permissions_review.sql`, `manual_review_constraints.sql` | Convertir bloques aprobados en migrations futuras; no ejecutar como lote. |
| DEPRECATED | Referencias a `setup_multi_tenant/`, `rls_negative_tests.sql` histórico ausente | No usar como flujo operativo en este checkout. |

## Checkpoint de 02.6

Este plan queda listo cuando:

- Se cree `docs/STAGING_CREATION_CHECKLIST.md`.
- Se registre la decisión en `docs/WORKLOG.md`.
- `npm.cmd run check` pase.
- `git diff --check` pase.
- Se confirme que no hubo mutaciones remotas.

