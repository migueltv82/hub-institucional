# Contrato — `get_academic_transition_config`

Fecha: 2026-09-26. Alcance: contrato recuperado en 02.8B-1 e implementación SQL local canónica en 02.8B-2. No se ejecutó SQL local/remoto, no se consultó production/staging y no se modificó Supabase.

## Decisión

`IMPLEMENTAR RPC`

La dependencia no debe retirarse en esta etapa: existe un caller runtime en el portal alumno y la configuración fuente está documentada como privada en `app_settings`. Tampoco hay reemplazo directo RLS-safe ya existente: la policy actual de `app_settings` solo permite lectura cliente para filas `is_public = true`, mientras la configuración `academic_relational_transition` aparece en la documentación y repairs como `is_public = false`.

## Evidencia, inferencia e hipótesis

| Tipo | Hallazgo |
| --- | --- |
| Evidencia | `src/modules/alumnos/services/academicRelationalData.js` llama `supabase.rpc('get_academic_transition_config')` sin argumentos. |
| Evidencia | El mismo servicio normaliza un objeto con campos `stage`, `write_mode`, `read_mode`, `dual_write_enabled`, `hybrid_read_enabled`, `relational_primary_enabled`, `snapshot_fallback_enabled`, `snapshot_write_compat_enabled` y `strict_drift_block_enabled`. |
| Evidencia | Si la RPC falla, el frontend registra warning y usa `snapshot_only` con fallback a snapshot. |
| Evidencia | `supabase/functions/admin-users/index.ts` ya lee `app_settings.key = 'academic_relational_transition'` de forma server-side y aplica el mismo modelo lógico. |
| Evidencia | `supabase/schema/01_foundation.sql` define `app_settings` con RLS: `anon`/`authenticated` solo leen `is_public = true`; superadmin gestiona todo. |
| Evidencia | `supabase/docs/repair_05_enable_academic_transition_dual_write.sql` crea/actualiza `academic_relational_transition` con `is_public = false`. |
| Evidencia | 02.8B-2 agregó la definición local canónica en `supabase/schema/01_foundation.sql`. |
| Inferencia | La RPC abstrae una lectura privada de `app_settings`, aplica defaults y expone un DTO mínimo al cliente. |
| Hipótesis no usada como contrato | El script histórico `supabase/setup_multi_tenant/02_academic_transition_controls.sql` existió o fue previsto, pero no está disponible localmente como fuente autoritativa. |

## Consumidores

| Archivo | Función/componente | Uso | Runtime/Preview/Test/Doc |
| --- | --- | --- | --- |
| `src/modules/alumnos/services/academicRelationalData.js` | `fetchAcademicTransitionConfig` | Llama RPC sin argumentos, normaliza respuesta y define fallback. | Runtime |
| `src/modules/alumnos/services/academicRelationalData.js` | `fetchAcademicRelationalSnapshotOverlay` | Obtiene la config antes de leer inscripciones, mesas y notas propias. | Runtime |
| `src/modules/alumnos/services/studentPortalData.js` | `fetchStudentPortalData` | Ejecuta `fetchAcademicRelationalSnapshotOverlay` al cargar datos del portal alumno remoto. | Runtime |
| `src/modules/alumnos/StudentPortalModule.jsx` | query `student-portal` | Dispara `fetchStudentPortalData` al montar/refrescar el portal alumno. | Runtime |
| `src/modules/alumnos/services/academicRelationalData.fetch.test.js` | mock de `supabase.rpc` | Documenta shape de respuesta para la config. | Test |
| `src/modules/alumnos/services/academicRelationalDataFetch.test.js` | `loadService` mock | Documenta shape de respuesta para la config. | Test |
| `src/services/supabaseFunctionSecurityMatrix.test.js` | matriz de RPC | Verifica definición local, seguridad, grants, DTO y defaults fail-safe. | Test |
| `docs/academic-transition-phase2.md` | fase 2 | Declara que el script de transición debía crear la config y la RPC. | Doc histórica |
| `docs/academic-transition-phase3.md` | fase 3 | Usa la RPC como verificación de etapa antes de activar dual-write. | Doc histórica |
| `docs/db-ui-contract.md` | contrato DB-UI | Lista la RPC como requerida para lectura segura de portales. | Doc vigente/histórica |
| `docs/STAGING_IMPLEMENTATION_PLAN.md` | plan staging | Clasifica la RPC como necesaria por runtime. | Doc vigente |
| `docs/SUPABASE_DRIFT_AUDIT.md` | auditoría drift | Señala caller local y ausencia remota. | Doc vigente |
| `docs/BASELINE_READINESS.md` | baseline | Marca la RPC como resuelta localmente y pendiente de validación DB. | Doc vigente |
| `supabase/baseline/BASELINE_MANIFEST.md` | manifest | Marca ubicación canónica y pendiente de validación DB. | Doc vigente |

