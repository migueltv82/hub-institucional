param(
  [string]$ContainerName = ''
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$fixture = Join-Path $root 'supabase\security\student_career_admin_commands_fixture.sql'
$cleanup = Join-Path $root 'supabase\security\student_career_admin_commands_cleanup.sql'

if (-not $ContainerName) {
  $ContainerName = docker ps --filter 'name=supabase_db_' --format '{{.Names}}' | Select-Object -First 1
}
if (-not $ContainerName -or $ContainerName -notlike 'supabase_db_*') {
  throw 'LOCAL_SUPABASE_DATABASE_NOT_RUNNING'
}

function Invoke-LocalSqlFile([string]$Path) {
  Get-Content -LiteralPath $Path -Raw |
    docker exec -i $ContainerName psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q
  if ($LASTEXITCODE -ne 0) { throw "LOCAL_SQL_FILE_FAILED:$Path" }
}

function Invoke-LocalSql([string]$Sql) {
  $output = $Sql | docker exec -i $ContainerName psql -U postgres -d postgres -v ON_ERROR_STOP=1 -qAt
  if ($LASTEXITCODE -ne 0) { throw 'LOCAL_SQL_QUERY_FAILED' }
  return @($output)
}

function Invoke-AuthJson([string]$UserId, [string]$Sql) {
  $query = @"
begin;
set local role authenticated;
set local "request.jwt.claim.sub" = '$UserId';
set local "request.jwt.claim.role" = 'authenticated';
$Sql
commit;
"@
  $output = $query | docker exec -i $ContainerName psql -U postgres -d postgres -v ON_ERROR_STOP=1 -qAt
  if ($LASTEXITCODE -ne 0) { throw 'LOCAL_AUTHENTICATED_QUERY_FAILED' }
  return ($output | Select-Object -Last 1 | ConvertFrom-Json)
}

function Test-AuthQueryBlocked([string]$UserId, [string]$Sql) {
  $query = @"
begin;
set local role authenticated;
set local "request.jwt.claim.sub" = '$UserId';
set local "request.jwt.claim.role" = 'authenticated';
$Sql
commit;
"@
  $previous = $ErrorActionPreference
  $ErrorActionPreference = 'SilentlyContinue'
  $null = $query | docker exec -i $ContainerName psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q 2>$null
  $blocked = $LASTEXITCODE -ne 0
  $ErrorActionPreference = $previous
  return $blocked
}

function Get-FixtureCounts {
  $row = (Invoke-LocalSql @"
select concat_ws('|',
  (select count(*) from public.institutions where id::text like '36000000-0000-4000-8000-%'),
  (select count(*) from public.student_career_enrollments where institution_id::text like '36000000-0000-4000-8000-%'),
  (select count(*) from public.course_enrollments where institution_id::text like '36000000-0000-4000-8000-%'),
  (select count(*) from public.domain_command_requests where institution_id::text like '36000000-0000-4000-8000-%'),
  (select count(*) from public.domain_audit_events where institution_id::text like '36000000-0000-4000-8000-%')
);
"@ | Select-Object -Last 1).Trim().Split('|')
  return [pscustomobject]@{
    institutions = [int]$row[0]
    links = [int]$row[1]
    courseEnrollments = [int]$row[2]
    commands = [int]$row[3]
    auditEvents = [int]$row[4]
  }
}

function Invoke-ConcurrentCreate {
  $sql = @"
begin;
set local role authenticated;
set local "request.jwt.claim.sub" = '36000000-0000-4000-8000-000000000010';
set local "request.jwt.claim.role" = 'authenticated';
select public.academic_admin_create_student_career_enrollment(
  '36000000-0000-4000-8000-000000000022',
  '36000000-0000-4000-8000-000000000122',
  '36000000-0000-4000-8000-000000000201',
  '36000000-0000-4000-8000-000000000301',
  '36000000-0000-4000-8000-000000000401',
  '36000000-0000-4000-8000-000000000401',
  2095, true,
  '36000000-0000-4000-8000-000000000907',
  'Alta concurrente local'
);
commit;
"@
  $encoded = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($sql))
  $jobScript = {
    param($DatabaseContainer, $EncodedSql)
    $query = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($EncodedSql))
    $query | docker exec -i $DatabaseContainer psql -U postgres -d postgres -v ON_ERROR_STOP=1 -qAt
    if ($LASTEXITCODE -ne 0) { throw 'CONCURRENT_CAREER_CREATE_FAILED' }
  }
  $jobs = 1..2 | ForEach-Object { Start-Job -ScriptBlock $jobScript -ArgumentList $ContainerName, $encoded }
  try {
    $null = $jobs | Wait-Job -Timeout 30
    if ($jobs.State -contains 'Running') { throw 'CONCURRENT_CAREER_CREATE_TIMEOUT' }
    if (@($jobs | Where-Object State -ne 'Completed').Count -gt 0) { throw 'CONCURRENT_CAREER_CREATE_JOB_FAILED' }
    $results = @($jobs | Receive-Job | ForEach-Object { $_.ToString().Trim() } | Where-Object { $_ })
    if ($results.Count -ne 2 -or @($results | Select-Object -Unique).Count -ne 1) {
      throw "CONCURRENT_CAREER_CREATE_RESULTS_DIFFER:$($results.Count)"
    }
    return $results
  } finally {
    $jobs | Remove-Job -Force -ErrorAction SilentlyContinue
  }
}

