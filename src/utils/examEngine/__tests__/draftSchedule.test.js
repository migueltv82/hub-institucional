import { describe, expect, it } from 'vitest'
import {
  august2026FieldTestConfig,
  getAugust2026FieldTestConfig,
} from '../fieldTest/august2026FieldTestConfig.js'
import { generateDraftExamSchedule } from '../planning/draftSchedule/generateDraftExamSchedule.js'
import {
  buildDraftScheduleTeacherRows,
  exportDraftScheduleForTeachers,
} from '../exports/exportDraftScheduleForTeachers.js'
import { importReviewedDraftSchedule } from '../planning/reviewedSchedule/importReviewedDraftSchedule.js'
import { generateTribunalsFromReviewedSchedule } from '../planning/tribunals/generateTribunalsFromReviewedSchedule.js'
import { exportGeneratedTribunalsForReview } from '../exports/exportGeneratedTribunalsForReview.js'
import { importFinalTribunalReview } from '../planning/finalReview/importFinalTribunalReview.js'
import { exportFinalTribunalsOfficial } from '../exports/exportFinalTribunalsOfficial.js'
import { exportFinalTribunalAlerts } from '../exports/exportFinalTribunalAlerts.js'

function docente(overrides = {}) {
  return {
    id: 'doc-titular',
    nombre: 'Ana Titular',
    activo: true,
    ...overrides,
  }
}

function materia(overrides = {}) {
  return {
    id: 'MAT1',
    materia: 'MAT1',
    nombreMateria: 'Didactica General',
    carreraId: 'prof-historia',
    carrera: 'Profesorado de Historia',
    anio: 1,
    titular_id: 'doc-titular',
    requiereMesa: true,
    ...overrides,
  }
}

function readyReviewedMesa(overrides = {}) {
  return {
    id: 'draft:prof-historia::MAT1:PRIMER_LLAMADO',
    draftMesaId: 'draft:prof-historia::MAT1:PRIMER_LLAMADO',
    fecha: '2026-07-30',
    fechaSugerida: '2026-07-30',
    carreraId: 'prof-historia',
    carrera: 'Profesorado de Historia',
    anio: 1,
    materiaId: 'MAT1',
    materiaMesa: 'Didactica General',
    materia: 'Didactica General',
    titularId: 'doc-titular',
    titular: 'Ana Titular',
    estado: 'READY_FOR_TRIBUNAL',
    lockedForTribunalGeneration: true,
    reviewSource: 'TEACHER_REVIEW_IMPORT',
    manualOverrides: {
      fecha: false,
      titular: false,
      materiaMesa: false,
      excluded: false,
    },
    alertas: [],
    ...overrides,
  }
}

function tribunalDocente(overrides = {}) {
  return {
    id: 'doc-vocal-a',
    nombre: 'Bruno Vocal',
    activo: true,
    carrera: 'Profesorado de Historia',
    nombreMateria: 'Didactica General',
    diasAsistencia: ['jueves'],
    horasCatedra: 6,
    ...overrides,
  }
}

function generatedTribunal(overrides = {}) {
  return {
    ...readyReviewedMesa(),
    vocal1: 'Bruno Vocal',
    vocal1Id: 'doc-vocal-a',
    vocal2: 'Carla Vocal',
    vocal2Id: 'doc-vocal-b',
    estado: 'TRIBUNAL_COMPLETE',
    decisionTrace: [],
    alertas: [],
    ...overrides,
  }
}

function finalReviewRow(overrides = {}) {
  return {
    draftMesaId: 'draft:prof-historia::MAT1:PRIMER_LLAMADO',
    vocal1: 'Bruno Vocal',
    vocal2: 'Carla Vocal',
    estadoFinal: 'FINAL_CONFIRMED',
    ...overrides,
  }
}

const dynamicExamCallConfig = {
  fechaInicio: '2026-07-30',
  fechaFin: '2026-08-12',
  usarDiasHabiles: true,
  carrerasIncluidas: 'ALL',
  estadoSalida: 'TEACHER_REVIEW',
}

