# Seguridad

## Estado de seguridad vigente acreditado

Baseline local descartable PASS: 9 SQL canónicos aplicados, 40 tablas public con RLS y Staging aplicado/verificado; [evidencia de baseline](../supabase/baseline/STAGING_BASELINE_RESULT.md). Las referencias posteriores a baseline parcial, RPC ausente y hardening pendiente son **HISTÓRICAS / SUPERADAS** dentro de ese alcance; el discovery antiguo no acredita el estado actual de Production.

Inscripción: RPC existente/validada con JWT del usuario mediante `context.userClient`, igualdad `auth.uid() = actor_user_id = target_student_id` y validación de profile/membership/legajo tenant-workspace; sin bypass operativo `adminClient`/`service_role`. [Contrato vigente](contracts/upsert_exam_enrollment_from_portal.md). Admin-users identity v3 y matriz funcional validados en Staging; no equivalen al cierre de toda Security 2.

Storage enforcement certificado: límite 25 MiB (26214400 bytes), gateway y bloqueo de writes arbitrarios; [evidencia](../supabase/baseline/STAGING_STORAGE_ENFORCEMENT_EVIDENCE.json). Mesas Docente v1 read-only certificado; confirmación/objeción/reasignación/reconciliación docente DIFERIDAS post-v1.

Production sigue **NO-GO**. Branch protection remota, backup/restore, rollback, observabilidad, E2E/UAT y release closure pendientes. `EX-001` vence 2026-10-17; no cubre fechas posteriores sin nueva validación. No se autoriza deploy ni cambios de permisos por actualizar esta documentación.

Guia de seguridad para operar la app en contexto academico y prepararla para SaaS.

## Modelo de confianza

- El frontend no es una frontera de seguridad. Solo muestra u oculta pantallas.
- La autorizacion real vive en Supabase con RLS, RPCs y Storage policies.
- El modo demo local existe solo para desarrollo. En produccion `VITE_DISABLE_AUTH` debe ser `false`.
- La `service_role key` nunca va en `.env` del frontend. Solo se carga como secret de la Edge Function `admin-users`.
- Un usuario remoto bloqueado (`profiles.is_blocked = true`) no debe poder leer ni escribir datos tenant.

## Controles actuales

- Autenticacion remota con Supabase Auth.
- La sesion del navegador se guarda en `localStorage` para compartir el acceso entre pestanas y ventanas del mismo navegador. Cerrar sesion elimina esa sesion compartida; en equipos compartidos el usuario debe cerrar sesion al finalizar.
- Separacion multi-tenant por `institution_id`.
- RLS habilitado en:
  - `institutions`
  - `profiles`
  - `memberships`
  - `workspace_snapshots`
  - `workspace_source_files`
  - `admin_audit_logs`
- Bucket privado `workspace-source-files` para archivos fuente.
- Storage policies por path: el primer segmento del objeto debe ser el UUID de la institucion.
- Helper `storage_object_institution_id()` para evitar errores por paths malformados.
- Edge Function `admin-users` con `service_role`, pero solo despues de validar JWT y `profiles.is_global_admin`.
- Auditoria de operaciones administrativas en `admin_audit_logs`.
- CORS restringido en `admin-users` por `ADMIN_USERS_ALLOWED_ORIGINS`.
- Guard runtime del frontend contra `VITE_DISABLE_AUTH=true` en produccion, Supabase publico incompleto/incompatible y `service_role`/secret expuestos con prefijo `VITE_`.
- Headers de seguridad para deploy Vercel en `vercel.json`.

## Identidad, metadata y roles

El flujo de identidad autorizado es:

```text
Auth user -> profiles -> memberships -> institution -> rol efectivo
```

`profiles.is_global_admin` habilita el panel global. Para administracion institucional, las operaciones servidor validan membresia `owner` o `admin` en `memberships`. El campo `profiles.account_role` describe el tipo de cuenta (`superadmin`, `admin_instituto`, `docente`, `alumno`), pero no debe derivarse de metadata editable por el usuario.

