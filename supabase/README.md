# Supabase

Esta carpeta contiene solo la configuracion activa de Supabase para el producto actual.

## Estructura

```text
config.toml                  configuracion local de Supabase CLI
config/                     compatibilidad con configuracion local de funciones
docs/                       documentación operativa, verificaciones y reparaciones revisables
functions/admin-users/      Edge Function para operaciones seguras de Auth
security/                   pruebas negativas de RLS y Storage
schema/                     SQL fuente de verdad para el esquema actual
baseline/                   manifest del baseline canónico local
```

## Setup de base

Para una base nueva, seguir el flujo numerado indicado en:

```text
schema/00_README.md
```

La etapa 02.8A agrega el manifest de baseline canónico:

```text
baseline/BASELINE_MANIFEST.md
../docs/BASELINE_READINESS.md
```

Estado HISTÓRICO / SUPERADO (02.8A): baseline parcial con bloqueos. En esa etapa no existía todavía SQL ejecutable de baseline ni `supabase/migrations/`; el deploy a Staging quedaba pendiente de resolver `get_academic_transition_config`, `upsert_exam_enrollment_from_portal` y el bloque canónico de mesas.

Estado vigente acreditado: 9 SQL canónicos aplicados, baseline local descartable PASS y 40 tablas public con RLS. El baseline de Staging está aplicado y verificado; ver [BASELINE_MANIFEST.md](baseline/BASELINE_MANIFEST.md), [LOCAL_AB_RLS_RPC_RESULT.md](baseline/LOCAL_AB_RLS_RPC_RESULT.md) y [STAGING_BASELINE_RESULT.md](baseline/STAGING_BASELINE_RESULT.md). Esta descripción no autoriza reaplicar SQL ni modificar Production.

Antes de correr el bloque de seed de `01_foundation.sql`, crear el usuario real en Supabase Auth según indica `schema/00_README.md`.

No usar rutas históricas de `setup_multi_tenant/`: esa carpeta no existe en este checkout.

## Seguridad

Antes de aplicar SQL mutante, seguir:

```text
docs/SECURITY_LOW_RISK_APPLY_CHECKLIST.md
```

Para auditar funciones, RPC, `SECURITY DEFINER`, `search_path` y privilegios `EXECUTE`, usar tambien:

```text
../docs/SECURITY_FUNCTION_MATRIX.md
../docs/SUPABASE_DRIFT_AUDIT.md
security/remote_readonly_discovery.sql
```

Estado HISTÓRICO 02.5 al 2026-09-25: el discovery remoto read-only se completó sin mutaciones contra `Hub-Institucional`. El resultado de aquella ejecución fue **NO-GO**: `handle_new_user()` remoto conservaba la vulnerabilidad 02.3, 12 RPC llamadas por el producto estaban ausentes en remoto y las pruebas negativas RLS/Storage por rol/tenant quedaban pendientes. No describe el Staging posteriormente certificado ni acredita el estado actual de Production. No ejecutar `db push`, migrations, `supabase link` ni reparaciones automáticas desde esa evidencia histórica.

El archivo histórico `security/rls_negative_tests.sql` no existe en este checkout. El test real disponible es `security/student_portal_exam_visibility_tests.sql`, pero cubre solo visibilidad de mesas del alumno y requiere actores preparados; no reemplaza una matriz negativa integral de RLS/Storage por rol, tabla, RPC y tenant.

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
- No usar `raw_user_meta_data.account_role` como fuente de autorizacion. El hardening 02.3 de `schema/01_foundation.sql` deja `handle_new_user()` leyendo roles solo desde metadata administrativa y usando `alumno` como fallback minimo. La indicación de aplicar y validar primero en Staging es HISTÓRICA / SUPERADA para ese entorno: forma parte del baseline certificado referenciado arriba, sin acreditar ni autorizar cambios de Production.
