# Matriz de pruebas de seguridad para staging

## Matriz propuesta versus resultados acreditados

Las tablas siguientes son una **matriz propuesta**, no un listado de casos todos ejecutados. Sus precondiciones de 02.5 (hardening pendiente, RPC necesarias ausentes y Staging por inicializar) son **HISTÓRICAS / SUPERADAS** en el alcance certificado: baseline local descartable PASS, 9 SQL aplicados, 40 tablas public con RLS y Staging inicializado/verificado, según [baseline](../supabase/baseline/STAGING_BASELINE_RESULT.md).

Resultados acreditados y límites: [Security 1 SQL](../supabase/baseline/STAGING_SECURITY_1_RESULT.md), [Storage enforcement](../supabase/baseline/STAGING_STORAGE_ENFORCEMENT_EVIDENCE.json) y [Security 2, fallo histórico y estado posterior](../supabase/baseline/STAGING_SECURITY_2_RESULT.md). No sumar esos resultados como cobertura integral de esta matriz ni marcar automáticamente todos los casos PASS. Portal Docente v1 read-only certificado; no incluir confirmación/objeción/reasignación/reconciliación como aceptación v1.

Production sigue **NO-GO**. Frontend sin deploy; Vercel READY técnico. Candidato Git reproducible, proyecto/origin web Staging, CORS real, backup/restore, rollback, observabilidad, E2E/UAT y release closure pendientes; branch protection remota no verificada/configurada. Los criterios GO siguientes son necesarios dentro de seguridad, pero no suficientes para un release ni una autorización de mutación.

Fecha: 2026-09-25. Esta matriz se prepara a partir de las auditorías 02.3, 02.4 y del discovery remoto read-only 02.5. No autoriza mutaciones en producción ni reemplaza la evidencia remota de [SUPABASE_DRIFT_AUDIT.md](SUPABASE_DRIFT_AUDIT.md).

Estado 02.5: `Hub-Institucional` está accesible y activo, pero el remoto conserva la vulnerabilidad 02.3 en `handle_new_user()` y las 12 RPC investigadas están ausentes. Por lo tanto, esta matriz debe ejecutarse en staging aislado después de aplicar correcciones controladas, no directamente sobre un ambiente compartido.

## Reglas de ejecución

- Ejecutar solo en staging o en un ambiente remoto aislado equivalente.
- Usar datos sintéticos: no copiar alumnos, docentes, emails, DNI ni notas reales.
- Registrar evidencia sin tokens, connection strings, service role, correos reales ni datos personales.
- No aplicar el SQL 02.3 directamente en producción.
- No ejecutar pruebas mutantes hasta tener respaldo recuperable y un plan de rollback ensayado cuando corresponda.

## Precondiciones

| Precondición | Estado requerido |
| --- | --- |
| Ambiente identificado | Staging/dev/producción claramente etiquetado. |
| Inventario remoto | Funciones, RPC, triggers, grants, RLS, Storage y Auth no sensible capturados read-only. |
| Drift | Diferencias clasificadas; 02.5 confirmó P1 en `handle_new_user()` y P2 por 12 RPC ausentes. |
| 12 RPC faltantes | Ausencia remota confirmada; resolver con fuente canónica y despliegue controlado antes de pruebas funcionales. |
| `handle_new_user` | Debe aplicarse hardening en staging y quedar sin `raw_user_meta_data.account_role` antes de avanzar a producción. |
| Datos de prueba | Dos instituciones sintéticas, usuarios por rol y al menos un caso bloqueado. |

## Auth

| Caso | Usuario | Acción futura | Resultado esperado | Evidencia |
| --- | --- | --- | --- | --- |
| Login válido | Cuenta sintética activa | Iniciar sesión | Acceso al rol correspondiente y perfil remoto cargado. | Captura de estado sin email real. |
| Usuario bloqueado | Cuenta sintética con `profiles.is_blocked = true` | Iniciar sesión o acceder a datos tenant | Rechazo de lectura/escritura de datos protegidos. | Error o pantalla de bloqueo. |
| Metadata manipulada | Alta sintética con `raw_user_meta_data.account_role=superadmin` | Crear usuario en staging | Perfil queda sin privilegio elevado; no se asigna superadmin por metadata editable. | `profiles.account_role` seguro y `is_global_admin=false`. |

## Superadmin

