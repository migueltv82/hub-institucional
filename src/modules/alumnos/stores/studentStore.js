// ============================================================
// STUDENT STORE - Zustand State Management
// ============================================================

import { create } from 'zustand'

export const useStudentStore = create((set, get) => ({
  // ============================================================
  // STATE
  // ============================================================
  
  // Student data
  currentStudent: null,
  currentProgram: null,
  currentInstitution: null,
  
  // Lists
  programs: [],
  subjects: [],
  enrollments: [],
  grades: [],
  attendanceRecords: [],
  exams: [],
  examEnrollments: [],
  prerequisites: [],
  
  // Academic status
  academicStatus: null,
  accountStatus: null,
  
  // UI State
  loading: false,
  error: null,
  success: null,
  
  // Filters
  selectedSemester: 'all',
  filterStatus: 'active',
  
  // ============================================================
  // SETTERS
  // ============================================================
  
  setCurrentStudent: (student) => set({ currentStudent: student }),
  
  setCurrentProgram: (program) => set({ currentProgram: program }),
  
  setCurrentInstitution: (institution) => set({ currentInstitution: institution }),
  
  setPrograms: (programs) => set({ programs }),
  
  setSubjects: (subjects) => set({ subjects }),
  
  setEnrollments: (enrollments) => set({ enrollments }),
  
  setGrades: (grades) => set({ grades }),

  setAttendanceRecords: (attendanceRecords) => set({ attendanceRecords }),
  
  setExams: (exams) => set({ exams }),
  
  setExamEnrollments: (examEnrollments) => set({ examEnrollments }),
  
  setPrerequisites: (prerequisites) => set({ prerequisites }),
  
  setAcademicStatus: (academicStatus) => set({ academicStatus }),

  setAccountStatus: (accountStatus) => set({ accountStatus }),
  
  setLoading: (loading) => set({ loading }),
  
  setError: (error) => set({ error }),
  
  setSuccess: (success) => set({ success }),
  
  setSelectedSemester: (semester) => set({ selectedSemester: semester }),
  
  setFilterStatus: (status) => set({ filterStatus: status }),
  
  // ============================================================
  // BULK SETTERS (para múltiples datos)
  // ============================================================
  
  setStudentData: (data) => set(prev => ({
    ...prev,
    currentStudent: data.student || prev.currentStudent,
    currentProgram: data.program || prev.currentProgram,
    currentInstitution: data.institution || prev.currentInstitution
  })),
  
  setAcademicData: (data) => set(prev => ({
    ...prev,
    enrollments: data.enrollments || prev.enrollments,
    grades: data.grades || prev.grades,
    attendanceRecords: data.attendanceRecords || prev.attendanceRecords,
    academicStatus: data.status || prev.academicStatus,
    prerequisites: data.prerequisites || prev.prerequisites
  })),
  
  setExamData: (data) => set(prev => ({
    ...prev,
    exams: data.exams || prev.exams,
    examEnrollments: data.examEnrollments || prev.examEnrollments
  })),
  
  // ============================================================
  // MUTATIONS (Cambios de datos)
  // ============================================================
  
  addEnrollment: (enrollment) => set(prev => ({
    enrollments: [...prev.enrollments, enrollment]
  })),
  
  removeEnrollment: (enrollmentId) => set(prev => ({
    enrollments: prev.enrollments.filter(e => e.id !== enrollmentId)
  })),
  
  updateEnrollment: (enrollmentId, updates) => set(prev => ({
    enrollments: prev.enrollments.map(e =>
      e.id === enrollmentId ? { ...e, ...updates } : e
    )
  })),
  
  addGrade: (grade) => set(prev => ({
    grades: [...prev.grades, grade]
  })),
  
  updateGrade: (gradeId, updates) => set(prev => ({
    grades: prev.grades.map(g =>
      g.id === gradeId ? { ...g, ...updates } : g
    )
  })),
  
  addExamEnrollment: (examEnrollment) => set(prev => ({
    examEnrollments: [...prev.examEnrollments, examEnrollment]
  })),
  
  removeExamEnrollment: (examEnrollmentId) => set(prev => ({
    examEnrollments: prev.examEnrollments.filter(e => e.id !== examEnrollmentId)
  })),
  
  // ============================================================
  // GETTERS (Selectors)
  // ============================================================
  
  getEnrollmentsByStatus: (status) => {
    const { enrollments } = get()
    return enrollments.filter(e => e.status === status)
  },
  
  getSubjectsByProgram: (programId) => {
    const { subjects } = get()
    return subjects.filter(s => s.program_id === programId)
  },
  
  getSubjectsBySemester: (semester) => {
    const { subjects } = get()
    return subjects.filter(s => s.semester === semester)
  },
  
  getGradesByEnrollment: (enrollmentId) => {
    const { grades } = get()
    return grades.filter(g => g.enrollment_id === enrollmentId)
  },
  
  getPrerequisitesBySubject: (subjectId) => {
    const { prerequisites } = get()
    return prerequisites.filter(p => p.subject_id === subjectId)
  },
  
  getExamsBySubject: (subjectId) => {
    const { exams } = get()
    return exams.filter(e => e.subject_id === subjectId)
  },
  
  // ============================================================
  // CALCULATIONS
  // ============================================================
  
  calculateAverageGrade: () => {
    const { grades } = get()
    const finalGrades = grades
      .filter(g => g.grade_type === 'final' && (g.score ?? g.grade_value) !== null && (g.score ?? g.grade_value) !== undefined)
      .map(g => Number(g.score ?? g.grade_value))
      .filter(Number.isFinite)
    
    if (finalGrades.length === 0) return 0
    
    const sum = finalGrades.reduce((a, b) => a + b, 0)
    return Math.round((sum / finalGrades.length) * 100) / 100
  },
  
  calculateCompletedCredits: (programId) => {
    const { enrollments, subjects } = get()
    
    return enrollments
      .filter(e => e.status === 'completed' && e.program_id === programId)
      .reduce((sum, e) => {
        const subject = subjects.find(s =>
          s.id === e.subject_id ||
          s.subject_id === e.subject_id ||
          s.canonical_subject_id === e.subject_id
        )
        return sum + (subject?.credits || 0)
      }, 0)
  },
  
  calculateProgressPercentage: (programId) => {
    const { enrollments, subjects } = get()
    
    const totalSubjects = subjects.length
    const completedCount = enrollments.filter(e =>
      e.status === 'completed' && e.program_id === programId
    ).length
    
    if (totalSubjects === 0) return 0
    
    return Math.round((completedCount / totalSubjects) * 100)
  },
  
  // ============================================================
  // RESET
  // ============================================================
  
  reset: () => set({
    currentStudent: null,
    currentProgram: null,
    currentInstitution: null,
    programs: [],
    subjects: [],
    enrollments: [],
    grades: [],
    attendanceRecords: [],
    exams: [],
    examEnrollments: [],
    prerequisites: [],
    academicStatus: null,
    accountStatus: null,
    loading: false,
    error: null,
    success: null,
    selectedSemester: 'all',
    filterStatus: 'active'
  }),
  
  clearError: () => set({ error: null }),
  
  clearSuccess: () => set({ success: null })
}))

export const studentStore = useStudentStore

export default useStudentStore
