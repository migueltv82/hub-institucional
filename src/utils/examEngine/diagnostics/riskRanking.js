import { normalizeMesaExamen } from '../contracts.js'
import { detectarFamiliaMateria, docenteTieneAfinidadConMesa, FAMILIAS_AFINIDAD } from '../rules/affinities.js'
import { buildParticipacionesFromMesas } from '../validation/validateCronograma.js'
import { countVocaliasRealesPorDocente } from '../validation/validateTeacherLoad.js'
import { getSubjectCareer, getSubjectKey, getSubjectName, normalizeText } from '../normalize/subjects.js'

// Risk ranking prioritizes constrained entities before easy ones.

const CRITICAL_FAMILIES = new Set([
  FAMILIAS_AFINIDAD.INGLES,
  FAMILIAS_AFINIDAD.INFORMATICA_TIC,
  FAMILIAS_AFINIDAD.PRACTICA_PEDAGOGICA,
  FAMILIAS_AFINIDAD.PRACTICA_TECNICA,
])

function clean(value) {
  return String(value ?? '').trim()
}

function uniqueCount(value) {
  if (Array.isArray(value)) return new Set(value.map(clean).filter(Boolean).map(normalizeText)).size
  if (value instanceof Set) return uniqueCount([...value])

  const numberValue = Number(value)
  return Number.isFinite(numberValue) && numberValue > 0 ? numberValue : 0
}

function getDocenteId(docente = {}) {
  if (typeof docente === 'string') return clean(docente)

  return clean(
    docente.id ??
    docente.docenteId ??
    docente.teacherKey ??
    docente.dni ??
    docente.email ??
    docente.nombre,
  )
}

function getDocenteLabel(docente = {}) {
  if (typeof docente === 'string') return docente

  return clean(
    docente.nombre ??
    docente.full_name ??
    docente.display_name ??
    docente.profesor ??
    docente.docente ??
    getDocenteId(docente),
  )
}

function getTitularId(entity = {}) {
  return clean(
    entity.titular_id ??
    entity.titularId ??
    entity.presidente_id ??
    entity.profesorTitular ??
    entity.docenteTitular ??
    entity.titular?.id ??
    entity.titular?.nombre ??
    entity.titular,
  )
}

function docenteEstaActivo(docente = {}) {
  if (!('activo' in docente) && !('active' in docente) && !('isActive' in docente)) return true
  return docente.activo !== false && docente.active !== false && docente.isActive !== false
}

function getDiasDisponiblesCount(docente = {}) {
  if (typeof docente === 'number') return uniqueCount(docente)

  return uniqueCount(
    docente.diasAsistencia ??
    docente.diasDisponibles ??
    docente.disponibilidad ??
    docente.diasLaborales ??
    docente.cantidadDiasAsistencia ??
    docente.cantidadDiasDisponibles,
  )
}

function countTitularSubjects(docente = {}, materias = []) {
  const docenteKey = normalizeText(getDocenteId(docente))
  if (!docenteKey) return 0

  return materias.filter((materia) => normalizeText(getTitularId(materia)) === docenteKey).length
}

function countVocalOptions(materia = {}, docentes = []) {
  const titularKey = normalizeText(getTitularId(materia))

  return docentes.filter((docente) => {
    if (!docenteEstaActivo(docente)) return false
    if (normalizeText(getDocenteId(docente)) === titularKey) return false
    return docenteTieneAfinidadConMesa(docente, materia)
  }).length
}

function getSeverityRank(severity) {
  if (severity === 'HIGH') return 3
  if (severity === 'MEDIUM') return 2
  return 1
}

function buildRisk({
  type,
  severity,
  entityType,
  entityId,
  label,
  reason,
  suggestedAction,
}) {
  return {
    type,
    severity,
    entityType,
    entityId,
    label,
    reason,
    suggestedAction,
  }
}

export function getSubjectRiskScore(subject = {}, context = {}) {
  let score = 0

  if (context.subjectsWithoutTitular?.has?.(getSubjectKey(subject))) score += 100
  if (Array.isArray(subject.correlativas) && subject.correlativas.length) score += 20
  if (subject.requiresCrossTribunal) score += 15
  if (CRITICAL_FAMILIES.has(detectarFamiliaMateria(subject))) score += 10

  return score
}

export function rankSubjectsByRisk(subjects = [], context = {}) {
  return [...subjects]
    .map((subject, index) => ({
      index,
      score: getSubjectRiskScore(subject, context),
      subject,
    }))
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .map((entry) => entry.subject)
}