| Caso | Usuario | Acción futura | Resultado esperado | Evidencia |
| --- | --- | --- | --- | --- |
| Autorizado | Superadmin sintético activo | Ejecutar RPC admin permitida | Éxito, auditoría y alcance correcto. | Registro de auditoría sintético. |
| No autorizado | Usuario autenticado sin superadmin | Ejecutar la misma RPC | Rechazo por autorización. | Error controlado. |
| Usuario bloqueado | Superadmin bloqueado | Ejecutar RPC admin | Rechazo. | Error controlado. |

## Admin institucional

| Caso | Usuario | Acción futura | Resultado esperado | Evidencia |
| --- | --- | --- | --- | --- |
| Misma institución | Admin/owner sintético | Gestionar alumno/docente del mismo tenant | Permitido si el rol lo autoriza. | Cambio sintético reversible. |
| Otra institución | Admin/owner de tenant A | Gestionar tenant B | Rechazo. | Error controlado. |
| Viewer/editor según permiso | Rol institucional limitado | Ejecutar acción admin sensible | Rechazo salvo permiso explícito documentado. | Error o no disponibilidad. |

## Alumno

| Caso | Usuario | Acción futura | Resultado esperado | Evidencia |
| --- | --- | --- | --- | --- |
| Datos propios | Alumno sintético | Leer materias, notas e inscripción propias | Permitido solo para su legajo. | Snapshot/consulta sin PII real. |
| Datos de otro alumno | Alumno A | Intentar leer alumno B del mismo tenant | Rechazo o respuesta vacía segura. | Resultado controlado. |
| Otra institución | Alumno tenant A | Intentar leer tenant B | Rechazo o respuesta vacía segura. | Resultado controlado. |
| Mesa sin regularidad | Alumno sintético no regular | Intentar inscripción a mesa | Rechazo por la RPC autoritativa. | Error esperado. |

## Docente

| Caso | Usuario | Acción futura | Resultado esperado | Evidencia |
| --- | --- | --- | --- | --- |
| Cursos asignados | Docente sintético asignado | Leer roster y cargar asistencia/nota | Permitido dentro del curso asignado. | Registro sintético. |
| Cursos no asignados | Docente sintético | Intentar curso no asignado | Rechazo. | Error controlado. |
| Otra institución | Docente tenant A | Intentar tenant B | Rechazo. | Error controlado. |
| Reset/baja académica | Docente autorizado vía Edge Function | Ejecutar flujo servidor | Permitido solo con validación extra y RPC service-role indirecta. | Auditoría sintética. |

## Anonymous

| Caso | Usuario | Acción futura | Resultado esperado | Evidencia |
| --- | --- | --- | --- | --- |
| RPC públicas | `anon` | `get_public_app_status`, `list_active_login_institutions` | Solo datos públicos esperados. | Respuesta sin PII. |
| RPC privadas | `anon` | Cualquier RPC institucional/admin/docente/alumno privada | Rechazo. | Error de autorización/permisos. |
| Tablas protegidas | `anon` | Lectura directa REST de tablas tenant | Rechazo o respuesta vacía según policy. | Resultado controlado. |

## Storage

| Caso | Usuario | Acción futura | Resultado esperado | Evidencia |
| --- | --- | --- | --- | --- |
| Bucket privado | Usuario no autorizado | Leer objeto ajeno | Rechazo. | Error controlado. |
| Path de institución propia | Admin/editor autorizado | Subir/leer archivo sintético propio | Permitido si el rol lo autoriza. | Metadata, no contenido real. |
| Path de otra institución | Usuario tenant A | Acceder path tenant B | Rechazo. | Error controlado. |
| Path malformado | Usuario autenticado | Acceder path no UUID | Rechazo sin error interno. | Error controlado. |

## Criterio GO

Se puede pasar de staging a producción solo si:

- el ambiente remoto está identificado;
- `handle_new_user` ya no conserva la vulnerabilidad 02.3 después del hardening aplicado en staging;
- las 12 RPC ausentes fueron implementadas, retiradas del producto o reemplazadas por contratos versionados y probados;
- grants/`EXECUTE` reales son conocidos;
- RLS/policies y Storage están inventariados;
- las pruebas negativas por rol/tenant pasan con datos sintéticos;
- no queda P0 desconocido;
- no se extrajeron datos personales innecesarios.

Si falta cualquiera de esos puntos: **NO-GO — REQUIERE RESOLVER DRIFT**.