describe('examEngine draft schedule v2.1', () => {
  it('expone la configuracion del llamado Julio-Agosto 2026 con dias habiles esperados', () => {
    expect(august2026FieldTestConfig).toMatchObject({
      fechaInicio: '2026-07-30',
      fechaFin: '2026-08-12',
      estadoSalida: 'TEACHER_REVIEW',
      carrerasIncluidas: 'ALL',
      asignarVocales: false,
      aplicarMitadMasUno: false,
    })
    expect(august2026FieldTestConfig.fechasHabiles).toEqual([
      '2026-07-30',
      '2026-07-31',
      '2026-08-03',
      '2026-08-04',
      '2026-08-05',
      '2026-08-06',
      '2026-08-07',
      '2026-08-10',
      '2026-08-11',
      '2026-08-12',
    ])
  })

  it('genera precronograma con titulares, estado TEACHER_REVIEW y sin vocales', () => {
    const result = generateDraftExamSchedule({
      docentes: [docente()],
      materias: [
        materia({
          id: 'GEO3',
          nombreMateria: 'Geografia Argentina',
          carreraId: 'prof-geografia',
          carrera: 'Profesorado de Geografia',
          anio: 3,
        }),
        materia({
          id: 'GEO4',
          nombreMateria: 'Geografia Regional',
          carreraId: 'prof-geografia',
          carrera: 'Profesorado de Geografia',
          anio: '4to',
        }),
        materia({
          id: 'HIS1',
          nombreMateria: 'Historia Antigua',
          carreraId: 'prof-historia',
          carrera: 'Profesorado de Historia',
          anio: 1,
        }),
      ],
    })

    expect(result.draftSchedule).toHaveLength(2)
    expect(result.excluded).toEqual(expect.arrayContaining([
      expect.objectContaining({
        materiaId: 'GEO3',
        reason: 'GEOGRAFIA_SOLO_CUARTO_ANIO',
      }),
    ]))
    expect(result.draftSchedule.map((mesa) => mesa.estado)).toEqual([
      'TEACHER_REVIEW',
      'TEACHER_REVIEW',
    ])
    result.draftSchedule.forEach((mesa) => {
      expect(mesa.draftMesaId).toBe(mesa.id)
      expect(mesa).not.toHaveProperty('vocal1Id')
      expect(mesa).not.toHaveProperty('vocal2Id')
      expect(mesa).not.toHaveProperty('vocal1')
      expect(mesa).not.toHaveProperty('vocal2')
      expect(mesa.titular).toBe('Ana Titular')
      expect(august2026FieldTestConfig.fechasHabiles).toContain(mesa.fechaSugerida)
    })
  })

  it('genera mesa con alerta si falta titular en lugar de descartar la materia', () => {
    const result = generateDraftExamSchedule({
      docentes: [],
      materias: [
        materia({
          id: 'MAT-SIN-TITULAR',
          titular_id: '',
        }),
      ],
    })

    expect(result.draftSchedule).toHaveLength(1)
    expect(result.draftSchedule[0]).toMatchObject({
      titular: 'A designar',
      estado: 'TEACHER_REVIEW',
    })
    expect(result.draftSchedule[0].alertas).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'TITULAR_REQUIRED' }),
    ]))
    expect(result.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'TITULAR_REQUIRED' }),
    ]))
  })

  it('acepta configuracion dinamica desde frontend y genera fechas habiles por rango', () => {
    const result = generateDraftExamSchedule({
      docentes: [docente()],
      materias: [
        materia({
          id: 'GEO3',
          nombreMateria: 'Geografia Politica',
          carreraId: 'prof-geografia',
          carrera: 'Profesorado de Geografia',
          anio: 3,
        }),
        materia({
          id: 'GEO4',
          nombreMateria: 'Geografia Urbana',
          carreraId: 'prof-geografia',
          carrera: 'Profesorado de Geografia',
          anio: 4,
        }),
        materia({
          id: 'HIS2',
          nombreMateria: 'Historia Medieval',
          carreraId: 'prof-historia',
          carrera: 'Profesorado de Historia',
          anio: 2,
        }),
      ],
      examCallConfig: {
        fechaInicio: '2026-11-27',
        fechaFin: '2026-12-02',
        usarDiasHabiles: true,
        carrerasIncluidas: 'ALL',
        excepcionesPorCarrera: [
          {
            carrera: 'Profesorado de Geografia',
            soloAnios: [4],
          },
        ],
        estadoSalida: 'TEACHER_REVIEW',
      },
    })

    expect(result.metadata.fechasHabiles).toEqual([
      '2026-11-27',
      '2026-11-30',
      '2026-12-01',
      '2026-12-02',
    ])
    expect(result.draftSchedule).toHaveLength(2)
    expect(result.excluded).toEqual(expect.arrayContaining([
      expect.objectContaining({
        materiaId: 'GEO3',
        reason: 'CARRERA_SOLO_ANIOS_CONFIGURADOS',
      }),
    ]))
    expect(result.draftSchedule.map((mesa) => mesa.fechaSugerida)).toEqual([
      '2026-11-27',
      '2026-11-30',
    ])
  })

  it('excluye varios anios de una o varias carreras seleccionadas', () => {
    const result = generateDraftExamSchedule({
      docentes: [docente()],
      materias: [
        materia({ id: 'GEO1', materia: 'GEO1', carrera: 'Profesorado de Geografia', anio: 1 }),
        materia({ id: 'GEO2', materia: 'GEO2', carrera: 'Profesorado de Geografia', anio: 2 }),
        materia({ id: 'QUI1', materia: 'QUI1', carrera: 'Profesorado de Quimica', anio: 1 }),
        materia({ id: 'ING1', materia: 'ING1', carrera: 'Profesorado de Ingles', anio: 1 }),
      ],
      examCallConfig: {
        fechaInicio: '2026-11-27',
        fechaFin: '2026-12-02',
        usarDiasHabiles: true,
        carrerasIncluidas: 'ALL',
        excepcionesPorCarrera: [{
          carreras: ['Profesorado de Geografia', 'Profesorado de Quimica'],
          aniosExcluidos: [1],
        }],
      },
    })

    expect(result.excluded.map((item) => item.materiaId)).toEqual(expect.arrayContaining(['GEO1', 'QUI1']))
    expect(result.excluded).toEqual(expect.arrayContaining([
      expect.objectContaining({ reason: 'CARRERA_ANIO_EXCLUIDO' }),
    ]))
    expect(result.draftSchedule.map((item) => item.materiaId)).toEqual(expect.arrayContaining(['GEO2', 'ING1']))
  })

  it('distribuye de manera deterministica entre fechas habiles y no muta la config', () => {
    const config = getAugust2026FieldTestConfig()
    config.fechasHabiles = ['2026-07-30', '2026-07-31']
    const input = {
      config,
      docentes: [docente()],
      materias: [
        materia({ id: 'MAT1', nombreMateria: 'Materia 1' }),
        materia({ id: 'MAT2', nombreMateria: 'Materia 2' }),
        materia({ id: 'MAT3', nombreMateria: 'Materia 3' }),
      ],
    }
    const snapshot = structuredClone(input)

    const first = generateDraftExamSchedule(input)
    const second = generateDraftExamSchedule(input)

    expect(first.draftSchedule.map((mesa) => mesa.fechaSugerida)).toEqual([
      '2026-07-30',
      '2026-07-31',
      '2026-07-30',
    ])
    expect(second.draftSchedule).toEqual(first.draftSchedule)
    expect(input).toEqual(snapshot)
  })

  it('por defecto (sin fechaAssignmentStrategy configurado), respeta el dia en que asiste el titular', () => {
    const config = getAugust2026FieldTestConfig()
    config.fechasHabiles = ['2026-07-30', '2026-07-31']
    const result = generateDraftExamSchedule({
      config,
      docentes: [
        docente({ id: 'doc-viernes', nombre: 'Vero Viernes', diasAsistencia: ['viernes'] }),
        docente({ id: 'doc-jueves', nombre: 'Jorge Jueves', diasAsistencia: ['jueves'] }),
      ],
      materias: [
        materia({ id: 'MAT1', nombreMateria: 'Materia 1', titular_id: 'doc-viernes' }),
        materia({ id: 'MAT2', nombreMateria: 'Materia 2', titular_id: 'doc-jueves' }),
      ],
    })

    expect(result.draftSchedule).toEqual(expect.arrayContaining([
      expect.objectContaining({ materiaId: 'MAT1', fechaSugerida: '2026-07-31' }),
      expect.objectContaining({ materiaId: 'MAT2', fechaSugerida: '2026-07-30' }),
    ]))
  })

  it('forzando fechaAssignmentStrategy roundRobin, revierte al comportamiento historico sin deploy de codigo', () => {
    const config = getAugust2026FieldTestConfig()
    config.fechasHabiles = ['2026-07-30', '2026-07-31']
    config.fechaAssignmentStrategy = 'roundRobin'
    const result = generateDraftExamSchedule({
      config,
      docentes: [docente({ id: 'doc-viernes', nombre: 'Vero Viernes', diasAsistencia: ['viernes'] })],
      materias: [materia({ id: 'MAT1', nombreMateria: 'Materia 1', titular_id: 'doc-viernes' })],
    })

    expect(result.draftSchedule[0].fechaSugerida).toBe('2026-07-30')
  })

  it('prepara filas normalizadas para revision docente', () => {
    const result = generateDraftExamSchedule({
      docentes: [docente()],
      materias: [materia()],
    })

    const rows = buildDraftScheduleTeacherRows(result)
    const exported = exportDraftScheduleForTeachers(result, {
      generatedAt: '2026-06-30',
    })

    expect(rows).toEqual([
      expect.objectContaining({
        draftMesaId: result.draftSchedule[0].draftMesaId,
        fecha: '2026-07-30',
        carrera: 'Profesorado de Historia',
        anio: '1',
        materiaMesa: 'Didactica General',
        titular: 'Ana Titular',
        estadoVisible: 'Revision docente',
        estado: 'TEACHER_REVIEW',
        correccionSugerida: '',
      }),
    ])
    expect(exported.columns.map((column) => column.label)).toEqual([
      'ID Mesa',
      'Fecha',
      'Carrera',
      'A\u00f1o',
      'Materia/Mesa',
      'Titular',
      'Estado',
      'Observaciones',
      'Correcci\u00f3n sugerida',
      'Confirmada',
      'Excluir mesa',
      'Nuevo titular sugerido',
      'Nueva fecha sugerida',
      'Observaciones docentes',
    ])
    expect(exported.metadata).toMatchObject({
      totalRows: 1,
      generatedAt: '2026-06-30',
      teacherReview: true,
    })
  })

  it('importa una fila confirmada sin cambios y la deja lista para tribunales', () => {
    const draft = generateDraftExamSchedule({
      docentes: [docente()],
      materias: [materia()],
    })
    const [row] = buildDraftScheduleTeacherRows(draft)

    const result = importReviewedDraftSchedule({
      originalDraftSchedule: draft.draftSchedule,
      reviewedRows: [{ ...row, confirmada: 'si' }],
      docentes: [docente()],
      config: getAugust2026FieldTestConfig(),
    })

    expect(result.reviewedSchedule).toHaveLength(1)
    expect(result.reviewedSchedule[0]).toMatchObject({
      draftMesaId: draft.draftSchedule[0].draftMesaId,
      estado: 'READY_FOR_TRIBUNAL',
      lockedForTribunalGeneration: true,
      reviewSource: 'TEACHER_REVIEW_IMPORT',
      manualOverrides: {
        fecha: false,
        titular: false,
        materiaMesa: false,
        excluded: false,
      },
    })
    expect(result.reviewedSchedule[0]).not.toHaveProperty('vocal1Id')
    expect(result.reviewedSchedule[0]).not.toHaveProperty('vocal2Id')
    expect(result.metadata).toMatchObject({
      vocalesAsignados: false,
      mitadMasUnoAplicada: false,
    })
  })

  it('importa una fila con cambio de fecha y registra override manual', () => {
    const draft = generateDraftExamSchedule({
      docentes: [docente()],
      materias: [materia()],
    })
    const [row] = buildDraftScheduleTeacherRows(draft)

    const result = importReviewedDraftSchedule({
      originalDraftSchedule: draft.draftSchedule,
      reviewedRows: [{ ...row, nuevaFechaSugerida: '2026-07-31' }],
      docentes: [docente()],
      config: getAugust2026FieldTestConfig(),
    })

    expect(result.reviewedSchedule[0]).toMatchObject({
      fecha: '2026-07-31',
      fechaSugerida: '2026-07-31',
      estado: 'REVIEWED',
      manualOverrides: expect.objectContaining({ fecha: true }),
    })
    expect(result.reviewedSchedule[0].reviewChanges).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: 'fecha', from: '2026-07-30', to: '2026-07-31' }),
    ]))
    expect(result.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'MANUAL_OVERRIDES_DETECTED' }),
    ]))
  })

  it('importa una fila con cambio de titular y conserva el titular resuelto', () => {
    const docenteNuevo = docente({
      id: 'doc-titular-2',
      nombre: 'Beatriz Titular',
    })
    const draft = generateDraftExamSchedule({
      docentes: [docente(), docenteNuevo],
      materias: [materia()],
    })
    const [row] = buildDraftScheduleTeacherRows(draft)

    const result = importReviewedDraftSchedule({
      originalDraftSchedule: draft.draftSchedule,
      reviewedRows: [{ ...row, nuevoTitularSugerido: 'Beatriz Titular' }],
      docentes: [docente(), docenteNuevo],
      config: getAugust2026FieldTestConfig(),
    })

    expect(result.reviewedSchedule[0]).toMatchObject({
      titularId: 'doc-titular-2',
      titular: 'Beatriz Titular',
      estado: 'REVIEWED',
      manualOverrides: expect.objectContaining({ titular: true }),
    })
    expect(result.reviewedSchedule[0].reviewChanges).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: 'titular', titularId: 'doc-titular-2' }),
    ]))
  })

  it('importa una fila marcada como excluida', () => {
    const draft = generateDraftExamSchedule({
      docentes: [docente()],
      materias: [materia()],
    })
    const [row] = buildDraftScheduleTeacherRows(draft)

    const result = importReviewedDraftSchedule({
      originalDraftSchedule: draft.draftSchedule,
      reviewedRows: [{ ...row, excluirMesa: 'x', observacionesDocentes: 'No corresponde al llamado.' }],
      docentes: [docente()],
      config: getAugust2026FieldTestConfig(),
    })

    expect(result.reviewedSchedule[0]).toMatchObject({
      estado: 'EXCLUDED_BY_REVIEW',
      excluida: true,
      lockedForTribunalGeneration: false,
      observacionesDocentes: 'No corresponde al llamado.',
      manualOverrides: expect.objectContaining({ excluded: true }),
    })
  })

  it('detecta ID inexistente y lo deja para revision institucional', () => {
    const draft = generateDraftExamSchedule({
      docentes: [docente()],
      materias: [materia()],
    })

    const result = importReviewedDraftSchedule({
      originalDraftSchedule: draft.draftSchedule,
      reviewedRows: [{
        draftMesaId: 'draft:id-inexistente',
        fecha: '2026-07-30',
        titular: 'Ana Titular',
        confirmada: 'si',
      }],
      docentes: [docente()],
      config: getAugust2026FieldTestConfig(),
    })

    const unknown = result.reviewedSchedule.find((mesa) => mesa.draftMesaId === 'draft:id-inexistente')
    expect(unknown).toMatchObject({
      estado: 'NEEDS_INSTITUTIONAL_REVIEW',
      lockedForTribunalGeneration: false,
    })
    expect(result.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'UNKNOWN_DRAFT_MESA_ID' }),
    ]))
  })

  it('detecta fecha corregida fuera del llamado', () => {
    const draft = generateDraftExamSchedule({
      docentes: [docente()],
      materias: [materia()],
    })
    const [row] = buildDraftScheduleTeacherRows(draft)

    const result = importReviewedDraftSchedule({
      originalDraftSchedule: draft.draftSchedule,
      reviewedRows: [{ ...row, nuevaFechaSugerida: '2026-08-20', confirmada: 'si' }],
      docentes: [docente()],
      config: getAugust2026FieldTestConfig(),
    })

    expect(result.reviewedSchedule[0]).toMatchObject({
      estado: 'NEEDS_INSTITUTIONAL_REVIEW',
      lockedForTribunalGeneration: false,
    })
    expect(result.reviewedSchedule[0].alertas).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'REVIEWED_DATE_OUT_OF_PERIOD' }),
    ]))
    expect(result.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'REVIEWED_DATE_OUT_OF_PERIOD' }),
    ]))
  })

  it('genera tribunal completo desde mesa READY_FOR_TRIBUNAL respetando datos bloqueados', () => {
    const result = generateTribunalsFromReviewedSchedule({
      reviewedSchedule: [readyReviewedMesa()],
      docentes: [
        tribunalDocente({ id: 'doc-titular', nombre: 'Ana Titular' }),
        tribunalDocente({ id: 'doc-vocal-a', nombre: 'Bruno Vocal' }),
        tribunalDocente({ id: 'doc-vocal-b', nombre: 'Carla Vocal', nombreMateria: 'Historia Antigua' }),
      ],
      examCallConfig: dynamicExamCallConfig,
    })

    expect(result.generatedTribunals).toHaveLength(1)
    expect(result.generatedTribunals[0]).toMatchObject({
      draftMesaId: 'draft:prof-historia::MAT1:PRIMER_LLAMADO',
      fecha: '2026-07-30',
      materiaMesa: 'Didactica General',
      titular: 'Ana Titular',
      titularId: 'doc-titular',
      estado: 'TRIBUNAL_COMPLETE',
      lockedForTribunalGeneration: true,
      reviewSource: 'TEACHER_REVIEW_IMPORT',
    })
    expect(result.generatedTribunals[0].vocal1Id).not.toBe('doc-titular')
    expect(result.generatedTribunals[0].vocal2Id).not.toBe('doc-titular')
    expect(result.generatedTribunals[0].vocal1Id).not.toBe(result.generatedTribunals[0].vocal2Id)
    expect(result.generatedTribunals[0].decisionTrace).toEqual(expect.arrayContaining([
      'Fecha, materia y titular respetados desde cronograma revisado.',
    ]))
  })

  it('no procesa mesa EXCLUDED_BY_REVIEW', () => {
    const result = generateTribunalsFromReviewedSchedule({
      reviewedSchedule: [
        readyReviewedMesa({
          estado: 'EXCLUDED_BY_REVIEW',
          excluida: true,
        }),
      ],
      docentes: [
        tribunalDocente({ id: 'doc-titular', nombre: 'Ana Titular' }),
        tribunalDocente({ id: 'doc-vocal-a', nombre: 'Bruno Vocal' }),
      ],
      examCallConfig: dynamicExamCallConfig,
    })

    expect(result.generatedTribunals).toEqual([])
    expect(result.skippedMesas).toEqual([
      expect.objectContaining({ reason: 'MESA_EXCLUDED_SKIPPED' }),
    ])
    expect(result.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'MESA_EXCLUDED_SKIPPED' }),
    ]))
  })

  it('permite tribunal minimo con alerta si hay un solo vocal valido', () => {
    const result = generateTribunalsFromReviewedSchedule({
      reviewedSchedule: [readyReviewedMesa()],
      docentes: [
        tribunalDocente({ id: 'doc-titular', nombre: 'Ana Titular' }),
        tribunalDocente({ id: 'doc-vocal-a', nombre: 'Bruno Vocal' }),
      ],
      examCallConfig: dynamicExamCallConfig,
    })

    expect(result.generatedTribunals[0]).toMatchObject({
      estado: 'TRIBUNAL_MINIMUM',
      vocal1Id: 'doc-vocal-a',
      vocal2Id: '',
    })
    expect(result.generatedTribunals[0].alertas).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'TRIBUNAL_MINIMUM_ONLY' }),
    ]))
  })

  it('marca tribunal incompleto si no hay vocales', () => {
    const result = generateTribunalsFromReviewedSchedule({
      reviewedSchedule: [readyReviewedMesa()],
      docentes: [
        tribunalDocente({ id: 'doc-titular', nombre: 'Ana Titular' }),
      ],
      examCallConfig: dynamicExamCallConfig,
    })

    expect(result.generatedTribunals[0]).toMatchObject({
      estado: 'TRIBUNAL_INCOMPLETE',
      vocal1Id: '',
      vocal2Id: '',
    })
    expect(result.generatedTribunals[0].alertas).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'NO_VOCAL_CANDIDATES' }),
    ]))
  })

  it('aplica mitad mas uno solo a vocalias y no cuenta titularidades previas', () => {
    const result = generateTribunalsFromReviewedSchedule({
      reviewedSchedule: [readyReviewedMesa()],
      docentes: [
        tribunalDocente({ id: 'doc-titular', nombre: 'Ana Titular', horasCatedra: 0 }),
        tribunalDocente({ id: 'doc-vocal-limitado', nombre: 'Bruno Limitado', horasCatedra: 2 }),
      ],
      teacherAssignments: [
        {
          docenteId: 'doc-vocal-limitado',
          mesaId: 'mesa-previa-titular',
          rol: 'TITULAR',
          llamado: 'PRIMER_LLAMADO',
          fecha: '2026-07-30',
        },
        {
          docenteId: 'doc-vocal-limitado',
          mesaId: 'mesa-previa-vocal',
          rol: 'VOCAL_1',
          llamado: 'PRIMER_LLAMADO',
          fecha: '2026-07-31',
        },
      ],
      examCallConfig: dynamicExamCallConfig,
    })

    expect(result.generatedTribunals[0]).toMatchObject({
      estado: 'TRIBUNAL_MINIMUM',
      vocal1Id: 'doc-vocal-limitado',
    })
    expect(result.errors).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'TEACHER_EXCEEDS_HALF_PLUS_ONE' }),
    ]))
    expect(result.metadata.halfPlusOneAppliedToVocaliasOnly).toBe(true)
  })

  it('exporta tribunales generados para revision institucional', () => {
    const result = generateTribunalsFromReviewedSchedule({
      reviewedSchedule: [readyReviewedMesa()],
      docentes: [
        tribunalDocente({ id: 'doc-titular', nombre: 'Ana Titular' }),
        tribunalDocente({ id: 'doc-vocal-a', nombre: 'Bruno Vocal' }),
        tribunalDocente({ id: 'doc-vocal-b', nombre: 'Carla Vocal' }),
      ],
      examCallConfig: dynamicExamCallConfig,
    })

    const exported = exportGeneratedTribunalsForReview(result, {
      generatedAt: '2026-06-30',
    })

    expect(exported.columns.map((column) => column.label)).toEqual([
      'ID Mesa',
      'Fecha',
      'Carrera',
      'A\u00f1o',
      'Materia/Mesa',
      'Titular',
      'Vocal 1',
      'Vocal 2',
      'Estado',
      'Alertas',
      'Observaciones',
      'Correcci\u00f3n institucional',
    ])
    expect(exported.rows).toEqual([
      expect.objectContaining({
        draftMesaId: 'draft:prof-historia::MAT1:PRIMER_LLAMADO',
        fecha: '2026-07-30',
        titular: 'Ana Titular',
        estado: 'TRIBUNAL_COMPLETE',
      }),
    ])
    expect(exported.metadata).toMatchObject({
      totalRows: 1,
      generatedAt: '2026-06-30',
      institutionalReview: true,
    })
  })

  it('importa revision final sin cambios y confirma oficialmente', () => {
    const result = importFinalTribunalReview({
      generatedTribunals: [generatedTribunal()],
      reviewedRows: [finalReviewRow()],
      docentes: [
        tribunalDocente({ id: 'doc-titular', nombre: 'Ana Titular' }),
        tribunalDocente({ id: 'doc-vocal-a', nombre: 'Bruno Vocal' }),
        tribunalDocente({ id: 'doc-vocal-b', nombre: 'Carla Vocal' }),
      ],
      examCallConfig: dynamicExamCallConfig,
    })

    expect(result.finalTribunals).toHaveLength(1)
    expect(result.finalTribunals[0]).toMatchObject({
      estadoFinal: 'FINAL_CONFIRMED',
      finalReviewSource: 'INSTITUTIONAL_FINAL_REVIEW',
      finalManualOverrides: {
        vocal1: false,
        vocal2: false,
        estado: true,
        observaciones: false,
        excluded: false,
        tribunalMinimoAceptado: false,
      },
      finalValidation: expect.objectContaining({ valid: true }),
    })
  })

  it('registra cambio manual de Vocal 1', () => {
    const result = importFinalTribunalReview({
      generatedTribunals: [generatedTribunal()],
      reviewedRows: [finalReviewRow({ vocal1: 'Dario Vocal' })],
      docentes: [
        tribunalDocente({ id: 'doc-titular', nombre: 'Ana Titular' }),
        tribunalDocente({ id: 'doc-vocal-a', nombre: 'Bruno Vocal' }),
        tribunalDocente({ id: 'doc-vocal-b', nombre: 'Carla Vocal' }),
        tribunalDocente({ id: 'doc-vocal-c', nombre: 'Dario Vocal' }),
      ],
      examCallConfig: dynamicExamCallConfig,
    })

    expect(result.finalTribunals[0]).toMatchObject({
      vocal1: 'Dario Vocal',
      vocal1Id: 'doc-vocal-c',
      estadoFinal: 'FINAL_CONFIRMED',
      finalManualOverrides: expect.objectContaining({ vocal1: true }),
    })
  })

  it('registra cambio manual de Vocal 2', () => {
    const result = importFinalTribunalReview({
      generatedTribunals: [generatedTribunal()],
      reviewedRows: [finalReviewRow({ vocal2: 'Dario Vocal' })],
      docentes: [
        tribunalDocente({ id: 'doc-titular', nombre: 'Ana Titular' }),
        tribunalDocente({ id: 'doc-vocal-a', nombre: 'Bruno Vocal' }),
        tribunalDocente({ id: 'doc-vocal-b', nombre: 'Carla Vocal' }),
        tribunalDocente({ id: 'doc-vocal-c', nombre: 'Dario Vocal' }),
      ],
      examCallConfig: dynamicExamCallConfig,
    })

    expect(result.finalTribunals[0]).toMatchObject({
      vocal2: 'Dario Vocal',
      vocal2Id: 'doc-vocal-c',
      estadoFinal: 'FINAL_CONFIRMED',
      finalManualOverrides: expect.objectContaining({ vocal2: true }),
    })
  })

  it('detecta vocal inexistente en revision final', () => {
    const result = importFinalTribunalReview({
      generatedTribunals: [generatedTribunal()],
      reviewedRows: [finalReviewRow({ vocal1: 'Docente Inexistente' })],
      docentes: [
        tribunalDocente({ id: 'doc-titular', nombre: 'Ana Titular' }),
        tribunalDocente({ id: 'doc-vocal-a', nombre: 'Bruno Vocal' }),
        tribunalDocente({ id: 'doc-vocal-b', nombre: 'Carla Vocal' }),
      ],
      examCallConfig: dynamicExamCallConfig,
    })

    expect(result.finalTribunals[0]).toMatchObject({
      estadoFinal: 'FINAL_BLOCKED_BY_VALIDATION',
    })
    expect(result.finalTribunals[0].alertasFinales).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'FINAL_VOCAL_NOT_FOUND' }),
    ]))
  })

  it('acepta un titular cruzado como vocal de una mesa combinada', () => {
    const result = importFinalTribunalReview({
      generatedTribunals: [generatedTribunal({
        materiaMesa: 'Didactica General / Quimica I',
        materia: 'Didactica General / Quimica I',
        vocal1: 'Diana Titular',
        vocal1Id: 'doc-titular-2',
        metadata: {
          crossTitularVocales: [{
            docenteId: 'doc-titular-2',
            nombre: 'Diana Titular',
            rol: 'VOCAL_1',
          }],
        },
      })],
      reviewedRows: [finalReviewRow({ vocal1: 'Diana Titular' })],
      docentes: [
        tribunalDocente({ id: 'doc-titular', nombre: 'Ana Titular' }),
        tribunalDocente({
          id: 'doc-titular-2',
          nombre: 'Diana Titular',
          carrera: 'Profesorado de Quimica',
          nombreMateria: 'Quimica I',
        }),
        tribunalDocente({ id: 'doc-vocal-b', nombre: 'Carla Vocal' }),
      ],
      examCallConfig: dynamicExamCallConfig,
    })

    expect(result.finalTribunals[0].estadoFinal).toBe('FINAL_CONFIRMED')
    expect(result.finalTribunals[0].alertasFinales).not.toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'FINAL_MANUAL_OVERRIDE_REQUIRES_REVIEW',
        docenteId: 'doc-titular-2',
      }),
    ]))
  })

  it('detecta titular repetido como vocal en revision final', () => {
    const result = importFinalTribunalReview({
      generatedTribunals: [generatedTribunal()],
      reviewedRows: [finalReviewRow({ vocal1: 'Ana Titular' })],
      docentes: [
        tribunalDocente({ id: 'doc-titular', nombre: 'Ana Titular' }),
        tribunalDocente({ id: 'doc-vocal-a', nombre: 'Bruno Vocal' }),
        tribunalDocente({ id: 'doc-vocal-b', nombre: 'Carla Vocal' }),
      ],
      examCallConfig: dynamicExamCallConfig,
    })

    expect(result.finalTribunals[0].estadoFinal).toBe('FINAL_BLOCKED_BY_VALIDATION')
    expect(result.finalTribunals[0].alertasFinales).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'FINAL_TITULAR_REPEATED_AS_VOCAL' }),
    ]))
  })

  it('detecta vocal 1 igual a vocal 2 en revision final', () => {
    const result = importFinalTribunalReview({
      generatedTribunals: [generatedTribunal()],
      reviewedRows: [finalReviewRow({ vocal2: 'Bruno Vocal' })],
      docentes: [
        tribunalDocente({ id: 'doc-titular', nombre: 'Ana Titular' }),
        tribunalDocente({ id: 'doc-vocal-a', nombre: 'Bruno Vocal' }),
        tribunalDocente({ id: 'doc-vocal-b', nombre: 'Carla Vocal' }),
      ],
      examCallConfig: dynamicExamCallConfig,
    })

    expect(result.finalTribunals[0].estadoFinal).toBe('FINAL_BLOCKED_BY_VALIDATION')
    expect(result.finalTribunals[0].alertasFinales).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'FINAL_DUPLICATED_VOCALS' }),
    ]))
  })

  it('acepta tribunal minimo manualmente', () => {
    const result = importFinalTribunalReview({
      generatedTribunals: [
        generatedTribunal({
          vocal2: '',
          vocal2Id: '',
          estado: 'TRIBUNAL_MINIMUM',
        }),
      ],
      reviewedRows: [finalReviewRow({
        vocal2: '',
        tribunalMinimoAceptado: 'si',
      })],
      docentes: [
        tribunalDocente({ id: 'doc-titular', nombre: 'Ana Titular' }),
        tribunalDocente({ id: 'doc-vocal-a', nombre: 'Bruno Vocal' }),
      ],
      examCallConfig: dynamicExamCallConfig,
    })

    expect(result.finalTribunals[0]).toMatchObject({
      estadoFinal: 'FINAL_CONFIRMED_MINIMUM',
      tribunalMinimoAceptado: true,
      finalManualOverrides: expect.objectContaining({ tribunalMinimoAceptado: true }),
    })
    expect(result.finalTribunals[0].alertasFinales).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'FINAL_TRIBUNAL_MINIMUM_ACCEPTED' }),
    ]))
  })

  it('bloquea o deja pendiente tribunal incompleto no aceptado', () => {
    const result = importFinalTribunalReview({
      generatedTribunals: [
        generatedTribunal({
          vocal1: '',
          vocal1Id: '',
          vocal2: '',
          vocal2Id: '',
          estado: 'TRIBUNAL_INCOMPLETE',
        }),
      ],
      reviewedRows: [finalReviewRow({ vocal1: '', vocal2: '' })],
      docentes: [
        tribunalDocente({ id: 'doc-titular', nombre: 'Ana Titular' }),
      ],
      examCallConfig: dynamicExamCallConfig,
    })

    expect(result.finalTribunals[0]).toMatchObject({
      estadoFinal: 'FINAL_INCOMPLETE',
    })
    expect(result.finalTribunals[0].alertasFinales).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'FINAL_TRIBUNAL_INCOMPLETE' }),
    ]))
  })

  it('recalcula mitad mas uno despues de cambios manuales finales', () => {
    const secondMesa = generatedTribunal({
      id: 'draft:prof-historia::MAT2:PRIMER_LLAMADO',
      draftMesaId: 'draft:prof-historia::MAT2:PRIMER_LLAMADO',
      materiaId: 'MAT2',
      materiaMesa: 'Historia Medieval',
      materia: 'Historia Medieval',
      fecha: '2026-07-31',
      fechaSugerida: '2026-07-31',
    })
    const result = importFinalTribunalReview({
      generatedTribunals: [generatedTribunal(), secondMesa],
      reviewedRows: [
        finalReviewRow({ vocal1: 'Bruno Vocal' }),
        {
          draftMesaId: secondMesa.draftMesaId,
          vocal1: 'Bruno Vocal',
          vocal2: 'Carla Vocal',
          estadoFinal: 'FINAL_CONFIRMED',
        },
      ],
      docentes: [
        tribunalDocente({ id: 'doc-titular', nombre: 'Ana Titular' }),
        tribunalDocente({ id: 'doc-vocal-a', nombre: 'Bruno Vocal', horasCatedra: 1, diasAsistencia: ['jueves', 'viernes'] }),
        tribunalDocente({ id: 'doc-vocal-b', nombre: 'Carla Vocal', diasAsistencia: ['jueves', 'viernes'] }),
      ],
      examCallConfig: dynamicExamCallConfig,
    })

    expect(result.alerts).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'FINAL_TEACHER_EXCEEDS_HALF_PLUS_ONE', docenteId: 'doc-vocal-a' }),
    ]))
    expect(result.finalTribunals.some((mesa) => mesa.estadoFinal === 'FINAL_BLOCKED_BY_VALIDATION')).toBe(true)
    expect(result.metadata.halfPlusOneRecalculated).toBe(true)
  })

  it('exporta cronograma final oficial', () => {
    const result = importFinalTribunalReview({
      generatedTribunals: [generatedTribunal()],
      reviewedRows: [finalReviewRow({ observacionesFinales: 'Confirmada por regencia.' })],
      docentes: [
        tribunalDocente({ id: 'doc-titular', nombre: 'Ana Titular' }),
        tribunalDocente({ id: 'doc-vocal-a', nombre: 'Bruno Vocal' }),
        tribunalDocente({ id: 'doc-vocal-b', nombre: 'Carla Vocal' }),
      ],
      examCallConfig: dynamicExamCallConfig,
    })

    const exported = exportFinalTribunalsOfficial(result, { generatedAt: '2026-06-30' })

    expect(exported.columns.map((column) => column.label)).toEqual([
      'Fecha',
      'Carrera',
      'A\u00f1o',
      'Materia/Mesa',
      'Titular',
      'Vocal 1',
      'Vocal 2',
      'Estado final',
      'Alertas',
      'Observaciones finales',
    ])
    expect(exported.rows).toEqual([
      expect.objectContaining({
        fecha: '2026-07-30',
        materiaMesa: 'Didactica General',
        titular: 'Ana Titular',
        vocal1: 'Bruno Vocal',
        vocal2: 'Carla Vocal',
        estadoFinal: 'FINAL_CONFIRMED',
        observacionesFinales: 'Confirmada por regencia.',
      }),
    ])
  })

  it('exporta alertas finales pendientes o bloqueadas', () => {
    const result = importFinalTribunalReview({
      generatedTribunals: [generatedTribunal()],
      reviewedRows: [finalReviewRow({ vocal1: 'Docente Inexistente' })],
      docentes: [
        tribunalDocente({ id: 'doc-titular', nombre: 'Ana Titular' }),
        tribunalDocente({ id: 'doc-vocal-a', nombre: 'Bruno Vocal' }),
        tribunalDocente({ id: 'doc-vocal-b', nombre: 'Carla Vocal' }),
      ],
      examCallConfig: dynamicExamCallConfig,
    })

    const exported = exportFinalTribunalAlerts(result, { generatedAt: '2026-06-30' })

    expect(exported.columns.map((column) => column.label)).toEqual([
      'ID Mesa',
      'Fecha',
      'Carrera',
      'Materia/Mesa',
      'Estado final',
      'Alerta',
      'Detalle',
      'Acci\u00f3n sugerida',
    ])
    expect(exported.rows).toEqual(expect.arrayContaining([
      expect.objectContaining({
        draftMesaId: 'draft:prof-historia::MAT1:PRIMER_LLAMADO',
        estadoFinal: 'FINAL_BLOCKED_BY_VALIDATION',
        alerta: 'FINAL_VOCAL_NOT_FOUND',
      }),
    ]))
  })
})
