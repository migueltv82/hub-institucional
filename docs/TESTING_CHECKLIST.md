# Testing Checklist

Guia corta para validar el proyecto despues de crear una base Supabase nueva.

## Preflight tecnico

1. Configurar `.env` con `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` y `VITE_DISABLE_AUTH=false`.
2. Crear tu usuario en `Authentication > Users`.
3. Para una base nueva, seguir el orden de `supabase/schema/00_README.md`. No usar `supabase/setup_multi_tenant/`: esa carpeta no existe en este checkout.
4. Desplegar `admin-users` siguiendo `supabase/docs/deploy_admin_users.md`.
5. Configurar `ADMIN_USERS_ALLOWED_ORIGINS` con el dominio de la app y los origenes locales permitidos.
6. En Supabase Auth, definir:
   - `Site URL`: `http://127.0.0.1:4173`
   - `Redirect URLs`: `http://127.0.0.1:4173/**` y `http://127.0.0.1:5173/**`
7. Antes de aplicar SQL mutante, seguir `docs/SECURITY_LOW_RISK_APPLY_CHECKLIST.md`. El archivo histórico `supabase/security/rls_negative_tests.sql` no existe; `supabase/security/student_portal_exam_visibility_tests.sql` es solo una prueba focal de mesas del alumno y no sustituye la matriz negativa integral de RLS/Storage.
8. Si hay deploy en Vercel, cargar solo variables `VITE_*` publicas y confirmar que no existe ninguna `VITE_SERVICE_ROLE_KEY`.
9. Levantar la app con `npm run dev`.
10. Validar `npm run check`.

## Prueba remota con Supabase

1. Entrar por `Acceso maestro / Gobierno` con el superadmin.
2. Verificar que `/super-admin` cargue metricas sin errores.
3. Crear una institucion desde `Super Admin / Instituciones`.
4. Crear un usuario institucional desde `Super Admin / Usuarios`.
5. Cerrar sesion y entrar como ese usuario en `Acceso tenant / Institucion`.
6. Cargar archivos de horarios, plan y correlatividades.
7. Generar cronograma, confirmar mesas y editar una mesa.
8. Recargar la pagina y confirmar que el workspace persiste.
9. Resetear contrasena del usuario institucional desde Super Admin.
10. Bloquear y desbloquear el usuario institucional.

## Casos funcionales minimos

1. Alta de institucion desde `Super Admin`.
2. Generacion y copia de credenciales del admin principal.
3. Cambio entre instituciones disponibles.
4. Horarios docentes con `bloqueo`.
5. Plan de estudios con multiples hojas.
6. Correlatividades validas.
7. Generacion de cronograma.
8. Confirmacion de mesas.
9. Edicion manual de una mesa.
10. Exportacion completa.
11. Exportacion de confirmadas por carrera.

## Criterio para decir listo

- no hay errores en consola al cargar datasets validos
- `npm run check` pasa
- la RPC `list_active_login_institutions` devuelve instituciones activas
- la Edge Function `admin-users` responde `200` al preflight
- la matriz negativa integral de RLS/Storage por rol, tabla, RPC y tenant queda ejecutada y documentada; el script histórico `rls_negative_tests.sql` está ausente en este checkout
- el deploy tiene headers de seguridad desde `vercel.json`
- el modo remoto persiste datos por `institution_id`
- el superadmin puede crear, bloquear, resetear y eliminar usuarios institucionales
