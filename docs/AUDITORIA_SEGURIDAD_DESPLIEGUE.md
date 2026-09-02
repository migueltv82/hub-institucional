# Auditoria de seguridad y despliegue

Fecha de revision: 14/05/2026

## Diagnostico

El modelo actual esta bien orientado a multi-tenant: las tablas operativas que guardan datos del workspace usan `institution_id` y las politicas RLS validan pertenencia mediante `memberships`.

Riesgos detectados y corregidos:

- El frontend no centralizaba la institucion activa en el contexto de autenticacion. Varias vistas recalculaban la institucion consultando Supabase/localStorage.
- No existia un interruptor remoto de mantenimiento para bloquear la app si habia un incidente critico.
- La configuracion global no tenia una tabla formal con RLS.

Riesgo residual:

- `workspace_snapshots.payload` guarda varios datasets dentro de un JSON. RLS protege por institucion, pero no por entidad interna. Si a futuro alumnos/docentes pasan a tablas normalizadas, cada tabla nueva debe incluir `institution_id` obligatorio.
- `admin_audit_logs`, `profiles`, `memberships`, `institutions` y `app_settings` son tablas globales o de control. No todas deben tener `institution_id`, pero si deben seguir con RLS estricto.

## RLS aplicado

Archivo fuente:

```text
supabase/setup_multi_tenant/00_base_schema.sql
supabase/setup_multi_tenant/00_README.md
```

Tablas protegidas:

- `institutions`
- `profiles`
- `memberships`
- `workspace_snapshots`
- `workspace_source_files`
- `admin_audit_logs`
- `app_settings`
- `storage.objects` para bucket `workspace-source-files`

Funciones de seguridad:

- `public.is_super_admin()`
- `public.is_member_of_institution(target_institution_id, allowed_roles)`
- `public.storage_object_institution_id(object_name)`
- `public.get_public_app_status()`

Regla principal:

```sql
public.is_member_of_institution(institution_id)
```

Para escritura se limita a:

```sql
array['owner', 'admin', 'editor']
```

## Modo mantenimiento

Se agrego la tabla:

```sql
public.app_settings
```

Y el RPC publico:

```sql
public.get_public_app_status()
```

Activar mantenimiento:

```sql
update public.app_settings
set
  value = jsonb_build_object(
    'enabled', true,
    'message', 'Estamos realizando mantenimiento. Volvemos en unos minutos.'
  ),
  is_public = true,
  updated_at = timezone('utc', now())
where key = 'maintenance_mode';
```

Desactivar mantenimiento:

```sql
update public.app_settings
set
  value = jsonb_build_object(
    'enabled', false,
    'message', 'La plataforma esta en mantenimiento. Intenta nuevamente en unos minutos.'
  ),
  is_public = true,
  updated_at = timezone('utc', now())
where key = 'maintenance_mode';
```

Si la fila no existe:

```sql
insert into public.app_settings (key, value, is_public)
values (
  'maintenance_mode',
  jsonb_build_object(
    'enabled', false,
    'message', 'La plataforma esta en mantenimiento. Intenta nuevamente en unos minutos.'
  ),
  true
);
```

## Frontend

Cambios aplicados:

- `AuthContext` ahora centraliza:
  - `institutions`
  - `activeInstitution`
  - `activeInstitutionId`
  - `setActiveInstitutionId`
- `DashboardPage`, portal alumno, portal docente y generador usan ese contexto para evitar recalcular la institucion activa.
- `App.jsx` consulta `get_public_app_status` antes de renderizar rutas.
- Si `maintenance_enabled = true`, la app muestra una pantalla de mantenimiento y bloquea el acceso operativo.

## UX de datos

La app ya tiene empty states en las vistas principales:

- Listado de instituciones.
- Listado de usuarios.
- Alumnos.
- Docentes.
- Dashboard alumno.
- Dashboard docente.
- Cronograma.

Recomendacion para futuras tablas:

- Cada tabla debe distinguir tres estados: cargando, vacia y error.
- El empty state debe indicar que accion sigue: cargar planilla, crear registro, cambiar filtro o seleccionar institucion.
- Evitar mostrar tablas completamente vacias sin mensaje administrativo.

## Checklist antes de deploy

1. Ejecutar `supabase/setup_multi_tenant/00_base_schema.sql`.
2. Ejecutar las migraciones 01-12 listadas en `supabase/setup_multi_tenant/00_README.md`.
3. Ejecutar `supabase/security/rls_negative_tests.sql`.
4. Confirmar `SECURITY_TESTS_OK`.
5. Desplegar Edge Function `admin-users`.
6. Verificar que no exista `VITE_SERVICE_ROLE_KEY` en frontend.
7. Probar login con usuario de una institucion y confirmar que no ve datos de otra.
8. Activar y desactivar modo mantenimiento desde SQL Editor.
9. Ejecutar `npm run lint`.
10. Ejecutar `npm run build`.
