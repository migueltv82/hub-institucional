param(
  [string]$ContainerName = ''
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$migration = Join-Path $root 'supabase\setup_multi_tenant\09_teacher_course_roster_preview.sql'
$identityMigration = Join-Path $root 'supabase\setup_multi_tenant\10_teacher_profile_identity_link.sql'
$fixture = Join-Path $root 'supabase\security\teacher_course_roster_preview_fixture.sql'
$tests = Join-Path $root 'supabase\security\teacher_course_roster_preview_tests.sql'
$cleanup = Join-Path $root 'supabase\security\teacher_course_roster_preview_cleanup.sql'

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

function Invoke-AuthScalar([string]$UserId, [string]$Sql) {
  $query = @"
begin;
set local role authenticated;
set local "request.jwt.claim.sub" = '$UserId';
set local "request.jwt.claim.role" = 'authenticated';
$Sql
commit;
"@
  $output = $query | docker exec -i $ContainerName psql -U postgres -d postgres -v ON_ERROR_STOP=1 -qAt
  if ($LASTEXITCODE -ne 0) { throw 'LOCAL_AUTHENTICATED_SCALAR_FAILED' }
  return ($output | Select-Object -Last 1).Trim()
}

function Test-QueryBlocked([string]$Role, [string]$UserId, [string]$Sql) {
  $claimLines = if ($UserId) {
    "set local `"request.jwt.claim.sub`" = '$UserId';`nset local `"request.jwt.claim.role`" = '$Role';"
  } else {
    "set local `"request.jwt.claim.role`" = '$Role';"
  }
  $query = @"
begin;
set local role $Role;
$claimLines
$Sql
rollback;
"@
  $previousPreference = $ErrorActionPreference
  $ErrorActionPreference = 'SilentlyContinue'
  $null = $query | docker exec -i $ContainerName psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q 2>$null
  $blocked = $LASTEXITCODE -ne 0
  $ErrorActionPreference = $previousPreference
  return $blocked
}

function Get-FixtureCounts {
  $output = docker exec $ContainerName psql -U postgres -d postgres -qAt -F '|' -c @"
select
  (select count(*) from public.institutions where id::text like '39000000-%' or id::text like '39100000-%'),
  (select count(*) from public.profiles where user_id::text like '39000000-%' or user_id::text like '39100000-%'),
  (select count(*) from public.memberships where institution_id::text like '39000000-%' or institution_id::text like '39100000-%'),
  (select count(*) from public.teacher_records where institution_id::text like '39000000-%' or institution_id::text like '39100000-%'),
  (select count(*) from public.student_records where institution_id::text like '39000000-%' or institution_id::text like '39100000-%'),
  (select count(*) from public.course_offerings where institution_id::text like '39000000-%' or institution_id::text like '39100000-%'),
  (select count(*) from public.course_schedules where institution_id::text like '39000000-%' or institution_id::text like '39100000-%'),
  (select count(*) from public.teaching_assignments where institution_id::text like '39000000-%' or institution_id::text like '39100000-%'),
  (select count(*) from public.student_career_enrollments where institution_id::text like '39000000-%' or institution_id::text like '39100000-%'),
  (select count(*) from public.course_enrollments where institution_id::text like '39000000-%' or institution_id::text like '39100000-%'),
  (select count(*) from public.domain_audit_events where institution_id::text like '39000000-%' or institution_id::text like '39100000-%'),
  (select count(*) from auth.users where id::text like '39000000-%' or id::text like '39100000-%');
"@
  if ($LASTEXITCODE -ne 0) { throw 'LOCAL_TEACHER_ROSTER_COUNT_QUERY_FAILED' }
  $parts = $output.Trim().Split('|')
  return [pscustomobject]@{
    institutions = [int]$parts[0]
    profiles = [int]$parts[1]
    memberships = [int]$parts[2]
    teacherRecords = [int]$parts[3]
    studentRecords = [int]$parts[4]
    offerings = [int]$parts[5]
    schedules = [int]$parts[6]
    assignments = [int]$parts[7]
    careerLinks = [int]$parts[8]
    enrollments = [int]$parts[9]
    auditEvents = [int]$parts[10]
    authUsers = [int]$parts[11]
  }
}

Invoke-LocalSqlFile $migration
Invoke-LocalSqlFile $migration
Invoke-LocalSqlFile $identityMigration
Invoke-LocalSqlFile $identityMigration
Invoke-LocalSqlFile $cleanup
$before = Get-FixtureCounts

try {
  Invoke-LocalSqlFile $fixture
  $fixtureCounts = Get-FixtureCounts
  Invoke-LocalSqlFile $tests

  $teacherA = Invoke-AuthJson '39000000-0000-4000-8000-000000000020' "select public.academic_get_teacher_course_roster_preview('39000000-0000-4000-8000-000000000001', null);"
  $teacherB = Invoke-AuthJson '39100000-0000-4000-8000-000000000020' "select public.academic_get_teacher_course_roster_preview('39100000-0000-4000-8000-000000000001', null);"
  $identityCandidates = Invoke-AuthJson '39000000-0000-4000-8000-000000000010' "select public.academic_admin_get_teacher_profile_link_candidates('39000000-0000-4000-8000-000000000001');"
  $identityLink = Invoke-AuthJson '39000000-0000-4000-8000-000000000010' "select public.academic_admin_link_teacher_record_profile('39000000-0000-4000-8000-000000000121','39000000-0000-4000-8000-000000000021','LOCAL_TEST_EXPLICIT_LINK');"
  $identityLinkRetry = Invoke-AuthJson '39000000-0000-4000-8000-000000000010' "select public.academic_admin_link_teacher_record_profile('39000000-0000-4000-8000-000000000121','39000000-0000-4000-8000-000000000021','LOCAL_TEST_EXPLICIT_LINK_RETRY');"
  $teacherEmpty = Invoke-AuthJson '39000000-0000-4000-8000-000000000021' "select public.academic_get_teacher_course_roster_preview('39000000-0000-4000-8000-000000000001', null);"
  $adminA = Invoke-AuthJson '39000000-0000-4000-8000-000000000010' "select public.academic_get_teacher_course_roster_preview('39000000-0000-4000-8000-000000000001','39000000-0000-4000-8000-000000000020');"

  $otherTeacherBlocked = Test-QueryBlocked 'authenticated' '39000000-0000-4000-8000-000000000020' "select public.academic_get_teacher_course_roster_preview('39000000-0000-4000-8000-000000000001','39100000-0000-4000-8000-000000000020');"
  $studentBlocked = Test-QueryBlocked 'authenticated' '39000000-0000-4000-8000-000000000030' "select public.academic_get_teacher_course_roster_preview('39000000-0000-4000-8000-000000000001', null);"
  $withoutMembershipBlocked = Test-QueryBlocked 'authenticated' '39000000-0000-4000-8000-000000000022' "select public.academic_get_teacher_course_roster_preview('39000000-0000-4000-8000-000000000001', null);"
  $otherInstitutionAdminBlocked = Test-QueryBlocked 'authenticated' '39100000-0000-4000-8000-000000000010' "select public.academic_get_teacher_course_roster_preview('39000000-0000-4000-8000-000000000001','39000000-0000-4000-8000-000000000020');"
  $anonBlocked = Test-QueryBlocked 'anon' '' "select public.academic_get_teacher_course_roster_preview('39000000-0000-4000-8000-000000000001', null);"
  $teacherLinkBlocked = Test-QueryBlocked 'authenticated' '39000000-0000-4000-8000-000000000020' "select public.academic_admin_link_teacher_record_profile('39000000-0000-4000-8000-000000000121','39000000-0000-4000-8000-000000000021','FORBIDDEN_TEACHER_LINK');"
  $crossTenantLinkBlocked = Test-QueryBlocked 'authenticated' '39000000-0000-4000-8000-000000000010' "select public.academic_admin_link_teacher_record_profile('39000000-0000-4000-8000-000000000121','39100000-0000-4000-8000-000000000020','FORBIDDEN_CROSS_TENANT_LINK');"
  $teacherCandidatesBlocked = Test-QueryBlocked 'authenticated' '39000000-0000-4000-8000-000000000020' "select public.academic_admin_get_teacher_profile_link_candidates('39000000-0000-4000-8000-000000000001');"
  $otherAdminCandidatesBlocked = Test-QueryBlocked 'authenticated' '39100000-0000-4000-8000-000000000010' "select public.academic_admin_get_teacher_profile_link_candidates('39000000-0000-4000-8000-000000000001');"

  $crossTenantInsert = @"
insert into public.teaching_assignments (
  institution_id, course_offering_id, teacher_id, teacher_record_id, role,
  weekly_hours, status, valid_from, source, created_by
) values (
  '39000000-0000-4000-8000-000000000001',
  '39100000-0000-4000-8000-000000000701',
  '39000000-0000-4000-8000-000000000020',
  '39000000-0000-4000-8000-000000000120',
  'TITULAR', 1, 'ACTIVE', '2026-01-01', 'LOCAL_CROSS_TENANT_TEST',
  '39000000-0000-4000-8000-000000000010'
);
"@
  $crossTenantBlocked = Test-QueryBlocked 'authenticated' '39000000-0000-4000-8000-000000000010' $crossTenantInsert
  $teacherAssignmentRows = [int](Invoke-AuthScalar '39000000-0000-4000-8000-000000000020' "select count(*) from public.teaching_assignments;")
  $teacherEnrollmentRows = [int](Invoke-AuthScalar '39000000-0000-4000-8000-000000000020' "select count(*) from public.course_enrollments;")

  $teacherJson = $teacherA | ConvertTo-Json -Depth 30 -Compress
  $warningCodes = @($teacherA.warnings | ForEach-Object { $_.code })
  $emptyWarnings = @($teacherEmpty.warnings | ForEach-Object { $_.code })
  $visibleRosterNames = @($teacherA.assignments | ForEach-Object { $_.roster } | ForEach-Object { $_.studentDisplayName })

  $checks = [ordered]@{
    teacher_a_mode = $teacherA.actorMode -eq 'teacher'
    teacher_a_partial = $teacherA.status -eq 'PARTIAL'
    teacher_a_two_assignments = $teacherA.assignments.Count -eq 2
    teacher_a_two_visible_students = $teacherA.totals.enrolledStudentsCount -eq 2
    teacher_a_empty_offering = $teacherA.totals.offeringsWithoutStudentsCount -eq 1
    teacher_a_missing_schedule = $teacherA.totals.assignmentsWithoutScheduleCount -eq 1
    teacher_a_invalid_link_excluded = $teacherA.diagnostics.invalidCareerLinkEnrollments -eq 1 -and $visibleRosterNames -notcontains 'Student Invalid Link'
    teacher_a_other_tenant_hidden = $visibleRosterNames -notcontains 'Student B'
    teacher_b_one_assignment = $teacherB.assignments.Count -eq 1
    teacher_b_one_student = $teacherB.totals.enrolledStudentsCount -eq 1
    teacher_empty_blocked = $teacherEmpty.status -eq 'BLOCKED'
    teacher_empty_warning = $emptyWarnings -contains 'NO_ACTIVE_TEACHING_ASSIGNMENTS'
    teacher_empty_identity_resolved = $teacherEmpty.teacher.structuredIdentityStatus -eq 'RESOLVED' -and $emptyWarnings -notcontains 'TEACHER_IDENTITY_NOT_RESOLVED'
    explicit_identity_linked = $identityLink.status -eq 'LINKED'
    identity_link_idempotent = $identityLinkRetry.status -eq 'ALREADY_LINKED'
    identity_link_audited_once = $fixtureCounts.auditEvents -eq 0 -and [int](Invoke-AuthScalar '39000000-0000-4000-8000-000000000010' "select count(*) from public.domain_audit_events where institution_id='39000000-0000-4000-8000-000000000001' and event_type='TEACHER_PROFILE_LINKED';") -eq 1
    identity_candidates_minimized = $identityCandidates.profiles.Count -eq 2 -and $identityCandidates.teacherRecords.Count -eq 2 -and ($identityCandidates | ConvertTo-Json -Depth 10 -Compress) -notmatch '@example\.invalid|99390|"dni"|"phone"'
    identity_candidates_no_automatic_matching = $identityCandidates.diagnostics.automaticMatchingUsed -eq $false -and $identityCandidates.diagnostics.unlinkedProfiles -eq 1 -and $identityCandidates.diagnostics.unlinkedTeacherRecords -eq 1
    admin_same_tenant = $adminA.actorMode -eq 'admin' -and $adminA.teacher.teacherId -eq '39000000-0000-4000-8000-000000000020'
    admin_teacher_options_scoped = $adminA.teacherOptions.Count -eq 2
    other_teacher_blocked = $otherTeacherBlocked
    student_blocked = $studentBlocked
    without_membership_blocked = $withoutMembershipBlocked
    other_institution_admin_blocked = $otherInstitutionAdminBlocked
    anon_blocked = $anonBlocked
    teacher_link_command_blocked = $teacherLinkBlocked
    cross_tenant_link_blocked = $crossTenantLinkBlocked
    teacher_candidates_blocked = $teacherCandidatesBlocked
    other_admin_candidates_blocked = $otherAdminCandidatesBlocked
    cross_tenant_insert_blocked = $crossTenantBlocked
    direct_assignment_rls_scoped = $teacherAssignmentRows -eq 2
    direct_enrollment_rls_scoped = $teacherEnrollmentRows -eq 3
    legacy_warning_present = $warningCodes -contains 'LEGACY_FALLBACK_AVAILABLE_BUT_NOT_USED'
    legacy_not_used = $teacherA.diagnostics.legacyFallbackUsed -eq $false
    legacy_count_diagnostic_only = $teacherA.diagnostics.legacyEstimatedStudentsCount -eq 3 -and $teacherA.diagnostics.legacyStructuredDifference -eq 1
    invalid_link_warning = $warningCodes -contains 'ENROLLMENT_WITHOUT_ACTIVE_STUDENT_CAREER_LINK'
    empty_offering_warning = $warningCodes -contains 'COURSE_OFFERING_WITHOUT_ENROLLMENTS'
    missing_schedule_warning = $warningCodes -contains 'ASSIGNMENT_WITHOUT_SCHEDULE'
    no_dni_returned = $teacherJson -notmatch '99390|99391|"dni"|documentNumber'
    no_email_returned = $teacherJson -notmatch '@example\.invalid|"email"'
    no_phone_returned = $teacherJson -notmatch '"phone"|hidden'
    strict_source = $teacherA.diagnostics.authorizedRosterSource -eq 'COURSE_ENROLLMENT_CHAIN'
  }

  $failed = @($checks.Keys | Where-Object { $checks[$_] -ne $true })
  if ($failed.Count -gt 0) {
    throw "LOCAL_TEACHER_ROSTER_INVARIANT_FAILED:$($failed -join ',')"
  }

  $result = [pscustomobject]@{
    ok = $true
    mode = 'LOCAL_TEACHER_COURSE_ROSTER_INTERNAL_PREVIEW'
    checksPassed = $checks.Count
    fixtureRows = $fixtureCounts
    assignmentsCreated = $fixtureCounts.assignments
    offeringsQueriedByTeacherA = $teacherA.assignments.Count
    studentsVisibleByTeacherA = $teacherA.totals.enrolledStudentsCount
    crossTenantRowsBlocked = 1
    warnings = $warningCodes
    personalDataMinimized = $true
    legacyFallbackUsed = $false
    remoteSupabaseUsed = $false
  }
} finally {
  Invoke-LocalSqlFile $cleanup
}

$afterCleanup = Get-FixtureCounts
$remaining = @($afterCleanup.psobject.Properties | Where-Object { [int]$_.Value -ne 0 })
if ($remaining.Count -gt 0) {
  throw "LOCAL_TEACHER_ROSTER_CLEANUP_FAILED:$($remaining.Name -join ',')"
}

$result | Add-Member -NotePropertyName rowsBefore -NotePropertyValue $before
$result | Add-Member -NotePropertyName rowsAfterCleanup -NotePropertyValue $afterCleanup
$result | ConvertTo-Json -Depth 8
