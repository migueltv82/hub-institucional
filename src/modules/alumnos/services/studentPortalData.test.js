import { describe, expect, it } from 'vitest'
import { buildPrerequisites, buildSubjects, mapWorkspaceSnapshotToStudentStore } from './studentPortalData.js'

describe('studentPortalData', () => {
  it('prioriza rosterRows normalizados sobre el snapshot legacy', () => {
    const result = mapWorkspaceSnapshotToStudentStore({
      snapshot: {
        alumnos: [{
          email: 'otra@example.com',
          full_name: 'Otra Persona',
          carrera: 'Otra carrera',
        }],
        planesEstudio: [{
          carrera: 'Profesorado',
          materia: 'ING1',
          nombre: 'Ingles I',
          anio: 1,
        }],
        correlatividades: [],
        cronograma: [],
      },
      rosterRows: [{
        record_id: 'student-record-1',
        email: 'ana@example.com',
        nombre: 'Ana',
        apellido: 'Perez',
        full_name: 'Ana Perez',
        carrera: 'Profesorado',
      }, {
        record_id: 'student-record-2',
        email: 'ana@example.com',
        nombre: 'Ana',
        apellido: 'Perez',
        full_name: 'Ana Perez',
        carrera: 'Tecnicatura',
      }],
      user: {
        id: 'user-1',
        email: 'ana@example.com',
        nombre: 'Ana Perez',
      },
      activeInstitution: {
        id: 'inst-1',
        name: 'Instituto',
      },
    })

    expect(result.currentStudent).toEqual(expect.objectContaining({
      id: 'user-1',
      record_id: 'student-record-1',
      full_name: 'Ana Perez',
    }))
    expect(result.currentProgram).toEqual({
      id: 'Profesorado',
      program_id: 'Profesorado',
      canonical_program_id: 'Profesorado',
      slug: 'profesorado',
      name: 'Profesorado',
    })
    expect(result.programs).toEqual([
      { id: 'Profesorado', program_id: 'Profesorado', canonical_program_id: 'Profesorado', slug: 'profesorado', name: 'Profesorado' },
      { id: 'Tecnicatura', program_id: 'Tecnicatura', canonical_program_id: 'Tecnicatura', slug: 'tecnicatura', name: 'Tecnicatura' },
    ])
    expect(result.subjects).toEqual([
      expect.objectContaining({
        code: 'ING1',
        carrera: 'Profesorado',
      }),
    ])
  })

  it('lee el semestre/anio de la materia desde anio_cursada (columna real de plan_estudios)', () => {
    const result = mapWorkspaceSnapshotToStudentStore({
      snapshot: {
        alumnos: [{
          email: 'yamil@example.com',
          full_name: 'Yamil Abdelhamid Campos',
          carrera: 'PROFESORADO DE INGLES',
        }],
        planesEstudio: [{
          carrera: 'PROFESORADO DE INGLES',
          materia: 'ING14',
          nombre: 'Sujeto de la Educacion Secundaria',
          anio_cursada: 4,
        }],
        correlatividades: [],
        cronograma: [],
      },
      user: {
        id: 'user-1',
        email: 'yamil@example.com',
        nombre: 'Yamil Abdelhamid Campos',
      },
      activeInstitution: {
        id: 'inst-1',
        name: 'Instituto',
      },
    })

    expect(result.subjects[0]).toEqual(expect.objectContaining({
      code: 'ING14',
      semester: 4,
    }))
  })

  it('muestra el nombre de materia cuando el plan viene con materia_nombre', () => {
    const result = mapWorkspaceSnapshotToStudentStore({
      snapshot: {
        alumnos: [{
          email: 'ana@example.com',
          full_name: 'Ana Perez',
          carrera: 'PROFESORADO DE INGLES',
        }],
        planesEstudio: [{
          carrera: 'PROFESORADO DE INGLES',
          materia_codigo: 'ING06',
          materia_nombre: 'FONETICA Y FONOLOGIA INGLESA I',
          anio_cursada: 1,
        }],
        correlatividades: [],
        cronograma: [],
      },
      user: {
        id: 'user-1',
        email: 'ana@example.com',
        nombre: 'Ana Perez',
      },
      activeInstitution: {
        id: 'inst-1',
        name: 'Instituto',
      },
    })

    expect(result.subjects[0]).toEqual(expect.objectContaining({
      code: 'ING06',
      name: 'FONETICA Y FONOLOGIA INGLESA I',
    }))
  })

  it('resuelve la carrera del alumno contra el nombre canonico del plan de estudios', () => {
    const result = mapWorkspaceSnapshotToStudentStore({
      snapshot: {
        planesEstudio: [{
          carrera: 'Tecnico Superior en Turismo',
          materia: 'TUR09',
          nombre: 'Trabajo de campo turistico',
          anio: 1,
        }],
        correlatividades: [],
        cronograma: [{
          carrera: 'Turismo',
          materia: 'TUR09',
          nombreMateria: 'Trabajo de campo turistico',
          fechaIso: '2026-07-13T08:00:00.000Z',
          estado: 'confirmada',
        }],
      },
      rosterRows: [{
        record_id: 'student-record-3',
        email: 'turismo@example.com',
        nombre: 'Ana',
        apellido: 'Turismo',
        full_name: 'Ana Turismo',
        carrera: 'Turismo',
      }],
      user: {
        id: 'user-3',
        email: 'turismo@example.com',
        nombre: 'Ana Turismo',
      },
      activeInstitution: {
        id: 'inst-1',
        name: 'Instituto',
      },
    })

    expect(result.currentProgram).toEqual({
      id: 'Tecnico Superior en Turismo',
      program_id: 'Tecnico Superior en Turismo',
      canonical_program_id: 'Tecnico Superior en Turismo',
      slug: 'tecnico-superior-en-turismo',
      name: 'Tecnico Superior en Turismo',
    })
    expect(result.programs).toEqual([
      {
        id: 'Tecnico Superior en Turismo',
        program_id: 'Tecnico Superior en Turismo',
        canonical_program_id: 'Tecnico Superior en Turismo',
        slug: 'tecnico-superior-en-turismo',
        name: 'Tecnico Superior en Turismo',
      },
    ])
    expect(result.subjects).toEqual([
      expect.objectContaining({
        code: 'TUR09',
        carrera: 'Tecnico Superior en Turismo',
      }),
    ])
    expect(result.exams).toEqual([
      expect.objectContaining({
        subject_name: 'Trabajo de campo turistico',
      }),
    ])
  })

  it('muestra una mesa confirmada con fecha display si la materia pertenece a la carrera del alumno', () => {
    const result = mapWorkspaceSnapshotToStudentStore({
      snapshot: {
        alumnos: [{
          email: 'yamil@example.com',
          full_name: 'Yamil Abdelhamid Campos',
          carrera: 'PROFESORADO DE INGLES',
        }],
        planesEstudio: [{
          carrera: 'PROFESORADO DE INGLES',
          materia: 'ING06',
          nombre: 'FONETICA Y FONOLOGIA INGLESA I',
          anio: 1,
        }],
        correlatividades: [],
        cronograma: [{
          id: 'mesa-fonetica-1-2026-08-26',
          carrera: 'Carrera',
          materia: 'ING06',
          nombreMateria: 'FONETICA Y FONOLOGIA INGLESA I',
          fecha: '26/08/2026',
          inicio: '19:00',
          estado: 'Confirmada',
          exam_type: 'regular',
          inscription_mode: 'student_self_service',
        }, {
          id: 'mesa-fonetica-pendiente',
          carrera: 'PROFESORADO DE INGLES',
          materia: 'ING06',
          nombreMateria: 'FONETICA Y FONOLOGIA INGLESA I',
          fecha: '27/08/2026',
          inicio: '19:00',
          estado: 'pendiente',
        }],
      },
      user: {
        id: 'user-1',
        email: 'yamil@example.com',
        nombre: 'Yamil Abdelhamid Campos',
      },
      activeInstitution: {
        id: 'inst-1',
        name: 'Instituto',
      },
    })

    expect(result.exams).toEqual([
      expect.objectContaining({
        id: 'mesa-fonetica-1-2026-08-26',
        subject_id: 'ING06',
        program_id: 'PROFESORADO DE INGLES',
        subject_name: 'FONETICA Y FONOLOGIA INGLESA I',
        exam_date: '2026-08-26T19:00:00',
        date: '2026-08-26T19:00:00',
      }),
    ])
  })

  it('muestra mesas completas del motor nuevo si ya fueron publicadas en cronograma', () => {
    const result = mapWorkspaceSnapshotToStudentStore({
      snapshot: {
        alumnos: [{
          email: 'yamil@example.com',
          full_name: 'Yamil Abdelhamid Campos',
          carrera: 'PROFESORADO DE INGLES',
        }],
        planesEstudio: [{
          carrera: 'PROFESORADO DE INGLES',
          materia: 'ING06',
          nombre: 'FONETICA Y FONOLOGIA INGLESA I',
          anio: 1,
        }],
        correlatividades: [],
        cronograma: [{
          id: 'mesa-fonetica-tribunal-complete',
          carrera: 'PROFESORADO DE INGLES',
          materiaId: 'ING06',
          materiaMesa: 'FONETICA Y FONOLOGIA INGLESA I',
          fechaSugerida: '2026-08-26',
          inicio: '19:00',
          estado: 'TRIBUNAL_COMPLETE',
        }],
      },
      user: {
        id: 'user-1',
        email: 'yamil@example.com',
        nombre: 'Yamil Abdelhamid Campos',
      },
      activeInstitution: {
        id: 'inst-1',
        name: 'Instituto',
      },
    })

    expect(result.exams).toEqual([
      expect.objectContaining({
        id: 'mesa-fonetica-tribunal-complete',
        subject_id: 'ING06',
        subject_name: 'FONETICA Y FONOLOGIA INGLESA I',
        exam_date: '2026-08-26T19:00:00',
      }),
    ])
  })

  it('oculta mesas especiales del portal de autoinscripcion del alumno', () => {
    const result = mapWorkspaceSnapshotToStudentStore({
      snapshot: {
        planesEstudio: [{
          carrera: 'Profesorado',
          materia: 'ING1',
          nombre: 'Ingles I',
          anio: 1,
        }, {
          carrera: 'Profesorado',
          materia: 'PRA1',
          nombre: 'Practica Profesional I',
          anio: 4,
        }],
        correlatividades: [],
        cronograma: [{
          id: 'regular-1',
          carrera: 'Profesorado',
          materia: 'ING1',
          nombreMateria: 'Ingles I',
          fechaIso: '2026-07-13',
          inicio: '18:30',
          exam_type: 'regular',
          inscription_mode: 'student_self_service',
          estado: 'confirmada',
        }, {
          id: 'special-1',
          carrera: 'Profesorado',
          materia: 'PRA1',
          nombreMateria: 'Practica Profesional I',
          fechaIso: '2026-07-14',
          inicio: '10:00',
          fin: '12:00',
          exam_type: 'special',
          inscription_mode: 'admin_only',
          estado: 'confirmada',
        }],
      },
      rosterRows: [{
        record_id: 'student-record-1',
        email: 'ana@example.com',
        full_name: 'Ana Perez',
        carrera: 'Profesorado',
      }],
      user: {
        id: 'user-1',
        email: 'ana@example.com',
        nombre: 'Ana Perez',
      },
      activeInstitution: {
        id: 'inst-1',
        name: 'Instituto',
      },
    })

    expect(result.exams).toEqual([
      expect.objectContaining({
        id: 'regular-1',
        subject_name: 'Ingles I',
        inscription_mode: 'student_self_service',
      }),
    ])
  })

  it('muestra horarios de las materias activas aunque sean de distintos anos', () => {
    const result = mapWorkspaceSnapshotToStudentStore({
      snapshot: {
        planesEstudio: [{
          carrera: 'Profesorado',
          materia: 'ING1',
          nombre: 'Ingles I',
          anio: 1,
        }, {
          carrera: 'Profesorado',
          materia: 'HIS2',
          nombre: 'Historia II',
          anio: 2,
        }, {
          carrera: 'Profesorado',
          materia: 'GEO3',
          nombre: 'Geografia III',
          anio: 3,
        }],
        horariosDocentes: [{
          profesor: 'Ana Diaz',
          carrera: 'Profesorado',
          materia: 'ING1',
          dia: 'Lunes',
          inicio: '08:00',
          fin: '10:00',
          aula: 'A1',
        }, {
          profesor: 'Bruno Lopez',
          carrera: 'Profesorado',
          materia: 'HIS2',
          dia: 'Martes',
          inicio: '10:00',
          fin: '12:00',
          aula: 'A2',
        }, {
          profesor: 'Carla Ruiz',
          carrera: 'Profesorado',
          materia: 'GEO3',
          dia: 'Miercoles',
          inicio: '14:00',
          fin: '16:00',
          aula: 'A3',
        }],
        estadoAcademico: [{
          email: 'ana@example.com',
          carrera: 'Profesorado',
          materia: 'ING1',
          estado: 'cursando',
        }, {
          email: 'ana@example.com',
          carrera: 'Profesorado',
          materia: 'HIS2',
          estado: 'regular',
        }, {
          email: 'ana@example.com',
          carrera: 'Profesorado',
          materia: 'GEO3',
          estado: 'aprobada',
        }],
      },
      rosterRows: [{
        record_id: 'student-record-1',
        email: 'ana@example.com',
        nombre: 'Ana',
        apellido: 'Perez',
        full_name: 'Ana Perez',
        carrera: 'Profesorado',
        anio: '1',
      }],
      user: {
        id: 'user-1',
        email: 'ana@example.com',
        nombre: 'Ana Perez',
      },
      activeInstitution: {
        id: 'inst-1',
        name: 'Instituto',
      },
    })

    expect(result.classSchedules).toEqual([
      expect.objectContaining({
        subject_code: 'ING1',
        subject_name: 'Ingles I',
        subject_year: '1',
      }),
      expect.objectContaining({
        subject_code: 'HIS2',
        subject_name: 'Historia II',
        subject_year: '2',
      }),
    ])
  })

  it('si no hay materias activas usa el horario de la carrera y ano del alumno', () => {
    const result = mapWorkspaceSnapshotToStudentStore({
      snapshot: {
        planesEstudio: [{
          carrera: 'Profesorado',
          materia: 'ING1',
          nombre: 'Ingles I',
          anio: 1,
        }, {
          carrera: 'Profesorado',
          materia: 'HIS2',
          nombre: 'Historia II',
          anio: 2,
        }],
        horariosDocentes: [{
          profesor: 'Ana Diaz',
          carrera: 'Profesorado',
          materia: 'ING1',
          dia: 'Lunes',
          inicio: '08:00',
          fin: '10:00',
        }, {
          profesor: 'Bruno Lopez',
          carrera: 'Profesorado',
          materia: 'HIS2',
          dia: 'Martes',
          inicio: '10:00',
          fin: '12:00',
        }],
      },
      rosterRows: [{
        record_id: 'student-record-1',
        email: 'ana@example.com',
        full_name: 'Ana Perez',
        carrera: 'Profesorado',
        anio: '1',
      }],
      user: {
        id: 'user-1',
        email: 'ana@example.com',
        nombre: 'Ana Perez',
      },
      activeInstitution: {
        id: 'inst-1',
        name: 'Instituto',
      },
    })

    expect(result.classSchedules).toEqual([
      expect.objectContaining({
        subject_code: 'ING1',
        subject_name: 'Ingles I',
        subject_year: '1',
      }),
    ])
  })

  it('ignora inscripciones y mesas de otros alumnos dentro del snapshot', () => {
    const result = mapWorkspaceSnapshotToStudentStore({
      snapshot: {
        planesEstudio: [{
          carrera: 'Profesorado',
          materia: 'ING1',
          nombre: 'Ingles I',
          anio: 1,
        }, {
          carrera: 'Profesorado',
          materia: 'HIS2',
          nombre: 'Historia II',
          anio: 2,
        }],
        enrollments: [{
          id: 'enrollment-other',
          profile_id: 'user-2',
          email: 'bruno@example.com',
          program_id: 'profesorado',
          subject_id: 'profesorado:his2',
          status: 'active',
        }, {
          id: 'enrollment-ana',
          profile_id: 'user-1',
          email: 'ana@example.com',
          program_id: 'profesorado',
          subject_id: 'profesorado:ing1',
          status: 'active',
        }],
        grades: [{
          id: 'grade-other',
          enrollment_id: 'enrollment-other',
          grade_type: 'final',
          score: 4,
        }, {
          id: 'grade-ana',
          enrollment_id: 'enrollment-ana',
          grade_type: 'final',
          score: 8,
        }],
        examEnrollments: [{
          id: 'exam-other',
          profile_id: 'user-2',
          email: 'bruno@example.com',
          exam_session_id: 'exam-1',
          status: 'registered',
        }, {
          id: 'exam-ana',
          profile_id: 'user-1',
          email: 'ana@example.com',
          exam_session_id: 'exam-2',
          status: 'registered',
        }],
      },
      rosterRows: [{
        record_id: 'student-record-1',
        email: 'ana@example.com',
        full_name: 'Ana Perez',
        carrera: 'Profesorado',
      }],
      user: {
        id: 'user-1',
        email: 'ana@example.com',
        nombre: 'Ana Perez',
      },
      activeInstitution: {
        id: 'inst-1',
        name: 'Instituto',
      },
    })

    expect(result.enrollments).toEqual([
      expect.objectContaining({
        id: 'enrollment-ana',
        subject_id: 'ING1',
        portal_subject_id: 'profesorado:ing1',
        program_id: 'Profesorado',
        status: 'active',
      }),
    ])
    expect(result.grades).toEqual([
      expect.objectContaining({
        id: 'grade-ana',
        enrollment_id: 'enrollment-ana',
        score: 8,
      }),
    ])
    expect(result.examEnrollments).toEqual([
      expect.objectContaining({
        id: 'exam-ana',
        exam_session_id: 'exam-2',
      }),
    ])
  })

  it('no convierte filas sin estado en materias cursando', () => {
    const result = mapWorkspaceSnapshotToStudentStore({
      snapshot: {
        planesEstudio: [{
          carrera: 'Profesorado',
          materia: 'ING1',
          nombre: 'Ingles I',
          anio: 1,
        }],
        estadoAcademico: [{
          email: 'ana@example.com',
          carrera: 'Profesorado',
          materia: 'ING1',
        }],
      },
      rosterRows: [{
        record_id: 'student-record-1',
        email: 'ana@example.com',
        full_name: 'Ana Perez',
        carrera: 'Profesorado',
      }],
      user: {
        id: 'user-1',
        email: 'ana@example.com',
        nombre: 'Ana Perez',
      },
      activeInstitution: {
        id: 'inst-1',
        name: 'Instituto',
      },
    })

    expect(result.enrollments).toEqual([
      expect.objectContaining({
        subject_id: 'ING1',
        portal_subject_id: 'profesorado:ing1',
        status: 'pending',
      }),
    ])
  })

  it('separa fecha de cursada, regularidad y final en el estado academico del alumno', () => {
    const result = mapWorkspaceSnapshotToStudentStore({
      snapshot: {
        planesEstudio: [{
          carrera: 'Profesorado',
          materia: 'ING1',
          nombre: 'Ingles I',
          anio: 1,
        }, {
          carrera: 'Profesorado',
          materia: 'ING2',
          nombre: 'Ingles II',
          anio: 1,
        }, {
          carrera: 'Profesorado',
          materia: 'ING3',
          nombre: 'Ingles III',
          anio: 2,
        }],
        estadoAcademico: [{
          email: 'ana@example.com',
          carrera: 'Profesorado',
          materia: 'ING1',
          estado: 'cursando',
          fecha: '2026-03-10',
        }, {
          email: 'ana@example.com',
          carrera: 'Profesorado',
          materia: 'ING2',
          estado: 'regular',
          fecha: '2026-07-30',
          anio_regularidad: '2026',
        }, {
          email: 'ana@example.com',
          carrera: 'Profesorado',
          materia: 'ING3',
          estado: 'aprobada',
          nota: 8,
          fecha: '2026-08-20',
        }],
      },
      rosterRows: [{
        record_id: 'student-record-1',
        email: 'ana@example.com',
        full_name: 'Ana Perez',
        carrera: 'Profesorado',
      }],
      user: {
        id: 'user-1',
        email: 'ana@example.com',
        nombre: 'Ana Perez',
      },
      activeInstitution: {
        id: 'inst-1',
        name: 'Instituto',
      },
    })

    expect(result.enrollments).toEqual(expect.arrayContaining([
      expect.objectContaining({
        subject_id: 'ING1',
        status: 'active',
        academic_status: 'pending',
        enrolled_at: null,
        final_date: null,
      }),
      expect.objectContaining({
        subject_id: 'ING2',
        academic_status: 'regular',
        regularity_date: '2026-07-30',
        regular_year: '2026',
        final_date: null,
      }),
    ]))
    expect(result.grades).toEqual(expect.arrayContaining([
      expect.objectContaining({
        subject_id: 'ING3',
        score: 8,
        graded_at: '2026-08-20',
        final_date: '2026-08-20',
        academic_status: 'approved',
      }),
    ]))
  })
})

