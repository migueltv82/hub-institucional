# Seguridad

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
- Guard runtime del frontend contra `VITE_DISABLE_AUTH=true` en produccion y contra `service_role` expuesta con prefijo `VITE_`.
- Headers de seguridad para deploy Vercel en `vercel.json`.

## Configuracion segura

### Únicas variables del frontend en Vercel

En Settings → Environment Variables del proyecto frontend, configurar únicamente estas tres variables de la app para Production y para cada Preview con acceso remoto:

```text
VITE_SUPABASE_URL=https://TU_PROJECT_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=TU_PUBLISHABLE_KEY
VITE_DISABLE_AUTH=false
```

La URL y la clave publicable deben corresponder al ambiente destino. No cargar claves secretas, `service_role`, variables de scripts administrativos ni flags de preview interno en este proyecto frontend. [.env.example](../.env.example) contiene únicamente estas tres variables públicas, sin valores reales. El alias legacy `VITE_SUPABASE_ANON_KEY` aún tiene compatibilidad en el cliente, pero no forma parte de la configuración aprobada para nuevos despliegues.

Vite incorpora las variables públicas durante el build: corregirlas en Vercel requiere generar un nuevo despliegue. No basta con editar una variable y reutilizar `dist/`. Ver [variables de entorno de Vite](https://vite.dev/guide/env-and-mode).

### Bloqueo durante el arranque

[envGuards.js](../src/lib/envGuards.js) rechaza `VITE_DISABLE_AUTH=true` cuando `import.meta.env.PROD` es verdadero y cualquier variable no vacía cuyo nombre empiece por `VITE_SERVICE_ROLE` o por `VITE_<prefijo>_SERVICE_ROLE`, incluidos los alias Supabase/Admin. Los nombres privados se rechazan también en desarrollo; el error no incluye sus valores.

La validación corre en `main.jsx` antes de registrar el service worker o montar React, y en `supabaseClient.js` antes de crear el cliente, porque los imports pueden evaluarse antes del cuerpo de `main`. Los tests de [guards](../src/lib/envGuards.test.js) y de [inicialización del cliente](../src/lib/supabaseClient.test.js) cubren los rechazos y la configuración segura.

El guard bloquea el arranque, pero no retira un secreto ya incorporado a un bundle: si se publicó uno, rotarlo y retirar/reemplazar el artefacto. La detección por nombre no valida el contenido de una clave renombrada como pública ni acredita que URL/clave pertenezcan al proyecto correcto. La revisión de configuración y las auditorías de repo/build siguen siendo obligatorias. Un build de CI sin credenciales no acredita una configuración remota completa.

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

Seguir el [checklist de aplicación segura de los scripts del 2026-09-05](SECURITY_LOW_RISK_APPLY_CHECKLIST.md): diagnósticos, bloques de bajo riesgo, revisión humana de permisos y validación de datos antes de constraints. Incluye reversión, post-check y registro en WORKLOG.

Está prohibido aplicar estos cambios en producción sin respaldo recuperable y ensayo previo en staging. Esta documentación no ejecuta SQL ni acredita cambios remotos.

## Pruebas negativas

**Advertencia sobre las referencias históricas de esta sección:** `supabase/setup_multi_tenant/` y `supabase/security/rls_negative_tests.sql` no están presentes en este checkout. La secuencia siguiente no es ejecutable tal como está. Resolver la disponibilidad y compatibilidad del post-check según el [checklist operativo](SECURITY_LOW_RISK_APPLY_CHECKLIST.md#post-check-obligatorio) antes de aplicar cambios en producción. La cobertura enumerada debajo es la esperada, no una verificación actual del archivo ausente.

Ejecutar en Supabase SQL Editor:

```sql
-- 1. setup base
-- supabase/setup_multi_tenant/00_base_schema.sql
-- supabase/setup_multi_tenant/00_README.md: ejecutar migraciones 01-12

-- 2. pruebas negativas
-- supabase/security/rls_negative_tests.sql
```

El resumen esperado es:

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
6. `supabase/security/rls_negative_tests.sql` devuelve `SECURITY_TESTS_OK`.
7. Crear usuario institucional de prueba y confirmar que no ve otra institucion.
8. Bloquear ese usuario y confirmar que no puede entrar ni persistir datos.
9. Revisar `admin_audit_logs` despues de altas, bloqueos y reseteos.

## Riesgos residuales

- No hay MFA obligatorio para superadmins. Antes de vender como SaaS conviene exigir MFA o al menos una politica fuerte de cuentas administrativas.
- No hay rate limiting propio en `admin-users`. Para exposicion publica, agregar control en la capa de hosting/API o reglas de Supabase.
- Los archivos academicos se procesan en navegador. El bucket limita a 10 MB, pero no reemplaza una politica operativa de origen confiable.
- El modo local usa `localStorage` y datos demo. No debe considerarse seguro ni usarse para informacion real.
