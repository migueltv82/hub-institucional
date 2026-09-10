import { describe, expect, it } from 'vitest'
import { mapAcademicRelationalRowsToSnapshot } from './mapAcademicRelationalRowsToSnapshot.js'
import { buildRegularExamInputFromWorkspaceSnapshot } from '../comparison/buildRegularExamInputFromWorkspaceSnapshot.js'
import { academicRelationalSchemaFixture } from './__fixtures__/academicRelationalSchema.fixture.js'

function buildInputFromFixture(overrides = {}) {
  const { snapshot } = mapAcademicRelationalRowsToSnapshot({ ...academicRelationalSchemaFixture, ...overrides })
  return buildRegularExamInputFromWorkspaceSnapshot(snapshot)
}

describe('mapAcademicRelationalRowsToSnapshot', () => {
  it('institucion sin datos en ninguna tabla devuelve arrays vacios en el snapshot', () => {
    const { snapshot, counts } = mapAcademicRelationalRowsToSnapshot({})

    expect(snapshot.docentes).toEqual([])
    expect(snapshot.horariosDocentes).toEqual([])
    expect(snapshot.docenteMateria).toEqual([])
    expect(snapshot.planesEstudio).toEqual([])
    expect(snapshot.correlatividades).toEqual([])
    expect(snapshot.alumnos).toEqual([])
    expect(Object.values(counts).every((count) => count === 0)).toBe(true)
  })

  it('docente con horas cátedra explicitas no genera bloques de horario inferidos', () => {
    const input = buildInputFromFixture()
    const teacher1 = input.docentes.find((docente) => docente.id === 'teacher-1')

    expect(teacher1.horasCatedra).toBe(10)
    expect(teacher1.horasCatedraSource).toBe('TEACHING_HOURS_EXPLICIT')
  })

  it('docente sin horas explicitas infiere desde course_schedules (recorta segundos de starts_at/ends_at)', () => {
    const input = buildInputFromFixture()
    const teacher2 = input.docentes.find((docente) => docente.id === 'teacher-2')

    expect(teacher2.horasCatedraSource).toBe('TEACHING_HOURS_INFERRED_FROM_SCHEDULE')
    expect(teacher2.horasCatedra).toBeGreaterThan(0)
  })

  it('weekday numerico se traduce a dia en español, no al indice de Date.getDay()', () => {
    const { snapshot } = mapAcademicRelationalRowsToSnapshot(academicRelationalSchemaFixture)
    const lunes = snapshot.horariosDocentes.find((row) => row.docenteId === 'teacher-1' && row.dia === 'lunes')
    const martes = snapshot.horariosDocentes.find((row) => row.docenteId === 'teacher-1' && row.dia === 'martes')

    expect(lunes).toBeTruthy()
    expect(martes).toBeTruthy()
    expect(snapshot.horariosDocentes.some((row) => Number.isInteger(row.dia))).toBe(false)
  })

  it('docente con clases en 3 dias distintos termina con 3 diasAsistencia unicos', () => {
    const input = buildInputFromFixture()
    const teacher2 = input.docentes.find((docente) => docente.id === 'teacher-2')

    expect(new Set(teacher2.diasAsistencia).size).toBe(3)
  })

  it('materia sin subject_prerequisites no genera fila en correlatividades', () => {
    const { snapshot } = mapAcademicRelationalRowsToSnapshot(academicRelationalSchemaFixture)

    expect(snapshot.correlatividades.some((row) => row.materia === 'ING03')).toBe(false)
  })

  it('subject_prerequisites con status inactive se excluye', () => {
    const { snapshot } = mapAcademicRelationalRowsToSnapshot({
      ...academicRelationalSchemaFixture,
      subject_prerequisites: [
        { id: 'req-2', institution_id: 'inst-1', target_plan_subject_id: 'sps-ing03', prerequisite_plan_subject_id: 'sps-ing01', status: 'inactive' },
      ],
    })

    expect(snapshot.correlatividades.some((row) => row.materia === 'ING03')).toBe(false)
  })

  it('correlatividades activas resuelven por codigo de materia, no por uuid', () => {
    const { snapshot } = mapAcademicRelationalRowsToSnapshot(academicRelationalSchemaFixture)
    const ing02 = snapshot.correlatividades.find((row) => row.materia === 'ING02')

    expect(ing02.correlativas).toEqual(['ING01'])
  })

  it('teacher_subject_assignments.status=active se traduce y resuelve titular activo', () => {
    const input = buildInputFromFixture()
    const ing01 = input.materias.find((materia) => materia.materia === 'ING01')

    expect(ing01.titularResolutionStatus).toBe('TITULAR_ACTIVO')
    expect(ing01.titularId).toBe('teacher-1')
  })

  it('acepta columnas compatibles con la UI para docentes y alumnos', () => {
    const { snapshot } = mapAcademicRelationalRowsToSnapshot({
      ...academicRelationalSchemaFixture,
      teacher_records: [{
        id: 'teacher-ui',
        institution_id: 'inst-1',
        external_code: 'DOC-UI',
        first_name: '',
        last_name: '',
        full_name: 'Docente UI',
        dni: '30999111',
        login_email: '30999111@docentes.inst-1.local',
        status: 'activo',
      }],
      teacher_subject_assignments: [{
        id: 'tsa-ui',
        institution_id: 'inst-1',
        plan_subject_id: 'sps-ing01',
        teacher_id: 'teacher-ui',
        role: 'titular',
        status: 'activo',
      }],
      student_records: [{
        id: 'student-ui',
        institution_id: 'inst-1',
        external_code: 'AL-UI',
        first_name: '',
        last_name: '',
        full_name: 'Alumno UI',
        dni: '40999111',
        email: 'alumno.ui@example.com',
        status: 'activo',
        career: 'Tecnicatura UI',
        academic_year: '2',
      }],
      student_career_plans: [],
    })

    expect(snapshot.docentes[0]).toEqual(expect.objectContaining({
      nombre: 'Docente UI',
      dni: '30999111',
      email: '30999111@docentes.inst-1.local',
      activo: true,
    }))
    expect(snapshot.docenteMateria[0]).toEqual(expect.objectContaining({
      docente: 'Docente UI',
      estado_asignacion: 'ACTIVO',
    }))
    expect(snapshot.alumnos[0]).toEqual(expect.objectContaining({
      full_name: 'Alumno UI',
      dni: '40999111',
      carrera: 'Tecnicatura UI',
      anio: '2',
    }))
  })

  it('alumno sin student_career_plans no lanza y queda con carrera/anio vacios', () => {
    const { snapshot } = mapAcademicRelationalRowsToSnapshot(academicRelationalSchemaFixture)
    const student2 = snapshot.alumnos.find((alumno) => alumno.id === 'student-2')

    expect(student2).toBeTruthy()
    expect(student2.carrera).toBe('')
    expect(student2.anio).toBe('')
    expect(student2.materias).toEqual([])
  })

  it('alumno con student_career_plans activo resuelve carrera', () => {
    const { snapshot } = mapAcademicRelationalRowsToSnapshot(academicRelationalSchemaFixture)
    const student1 = snapshot.alumnos.find((alumno) => alumno.id === 'student-1')

    expect(student1.carrera).toBe('PROFESORADO DE INGLES')
    expect(student1.anio).toBe(1)
  })

  it('study_plan_subjects.exam_required=false se mapea a requiereMesa false', () => {
    const { snapshot } = mapAcademicRelationalRowsToSnapshot(academicRelationalSchemaFixture)
    const ing03 = snapshot.planesEstudio.find((row) => row.materia === 'ING03')

    expect(ing03.requiereMesa).toBe(false)
  })

  it('docente con fila en teacher_exam_date_exclusions aparece en bloqueos', () => {
    const { snapshot } = mapAcademicRelationalRowsToSnapshot(academicRelationalSchemaFixture)
    const teacher3 = snapshot.docentes.find((docente) => docente.id === 'teacher-3')

    expect(teacher3.bloqueos).toEqual(['2026-10-15'])
    expect(snapshot.fechasBloqueadasDocente).toEqual([
      expect.objectContaining({
        docenteId: 'teacher-3',
        docenteNombre: 'Marta Diaz',
        date: '2026-10-15',
        scope: 'FULL_DAY',
        status: 'ACTIVE',
      }),
    ])
  })

  it('course_schedules sin docente resoluble se descarta en vez de romper', () => {
    const { snapshot } = mapAcademicRelationalRowsToSnapshot({
      ...academicRelationalSchemaFixture,
      course_schedules: [
        { id: 'sch-huerfano', institution_id: 'inst-1', plan_subject_id: 'sps-ing01', teacher_id: 'no-existe', weekday: 1, starts_at: '18:00:00', ends_at: '20:00:00' },
      ],
    })

    expect(snapshot.horariosDocentes).toEqual([])
  })
})