La auditoria 02.3 confirmo una vulnerabilidad en el SQL versionado anterior: `public.handle_new_user()` copiaba `raw_user_meta_data.account_role` a `profiles.account_role`. Esa metadata puede ser controlada por cliente si existiera un alta publica o un flujo mal configurado. El hardening preparado en `supabase/schema/01_foundation.sql` evita ese patron: el trigger ya no lee `raw_user_meta_data.account_role`, usa `raw_app_meta_data.account_role` cuando exista y cae a `alumno` como rol minimo.

`raw_user_meta_data` queda permitido solo para datos no autoritativos de presentacion, como nombre o `full_name`. `raw_app_meta_data` puede contener metadata administrativa escrita del lado servidor, como `account_role` o `is_global_admin`, pero el flujo normal de alta no debe depender solo del trigger: `admin-users` crea o reutiliza el usuario con Auth Admin API y luego escribe explicitamente `profiles` y `memberships`. El cliente tampoco usa `session.user_metadata.account_role` como fallback de rol; si el perfil remoto aun no esta disponible, el rol transitorio queda en `alumno`.

El cambio SQL de 02.3 esta **PREPARADO — NO APLICADO** desde este repositorio. Antes de llevarlo a un ambiente remoto, probar en staging:

- alta con metadata manipulada y confirmacion de que el perfil queda sin privilegios;
- alta legitima de `admin_instituto`, `alumno`, `docente` y `superadmin`;
- membresias correctas por institucion;
- login y rechazo de accesos cruzados entre instituciones;
- verificacion de que `revoke execute on function public.handle_new_user()` sigue vigente y no rompe el trigger de Auth.

## Configuracion segura

### Únicas variables del frontend en Vercel

En Settings → Environment Variables del proyecto frontend, configurar únicamente estas tres variables de la app para Production y para cada Preview con acceso remoto:

```text
VITE_SUPABASE_URL=https://TU_PROJECT_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=TU_PUBLISHABLE_KEY
VITE_DISABLE_AUTH=false
```

La URL y la clave publicable deben corresponder al ambiente destino. En produccion la URL debe ser HTTPS y terminar en `.supabase.co`; una URL local como `http://127.0.0.1:54321` solo es valida fuera de produccion. No cargar claves secretas, `service_role`, `sb_secret`, variables de scripts administrativos ni flags de preview interno en este proyecto frontend. [.env.example](../.env.example) contiene únicamente estas tres variables públicas, sin valores reales. El alias legacy `VITE_SUPABASE_ANON_KEY` aún tiene compatibilidad fuera de produccion en el cliente, pero no forma parte de la configuración aprobada para nuevos despliegues.

