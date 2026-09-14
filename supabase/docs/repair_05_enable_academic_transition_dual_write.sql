-- Activa la configuracion de transicion academica para que admin-users intente
-- dual-write hacia tablas relacionales durante el smoke del portal alumno.
--
-- Contexto:
-- - verify_05_student_portal_enrollment_diagnostics.sql devolvio:
--   rpc_signature_present = 1
--   transition_config = {}
--   recent_subject_enrollments = 0
--   recent_dual_write_warnings = 0
-- - Eso indica que la RPC existe, pero la Edge Function no intento escritura
--   relacional reciente. Si el remoto corre una version anterior de admin-users,
--   esta fila evita que quede en snapshot_only por default.
--
-- Despues de ejecutar este archivo:
-- 1. Repetir una inscripcion desde el portal alumno.
-- 2. Ejecutar supabase/docs/verify_05_student_portal_enrollment_diagnostics.sql.
-- 3. Si aparecen warnings, revisar relational_errors.
-- 4. Si recent_subject_enrollments sube, el smoke relacional queda confirmado.

insert into public.app_settings (key, value, is_public)
values (
  'academic_relational_transition',
  jsonb_build_object(
    'stage', 'dual_write',
    'write_mode', 'dual_write',
    'read_mode', 'snapshot_only',
    'dual_write_enabled', true,
    'hybrid_read_enabled', false,
    'relational_primary_enabled', false,
    'snapshot_fallback_enabled', true,
    'snapshot_write_compat_enabled', true,
    'strict_drift_block_enabled', false,
    'updated_by', 'manual enable stage5 student portal smoke'
  ),
  false
)
on conflict (key) do update
set
  value = excluded.value,
  is_public = false,
  updated_at = timezone('utc', now());

select
  key,
  value,
  is_public,
  updated_at
from public.app_settings
where key = 'academic_relational_transition';

-- Rollback si hace falta volver a modo snapshot:
--
-- update public.app_settings
-- set
--   value = jsonb_build_object(
--     'stage', 'snapshot_only',
--     'write_mode', 'snapshot_only',
--     'read_mode', 'snapshot_only',
--     'dual_write_enabled', false,
--     'hybrid_read_enabled', false,
--     'relational_primary_enabled', false,
--     'snapshot_fallback_enabled', true,
--     'snapshot_write_compat_enabled', true,
--     'strict_drift_block_enabled', false,
--     'updated_by', 'manual rollback stage5 student portal smoke'
--   ),
--   is_public = false,
--   updated_at = timezone('utc', now())
-- where key = 'academic_relational_transition';