export function buildRiskRanking(diagnosisInput = {}) {
  const docentes = Array.isArray(diagnosisInput.docentes) ? diagnosisInput.docentes : []
  const materias = Array.isArray(diagnosisInput.materias) ? diagnosisInput.materias : []
  const mesas = Array.isArray(diagnosisInput.mesas)
    ? diagnosisInput.mesas.map(normalizeMesaExamen)
    : []
  const participaciones = Array.isArray(diagnosisInput.participaciones)
    ? diagnosisInput.participaciones
    : buildParticipacionesFromMesas(mesas)
  const risks = []

  docentes.forEach((docente) => {
    const docenteId = getDocenteId(docente)
    if (!docenteId) return

    const titularCount = countTitularSubjects(docente, materias)
    if (titularCount >= 3) {
      risks.push(buildRisk({
        type: 'DOCENTE_MUCHAS_TITULARIDADES',
        severity: titularCount >= 5 ? 'HIGH' : 'MEDIUM',
        entityType: 'DOCENTE',
        entityId: docenteId,
        label: getDocenteLabel(docente),
        reason: `El docente figura como titular en ${titularCount} materias.`,
        suggestedAction: 'Revisar distribucion de titularidades antes de planificar vocalias.',
      }))
    }

    const diasDisponibles = getDiasDisponiblesCount(docente)
    if (diasDisponibles > 0 && diasDisponibles <= 1) {
      risks.push(buildRisk({
        type: 'DOCENTE_POCAS_FECHAS',
        severity: 'HIGH',
        entityType: 'DOCENTE',
        entityId: docenteId,
        label: getDocenteLabel(docente),
        reason: 'El docente tiene una sola fecha o dia disponible.',
        suggestedAction: 'Priorizar sus mesas propias y evitar asignarlo como vocal salvo necesidad.',
      }))
    }

    const vocaliasPrimerLlamado = countVocaliasRealesPorDocente(participaciones, docenteId, 'PRIMER_LLAMADO')
    const vocaliasSegundoLlamado = countVocaliasRealesPorDocente(participaciones, docenteId, 'SEGUNDO_LLAMADO')
    const vocaliasEspecial = countVocaliasRealesPorDocente(participaciones, docenteId, 'LLAMADO_ESPECIAL')
    const maxVocalias = Math.max(vocaliasPrimerLlamado, vocaliasSegundoLlamado, vocaliasEspecial)
    if (maxVocalias >= 3) {
      risks.push(buildRisk({
        type: 'DOCENTE_MUY_USADO_COMO_VOCAL',
        severity: maxVocalias >= 4 ? 'HIGH' : 'MEDIUM',
        entityType: 'DOCENTE',
        entityId: docenteId,
        label: getDocenteLabel(docente),
        reason: `El docente tiene ${maxVocalias} vocalias en un llamado.`,
        suggestedAction: 'Revisar limite de mitad mas uno y distribuir vocalias.',
      }))
    }
  })

  materias.forEach((materia) => {
    const optionsCount = countVocalOptions(materia, docentes)
    const subjectKey = getSubjectKey(materia)
    if (optionsCount < 2) {
      risks.push(buildRisk({
        type: 'MATERIA_POCOS_VOCALES_POSIBLES',
        severity: optionsCount === 0 ? 'HIGH' : 'MEDIUM',
        entityType: 'MATERIA',
        entityId: subjectKey,
        label: getSubjectName(materia),
        reason: `La materia tiene ${optionsCount} vocales posibles detectados.`,
        suggestedAction: 'Cargar idoneidades o revisar docentes afines antes de generar.',
      }))
    }

    const family = detectarFamiliaMateria(materia)
    if (CRITICAL_FAMILIES.has(family)) {
      risks.push(buildRisk({
        type: 'FAMILIA_CRITICA',
        severity: 'LOW',
        entityType: 'MATERIA',
        entityId: subjectKey,
        label: getSubjectName(materia),
        reason: `La materia pertenece a una familia critica: ${family}.`,
        suggestedAction: 'Validar criterios de afinidad antes de compactar o asignar vocales.',
      }))
    }
  })

  const careerOptions = materias.reduce((map, materia) => {
    const career = normalizeText(getSubjectCareer(materia))
    if (!career) return map

    const current = map.get(career) ?? {
      carrera: getSubjectCareer(materia),
      materias: 0,
      options: new Set(),
    }
    current.materias += 1
    docentes.forEach((docente) => {
      if (docenteEstaActivo(docente) && docenteTieneAfinidadConMesa(docente, materia)) {
        current.options.add(getDocenteId(docente))
      }
    })
    map.set(career, current)
    return map
  }, new Map())

  careerOptions.forEach((entry, careerKey) => {
    if (entry.materias >= 2 && entry.options.size < 3) {
      risks.push(buildRisk({
        type: 'CARRERA_POCAS_OPCIONES_TRIBUNAL',
        severity: entry.options.size < 2 ? 'HIGH' : 'MEDIUM',
        entityType: 'CARRERA',
        entityId: careerKey,
        label: entry.carrera,
        reason: `La carrera tiene ${entry.options.size} docentes afines detectados para tribunal.`,
        suggestedAction: 'Revisar carga docente y posibles idoneidades por carrera.',
      }))
    }
  })

  return risks.sort((left, right) => (
    getSeverityRank(right.severity) - getSeverityRank(left.severity) ||
    left.type.localeCompare(right.type) ||
    left.label.localeCompare(right.label)
  ))
}
