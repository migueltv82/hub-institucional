import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  fetchTeacherPortalData,
  mapWorkspaceSnapshotToTeacherPortal,
} from './teacherPortalData.js'

const mocks = vi.hoisted(() => ({
  fetchRelationalPreviewSetting: vi.fn(),
  fetchRelationalExamSnapshot: vi.fn(),
  fetchWorkspaceSnapshot: vi.fn(),
  fetchTeacherRecords: vi.fn(),
  fetchStudentRecords: vi.fn(),
}))

vi.mock('../../../services/relationalExamPreview.js', () => ({
  fetchRelationalPreviewSetting: mocks.fetchRelationalPreviewSetting,
  fetchRelationalExamSnapshot: mocks.fetchRelationalExamSnapshot,
}))

vi.mock('../../../services/workspaceSnapshot.js', () => ({
  createEmptyWorkspaceSnapshot: () => ({
    horariosDocentes: [],
    docenteMateria: [],
    disponibilidadDocente: [],
    cargaHorariaDocente: [],
    docentes: [],
    planesEstudio: [],
    correlatividades: [],
    alumnos: [],
    students: [],
    cronograma: [],
  }),
  fetchWorkspaceSnapshot: mocks.fetchWorkspaceSnapshot,
}))

vi.mock('../../../services/rosterRecords.js', () => ({
  fetchTeacherRecords: mocks.fetchTeacherRecords,
  fetchStudentRecords: mocks.fetchStudentRecords,
  mapTeacherRecordToSnapshotRow: (row) => row,
  mapStudentRecordToSnapshotRow: (row) => row,
}))

