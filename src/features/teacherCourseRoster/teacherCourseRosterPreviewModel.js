const VALID_STATES = new Set(['LOADING', 'READY', 'EMPTY', 'PARTIAL', 'BLOCKED', 'ERROR'])

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function clean(value) {
  return String(value ?? '').trim()
}

function mapSchedule(row = {}) {
  return {
    dayOfWeek: Number(row.dayOfWeek),
    startTime: clean(row.startTime),
    endTime: clean(row.endTime),
    shift: clean(row.shift),
    classroom: clean(row.classroom),
    modality: clean(row.modality),
    scheduleStatus: clean(row.scheduleStatus),
  }
}

function mapStudent(row = {}) {
  return {
    courseEnrollmentId: clean(row.courseEnrollmentId),
    studentCareerEnrollmentId: clean(row.studentCareerEnrollmentId),
    studentRecordId: clean(row.studentRecordId),
    studentId: clean(row.studentId),
    studentDisplayName: clean(row.studentDisplayName),
    studentCareerStatus: clean(row.studentCareerStatus),
    courseEnrollmentType: clean(row.courseEnrollmentType),
    courseEnrollmentStatus: clean(row.courseEnrollmentStatus),
    enrolledAt: clean(row.enrolledAt),
  }
}

function mapAssignment(row = {}) {
  return {
    teachingAssignmentId: clean(row.teachingAssignmentId),
    courseOfferingId: clean(row.courseOfferingId),
    subjectId: clean(row.subjectId),
    subjectCode: clean(row.subjectCode),
    subjectName: clean(row.subjectName),
    careerId: clean(row.careerId),
    careerName: clean(row.careerName),
    studyPlanId: clean(row.studyPlanId),
    studyPlanName: clean(row.studyPlanName),
    academicYearId: clean(row.academicYearId),
    academicYearLabel: clean(row.academicYearLabel),
    academicTermId: clean(row.academicTermId),
    academicTermLabel: clean(row.academicTermLabel),
    yearLevel: Number(row.yearLevel) || null,
    commission: clean(row.commission),
    modality: clean(row.modality),
    teacherRole: clean(row.teacherRole),
    weeklyHours: Number(row.weeklyHours) || 0,
    assignmentStatus: clean(row.assignmentStatus),
    offeringStatus: clean(row.offeringStatus),
    validFrom: clean(row.validFrom),
    validTo: clean(row.validTo),
    schedules: asArray(row.schedules).map(mapSchedule),
    assignedTeachers: asArray(row.assignedTeachers).map((teacher) => ({
      teacherId: clean(teacher.teacherId),
      teacherName: clean(teacher.teacherName),
      role: clean(teacher.role),
    })),
    roster: asArray(row.roster).map(mapStudent),
  }
}

export function buildTeacherCourseRosterPreviewModel(rawData) {
  const raw = rawData && typeof rawData === 'object' ? rawData : {}
  const status = VALID_STATES.has(raw.status) ? raw.status : 'ERROR'

  return {
    source: clean(raw.source) || 'structured_teacher_course_roster',
    actorMode: clean(raw.actorMode),
    status,
    teacher: raw.teacher ? {
      teacherId: clean(raw.teacher.teacherId),
      profileId: clean(raw.teacher.profileId),
      teacherRecordId: clean(raw.teacher.teacherRecordId),
      institutionId: clean(raw.teacher.institutionId),
      displayName: clean(raw.teacher.displayName),
      structuredIdentityStatus: clean(raw.teacher.structuredIdentityStatus),
    } : null,
    teacherOptions: asArray(raw.teacherOptions).map((teacher) => ({
      teacherId: clean(teacher.teacherId),
      displayName: clean(teacher.displayName),
      activeAssignmentsCount: Number(teacher.activeAssignmentsCount) || 0,
    })),
    assignments: asArray(raw.assignments).map(mapAssignment),
    totals: {
      assignedOfferingsCount: Number(raw.totals?.assignedOfferingsCount) || 0,
      activeOfferingsCount: Number(raw.totals?.activeOfferingsCount) || 0,
      enrolledStudentsCount: Number(raw.totals?.enrolledStudentsCount) || 0,
      offeringsWithoutStudentsCount: Number(raw.totals?.offeringsWithoutStudentsCount) || 0,
      assignmentsWithoutScheduleCount: Number(raw.totals?.assignmentsWithoutScheduleCount) || 0,
      structuredRosterCoveragePercent: Number(raw.totals?.structuredRosterCoveragePercent) || 0,
    },
    warnings: asArray(raw.warnings).map((warning) => ({
      code: clean(warning.code),
      count: Number(warning.count) || 0,
      sourceType: clean(warning.sourceType),
      safeForOfficialRoster: warning.safeForOfficialRoster === true,
      safeForInternalComparison: warning.safeForInternalComparison === true,
    })),
    diagnostics: {
      authorizedRosterSource: clean(raw.diagnostics?.authorizedRosterSource),
      legacyFallbackUsed: raw.diagnostics?.legacyFallbackUsed === true,
      legacyFallbackAvailable: raw.diagnostics?.legacyFallbackAvailable === true,
      legacyEstimatedStudentsCount: Number(raw.diagnostics?.legacyEstimatedStudentsCount) || 0,
      legacyStructuredDifference: Number(raw.diagnostics?.legacyStructuredDifference) || 0,
      invalidCareerLinkEnrollments: Number(raw.diagnostics?.invalidCareerLinkEnrollments) || 0,
      missingStudentRecordEnrollments: Number(raw.diagnostics?.missingStudentRecordEnrollments) || 0,
      assignmentsWithoutCourseOffering: Number(raw.diagnostics?.assignmentsWithoutCourseOffering) || 0,
      crossTenantRelationsDetected: Number(raw.diagnostics?.crossTenantRelationsDetected) || 0,
      personalDataFieldsReturned: asArray(raw.diagnostics?.personalDataFieldsReturned).map(clean),
    },
  }
}