Invoke-LocalSqlFile $cleanup
$before = Get-FixtureCounts
try {
  Invoke-LocalSqlFile $fixture
  $fixtureCounts = Get-FixtureCounts

  $planMismatch = Invoke-AuthJson '36000000-0000-4000-8000-000000000010' "select public.academic_admin_create_student_career_enrollment('36000000-0000-4000-8000-000000000020','36000000-0000-4000-8000-000000000120','36000000-0000-4000-8000-000000000201','36000000-0000-4000-8000-000000000302','36000000-0000-4000-8000-000000000401','36000000-0000-4000-8000-000000000401',2095,true,'36000000-0000-4000-8000-000000000910','Plan incompatible local');"
  $created = Invoke-AuthJson '36000000-0000-4000-8000-000000000010' "select public.academic_admin_create_student_career_enrollment('36000000-0000-4000-8000-000000000020','36000000-0000-4000-8000-000000000120','36000000-0000-4000-8000-000000000201','36000000-0000-4000-8000-000000000301','36000000-0000-4000-8000-000000000401','36000000-0000-4000-8000-000000000401',2095,true,'36000000-0000-4000-8000-000000000901','Alta administrativa local');"
  $createdRetry = Invoke-AuthJson '36000000-0000-4000-8000-000000000010' "select public.academic_admin_create_student_career_enrollment('36000000-0000-4000-8000-000000000020','36000000-0000-4000-8000-000000000120','36000000-0000-4000-8000-000000000201','36000000-0000-4000-8000-000000000301','36000000-0000-4000-8000-000000000401','36000000-0000-4000-8000-000000000401',2095,true,'36000000-0000-4000-8000-000000000901','Alta administrativa local');"
  $duplicate = Invoke-AuthJson '36000000-0000-4000-8000-000000000010' "select public.academic_admin_create_student_career_enrollment('36000000-0000-4000-8000-000000000020','36000000-0000-4000-8000-000000000120','36000000-0000-4000-8000-000000000201','36000000-0000-4000-8000-000000000301','36000000-0000-4000-8000-000000000401','36000000-0000-4000-8000-000000000401',2095,true,'36000000-0000-4000-8000-000000000902','Alta duplicada local');"

  $studentCreateBlocked = Test-AuthQueryBlocked '36000000-0000-4000-8000-000000000020' "select public.academic_admin_create_student_career_enrollment('36000000-0000-4000-8000-000000000020','36000000-0000-4000-8000-000000000120','36000000-0000-4000-8000-000000000202','36000000-0000-4000-8000-000000000302','36000000-0000-4000-8000-000000000401','36000000-0000-4000-8000-000000000401',2095,true,'36000000-0000-4000-8000-000000000920','Intento alumno');"
  $teacherCreateBlocked = Test-AuthQueryBlocked '36000000-0000-4000-8000-000000000030' "select public.academic_admin_create_student_career_enrollment('36000000-0000-4000-8000-000000000022','36000000-0000-4000-8000-000000000122','36000000-0000-4000-8000-000000000201','36000000-0000-4000-8000-000000000301','36000000-0000-4000-8000-000000000401','36000000-0000-4000-8000-000000000401',2095,true,'36000000-0000-4000-8000-000000000921','Intento docente');"
  $crossTenantCreateBlocked = Test-AuthQueryBlocked '36000000-0000-4000-8000-000000000011' "select public.academic_admin_create_student_career_enrollment('36000000-0000-4000-8000-000000000020','36000000-0000-4000-8000-000000000120','36000000-0000-4000-8000-000000000201','36000000-0000-4000-8000-000000000301','36000000-0000-4000-8000-000000000401','36000000-0000-4000-8000-000000000401',2095,true,'36000000-0000-4000-8000-000000000922','Intento otro tenant');"
  $crossTenantInvalidateBlocked = Test-AuthQueryBlocked '36000000-0000-4000-8000-000000000010' "select public.academic_admin_invalidate_student_career_enrollment('36000000-0000-4000-8000-000000000802','36000000-0000-4000-8000-000000000923','Intento otro tenant');"

  $null = Invoke-LocalSql @"
create or replace function public.test_fail_student_career_replacement()
returns trigger language plpgsql set search_path = public as `$`$
begin
  if new.study_plan_id = '36000000-0000-4000-8000-000000000303'
    and new.metadata ->> 'requestId' = '36000000-0000-4000-8000-000000000903'
  then raise exception 'INDUCED_CORRECTION_FAILURE'; end if;
  return new;
end;
`$`$;
create trigger test_fail_student_career_replacement
before insert on public.student_career_enrollments
for each row execute function public.test_fail_student_career_replacement();
"@
  $rollbackBlocked = Test-AuthQueryBlocked '36000000-0000-4000-8000-000000000010' "select public.academic_admin_correct_student_career_enrollment('36000000-0000-4000-8000-000000000801','36000000-0000-4000-8000-000000000201','36000000-0000-4000-8000-000000000303','36000000-0000-4000-8000-000000000401','36000000-0000-4000-8000-000000000401',2095,false,'36000000-0000-4000-8000-000000000903','Correccion con fallo inducido');"
  $null = Invoke-LocalSql "drop trigger if exists test_fail_student_career_replacement on public.student_career_enrollments; drop function if exists public.test_fail_student_career_replacement();"
  $rollbackState = (Invoke-LocalSql "select concat_ws('|', status, (select count(*) from public.domain_command_requests where request_id='36000000-0000-4000-8000-000000000903')) from public.student_career_enrollments where id='36000000-0000-4000-8000-000000000801';" | Select-Object -Last 1).Trim().Split('|')

  $corrected = Invoke-AuthJson '36000000-0000-4000-8000-000000000010' "select public.academic_admin_correct_student_career_enrollment('36000000-0000-4000-8000-000000000801','36000000-0000-4000-8000-000000000201','36000000-0000-4000-8000-000000000303','36000000-0000-4000-8000-000000000401','36000000-0000-4000-8000-000000000401',2095,false,'36000000-0000-4000-8000-000000000904','Correccion administrativa local');"
  $correctedRetry = Invoke-AuthJson '36000000-0000-4000-8000-000000000010' "select public.academic_admin_correct_student_career_enrollment('36000000-0000-4000-8000-000000000801','36000000-0000-4000-8000-000000000201','36000000-0000-4000-8000-000000000303','36000000-0000-4000-8000-000000000401','36000000-0000-4000-8000-000000000401',2095,false,'36000000-0000-4000-8000-000000000904','Correccion administrativa local');"
  $newLinkId = $corrected.studentCareerEnrollmentId
  $correctionState = (Invoke-LocalSql "select concat_ws('|', old.status, old.superseded_by_enrollment_id, replacement.status, replacement.supersedes_enrollment_id, old.correction_reason) from public.student_career_enrollments old join public.student_career_enrollments replacement on replacement.id='$newLinkId' where old.id='36000000-0000-4000-8000-000000000801';" | Select-Object -Last 1).Trim().Split('|')

  $invalidated = Invoke-AuthJson '36000000-0000-4000-8000-000000000010' "select public.academic_admin_invalidate_student_career_enrollment('$newLinkId','36000000-0000-4000-8000-000000000905','Invalidacion administrativa local');"
  $invalidatedRetry = Invoke-AuthJson '36000000-0000-4000-8000-000000000010' "select public.academic_admin_invalidate_student_career_enrollment('$newLinkId','36000000-0000-4000-8000-000000000905','Invalidacion administrativa local');"
  $secondInvalidation = Invoke-AuthJson '36000000-0000-4000-8000-000000000010' "select public.academic_admin_invalidate_student_career_enrollment('$newLinkId','36000000-0000-4000-8000-000000000906','Segunda invalidacion local');"

  $history = Invoke-AuthJson '36000000-0000-4000-8000-000000000010' "select public.academic_admin_get_student_career_enrollment_history('36000000-0000-4000-8000-000000000201','36000000-0000-4000-8000-000000000021');"
  $studentHistoryBlocked = Test-AuthQueryBlocked '36000000-0000-4000-8000-000000000021' "select public.academic_admin_get_student_career_enrollment_history('36000000-0000-4000-8000-000000000201',null);"
  $teacherHistoryBlocked = Test-AuthQueryBlocked '36000000-0000-4000-8000-000000000030' "select public.academic_admin_get_student_career_enrollment_history('36000000-0000-4000-8000-000000000201',null);"
  $directWriteBlocked = Test-AuthQueryBlocked '36000000-0000-4000-8000-000000000020' "update public.student_career_enrollments set status='INVALIDATED' where id='$($created.studentCareerEnrollmentId)';"
  $auditUpdateBlocked = Test-AuthQueryBlocked '36000000-0000-4000-8000-000000000010' "update public.domain_audit_events set payload='{}'::jsonb where institution_id='36000000-0000-4000-8000-000000000001';"
  $auditDeleteBlocked = Test-AuthQueryBlocked '36000000-0000-4000-8000-000000000010' "delete from public.domain_audit_events where institution_id='36000000-0000-4000-8000-000000000001';"

  $concurrentResults = Invoke-ConcurrentCreate
  $afterOperations = Get-FixtureCounts
  $integrity = (Invoke-LocalSql @"
with ordered as (
  select audit.*,
    lag(audit.event_hash) over (partition by audit.institution_id, audit.aggregate_type, audit.aggregate_id order by audit.sequence_number) expected_previous
  from public.domain_audit_events audit
  where audit.institution_id = '36000000-0000-4000-8000-000000000001'
), checked as (
  select *, encode(extensions.digest(convert_to(jsonb_build_object(
    'institutionId', institution_id, 'aggregateType', aggregate_type,
    'aggregateId', aggregate_id, 'sequenceNumber', sequence_number,
    'eventType', event_type, 'actorId', actor_id, 'occurredAt', occurred_at,
    'payload', payload, 'previousHash', previous_hash
  )::text, 'utf8'), 'sha256'), 'hex') expected_hash
  from ordered
)
select concat_ws('|', count(*), count(*) filter (where event_hash = expected_hash), count(*) filter (where previous_hash is not distinct from expected_previous)) from checked;
"@ | Select-Object -Last 1).Trim().Split('|')

  $checks = [ordered]@{
    plan_mismatch_rejected = $planMismatch.code -eq 'STUDY_PLAN_CAREER_MISMATCH'
    create_completed = $created.status -eq 'CREATED'
    create_idempotent = ($created | ConvertTo-Json -Depth 20 -Compress) -eq ($createdRetry | ConvertTo-Json -Depth 20 -Compress)
    duplicate_rejected = $duplicate.code -eq 'ACTIVE_LINK_ALREADY_EXISTS'
    student_blocked = $studentCreateBlocked
    teacher_blocked = $teacherCreateBlocked
    cross_tenant_create_blocked = $crossTenantCreateBlocked
    cross_tenant_invalidate_blocked = $crossTenantInvalidateBlocked
    rollback_induced = $rollbackBlocked
    rollback_restored_old_link = $rollbackState[0] -eq 'ACTIVE' -and $rollbackState[1] -eq '0'
    correction_completed = $corrected.status -eq 'CORRECTED'
    correction_idempotent = ($corrected | ConvertTo-Json -Depth 20 -Compress) -eq ($correctedRetry | ConvertTo-Json -Depth 20 -Compress)
    correction_links_related = $correctionState[0] -eq 'INVALIDATED' -and $correctionState[1] -eq $newLinkId -and $correctionState[2] -eq 'ACTIVE' -and $correctionState[3] -eq '36000000-0000-4000-8000-000000000801' -and $correctionState[4] -eq 'Correccion administrativa local'
    invalidation_completed = $invalidated.status -eq 'INVALIDATED'
    invalidation_warned = @($invalidated.warnings) -contains 'ACTIVE_COURSE_ENROLLMENTS_EXIST'
    invalidation_idempotent = ($invalidated | ConvertTo-Json -Depth 20 -Compress) -eq ($invalidatedRetry | ConvertTo-Json -Depth 20 -Compress)
    second_invalidation_rejected = $secondInvalidation.code -eq 'LINK_ALREADY_INVALIDATED'
    history_scoped = $history.history.Count -eq 2 -and $history.commandRequests.Count -ge 3 -and $history.auditEvents.Count -ge 4
    student_history_blocked = $studentHistoryBlocked
    teacher_history_blocked = $teacherHistoryBlocked
    direct_write_blocked = $directWriteBlocked
    audit_update_blocked = $auditUpdateBlocked
    audit_delete_blocked = $auditDeleteBlocked
    concurrent_same_result = $concurrentResults.Count -eq 2
    audit_hashes_valid = $integrity[0] -eq $integrity[1]
    audit_chain_valid = $integrity[0] -eq $integrity[2]
    historical_enrollment_preserved = $afterOperations.courseEnrollments -eq 1
    final_link_count = $afterOperations.links -eq 5
    final_command_count = $afterOperations.commands -eq 7
    final_audit_count = $afterOperations.auditEvents -eq 8
  }
  $failed = @($checks.Keys | Where-Object { $checks[$_] -ne $true })
  if ($failed.Count -gt 0) {
    throw "LOCAL_STUDENT_CAREER_ADMIN_INVARIANT_FAILED:$($failed -join ',')"
  }

  $result = [pscustomobject]@{
    ok = $true
    mode = 'LOCAL_STUDENT_CAREER_LINK_MANAGEMENT'
    rowsBefore = $before
    fixtureRows = $fixtureCounts
    rowsAfterOperations = $afterOperations
    createStatus = $created.status
    correctionStatus = $corrected.status
    invalidationStatus = $invalidated.status
    rejectedCodes = @($planMismatch.code, $duplicate.code, $secondInvalidation.code)
    idempotentReplay = $true
    concurrentRequests = $concurrentResults.Count
    rollbackComplete = $true
    activeCourseEnrollmentsPreserved = $afterOperations.courseEnrollments
    auditHashesValid = $true
    auditChainValid = $true
    security = [pscustomobject]@{
      studentBlocked = $studentCreateBlocked
      teacherBlocked = $teacherCreateBlocked
      crossTenantBlocked = $crossTenantCreateBlocked -and $crossTenantInvalidateBlocked
      directWriteBlocked = $directWriteBlocked
      auditMutationBlocked = $auditUpdateBlocked -and $auditDeleteBlocked
    }
    remoteSupabaseUsed = $false
  }
} finally {
  $null = Invoke-LocalSql "drop trigger if exists test_fail_student_career_replacement on public.student_career_enrollments; drop function if exists public.test_fail_student_career_replacement();"
  Invoke-LocalSqlFile $cleanup
}

$afterCleanup = Get-FixtureCounts
if ($afterCleanup.institutions -ne 0 -or $afterCleanup.links -ne 0 -or
  $afterCleanup.courseEnrollments -ne 0 -or $afterCleanup.commands -ne 0 -or
  $afterCleanup.auditEvents -ne 0) {
  throw 'LOCAL_STUDENT_CAREER_ADMIN_CLEANUP_FAILED'
}
$result | Add-Member -NotePropertyName rowsAfterCleanup -NotePropertyValue $afterCleanup
$result | ConvertTo-Json -Depth 8