Vite incorpora las variables públicas durante el build: corregirlas en Vercel requiere generar un nuevo despliegue. No basta con editar una variable y reutilizar `dist/`. Ver [variables de entorno de Vite](https://vite.dev/guide/env-and-mode).

### Bloqueo durante el arranque

[envGuards.js](../src/lib/envGuards.js) rechaza `VITE_DISABLE_AUTH=true` cuando `import.meta.env.PROD` es verdadero. También rechaza produccion sin `VITE_SUPABASE_URL`, sin `VITE_SUPABASE_PUBLISHABLE_KEY` o con `VITE_SUPABASE_URL` que no sea una URL HTTPS de Supabase.

El mismo guard rechaza cualquier variable no vacía cuyo nombre empiece por `VITE_SERVICE_ROLE` o por `VITE_<prefijo>_SERVICE_ROLE`, incluidos los alias Supabase/Admin. Además inspecciona valores públicos `VITE_*` y bloquea valores que parezcan `service_role`, `sb_secret_*` o un JWT con payload `role=service_role`, aunque el nombre de la variable parezca seguro. Los nombres y valores privados se rechazan también en desarrollo; el error solo enumera nombres de variables y no incluye sus valores.

La validación corre en `main.jsx` antes de registrar el service worker o montar React, y en `supabaseClient.js` antes de crear el cliente, porque los imports pueden evaluarse antes del cuerpo de `main`. Los tests de [guards](../src/lib/envGuards.test.js) y de [inicialización del cliente](../src/lib/supabaseClient.test.js) cubren los rechazos y la configuración segura.

El guard bloquea el arranque, pero no retira un secreto ya incorporado a un bundle: si se publicó uno, rotarlo y retirar/reemplazar el artefacto. La detección no acredita que URL/clave pertenezcan al mismo proyecto ni sustituye la revisión manual de Vercel/Supabase. La revisión de configuración y las auditorías de repo/build siguen siendo obligatorias. Un build de CI sin credenciales no acredita una configuración remota completa.

### Secrets exclusivos de la Edge Function

Configurar en Supabase Functions, no en las variables del frontend de Vercel:

```text
SERVICE_ROLE_KEY=TU_SERVICE_ROLE_KEY
ADMIN_USERS_ALLOWED_ORIGINS=https://tu-dominio.com,http://127.0.0.1:4173
```

Reglas:

- No commitear `.env`.
- No usar `SERVICE_ROLE_KEY` en React.
- No dejar `ADMIN_USERS_ALLOWED_ORIGINS=*` en produccion.
- No activar `VITE_DISABLE_AUTH=true` en un deploy publico.
- No crear variables `VITE_SERVICE_ROLE_KEY`, `VITE_SUPABASE_SERVICE_ROLE_KEY` ni `VITE_ADMIN_SERVICE_ROLE_KEY`.

## Headers de deploy

`vercel.json` configura:

- `Content-Security-Policy`
- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy` sin camara, microfono, geolocalizacion ni pagos

Revisión local: los cinco headers anteriores están presentes para `/(.*)`. La CSP restringe scripts a `'self'`, bloquea objetos y embebido mediante `object-src 'none'` y `frame-ancestors 'none'`, y limita conexiones a origen propio y Supabase. Mantiene estilos inline, imágenes HTTPS y workers blob para las capacidades actuales. No falta ningún header de esta lista, por lo que no se cambia `vercel.json` en esta revisión.

Verificar las respuestas HTTP reales del dominio tras desplegar: la configuración local no prueba los headers servidos. Referencia: [headers en vercel.json](https://vercel.com/docs/project-configuration/vercel-json).

## Aplicación de los scripts de seguridad

Seguir el [checklist seguro para aplicar SQL de Supabase](SECURITY_LOW_RISK_APPLY_CHECKLIST.md). La auditoría 02.1 clasifica los 34 scripts SQL locales de `supabase/security/`, `supabase/schema/` y `supabase/docs/` por tipo, riesgo, idempotencia, staging, rollback y estado. La palabra “low risk” solo identifica un archivo histórico; no convierte un bloque en seguro para producción.

La auditoría 02.4 agrega una matriz transversal de funciones, RPC, `SECURITY DEFINER`, `search_path`, grants/revokes y callers en [SECURITY_FUNCTION_MATRIX.md](SECURITY_FUNCTION_MATRIX.md). Esa matriz es evidencia local estática, no una certificación de la base remota. Antes de aplicar o redeployar cualquier RPC, comparar `pg_get_functiondef`, privilegios reales y callers contra esa matriz.

La etapa 02.5 comparó esa matriz contra Supabase remoto en modo discovery/read-only, con transacciones `READ ONLY` y `ROLLBACK`. El estado formal está en [SUPABASE_DRIFT_AUDIT.md](SUPABASE_DRIFT_AUDIT.md) y la matriz futura de pruebas está en [STAGING_SECURITY_TEST_MATRIX.md](STAGING_SECURITY_TEST_MATRIX.md). El resultado es **NO-GO**: `handle_new_user()` remoto conserva la vulnerabilidad 02.3, las 12 RPC sin SQL local están ausentes también en remoto, RLS/Storage quedaron inventariados pero no validados con pruebas negativas, y `anon`/`authenticated` tienen `EXECUTE` sobre 30 funciones que requieren revisión por función.

La etapa 02.8A fija el baseline canónico local sin tomar production como fuente de verdad. Usar:

```text
supabase/baseline/BASELINE_MANIFEST.md
docs/BASELINE_READINESS.md
```

Estado de seguridad del baseline:

- `handle_new_user()` canónico queda endurecido en `supabase/schema/01_foundation.sql`.
- `raw_user_meta_data.account_role` está prohibido como autoridad.
- No hay SQL ejecutable de baseline todavía porque faltan implementaciones autoritativas de `get_academic_transition_config` y `upsert_exam_enrollment_from_portal`.
- Toda función `SECURITY DEFINER` versionada debe declarar `search_path` explícito.
- Las trigger functions internas no deben ser invocables por `public`, `anon` ni `authenticated`.
- El modelo `EXECUTE` mínimo se deriva desde consumidores reales; no se copian grants productivos.

Filosofía operativa:

- leer y diagnosticar antes de mutar;
- preferir la fuente canónica de `supabase/schema/` frente a reparaciones históricas sueltas;
- tratar los `repair_*` como parches condicionados por una falla verificada;
- revisar manualmente cada `GRANT`, `REVOKE`, policy, `SECURITY DEFINER`, constraint y deduplicación;
- probar en staging con roles reales antes de producción;
- documentar salida, post-check y rollback sin subir PII ni secretos al repo.

Está prohibido aplicar cambios mutantes en producción sin respaldo recuperable y ensayo previo en staging. Esta documentación no ejecuta SQL ni acredita cambios remotos.

## Pruebas negativas

**Advertencia sobre las referencias históricas de esta sección:** `supabase/setup_multi_tenant/` y `supabase/security/rls_negative_tests.sql` no están presentes en este checkout. La secuencia siguiente no es ejecutable tal como está. Resolver la disponibilidad y compatibilidad del post-check según el [checklist operativo](SECURITY_LOW_RISK_APPLY_CHECKLIST.md#post-check) antes de aplicar cambios en producción. La cobertura enumerada debajo es la esperada, no una verificación actual del archivo ausente.

El archivo real disponible para pruebas negativas es [`student_portal_exam_visibility_tests.sql`](../supabase/security/student_portal_exam_visibility_tests.sql). Cubre visibilidad de mesas para alumnos con actores preparados y usa una transacción `read only` con `rollback`, pero no reemplaza una matriz integral de RLS/Storage por rol, tabla, RPC y tenant.

Referencia histórica no ejecutable en este checkout:

```sql
-- Estas rutas no existen en este repo y no deben usarse como flujo operativo:
-- supabase/setup_multi_tenant/00_base_schema.sql
-- supabase/setup_multi_tenant/00_README.md
-- supabase/security/rls_negative_tests.sql
```

La meta de cobertura para una matriz negativa integral sigue siendo:

```text
SECURITY_TESTS_OK
failed_count = 0
```

Estas pruebas verifican:

- un tenant no lee datos de otro tenant
- un `viewer` no escribe snapshots
- un usuario bloqueado no lee datos
- un no-superadmin no lee auditoria
- un no-superadmin no ejecuta mutaciones administrativas
- helpers privados de Auth no son ejecutables desde `authenticated`
- el bucket de Storage es privado
- las policies de Storage existen
- paths de Storage malformados no rompen por cast a UUID

## Checklist antes de publicar

1. `npm run check` pasa.
2. `VITE_DISABLE_AUTH=false` en el deploy.
3. `SERVICE_ROLE_KEY` solo existe como secret de Supabase Function.
4. `ADMIN_USERS_ALLOWED_ORIGINS` contiene solo dominios propios.
5. Auth Redirect URLs contienen solo dominios esperados.
6. La matriz negativa integral de RLS/Storage devuelve `SECURITY_TESTS_OK` o evidencia equivalente revisada. El archivo histórico `supabase/security/rls_negative_tests.sql` no existe en este checkout.
7. Crear usuario institucional de prueba y confirmar que no ve otra institucion.
8. Bloquear ese usuario y confirmar que no puede entrar ni persistir datos.
9. Revisar `admin_audit_logs` despues de altas, bloqueos y reseteos.

## Riesgos residuales

- No hay MFA obligatorio para superadmins. Antes de vender como SaaS conviene exigir MFA o al menos una politica fuerte de cuentas administrativas.
- No hay rate limiting propio en `admin-users`. Para exposicion publica, agregar control en la capa de hosting/API o reglas de Supabase.
- Los archivos academicos se procesan en navegador. HISTÓRICO / SUPERADO: límite anterior de 10 MB. El enforcement vigente limita a 25 MiB; esto no reemplaza una politica operativa de origen confiable.
- El modo local usa `localStorage` y datos demo. No debe considerarse seguro ni usarse para informacion real.
