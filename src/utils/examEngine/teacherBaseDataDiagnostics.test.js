import { describe, expect, it } from 'vitest'
import { buildTeacherBaseDataDiagnostics } from './teacherBaseDataDiagnostics.js'

const plans = [
  { carrera: 'Profesorado de Ingles', materia: 'ING1', nombre: 'Ingles I', anio: 1 },
  { carrera: 'Profesorado de Ingles', materia: 'ING2', nombre: 'Ingles II', anio: 2 },
  { carrera: 'Otra carrera', materia: 'OTR1', nombre: 'Otra materia', anio: 1 },
]

describe('buildTeacherBaseDataDiagnostics', () => {
  it('toma horarios docentes como fuente activa cuando no hay estructura separada', () => {
    const result = buildTeacherBaseDataDiagnostics({
      teachers: [{ id: 'teacher-1', nombre: 'Docente Uno' }],
      cargaHorariaDocente: [{
        docenteId: 'teacher-1',
        docente: 'Docente Uno',
        carrera: 'Profesorado de Ingles',
        materia_codigo: 'ING1',
        horasCatedra: 4,
        rol_en_materia: 'TITULAR',
        estado_asignacion: 'ACTIVO',
      }],
      disponibilidadDocente: [],
      horariosDocentes: [{
        docenteId: 'teacher-1',
        docente: 'Docente Uno',
        carrera: 'Profesorado de Ingles',
        materia: 'ING1',
        horasCatedra: 4,
        dia: 'Lunes',
        inicio: '18:00',
        fin: '20:00',
      }],
      planesEstudio: plans,
      career: 'Profesorado de Ingles',
    })

    expect(result).toMatchObject({
      status: 'LEGACY_ACTIVE',
      source: 'legacy',
      hasStructuredTeacherSource: false,
      hasLegacyTeacherScheduleSource: true,
      counts: {
        plansInScope: 2,
        scheduleRecords: 1,
        effectiveTeachers: 1,
        effectiveAvailabilityRecords: 1,
        effectiveTitularRecords: 1,
        workloadRecords: 1,
        availabilityRecords: 0,
        workloadWithoutAvailability: 0,
        teachersWithoutAvailability: 0,
      },
    })
    expect(result.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'TEACHER_WORKLOAD_WITHOUT_AVAILABILITY' }),
    ]))
  })

  it('identifica materias sin titular efectivo y estructurado por carrera', () => {
    const result = buildTeacherBaseDataDiagnostics({
      cargaHorariaDocente: [],
      disponibilidadDocente: [],
      horariosDocentes: [{
        docente: 'Docente Uno',
        carrera: 'Profesorado de Ingles',
        materia: 'ING1',
        horasCatedra: 4,
        dia: 'Lunes',
        inicio: '18:00',
        fin: '20:00',
      }],
      planesEstudio: plans,
      career: 'Profesorado de Ingles',
    })

    expect(result.missingEffectiveTitularSubjects).toEqual([
      expect.objectContaining({ materia: 'ING2', nombre: 'Ingles II' }),
    ])
    expect(result.counts.missingStructuredTitularSubjects).toBe(2)
  })

  it('toma docentes_materias como titularidades institucionales', () => {
    const result = buildTeacherBaseDataDiagnostics({
      docenteMateria: [{
        docente: 'Docente Dos',
        carrera: 'Profesorado de Ingles',
        materia_codigo: 'ING2',
        materia_nombre: 'Ingles II',
      }],
      horariosDocentes: [{
        docente: 'Docente Uno',
        carrera: 'Profesorado de Ingles',
        materia: 'ING1',
        horasCatedra: 4,
        dia: 'Lunes',
        inicio: '18:00',
        fin: '20:00',
      }],
      planesEstudio: plans,
      career: 'Profesorado de Ingles',
    })

    expect(result.missingEffectiveTitularSubjects).toEqual([])
    expect(result.counts).toMatchObject({
      docenteMateriaRecords: 1,
      docenteMateriaTitularRecords: 1,
      effectiveTitularRecords: 2,
    })
  })

  it('cruza por codigo de materia aunque la carrera venga escrita diferente', () => {
    const result = buildTeacherBaseDataDiagnostics({
      docenteMateria: [{
        docente: 'Docente Laboratorio',
        carrera: 'Laboratorio',
        materia_codigo: 'LAB1',
        materia_nombre: 'Quimica General',
      }],
      planesEstudio: [{
        carrera: 'Tecnicatura Superior en Laboratorio',
        materia: 'LAB1',
        nombre: 'Quimica General',
        anio: 1,
      }],
    })

    expect(result.missingEffectiveTitularSubjects).toEqual([])
    expect(result.counts.effectiveTitularRecords).toBe(1)
  })

  it('deja Geografia 1, 2 y 3 fuera del analisis automatico', () => {
    const result = buildTeacherBaseDataDiagnostics({
      planesEstudio: [
        { carrera: 'Profesorado de Geografia', materia: 'GEO1', nombre: 'Geografia I', anio: 1 },
        { carrera: 'Profesorado de Geografia', materia: 'GEO2', nombre: 'Geografia II', anio: '2 ano' },
        { carrera: 'Profesorado de Geografia', materia: 'GEO3', nombre: 'Geografia III', anio: 'Tercer ano' },
        { carrera: 'Profesorado de Geografia', materia: 'GEO4', nombre: 'Geografia IV', anio: 4 },
        { carrera: 'Profesorado de Ingles', materia: 'ING1', nombre: 'Ingles I', anio: 1 },
      ],
    })

    expect(result.counts).toMatchObject({
      manualExamSubjects: 3,
      plansInScope: 2,
      missingEffectiveTitularSubjects: 2,
    })
    expect(result.manualExamSubjects.map((subject) => subject.materia)).toEqual(['GEO1', 'GEO2', 'GEO3'])
    expect(result.missingEffectiveTitularSubjects.map((subject) => subject.materia)).toEqual(['GEO4', 'ING1'])
  })

  it('queda activa con carga titular, horas y disponibilidad validas', () => {
    const result = buildTeacherBaseDataDiagnostics({
      teachers: [{ id: 'teacher-1', nombre: 'Docente Uno' }],
      cargaHorariaDocente: [{
        docenteId: 'teacher-1',
        docente: 'Docente Uno',
        carrera: 'Profesorado de Ingles',
        materia_codigo: 'ING1',
        horasCatedra: 4,
        rol_en_materia: 'TITULAR',
        estado_asignacion: 'ACTIVO',
      }],
      disponibilidadDocente: [{
        docenteId: 'teacher-1',
        docente: 'Docente Uno',
        dia: 'Lunes',
        hora_desde: '18:00',
        hora_hasta: '20:00',
        estado: 'ACTIVO',
      }],
      fechasBloqueadasDocente: [
        { docenteId: 'teacher-1', date: '2026-08-03', status: 'ACTIVE' },
        { docenteId: 'teacher-1', date: '2026-08-04', status: 'INACTIVE' },
      ],
      planesEstudio: [plans[0]],
    })

    expect(result).toMatchObject({
      status: 'STRUCTURED_ACTIVE',
      source: 'structured',
      hasStructuredTeacherSource: true,
      counts: {
        validWorkloadRecords: 1,
        validAvailabilityRecords: 1,
        titularRecords: 1,
        missingEffectiveTitularSubjects: 0,
        missingStructuredTitularSubjects: 0,
        teachersWithoutAvailability: 0,
        workloadWithoutAvailability: 0,
        blockedDates: 1,
      },
    })
  })
})
