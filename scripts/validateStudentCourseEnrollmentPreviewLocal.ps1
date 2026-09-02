param(
  [string]$ContainerName = ''
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$fixture = Join-Path $root 'supabase\security\student_course_enrollment_preview_fixture.sql'
$cleanup = Join-Path $root 'supabase\security\student_course_enrollment_preview_cleanup.sql'

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
  $previousErrorActionPreference = $ErrorActionPreference
  $ErrorActionPreference = 'SilentlyContinue'
  $null = $query | docker exec -i $ContainerName psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q 2>$null
  $blocked = $LASTEXITCODE -ne 0
  $ErrorActionPreference = $previousErrorActionPreference
  return $blocked
}

function Get-Counts {
  $output = docker exec $ContainerName psql -U postgres -d postgres -qAt -F '|' -c @"
select
  (select count(*) from public.student_career_enrollments where institution_id='35000000-0000-4000-8000-000000000001'),
  (select count(*) from public.course_offerings where institution_id='35000000-0000-4000-8000-000000000001'),
  (select count(*) from public.course_enrollments where institution_id='35000000-0000-4000-8000-000000000001'),
  (select count(*) from public.domain_command_requests where institution_id='35000000-0000-4000-8000-000000000001'),
  (select count(*) from public.domain_audit_events where institution_id='35000000-0000-4000-8000-000000000001');
"@
  if ($LASTEXITCODE -ne 0) { throw 'LOCAL_PREVIEW_COUNT_QUERY_FAILED' }
  $parts = $output.Trim().Split('|')
  return [pscustomobject]@{
    relations = [int]$parts[0]
    offerings = [int]$parts[1]
    enrollments = [int]$parts[2]
    commands = [int]$parts[3]
    auditEvents = [int]$parts[4]
  }
}

