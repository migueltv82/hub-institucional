# Supabase

Esta carpeta contiene solo la configuracion activa de Supabase para el producto actual.

## Estructura

```text
config.toml                  configuracion local de Supabase CLI
config/                     compatibilidad con configuracion local de funciones
docs/                       documentacion operativa
functions/admin-users/      Edge Function para operaciones seguras de Auth
security/                   pruebas negativas de RLS y Storage
setup_multi_tenant/         SQL fuente de verdad para base multi-tenant
```

## Setup de base

Ejecutar en Supabase SQL Editor el flujo numerado indicado en:

```text
setup_multi_tenant/00_README.md
```

Para una base nueva, ejecutar primero `00_base_schema.sql` y despues las
migraciones academicas 01-12 en orden. Antes, crear el usuario real en Supabase Auth.

## Seguridad

Despues del setup base, ejecutar:

```text
security/rls_negative_tests.sql
```

El resultado esperado es `SECURITY_TESTS_OK` con `failed_count = 0`.

## Edge Function

La app usa `functions/admin-users/index.ts` para crear usuarios, asignarlos a instituciones y resetear contrasenas sin exponer `service_role` en el navegador.

Despliegue:

```text
docs/deploy_admin_users.md
```

Regla de seguridad: `SERVICE_ROLE_KEY` va como secret de Supabase Functions, nunca en `.env` del frontend. Configurar tambien `ADMIN_USERS_ALLOWED_ORIGINS` con los dominios autorizados exactos, sin wildcard `*`.

## Auth en produccion

- Desactivar el registro publico de usuarios (`enable_signup = false` en Auth y Email).
- Mantener `enable_anonymous_sign_ins = false`.
- Mantener `secure_password_change = true`; la app reautentica antes de cambiar la contrasena propia.
- Configurar `site_url` y los redirect URLs con el dominio real de produccion.
- Las cuentas operativas se crean desde `admin-users`; el DNI puede seguir siendo contrasena inicial mientras se acompane con reseteo/cambio posterior.
