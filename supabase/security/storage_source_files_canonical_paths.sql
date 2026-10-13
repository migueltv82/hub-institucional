-- Apply only to the explicitly authorized Staging project after local focal tests.
-- Restrictive policy intersects existing tenant/role policies; no grants change.
-- Storage may normalize URLs before RLS: enforce the destination shape and actor.
begin;
drop policy if exists "workspace source files canonical actor paths" on storage.objects;
create policy "workspace source files canonical actor paths"
on storage.objects as restrictive for all to authenticated
using (
  bucket_id <> 'workspace-source-files'
  or (
    name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[A-Za-z0-9][A-Za-z0-9_-]{0,127}/[A-Za-z0-9][A-Za-z0-9_-]{0,127}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and split_part(name, '/', 2) = (select auth.uid())::text
  )
)
with check (
  bucket_id <> 'workspace-source-files'
  or (
    name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[A-Za-z0-9][A-Za-z0-9_-]{0,127}/[A-Za-z0-9][A-Za-z0-9_-]{0,127}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and split_part(name, '/', 2) = (select auth.uid())::text
  )
);
commit;