Invoke-LocalSqlFile $cleanup
$before = Get-Counts
try {
  Invoke-LocalSqlFile $fixture
  $fixtureCounts = Get-Counts

  $firstYear = Invoke-AuthJson '35000000-0000-4000-8000-000000000020' "select public.academic_enroll_first_year_student('35000000-0000-4000-8000-000000000801','35000000-0000-4000-8000-000000000401','35000000-0000-4000-8000-000000000901');"
  $firstYearRetry = Invoke-AuthJson '35000000-0000-4000-8000-000000000020' "select public.academic_enroll_first_year_student('35000000-0000-4000-8000-000000000801','35000000-0000-4000-8000-000000000401','35000000-0000-4000-8000-000000000901');"
  $individual = Invoke-AuthJson '35000000-0000-4000-8000-000000000021' "select public.academic_enroll_student_in_course_offering('35000000-0000-4000-8000-000000000802','35000000-0000-4000-8000-000000000707','35000000-0000-4000-8000-000000000902');"
  $individualRetry = Invoke-AuthJson '35000000-0000-4000-8000-000000000021' "select public.academic_enroll_student_in_course_offering('35000000-0000-4000-8000-000000000802','35000000-0000-4000-8000-000000000707','35000000-0000-4000-8000-000000000902');"
  $passed = Invoke-AuthJson '35000000-0000-4000-8000-000000000021' "select public.academic_enroll_student_in_course_offering('35000000-0000-4000-8000-000000000802','35000000-0000-4000-8000-000000000703','35000000-0000-4000-8000-000000000903');"
  $prerequisite = Invoke-AuthJson '35000000-0000-4000-8000-000000000021' "select public.academic_enroll_student_in_course_offering('35000000-0000-4000-8000-000000000802','35000000-0000-4000-8000-000000000704','35000000-0000-4000-8000-000000000904');"
  $closed = Invoke-AuthJson '35000000-0000-4000-8000-000000000021' "select public.academic_enroll_student_in_course_offering('35000000-0000-4000-8000-000000000802','35000000-0000-4000-8000-000000000705','35000000-0000-4000-8000-000000000905');"
  $otherCareer = Invoke-AuthJson '35000000-0000-4000-8000-000000000021' "select public.academic_enroll_student_in_course_offering('35000000-0000-4000-8000-000000000802','35000000-0000-4000-8000-000000000706','35000000-0000-4000-8000-000000000906');"
  $existing = Invoke-AuthJson '35000000-0000-4000-8000-000000000021' "select public.academic_enroll_student_in_course_offering('35000000-0000-4000-8000-000000000802','35000000-0000-4000-8000-000000000702','35000000-0000-4000-8000-000000000907');"

  $studentPreview = Invoke-AuthJson '35000000-0000-4000-8000-000000000021' "select public.academic_get_student_course_enrollment_preview('35000000-0000-4000-8000-000000000001','35000000-0000-4000-8000-000000000802');"
  $adminPreview = Invoke-AuthJson '35000000-0000-4000-8000-000000000010' "select public.academic_get_student_course_enrollment_preview('35000000-0000-4000-8000-000000000001','35000000-0000-4000-8000-000000000802');"
  $otherStudentBlocked = Test-AuthQueryBlocked '35000000-0000-4000-8000-000000000021' "select public.academic_get_student_course_enrollment_preview('35000000-0000-4000-8000-000000000001','35000000-0000-4000-8000-000000000803');"
  $teacherBlocked = Test-AuthQueryBlocked '35000000-0000-4000-8000-000000000030' "select public.academic_get_student_course_enrollment_preview('35000000-0000-4000-8000-000000000001', null);"
  $crossTenantAdminBlocked = Test-AuthQueryBlocked '35000000-0000-4000-8000-000000000010' "select public.academic_get_student_course_enrollment_preview('36000000-0000-4000-8000-000000000001', null);"

  $directWriteSql = @"
begin;
set local role authenticated;
set local "request.jwt.claim.sub" = '35000000-0000-4000-8000-000000000021';
update public.course_enrollments set status='WITHDRAWN' where id='35000000-0000-4000-8000-000000000840';
rollback;
"@
  $previousErrorActionPreference = $ErrorActionPreference
  $ErrorActionPreference = 'SilentlyContinue'
  $null = $directWriteSql | docker exec -i $ContainerName psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q 2>$null
  $directWriteBlocked = $LASTEXITCODE -ne 0
  $ErrorActionPreference = $previousErrorActionPreference

  $afterOperations = Get-Counts
  $checks = [ordered]@{
    first_year_created = $firstYear.status -eq 'COMPLETED' -and $firstYear.created_count -eq 1
    first_year_idempotent = ($firstYear | ConvertTo-Json -Depth 20 -Compress) -eq ($firstYearRetry | ConvertTo-Json -Depth 20 -Compress)
    individual_created = $individual.status -eq 'COMPLETED'
    individual_idempotent = ($individual | ConvertTo-Json -Depth 20 -Compress) -eq ($individualRetry | ConvertTo-Json -Depth 20 -Compress)
    passed_rejected = $passed.rejections[0].code -eq 'SUBJECT_ALREADY_PASSED'
    prerequisite_rejected = $prerequisite.rejections[0].code -eq 'PREREQUISITES_NOT_MET'
    closed_rejected = $closed.rejections[0].code -eq 'OFFERING_NOT_OPEN'
    other_career_rejected = $otherCareer.rejections[0].code -eq 'CAREER_MISMATCH'
    existing_detected = $existing.status -eq 'ALREADY_EXISTED'
    student_projection = $studentPreview.actorMode -eq 'student'
    student_offerings_scoped = $studentPreview.offerings.Count -eq 6
    student_enrollments_scoped = $studentPreview.enrollments.Count -eq 2
    student_schedule_scoped = $studentPreview.schedules.Count -eq 1
    student_teachers_scoped = $studentPreview.teachingAssignments.Count -eq 1
    student_audit_hidden = $studentPreview.auditEvents.Count -eq 0
    admin_projection = $adminPreview.actorMode -eq 'admin'
    admin_relations_scoped = $adminPreview.metrics.relations -eq 3
    admin_enrollments_scoped = $adminPreview.metrics.enrollments -eq 3
    admin_audit_scoped = $adminPreview.auditEvents.Count -eq 8
    other_student_blocked = $otherStudentBlocked
    teacher_blocked = $teacherBlocked
    cross_tenant_admin_blocked = $crossTenantAdminBlocked
    direct_write_blocked = $directWriteBlocked
    enrollment_count = $afterOperations.enrollments -eq 3
    command_count = $afterOperations.commands -eq 7
    audit_count = $afterOperations.auditEvents -eq 8
  }
  $failedChecks = @($checks.Keys | Where-Object { $checks[$_] -ne $true })
  if ($failedChecks.Count -gt 0) {
    $safeDiagnostic = [ordered]@{
      failed = $failedChecks
      firstYear = [ordered]@{
        status = $firstYear.status
        created = $firstYear.created_count
        existing = $firstYear.existing_count
        rejected = $firstYear.rejected_count
        rejectionCodes = @($firstYear.rejections | ForEach-Object { $_.code })
      }
      individual = [ordered]@{
        status = $individual.status
        rejectionCodes = @($individual.rejections | ForEach-Object { $_.code })
      }
      counts = $afterOperations
    }
    throw "LOCAL_STUDENT_COURSE_PREVIEW_INVARIANT_FAILED:$($safeDiagnostic | ConvertTo-Json -Depth 5 -Compress)"
  }

  $result = [pscustomobject]@{
    ok = $true
    mode = 'LOCAL_STUDENT_COURSE_ENROLLMENT_INTERNAL_PREVIEW'
    rowsBefore = $before
    fixtureRows = $fixtureCounts
    rowsAfterOperations = $afterOperations
    firstYearCreated = [int]$firstYear.created_count
    individualCreated = ($individual.status -eq 'COMPLETED')
    rejectionCodes = @(
      $passed.rejections[0].code,
      $prerequisite.rejections[0].code,
      $closed.rejections[0].code,
      $otherCareer.rejections[0].code
    )
    sameRequestIdempotent = $true
    directWriteBlocked = $directWriteBlocked
    otherStudentBlocked = $otherStudentBlocked
    teacherBlocked = $teacherBlocked
    crossTenantAdminBlocked = $crossTenantAdminBlocked
    studentPreviewOfferings = $studentPreview.offerings.Count
    studentPreviewEnrollments = $studentPreview.enrollments.Count
    adminAuditEvents = $adminPreview.auditEvents.Count
    remoteSupabaseUsed = $false
  }
} finally {
  Invoke-LocalSqlFile $cleanup
}

$afterCleanup = Get-Counts
if ($afterCleanup.relations -ne 0 -or $afterCleanup.offerings -ne 0 -or
  $afterCleanup.enrollments -ne 0 -or $afterCleanup.commands -ne 0 -or
  $afterCleanup.auditEvents -ne 0) {
  throw 'LOCAL_STUDENT_COURSE_PREVIEW_CLEANUP_FAILED'
}
$result | Add-Member -NotePropertyName rowsAfterCleanup -NotePropertyValue $afterCleanup
$result | ConvertTo-Json -Depth 8
