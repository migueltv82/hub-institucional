import { describe, expect, it } from 'vitest'
import { evaluateMesaCombination, REASON_LABELS } from './combineReviewedMesas.js'

function tribunalDocente(overrides = {}) {
  return {
    id: 'doc-vocal-a',
    nombre: 'Bruno Vocal',
    activo: true,
    carrera: 'Profesorado de Historia',
    nombreMateria: 'Didactica General',
    diasAsistencia: ['jueves', 'viernes'],
    horasCatedra: 6,
    ...overrides,
  }
}

function readyReviewedMesa(overrides = {}) {
  return {
    id: 'draft:prof-historia::MAT1:PRIMER_LLAMADO',
    draftMesaId: 'draft:prof-historia::MAT1:PRIMER_LLAMADO',
    fecha: '2026-07-30',
    fechaSugerida: '2026-07-30',
    llamado: 'PRIMER_LLAMADO',
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
    alertas: [],
    ...overrides,
  }
}

const docentes = [
  tribunalDocente({ id: 'doc-titular', nombre: 'Ana Titular' }),
  tribunalDocente({ id: 'doc-titular-2', nombre: 'Diana Titular' }),
]

// compactMesas.js is written for post-assignment compaction: the merged mesa
// it returns always comes out estado 'COMPLETA', which its own validation
// then requires to actually have two vocales. So a combination only succeeds
// when mesaA (whose titular/vocales become the combined tribunal) already
// has both vocales assigned - that's the realistic "fold an unstaffed mesa
// into an already-staffed one" case this feature targets.
const docentesConVocalesDeMesaA = [
  ...docentes,
  tribunalDocente({ id: 'doc-vocal-a', nombre: 'Carla Vocal' }),
  tribunalDocente({ id: 'doc-vocal-b', nombre: 'Dario Vocal' }),
]

