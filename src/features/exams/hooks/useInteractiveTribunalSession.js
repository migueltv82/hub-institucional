import { useCallback, useMemo, useState } from 'react'
import { createParticipacionTribunal } from '../../../utils/examEngine/contracts.js'
import { MAX_SUBJECTS_PER_MESA } from '../../../utils/examEngine/constants.js'
import {
  buildTribunalDocenteMap,
  findTribunalDocente,
  getTribunalDocenteId,
  getTribunalDocenteLabel,
} from '../../../utils/examEngine/planning/tribunals/buildTribunalCandidatePool.js'
import {
  finalizeTribunalMesaSelection,
  pickAutomaticVocalSelection,
  prepareTribunalMesaContext,
} from '../../../utils/examEngine/planning/tribunals/assignVocalesForReviewedMesa.js'
import { TYPE_PRIORITY } from '../../../utils/examEngine/planning/compactMesas.js'
import {
  canCombineMesasByCareerRule,
  evaluateMesaCombination,
} from '../../../utils/examEngine/planning/tribunals/combineReviewedMesas.js'
import {
  createSkippedMesa,
  DEFAULT_TRIBUNAL_RULES,
  mesaIsReady,
  normalizeTribunalRules,
  sortReadyMesas,
  summarizeGeneratedTribunals,
} from '../../../utils/examEngine/planning/tribunals/generateTribunalsFromReviewedSchedule.js'
import {
  calculateTeacherAssignmentLimit,
  TEACHER_ASSIGNMENT_RULE_MODES,
} from '../../../utils/examEngine/rules/calculateTeacherAssignmentLimit.js'
import { contarVocaliasPorDocente } from '../../../utils/examEngine/rules/halfPlusOne.js'
import { detectarFamiliaMateria, FAMILIAS_AFINIDAD } from '../../../utils/examEngine/rules/affinities.js'
import { teacherIsAvailableOnDate } from '../../../utils/examEngine/rules/availability.js'
import { validateGeneratedTribunals } from '../../../utils/examEngine/validation/validateGeneratedTribunals.js'

function clean(value) {
  return String(value ?? '').trim()
}

function getMesaId(mesa = {}) {
  return clean(mesa.draftMesaId ?? mesa.id)
}

function normalizeKey(value) {
  return clean(value)
    .toLowerCase()
    .normalize('NFD')
    .replaceAll(/[\u0300-\u036f]/g, '')
}

function isTicMesa(mesa = {}) {
  return detectarFamiliaMateria(mesa) === FAMILIAS_AFINIDAD.INFORMATICA_TIC
}

function groupedSubjectCount(mesa = {}) {
  return Array.isArray(mesa.materiasAgrupadas) && mesa.materiasAgrupadas.length
    ? mesa.materiasAgrupadas.length
    : 1
}

function dateDistanceInDays(left = {}, right = {}) {
  const leftDate = Date.parse(`${left.fechaSugerida ?? left.fecha}T00:00:00`)
  const rightDate = Date.parse(`${right.fechaSugerida ?? right.fecha}T00:00:00`)
  if (!Number.isFinite(leftDate) || !Number.isFinite(rightDate)) return Number.POSITIVE_INFINITY
  return Math.abs(leftDate - rightDate) / 86_400_000
}

function getMesaFecha(mesa = {}) {
  return clean(mesa.fechaSugerida ?? mesa.fecha)
}

const EMPTY_SELECTION = { vocal1: null, vocal2: null }

function slotKey(rol) {
  return rol === 'VOCAL_2' ? 'vocal2' : 'vocal1'
}

function sourceMesasFor(mesa = {}) {
  const sourceMesas = mesa.metadata?.combinedFrom?.sourceMesas
  if (Array.isArray(sourceMesas) && sourceMesas.length) {
    return sourceMesas.flatMap(sourceMesasFor)
  }

  return [mesa]
}