describe('buildPrerequisites', () => {
  const planesEstudio = [
    { carrera: 'PROFESORADO DE INGLES', materia: 'DIDGRAL', nombre: 'Didactica General', anio: 1 },
    { carrera: 'PROFESORADO DE INGLES', materia: 'DIDING1', nombre: 'Didactica del Ingles I', anio: 2 },
    { carrera: 'PROFESORADO DE INGLES', materia: 'DIDING2', nombre: 'Didactica del Ingles II', anio: 3 },
  ]

  it('deriva la correlativa indirecta sola: solo hace falta cargar el eslabon directo en el Excel', () => {
    // El Excel solo trae la correlativa DIRECTA de cada materia -- no hay
    // ninguna fila para "Didactica del Ingles II requiere Didactica General".
    const correlatividades = [
      { carrera: 'PROFESORADO DE INGLES', materia: 'DIDING1', correlativas: 'DIDGRAL' },
      { carrera: 'PROFESORADO DE INGLES', materia: 'DIDING2', correlativas: 'DIDING1' },
    ]

    const subjects = buildSubjects(planesEstudio, 'PROFESORADO DE INGLES', ['PROFESORADO DE INGLES'])
    const prerequisites = buildPrerequisites(correlatividades, subjects, 'PROFESORADO DE INGLES', ['PROFESORADO DE INGLES'])

    const forDidIng1 = prerequisites.filter((entry) => entry.subject_id === 'DIDING1')
    expect(forDidIng1).toEqual([
      expect.objectContaining({ prerequisite_subject_id: 'DIDGRAL', requirement_type: 'regular' }),
    ])

    const forDidIng2 = prerequisites.filter((entry) => entry.subject_id === 'DIDING2')
    expect(forDidIng2).toEqual(expect.arrayContaining([
      expect.objectContaining({ prerequisite_subject_id: 'DIDING1', requirement_type: 'regular' }),
      expect.objectContaining({ prerequisite_subject_id: 'DIDGRAL', requirement_type: 'approved' }),
    ]))
    expect(forDidIng2).toHaveLength(2)
  })
})