## Flujo runtime

1. El usuario llega al portal alumno remoto.
2. `StudentPortalModule` ejecuta la query `student-portal`, habilitada con `Boolean(user?.id)` y refetch cada 10 segundos.
3. La query llama `fetchStudentPortalData({ user, isRemoteSession, isSuperAdmin, activeInstitution })`.
4. `fetchStudentPortalData` resuelve institución activa y ejecuta en paralelo:
   - snapshot seguro o workspace snapshot;
   - registros de alumno cuando aplica;
   - `fetchAcademicRelationalSnapshotOverlay`.
5. `fetchAcademicRelationalSnapshotOverlay` llama primero `fetchAcademicTransitionConfig({ useRemote })`.
6. `fetchAcademicTransitionConfig`:
   - si no hay remoto/Supabase configurado, devuelve `DEFAULT_TRANSITION_CONFIG`;
   - si hay remoto, llama `supabase.rpc('get_academic_transition_config')` sin parámetros;
   - si hay error, registra warning y devuelve `DEFAULT_TRANSITION_CONFIG`;
   - si recibe array, usa `data[0]`; si recibe objeto, usa ese objeto;
   - normaliza el shape SQL snake_case al shape JS camelCase.
7. Después de obtener la config, el portal alumno lee siempre sus inscripciones, mesas y notas propias desde tablas/RPC relacionales cuando está en remoto.
8. `overlaySnapshotWithRelationalAcademicData` usa `snapshotFallbackEnabled` para decidir fallback de snapshot en colecciones vacías, y publica metadatos en `academicRelationalSource`.

Usuarios que pueden llegar al flujo:

- Alumno autenticado remoto: flujo principal.
- Superadmin autenticado usando el portal alumno: puede llegar al mismo servicio, aunque `useSecureStudentRead` cambia el origen del snapshot.
- Sesión local/demo: no llama la RPC y usa defaults.

La feature no queda totalmente bloqueada si la RPC falta: el código actual cae a `snapshot_only` y continúa leyendo tablas relacionales propias. Sí queda degradada la configuración runtime fina (`snapshotFallbackEnabled`, stage/read mode y flags).

## Inputs

La RPC no recibe argumentos según el único caller runtime:

```text
get_academic_transition_config()
```

No debe aceptar `institution_id`, `workspace_key`, carrera ni usuario como parámetro en el contrato actual. No hay evidencia de consumo por institución/carrera.

## Output

Debe devolver una fila u objeto con este shape mínimo en snake_case:

| Campo SQL | Tipo esperado | Default frontend | Semántica |
| --- | --- | --- | --- |
| `stage` | text | `snapshot_only` | Estado descriptivo de transición. |
| `write_mode` | text | `snapshot_only` | Modo de escritura esperado por backend/docs. |
| `read_mode` | text | `snapshot_only` | Modo de lectura esperado por frontend/docs. |
| `dual_write_enabled` | boolean | `false` | Permite/indica escritura dual en backend. |
| `hybrid_read_enabled` | boolean | `false` | Indica lectura híbrida. |
| `relational_primary_enabled` | boolean | `false` | Indica relacional como fuente primaria. |
| `snapshot_fallback_enabled` | boolean | `true` | Permite fallback visual al snapshot. |
| `snapshot_write_compat_enabled` | boolean | `true` | Mantiene compatibilidad de escritura snapshot. |
| `strict_drift_block_enabled` | boolean | `false` | Indica bloqueo estricto ante drift. |