function uniqueTitularRefs(mesa = {}) {
  const refs = []
  const pushRef = ({ docenteId = '', nombre = '', sourceMesaId = '' } = {}) => {
    const key = normalizeKey(docenteId || nombre)
    if (!key || refs.some((ref) => ref.key === key)) return
    refs.push({
      key,
      docenteId: clean(docenteId || nombre),
      nombre: clean(nombre || docenteId),
      sourceMesaId: clean(sourceMesaId),
    })
  }

  sourceMesasFor(mesa).forEach((sourceMesa) => pushRef({
    docenteId: sourceMesa.titularId,
    nombre: sourceMesa.titular ?? sourceMesa.titularNombre,
    sourceMesaId: getMesaId(sourceMesa),
  }))

  if (Array.isArray(mesa.titularesDetalle)) {
    mesa.titularesDetalle.forEach((entry) => pushRef({
      docenteId: entry.docenteId ?? entry.id,
      nombre: entry.nombre,
      sourceMesaId: entry.sourceMesaId,
    }))
  }

  if (Array.isArray(mesa.titularesInvolucrados)) {
    mesa.titularesInvolucrados.forEach((entry) => {
      if (typeof entry === 'object') {
        pushRef({
          docenteId: entry.docenteId ?? entry.id,
          nombre: entry.nombre,
          sourceMesaId: entry.sourceMesaId,
        })
        return
      }

      pushRef({ docenteId: entry })
    })
  }

  return refs
}

function titularRefsTeachOnMesaDate(mesa = {}, docenteMap = new Map()) {
  const fecha = getMesaFecha(mesa)
  const refs = uniqueTitularRefs(mesa)
  if (!fecha || !refs.length) return false

  return refs.every((ref) => {
    const docente = findTribunalDocente(docenteMap, ref.docenteId || ref.nombre)
    return Boolean(docente && teacherIsAvailableOnDate(docente, fecha))
  })
}

function createTitularDayFailure(combinedMesa = {}) {
  return {
    success: false,
    reason: 'TITULARES_SIN_CLASE_ESE_DIA',
    detail: 'La mesa combinada solo se propone si todos sus titulares dictan clase en la fecha de la mesa activa.',
    combinedMesa,
  }
}

function createCrossTitularCandidate(ref = {}, docenteMap = new Map()) {
  const docente = findTribunalDocente(docenteMap, ref.docenteId || ref.nombre)
  const docenteId = docente ? getTribunalDocenteId(docente) : ref.docenteId
  const nombre = docente ? getTribunalDocenteLabel(docente) : ref.nombre

  return {
    docente,
    docenteId,
    nombre,
    valido: true,
    rechazos: [],
    alertas: [{
      code: 'TITULAR_CRUZADO_AS_VOCAL',
      message: 'Titular de otra materia combinada usado como vocal automatico.',
      severity: 'info',
      docenteId,
      sourceMesaId: ref.sourceMesaId,
    }],
    nivelAfinidad: 'TITULAR_CRUZADO',
    motivoAfinidad: 'Titular de otra materia combinada.',
    lockedCrossTitular: true,
    sourceMesaId: ref.sourceMesaId,
  }
}

function getBaseSelectionForMesa(mesa = {}, docenteMap = new Map()) {
  if (!mesa.combinada && !mesa.compactada) return EMPTY_SELECTION

  const primaryTitularKey = normalizeKey(mesa.titularId || mesa.titular)
  const crossTitulares = uniqueTitularRefs(mesa)
    .filter((ref) => ref.key && ref.key !== primaryTitularKey)
    .slice(0, 2)
    .map((ref) => createCrossTitularCandidate(ref, docenteMap))

  return {
    vocal1: crossTitulares[0] ?? null,
    vocal2: crossTitulares[1] ?? null,
  }
}

function selectionToSelectedList(selection = EMPTY_SELECTION) {
  return [selection.vocal1, selection.vocal2].filter(Boolean)
}

function participacionesFromSelection(mesa, selection) {
  return selectionToSelectedList(selection)
    .map((candidate, index) => createParticipacionTribunal({
      docenteId: candidate.docenteId,
      mesaId: getMesaId(mesa),
      materiaId: mesa.materiaId,
      carreraId: mesa.carreraId,
      rol: index === 0 ? 'VOCAL_1' : 'VOCAL_2',
      llamado: mesa.llamado,
      fecha: mesa.fechaSugerida ?? mesa.fecha,
      turno: mesa.turno,
    }))
}

