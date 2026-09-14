-- ============================================================
-- HUB-INSTITUCIONAL - RESET DEL PROCESO DE MESAS
--
-- Ejecutar en Supabase SQL Editor cuando el frontend informe:
-- "Could not find the function public.academic_admin_reset_exam_process".
--
-- La RPC limpia el cronograma oficial del workspace y deja sin efecto
-- los datos operativos de mesas para poder volver a iniciar el flujo.
-- Es idempotente y tolera bases donde exam_enrollments o
-- exam_teacher_assignments todavia no existan.
-- ============================================================

create or replace function public.academic_admin_reset_exam_process(
  target_institution_id uuid,
  target_workspace_key text default 'main'
)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  normalized_workspace_key text := coalesce(nullif(btrim(target_workspace_key), ''), 'main');
  workspace_cronograma_cleared integer := 0;
  teacher_assignments_reset integer := 0;
  exam_enrollments_reset integer := 0;
  legacy_exam_sessions_deleted integer := 0;
begin
  if target_institution_id is null then
    raise exception 'target_institution_id is required';
  end if;

  if not (
    public.is_super_admin()
    or public.is_member_of_institution(target_institution_id, array['owner', 'admin', 'editor'])
  ) then
    raise exception 'No autorizado para reiniciar el proceso de mesas de esta institucion';
  end if;

  update public.workspace_snapshots
  set
    payload = jsonb_set(
      jsonb_set(
        jsonb_set(
          jsonb_set(
            jsonb_set(
              jsonb_set(
                jsonb_set(
                  coalesce(payload, '{}'::jsonb),
                  '{cronograma}',
                  '[]'::jsonb,
                  true
                ),
                '{examEnrollments}',
                '[]'::jsonb,
                true
              ),
              '{adminReviewDecisions}',
              '[]'::jsonb,
              true
            ),
            '{adminReviewDrafts}',
            '[]'::jsonb,
            true
          ),
          '{adminReviewPromotions}',
          '[]'::jsonb,
          true
        ),
        '{adminReviewApprovalRequests}',
        '[]'::jsonb,
        true
      ),
      '{adminReviewSecondApprovals}',
      '[]'::jsonb,
      true
    ) || jsonb_build_object(
      'examEngineV21State', null,
      'requiereRegeneracion', false
    ),
    updated_at = timezone('utc', now())
  where institution_id = target_institution_id
    and workspace_key = normalized_workspace_key;

  get diagnostics workspace_cronograma_cleared = row_count;

  if to_regclass('public.exam_teacher_assignments') is not null then
    update public.exam_teacher_assignments
    set
      status = 'inactive',
      confirmation_status = case
        when confirmation_status is null or btrim(confirmation_status) = '' then 'reset'
        else confirmation_status
      end,
      deleted_at = coalesce(deleted_at, timezone('utc', now())),
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'reset_by_rpc', 'academic_admin_reset_exam_process',
        'reset_at', timezone('utc', now())
      )
    where institution_id = target_institution_id
      and workspace_key = normalized_workspace_key
      and coalesce(status, 'active') = 'active';

    get diagnostics teacher_assignments_reset = row_count;
  end if;

  if to_regclass('public.exam_enrollments') is not null then
    delete from public.exam_enrollments
    where institution_id = target_institution_id
      and workspace_key = normalized_workspace_key;

    get diagnostics exam_enrollments_reset = row_count;
  end if;

  delete from public.legacy_exam_sessions
  where institution_id = target_institution_id
    and workspace_key = normalized_workspace_key;

  get diagnostics legacy_exam_sessions_deleted = row_count;

  return jsonb_build_object(
    'workspace_cronograma_cleared', workspace_cronograma_cleared,
    'teacher_assignments_reset', teacher_assignments_reset,
    'exam_enrollments_reset', exam_enrollments_reset,
    'legacy_exam_sessions_deleted', legacy_exam_sessions_deleted
  );
end;
$$;

revoke execute on function public.academic_admin_reset_exam_process(uuid, text) from public, anon;
grant execute on function public.academic_admin_reset_exam_process(uuid, text) to authenticated;