El frontend convierte esos campos a:

```js
{
  stage,
  writeMode,
  readMode,
  dualWriteEnabled,
  hybridReadEnabled,
  relationalPrimaryEnabled,
  snapshotFallbackEnabled,
  snapshotWriteCompatEnabled,
  strictDriftBlockEnabled,
}
```

No hay evidencia de campos adicionales obligatorios.

## Implementación local 02.8B-2

Ubicación canónica:

```text
supabase/schema/01_foundation.sql
```

Firma:

```sql
public.get_academic_transition_config()
```

Return type:

```sql
returns table (
  stage text,
  write_mode text,
  read_mode text,
  dual_write_enabled boolean,
  hybrid_read_enabled boolean,
  relational_primary_enabled boolean,
  snapshot_fallback_enabled boolean,
  snapshot_write_compat_enabled boolean,
  strict_drift_block_enabled boolean
)
```

Decisión de return type: `RETURNS TABLE` porque `supabase.rpc()` lo consume como fila/array, expone únicamente los campos contractuales y no acopla el frontend a la fila interna de `app_settings`.

## Errors/fallback

Contrato de tolerancia observado:

- RPC ausente, error PostgREST, error SQL o cualquier `error`: el frontend no lanza excepción.
- Se registra `console.warn('No se pudo leer la configuracion de transicion academica. Se usara snapshot_only.', error)`.
- Se devuelve `DEFAULT_TRANSITION_CONFIG`.
- Si la respuesta es `null`, no-objeto o vacía, la normalización devuelve defaults.
- Valores booleanos faltantes se interpretan como `false`, salvo `snapshot_fallback_enabled` y `snapshot_write_compat_enabled`, que solo son `false` si vienen explícitamente en `false`.

Contrato SQL fail-safe:

- Config ausente: devuelve `snapshot_only`, flags peligrosos en `false`, fallback/compat en `true`.
- Config no objeto o JSON inválido para el shape esperado: trata la config como `{}`.
- `stage`, `write_mode` y `read_mode` desconocidos: caen a `snapshot_only`.
- Flags relacionales (`dual_write_enabled`, `hybrid_read_enabled`, `relational_primary_enabled`, `strict_drift_block_enabled`): solo son `true` si el JSONB contiene booleano `true`; strings o tipos incorrectos no habilitan capacidades.
- `snapshot_fallback_enabled` y `snapshot_write_compat_enabled`: default `true`; solo se apagan con booleano JSONB `false`.

## Fuente de datos

Candidato sustentado: `public.app_settings`, fila `key = 'academic_relational_transition'`.

Evidencia:

- `docs/academic-transition-phase2.md` declara que la fase de transición crea `app_settings.key = 'academic_relational_transition'`.
- `supabase/functions/admin-users/index.ts` lee `app_settings.value` con esa key y normaliza los mismos flags.
- `supabase/docs/repair_05_enable_academic_transition_dual_write.sql` inserta/actualiza esa key con el shape esperado y `is_public = false`.
- `supabase/docs/verify_05_student_portal_enrollment_diagnostics.sql` consulta esa misma key para diagnosticar transición.

No hay evidencia de fuente por ciclo lectivo, carrera, cohorte, enrollment ni institution. Es una configuración global del despliegue.

## Seguridad esperada