function buildParticipacionesForMesas({
  readyMesas = [],
  mesaSelections = new Map(),
  teacherAssignments = [],
  docenteMap = new Map(),
  excludedMesaIds = new Set(),
} = {}) {
  return [
    ...teacherAssignments,
    ...readyMesas
      .filter((mesa) => !excludedMesaIds.has(getMesaId(mesa)))
      .flatMap((mesa) => participacionesFromSelection(
        mesa,
        mesaSelections.get(getMesaId(mesa)) ?? getBaseSelectionForMesa(mesa, docenteMap),
      )),
  ]
}

function fillEmptySelectionSlots(baseSelection = EMPTY_SELECTION, candidates = []) {
  const next = { ...baseSelection }
  const used = new Set(selectionToSelectedList(next).map((candidate) => candidate.docenteId))

  candidates.forEach((candidate) => {
    if (!candidate?.docenteId || used.has(candidate.docenteId)) return
    if (!next.vocal1) {
      next.vocal1 = candidate
      used.add(candidate.docenteId)
      return
    }
    if (!next.vocal2) {
      next.vocal2 = candidate
      used.add(candidate.docenteId)
    }
  })

  return next
}

function buildAutoSelectionForCombinedMesa({
  mesa,
  docentes = [],
  docenteMap = new Map(),
  participaciones = [],
  rules = {},
} = {}) {
  const baseSelection = getBaseSelectionForMesa(mesa, docenteMap)
  if (groupedSubjectCount(mesa) < MAX_SUBJECTS_PER_MESA) return baseSelection

  const context = prepareTribunalMesaContext({
    mesa,
    docentes,
    docenteMap,
    participaciones,
    tribunalRules: rules,
  })
  const selectedIds = new Set(selectionToSelectedList(baseSelection).map((candidate) => candidate.docenteId))
  const automaticCandidates = pickAutomaticVocalSelection(context.candidatePool, rules)
    .filter((candidate) => !selectedIds.has(candidate.docenteId))

  return fillEmptySelectionSlots(baseSelection, automaticCandidates)
}

