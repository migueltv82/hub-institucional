// Test schema only; no remote credentials or connections.
export function gatewaySchemaFixture({a,b,tenant,foreign}) { return `create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create schema storage;
    create table auth.users(id uuid primary key);
    create table public.institutions(id uuid primary key,status text);
    create table public.profiles(user_id uuid primary key,is_blocked boolean);
    create table public.memberships(institution_id uuid,user_id uuid,role text);
    create table public.workspace_snapshots(institution_id uuid,workspace_key text,payload jsonb default '{}',updated_at timestamptz default now(), primary key(institution_id,workspace_key));
    create table public.workspace_source_files(institution_id uuid,workspace_key text,dataset_key text,file_name text,mime_type text,file_extension text,file_size bigint,storage_bucket text,storage_path text,file_base64 text,updated_at timestamptz,primary key(institution_id,workspace_key,dataset_key));
    create table storage.objects(bucket_id text,name text,unique(bucket_id,name));
    create table storage.buckets(id text primary key,file_size_limit bigint);
    insert into storage.buckets values('workspace-source-files',null);
    alter table storage.objects enable row level security;
    alter table public.workspace_source_files enable row level security;
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create function public.is_member_of_institution(uuid) returns boolean language sql stable as $$select exists(select 1 from public.memberships where institution_id=$1 and user_id=auth.uid())$$;
    grant usage on schema auth,storage,public to anon,authenticated,service_role;
    grant select on public.memberships to authenticated;
    grant all on public.workspace_source_files,storage.objects to authenticated,service_role;
    create policy existing_storage on storage.objects for all to authenticated using(public.is_member_of_institution(split_part(name,'/',1)::uuid)) with check(public.is_member_of_institution(split_part(name,'/',1)::uuid));
    create policy existing_metadata on public.workspace_source_files for all to authenticated using(public.is_member_of_institution(institution_id)) with check(public.is_member_of_institution(institution_id));
    insert into auth.users values('${a}'),('${b}');
    insert into public.profiles values('${a}',false),('${b}',false);
    insert into public.institutions values('${tenant}','active'),('${foreign}','active');
    insert into public.memberships values('${tenant}','${a}','editor'),('${tenant}','${b}','editor'),('${foreign}','${b}','admin');` }
