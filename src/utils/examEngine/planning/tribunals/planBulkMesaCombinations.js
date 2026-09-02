import { SAFE_COMPACTION_TYPES, TYPE_PRIORITY } from '../compactMesas.js'
import { evaluateMesaCombination } from './combineReviewedMesas.js'
import { mesaIsReady } from './generateTribunalsFromReviewedSchedule.js'

// Bulk preview/apply for "combine mesas" over a whole reviewedSchedule.
// Reuses evaluateMesaCombination (the same pairwise gate the interactive
// manual combine panel uses) as the single source of truth for whether two
// mesas may merge, so the bulk plan can never approve a combination the
// manual flow would reject (e.g. the intercarrera-only-for-TIC/pedagogicas
// rule lives only in evaluateMesaCombination, not in compactCompatibleMesas
// itself). This function only adds the multi-pair, non-overlapping greedy
// selection across all candidate pairs, mirroring the same priority order
// compactCompatibleMesas uses internally for a single mesa list.
export function planBulkMesaCombinations({
  reviewedSchedule = [],
  docentes = [],
  correlatividades = [],
  examCallConfig = {},
  compactMode = 'safe',
} = {}) {
  const candidateIndexes = []
  const restMesas = []

  reviewedSchedule.forEach((mesa, index) => {
    if (mesaIsReady(mesa)) candidateIndexes.push(index)
    else restMesas.push(mesa)
  })

  const evaluations = []
  for (let leftPos = 0; leftPos < candidateIndexes.length; leftPos += 1) {
    for (let rightPos = leftPos + 1; rightPos < candidateIndexes.length; rightPos += 1) {
      const leftIndex = candidateIndexes[leftPos]
      const rightIndex = candidateIndexes[rightPos]
      const evaluation = evaluateMesaCombination({
        mesaA: reviewedSchedule[leftIndex],
        mesaB: reviewedSchedule[rightIndex],
        docentes,
        correlatividades,
        config: examCallConfig,
      })
      if (!evaluation.success) continue

      const tipoCompactacion = evaluation.combinedMesa.tipoCompactacion
      if (compactMode === 'safe' && !SAFE_COMPACTION_TYPES.has(tipoCompactacion)) continue

      evaluations.push({ leftIndex, rightIndex, tipoCompactacion, combinedMesa: evaluation.combinedMesa })
    }
  }

  evaluations.sort((left, right) => (
    TYPE_PRIORITY.indexOf(left.tipoCompactacion) - TYPE_PRIORITY.indexOf(right.tipoCompactacion) ||
    left.leftIndex - right.leftIndex ||
    left.rightIndex - right.rightIndex
  ))

  const usedIndexes = new Set()
  const combinedMesas = []
  evaluations.forEach(({ leftIndex, rightIndex, combinedMesa }) => {
    if (usedIndexes.has(leftIndex) || usedIndexes.has(rightIndex)) return
    usedIndexes.add(leftIndex)
    usedIndexes.add(rightIndex)
    combinedMesas.push(combinedMesa)
  })

  const untouchedMesas = candidateIndexes
    .filter((index) => !usedIndexes.has(index))
    .map((index) => reviewedSchedule[index])

  const typeCounts = combinedMesas.reduce((counts, mesa) => {
    counts[mesa.tipoCompactacion] = (counts[mesa.tipoCompactacion] ?? 0) + 1
    return counts
  }, {})

  return {
    combinedMesas,
    typeCounts,
    totalCombinaciones: combinedMesas.length,
    reviewedSchedule: [...combinedMesas, ...untouchedMesas, ...restMesas],
  }
}
