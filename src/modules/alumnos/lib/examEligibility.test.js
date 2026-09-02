import { describe, expect, it } from 'vitest'
import {
  getExamEnrollmentEligibility,
  getLatestAcademicStatusForSubject,
  normalizeAcademicStatus,
} from './examEligibility.js'

describe('examEligibility', () => {
  it('normaliza condiciones academicas institucionales', () => {
    expect(normalizeAcademicStatus('Regular')).toBe('regular')
    expect(normalizeAcademicStatus('Promocionada')).toBe('promocionado')
    expect(normalizeAcademicStatus('Aprobada')).toBe('approved')
    expect(normalizeAcademicStatus('Cursando')).toBe('pending')
  })

  it('habilita mesa regular solo con condicion regular', () => {
    const exam = {
      id: 'exam-1',
      subject_id: 'ING13',
      program_id: 'Profesorado de Ingles',
    }
    const enrollments = [{
      id: 'enrollment-1',
      relational_id: 'rel-enrollment-1',
      subject_id: 'ING13',
      program_id: 'Profesorado de Ingles',
    }]
    const grades = [{
      id: 'grade-1',
      enrollment_id: 'enrollment-1',
      subject_enrollment_id: 'rel-enrollment-1',
      subject_id: 'ING13',
      program_id: 'Profesorado de Ingles',
      academic_status: 'regular',
      updated_at: '2026-08-01T10:00:00.000Z',
    }]

    expect(getLatestAcademicStatusForSubject({
      subjectId: 'ING13',
      programId: 'Profesorado de Ingles',
      enrollments,
      grades,
    })).toBe('regular')
    expect(getExamEnrollmentEligibility({ exam, enrollments, grades })).toEqual(expect.objectContaining({
      canRegister: true,
      academicStatus: 'regular',
    }))
  })

  it('bloquea si la mesa no tiene carrera canonica', () => {
    const result = getExamEnrollmentEligibility({
      exam: {
        id: 'exam-1',
        subject_id: 'ING13',
        program_id: '',
      },
      grades: [{
        id: 'grade-1',
        subject_id: 'ING13',
        program_id: 'Profesorado de Ingles',
        academic_status: 'regular',
        updated_at: '2026-08-01T10:00:00.000Z',
      }],
    })

    expect(result).toEqual(expect.objectContaining({
      canRegister: false,
      academicStatus: 'pending',
    }))
  })

  it('habilita mesa sin carrera cuando la condicion tampoco tiene carrera, igual que la RPC', () => {
    const result = getExamEnrollmentEligibility({
      exam: {
        id: 'exam-1',
        subject_id: 'ING13',
        program_id: '',
      },
      grades: [{
        id: 'grade-1',
        subject_id: 'ING13',
        program_id: '',
        academic_status: 'regular',
        updated_at: '2026-08-01T10:00:00.000Z',
      }],
    })

    expect(result).toEqual(expect.objectContaining({
      canRegister: true,
      academicStatus: 'regular',
    }))
  })

  it('bloquea si la condicion regular pertenece a otra carrera', () => {
    const result = getExamEnrollmentEligibility({
      exam: {
        id: 'exam-1',
        subject_id: 'ING13',
        program_id: 'Profesorado de Ingles',
      },
      grades: [{
        id: 'grade-1',
        subject_id: 'ING13',
        program_id: 'Traductorado de Ingles',
        academic_status: 'regular',
        updated_at: '2026-08-01T10:00:00.000Z',
      }],
    })

    expect(result).toEqual(expect.objectContaining({
      canRegister: false,
      academicStatus: 'pending',
    }))
  })

  it('bloquea diferencias de mayusculas porque la RPC compara exacto', () => {
    const result = getExamEnrollmentEligibility({
      exam: {
        id: 'exam-1',
        subject_id: 'ING13',
        program_id: 'Profesorado de Ingles',
      },
      grades: [{
        id: 'grade-1',
        subject_id: 'ing13',
        program_id: 'Profesorado de Ingles',
        academic_status: 'regular',
        updated_at: '2026-08-01T10:00:00.000Z',
      }],
    })

    expect(result).toEqual(expect.objectContaining({
      canRegister: false,
      academicStatus: 'pending',
    }))
  })

  it('bloquea mesa cuando la condicion mas reciente no es regular', () => {
    const result = getExamEnrollmentEligibility({
      exam: {
        id: 'exam-1',
        subject_id: 'ING13',
        program_id: 'Profesorado de Ingles',
      },
      enrollments: [{
        id: 'enrollment-1',
        subject_id: 'ING13',
        program_id: 'Profesorado de Ingles',
      }],
      grades: [{
        id: 'grade-1',
        enrollment_id: 'enrollment-1',
        subject_id: 'ING13',
        program_id: 'Profesorado de Ingles',
        academic_status: 'libre',
        updated_at: '2026-08-01T10:00:00.000Z',
      }],
    })

    expect(result).toEqual(expect.objectContaining({
      canRegister: false,
      academicStatus: 'libre',
      reason: 'La condicion cargada es libre; esta mesa requiere regularidad.',
    }))
  })

  it('ignora notas pendientes sin condicion para no tapar la ultima condicion real', () => {
    const result = getLatestAcademicStatusForSubject({
      subjectId: 'ING13',
      programId: 'Profesorado de Ingles',
      enrollments: [{
        id: 'enrollment-1',
        subject_id: 'ING13',
        program_id: 'Profesorado de Ingles',
      }],
      grades: [{
        id: 'partial-1',
        enrollment_id: 'enrollment-1',
        subject_id: 'ING13',
        program_id: 'Profesorado de Ingles',
        grade_type: 'partial',
        academic_status: 'pending',
        updated_at: '2026-08-03T10:00:00.000Z',
      }, {
        id: 'final-condition',
        enrollment_id: 'enrollment-1',
        subject_id: 'ING13',
        program_id: 'Profesorado de Ingles',
        grade_type: 'final',
        academic_status: 'regular',
        updated_at: '2026-08-01T10:00:00.000Z',
      }],
    })

    expect(result).toBe('regular')
  })

  it('bloquea solamente el llamado inmediato siguiente por una ausencia', () => {
    const exams = [{
      id: 'exam-next',
      subject_id: 'ING13',
      program_id: 'Profesorado de Ingles',
      exam_call: 'PRIMER_LLAMADO',
      exam_date: '2026-08-10T14:00:00.000Z',
    }, {
      id: 'exam-later',
      subject_id: 'ING13',
      program_id: 'Profesorado de Ingles',
      exam_call: 'SEGUNDO_LLAMADO',
      exam_date: '2026-09-10T14:00:00.000Z',
    }]
    const grades = [{
      id: 'absence-1',
      subject_id: 'ING13',
      program_id: 'Profesorado de Ingles',
      academic_status: 'regular',
      ausente: true,
      fecha_ausencia: '30/07/2026',
      updated_at: '2026-07-30T14:00:00.000Z',
    }]

    const nextCall = getExamEnrollmentEligibility({ exam: exams[0], exams, grades })
    const laterCall = getExamEnrollmentEligibility({ exam: exams[1], exams, grades })

    expect(nextCall.canRegister).toBe(false)
    expect(nextCall.reason).toContain('mesa castigo')
    expect(laterCall.canRegister).toBe(true)
  })

  it('bloquea rendir si falta una correlativa aprobada, aunque la materia este regular', () => {
    const exam = { id: 'exam-geo3', subject_id: 'GEO3', program_id: 'Profesorado de Geografia' }
    const grades = [{
      id: 'grade-geo3',
      subject_id: 'GEO3',
      program_id: 'Profesorado de Geografia',
      academic_status: 'regular',
      updated_at: '2026-08-01T10:00:00.000Z',
    }, {
      id: 'grade-geo2',
      subject_id: 'GEO2',
      program_id: 'Profesorado de Geografia',
      academic_status: 'regular',
      updated_at: '2026-08-01T10:00:00.000Z',
    }]
    const prerequisites = [{
      subject_id: 'GEO3',
      prerequisite_subject_id: 'GEO2',
      prerequisite_subject: { id: 'GEO2', name: 'Geografia 2', canonical_program_id: 'Profesorado de Geografia' },
      requirement_type: 'regular',
    }]

    const result = getExamEnrollmentEligibility({ exam, grades, prerequisites })

    expect(result.canRegister).toBe(false)
    expect(result.reason).toBe('Correlativas pendientes para rendir esta mesa: Geografia 2. Deben figurar aprobadas.')
  })

  it('habilita rendir cuando todas las correlativas estan aprobadas', () => {
    const exam = { id: 'exam-geo3', subject_id: 'GEO3', program_id: 'Profesorado de Geografia' }
    const grades = [{
      id: 'grade-geo3',
      subject_id: 'GEO3',
      program_id: 'Profesorado de Geografia',
      academic_status: 'regular',
      updated_at: '2026-08-01T10:00:00.000Z',
    }, {
      id: 'grade-geo2',
      subject_id: 'GEO2',
      program_id: 'Profesorado de Geografia',
      academic_status: 'approved',
      updated_at: '2026-08-01T10:00:00.000Z',
    }]
    const prerequisites = [{
      subject_id: 'GEO3',
      prerequisite_subject_id: 'GEO2',
      prerequisite_subject: { id: 'GEO2', name: 'Geografia 2', canonical_program_id: 'Profesorado de Geografia' },
      requirement_type: 'regular',
    }]

    const result = getExamEnrollmentEligibility({ exam, grades, prerequisites })

    expect(result.canRegister).toBe(true)
  })

  it('bloquea la inscripcion si el alumno adeuda cuota', () => {
    const exam = { id: 'exam-1', subject_id: 'ING13', program_id: 'Profesorado de Ingles' }
    const grades = [{
      id: 'grade-1',
      subject_id: 'ING13',
      program_id: 'Profesorado de Ingles',
      academic_status: 'regular',
      updated_at: '2026-08-01T10:00:00.000Z',
    }]

    const result = getExamEnrollmentEligibility({ exam, grades, adeudaCuota: true })

    expect(result.canRegister).toBe(false)
    expect(result.reason).toBe('No podes inscribirte a mesas: el registro indica que adeudas el pago de la cuota.')
  })
})
