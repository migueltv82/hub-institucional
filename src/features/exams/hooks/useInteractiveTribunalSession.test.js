import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { generateTribunalsFromReviewedSchedule } from '../../../utils/examEngine/planning/tribunals/generateTribunalsFromReviewedSchedule.js'
import { useInteractiveTribunalSession } from './useInteractiveTribunalSession.js'

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

const examCallConfig = {
  fechaInicio: '2026-07-30',
  fechaFin: '2026-08-12',
  usarDiasHabiles: true,
  carrerasIncluidas: 'ALL',
  estadoSalida: 'TEACHER_REVIEW',
}

function getMesaId(mesa) {
  return mesa.draftMesaId ?? mesa.id
}

describe('useInteractiveTribunalSession', () => {
  it('habilita las mesas cuando se confirma la revision docente despues del montaje', () => {
    const mesa1 = readyReviewedMesa()
    const docentes = [
      tribunalDocente({ id: 'doc-titular', nombre: 'Ana Titular' }),
      tribunalDocente({ id: 'doc-vocal-a', nombre: 'Bruno Vocal' }),
    ]
    const { result, rerender } = renderHook(
      ({ reviewedSchedule }) => useInteractiveTribunalSession({
        reviewedSchedule,
        docentes,
        examCallConfig,
      }),
      { initialProps: { reviewedSchedule: [] } },
    )

    expect(result.current.readyMesas).toHaveLength(0)

    rerender({ reviewedSchedule: [mesa1] })

    expect(result.current.readyMesas).toHaveLength(1)
    expect(result.current.activeMesaId).toBe(getMesaId(mesa1))
    expect(result.current.getSelectableCandidatesForMesa(
      getMesaId(mesa1),
      'VOCAL_1',
    )).toEqual(expect.arrayContaining([
      expect.objectContaining({ docenteId: 'doc-vocal-a' }),
    ]))
  })

  it('separa mesas listas de mesas excluidas y arranca sin vocales seleccionados', () => {
    const mesa1 = readyReviewedMesa()
    const mesaExcluida = readyReviewedMesa({
      id: 'draft:prof-historia::MAT2:PRIMER_LLAMADO',
      draftMesaId: 'draft:prof-historia::MAT2:PRIMER_LLAMADO',
      estado: 'EXCLUDED_BY_REVIEW',
    })

    const { result } = renderHook(() => useInteractiveTribunalSession({
      reviewedSchedule: [mesa1, mesaExcluida],
      docentes: [
        tribunalDocente({ id: 'doc-titular', nombre: 'Ana Titular' }),
        tribunalDocente({ id: 'doc-vocal-a', nombre: 'Bruno Vocal' }),
      ],
      examCallConfig,
    }))

    expect(result.current.readyMesas).toHaveLength(1)
    expect(result.current.skippedMesas).toEqual([
      expect.objectContaining({ reason: 'MESA_EXCLUDED_SKIPPED' }),
    ])
    expect(result.current.mesaResults.get(getMesaId(mesa1)).mesa).toMatchObject({
      estado: 'TRIBUNAL_INCOMPLETE',
      vocal1Id: '',
      vocal2Id: '',
    })
  })

  it('respeta las reglas duras: rechaza un candidateId que no esta en validCandidates', () => {
    const mesa1 = readyReviewedMesa()
    const { result } = renderHook(() => useInteractiveTribunalSession({
      reviewedSchedule: [mesa1],
      docentes: [
        tribunalDocente({ id: 'doc-titular', nombre: 'Ana Titular' }),
      ],
      examCallConfig,
    }))

    let ok
    act(() => {
      ok = result.current.selectVocal(getMesaId(mesa1), 'VOCAL_1', 'doc-inexistente')
    })

    expect(ok).toBe(false)
    expect(result.current.mesaResults.get(getMesaId(mesa1)).mesa.vocal1Id).toBe('')
  })

  it('no permite elegir el mismo docente para vocal1 y vocal2 de la misma mesa', () => {
    const mesa1 = readyReviewedMesa()
    const { result } = renderHook(() => useInteractiveTribunalSession({
      reviewedSchedule: [mesa1],
      docentes: [
        tribunalDocente({ id: 'doc-titular', nombre: 'Ana Titular' }),
        tribunalDocente({ id: 'doc-vocal-a', nombre: 'Bruno Vocal' }),
      ],
      examCallConfig,
    }))

    act(() => {
      result.current.selectVocal(getMesaId(mesa1), 'VOCAL_1', 'doc-vocal-a')
    })

    const selectableForVocal2 = result.current.getSelectableCandidatesForMesa(getMesaId(mesa1), 'VOCAL_2')
    expect(selectableForVocal2.some((candidate) => candidate.docenteId === 'doc-vocal-a')).toBe(false)

    let ok
    act(() => {
      ok = result.current.selectVocal(getMesaId(mesa1), 'VOCAL_2', 'doc-vocal-a')
    })
    expect(ok).toBe(false)
  })

  it('resta cupo (mitad mas uno) en vivo entre mesas y lo restaura al deshacer', () => {
    const mesa1 = readyReviewedMesa()
    const mesa2 = readyReviewedMesa({
      id: 'draft:prof-historia::MAT2:PRIMER_LLAMADO',
      draftMesaId: 'draft:prof-historia::MAT2:PRIMER_LLAMADO',
      materiaId: 'MAT2',
      materiaMesa: 'Historia Antigua',
      materia: 'Historia Antigua',
      fecha: '2026-07-31',
      fechaSugerida: '2026-07-31',
      titularId: 'doc-titular-2',
      titular: 'Diana Titular',
    })
    const docentes = [
      tribunalDocente({ id: 'doc-titular', nombre: 'Ana Titular' }),
      tribunalDocente({ id: 'doc-titular-2', nombre: 'Diana Titular' }),
      // horasCatedra: 1 -> limite mitad-mas-uno = floor(1/2)+1 = 1 vocalia por llamado
      tribunalDocente({ id: 'doc-vocal-limitado', nombre: 'Bruno Limitado', horasCatedra: 1 }),
    ]

    const { result } = renderHook(() => useInteractiveTribunalSession({
      reviewedSchedule: [mesa1, mesa2],
      docentes,
      examCallConfig,
    }))

    const poolMesa2Before = result.current.mesaResults.get(getMesaId(mesa2)).candidatePool
    expect(poolMesa2Before.validCandidates.map((candidate) => candidate.docenteId)).toContain('doc-vocal-limitado')

    act(() => {
      const ok = result.current.selectVocal(getMesaId(mesa1), 'VOCAL_1', 'doc-vocal-limitado')
      expect(ok).toBe(true)
    })

    const poolMesa2After = result.current.mesaResults.get(getMesaId(mesa2)).candidatePool
    expect(poolMesa2After.validCandidates.map((candidate) => candidate.docenteId)).not.toContain('doc-vocal-limitado')
    const rejected = poolMesa2After.rejectedCandidates.find((candidate) => candidate.docenteId === 'doc-vocal-limitado')
    expect(rejected.rechazos).toContain('SUPERA_MITAD_MAS_UNO')

    const loadSummary = result.current.teacherLoadSummary.find((entry) => entry.docenteId === 'doc-vocal-limitado')
    expect(loadSummary).toMatchObject({ vocaliasAsignadas: 1, limiteVocalias: 1, disponible: 0 })

    let rejectedSelection
    act(() => {
      rejectedSelection = result.current.selectVocal(getMesaId(mesa2), 'VOCAL_1', 'doc-vocal-limitado')
    })
    expect(rejectedSelection).toBe(false)

    act(() => {
      result.current.undoVocal(getMesaId(mesa1), 'VOCAL_1')
    })

    const poolMesa2Restored = result.current.mesaResults.get(getMesaId(mesa2)).candidatePool
    expect(poolMesa2Restored.validCandidates.map((candidate) => candidate.docenteId)).toContain('doc-vocal-limitado')
    expect(result.current.mesaResults.get(getMesaId(mesa1)).mesa.vocal1Id).toBe('')
  })

  it('autoCompleteAll + finalizeSession coincide con el generador automatico existente', () => {
    const mesa1 = readyReviewedMesa()
    const docentes = [
      tribunalDocente({ id: 'doc-titular', nombre: 'Ana Titular' }),
      tribunalDocente({ id: 'doc-vocal-a', nombre: 'Bruno Vocal' }),
      tribunalDocente({ id: 'doc-vocal-b', nombre: 'Carla Vocal' }),
    ]

    const automatic = generateTribunalsFromReviewedSchedule({
      reviewedSchedule: [mesa1],
      docentes,
      examCallConfig,
    })

    const { result } = renderHook(() => useInteractiveTribunalSession({
      reviewedSchedule: [mesa1],
      docentes,
      examCallConfig,
    }))

    act(() => {
      result.current.autoCompleteAll()
    })

    let finalized
    act(() => {
      finalized = result.current.finalizeSession()
    })

    expect(finalized.generatedTribunals[0]).toMatchObject({
      vocal1Id: automatic.generatedTribunals[0].vocal1Id,
      vocal2Id: automatic.generatedTribunals[0].vocal2Id,
      estado: automatic.generatedTribunals[0].estado,
    })
    expect(finalized.success).toBe(true)
    expect(finalized.validation.valid).toBe(true)
  })

  it('finalizeSession refleja selecciones manuales parciales como tribunal minimo', () => {
    const mesa1 = readyReviewedMesa()
    const docentes = [
      tribunalDocente({ id: 'doc-titular', nombre: 'Ana Titular' }),
      tribunalDocente({ id: 'doc-vocal-a', nombre: 'Bruno Vocal' }),
    ]

    const { result } = renderHook(() => useInteractiveTribunalSession({
      reviewedSchedule: [mesa1],
      docentes,
      examCallConfig,
    }))

    act(() => {
      result.current.selectVocal(getMesaId(mesa1), 'VOCAL_1', 'doc-vocal-a')
    })

    expect(result.current.progressSummary).toMatchObject({
      total: 1,
      minimos: 1,
      completos: 0,
    })

    let finalized
    act(() => {
      finalized = result.current.finalizeSession()
    })

    expect(finalized.generatedTribunals[0]).toMatchObject({
      vocal1Id: 'doc-vocal-a',
      vocal2Id: '',
      estado: 'TRIBUNAL_MINIMUM',
    })
  })

  describe('combineMesas / undoCombineMesas', () => {
    function docentesConVocales() {
      return [
        tribunalDocente({ id: 'doc-titular', nombre: 'Ana Titular' }),
        tribunalDocente({ id: 'doc-titular-2', nombre: 'Diana Titular' }),
        tribunalDocente({ id: 'doc-vocal-a', nombre: 'Bruno Vocal' }),
        tribunalDocente({ id: 'doc-vocal-b', nombre: 'Carla Vocal' }),
      ]
    }

    function mesa2Fixture(overrides = {}) {
      return readyReviewedMesa({
        id: 'draft:prof-historia::MAT2:PRIMER_LLAMADO',
        draftMesaId: 'draft:prof-historia::MAT2:PRIMER_LLAMADO',
        materiaId: 'MAT2',
        materiaMesa: 'Historia Antigua',
        materia: 'Historia Antigua',
        titularId: 'doc-titular-2',
        titular: 'Diana Titular',
        ...overrides,
      })
    }

    it('combina dos mesas y usa el titular de la otra materia como vocal cruzado', () => {
      const mesa1 = readyReviewedMesa()
      const mesa2 = mesa2Fixture()

      const { result } = renderHook(() => useInteractiveTribunalSession({
        reviewedSchedule: [mesa1, mesa2],
        docentes: docentesConVocales(),
        examCallConfig,
      }))

      expect(result.current.readyMesas).toHaveLength(2)

      let combineResult
      act(() => {
        combineResult = result.current.combineMesas(getMesaId(mesa1), getMesaId(mesa2))
      })

      expect(combineResult.success).toBe(true)
      expect(result.current.readyMesas).toHaveLength(1)
      expect(result.current.readyMesas[0].materiasAgrupadas).toHaveLength(2)
      const combinedMesaId = getMesaId(result.current.readyMesas[0])
      const combinedEntry = result.current.mesaResults.get(combinedMesaId)
      expect(combinedEntry.selection.vocal1).toEqual(expect.objectContaining({
        docenteId: 'doc-titular-2',
        lockedCrossTitular: true,
      }))
      expect(combinedEntry.mesa).toMatchObject({
        vocal1Id: 'doc-titular-2',
        vocal2Id: '',
        estado: 'TRIBUNAL_MINIMUM',
      })
      const combinedCandidates = result.current.getSelectableCandidatesForMesa(
        combinedMesaId,
        'VOCAL_2',
      )
      expect(combinedCandidates.length).toBeGreaterThan(0)
      expect(combinedCandidates.map((candidate) => candidate.docenteId)).not.toContain('doc-titular-2')
    })

    it('no sugiere ni combina materias si un titular no dicta clase en la fecha activa', () => {
      const mesa1 = readyReviewedMesa()
      const mesa2 = mesa2Fixture()

      const { result } = renderHook(() => useInteractiveTribunalSession({
        reviewedSchedule: [mesa1, mesa2],
        docentes: [
          tribunalDocente({ id: 'doc-titular', nombre: 'Ana Titular', diasAsistencia: ['jueves'] }),
          tribunalDocente({ id: 'doc-titular-2', nombre: 'Diana Titular', diasAsistencia: ['viernes'] }),
          tribunalDocente({ id: 'doc-vocal-a', nombre: 'Bruno Vocal' }),
          tribunalDocente({ id: 'doc-vocal-b', nombre: 'Carla Vocal' }),
        ],
        examCallConfig,
      }))

      expect(result.current.getCombinableMesas(getMesaId(mesa1))).toEqual([])

      let combineResult
      act(() => {
        combineResult = result.current.combineMesas(getMesaId(mesa1), getMesaId(mesa2))
      })

      expect(combineResult).toMatchObject({
        success: false,
        reason: 'TITULARES_SIN_CLASE_ESE_DIA',
      })
      expect(result.current.readyMesas).toHaveLength(2)
    })

    it('combina tres materias y cierra la mesa con los titulares cruzados', () => {
      const mesa1 = readyReviewedMesa()
      const mesa2 = mesa2Fixture()
      const mesa3 = mesa2Fixture({
        id: 'draft:prof-historia::MAT3:PRIMER_LLAMADO',
        draftMesaId: 'draft:prof-historia::MAT3:PRIMER_LLAMADO',
        materiaId: 'MAT3',
        materiaMesa: 'Historia Medieval',
        materia: 'Historia Medieval',
        titularId: 'doc-titular-3',
        titular: 'Elena Titular',
      })

      const { result } = renderHook(() => useInteractiveTribunalSession({
        reviewedSchedule: [mesa1, mesa2, mesa3],
        docentes: [
          ...docentesConVocales(),
          tribunalDocente({ id: 'doc-titular-3', nombre: 'Elena Titular' }),
        ],
        examCallConfig,
      }))

      let firstCombine
      act(() => {
        firstCombine = result.current.combineMesas(getMesaId(mesa1), getMesaId(mesa2))
      })
      expect(firstCombine.success).toBe(true)

      const combinedTwoId = getMesaId(firstCombine.combinedMesa)
      const suggestions = result.current.getCombinableMesas(combinedTwoId)
      expect(suggestions.map(({ mesa }) => getMesaId(mesa))).toContain(getMesaId(mesa3))

      let secondCombine
      act(() => {
        secondCombine = result.current.combineMesas(combinedTwoId, getMesaId(mesa3))
      })

      expect(secondCombine.success).toBe(true)
      expect(result.current.readyMesas).toHaveLength(1)
      expect(result.current.readyMesas[0].materiasAgrupadas).toHaveLength(3)

      const combinedThreeId = getMesaId(result.current.readyMesas[0])
      const combinedEntry = result.current.mesaResults.get(combinedThreeId)
      expect(combinedEntry.selection).toMatchObject({
        vocal1: { docenteId: 'doc-titular-2', lockedCrossTitular: true },
        vocal2: { docenteId: 'doc-titular-3', lockedCrossTitular: true },
      })
      expect(combinedEntry.mesa).toMatchObject({
        vocal1Id: 'doc-titular-2',
        vocal2Id: 'doc-titular-3',
        estado: 'TRIBUNAL_COMPLETE',
      })
      expect(result.current.getCombinableMesas(combinedThreeId)).toEqual([])
    })

    it('completa una triple con un vocal automatico si dos materias comparten titular', () => {
      const mesa1 = readyReviewedMesa()
      const mesa2 = mesa2Fixture()
      const mesa3 = mesa2Fixture({
        id: 'draft:prof-historia::MAT3:PRIMER_LLAMADO',
        draftMesaId: 'draft:prof-historia::MAT3:PRIMER_LLAMADO',
        materiaId: 'MAT3',
        materiaMesa: 'Historia Medieval',
        materia: 'Historia Medieval',
      })

      const { result } = renderHook(() => useInteractiveTribunalSession({
        reviewedSchedule: [mesa1, mesa2, mesa3],
        docentes: docentesConVocales(),
        examCallConfig,
      }))

      let firstCombine
      act(() => {
        firstCombine = result.current.combineMesas(getMesaId(mesa1), getMesaId(mesa2))
      })
      expect(firstCombine.success).toBe(true)

      let secondCombine
      act(() => {
        secondCombine = result.current.combineMesas(getMesaId(firstCombine.combinedMesa), getMesaId(mesa3))
      })

      expect(secondCombine.success).toBe(true)
      const combinedThreeId = getMesaId(secondCombine.combinedMesa)
      const combinedEntry = result.current.mesaResults.get(combinedThreeId)

      expect(combinedEntry.selection.vocal1).toEqual(expect.objectContaining({
        docenteId: 'doc-titular-2',
        lockedCrossTitular: true,
      }))
      expect(combinedEntry.selection.vocal2).toBeTruthy()
      expect(combinedEntry.selection.vocal2.lockedCrossTitular).not.toBe(true)
      expect(['doc-vocal-a', 'doc-vocal-b']).toContain(combinedEntry.mesa.vocal2Id)
      expect(combinedEntry.mesa).toMatchObject({
        vocal1Id: 'doc-titular-2',
        estado: 'TRIBUNAL_COMPLETE',
      })
    })

    it('una combinacion rechazada (distinto llamado) no modifica readyMesas', () => {
      const mesa1 = readyReviewedMesa({ vocal1Id: 'doc-vocal-a', vocal2Id: 'doc-vocal-b' })
      const mesa2 = mesa2Fixture({
        id: 'draft:prof-historia::MAT2:SEGUNDO_LLAMADO',
        draftMesaId: 'draft:prof-historia::MAT2:SEGUNDO_LLAMADO',
        llamado: 'SEGUNDO_LLAMADO',
      })

      const { result } = renderHook(() => useInteractiveTribunalSession({
        reviewedSchedule: [mesa1, mesa2],
        docentes: docentesConVocales(),
        examCallConfig,
      }))

      let combineResult
      act(() => {
        combineResult = result.current.combineMesas(getMesaId(mesa1), getMesaId(mesa2))
      })

      expect(combineResult).toMatchObject({ success: false, reason: 'DISTINTO_LLAMADO' })
      expect(result.current.readyMesas).toHaveLength(2)
    })

    it('deshacer una combinacion restaura las dos mesas originales y no recupera selecciones previas', () => {
      const mesa1 = readyReviewedMesa({ vocal1Id: 'doc-vocal-a', vocal2Id: 'doc-vocal-b' })
      const mesa2 = mesa2Fixture()

      const { result } = renderHook(() => useInteractiveTribunalSession({
        reviewedSchedule: [mesa1, mesa2],
        docentes: docentesConVocales(),
        examCallConfig,
      }))

      act(() => {
        result.current.selectVocal(getMesaId(mesa2), 'VOCAL_1', 'doc-vocal-a')
      })
      expect(result.current.mesaResults.get(getMesaId(mesa2)).mesa.vocal1Id).toBe('doc-vocal-a')

      let combineResult
      act(() => {
        combineResult = result.current.combineMesas(getMesaId(mesa1), getMesaId(mesa2))
      })
      expect(combineResult.success).toBe(true)
      const combinedMesaId = getMesaId(combineResult.combinedMesa)

      let undone
      act(() => {
        undone = result.current.undoCombineMesas(combinedMesaId)
      })

      expect(undone).toBe(true)
      expect(result.current.readyMesas).toHaveLength(2)
      expect(result.current.readyMesas.map(getMesaId).sort()).toEqual(
        [getMesaId(mesa1), getMesaId(mesa2)].sort(),
      )
      expect(result.current.mesaResults.get(getMesaId(mesa2)).mesa.vocal1Id).toBe('')
    })
  })

  describe('getCombinableMesas', () => {
    // La sugerencia se decide por compatibilidad academica. El tribunal puede
    // estar vacio porque sus vocales se eligen despues de combinar.
    function docentesConVocales() {
      return [
        tribunalDocente({ id: 'doc-titular', nombre: 'Ana Titular' }),
        tribunalDocente({ id: 'doc-titular-2', nombre: 'Diana Titular' }),
        tribunalDocente({ id: 'doc-vocal-a', nombre: 'Bruno Vocal' }),
        tribunalDocente({ id: 'doc-vocal-b', nombre: 'Carla Vocal' }),
      ]
    }

    it('sugiere agrupar mesas TIC de distintas carreras dentro de una ventana de dos dias', () => {
      const mesaTicCompleta = readyReviewedMesa({
        carreraId: 'turismo',
        carrera: 'Tecnicatura en Turismo',
        materiaId: 'TIC-TUR',
        materiaMesa: 'TIC aplicada al Turismo',
        materia: 'TIC aplicada al Turismo',
        vocal1Id: 'doc-vocal-a',
        vocal2Id: 'doc-vocal-b',
      })
      const mesaTicCercana = readyReviewedMesa({
        id: 'draft:software::TIC-SW:PRIMER_LLAMADO',
        draftMesaId: 'draft:software::TIC-SW:PRIMER_LLAMADO',
        carreraId: 'software',
        carrera: 'Tecnicatura en Software',
        materiaId: 'TIC-SW',
        materiaMesa: 'Tecnologia de la Informacion',
        materia: 'Tecnologia de la Informacion',
        fecha: '2026-08-01',
        fechaSugerida: '2026-08-01',
        titularId: 'doc-titular-2',
        titular: 'Diana Titular',
      })
      const mesaTicLejana = {
        ...mesaTicCercana,
        id: 'draft:software::TIC-LEJANA:PRIMER_LLAMADO',
        draftMesaId: 'draft:software::TIC-LEJANA:PRIMER_LLAMADO',
        materiaId: 'TIC-LEJANA',
        fecha: '2026-08-05',
        fechaSugerida: '2026-08-05',
      }
      const docentes = [
        tribunalDocente({ id: 'doc-titular', nombre: 'Ana Titular', nombreMateria: 'TIC aplicada' }),
        tribunalDocente({ id: 'doc-titular-2', nombre: 'Diana Titular', nombreMateria: 'Informatica' }),
        tribunalDocente({ id: 'doc-vocal-a', nombre: 'Bruno Vocal', carrera: 'Profesorado de Informatica', nombreMateria: 'TIC' }),
        tribunalDocente({ id: 'doc-vocal-b', nombre: 'Carla Vocal', carrera: 'Profesorado de Informatica', nombreMateria: 'Informatica' }),
      ]

      const { result } = renderHook(() => useInteractiveTribunalSession({
        reviewedSchedule: [mesaTicCompleta, mesaTicCercana, mesaTicLejana],
        docentes,
        examCallConfig,
      }))

      const suggestions = result.current.getCombinableMesas(getMesaId(mesaTicCompleta))
      expect(suggestions.map(({ mesa }) => getMesaId(mesa))).toContain(getMesaId(mesaTicCercana))
      expect(suggestions.map(({ mesa }) => getMesaId(mesa))).not.toContain(getMesaId(mesaTicLejana))
    })

    it('solo sugiere mesas con las que la combinacion realmente funcionaria', () => {
      const mesaCompleta = readyReviewedMesa({ vocal1Id: 'doc-vocal-a', vocal2Id: 'doc-vocal-b' })
      const mesaVacia = readyReviewedMesa({
        id: 'draft:prof-historia::MAT2:PRIMER_LLAMADO',
        draftMesaId: 'draft:prof-historia::MAT2:PRIMER_LLAMADO',
        materiaId: 'MAT2',
        materiaMesa: 'Historia Antigua',
        materia: 'Historia Antigua',
        titularId: 'doc-titular-2',
        titular: 'Diana Titular',
      })
      const mesaOtroLlamado = readyReviewedMesa({
        id: 'draft:prof-historia::MAT3:SEGUNDO_LLAMADO',
        draftMesaId: 'draft:prof-historia::MAT3:SEGUNDO_LLAMADO',
        materiaId: 'MAT3',
        materiaMesa: 'Historia Medieval',
        materia: 'Historia Medieval',
        llamado: 'SEGUNDO_LLAMADO',
        titularId: 'doc-titular-2',
        titular: 'Diana Titular',
      })

      const { result } = renderHook(() => useInteractiveTribunalSession({
        reviewedSchedule: [mesaCompleta, mesaVacia, mesaOtroLlamado],
        docentes: docentesConVocales(),
        examCallConfig,
      }))

      const suggestions = result.current.getCombinableMesas(getMesaId(mesaCompleta))
      expect(suggestions).toHaveLength(1)
      expect(getMesaId(suggestions[0].mesa)).toBe(getMesaId(mesaVacia))
      expect(suggestions[0].tipoCompactacion).toBe('MISMA_CARRERA')
      expect(suggestions[0].combineArgs).toEqual([getMesaId(mesaCompleta), getMesaId(mesaVacia)])

      // Desde la mesa vacia la combinacion tambien es viable: los vocales se
      // seleccionan despues sobre la mesa combinada.
      const suggestionsDesdeVacia = result.current.getCombinableMesas(getMesaId(mesaVacia))
      expect(suggestionsDesdeVacia).toHaveLength(1)
      expect(getMesaId(suggestionsDesdeVacia[0].mesa)).toBe(getMesaId(mesaCompleta))
      expect(suggestionsDesdeVacia[0].combineArgs).toEqual([getMesaId(mesaVacia), getMesaId(mesaCompleta)])
    })

    it('no cruza carreras por compartir un grupo de afinidad', () => {
      const grupoAfinidad = 'QUIMICA-GENERAL-INORGANICA'
      const mesaQuimica = readyReviewedMesa({
        carreraId: 'prof-quimica',
        carrera: 'Profesorado de Quimica',
        materiaId: 'QUI05',
        materiaMesa: 'Quimica General',
        materia: 'Quimica General',
        vocal1Id: 'doc-vocal-a',
        vocal2Id: 'doc-vocal-b',
        metadata: {
          sourceMateria: { grupo_afin_mesa: grupoAfinidad },
        },
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
        metadata: {
          sourceMateria: { grupo_afin_mesa: grupoAfinidad },
        },
      })
      const docentes = [
        tribunalDocente({ id: 'doc-titular', nombre: 'Ana Titular' }),
        tribunalDocente({ id: 'doc-titular-2', nombre: 'Diana Titular' }),
        tribunalDocente({ id: 'doc-vocal-a', nombre: 'Bruno Vocal', gruposAfinidad: [grupoAfinidad] }),
        tribunalDocente({ id: 'doc-vocal-b', nombre: 'Carla Vocal', gruposAfinidad: [grupoAfinidad] }),
      ]

      const { result } = renderHook(() => useInteractiveTribunalSession({
        reviewedSchedule: [mesaQuimica, mesaLaboratorio],
        docentes,
        examCallConfig,
      }))

      const suggestions = result.current.getCombinableMesas(getMesaId(mesaLaboratorio))
      expect(suggestions).toHaveLength(0)
    })

    it('no cruza carreras por pertenecer a la familia Ingles', () => {
      const mesaInglesTurismo = readyReviewedMesa({
        carreraId: 'turismo',
        carrera: 'Tecnicatura Superior en Turismo',
        materiaId: 'TUR-ING',
        materiaMesa: 'Ingles',
        materia: 'Ingles',
        anio: 2,
        titularId: 'doc-titular',
        titular: 'Ana Titular',
      })
      const mesaPrimerAnioIngles = readyReviewedMesa({
        id: 'draft:prof-ingles::PED1:PRIMER_LLAMADO',
        draftMesaId: 'draft:prof-ingles::PED1:PRIMER_LLAMADO',
        carreraId: 'prof-ingles',
        carrera: 'Profesorado de Ingles',
        materiaId: 'PED1',
        materiaMesa: 'Pedagogia',
        materia: 'Pedagogia',
        anio: 1,
        titularId: 'doc-titular-2',
        titular: 'Diana Titular',
      })
      const mesaSegundoAnioOtroTitular = readyReviewedMesa({
        id: 'draft:prof-ingles::GRA2:PRIMER_LLAMADO',
        draftMesaId: 'draft:prof-ingles::GRA2:PRIMER_LLAMADO',
        carreraId: 'prof-ingles',
        carrera: 'Profesorado de Ingles',
        materiaId: 'GRA2',
        materiaMesa: 'Gramatica Inglesa II',
        materia: 'Gramatica Inglesa II',
        anio: 2,
        titularId: 'doc-titular-3',
        titular: 'Elena Titular',
      })

      const { result } = renderHook(() => useInteractiveTribunalSession({
        reviewedSchedule: [mesaInglesTurismo, mesaPrimerAnioIngles, mesaSegundoAnioOtroTitular],
        docentes: [
          ...docentesConVocales(),
          tribunalDocente({ id: 'doc-titular-3', nombre: 'Elena Titular' }),
        ],
        examCallConfig,
      }))

      const suggestions = result.current.getCombinableMesas(getMesaId(mesaInglesTurismo))
      expect(suggestions.map(({ mesa }) => getMesaId(mesa))).not.toContain(getMesaId(mesaPrimerAnioIngles))
      expect(suggestions.map(({ mesa }) => getMesaId(mesa))).not.toContain(getMesaId(mesaSegundoAnioOtroTitular))
    })

    it('no cruza carreras de Ingles aunque compartan titular', () => {
      const mesaInglesTurismo = readyReviewedMesa({
        carreraId: 'turismo',
        carrera: 'Tecnicatura Superior en Turismo',
        materiaId: 'TUR-ING',
        materiaMesa: 'Ingles',
        materia: 'Ingles',
        titularId: 'doc-titular',
        titular: 'Ana Titular',
      })
      const mesaTradMismaTitular = readyReviewedMesa({
        id: 'draft:trad::TXT3:PRIMER_LLAMADO',
        draftMesaId: 'draft:trad::TXT3:PRIMER_LLAMADO',
        carreraId: 'traductorado',
        carrera: 'Traductorado de Ingles',
        materiaId: 'TXT3',
        materiaMesa: 'Interpretacion de Texto',
        materia: 'Interpretacion de Texto',
        anio: 3,
        titularId: 'doc-titular',
        titular: 'Ana Titular',
      })

      const { result } = renderHook(() => useInteractiveTribunalSession({
        reviewedSchedule: [mesaInglesTurismo, mesaTradMismaTitular],
        docentes: docentesConVocales(),
        examCallConfig,
      }))

      const suggestions = result.current.getCombinableMesas(getMesaId(mesaInglesTurismo))
      expect(suggestions.map(({ mesa }) => getMesaId(mesa))).not.toContain(getMesaId(mesaTradMismaTitular))
    })

    it('no cruza carreras por coincidir anio y titular', () => {
      const mesaQuimica = readyReviewedMesa({
        carreraId: 'prof-quimica',
        carrera: 'Profesorado de Quimica',
        materiaId: 'QUI01',
        materiaMesa: 'Quimica General',
        materia: 'Quimica General',
        anio: 1,
        titularId: 'doc-titular',
        titular: 'Ana Titular',
      })
      const mesaLaboratorio = readyReviewedMesa({
        id: 'draft:lab::LAB01:PRIMER_LLAMADO',
        draftMesaId: 'draft:lab::LAB01:PRIMER_LLAMADO',
        carreraId: 'lab',
        carrera: 'Tecnico Superior en Laboratorio',
        materiaId: 'LAB01',
        materiaMesa: 'Introduccion al Laboratorio',
        materia: 'Introduccion al Laboratorio',
        anio: 1,
        titularId: 'doc-titular',
        titular: 'Ana Titular',
      })
      const mesaMismaDocenteOtroAnio = readyReviewedMesa({
        id: 'draft:lab::LAB02:PRIMER_LLAMADO',
        draftMesaId: 'draft:lab::LAB02:PRIMER_LLAMADO',
        carreraId: 'lab',
        carrera: 'Tecnico Superior en Laboratorio',
        materiaId: 'LAB02',
        materiaMesa: 'Laboratorio II',
        materia: 'Laboratorio II',
        anio: 2,
        titularId: 'doc-titular',
        titular: 'Ana Titular',
      })

      const { result } = renderHook(() => useInteractiveTribunalSession({
        reviewedSchedule: [mesaQuimica, mesaLaboratorio, mesaMismaDocenteOtroAnio],
        docentes: docentesConVocales(),
        examCallConfig,
      }))

      const suggestions = result.current.getCombinableMesas(getMesaId(mesaQuimica))
      expect(suggestions.map(({ mesa }) => getMesaId(mesa))).not.toContain(getMesaId(mesaLaboratorio))
      expect(suggestions.map(({ mesa }) => getMesaId(mesa))).not.toContain(getMesaId(mesaMismaDocenteOtroAnio))
    })

    it('permite combinar mesas pedagogicas de carreras distintas', () => {
      const mesaDidacticaIngles = readyReviewedMesa({
        carreraId: 'prof-ingles',
        carrera: 'Profesorado de Ingles',
        materiaId: 'DID-ING',
        materiaMesa: 'Didactica General',
        materia: 'Didactica General',
      })
      const mesaDidacticaQuimica = readyReviewedMesa({
        id: 'draft:prof-quimica::DID-QUI:PRIMER_LLAMADO',
        draftMesaId: 'draft:prof-quimica::DID-QUI:PRIMER_LLAMADO',
        carreraId: 'prof-quimica',
        carrera: 'Profesorado de Quimica',
        materiaId: 'DID-QUI',
        materiaMesa: 'Didactica General',
        materia: 'Didactica General',
        titularId: 'doc-titular-2',
        titular: 'Diana Titular',
      })

      const { result } = renderHook(() => useInteractiveTribunalSession({
        reviewedSchedule: [mesaDidacticaIngles, mesaDidacticaQuimica],
        docentes: docentesConVocales(),
        examCallConfig,
      }))

      expect(result.current.getCombinableMesas(getMesaId(mesaDidacticaIngles))
        .map(({ mesa }) => getMesaId(mesa)))
        .toContain(getMesaId(mesaDidacticaQuimica))
    })

    it('ordena las sugerencias por prioridad de tipo de compactacion', () => {
      const mesaActiva = readyReviewedMesa({ vocal1Id: 'doc-vocal-a', vocal2Id: 'doc-vocal-b' })
      const candidataMismaCarrera = readyReviewedMesa({
        id: 'draft:prof-historia::MAT2:PRIMER_LLAMADO',
        draftMesaId: 'draft:prof-historia::MAT2:PRIMER_LLAMADO',
        materiaId: 'MAT2',
        materiaMesa: 'Historia Antigua',
        materia: 'Historia Antigua',
        titularId: 'doc-titular-2',
        titular: 'Diana Titular',
      })
      const candidataMismoTitular = readyReviewedMesa({
        id: 'draft:prof-historia::MAT3:PRIMER_LLAMADO',
        draftMesaId: 'draft:prof-historia::MAT3:PRIMER_LLAMADO',
        materiaId: 'MAT3',
        materiaMesa: 'Historia Contemporanea',
        materia: 'Historia Contemporanea',
      })

      const { result } = renderHook(() => useInteractiveTribunalSession({
        reviewedSchedule: [mesaActiva, candidataMismaCarrera, candidataMismoTitular],
        docentes: docentesConVocales(),
        examCallConfig,
      }))

      const suggestions = result.current.getCombinableMesas(getMesaId(mesaActiva))
      expect(suggestions.map((suggestion) => suggestion.tipoCompactacion)).toEqual([
        'MISMO_TITULAR',
        'MISMA_CARRERA',
      ])
      expect(getMesaId(suggestions[0].mesa)).toBe(getMesaId(candidataMismoTitular))
    })
  })
})
