param(
  [string]$ContainerName = ''
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$fixture = Join-Path $root 'supabase\security\academic_enrollment_concurrency_fixture.sql'
$cleanup = Join-Path $root 'supabase\security\academic_enrollment_concurrency_cleanup.sql'

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

function Invoke-ConcurrentRpc {
  $sql = @"
begin;
set local role authenticated;
set local "request.jwt.claim.sub" = '33000000-0000-4000-8000-000000000020';
set local "request.jwt.claim.role" = 'authenticated';
select public.academic_enroll_student_in_course_offering(
  '33000000-0000-4000-8000-000000000801',
  '33000000-0000-4000-8000-000000000701',
  '33000000-0000-4000-8000-000000000901'
);
commit;
"@
  $encoded = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($sql))
  $jobScript = {
    param($DatabaseContainer, $EncodedSql)
    $query = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($EncodedSql))
    $query | docker exec -i $DatabaseContainer psql -U postgres -d postgres -v ON_ERROR_STOP=1 -qAt
    if ($LASTEXITCODE -ne 0) { throw 'CONCURRENT_RPC_FAILED' }
  }
  $jobs = 1..2 | ForEach-Object { Start-Job -ScriptBlock $jobScript -ArgumentList $ContainerName, $encoded }
  try {
    $null = $jobs | Wait-Job -Timeout 30
    if ($jobs.State -contains 'Running') { throw 'CONCURRENT_RPC_TIMEOUT' }
    $failures = @($jobs | Where-Object State -ne 'Completed')
    if ($failures.Count -gt 0) {
      $errors = $failures | Receive-Job -ErrorAction SilentlyContinue
      throw "CONCURRENT_RPC_JOB_FAILURE:$($errors -join ';')"
    }
    return @($jobs | Receive-Job)
  } finally {
    $jobs | Remove-Job -Force -ErrorAction SilentlyContinue
  }
}

Invoke-LocalSqlFile $cleanup
try {
  Invoke-LocalSqlFile $fixture
  $results = Invoke-ConcurrentRpc
  $rpcResults = @($results | ForEach-Object { $_.ToString().Trim() } | Where-Object { $_ })
  if ($rpcResults.Count -ne 2 -or @($rpcResults | Select-Object -Unique).Count -ne 1) {
    throw "CONCURRENT_RPC_RESULTS_DIFFER:resultCount=$($rpcResults.Count)"
  }
  $verification = docker exec $ContainerName psql -U postgres -d postgres -v ON_ERROR_STOP=1 -qAt -F '|' -c @"
select
  (select count(*) from public.course_enrollments where institution_id = '33000000-0000-4000-8000-000000000001'),
  (select count(*) from public.domain_command_requests where institution_id = '33000000-0000-4000-8000-000000000001'),
  (select count(*) from public.domain_audit_events where institution_id = '33000000-0000-4000-8000-000000000001'),
  (select count(distinct result_payload) from public.domain_command_requests where institution_id = '33000000-0000-4000-8000-000000000001');
"@
  if ($LASTEXITCODE -ne 0) { throw 'CONCURRENCY_VERIFICATION_QUERY_FAILED' }
  $counts = $verification.Trim().Split('|')
  if ($counts.Count -ne 4 -or $counts[0] -ne '1' -or $counts[1] -ne '1' -or $counts[2] -lt 1 -or $counts[3] -ne '1') {
    throw "CONCURRENCY_INVARIANT_FAILED:enrollments=$($counts[0]);commands=$($counts[1]);audits=$($counts[2]);results=$($counts[3])"
  }

  [pscustomobject]@{
    ok = $true
    mode = 'LOCAL_POSTGRES_CONCURRENCY_TEST'
    concurrentRequests = $rpcResults.Count
    persistedEnrollments = [int]$counts[0]
    persistedCommandRequests = [int]$counts[1]
    auditEvents = [int]$counts[2]
    identicalStoredResults = ([int]$counts[3] -eq 1)
    remoteSupabaseUsed = $false
  } | ConvertTo-Json
} finally {
  Invoke-LocalSqlFile $cleanup
}
