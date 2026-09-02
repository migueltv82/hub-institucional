import { NIVELES_AFINIDAD, isAfinidadDebil } from '../../rules/affinities.js'

const AFFINITY_SCORE = {
  [NIVELES_AFINIDAD.MISMA_CARRERA]: 120,
  [NIVELES_AFINIDAD.MATERIA_HOMONIMA]: 110,
  [NIVELES_AFINIDAD.PRACTICA_TECNICA_MISMA_CARRERA]: 105,
  [NIVELES_AFINIDAD.FAMILIA_INGLES]: 100,
  [NIVELES_AFINIDAD.FAMILIA_INFORMATICA_TIC]: 98,
  [NIVELES_AFINIDAD.PRACTICA_PEDAGOGICA_TRANSVERSAL]: 94,
  [NIVELES_AFINIDAD.MATERIA_SIMILAR]: 88,
  [NIVELES_AFINIDAD.ESPECIALIDAD_DECLARADA]: 72,
  [NIVELES_AFINIDAD.IDONEIDAD_EXPLICITA]: 62,
  [NIVELES_AFINIDAD.SIN_AFINIDAD]: 0,
}

export function scoreTribunalCandidate(candidate = {}) {
  const affinityScore = AFFINITY_SCORE[candidate.nivelAfinidad] ?? 0
  const currentVocaliasPenalty = Number(candidate.vocaliasAsignadas ?? 0) * 12
  const dailyPenalty = Number(candidate.participacionesMismoDia ?? 0) * 8
  const totalLoadPenalty = Number(candidate.cargaTotal ?? 0) * 4
  const availabilityBonus = Number(candidate.disponibilidadDias ?? 0)
  const weakAffinityPenalty = isAfinidadDebil(candidate.nivelAfinidad) ? 10 : 0

  return affinityScore + availabilityBonus - currentVocaliasPenalty - dailyPenalty - totalLoadPenalty - weakAffinityPenalty
}