describe('teacherPortalData', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('usa teacherRows y studentRows normalizados cuando existen', () => {
    const result = mapWorkspaceSnapshotToTeacherPortal({
      snapshot: {
        horariosDocentes: [{
          profesor: 'Ana Diaz',
          carrera: 'Profesorado',
          materia: 'ING1',
          dia: 'Lunes',
          inicio: '08:00',
          fin: '10:00',
        }],
        cronograma: [{
          profesorTitular: 'Ana Diaz',
          carrera: 'Profesorado',
          materia: 'ING1',
          fechaIso: '2026-07-13T08:00:00.000Z',
          estado: 'confirmada',
        }],
        planesEstudio: [{
          carrera: 'Profesorado',
          materia: 'ING1',
          nombre: 'Ingles I',
          anio: '1',
        }],
      },
      teacherRows: [{
        record_id: 'teacher-record-1',
        email: '30111222@docentes.inst-1.local',
        full_name: 'Ana Diaz',
        nombre: 'Ana',
        apellido: 'Diaz',
        dni: '30111222',
        telefono: '3815551234',
      }],
      studentRows: [{
        record_id: 'student-record-1',
        email: 'ana@example.com',
        full_name: 'Ana Perez',
        carrera: 'Profesorado',
        dni: '30111222',
        legajo: 'A-15',
        anio: '1',
      }, {
        record_id: 'student-record-2',
        email: 'bruno@example.com',
        full_name: 'Bruno Lopez',
        carrera: 'Tecnicatura',
      }],
      user: {
        id: 'teacher-user-1',
        email: '30111222@docentes.inst-1.local',
        nombre: 'Ana Diaz',
      },
      activeInstitution: {
        id: 'inst-1',
        name: 'Instituto',
      },
    })

    expect(result.currentTeacher).toEqual(expect.objectContaining({
      id: 'teacher-user-1',
      record_id: 'teacher-record-1',
      full_name: 'Ana Diaz',
      matched: true,
    }))
    expect(result.teacherNames).toEqual(['Ana Diaz'])
    expect(result.students).toEqual([
      expect.objectContaining({
        email: 'ana@example.com',
        carrera: 'Profesorado',
      }),
    ])
    expect(result.schedules).toEqual([
      expect.objectContaining({
        materia: 'ING1',
        nombreMateria: 'Ingles I',
      }),
    ])
    expect(result.exams).toEqual([
      expect.objectContaining({
        materia: 'ING1',
        nombreMateria: 'Ingles I',
      }),
    ])
    expect(result.stats.students).toBe(1)
    expect(result.subjectStudentGroups).toEqual([
      expect.objectContaining({
        code: 'ING1',
        name: 'Ingles I',
        students: [],
        source: 'none',
        warnings: [],
      }),
    ])
    expect(result.stats.subjectStudents).toBe(0)
    expect(result.developmentWarnings).toEqual([])
    expect(result.developmentWarningDetails).toEqual([])
  })

  it('carga el snapshot relacional para instituciones habilitadas', async () => {
    mocks.fetchRelationalPreviewSetting.mockResolvedValue(true)
    mocks.fetchRelationalExamSnapshot.mockResolvedValue({
      snapshot: {
        docentes: [{ record_id: 'teacher-1', full_name: 'Ana Diaz', email: 'ana@docentes.local' }],
        horariosDocentes: [{
          docenteId: 'teacher-1',
          docente: 'Ana Diaz',
          carrera: 'Profesorado',
          materia: 'ING1',
          nombreMateria: 'Ingles I',
          dia: 'lunes',
          inicio: '08:00',
          fin: '10:00',
        }],
        planesEstudio: [{ carrera: 'Profesorado', materia: 'ING1', nombreMateria: 'Ingles I' }],
        alumnos: [{ full_name: 'Alumno Uno', carrera: 'Profesorado', email: 'alumno@example.com' }],
      },
    })
    mocks.fetchTeacherRecords.mockResolvedValue([{ record_id: 'teacher-1', full_name: 'Ana Diaz', email: 'ana@docentes.local' }])
    mocks.fetchStudentRecords.mockResolvedValue([{ full_name: 'Alumno Uno', carrera: 'Profesorado', email: 'alumno@example.com' }])

    const result = await fetchTeacherPortalData({
      user: { id: 'user-1', email: 'ana@docentes.local', nombre: 'Ana Diaz' },
      isRemoteSession: true,
      isSuperAdmin: false,
      activeInstitution: { id: 'inst-1', name: 'Instituto' },
    })

    expect(mocks.fetchWorkspaceSnapshot).not.toHaveBeenCalled()
    expect(mocks.fetchRelationalExamSnapshot).toHaveBeenCalledWith({ institutionId: 'inst-1' })
    expect(result.schedules).toEqual([
      expect.objectContaining({ materia: 'ING1', nombreMateria: 'Ingles I' }),
    ])
    expect(result.workspaceSnapshot.workspaceSource).toBe('academic-relational-schema')
  })

  it('muestra mesas finales del motor nuevo cuando el docente figura como titular', () => {
    const result = mapWorkspaceSnapshotToTeacherPortal({
      snapshot: {
        cronograma: [{
          id: 'mesa-ing06',
          carrera: 'PROFESORADO DE INGLES',
          anio: '1',
          materiaId: 'ING06',
          materiaMesa: 'FONETICA Y FONOLOGIA INGLESA I',
          fechaSugerida: '2026-08-26',
          inicio: '19:40',
          titular: 'CORBALAN MIGUEL',
          vocal1: 'VILLAGRA MIGUEL',
          vocal2: 'DONADIO MYRIAM',
          estado: 'TRIBUNAL_COMPLETE',
        }],
        planesEstudio: [{
          carrera: 'PROFESORADO DE INGLES',
          materia: 'ING06',
          nombre: 'FONETICA Y FONOLOGIA INGLESA I',
          anio: '1',
        }],
      },
      teacherRows: [{
        record_id: 'teacher-record-corbalan',
        email: '29541016@docentes.inst-1.local',
        full_name: 'CORBALAN MIGUEL',
        dni: '29541016',
      }],
      studentRows: [],
      user: {
        id: 'teacher-user-corbalan',
        email: '29541016@docentes.inst-1.local',
        nombre: 'CORBALAN MIGUEL',
      },
      activeInstitution: {
        id: 'inst-1',
        name: 'Instituto',
      },
    })

    expect(result.exams).toEqual([
      expect.objectContaining({
        materia: 'ING06',
        materiaCodigo: 'ING06',
        nombreMateria: 'FONETICA Y FONOLOGIA INGLESA I',
        fechaIso: '2026-08-26',
        profesorTitular: 'CORBALAN MIGUEL',
        estado: 'confirmada',
      }),
    ])
    expect(result.stats.exams).toBe(1)
    expect(result.stats.confirmedExams).toBe(1)
  })

  it('no infiere alumnos por carrera y anio cuando falta inscripcion exacta a la materia', () => {
    const result = mapWorkspaceSnapshotToTeacherPortal({
      snapshot: {
        horariosDocentes: [{
          profesor: 'Ana Diaz',
          carrera: 'Profesorado',
          materia: 'ING1',
          dia: 'Lunes',
          inicio: '08:00',
          fin: '10:00',
        }],
        planesEstudio: [{
          carrera: 'Profesorado',
          materia: 'ING1',
          nombre: 'Ingles I',
          anio: '1',
        }],
      },
      teacherRows: [{
        record_id: 'teacher-record-1',
        email: '30111222@docentes.inst-1.local',
        full_name: 'Ana Diaz',
        dni: '30111222',
      }],
      studentRows: [{
        email: 'ana@example.com',
        full_name: 'Ana Perez',
        carrera: 'Profesorado',
        anio: '1',
      }],
      user: {
        id: 'teacher-user-1',
        email: '30111222@docentes.inst-1.local',
        nombre: 'Ana Diaz',
      },
      activeInstitution: {
        id: 'inst-1',
        name: 'Instituto',
      },
    })

    expect(result.subjectStudentGroups).toEqual([
      expect.objectContaining({
        code: 'ING1',
        students: [],
        source: 'none',
      }),
    ])
    expect(result.stats.subjectStudents).toBe(0)
  })

  it('cruza inscripciones del alumno por student_record_id y carrera normalizada', () => {
    const result = mapWorkspaceSnapshotToTeacherPortal({
      snapshot: {
        horariosDocentes: [{
          profesor: 'CORBALAN MIGUEL',
          carrera: 'PROFESORADO DE INGLES',
          materia: 'ING16',
          dia: 'Lunes',
          inicio: '20:30',
          fin: '22:35',
        }],
        planesEstudio: [{
          carrera: 'PROFESORADO DE INGLES',
          materia: 'ING16',
          nombre: 'Fonetica y fonologia inglesa II',
          anio: '2',
        }],
        enrollments: [{
          student_id: 'student-auth-abdelamhind',
          student_record_id: 'student-record-abdelamhind',
          program_id: 'Profesorado de Ingles',
          subject_id: 'ING16',
          status: 'active',
        }],
      },
      teacherRows: [{
        record_id: 'teacher-record-1',
        email: '29541016@docentes.inst-1.local',
        full_name: 'CORBALAN MIGUEL',
        dni: '29541016',
      }],
      studentRows: [{
        record_id: 'student-record-abdelamhind',
        email: 'abdelamhind@example.com',
        full_name: 'Yamil Abdelamhind Campos',
        carrera: 'Profesorado de Ingles',
        anio: '2',
      }],
      user: {
        id: 'teacher-user-1',
        email: '29541016@docentes.inst-1.local',
        nombre: 'CORBALAN MIGUEL',
      },
      activeInstitution: {
        id: 'inst-1',
        name: 'Instituto',
      },
    })

    expect(result.students).toEqual([
      expect.objectContaining({ full_name: 'Yamil Abdelamhind Campos' }),
    ])
    expect(result.subjectStudentGroups).toEqual([
      expect.objectContaining({
        code: 'ING16',
        students: [expect.objectContaining({ full_name: 'Yamil Abdelamhind Campos' })],
        source: 'academic',
      }),
    ])
    expect(result.stats.subjectStudents).toBe(1)
  })

  it('cruza Fonetica I aunque la inscripcion del alumno llegue con subject_id legado', () => {
    const result = mapWorkspaceSnapshotToTeacherPortal({
      snapshot: {
        horariosDocentes: [{
          profesor: 'CORBALAN MIGUEL',
          carrera: 'PROFESORADO DE INGLES',
          materia: 'ING06',
          nombreMateria: 'FONETICA Y FONOLOGIA INGLESA I',
          dia: 'Jueves',
          inicio: '19:40',
          fin: '21:10',
        }],
        planesEstudio: [{
          carrera: 'PROFESORADO DE INGLES',
          materia: 'ING06',
          nombre: 'FONETICA Y FONOLOGIA INGLESA I',
          anio: '1',
        }],
        enrollments: [{
          student_id: 'student-auth-abdelamhind',
          student_record_id: 'student-record-abdelamhind',
          program_id: 'profesorado-de-ingles',
          subject_id: 'profesorado-de-ingles:ing06',
          status: 'active',
        }],
      },
      teacherRows: [{
        record_id: 'teacher-record-1',
        email: '29541016@docentes.inst-1.local',
        full_name: 'CORBALAN MIGUEL',
        dni: '29541016',
      }],
      studentRows: [{
        record_id: 'student-record-abdelamhind',
        email: 'abdelamhind@example.com',
        full_name: 'Yamil Abdelamhind Campos',
        carrera: 'PROFESORADO DE INGLES',
        anio: '1',
      }],
      user: {
        id: 'teacher-user-1',
        email: '29541016@docentes.inst-1.local',
        nombre: 'CORBALAN MIGUEL',
      },
      activeInstitution: {
        id: 'inst-1',
        name: 'Instituto',
      },
    })

    expect(result.subjectStudentGroups).toEqual([
      expect.objectContaining({
        code: 'ING06',
        students: [expect.objectContaining({ full_name: 'Yamil Abdelamhind Campos' })],
      }),
    ])
    expect(result.stats.subjectStudents).toBe(1)
  })

  it('cruza inscripciones normalizadas desde el portal alumno con campos canonicos', () => {
    const result = mapWorkspaceSnapshotToTeacherPortal({
      snapshot: {
        horariosDocentes: [{
          profesor: 'CORBALAN MIGUEL',
          carrera: 'PROFESORADO DE INGLES',
          materia: 'ING06',
          nombreMateria: 'FONETICA Y FONOLOGIA INGLESA I',
          dia: 'Jueves',
          inicio: '19:40',
          fin: '21:10',
        }],
        planesEstudio: [{
          carrera: 'PROFESORADO DE INGLES',
          materia: 'ING06',
          nombre: 'FONETICA Y FONOLOGIA INGLESA I',
          anio: '1',
        }],
        enrollments: [{
          student_id: 'student-auth-abdelhamid',
          student_record_id: 'student-record-abdelhamid',
          canonical_program_id: 'profesorado-de-ingles',
          canonical_subject_id: 'ING06',
          portal_subject_id: 'profesorado-de-ingles:ing06',
          status: 'active',
          subject: {
            carrera: 'PROFESORADO DE INGLES',
            canonical_program_id: 'PROFESORADO DE INGLES',
            canonical_subject_id: 'ING06',
            portal_subject_id: 'profesorado-de-ingles:ing06',
            code: 'ING06',
            name: 'FONETICA Y FONOLOGIA INGLESA I',
          },
        }],
      },
      teacherRows: [{
        record_id: 'teacher-record-1',
        email: '29541016@docentes.inst-1.local',
        full_name: 'CORBALAN MIGUEL',
        dni: '29541016',
      }],
      studentRows: [{
        record_id: 'student-record-abdelhamid',
        email: 'abdelhamid@example.com',
        full_name: 'Yamil Abdelhamid Campos',
        carrera: 'PROFESORADO DE INGLES',
        anio: '1',
      }],
      user: {
        id: 'teacher-user-1',
        email: '29541016@docentes.inst-1.local',
        nombre: 'CORBALAN MIGUEL',
      },
      activeInstitution: {
        id: 'inst-1',
        name: 'Instituto',
      },
    })

    expect(result.subjectStudentGroups).toEqual([
      expect.objectContaining({
        code: 'ING06',
        students: [expect.objectContaining({ full_name: 'Yamil Abdelhamid Campos' })],
      }),
    ])
    expect(result.stats.subjectStudents).toBe(1)
  })

  it('cruza inscripciones de snapshot aunque falte student_record_id si viene identidad del alumno', () => {
    const result = mapWorkspaceSnapshotToTeacherPortal({
      snapshot: {
        horariosDocentes: [{
          profesor: 'CORBALAN MIGUEL',
          carrera: 'PROFESORADO DE INGLES',
          materia: 'ING06',
          nombreMateria: 'FONETICA Y FONOLOGIA INGLESA I',
          dia: 'Jueves',
          inicio: '19:40',
          fin: '21:10',
        }],
        planesEstudio: [{
          carrera: 'PROFESORADO DE INGLES',
          materia: 'ING06',
          nombre: 'FONETICA Y FONOLOGIA INGLESA I',
          anio: '1',
        }],
        enrollments: [{
          student_id: 'student-auth-abdelhamid',
          email: 'abdelhamid@example.com',
          full_name: 'Yamil Abdelhamid Campos',
          program_id: 'PROFESORADO DE INGLES',
          subject_id: 'ING06',
          status: 'active',
        }],
      },
      teacherRows: [{
        record_id: 'teacher-record-1',
        email: '29541016@docentes.inst-1.local',
        full_name: 'CORBALAN MIGUEL',
        dni: '29541016',
      }],
      studentRows: [{
        record_id: 'student-record-abdelhamid',
        email: 'abdelhamid@example.com',
        full_name: 'Yamil Abdelhamid Campos',
        carrera: 'PROFESORADO DE INGLES',
        anio: '1',
      }],
      user: {
        id: 'teacher-user-1',
        email: '29541016@docentes.inst-1.local',
        nombre: 'CORBALAN MIGUEL',
      },
      activeInstitution: {
        id: 'inst-1',
        name: 'Instituto',
      },
    })

    expect(result.subjectStudentGroups).toEqual([
      expect.objectContaining({
        code: 'ING06',
        students: [expect.objectContaining({ full_name: 'Yamil Abdelhamid Campos' })],
      }),
    ])
    expect(result.stats.subjectStudents).toBe(1)
  })

  it('resuelve nombres de materia aunque el codigo cambie de formato', () => {
    const result = mapWorkspaceSnapshotToTeacherPortal({
      snapshot: {
        horariosDocentes: [{
          profesor: 'Susana Aguero',
          carrera: 'Tecnico Superior en Turismo',
          materia: 'TUR09',
          dia: 'Jueves',
          inicio: '18:00',
          fin: '20:00',
        }],
        planesEstudio: [{
          carrera: 'Tecnico Superior en Turismo',
          materia: 'TUR9',
          nombre: 'Trabajo de campo turistico',
        }],
      },
      teacherRows: [{
        record_id: 'teacher-record-2',
        email: '18203460@docentes.inst-1.local',
        full_name: 'Susana Aguero',
        nombre: 'Susana',
        apellido: 'Aguero',
        dni: '18203460',
      }],
      studentRows: [],
      user: {
        id: 'teacher-user-2',
        email: '18203460@docentes.inst-1.local',
        nombre: 'Susana Aguero',
      },
      activeInstitution: {
        id: 'inst-1',
        name: 'Instituto',
      },
    })

    expect(result.schedules).toEqual([
      expect.objectContaining({
        materia: 'TUR09',
        nombreMateria: 'Trabajo de campo turistico',
      }),
    ])
  })

  it('usa carreras del padron docente normalizado aunque todavia no tenga horarios', () => {
    const result = mapWorkspaceSnapshotToTeacherPortal({
      snapshot: {
        horariosDocentes: [],
        cronograma: [],
      },
      teacherRows: [{
        record_id: 'teacher-record-3',
        email: '18203460@docentes.inst-1.local',
        full_name: 'Susana Aguero',
        nombre: 'Susana',
        apellido: 'Aguero',
        dni: '18203460',
        carrera: 'Tecnicatura Superior en Turismo',
        carreras: ['Tecnicatura Superior en Turismo'],
        raw: {
          careers: ['Tecnicatura Superior en Turismo'],
        },
      }],
      studentRows: [{
        record_id: 'student-record-3',
        email: 'ana@example.com',
        full_name: 'Ana Perez',
        carrera: 'Tecnicatura Superior en Turismo',
      }, {
        record_id: 'student-record-4',
        email: 'bruno@example.com',
        full_name: 'Bruno Lopez',
        carrera: 'Profesorado',
      }],
      user: {
        id: 'teacher-user-3',
        email: '18203460@docentes.inst-1.local',
        nombre: 'Susana Aguero',
      },
      activeInstitution: {
        id: 'inst-1',
        name: 'Instituto',
      },
    })

    expect(result.students).toEqual([
      expect.objectContaining({
        email: 'ana@example.com',
        carrera: 'Tecnicatura Superior en Turismo',
      }),
    ])
    expect(result.stats.careers).toBe(1)
  })

  it('separa en el dashboard docente los alumnos que cursan cada materia', () => {
    const result = mapWorkspaceSnapshotToTeacherPortal({
      snapshot: {
        horariosDocentes: [{
          profesor: 'Ana Diaz',
          carrera: 'Profesorado',
          materia: 'ING1',
          dia: 'Lunes',
          inicio: '08:00',
          fin: '10:00',
        }, {
          profesor: 'Ana Diaz',
          carrera: 'Profesorado',
          materia: 'HIS1',
          dia: 'Martes',
          inicio: '10:00',
          fin: '12:00',
        }],
        planesEstudio: [{
          carrera: 'Profesorado',
          materia: 'ING1',
          nombre: 'Ingles I',
          anio: '1',
        }, {
          carrera: 'Profesorado',
          materia: 'HIS1',
          nombre: 'Historia I',
          anio: '1',
        }],
        estadoAcademico: [{
          email: 'ana@example.com',
          carrera: 'Profesorado',
          materia: 'ING1',
          estado: 'cursando',
        }, {
          email: 'bruno@example.com',
          carrera: 'Profesorado',
          materia: 'HIS1',
          estado: 'regular',
        }, {
          email: 'carla@example.com',
          carrera: 'Profesorado',
          materia: 'ING1',
          estado: 'aprobada',
        }],
      },
      teacherRows: [{
        record_id: 'teacher-record-1',
        email: '30111222@docentes.inst-1.local',
        full_name: 'Ana Diaz',
        nombre: 'Ana',
        apellido: 'Diaz',
        dni: '30111222',
      }],
      studentRows: [{
        email: 'ana@example.com',
        full_name: 'Ana Perez',
        carrera: 'Profesorado',
        anio: '1',
      }, {
        email: 'bruno@example.com',
        full_name: 'Bruno Lopez',
        carrera: 'Profesorado',
        anio: '1',
      }, {
        email: 'carla@example.com',
        full_name: 'Carla Ruiz',
        carrera: 'Profesorado',
        anio: '1',
      }],
      user: {
        id: 'teacher-user-1',
        email: '30111222@docentes.inst-1.local',
        nombre: 'Ana Diaz',
      },
      activeInstitution: {
        id: 'inst-1',
        name: 'Instituto',
      },
    })

    expect(result.subjectStudentGroups).toEqual([
      expect.objectContaining({
        code: 'HIS1',
        name: 'Historia I',
        students: [expect.objectContaining({ email: 'bruno@example.com' })],
        source: 'academic',
      }),
      expect.objectContaining({
        code: 'ING1',
        name: 'Ingles I',
        students: [expect.objectContaining({ email: 'ana@example.com' })],
        source: 'academic',
      }),
    ])
    expect(result.stats.subjectStudents).toBe(2)
  })

  it('no cae en el primer docente del padron cuando el usuario docente no coincide', () => {
    const result = mapWorkspaceSnapshotToTeacherPortal({
      snapshot: {
        horariosDocentes: [{
          profesor: 'Ana Diaz',
          carrera: 'Profesorado',
          materia: 'ING1',
          dia: 'Lunes',
          inicio: '08:00',
          fin: '10:00',
        }, {
          profesor: 'Luis Perez',
          carrera: 'Profesorado',
          materia: 'HIS1',
          dia: 'Martes',
          inicio: '10:00',
          fin: '12:00',
        }],
      },
      teacherRows: [{
        record_id: 'teacher-record-1',
        email: '30111222@docentes.inst-1.local',
        full_name: 'Ana Diaz',
        dni: '30111222',
      }, {
        record_id: 'teacher-record-2',
        email: '18203460@docentes.inst-1.local',
        full_name: 'Luis Perez',
        dni: '18203460',
      }],
      studentRows: [],
      user: {
        id: 'teacher-user-unknown',
        email: '99999999@docentes.inst-1.local',
        nombre: '99999999@docentes.inst-1.local',
      },
      activeInstitution: {
        id: 'inst-1',
        name: 'Instituto',
      },
    })

    expect(result.currentTeacher.matched).toBe(false)
    expect(result.currentTeacher.full_name).toBe('99999999@docentes.inst-1.local')
    expect(result.teacherNames).toEqual(['99999999@docentes.inst-1.local'])
    expect(result.schedules).toEqual([])
    expect(result.exams).toEqual([])
  })

  it('usa el nombre exacto del perfil docente cuando no hay teacher_records disponibles', () => {
    const result = mapWorkspaceSnapshotToTeacherPortal({
      snapshot: {
        horariosDocentes: [{
          profesor: 'CORBALAN MIGUEL',
          carrera: 'Tecnicatura Superior en Turismo',
          materia: 'TUR1',
          dia: 'Lunes',
          inicio: '18:00',
          fin: '20:00',
        }],
        docenteMateria: [{
          docente: 'CORBALAN MIGUEL',
          carrera: 'Tecnicatura Superior en Turismo',
          materia: 'TUR1',
          nombreMateria: 'Introduccion al turismo',
        }],
        planesEstudio: [{
          carrera: 'Tecnicatura Superior en Turismo',
          materia: 'TUR1',
          nombre: 'Introduccion al turismo',
          anio: '1',
        }],
        estadoAcademico: [{
          email: 'ana@example.com',
          carrera: 'Tecnicatura Superior en Turismo',
          materia: 'TUR1',
          estado: 'cursando',
        }],
      },
      teacherRows: [],
      studentRows: [{
        email: 'ana@example.com',
        full_name: 'Ana Perez',
        carrera: 'Tecnicatura Superior en Turismo',
        anio: '1',
      }],
      user: {
        id: 'teacher-user-corbalan',
        email: '29541016@docentes.inst-1.local',
        nombre: 'CORBALAN MIGUEL',
      },
      activeInstitution: {
        id: 'inst-1',
        name: 'Instituto',
      },
    })

    expect(result.currentTeacher).toEqual(expect.objectContaining({
      full_name: 'CORBALAN MIGUEL',
      matched: true,
    }))
    expect(result.schedules).toHaveLength(1)
    expect(result.subjectStudentGroups).toEqual([
      expect.objectContaining({
        code: 'TUR1',
        name: 'Introduccion al turismo',
        students: [expect.objectContaining({ email: 'ana@example.com' })],
      }),
    ])
  })

  it('no duplica una materia cuando horariosDocentes trae el nombre de carrera y docenteMateria solo trae carrera_id', () => {
    // Regresion: horariosDocentes siempre trae "carrera" (nombre descriptivo),
    // pero docenteMateria/cargaHorariaDocente suelen traer solo "carrera_id"
    // (el codigo corto). Si la clave de agrupacion usara el nombre de carrera
    // tal cual llega, la misma materia real generaba dos grupos -- uno por
    // fuente -- e inflaba el conteo de "Materias" al doble.
    const result = mapWorkspaceSnapshotToTeacherPortal({
      snapshot: {
        horariosDocentes: [{
          profesor: 'CORBALAN MIGUEL',
          carrera: 'PROFESORADO DE INGLES',
          carrera_id: 'ING',
          materia_codigo: 'ING06',
          nombreMateria: 'Fonetica y Fonologia Inglesa I',
          dia: 'Miercoles',
          inicio: '19:40',
          fin: '21:10',
        }],
        docenteMateria: [{
          docente: 'CORBALAN MIGUEL',
          carrera_id: 'ING',
          materia_codigo: 'ING06',
          nombreMateria: 'Fonetica y Fonologia Inglesa I',
          rol_en_materia: 'TITULAR',
        }, {
          docente: 'CORBALAN MIGUEL',
          carrera_id: 'ING',
          materia_codigo: 'ING06',
          nombreMateria: 'Fonetica y Fonologia Inglesa I',
          rol_en_materia: '',
        }],
        planesEstudio: [{
          carrera: 'PROFESORADO DE INGLES',
          materia: 'ING06',
          nombre: 'Fonetica y Fonologia Inglesa I',
          anio: '1',
        }],
      },
      teacherRows: [],
      studentRows: [],
      user: {
        id: 'teacher-user-corbalan',
        email: '29541016@docentes.inst-1.local',
        nombre: 'CORBALAN MIGUEL',
      },
      activeInstitution: {
        id: 'inst-1',
        name: 'Instituto',
      },
    })

    expect(result.subjectStudentGroups).toHaveLength(1)
    expect(result.subjectStudentGroups[0]).toEqual(expect.objectContaining({
      code: 'ING06',
      career: 'PROFESORADO DE INGLES',
    }))
    expect(result.stats.subjects).toBe(1)
  })

  it('no infla horas ni materias con filas de otros docentes aunque el padron tenga materias amplias', () => {
    const result = mapWorkspaceSnapshotToTeacherPortal({
      snapshot: {
        horariosDocentes: [{
          profesor: 'CORBALAN MIGUEL',
          carrera: 'PROFESORADO DE INGLES',
          materia_codigo: 'ING06',
          nombreMateria: 'Fonetica y Fonologia Inglesa I',
          dia: 'Miercoles',
          inicio: '19:40',
          fin: '21:10',
        }, {
          profesor: 'OTRO DOCENTE',
          carrera: 'PROFESORADO DE INGLES',
          materia_codigo: 'ING07',
          nombreMateria: 'Gramatica Inglesa I',
          dia: 'Jueves',
          inicio: '18:00',
          fin: '22:00',
        }],
        docenteMateria: [{
          docente: 'CORBALAN MIGUEL',
          carrera_id: 'ING',
          materia_codigo: 'ING06',
          nombreMateria: 'Fonetica y Fonologia Inglesa I',
        }, {
          docente: 'OTRO DOCENTE',
          carrera_id: 'ING',
          materia_codigo: 'ING07',
          nombreMateria: 'Gramatica Inglesa I',
        }],
        planesEstudio: [{
          carrera: 'PROFESORADO DE INGLES',
          materia: 'ING06',
          nombre: 'Fonetica y Fonologia Inglesa I',
          anio: '1',
        }, {
          carrera: 'PROFESORADO DE INGLES',
          materia: 'ING07',
          nombre: 'Gramatica Inglesa I',
          anio: '1',
        }],
      },
      teacherRows: [{
        record_id: 'teacher-record-corbalan',
        profile_id: 'teacher-user-corbalan',
        email: '29541016@docentes.inst-1.local',
        full_name: 'CORBALAN MIGUEL',
        nombre: 'CORBALAN',
        apellido: 'MIGUEL',
        dni: '29541016',
        carreras: ['PROFESORADO DE INGLES'],
        raw: {
          materias: ['ING06', 'ING07'],
        },
      }],
      studentRows: [],
      user: {
        id: 'teacher-user-corbalan',
        email: '29541016@docentes.inst-1.local',
        nombre: 'CORBALAN MIGUEL',
      },
      activeInstitution: {
        id: 'inst-1',
        name: 'Instituto',
      },
    })

    expect(result.schedules).toHaveLength(1)
    expect(result.schedules[0]).toEqual(expect.objectContaining({ profesor: 'CORBALAN MIGUEL', materiaCodigo: 'ING06' }))
    expect(result.subjectRows).toHaveLength(1)
    expect(result.subjectRows[0]).toEqual(expect.objectContaining({ materiaCodigo: 'ING06' }))
    expect(result.stats.weeklyHours).toBe(1.5)
    expect(result.stats.scheduleBlocks).toBe(1)
    expect(result.stats.subjects).toBe(1)
  })

  it('no duplica una materia cuando cargaHorariaDocente (formato canonico) trae el nombre completo de la carrera en program_id y docenteMateria/horariosDocentes traen el codigo corto', () => {
    // Regresion: cargaHorariaDocente puede venir en formato canonico, con
    // "program_id" ya resuelto al nombre completo de la carrera, mientras
    // que docenteMateria/horariosDocentes traen "carrera_id" como codigo
    // corto ("ING"). Si la clave de agrupacion comparara esos valores tal
    // cual (sin resolverlos a un mismo nombre canonico), "ing" y
    // "profesoradodeingles" no matchean y la misma materia real genera dos
    // grupos -- justo el caso que rompio el primer intento de fix.
    const result = mapWorkspaceSnapshotToTeacherPortal({
      snapshot: {
        horariosDocentes: [{
          profesor: 'CORBALAN MIGUEL',
          carrera: 'PROFESORADO DE INGLES',
          carrera_id: 'ING',
          materia_codigo: 'ING06',
          nombreMateria: 'Fonetica y Fonologia Inglesa I',
          dia: 'Miercoles',
          inicio: '19:40',
          fin: '21:10',
        }],
        docenteMateria: [{
          docente: 'CORBALAN MIGUEL',
          carrera_id: 'ING',
          materia_codigo: 'ING06',
          nombreMateria: 'Fonetica y Fonologia Inglesa I',
          rol_en_materia: 'TITULAR',
        }],
        cargaHorariaDocente: [{
          assignment_id: 'assign-1',
          teacher_id: 'teacher-record-corbalan',
          program_id: 'PROFESORADO DE INGLES',
          materia_codigo: 'ING06',
          nombreMateria: 'Fonetica y Fonologia Inglesa I',
          titularidad: 'TITULAR',
          source: 'academic',
        }],
        planesEstudio: [{
          carrera: 'PROFESORADO DE INGLES',
          materia: 'ING06',
          nombre: 'Fonetica y Fonologia Inglesa I',
          anio: '1',
        }],
      },
      teacherRows: [],
      studentRows: [],
      user: {
        id: 'teacher-user-corbalan',
        email: '29541016@docentes.inst-1.local',
        nombre: 'CORBALAN MIGUEL',
      },
      activeInstitution: {
        id: 'inst-1',
        name: 'Instituto',
      },
    })

    expect(result.subjectStudentGroups).toHaveLength(1)
    expect(result.subjectStudentGroups[0]).toEqual(expect.objectContaining({
      code: 'ING06',
      career: 'PROFESORADO DE INGLES',
    }))
    expect(result.stats.subjects).toBe(1)
  })

  it('usa el profile_id explicito del padron docente como identidad canonica', () => {
    const result = mapWorkspaceSnapshotToTeacherPortal({
      snapshot: {
        docenteMateria: [{
          teacher_record_id: 'teacher-record-9',
          carrera: 'Profesorado',
          materia: 'ING2',
          nombreMateria: 'Ingles II',
        }],
        planesEstudio: [{
          carrera: 'Profesorado',
          materia: 'ING2',
          nombre: 'Ingles II',
        }],
      },
      teacherRows: [{
        record_id: 'teacher-record-9',
        profile_id: 'teacher-user-9',
        email: 'legacy@docentes.local',
        full_name: 'Nombre Desactualizado',
        dni: '11111111',
      }],
      studentRows: [],
      user: {
        id: 'teacher-user-9',
        email: 'nuevo@docentes.local',
        nombre: 'Perfil Actual',
      },
      activeInstitution: {
        id: 'inst-1',
        name: 'Instituto',
      },
    })

    expect(result.currentTeacher).toEqual(expect.objectContaining({
      record_id: 'teacher-record-9',
      matched: true,
    }))
    expect(result.subjectRows).toEqual([
      expect.objectContaining({
        materiaCodigo: 'ING2',
        nombreMateria: 'Ingles II',
      }),
    ])
    expect(result.subjectStudentGroups).toEqual([
      expect.objectContaining({
        code: 'ING2',
        schedules: [],
      }),
    ])
  })

  it('recupera horarios por carrera y materia del padron docente aunque el nombre del horario tenga otro formato', () => {
    const result = mapWorkspaceSnapshotToTeacherPortal({
      snapshot: {
        horariosDocentes: [{
          profesor: 'Diaz Ana',
          carrera: 'Profesorado',
          materia: 'ING1',
          dia: 'Lunes',
          inicio: '08:00',
          fin: '10:00',
        }, {
          profesor: 'Luis Perez',
          carrera: 'Profesorado',
          materia: 'HIS1',
          dia: 'Martes',
          inicio: '10:00',
          fin: '12:00',
        }],
      },
      teacherRows: [{
        record_id: 'teacher-record-1',
        email: '30111222@docentes.inst-1.local',
        full_name: 'Ana Diaz',
        nombre: 'Ana',
        apellido: 'Diaz',
        dni: '30111222',
        carrera: 'Profesorado',
        carreras: ['Profesorado'],
        raw: {
          carrera: 'Profesorado',
          carreras: ['Profesorado'],
          materias: ['ING1'],
        },
      }],
      studentRows: [],
      user: {
        id: 'teacher-user-1',
        email: '30111222@docentes.inst-1.local',
        nombre: 'Ana Diaz',
      },
      activeInstitution: {
        id: 'inst-1',
        name: 'Instituto',
      },
    })

    expect(result.currentTeacher.matched).toBe(true)
    expect(result.schedules).toEqual([
      expect.objectContaining({
        profesor: 'Diaz Ana',
        materia: 'ING1',
      }),
    ])
  })
})