// Manages a human-driven, mesa-by-mesa vocal selection session on top of the
// same rule engine the automatic tribunal generator uses. Cupo (mitad-mas-uno)
// is never tracked with a separate mutable counter: it is recomputed from the
// accumulated `participaciones` on every render, exactly like the automatic
// pipeline does, so selecting a vocal anywhere immediately reduces the cupo
// shown for every other mesa.
export function useInteractiveTribunalSession({
  reviewedSchedule = [],
  docentes = [],
  teacherAssignments = [],
  examCallConfig = {},
  tribunalRules = DEFAULT_TRIBUNAL_RULES,
  correlatividades = [],
} = {}) {
  const rules = useMemo(() => normalizeTribunalRules(tribunalRules), [tribunalRules])
  const docenteMap = useMemo(() => buildTribunalDocenteMap(docentes), [docentes])

  // The reviewed schedule arrives after the teacher-review step. Keep local
  // ownership for manual combinations, but start a fresh session whenever the
  // upstream reviewed schedule actually changes.
  const [workingSchedule, setWorkingSchedule] = useState(() => reviewedSchedule)
  const reviewedScheduleKey = JSON.stringify(reviewedSchedule.map((mesa) => [
    getMesaId(mesa),
    mesa.estado,
    mesa.fechaSugerida ?? mesa.fecha,
    mesa.titularId,
    mesa.carrera,
    mesa.materiaId ?? mesa.materia,
  ]))
  const [workingSourceKey, setWorkingSourceKey] = useState(reviewedScheduleKey)

  const readyMesas = useMemo(
    () => workingSchedule.filter(mesaIsReady).sort(sortReadyMesas),
    [workingSchedule],
  )
  const skippedMesas = useMemo(
    () => workingSchedule.filter((mesa) => !mesaIsReady(mesa)).map(createSkippedMesa),
    [workingSchedule],
  )

  const [mesaSelections, setMesaSelections] = useState(() => new Map())
  const [activeMesaId, setActiveMesaId] = useState(() => getMesaId(readyMesas[0]))

  if (workingSourceKey !== reviewedScheduleKey) {
    const firstReadyMesa = reviewedSchedule.find(mesaIsReady)
    setWorkingSourceKey(reviewedScheduleKey)
    setWorkingSchedule(reviewedSchedule)
    setMesaSelections(new Map())
    setActiveMesaId(getMesaId(firstReadyMesa))
  }

  const participaciones = useMemo(() => buildParticipacionesForMesas({
    readyMesas,
    mesaSelections,
    teacherAssignments,
    docenteMap,
  }), [readyMesas, mesaSelections, teacherAssignments, docenteMap])

  const mesaResults = useMemo(() => {
    const map = new Map()

    readyMesas.forEach((mesa) => {
      const mesaId = getMesaId(mesa)
      const selection = mesaSelections.get(mesaId) ?? getBaseSelectionForMesa(mesa, docenteMap)
      const context = prepareTribunalMesaContext({
        mesa,
        docentes,
        docenteMap,
        participaciones,
        tribunalRules: rules,
      })
      const selected = selectionToSelectedList(selection)
      const finalized = finalizeTribunalMesaSelection({ context, selected })

      map.set(mesaId, {
        mesa: finalized.mesa,
        candidatePool: context.candidatePool,
        selection,
      })
    })

    return map
  }, [readyMesas, mesaSelections, participaciones, docentes, docenteMap, rules])

  const activeMesa = useMemo(
    () => readyMesas.find((mesa) => getMesaId(mesa) === activeMesaId) ?? readyMesas[0] ?? null,
    [readyMesas, activeMesaId],
  )

  const getSelectableCandidatesForMesa = useCallback((mesaId, rol) => {
    const entry = mesaResults.get(mesaId)
    if (!entry) return []

    const otherSlot = rol === 'VOCAL_1' ? entry.selection.vocal2 : entry.selection.vocal1
    return entry.candidatePool.validCandidates.filter(
      (candidate) => candidate.docenteId !== otherSlot?.docenteId,
    )
  }, [mesaResults])

  const selectVocal = useCallback((mesaId, rol, docenteId) => {
    const entry = mesaResults.get(mesaId)
    if (!entry) return false

    const otherSlot = rol === 'VOCAL_1' ? entry.selection.vocal2 : entry.selection.vocal1
    const candidate = entry.candidatePool.validCandidates.find(
      (item) => item.docenteId === docenteId && item.docenteId !== otherSlot?.docenteId,
    )
    if (!candidate) return false

    setMesaSelections((prev) => {
      const next = new Map(prev)
      const current = next.get(mesaId) ?? entry.selection ?? EMPTY_SELECTION
      next.set(mesaId, { ...current, [slotKey(rol)]: candidate })
      return next
    })

    return true
  }, [mesaResults])

  const undoVocal = useCallback((mesaId, rol) => {
    setMesaSelections((prev) => {
      const entry = mesaResults.get(mesaId)
      const slot = slotKey(rol)
      if (entry?.selection?.[slot]?.lockedCrossTitular) return prev
      if (!prev.has(mesaId)) return prev

      const next = new Map(prev)
      next.set(mesaId, { ...prev.get(mesaId), [slot]: null })
      return next
    })
  }, [mesaResults])

  const autoCompleteAll = useCallback(() => {
    const next = new Map()
    let runningParticipaciones = [...teacherAssignments]

    readyMesas.forEach((mesa) => {
      const mesaId = getMesaId(mesa)
      const context = prepareTribunalMesaContext({
        mesa,
        docentes,
        docenteMap,
        participaciones: runningParticipaciones,
        tribunalRules: rules,
      })
      const baseSelection = getBaseSelectionForMesa(mesa, docenteMap)
      const selected = pickAutomaticVocalSelection(context.candidatePool, rules)
        .filter((candidate) => !selectionToSelectedList(baseSelection).some((item) => item.docenteId === candidate.docenteId))
      const selection = fillEmptySelectionSlots(baseSelection, selected)

      next.set(mesaId, selection)
      runningParticipaciones = [...runningParticipaciones, ...participacionesFromSelection(mesa, selection)]
    })

    setMesaSelections(next)
  }, [readyMesas, teacherAssignments, docentes, docenteMap, rules])

  const resetSelections = useCallback(() => setMesaSelections(new Map()), [])

  const combineMesas = useCallback((mesaIdA, mesaIdB) => {
    const mesaA = workingSchedule.find((mesa) => getMesaId(mesa) === mesaIdA)
    const mesaB = workingSchedule.find((mesa) => getMesaId(mesa) === mesaIdB)

    if (!mesaA || !mesaB) {
      return {
        success: false,
        reason: 'DATOS_INCOMPLETOS',
        detail: 'No se encontraron las mesas a combinar.',
      }
    }

    const evaluation = evaluateMesaCombination({
      mesaA,
      mesaB,
      docentes,
      correlatividades,
      config: examCallConfig,
    })

    if (!evaluation.success) return evaluation
    if (!titularRefsTeachOnMesaDate(evaluation.combinedMesa, docenteMap)) {
      return createTitularDayFailure(evaluation.combinedMesa)
    }

    const combinedMesaId = getMesaId(evaluation.combinedMesa)
    const baseParticipaciones = buildParticipacionesForMesas({
      readyMesas,
      mesaSelections,
      teacherAssignments,
      docenteMap,
      excludedMesaIds: new Set([mesaIdA, mesaIdB]),
    })
    const combinedSelection = buildAutoSelectionForCombinedMesa({
      mesa: evaluation.combinedMesa,
      docentes,
      docenteMap,
      participaciones: baseParticipaciones,
      rules,
    })

    setWorkingSchedule((prev) => [
      ...prev.filter((mesa) => getMesaId(mesa) !== mesaIdA && getMesaId(mesa) !== mesaIdB),
      evaluation.combinedMesa,
    ])

    setMesaSelections((prev) => {
      const next = new Map(prev)
      next.delete(mesaIdA)
      next.delete(mesaIdB)
      next.set(combinedMesaId, combinedSelection)
      return next
    })

    setActiveMesaId(combinedMesaId)

    return evaluation
  }, [workingSchedule, readyMesas, mesaSelections, teacherAssignments, docentes, docenteMap, correlatividades, examCallConfig, rules])

  const undoCombineMesas = useCallback((combinedMesaId) => {
    const combinedMesa = workingSchedule.find((mesa) => getMesaId(mesa) === combinedMesaId)
    const sourceMesas = combinedMesa?.metadata?.combinedFrom?.sourceMesas

    if (!combinedMesa || !Array.isArray(sourceMesas) || sourceMesas.length < 2) return false

    setWorkingSchedule((prev) => [
      ...prev.filter((mesa) => getMesaId(mesa) !== combinedMesaId),
      ...sourceMesas,
    ])

    // Vocal selections made for the combined mesa are simply dropped - the
    // restored mesas start unselected again rather than trying to recover
    // whatever selections existed before the combination.
    setMesaSelections((prev) => {
      if (!prev.has(combinedMesaId)) return prev
      const next = new Map(prev)
      next.delete(combinedMesaId)
      return next
    })

    setActiveMesaId(getMesaId(sourceMesas[0]))

    return true
  }, [workingSchedule])

  const getCombinableMesas = useCallback((mesaId) => {
    const mesa = readyMesas.find((item) => getMesaId(item) === mesaId)
    if (!mesa) return []
    if (groupedSubjectCount(mesa) >= MAX_SUBJECTS_PER_MESA) return []

    const sameCareerCandidates = readyMesas.filter((item) => {
      if (getMesaId(item) === mesaId || item.combinada) return false
      const nearbyTic = isTicMesa(mesa) && isTicMesa(item) && dateDistanceInDays(mesa, item) <= 2
      const sameCareer = normalizeKey(item.carrera) === normalizeKey(mesa.carrera)
      const permittedCrossCareer = !sameCareer && canCombineMesasByCareerRule(mesa, item)
      return sameCareer || (permittedCrossCareer && (!isTicMesa(mesa) || nearbyTic))
    })

    return sameCareerCandidates
      .map((candidate) => {
        const forward = evaluateMesaCombination({
          mesaA: mesa,
          mesaB: candidate,
          docentes,
          correlatividades,
          config: examCallConfig,
        })
        if (forward.success) {
          if (!titularRefsTeachOnMesaDate(forward.combinedMesa, docenteMap)) {
            return {
              mesa: candidate,
              evaluation: createTitularDayFailure(forward.combinedMesa),
              combineArgs: [mesaId, getMesaId(candidate)],
            }
          }

          return { mesa: candidate, evaluation: forward, combineArgs: [mesaId, getMesaId(candidate)] }
        }

        return { mesa: candidate, evaluation: forward, combineArgs: [mesaId, getMesaId(candidate)] }
      })
      .filter(({ evaluation }) => evaluation.success)
      .map(({ mesa: candidate, evaluation, combineArgs }) => ({
        mesa: candidate,
        tipoCompactacion: evaluation.combinedMesa.tipoCompactacion,
        combinedMesaPreview: evaluation.combinedMesa,
        combineArgs,
      }))
      .sort((left, right) => (
        TYPE_PRIORITY.indexOf(left.tipoCompactacion) - TYPE_PRIORITY.indexOf(right.tipoCompactacion)
      ))
  }, [readyMesas, docentes, docenteMap, correlatividades, examCallConfig])

  const finalizeSession = useCallback(() => {
    const generatedTribunals = readyMesas.map((mesa) => mesaResults.get(getMesaId(mesa)).mesa)
    const validation = validateGeneratedTribunals({
      generatedTribunals,
      reviewedSchedule: workingSchedule,
      skippedMesas,
      docentes,
      participaciones,
      examCallConfig,
      tribunalRules: rules,
    })

    return {
      success: validation.errors.length === 0,
      stage: 'GENERATE_TRIBUNALS_FROM_REVIEWED_SCHEDULE',
      generatedTribunals,
      tribunales: generatedTribunals,
      skippedMesas,
      participaciones,
      validation,
      errors: validation.errors,
      warnings: validation.warnings,
      summary: summarizeGeneratedTribunals(generatedTribunals, skippedMesas, validation),
      metadata: {
        config: examCallConfig,
        tribunalRules: rules,
        source: 'INTERACTIVE_SELECTION',
        halfPlusOneAppliedToVocaliasOnly: rules.aplicarMitadMasUno && rules.mitadMasUnoSoloVocalias,
      },
    }
  }, [readyMesas, mesaResults, workingSchedule, skippedMesas, docentes, participaciones, examCallConfig, rules])

  const progressSummary = useMemo(() => {
    const estados = [...mesaResults.values()].map((entry) => entry.mesa.estado)

    return {
      total: readyMesas.length,
      completos: estados.filter((estado) => estado === 'TRIBUNAL_COMPLETE').length,
      minimos: estados.filter((estado) => estado === 'TRIBUNAL_MINIMUM').length,
      incompletos: estados.filter((estado) => estado === 'TRIBUNAL_INCOMPLETE').length,
      necesitanRevision: estados.filter((estado) => estado === 'NEEDS_INSTITUTIONAL_REVIEW').length,
    }
  }, [mesaResults, readyMesas])

  const teacherLoadSummary = useMemo(() => {
    const keys = new Map()

    participaciones
      .filter((participacion) => participacion.rol === 'VOCAL_1' || participacion.rol === 'VOCAL_2')
      .forEach((participacion) => {
        keys.set(`${participacion.docenteId}::${participacion.llamado}`, {
          docenteId: participacion.docenteId,
          llamado: participacion.llamado,
        })
      })

    return [...keys.values()]
      .map(({ docenteId, llamado }) => {
        const docente = findTribunalDocente(docenteMap, docenteId)
        const limitResult = calculateTeacherAssignmentLimit({
          teacher: docente ?? { id: docenteId },
          ruleMode: TEACHER_ASSIGNMENT_RULE_MODES.TEACHING_HOURS_HALF_PLUS_ONE,
        })
        const vocaliasAsignadas = contarVocaliasPorDocente(participaciones, docenteId, llamado)

        return {
          docenteId,
          llamado,
          nombre: docente ? getTribunalDocenteLabel(docente) : docenteId,
          vocaliasAsignadas,
          limiteVocalias: limitResult.limit,
          disponible: Math.max(0, limitResult.limit - vocaliasAsignadas),
        }
      })
      .sort((left, right) => left.nombre.localeCompare(right.nombre))
  }, [participaciones, docenteMap])

  return {
    readyMesas,
    skippedMesas,
    mesaResults,
    activeMesa,
    activeMesaId: activeMesa ? getMesaId(activeMesa) : '',
    setActiveMesaId,
    getSelectableCandidatesForMesa,
    selectVocal,
    undoVocal,
    autoCompleteAll,
    resetSelections,
    combineMesas,
    undoCombineMesas,
    getCombinableMesas,
    finalizeSession,
    progressSummary,
    teacherLoadSummary,
  }
}

export default useInteractiveTribunalSession
