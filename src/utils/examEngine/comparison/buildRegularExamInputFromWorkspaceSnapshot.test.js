import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  legacyWorkspaceSnapshot,
  legacyWorkspaceSnapshotOneCall,
} from './__fixtures__/legacyWorkspaceSnapshot.fixture.js'
import {
  buildRegularExamInputFromWorkspaceSnapshot,
  inferTurnoFromTime,
} from './buildRegularExamInputFromWorkspaceSnapshot.js'

function buildInput(snapshot = legacyWorkspaceSnapshot) {
  return buildRegularExamInputFromWorkspaceSnapshot(snapshot)
}

describe('buildRegularExamInputFromWorkspaceSnapshot', () => {
  it('devuelve el contrato base esperado por examEngine', () => {
    const input = buildInput()

    expect(Object.keys(input).sort()).toEqual([
      'config',
      'correlatividades',
      'docentes',
      'fechasDisponibles',
      'materias',
      'metadata',
      'options',
    ])
    expect(input).toMatchObject({
      docentes: expect.any(Array),
      materias: expect.any(Array),
      correlatividades: expect.any(Array),
      fechasDisponibles: expect.any(Array),
      config: expect.any(Object),
      options: expect.any(Object),
      metadata: expect.any(Object),
    })
  })

  it('convierte planesEstudio en materias', () => {
    const input = buildInput()

    expect(input.materias).toHaveLength(4)
    expect(input.materias.map((materia) => materia.materia)).toEqual(['ING1', 'ING2', 'PRG1', 'BD1'])
    expect(input.materias[0]).toMatchObject({
      id: 'plan-ing-1',
      codigo: 'ING1',
      nombreMateria: 'Lengua Inglesa I',
      carrera: 'Profesorado de Ingles',
      carreraId: 'prof-ingles',
      anio: 1,
      requiereMesa: true,
    })
  })

  it('marca Geografia 1, 2 y 3 como mesas manuales institucionales', () => {
    const input = buildInput({
      docentes: [],
      horariosDocentes: [],
      planesEstudio: [
        { id: 'geo-1', carrera: 'Profesorado de Geografia', materia: 'GEO1', nombreMateria: 'Geografia I', anio: 1 },
        { id: 'geo-2', carrera: 'Profesorado de Geografia', materia: 'GEO2', nombreMateria: 'Geografia II', anio: '2 ano' },
        { id: 'geo-3', carrera: 'Profesorado de Geografia', materia: 'GEO3', nombreMateria: 'Geografia III', anio: 'Tercer ano' },
        { id: 'geo-4', carrera: 'Profesorado de Geografia', materia: 'GEO4', nombreMateria: 'Geografia IV', anio: 4 },
      ],
      fechaInicio: '2026-07-27',
      fechaFin: '2026-07-31',
    })

    expect(input.materias.find((materia) => materia.materia === 'GEO1')).toMatchObject({
      requiereMesa: false,
      requiereMesaSource: 'GEOGRAFIA_CERRADA_1_2_3',
      manualExamExclusionReason: 'GEOGRAFIA_CERRADA_1_2_3',
    })
    expect(input.materias.find((materia) => materia.materia === 'GEO2')).toMatchObject({
      requiereMesa: false,
      requiereMesaSource: 'GEOGRAFIA_CERRADA_1_2_3',
    })
    expect(input.materias.find((materia) => materia.materia === 'GEO3')).toMatchObject({
      requiereMesa: false,
      requiereMesaSource: 'GEOGRAFIA_CERRADA_1_2_3',
    })
    expect(input.materias.find((materia) => materia.materia === 'GEO4')).toMatchObject({
      requiereMesa: true,
      requiereMesaSource: 'sinHorarioDocente',
    })
    expect(input.metadata.adapterDiagnostics.adaptedCounts).toMatchObject({
      materiasQueRequierenMesa: 1,
      materiasExcluidasManualInstitucional: 3,
    })
  })

  it('conserva las afinidades de la planilla y las vincula con los docentes que dictan esas materias', () => {
    const input = buildInput({
      docentes: [
        { id: 'doc-qui', nombre: 'Docente Quimica', activo: true },
        { id: 'doc-lab', nombre: 'Docente Laboratorio', activo: true },
      ],
      docenteMateria: [
        { docente_id: 'doc-qui', docente: 'Docente Quimica', carrera: 'Profesorado de Quimica', materia_codigo: 'QUI05', rol_en_materia: 'TITULAR' },
        { docente_id: 'doc-lab', docente: 'Docente Laboratorio', carrera: 'Tecnico Superior en Laboratorio', materia_codigo: 'LAB05', rol_en_materia: 'TITULAR' },
      ],
      planesEstudio: [
        {
          id: 'plan-qui05',
          carrera: 'Profesorado de Quimica',
          materia: 'QUI05',
          nombreMateria: 'Quimica General',
          grupo_afin_mesa: 'QUIMICA-GENERAL-INORGANICA',
          codigos_materias_afines: 'LAB05',
        },
        {
          id: 'plan-lab05',
          carrera: 'Tecnico Superior en Laboratorio',
          materia: 'LAB05',
          nombreMateria: 'Quimica General e Inorganica',
          grupo_afin_mesa: 'QUIMICA-GENERAL-INORGANICA',
          codigos_materias_afines: 'QUI05',
        },
      ],
      fechaInicio: '2026-07-30',
      fechaFin: '2026-08-12',
    })

    expect(input.materias).toEqual(expect.arrayContaining([
      expect.objectContaining({
        materia: 'QUI05',
        grupo_afin_mesa: 'QUIMICA-GENERAL-INORGANICA',
        codigos_materias_afines: 'LAB05',
      }),
      expect.objectContaining({
        materia: 'LAB05',
        grupo_afin_mesa: 'QUIMICA-GENERAL-INORGANICA',
        codigos_materias_afines: 'QUI05',
      }),
    ]))
    expect(input.docentes.find((docente) => docente.id === 'doc-qui')?.gruposAfinidad)
      .toContain('QUIMICA-GENERAL-INORGANICA')
    expect(input.docentes.find((docente) => docente.id === 'doc-lab')?.gruposAfinidad)
      .toContain('QUIMICA-GENERAL-INORGANICA')
  })

  it('enriquece materias con titularId desde horariosDocentes', () => {
    const input = buildInput()
    const inglesI = input.materias.find((materia) => materia.materia === 'ING1')
    const programacion = input.materias.find((materia) => materia.materia === 'PRG1')

    expect(inglesI).toMatchObject({
      titularId: 'doc-ing-1',
      titular_id: 'doc-ing-1',
    })
    expect(programacion).toMatchObject({
      titularId: 'doc-soft-1',
      titular_id: 'doc-soft-1',
    })
  })

  it('convierte docentes y horariosDocentes en docentes canonicos', () => {
    const input = buildInput()
    const ana = input.docentes.find((docente) => docente.id === 'doc-ing-1')

    expect(input.docentes).toHaveLength(4)
    expect(ana).toMatchObject({
      id: 'doc-ing-1',
      nombre: 'Ana Ingles I',
      email: 'ana.ingles@example.edu',
      carrera: 'Profesorado de Ingles',
      nombreMateria: 'Lengua Inglesa I',
      especialidad: 'Ingles',
      diasAsistencia: ['lunes'],
      turnosDisponibles: ['NOCHE'],
      horasCatedra: 3,
      teachingHours: 3,
      horasCatedraSource: 'TEACHING_HOURS_INFERRED_FROM_SCHEDULE',
      halfPlusOneRuleMode: 'TEACHING_HOURS_HALF_PLUS_ONE',
    })
  })

  it('infiere horas catedra desde horarios y deduplica bloques exactos', () => {
    const horario = {
      profesor: 'Docente Carga',
      carrera: 'Tecnicatura en Gestion',
      materia: 'Gestion I',
      dia: 'Lunes',
      inicio: '18:20',
      fin: '19:40',
    }
    const input = buildInput({
      docentes: [],
      horariosDocentes: [horario, { ...horario }],
      planesEstudio: [
        {
          id: 'plan-gestion',
          carrera: 'Tecnicatura en Gestion',
          materia: 'Gestion I',
        },
      ],
      fechaInicio: '2026-07-27',
      fechaFin: '2026-07-31',
    })

    expect(input.docentes[0]).toMatchObject({
      horasCatedra: 2,
      horasCatedraSource: 'TEACHING_HOURS_INFERRED_FROM_SCHEDULE',
      teachingHoursDiagnostics: {
        validBlocks: 1,
        duplicateBlocksIgnored: 1,
      },
    })
    expect(input.metadata.adapterDiagnostics.adaptedCounts).toMatchObject({
      docentesConHorasCatedra: 1,
      bloquesHorariosDuplicadosIgnorados: 1,
      reglaMitadMasUno: 'TEACHING_HOURS_HALF_PLUS_ONE',
    })
  })

  it('infiere NOCHE para horarios de nivel superior desde las 18:00', () => {
    expect(inferTurnoFromTime({ inicio: '18:20', fin: '20:00' })).toBe('NOCHE')
    expect(inferTurnoFromTime({ inicio: '20:00', fin: '22:00' })).toBe('NOCHE')
  })

  it('no inventa turno cuando inicio es invalido', () => {
    expect(inferTurnoFromTime({ inicio: 'sin hora', fin: '20:00' })).toBe('')

    const input = buildInput({
      docentes: [],
      horariosDocentes: [
        {
          profesor: 'Docente Sin Hora',
          carrera: 'Tecnicatura en Gestion',
          materia: 'Gestion I',
          dia: 'Lunes',
          inicio: 'sin hora',
          fin: '20:00',
        },
      ],
      planesEstudio: [
        {
          id: 'plan-gestion',
          carrera: 'Tecnicatura en Gestion',
          materia: 'Gestion I',
          nombreMateria: 'Gestion I',
        },
      ],
      fechaInicio: '2026-07-27',
      fechaFin: '2026-07-31',
    })

    expect(input.docentes[0].turnosDisponibles).toEqual([])
    expect(input.docentes[0].availability[0]).toMatchObject({
      dia: 'lunes',
      turno: '',
      shift: '',
    })
  })

  it('respeta turno explicito aunque el horario permita inferir otro', () => {
    const input = buildInput({
      docentes: [],
      horariosDocentes: [
        {
          profesor: 'Docente Tarde',
          carrera: 'Tecnicatura en Gestion',
          materia: 'Gestion I',
          dia: 'Lunes',
          turno: 'TARDE',
          inicio: '20:00',
          fin: '22:00',
        },
      ],
      planesEstudio: [
        {
          id: 'plan-gestion',
          carrera: 'Tecnicatura en Gestion',
          materia: 'Gestion I',
          nombreMateria: 'Gestion I',
        },
      ],
      fechaInicio: '2026-07-27',
      fechaFin: '2026-07-31',
    })

    expect(input.docentes[0].turnosDisponibles).toEqual(['TARDE'])
    expect(input.docentes[0].availability[0]).toMatchObject({
      dia: 'lunes',
      turno: 'TARDE',
      shift: 'TARDE',
    })
  })

  it('completa turnosDisponibles y availability.turno desde inicio y fin', () => {
    const input = buildInput({
      docentes: [],
      horariosDocentes: [
        {
          profesor: 'Docente Noche',
          carrera: 'Tecnicatura en Gestion',
          materia: 'Gestion I',
          dia: 'Lunes',
          inicio: '18:20',
          fin: '20:00',
        },
      ],
      planesEstudio: [
        {
          id: 'plan-gestion',
          carrera: 'Tecnicatura en Gestion',
          materia: 'Gestion I',
          nombreMateria: 'Gestion I',
        },
      ],
      fechaInicio: '2026-07-27',
      fechaFin: '2026-07-31',
    })

    expect(input.docentes[0].turnosDisponibles).toEqual(['NOCHE'])
    expect(input.docentes[0].availability).toEqual([
      expect.objectContaining({
        dia: 'lunes',
        turno: 'NOCHE',
        shift: 'NOCHE',
        inicio: '18:20',
        fin: '20:00',
      }),
    ])
  })

  it('cruza carrera y materia normalizando tildes y mayusculas', () => {
    const input = buildInput({
      docentes: [
        {
          id: 'doc-practica',
          nombre: 'Maria',
          apellido: 'Gomez',
        },
      ],
      horariosDocentes: [
        {
          profesor: 'GOMEZ, MARIA',
          carrera: 'Tecnicatura en Gestion',
          materia: 'Practica I',
          dia: 'Miercoles',
          turno: 'NOCHE',
          inicio: '18:00',
          fin: '20:00',
        },
      ],
      planesEstudio: [
        {
          id: 'plan-practica',
          carrera: 'TECNICATURA EN GESTION',
          materia: 'Practica I',
          nombreMateria: 'Practica I',
          requiereMesa: true,
        },
      ],
      fechaInicio: '2026-07-27',
      fechaFin: '2026-07-31',
    })

    expect(input.materias[0]).toMatchObject({
      titularId: 'doc-practica',
      titular_id: 'doc-practica',
      titularSource: 'horariosDocentes',
    })
    expect(input.docentes[0]).toMatchObject({
      id: 'doc-practica',
      diasAsistencia: ['miercoles'],
      turnosDisponibles: ['NOCHE'],
    })
  })

  it('no duplica docentes por multiples filas de horariosDocentes', () => {
    const input = buildInput({
      docentes: [],
      horariosDocentes: [
        {
          id: 'horario-1',
          profesor: 'Docente Invitado',
          carrera: 'Tecnicatura en Gestion',
          materia: 'Gestion I',
          dia: 'Lunes',
          turno: 'NOCHE',
          inicio: '18:00',
          fin: '20:00',
        },
        {
          id: 'horario-2',
          profesor: 'Docente Invitado',
          carrera: 'Tecnicatura en Gestion',
          materia: 'Gestion I',
          dia: 'Martes',
          turno: 'NOCHE',
          inicio: '18:00',
          fin: '20:00',
        },
      ],
      planesEstudio: [
        {
          id: 'plan-gestion',
          carrera: 'Tecnicatura en Gestion',
          materia: 'Gestion I',
          nombreMateria: 'Gestion I',
          requiereMesa: true,
        },
      ],
      fechaInicio: '2026-07-27',
      fechaFin: '2026-07-31',
    })

    expect(input.docentes).toHaveLength(1)
    expect(input.docentes[0]).toMatchObject({
      id: 'doc-docente-invitado',
      source: 'horariosDocentes',
      sources: ['horariosDocentes'],
      diasAsistencia: ['lunes', 'martes'],
    })
    expect(input.docentes[0].availability).toEqual([
      expect.objectContaining({ dia: 'lunes', inicio: '18:00', fin: '20:00' }),
      expect.objectContaining({ dia: 'martes', inicio: '18:00', fin: '20:00' }),
    ])
    expect(input.materias[0]).toMatchObject({
      titularId: 'doc-docente-invitado',
      titularMatch: 'career+subject',
    })
  })

  it('crea un docente derivado una sola vez si aparece en horarios pero no en docentes', () => {
    const input = buildInput({
      docentes: [
        {
          id: 'doc-existente',
          nombre: 'Docente Existente',
        },
      ],
      horariosDocentes: [
        {
          profesor: 'Docente Externo',
          carrera: 'Tecnicatura en Gestion',
          materia: 'Gestion I',
          dia: 'Lunes',
          turno: 'NOCHE',
        },
        {
          profesor: 'Docente Externo',
          carrera: 'Tecnicatura en Gestion',
          materia: 'Gestion II',
          dia: 'Martes',
          turno: 'NOCHE',
        },
      ],
      planesEstudio: [
        {
          id: 'plan-gestion-1',
          carrera: 'Tecnicatura en Gestion',
          materia: 'Gestion I',
          nombreMateria: 'Gestion I',
        },
        {
          id: 'plan-gestion-2',
          carrera: 'Tecnicatura en Gestion',
          materia: 'Gestion II',
          nombreMateria: 'Gestion II',
        },
      ],
      fechaInicio: '2026-07-27',
      fechaFin: '2026-07-31',
    })

    const derived = input.docentes.filter((docente) => docente.source === 'horariosDocentes')

    expect(derived).toHaveLength(1)
    expect(input.materias.map((materia) => materia.titularId)).toEqual([
      'doc-docente-externo',
      'doc-docente-externo',
    ])
  })

  it('conserva materias sin horario para revision de titular en el precronograma', () => {
    const input = buildInput({
      docentes: [
        {
          id: 'doc-gestion',
          nombre: 'Docente Gestion',
        },
      ],
      horariosDocentes: [
        {
          profesor: 'Docente Gestion',
          carrera: 'Tecnicatura en Gestion',
          materia: 'Gestion I',
          dia: 'Lunes',
          turno: 'NOCHE',
        },
      ],
      planesEstudio: [
        {
          id: 'plan-gestion-1',
          carrera: 'Tecnicatura en Gestion',
          materia: 'Gestion I',
          nombreMateria: 'Gestion I',
        },
        {
          id: 'plan-gestion-2',
          carrera: 'Tecnicatura en Gestion',
          materia: 'Gestion II',
          nombreMateria: 'Gestion II',
        },
      ],
      fechaInicio: '2026-07-27',
      fechaFin: '2026-07-31',
    })

    expect(input.materias).toHaveLength(2)
    expect(input.materias.find((materia) => materia.materia === 'Gestion I')).toMatchObject({
      titularId: 'doc-gestion',
      requiereMesa: true,
      requiereMesaSource: 'horariosDocentes',
    })
    expect(input.materias.find((materia) => materia.materia === 'Gestion II')).toMatchObject({
      titularId: '',
      requiereMesa: true,
      requiereMesaSource: 'sinHorarioDocente',
    })
  })

  it('prioriza docenteMateria sobre la inferencia desde horariosDocentes', () => {
    const input = buildInput({
      docentes: [
        {
          id: 'doc-canonico',
          nombre: 'Docente Canonico',
        },
        {
          id: 'doc-horario',
          nombre: 'Docente Horario',
        },
      ],
      docenteMateria: [
        {
          carrera: 'Tecnicatura en Gestion',
          materia_codigo: 'Gestion I',
          materia_nombre: 'Gestion I',
          docente: 'Docente Canonico',
          rol_en_materia: 'TITULAR',
          estado_asignacion: 'ACTIVO',
        },
      ],
      horariosDocentes: [
        {
          profesor: 'Docente Horario',
          carrera: 'Tecnicatura en Gestion',
          materia: 'Gestion I',
          dia: 'Lunes',
          turno: 'NOCHE',
        },
      ],
      planesEstudio: [
        {
          id: 'plan-gestion',
          carrera: 'Tecnicatura en Gestion',
          materia: 'Gestion I',
          nombreMateria: 'Gestion I',
        },
      ],
      fechaInicio: '2026-07-27',
      fechaFin: '2026-07-31',
    })

    expect(input.materias[0]).toMatchObject({
      titularId: 'doc-canonico',
      titularSource: 'docente_materia',
      titularResolutionStatus: 'TITULAR_ACTIVO',
      requiereMesa: true,
      requiereMesaSource: 'docente_materia',
    })
    expect(input.metadata.adapterDiagnostics.docenteMateria).toMatchObject({
      totalAsignacionesDocenteMateria: 1,
      titularesExplicitos: 1,
      materiasResueltasPorFallback: 0,
    })
  })

  it('en fuente relacional prioriza como titular al docente que figura en horarios', () => {
    const input = buildInput({
      workspaceSource: 'academic-relational-schema',
      docentes: [
        {
          id: 'doc-canonico',
          nombre: 'Docente Canonico',
        },
        {
          id: 'doc-horario',
          nombre: 'Docente Horario',
        },
      ],
      docenteMateria: [
        {
          carrera: 'Tecnicatura en Gestion',
          materia_codigo: 'Gestion I',
          materia_nombre: 'Gestion I',
          docente: 'Docente Canonico',
          rol_en_materia: 'TITULAR',
          estado_asignacion: 'ACTIVO',
        },
      ],
      horariosDocentes: [
        {
          profesor: 'Docente Horario',
          carrera: 'Tecnicatura en Gestion',
          materia: 'Gestion I',
          dia: 'Lunes',
          turno: 'NOCHE',
        },
      ],
      planesEstudio: [
        {
          id: 'plan-gestion',
          carrera: 'Tecnicatura en Gestion',
          materia: 'Gestion I',
          nombreMateria: 'Gestion I',
        },
      ],
      fechaInicio: '2026-07-27',
      fechaFin: '2026-07-31',
    })

    expect(input.materias[0]).toMatchObject({
      titularId: 'doc-horario',
      titularSource: 'horariosDocentes',
      titularMatch: 'career+subject',
      requiereMesa: true,
      requiereMesaSource: 'horariosDocentes',
    })
  })

  it('recupera desde horarios al unico docente cuando docenteMateria conserva una inferencia anterior', () => {
    const input = buildInput({
      docentes: [
        {
          id: 'doc-raya',
          nombre: 'Raya Natalia',
        },
      ],
      docenteMateria: [
        {
          docente_id: 'doc-raya',
          docente: 'RAYA NATALIA',
          carrera: 'Profesorado de Ingles',
          materia_codigo: 'ING26',
          materia_nombre: 'Didactica del Ingles II',
          rol_en_materia: 'TITULAR',
          estado_asignacion: 'ACTIVO',
          observaciones: 'Titular inferido por unico docente en horarios.',
        },
      ],
      horariosDocentes: [
        {
          profesor: 'RAYA NATALIA',
          carrera: 'Profesorado de Ingles',
          materia: 'ING26',
          nombreMateria: 'Didactica del Ingles II',
          dia: 'Jueves',
          turno: 'NOCHE',
        },
      ],
      planesEstudio: [
        {
          id: 'plan-ing26',
          carrera: 'Profesorado de Ingles',
          materia: 'ING26',
          nombreMateria: 'Didactica del Ingles II',
        },
      ],
      fechaInicio: '2026-07-27',
      fechaFin: '2026-07-31',
    })

    expect(input.materias[0]).toMatchObject({
      titularId: 'doc-raya',
      titularSource: 'horariosDocentes',
      titularResolutionStatus: 'SIN_TITULAR_VIGENTE',
      requiereMesaSource: 'horariosDocentes',
      docenteMateriaAssignmentsCount: 1,
    })
    expect(input.metadata.adapterDiagnostics.docenteMateria).toMatchObject({
      titularesExplicitos: 0,
      materiasResueltasPorFallback: 1,
    })
  })

  it('elige titular desde horarios en practica profesional multidocente', () => {
    const input = buildInput({
      docentes: [
        { id: 'doc-a', nombre: 'Docente A' },
        { id: 'doc-b', nombre: 'Docente B' },
      ],
      docenteMateria: [
        { docente_id: 'doc-a', docente: 'Docente A', carrera: 'Profesorado de Ingles', materia_codigo: 'PRA2', materia_nombre: 'Practica Profesional II', estado_asignacion: 'ACTIVO', observaciones: 'Detectado desde horarios.' },
        { docente_id: 'doc-b', docente: 'Docente B', carrera: 'Profesorado de Ingles', materia_codigo: 'PRA2', materia_nombre: 'Practica Profesional II', estado_asignacion: 'ACTIVO', observaciones: 'Detectado desde horarios.' },
      ],
      horariosDocentes: [
        { profesor: 'Docente A', carrera: 'Profesorado de Ingles', materia: 'PRA2', nombreMateria: 'Practica Profesional II', dia: 'Lunes' },
        { profesor: 'Docente B', carrera: 'Profesorado de Ingles', materia: 'PRA2', nombreMateria: 'Practica Profesional II', dia: 'Martes' },
      ],
      planesEstudio: [
        { id: 'plan-pra2', carrera: 'Profesorado de Ingles', materia: 'PRA2', nombreMateria: 'Practica Profesional II' },
      ],
      fechaInicio: '2026-07-27',
      fechaFin: '2026-07-31',
    })

    expect(input.materias[0]).toMatchObject({
      titularId: 'doc-a',
      titularSource: 'horariosDocentes',
      titularMatch: 'career+subject:cotitular-practica-profesional',
      requiereMesaSource: 'horariosDocentes',
    })
  })

  it('no elige titular desde horarios cuando una materia comun tiene mas de un docente', () => {
    const input = buildInput({
      docentes: [
        { id: 'doc-a', nombre: 'Docente A' },
        { id: 'doc-b', nombre: 'Docente B' },
      ],
      horariosDocentes: [
        { profesor: 'Docente A', carrera: 'Profesorado de Ingles', materia: 'ING2', nombreMateria: 'Lengua Inglesa II', dia: 'Lunes' },
        { profesor: 'Docente B', carrera: 'Profesorado de Ingles', materia: 'ING2', nombreMateria: 'Lengua Inglesa II', dia: 'Martes' },
      ],
      planesEstudio: [
        { id: 'plan-ing2', carrera: 'Profesorado de Ingles', materia: 'ING2', nombreMateria: 'Lengua Inglesa II' },
      ],
      fechaInicio: '2026-07-27',
      fechaFin: '2026-07-31',
    })

    expect(input.materias[0]).toMatchObject({
      titularId: '',
      titularSource: '',
      requiereMesaSource: 'sinHorarioDocente',
    })
  })

  it('usa cargaHorariaDocente como fuente normalizada de titularidad y suma horas por carreras', () => {
    const input = buildInput({
      docentes: [
        {
          id: 'doc-multi',
          nombre: 'Docente Multi Carrera',
        },
      ],
      cargaHorariaDocente: [
        {
          docente: 'Docente Multi Carrera',
          carrera: 'Profesorado de Ingles',
          materia_codigo: 'ING1',
          materia_nombre: 'Lengua Inglesa I',
          horasCatedra: 3,
          rol_en_materia: 'TITULAR',
          estado_asignacion: 'ACTIVO',
        },
        {
          docente: 'Docente Multi Carrera',
          carrera: 'Tecnicatura en Gestion',
          materia_codigo: 'GES1',
          materia_nombre: 'Gestion I',
          horasCatedra: 4,
          rol_en_materia: 'TITULAR',
          estado_asignacion: 'ACTIVO',
        },
      ],
      disponibilidadDocente: [
        {
          docente: 'Docente Multi Carrera',
          dia: 'Lunes',
          turno: 'NOCHE',
          hora_desde: '18:00',
          hora_hasta: '22:00',
        },
        {
          docente: 'Docente Multi Carrera',
          dia: 'Miercoles',
          turno: 'NOCHE',
          hora_desde: '18:00',
          hora_hasta: '22:00',
        },
      ],
      planesEstudio: [
        {
          id: 'plan-ing-1',
          carrera: 'Profesorado de Ingles',
          materia: 'ING1',
          nombreMateria: 'Lengua Inglesa I',
        },
        {
          id: 'plan-ges-1',
          carrera: 'Tecnicatura en Gestion',
          materia: 'GES1',
          nombreMateria: 'Gestion I',
        },
      ],
      fechaInicio: '2026-07-27',
      fechaFin: '2026-07-31',
    })

    expect(input.docentes).toHaveLength(1)
    expect(input.docentes[0]).toMatchObject({
      id: 'doc-multi',
      diasAsistencia: ['lunes', 'miercoles'],
      turnosDisponibles: ['NOCHE'],
      horasCatedra: 7,
      teachingHours: 7,
      horasCatedraSource: 'TEACHING_HOURS_EXPLICIT',
      teachingHoursDiagnostics: {
        validBlocks: 2,
        loadValidBlocks: 2,
        scheduleValidBlocks: 0,
      },
    })
    expect(input.docentes[0].availability).toEqual([
      expect.objectContaining({ dia: 'lunes', turno: 'NOCHE' }),
      expect.objectContaining({ dia: 'miercoles', turno: 'NOCHE' }),
    ])
    expect(input.materias.map((materia) => ({
      materia: materia.materia,
      titularId: materia.titularId,
      titularSource: materia.titularSource,
      requiereMesa: materia.requiereMesa,
    }))).toEqual([
      {
        materia: 'ING1',
        titularId: 'doc-multi',
        titularSource: 'carga_horaria_docente',
        requiereMesa: true,
      },
      {
        materia: 'GES1',
        titularId: 'doc-multi',
        titularSource: 'carga_horaria_docente',
        requiereMesa: true,
      },
    ])
    expect(input.metadata.adapterDiagnostics.sourceCounts).toMatchObject({
      disponibilidadDocente: 2,
      cargaHorariaDocente: 2,
      horariosDocentes: 0,
    })
    expect(input.metadata.teacherSource).toMatchObject({
      source: 'structured',
      hasStructuredTeacherSource: true,
      hasLegacyTeacherScheduleSource: false,
    })
    expect(input.metadata.teacherExamSourceContext).toMatchObject({
      source: 'structured',
      cargaHorariaPorDocente: {
        'teacher-docentemulticarrera': 7,
      },
      limiteAfectacionPorDocente: {
        'teacher-docentemulticarrera': 4,
      },
      diasAsistenciaPorDocente: {
        'teacher-docentemulticarrera': ['lunes', 'miercoles'],
      },
    })
    expect(input.metadata.teacherExamSourceContextMetadata).toMatchObject({
      source: 'structured',
      diagnostics: {
        counts: {
          docentes: 1,
          disponibilidadPorDocente: 2,
          materiasPorDocente: 2,
        },
      },
    })
  })

  it('usa la carga docente estructurada antes que la inferencia por horarios', () => {
    const input = buildInput({
      docentes: [
        { id: 'doc-estructurado', nombre: 'Docente Estructurado' },
        { id: 'doc-legacy', nombre: 'Docente Legacy' },
      ],
      cargaHorariaDocente: [{
        docente: 'Docente Estructurado',
        carrera: 'Profesorado',
        materia_codigo: 'ING1',
        materia_nombre: 'Ingles I',
        horasCatedra: 6,
        rol_en_materia: 'TITULAR',
        estado_asignacion: 'ACTIVO',
      }],
      disponibilidadDocente: [{
        docente: 'Docente Estructurado',
        dia: 'Martes',
        turno: 'NOCHE',
        hora_desde: '18:00',
        hora_hasta: '22:00',
      }],
      horariosDocentes: [{
        profesor: 'Docente Legacy',
        carrera: 'Profesorado',
        materia: 'ING1',
        dia: 'Lunes',
        turno: 'NOCHE',
        inicio: '18:00',
        fin: '20:00',
      }],
      planesEstudio: [{
        id: 'plan-ing',
        carrera: 'Profesorado',
        materia: 'ING1',
        nombreMateria: 'Ingles I',
      }],
      fechaInicio: '2026-07-27',
      fechaFin: '2026-07-31',
    })

    expect(input.materias[0]).toMatchObject({
      titularId: 'doc-estructurado',
      titularSource: 'carga_horaria_docente',
      requiereMesa: true,
    })
    expect(input.docentes.find((docente) => docente.id === 'doc-estructurado')).toMatchObject({
      diasAsistencia: ['martes'],
      horasCatedra: 6,
    })
    expect(input.docentes.find((docente) => docente.id === 'doc-legacy')).toMatchObject({
      horasCatedra: 0,
    })
    expect(input.metadata.teacherSource).toMatchObject({
      source: 'structured',
      hasStructuredTeacherSource: true,
      hasLegacyTeacherScheduleSource: true,
    })
  })

  it('conserva horariosDocentes como respaldo de titular con fuente estructurada activa', () => {
    const input = buildInput({
      docentes: [
        { id: 'doc-estructurado', nombre: 'Docente Estructurado' },
        { id: 'doc-legacy', nombre: 'Docente Legacy' },
      ],
      cargaHorariaDocente: [{
        docente: 'Docente Estructurado',
        carrera: 'Profesorado',
        materia_codigo: 'OTRA1',
        materia_nombre: 'Otra materia',
        horasCatedra: 6,
        rol_en_materia: 'TITULAR',
      }],
      disponibilidadDocente: [{
        docente: 'Docente Estructurado',
        dia: 'Martes',
        turno: 'NOCHE',
        hora_desde: '18:00',
        hora_hasta: '22:00',
      }],
      horariosDocentes: [{
        profesor: 'Docente Legacy',
        carrera: 'Profesorado',
        materia: 'ING1',
        nombreMateria: 'Ingles I',
        dia: 'Lunes',
        turno: 'NOCHE',
      }],
      planesEstudio: [{
        id: 'plan-ing',
        carrera: 'Profesorado',
        materia: 'ING1',
        nombreMateria: 'Ingles I',
      }],
      fechaInicio: '2026-07-27',
      fechaFin: '2026-07-31',
    })

    expect(input.materias[0]).toMatchObject({
      titularId: 'doc-legacy',
      titularSource: 'horariosDocentes',
      requiereMesa: true,
    })
    expect(input.docentes.find((docente) => docente.id === 'doc-legacy')).toMatchObject({
      horasCatedra: 0,
    })
  })

  it('no deja que filas de vocales oculten al titular informado en horarios', () => {
    const input = buildInput({
      docentes: [
        { id: 'doc-titular', nombre: 'Titular Horario' },
        { id: 'doc-vocal', nombre: 'Vocal Afin' },
      ],
      docenteMateria: [{
        docenteId: 'doc-vocal',
        docente: 'Vocal Afin',
        carrera: 'Laboratorio',
        materia: 'LAB1',
        rol_en_materia: 'VOCAL_AFIN',
      }],
      horariosDocentes: [{
        docenteId: 'doc-titular',
        profesor: 'Titular Horario',
        carrera: 'Laboratorio',
        materia: 'LAB1',
      }],
      planesEstudio: [{ id: 'LAB1', carrera: 'Laboratorio', materia: 'LAB1' }],
      fechaInicio: '2026-07-27',
      fechaFin: '2026-07-31',
    })

    expect(input.materias[0]).toMatchObject({
      titularId: 'doc-titular',
      titularSource: 'horariosDocentes',
    })
  })

  it('vincula titular cuando la carrera esta abreviada sin cruzar carreras homonimas', () => {
    const input = buildInput({
      docentes: [
        { id: 'doc-lab', nombre: 'Titular Laboratorio' },
        { id: 'doc-trad', nombre: 'Titular Traductorado' },
      ],
      horariosDocentes: [
        { docenteId: 'doc-lab', profesor: 'Titular Laboratorio', carrera: 'Laboratorio', materia: 'MAT1' },
        { docenteId: 'doc-trad', profesor: 'Titular Traductorado', carrera: 'Traductorado de Ingles', materia: 'MAT1' },
      ],
      planesEstudio: [{
        id: 'plan-lab',
        carrera: 'Tecnicatura Superior en Laboratorio de Analisis Clinicos',
        materia: 'MAT1',
        nombreMateria: 'Materia compartida',
      }],
      fechaInicio: '2026-07-27',
      fechaFin: '2026-07-31',
    })

    expect(input.materias[0]).toMatchObject({
      titularId: 'doc-lab',
      titularMatch: 'compatible-career+subject',
    })
  })

  it('conserva la equivalencia legacy entre codigos con y sin cero inicial', () => {
    const input = buildInput({
      docentes: [{ id: 'doc-ing', nombre: 'Titular Ingles' }],
      horariosDocentes: [{
        docenteId: 'doc-ing',
        profesor: 'Titular Ingles',
        carrera: 'Profesorado de Ingles',
        materia: 'ING01',
      }],
      planesEstudio: [{
        id: 'plan-ing1',
        carrera: 'Profesorado de Ingles',
        materia: 'ING1',
      }],
      fechaInicio: '2026-07-27',
      fechaFin: '2026-07-31',
    })

    expect(input.materias[0]).toMatchObject({
      titularId: 'doc-ing',
      titularSource: 'horariosDocentes',
    })
  })

  it('resuelve variantes seguras del nombre dentro de la misma carrera', () => {
    const input = buildInput({
      docentes: [{ id: 'doc-fisica', nombre: 'Titular Fisica' }],
      horariosDocentes: [{
        docenteId: 'doc-fisica',
        profesor: 'Titular Fisica',
        carrera: 'Profesorado de Quimica',
        materia: 'Fisica 2',
      }],
      planesEstudio: [{
        id: 'QUI08',
        carrera: 'Profesorado de Quimica',
        materia: 'QUI08',
        nombreMateria: 'Fisica II',
      }],
      fechaInicio: '2026-07-27',
      fechaFin: '2026-07-31',
    })

    expect(input.materias[0]).toMatchObject({
      titularId: 'doc-fisica',
      titularMatch: 'compatible-career+subject-name',
    })
  })

  it('advierte datos estructurados incompletos y cae a horariosDocentes legacy', () => {
    const input = buildInput({
      docentes: [
        { id: 'doc-legacy', nombre: 'Docente Legacy' },
      ],
      cargaHorariaDocente: [{
        docente: 'Docente Estructurado',
        materia_codigo: 'ING1',
        horasCatedra: '',
        rol_en_materia: 'TITULAR',
      }],
      disponibilidadDocente: [{
        docente: 'Docente Estructurado',
        hora_desde: '18:00',
        hora_hasta: '20:00',
      }],
      horariosDocentes: [{
        profesor: 'Docente Legacy',
        carrera: 'Profesorado',
        materia: 'ING1',
        dia: 'Lunes',
        turno: 'NOCHE',
        inicio: '18:00',
        fin: '20:00',
      }],
      planesEstudio: [{
        id: 'plan-ing',
        carrera: 'Profesorado',
        materia: 'ING1',
        nombreMateria: 'Ingles I',
      }],
      fechaInicio: '2026-07-27',
      fechaFin: '2026-07-31',
    })

    expect(input.materias[0]).toMatchObject({
      titularId: 'doc-legacy',
      titularSource: 'horariosDocentes',
    })
    expect(input.metadata.teacherSource).toMatchObject({
      source: 'legacy',
      hasStructuredTeacherSource: false,
      hasLegacyTeacherScheduleSource: true,
    })
    expect(input.metadata.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'INCOMPLETE_TEACHER_WORKLOAD',
        missing: expect.arrayContaining(['carrera', 'horas_catedra']),
      }),
      expect.objectContaining({
        code: 'INCOMPLETE_TEACHER_AVAILABILITY',
        missing: ['dia'],
      }),
    ]))
  })

  it('mantiene fallback desde horariosDocentes si no existe docenteMateria', () => {
    const input = buildInput({
      docentes: [
        {
          id: 'doc-gestion',
          nombre: 'Docente Gestion',
        },
      ],
      horariosDocentes: [
        {
          profesor: 'Docente Gestion',
          carrera: 'Tecnicatura en Gestion',
          materia: 'Gestion I',
          dia: 'Lunes',
          turno: 'NOCHE',
        },
      ],
      planesEstudio: [
        {
          id: 'plan-gestion',
          carrera: 'Tecnicatura en Gestion',
          materia: 'Gestion I',
          nombreMateria: 'Gestion I',
        },
      ],
      fechaInicio: '2026-07-27',
      fechaFin: '2026-07-31',
    })

    expect(input.materias[0]).toMatchObject({
      titularId: 'doc-gestion',
      titularSource: 'horariosDocentes',
      requiereMesa: true,
      requiereMesaSource: 'horariosDocentes',
    })
    expect(input.metadata.adapterDiagnostics.sourceCounts.docenteMateria).toBe(0)
  })

  it('crea mesa revisable si docenteMateria queda ambiguo sin titular vigente', () => {
    const input = buildInput({
      docentes: [],
      docenteMateria: [
        {
          carrera: 'Tecnicatura en Gestion',
          materia_codigo: 'Gestion I',
          materia_nombre: 'Gestion I',
          docente: 'Docente A',
          estado_asignacion: 'ACTIVO',
        },
        {
          carrera: 'Tecnicatura en Gestion',
          materia_codigo: 'Gestion I',
          materia_nombre: 'Gestion I',
          docente: 'Docente B',
          estado_asignacion: 'ACTIVO',
        },
      ],
      horariosDocentes: [],
      planesEstudio: [
        {
          id: 'plan-gestion',
          carrera: 'Tecnicatura en Gestion',
          materia: 'Gestion I',
          nombreMateria: 'Gestion I',
        },
      ],
      fechaInicio: '2026-07-27',
      fechaFin: '2026-07-31',
    })

    expect(input.materias[0]).toMatchObject({
      titularId: '',
      requiereMesa: true,
      requiereMesaSource: 'requiere_revision',
      titularSource: 'requiere_revision',
      titularResolutionStatus: 'AMBIGUO_REQUIERE_REVISION',
    })
    expect(input.metadata.adapterDiagnostics.docenteMateria).toMatchObject({
      materiasAmbiguas: 1,
      materiasSinTitularVigente: 0,
    })
  })

  it('usa reemplazo activo desde docenteMateria cuando el titular esta con licencia', () => {
    const input = buildInput({
      docentes: [
        {
          id: 'doc-titular',
          nombre: 'Docente Titular',
        },
        {
          id: 'doc-reemplazo',
          nombre: 'Docente Reemplazo',
        },
      ],
      docenteMateria: [
        {
          carrera: 'Tecnicatura en Gestion',
          materia_codigo: 'Gestion I',
          materia_nombre: 'Gestion I',
          docente: 'Docente Titular',
          rol_en_materia: 'TITULAR',
          estado_asignacion: 'LICENCIA',
        },
        {
          carrera: 'Tecnicatura en Gestion',
          materia_codigo: 'Gestion I',
          materia_nombre: 'Gestion I',
          docente: 'Docente Reemplazo',
          rol_en_materia: 'REEMPLAZO',
          estado_asignacion: 'ACTIVO',
        },
      ],
      horariosDocentes: [],
      planesEstudio: [
        {
          id: 'plan-gestion',
          carrera: 'Tecnicatura en Gestion',
          materia: 'Gestion I',
          nombreMateria: 'Gestion I',
        },
      ],
      fechaInicio: '2026-07-27',
      fechaFin: '2026-07-31',
    })

    expect(input.materias[0]).toMatchObject({
      titularId: 'doc-reemplazo',
      titularSource: 'docente_materia',
      titularMatch: 'reemplazo_activo',
      titularResolutionStatus: 'REEMPLAZO_ACTIVO',
      requiereMesa: true,
    })
    expect(input.metadata.adapterDiagnostics.docenteMateria).toMatchObject({
      reemplazosActivos: 1,
      licencias: 1,
    })
  })

  it('mantiene diagnosticos del adaptador sin nombres ni payload crudo', () => {
    const input = buildInput({
      docentes: [
        {
          id: 'doc-sensible',
          nombre: 'Nombre Sensible',
          email: 'persona@example.edu',
        },
      ],
      horariosDocentes: [
        {
          profesor: 'Nombre Sensible',
          carrera: 'Tecnicatura en Gestion',
          materia: 'Gestion I',
          dia: 'Lunes',
          turno: 'NOCHE',
        },
      ],
      planesEstudio: [
        {
          id: 'plan-gestion',
          carrera: 'Tecnicatura en Gestion',
          materia: 'Gestion I',
          nombreMateria: 'Gestion I',
        },
      ],
      fechaInicio: '2026-07-27',
      fechaFin: '2026-07-31',
    })

    const diagnostics = JSON.stringify(input.metadata.adapterDiagnostics)

    expect(diagnostics).not.toContain('Nombre Sensible')
    expect(diagnostics).not.toContain('persona@example.edu')
    expect(input.metadata.adapterDiagnostics.adaptedCounts).toMatchObject({
      docentes: 1,
      materiasConTitular: 1,
      docentesConDisponibilidad: 1,
    })
  })

  it('convierte correlatividades al formato esperado por examEngine', () => {
    const input = buildInput()

    expect(input.correlatividades).toEqual([
      {
        carreraId: 'prof-ingles',
        carrera: 'Profesorado de Ingles',
        materia: 'ING2',
        nombreMateria: 'Lengua Inglesa II',
        correlativas: ['ING1'],
      },
    ])
  })

  it('convierte regularCallRanges en fechasDisponibles', () => {
    const input = buildInput()
    const fechasPrimerLlamado = input.fechasDisponibles.filter((fecha) => fecha.llamado === 'PRIMER_LLAMADO')
    const fechasSegundoLlamado = input.fechasDisponibles.filter((fecha) => fecha.llamado === 'SEGUNDO_LLAMADO')

    expect(input.fechasDisponibles).toHaveLength(10)
    expect(fechasPrimerLlamado).toHaveLength(5)
    expect(fechasSegundoLlamado).toHaveLength(5)
    expect(input.fechasDisponibles[0]).toEqual({
      fecha: '2026-07-27',
      diaSemana: 'LUNES',
      llamado: 'PRIMER_LLAMADO',
      turno: 'NOCHE',
      disponible: true,
    })
    expect(fechasSegundoLlamado[0]).toMatchObject({
      fecha: '2026-08-03',
      diaSemana: 'LUNES',
    })
  })

  it('soporta snapshot con un solo llamado regular', () => {
    const input = buildInput(legacyWorkspaceSnapshotOneCall)

    expect(input.fechasDisponibles).toHaveLength(5)
    expect(new Set(input.fechasDisponibles.map((fecha) => fecha.llamado))).toEqual(new Set(['PRIMER_LLAMADO']))
    expect(input.config).toMatchObject({
      tipoPeriodo: 'REGULAR',
      cantidadLlamados: 1,
      fechaInicio: '2026-07-27',
      fechaFin: '2026-07-31',
    })
  })

  it('convierte el rango especial y conserva solo las materias seleccionadas', () => {
    const snapshot = {
      ...legacyWorkspaceSnapshotOneCall,
      examType: 'special',
      fechaInicio: '2026-07-30',
      fechaFin: '2026-07-31',
      selectedSpecialSubjectKeys: ['profesorado de ingles::ing1'],
    }
    const input = buildInput(snapshot)

    expect(input.config).toMatchObject({ tipoPeriodo: 'ESPECIAL', cantidadLlamados: 1 })
    expect(input.fechasDisponibles).toHaveLength(2)
    expect(input.fechasDisponibles.every((fecha) => fecha.llamado === 'LLAMADO_ESPECIAL')).toBe(true)
    expect(input.materias.map((materia) => materia.codigo)).toEqual(['ING1'])
  })

  it('convierte examType y generationScope en config y options', () => {
    const input = buildInput()

    expect(input.config).toMatchObject({
      tipoPeriodo: 'REGULAR',
      cantidadLlamados: 2,
      fechaInicio: '2026-07-27',
      fechaFin: '2026-08-07',
      generationScope: {
        careers: ['Profesorado de Ingles', 'Tecnicatura Superior en Desarrollo de Software'],
        respectCorrelativities: true,
      },
    })
    expect(input.options).toEqual({
      compact: 'safe',
      applyHalfPlusOneRule: true,
      halfPlusOneRuleMode: 'TEACHING_HOURS_HALF_PLUS_ONE',
      allowSameDayRelatedSubjects: true,
      respectCorrelativities: true,
      selectedSpecialSubjectKeys: [],
    })
  })

  it('incluye metadata util para futuras comparaciones', () => {
    const input = buildInput()

    expect(input.metadata).toMatchObject({
      source: 'legacyWorkspaceSnapshot',
      teacherNameToId: {
        'ana ingles i': 'doc-ing-1',
        'bruno ingles ii': 'doc-ing-2',
      },
      subjectCodeToId: {
        ing1: 'plan-ing-1',
        ing2: 'plan-ing-2',
      },
      counts: {
        docentes: 4,
        materias: 4,
        correlatividades: 1,
        fechasDisponibles: 10,
      },
      warnings: [],
    })
  })

  it('no muta snapshot original', () => {
    const snapshot = structuredClone(legacyWorkspaceSnapshot)
    const original = structuredClone(snapshot)

    buildRegularExamInputFromWorkspaceSnapshot(snapshot)

    expect(snapshot).toEqual(original)
  })

  it('no importa motor viejo', () => {
    const source = readFileSync(
      join(process.cwd(), 'src/utils/examEngine/comparison/buildRegularExamInputFromWorkspaceSnapshot.js'),
      'utf8',
    )
    const oldEngine = ['cronograma', 'Inteligente'].join('')

    expect(source).not.toContain(oldEngine)
  })

  it('no usa adaptador legacy', () => {
    const source = readFileSync(
      join(process.cwd(), 'src/utils/examEngine/comparison/buildRegularExamInputFromWorkspaceSnapshot.js'),
      'utf8',
    )
    const adapter = ['legacy', 'Adapter'].join('')

    expect(source).not.toContain(adapter)
  })
})
