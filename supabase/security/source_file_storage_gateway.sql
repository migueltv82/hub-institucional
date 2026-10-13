-- LOCAL PREPARATION ONLY. Do not execute without a separate staging enforcement task.
begin;
-- All logical workspace mutations participate, including service-role writers.
-- A clear's T0 is the acquisition of this workspace barrier, not client time.
create table public.source_file_workspace_revisions (
  institution_id uuid not null references public.institutions(id),
  workspace_key text not null,
  revision bigint not null default 0,
  primary key(institution_id,workspace_key)
);
alter table public.source_file_workspace_revisions enable row level security;
revoke all on public.source_file_workspace_revisions from public,anon,authenticated;
grant all on public.source_file_workspace_revisions to service_role;
create function public.source_file_workspace_barrier(p_institution_id uuid,p_workspace_key text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended(p_institution_id::text||'/'||p_workspace_key,0)) then
    raise exception 'SOURCE_FILE_WORKSPACE_BUSY' using errcode='55P03';
  end if;
  insert into public.source_file_workspace_revisions(institution_id,workspace_key) values(p_institution_id,p_workspace_key) on conflict do nothing;
end $$;
create function public.source_file_workspace_mutation() returns trigger
language plpgsql security definer set search_path = '' as $$
declare tenant uuid; workspace text;
begin
  if tg_op='DELETE' then tenant:=old.institution_id; workspace:=old.workspace_key;
  else tenant:=new.institution_id; workspace:=new.workspace_key; end if;
  if tg_op='UPDATE' and (new.institution_id is distinct from old.institution_id or new.workspace_key is distinct from old.workspace_key) then raise exception 'SOURCE_FILE_WORKSPACE_MOVE_DENIED'; end if;
  perform public.source_file_workspace_barrier(tenant,workspace);
  update public.source_file_workspace_revisions set revision=revision+1 where institution_id=tenant and workspace_key=workspace;
  if tg_op='DELETE' then return old; end if;
  return new;
end $$;
revoke all on function public.source_file_workspace_barrier(uuid,text),public.source_file_workspace_mutation() from public,anon,authenticated;
grant execute on function public.source_file_workspace_barrier(uuid,text) to service_role;
-- Fixed application tables only. Missing optional tables are not silently created.
do $$ declare t text; begin
  foreach t in array array['workspace_snapshots','workspace_source_files','subject_attendance_records','student_grades','subject_class_sessions','subject_enrollments','exam_engine_v21_states','exam_enrollments','exam_teacher_assignments','subject_teacher_assignments','legacy_subject_prerequisites','legacy_exam_sessions','legacy_subjects_catalog','teacher_availability_records','teacher_workload_records','student_records','teacher_records'] loop
    if pg_catalog.to_regclass('public.'||t) is not null then
      execute format('create trigger source_file_workspace_mutation before insert or update or delete on public.%I for each row execute function public.source_file_workspace_mutation()',t);
    end if;
  end loop;
end $$;
create table public.source_file_workspace_clears (
  id uuid not null,
  institution_id uuid not null references public.institutions(id),
  workspace_key text not null,
  actor_id uuid not null references auth.users(id),
  cutoff_revision bigint not null,
  captured_keys jsonb not null,
  cleared_at timestamptz not null default clock_timestamp(),
  cleanup_finished_at timestamptz,
  primary key(institution_id,workspace_key,id)
);
create index source_file_workspace_pending_clears on public.source_file_workspace_clears(institution_id,workspace_key,actor_id,cleared_at) where cleanup_finished_at is null;
alter table public.source_file_workspace_clears enable row level security;
revoke all on public.source_file_workspace_clears from public,anon,authenticated;
grant all on public.source_file_workspace_clears to service_role;
update storage.buckets set file_size_limit=least(coalesce(file_size_limit,26214400),26214400) where id='workspace-source-files';
create table if not exists public.source_file_storage_resources (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id),
  workspace_key text not null check (workspace_key ~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$'),
  dataset_key text not null check (dataset_key in ('masterWorkbook','docentesWorkbook','alumnosWorkbook','horarios','planes','correlatividades','alumnos','docentes','docenteMateria')),
  clearing_actor uuid references auth.users(id),
  clearing_id uuid,
  unique(institution_id, workspace_key, dataset_key)
);
alter table public.source_file_storage_resources enable row level security;
revoke all on public.source_file_storage_resources from anon, authenticated;
grant select on public.source_file_storage_resources to authenticated;
grant all on public.source_file_storage_resources to service_role;
create policy "source file resource catalog read" on public.source_file_storage_resources for select to authenticated
using (public.is_member_of_institution(institution_id));