describe('evaluateMesaCombination', () => {
  it('combina dos mesas de la misma carrera y llamado en una sola mesa lista', () => {
    const mesaA = readyReviewedMesa({ vocal1Id: 'doc-vocal-a', vocal2Id: 'doc-vocal-b' })
    const mesaB = readyReviewedMesa({
      id: 'draft:prof-historia::MAT2:PRIMER_LLAMADO',
      draftMesaId: 'draft:prof-historia::MAT2:PRIMER_LLAMADO',
      materiaId: 'MAT2',
      materiaMesa: 'Historia Antigua',
      materia: 'Historia Antigua',
      titularId: 'doc-titular-2',
      titular: 'Diana Titular',
    })

    const result = evaluateMesaCombination({ mesaA, mesaB, docentes: docentesConVocalesDeMesaA })

    expect(result.success).toBe(true)
    expect(result.combinedMesa.materiasAgrupadas).toHaveLength(2)
    expect(result.combinedMesa.estado).toBe('READY_FOR_TRIBUNAL')
    expect(result.combinedMesa.id).toBe('compact:draft:prof-historia::MAT1:PRIMER_LLAMADO+draft:prof-historia::MAT2:PRIMER_LLAMADO')
  })

  it('rechaza la combinacion cuando las mesas pertenecen a llamados distintos', () => {
    const mesaA = readyReviewedMesa()
    const mesaB = readyReviewedMesa({
      id: 'draft:prof-historia::MAT2:SEGUNDO_LLAMADO',
      draftMesaId: 'draft:prof-historia::MAT2:SEGUNDO_LLAMADO',
      materiaId: 'MAT2',
      materiaMesa: 'Historia Antigua',
      materia: 'Historia Antigua',
      llamado: 'SEGUNDO_LLAMADO',
      titularId: 'doc-titular-2',
      titular: 'Diana Titular',
    })

    const result = evaluateMesaCombination({ mesaA, mesaB, docentes })

    expect(result.success).toBe(false)
    expect(result.reason).toBe('DISTINTO_LLAMADO')
    expect(REASON_LABELS[result.reason]).toBe('Pertenecen a llamados distintos.')
  })

  it('rechaza cruces de carrera por afinidad y permite cruces pedagogicos', () => {
    const mesaQuimica = readyReviewedMesa({
      carreraId: 'prof-quimica',
      carrera: 'Profesorado de Quimica',
      materiaId: 'QUI05',
      materiaMesa: 'Quimica General',
      materia: 'Quimica General',
    })
    const mesaLaboratorio = readyReviewedMesa({
      id: 'draft:lab::LAB05:PRIMER_LLAMADO',
      draftMesaId: 'draft:lab::LAB05:PRIMER_LLAMADO',
      carreraId: 'lab',
      carrera: 'Tecnico Superior en Laboratorio',
      materiaId: 'LAB05',
      materiaMesa: 'Quimica General e Inorganica',
      materia: 'Quimica General e Inorganica',
      titularId: 'doc-titular-2',
      titular: 'Diana Titular',
    })

    expect(evaluateMesaCombination({ mesaA: mesaQuimica, mesaB: mesaLaboratorio, docentes }))
      .toMatchObject({ success: false, reason: 'INTERCARRERA_NO_PERMITIDA' })

    const mesaDidactica = {
      ...mesaLaboratorio,
      materiaId: 'DID-LAB',
      materiaMesa: 'Didactica General',
      materia: 'Didactica General',
    }
    expect(evaluateMesaCombination({ mesaA: readyReviewedMesa(), mesaB: mesaDidactica, docentes }).success)
      .toBe(true)
  })

  it('rechaza la combinacion cuando un titular quedaria como vocal de la mesa combinada', () => {
    const mesaA = readyReviewedMesa()
    const mesaB = readyReviewedMesa({
      id: 'draft:prof-historia::MAT2:PRIMER_LLAMADO',
      draftMesaId: 'draft:prof-historia::MAT2:PRIMER_LLAMADO',
      materiaId: 'MAT2',
      materiaMesa: 'Historia Antigua',
      materia: 'Historia Antigua',
      titularId: 'doc-titular-2',
      titular: 'Diana Titular',
      vocal1Id: 'doc-titular',
    })

    const result = evaluateMesaCombination({ mesaA, mesaB, docentes })

    expect(result.success).toBe(false)
    expect(result.reason).toBe('TITULAR_DUPLICADO_COMO_VOCAL')
    expect(REASON_LABELS[result.reason]).toBeTruthy()
  })

  it('rechaza la combinacion cuando una materia no es agrupable', () => {
    const mesaA = readyReviewedMesa({
      materiaMesa: 'Practicas Discursivas III',
      materia: 'Practicas Discursivas III',
    })
    const mesaB = readyReviewedMesa({
      id: 'draft:prof-historia::MAT2:PRIMER_LLAMADO',
      draftMesaId: 'draft:prof-historia::MAT2:PRIMER_LLAMADO',
      materiaId: 'MAT2',
      materiaMesa: 'Historia Antigua',
      materia: 'Historia Antigua',
      titularId: 'doc-titular-2',
      titular: 'Diana Titular',
    })

    const result = evaluateMesaCombination({ mesaA, mesaB, docentes })

    expect(result.success).toBe(false)
    expect(result.reason).toBe('MATERIA_NO_AGRUPABLE')
  })

  it('preserva las mesas originales sin mutarlas y las guarda en sourceMesas para poder deshacer', () => {
    const mesaA = readyReviewedMesa({ vocal1Id: 'doc-vocal-a', vocal2Id: 'doc-vocal-b' })
    const mesaB = readyReviewedMesa({
      id: 'draft:prof-historia::MAT2:PRIMER_LLAMADO',
      draftMesaId: 'draft:prof-historia::MAT2:PRIMER_LLAMADO',
      materiaId: 'MAT2',
      materiaMesa: 'Historia Antigua',
      materia: 'Historia Antigua',
      titularId: 'doc-titular-2',
      titular: 'Diana Titular',
    })
    const mesaASnapshot = JSON.parse(JSON.stringify(mesaA))
    const mesaBSnapshot = JSON.parse(JSON.stringify(mesaB))

    const result = evaluateMesaCombination({ mesaA, mesaB, docentes: docentesConVocalesDeMesaA })

    expect(result.success).toBe(true)
    expect(mesaA).toEqual(mesaASnapshot)
    expect(mesaB).toEqual(mesaBSnapshot)
    expect(result.combinedMesa.metadata.combinedFrom.sourceMesas).toEqual([mesaASnapshot, mesaBSnapshot])
  })
})