- Caller: cliente Supabase desde portal alumno remoto.
- Rol DB recomendado para `EXECUTE`: `authenticated`.
- Rol `anon`: no conceder, salvo que se tome una decisión explícita de hacer pública la transición. No hay necesidad actual.
- `SECURITY DEFINER`: usado y justificado porque la fuente `app_settings` es privada (`is_public = false`) y el cliente autenticado no puede leerla directo por RLS.
- `search_path`: `set search_path = ''`; todos los objetos referenciados están calificados (`public.app_settings`, `auth.uid()`).
- `SECURITY INVOKER`: no alcanza si se conserva `academic_relational_transition` privada, porque heredaría la policy de `app_settings` y devolvería defaults/empty para alumnos.
- Defensa interna: si `(select auth.uid()) is null`, la función rechaza con `AUTH_REQUIRED` / SQLSTATE `42501`.
- `public`: `EXECUTE` revocado.
- `anon`: `EXECUTE` revocado.
- `authenticated`: `EXECUTE` concedido explícitamente.
- `service_role`: no se agregó grant explícito.
- Validación interna: no necesita membership por tenant si el setting sigue siendo global y no devuelve datos de institución/persona.
- Tenant boundary: `GLOBAL`. No recibe tenant del cliente; por lo tanto el caller no puede elegir arbitrariamente otra institución.
- Exposición: devolver solo los nueve campos mínimos; no devolver `updated_by`, `updated_at`, `key`, `is_public`, metadata operativa ni payload completo de `app_settings`.

## Alternativas evaluadas

### Diseño A — RPC SQL dedicada

Mejor respaldado por la evidencia actual. Conserva la fila privada, devuelve shape mínimo, centraliza defaults y no requiere cambiar el frontend. Requiere implementar SQL en un subpaso posterior y testear grants/RLS.

### Diseño B — lectura directa RLS-safe desde `app_settings`

No es un reemplazo existente hoy. Para funcionar desde el cliente habría que hacer pública la fila (`is_public = true`) o cambiar policies/shape de tabla. Eso amplía exposición y rompe la decisión documentada de mantener esa config privada.

### Diseño C — otro mecanismo existente

La Edge Function `admin-users` ya lee la misma setting server-side, pero no reemplaza al caller del portal alumno. Usarla como proxy implicaría cambiar runtime o crear endpoint nuevo; no es un mecanismo existente para el consumo actual.

## Historia Git

Búsquedas locales realizadas:

- `rg -n "get_academic_transition_config" .`
- `git log --all --oneline -S"get_academic_transition_config" -- .`
- `git log --all --oneline -G"get_academic_transition_config" -- .`
- `git grep -n "get_academic_transition_config" main agents/actu-a-como-lead-product-designer-senior-ux agents/actu-a-como-lead-product-designer-senior-ux-c3f3f0da origin/main --`
- `git grep -n -i "create.*get_academic_transition_config|function public.get_academic_transition_config|get_academic_transition_config()" d04109b 431f2c3 -- "*.sql" "*.md"`
- `git grep -n "academic_relational_transition" d04109b 431f2c3 9ff66de -- "*.sql" "*.ts" "*.js" "*.md"`

Resultado 02.8B-1: se encontraron docs, caller frontend y lectura server-side de `app_settings`; no se encontró implementación SQL autoritativa previa de `public.get_academic_transition_config`.

## Tests de contrato 02.8B-2

Se agregaron tests estáticos en `src/services/supabaseFunctionSecurityMatrix.test.js` para cubrir:

1. La RPC no acepta argumentos.
2. Devuelve solo los nueve campos mínimos.
3. Defaults seguros cuando falta la fila o faltan claves.
4. `EXECUTE` para `authenticated`, revocado a `public` y `anon`.
5. `SECURITY DEFINER` con `search_path = ''`.
6. No expone el payload completo de `app_settings`.
7. No usa `raw_user_meta_data`, `user_metadata` ni `account_role`.
8. Solo accede a `academic_relational_transition`.
9. No agrega grant explícito a `service_role`.

No se agregó test dinámico PostgreSQL porque esta etapa prohíbe ejecutar SQL. Queda pendiente validarlo en Supabase local/staging descartable.

## Baseline

El blocker deja de ser “contrato/implementación faltante” y pasa a:

```text
RESUELTO LOCALMENTE — PENDIENTE VALIDACIÓN DB
REMOTE MUTATIONS: NONE
```