create or replace function public.register_source_file_storage_resources() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.workspace_key !~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$' then return new; end if;
  insert into public.source_file_storage_resources(institution_id,workspace_key,dataset_key)
  select new.institution_id,new.workspace_key,dataset from unnest(array['masterWorkbook','docentesWorkbook','alumnosWorkbook','horarios','planes','correlatividades','alumnos','docentes','docenteMateria']) dataset
  on conflict(institution_id,workspace_key,dataset_key) do nothing;
  return new;
end $$;
revoke all on function public.register_source_file_storage_resources() from public, anon, authenticated;
create trigger source_file_storage_register_workspace after insert on public.workspace_snapshots
for each row execute function public.register_source_file_storage_resources();
insert into public.source_file_storage_resources(institution_id,workspace_key,dataset_key)
select s.institution_id,s.workspace_key,dataset from public.workspace_snapshots s
cross join unnest(array['masterWorkbook','docentesWorkbook','alumnosWorkbook','horarios','planes','correlatividades','alumnos','docentes','docenteMateria']) dataset
where s.workspace_key ~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$'
on conflict(institution_id,workspace_key,dataset_key) do nothing;

create table public.source_file_storage_operations (
  id uuid primary key,
  resource_id uuid not null references public.source_file_storage_resources(id),
  actor_id uuid not null references auth.users(id),
  kind text not null check (kind in ('upload','delete')),
  state text not null check (state in ('pending','committed','cancelled','deleting','deleted')),
  storage_path text not null,
  previous_path text,
  file_name text, mime_type text, file_size bigint,
  expires_at timestamptz not null default now() + interval '2 hours',
  cleanup_done boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index source_file_storage_one_active_operation on public.source_file_storage_operations(resource_id) where state in ('pending','deleting');
create index source_file_storage_cleanup_queue on public.source_file_storage_operations(resource_id,actor_id,expires_at) where cleanup_done=false;
alter table public.source_file_storage_operations enable row level security;
revoke all on public.source_file_storage_operations from public, anon, authenticated;
grant all on public.source_file_storage_operations to service_role;

create or replace function public.source_file_storage_lock(p_resource_id uuid,p_actor_id uuid)
returns public.source_file_storage_resources language plpgsql security definer set search_path = '' as $$
declare r public.source_file_storage_resources;
begin
  select * into strict r from public.source_file_storage_resources where id=p_resource_id;
  perform public.source_file_workspace_barrier(r.institution_id,r.workspace_key);
  select * into strict r from public.source_file_storage_resources where id=p_resource_id for update;
  if not exists(select 1 from public.memberships m join public.profiles p on p.user_id=m.user_id join public.institutions i on i.id=m.institution_id
    where m.institution_id=r.institution_id and m.user_id=p_actor_id and m.role in ('owner','admin','editor') and p.is_blocked=false and i.status='active')
    or not exists(select 1 from public.workspace_snapshots s where s.institution_id=r.institution_id and s.workspace_key=r.workspace_key)
  then raise exception 'SOURCE_FILE_ACCESS_DENIED'; end if;
  return r;
end $$;

create or replace function public.source_file_storage_reserve(p_resource_id uuid,p_actor_id uuid,p_operation_id uuid,p_key text,p_filename text,p_mime_type text,p_file_size bigint)
returns void language plpgsql security definer set search_path = '' as $$
declare r public.source_file_storage_resources; old_path text; prefix text; manifest public.workspace_source_files;
begin
  r:=public.source_file_storage_lock(p_resource_id,p_actor_id);
  if r.clearing_actor is not null then raise exception 'SOURCE_FILE_WORKSPACE_CLEARING'; end if;
  prefix:=r.institution_id::text||'/'||p_actor_id::text||'/'||r.workspace_key||'/'||r.dataset_key||'/';
  if p_key <> prefix||p_operation_id::text then raise exception 'SOURCE_FILE_INVALID_KEY'; end if;
  select * into manifest from public.workspace_source_files where institution_id=r.institution_id and workspace_key=r.workspace_key and dataset_key=r.dataset_key;
  if found then
    old_path:=manifest.storage_path;
    if manifest.storage_bucket is distinct from 'workspace-source-files' or old_path is null or manifest.file_base64 is not null or left(old_path,length(prefix))<>prefix or substring(old_path from length(prefix)+1) !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'SOURCE_FILE_LEGACY_OR_FOREIGN_WRITE_DENIED'; end if;
  end if;
  insert into public.source_file_storage_operations(id,resource_id,actor_id,kind,state,storage_path,previous_path,file_name,mime_type,file_size)
  values(p_operation_id,p_resource_id,p_actor_id,'upload','pending',p_key,old_path,p_filename,p_mime_type,p_file_size);
end $$;

create or replace function public.source_file_storage_commit(p_resource_id uuid,p_actor_id uuid,p_operation_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare r public.source_file_storage_resources; o public.source_file_storage_operations; current_path text;
begin
  r:=public.source_file_storage_lock(p_resource_id,p_actor_id);
  if r.clearing_actor is not null then raise exception 'SOURCE_FILE_WORKSPACE_CLEARING'; end if;
  select * into strict o from public.source_file_storage_operations where id=p_operation_id and resource_id=p_resource_id and actor_id=p_actor_id and kind='upload' for update;
  if o.state='committed' then return; end if;
  if o.state<>'pending' or o.expires_at<=now() then raise exception 'SOURCE_FILE_INVALID_OPERATION'; end if;
  select storage_path into current_path from public.workspace_source_files where institution_id=r.institution_id and workspace_key=r.workspace_key and dataset_key=r.dataset_key;
  if current_path is distinct from o.previous_path then raise exception 'SOURCE_FILE_CONFLICT'; end if;
  insert into public.workspace_source_files(institution_id,workspace_key,dataset_key,file_name,mime_type,file_extension,file_size,storage_bucket,storage_path,file_base64,updated_at)
  values(r.institution_id,r.workspace_key,r.dataset_key,o.file_name,o.mime_type,case when strpos(o.file_name,'.')>0 then lower(regexp_replace(o.file_name,'^.*\.','')) else '' end,o.file_size,'workspace-source-files',o.storage_path,null,now())
  on conflict(institution_id,workspace_key,dataset_key) do update set file_name=excluded.file_name,mime_type=excluded.mime_type,file_extension=excluded.file_extension,file_size=excluded.file_size,storage_bucket=excluded.storage_bucket,storage_path=excluded.storage_path,file_base64=null,updated_at=now();
  update public.source_file_storage_operations set state='committed',cleanup_done=(previous_path is null) where id=o.id;
end $$;

create or replace function public.source_file_storage_cancel(p_resource_id uuid,p_actor_id uuid,p_operation_id uuid,p_clear_id uuid default null)
returns void language plpgsql security definer set search_path = '' as $$
declare o public.source_file_storage_operations; r public.source_file_storage_resources;
begin
  r:=public.source_file_storage_lock(p_resource_id,p_actor_id);
  if r.clearing_id is distinct from p_clear_id then raise exception 'SOURCE_FILE_CLEAR_LEASE_CONFLICT'; end if;
  select * into strict o from public.source_file_storage_operations where id=p_operation_id and resource_id=p_resource_id and actor_id=p_actor_id and kind='upload' for update;
  if o.state not in ('pending','cancelled') then raise exception 'SOURCE_FILE_ALREADY_COMMITTED'; end if;
  update public.source_file_storage_operations set state='cancelled' where id=o.id;
end $$;

create or replace function public.source_file_storage_begin_delete(p_resource_id uuid,p_actor_id uuid,p_clear_id uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r public.source_file_storage_resources; o public.source_file_storage_operations; key text; prefix text; manifest public.workspace_source_files;
begin
  r:=public.source_file_storage_lock(p_resource_id,p_actor_id);
  if r.clearing_id is distinct from p_clear_id then raise exception 'SOURCE_FILE_CLEAR_LEASE_CONFLICT'; end if;
  select * into o from public.source_file_storage_operations where resource_id=p_resource_id and state in ('pending','deleting');
  if found then
    if o.kind='delete' and o.actor_id=p_actor_id then return to_jsonb(o); end if;
    raise exception 'SOURCE_FILE_OPERATION_BUSY';
  end if;
  select * into manifest from public.workspace_source_files where institution_id=r.institution_id and workspace_key=r.workspace_key and dataset_key=r.dataset_key;
  if not found then return null; end if;
  key:=manifest.storage_path;
  prefix:=r.institution_id::text||'/'||p_actor_id::text||'/'||r.workspace_key||'/'||r.dataset_key||'/';
  if manifest.storage_bucket is distinct from 'workspace-source-files' or key is null or manifest.file_base64 is not null or left(key,length(prefix))<>prefix or substring(key from length(prefix)+1) !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'SOURCE_FILE_LEGACY_OR_FOREIGN_WRITE_DENIED'; end if;
  insert into public.source_file_storage_operations(id,resource_id,actor_id,kind,state,storage_path) values(gen_random_uuid(),p_resource_id,p_actor_id,'delete','deleting',key) returning * into o;
  return to_jsonb(o);
end $$;

create or replace function public.source_file_storage_finish_delete(p_resource_id uuid,p_actor_id uuid,p_operation_id uuid,p_clear_id uuid default null)
returns void language plpgsql security definer set search_path = '' as $$
declare r public.source_file_storage_resources; o public.source_file_storage_operations;
begin
  r:=public.source_file_storage_lock(p_resource_id,p_actor_id);
  if r.clearing_id is distinct from p_clear_id then raise exception 'SOURCE_FILE_CLEAR_LEASE_CONFLICT'; end if;
  select * into strict o from public.source_file_storage_operations where id=p_operation_id and resource_id=p_resource_id and actor_id=p_actor_id and kind='delete' for update;
  if o.state='deleted' then return; end if;
  if o.state<>'deleting' then raise exception 'SOURCE_FILE_INVALID_OPERATION'; end if;
  delete from public.workspace_source_files where institution_id=r.institution_id and workspace_key=r.workspace_key and dataset_key=r.dataset_key and storage_path=o.storage_path;
  if not found then raise exception 'SOURCE_FILE_CONFLICT'; end if;
  update public.source_file_storage_operations set state='deleted' where id=o.id;
end $$;

-- Atomic logical clear at the workspace barrier. Later cleanup replays captured keys only.
create or replace function public.source_file_storage_begin_clear(p_institution_id uuid,p_workspace_key text,p_actor_id uuid,p_clear_id uuid,p_resume boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare manifest public.workspace_source_files; prefix text; keys jsonb; cutoff bigint; job public.source_file_workspace_clears; t text; dependency record; has_dependency boolean;
begin
  if not exists(select 1 from public.memberships m join public.profiles p on p.user_id=m.user_id join public.institutions i on i.id=m.institution_id where m.institution_id=p_institution_id and m.user_id=p_actor_id and m.role in ('owner','admin','editor') and p.is_blocked=false and i.status='active') then raise exception 'SOURCE_FILE_ACCESS_DENIED'; end if;
  select * into job from public.source_file_workspace_clears where institution_id=p_institution_id and workspace_key=p_workspace_key and id=p_clear_id;
  if found then
    if job.actor_id<>p_actor_id then raise exception 'SOURCE_FILE_ACCESS_DENIED'; end if;
    return to_jsonb(job);
  end if;
  if p_resume then raise exception 'SOURCE_FILE_CLEAR_NOT_FOUND'; end if;
  perform public.source_file_workspace_barrier(p_institution_id,p_workspace_key);
  select * into job from public.source_file_workspace_clears where institution_id=p_institution_id and workspace_key=p_workspace_key and id=p_clear_id;
  if found then
    if job.institution_id<>p_institution_id or job.workspace_key<>p_workspace_key or job.actor_id<>p_actor_id then raise exception 'SOURCE_FILE_ACCESS_DENIED'; end if;
    return to_jsonb(job);
  end if;
  if not exists(select 1 from public.workspace_snapshots where institution_id=p_institution_id and workspace_key=p_workspace_key) then raise exception 'SOURCE_FILE_WORKSPACE_NOT_REGISTERED'; end if;
  perform 1 from public.source_file_storage_resources where institution_id=p_institution_id and workspace_key=p_workspace_key order by id for update;
  if not found then raise exception 'SOURCE_FILE_WORKSPACE_NOT_REGISTERED'; end if;
  if exists(select 1 from public.source_file_storage_operations o join public.source_file_storage_resources r on r.id=o.resource_id where r.institution_id=p_institution_id and r.workspace_key=p_workspace_key and o.state in ('pending','deleting') and o.actor_id<>p_actor_id) then raise exception 'SOURCE_FILE_OPERATION_BUSY'; end if;
  for manifest in select * from public.workspace_source_files where institution_id=p_institution_id and workspace_key=p_workspace_key loop
    prefix:=p_institution_id::text||'/'||p_actor_id::text||'/'||p_workspace_key||'/'||manifest.dataset_key||'/';
    if manifest.storage_bucket is distinct from 'workspace-source-files' or manifest.storage_path is null or manifest.file_base64 is not null or left(manifest.storage_path,length(prefix))<>prefix or substring(manifest.storage_path from length(prefix)+1) !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' or not exists(select 1 from public.source_file_storage_resources r where r.institution_id=manifest.institution_id and r.workspace_key=manifest.workspace_key and r.dataset_key=manifest.dataset_key) then raise exception 'SOURCE_FILE_LEGACY_OR_FOREIGN_WRITE_DENIED'; end if;
  end loop;
  -- Never let a cascading FK invalidate an unscoped/cross-workspace child.
  -- Lock target parent rows before checking incoming dependencies so concurrent
  -- child inserts cannot bypass preflight through an FK KEY SHARE race.
  foreach t in array array['subject_attendance_records','student_grades','subject_class_sessions','subject_enrollments','exam_engine_v21_states','exam_enrollments','exam_teacher_assignments','subject_teacher_assignments','legacy_subject_prerequisites','legacy_exam_sessions','legacy_subjects_catalog','teacher_availability_records','teacher_workload_records','student_records','teacher_records'] loop
    if pg_catalog.to_regclass('public.'||t) is not null then
      execute format('select 1 from public.%I where institution_id=$1 and workspace_key=$2 for update',t) using p_institution_id,p_workspace_key;
      for dependency in
        select c.conrelid::regclass as child,
          string_agg(format('child.%I=parent.%I',ca.attname,pa.attname),' and ' order by k.position) as predicate,
          exists(select 1 from pg_catalog.pg_attribute a where a.attrelid=c.conrelid and a.attname='workspace_key' and not a.attisdropped) as scoped
        from pg_catalog.pg_constraint c
        cross join lateral unnest(c.conkey,c.confkey) with ordinality k(child_key,parent_key,position)
        join pg_catalog.pg_attribute ca on ca.attrelid=c.conrelid and ca.attnum=k.child_key
        join pg_catalog.pg_attribute pa on pa.attrelid=c.confrelid and pa.attnum=k.parent_key
        where c.contype='f' and c.confrelid=pg_catalog.to_regclass('public.'||t)
        group by c.oid,c.conrelid
      loop
        execute format('select exists(select 1 from %s child join public.%I parent on %s where parent.institution_id=$1 and parent.workspace_key=$2 %s)',dependency.child,t,dependency.predicate,
          case when dependency.scoped then 'and (child.institution_id is distinct from $1 or child.workspace_key is distinct from $2)' else '' end)
          into has_dependency using p_institution_id,p_workspace_key;
        if has_dependency then raise exception 'SOURCE_FILE_WORKSPACE_DEPENDENT_DATA'; end if;
      end loop;
    end if;
  end loop;
  select revision into cutoff from public.source_file_workspace_revisions where institution_id=p_institution_id and workspace_key=p_workspace_key;
  select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) into keys from (
    select distinct dataset_key,storage_path from (
      select f.dataset_key,f.storage_path from public.workspace_source_files f where f.institution_id=p_institution_id and f.workspace_key=p_workspace_key
      union all
      select r.dataset_key,o.storage_path from public.source_file_storage_operations o join public.source_file_storage_resources r on r.id=o.resource_id where r.institution_id=p_institution_id and r.workspace_key=p_workspace_key and (o.state in ('pending','deleting') or exists(select 1 from public.workspace_source_files f where f.storage_path=o.storage_path and f.institution_id=p_institution_id and f.workspace_key=p_workspace_key))
      union all
      select r.dataset_key,o.previous_path from public.source_file_storage_operations o join public.source_file_storage_resources r on r.id=o.resource_id where r.institution_id=p_institution_id and r.workspace_key=p_workspace_key and o.state in ('pending','deleting') and o.previous_path is not null
    ) captured
  ) x;
  update public.source_file_storage_operations o set state=case when o.kind='upload' then 'cancelled' else 'deleted' end,cleanup_done=false
    from public.source_file_storage_resources r where o.resource_id=r.id and r.institution_id=p_institution_id and r.workspace_key=p_workspace_key and (o.state in ('pending','deleting') or exists(select 1 from public.workspace_source_files f where f.storage_path=o.storage_path and f.institution_id=p_institution_id and f.workspace_key=p_workspace_key));
  delete from public.workspace_source_files where institution_id=p_institution_id and workspace_key=p_workspace_key;
  foreach t in array array['subject_attendance_records','student_grades','subject_class_sessions','subject_enrollments','exam_engine_v21_states','exam_enrollments','exam_teacher_assignments','subject_teacher_assignments','legacy_subject_prerequisites','legacy_exam_sessions','legacy_subjects_catalog','teacher_availability_records','teacher_workload_records','student_records','teacher_records'] loop
    if pg_catalog.to_regclass('public.'||t) is not null then
      execute format('delete from public.%I where institution_id=$1 and workspace_key=$2',t) using p_institution_id,p_workspace_key;
    end if;
  end loop;
  update public.workspace_snapshots set payload='{}'::jsonb,updated_at=clock_timestamp() where institution_id=p_institution_id and workspace_key=p_workspace_key;
  insert into public.source_file_workspace_clears(id,institution_id,workspace_key,actor_id,cutoff_revision,captured_keys)
    values(p_clear_id,p_institution_id,p_workspace_key,p_actor_id,cutoff,keys) returning * into job;
  return to_jsonb(job);
end $$;
create or replace function public.source_file_storage_finish_clear(p_institution_id uuid,p_workspace_key text,p_actor_id uuid,p_clear_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not exists(select 1 from public.memberships m join public.profiles p on p.user_id=m.user_id join public.institutions i on i.id=m.institution_id where m.institution_id=p_institution_id and m.user_id=p_actor_id and m.role in ('owner','admin','editor') and p.is_blocked=false and i.status='active') then raise exception 'SOURCE_FILE_ACCESS_DENIED'; end if;
  update public.source_file_workspace_clears set cleanup_finished_at=coalesce(cleanup_finished_at,clock_timestamp()) where id=p_clear_id and institution_id=p_institution_id and workspace_key=p_workspace_key and actor_id=p_actor_id;
  if not found then raise exception 'SOURCE_FILE_CLEAR_NOT_FOUND'; end if;
end $$;

-- Only service_role (inside Edge) can call mutating RPCs, including the lock helper.
create or replace function public.source_file_storage_cleanup_candidates(p_resource_id uuid,p_actor_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare result jsonb;
begin
  perform public.source_file_storage_lock(p_resource_id,p_actor_id);
  select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) into result from (
    select o.id,case when o.state='committed' then o.previous_path else o.storage_path end as storage_path
    from public.source_file_storage_operations o
    where o.resource_id=p_resource_id and o.actor_id=p_actor_id and o.cleanup_done=false and o.state in ('cancelled','committed','deleted') and o.expires_at<now()-interval '15 minutes'
    and (case when o.state='committed' then o.previous_path else o.storage_path end) is not null
    and not exists(select 1 from public.workspace_source_files f where f.storage_bucket='workspace-source-files' and f.storage_path=case when o.state='committed' then o.previous_path else o.storage_path end)
    order by o.expires_at,o.id limit 100
  ) x;
  return result;
end $$;
create or replace function public.source_file_storage_cleanup_done(p_resource_id uuid,p_actor_id uuid,p_operation_ids uuid[])
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.source_file_storage_lock(p_resource_id,p_actor_id);
  update public.source_file_storage_operations set cleanup_done=true where resource_id=p_resource_id and actor_id=p_actor_id and id=any(p_operation_ids) and state in ('cancelled','committed','deleted') and expires_at<now()-interval '15 minutes';
end $$;
do $$ declare signature text; begin
  foreach signature in array array['source_file_storage_lock(uuid,uuid)','source_file_storage_reserve(uuid,uuid,uuid,text,text,text,bigint)','source_file_storage_commit(uuid,uuid,uuid)','source_file_storage_cancel(uuid,uuid,uuid,uuid)','source_file_storage_begin_delete(uuid,uuid,uuid)','source_file_storage_finish_delete(uuid,uuid,uuid,uuid)','source_file_storage_begin_clear(uuid,text,uuid,uuid,boolean)','source_file_storage_finish_clear(uuid,text,uuid,uuid)','source_file_storage_cleanup_candidates(uuid,uuid)','source_file_storage_cleanup_done(uuid,uuid,uuid[])'] loop
    execute 'revoke all on function public.'||signature||' from public,anon,authenticated';
    execute 'grant execute on function public.'||signature||' to service_role';
  end loop;
end $$;

-- Exact object names are built in Edge. Deny direct browser mutations regardless of URL normalization.
create policy "source files gateway only insert" on storage.objects as restrictive for insert to authenticated with check(bucket_id<>'workspace-source-files');
create policy "source files gateway only update" on storage.objects as restrictive for update to authenticated using(bucket_id<>'workspace-source-files') with check(bucket_id<>'workspace-source-files');
create policy "source files gateway only delete" on storage.objects as restrictive for delete to authenticated using(bucket_id<>'workspace-source-files');
create policy "source files metadata gateway only insert" on public.workspace_source_files as restrictive for insert to authenticated with check(false);
create policy "source files metadata gateway only update" on public.workspace_source_files as restrictive for update to authenticated using(false) with check(false);
create policy "source files metadata gateway only delete" on public.workspace_source_files as restrictive for delete to authenticated using(false);

-- Legacy SELECT remains tenant constrained, additionally bound to an existing manifest.
drop policy if exists "workspace source files canonical actor paths" on storage.objects;
create policy "source files manifest reads" on storage.objects as restrictive for select to authenticated using(
  bucket_id<>'workspace-source-files' or exists(select 1 from public.workspace_source_files f where f.storage_bucket=bucket_id and f.storage_path=name and (
    name=f.institution_id::text||'/'||(select auth.uid())::text||'/'||f.workspace_key||'/'||f.dataset_key||'/'||split_part(name,'/',5)
    and split_part(name,'/',5) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or name=f.institution_id::text||'/'||f.workspace_key||'/'||f.dataset_key||'/'||split_part(name,'/',4)
    and split_part(name,'/',4) ~ '^[0-9]+-[A-Za-z0-9._-]+$'
  ))
);
commit;
