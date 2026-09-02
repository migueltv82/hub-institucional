import { MAX_SUBJECTS_PER_MESA } from '../constants.js'
import {
  normalizeExamPeriodConfig,
  normalizeLlamado,
  normalizeMesaExamen,
  validateExamPeriodConfig,
} from '../contracts.js'
import {
  getSubjectCode,
  getSubjectKey,
  getSubjectName,
  isNonGroupableSubject,
  normalizeText,
} from '../normalize/subjects.js'
import {
  canCombineInstitutionalEnglishSubjects,
  detectarFamiliaMateria,
  FAMILIAS_AFINIDAD,
  getNivelAfinidadDocenteMesa,
  hasAcademicAffinity,
  isServiceEnglishSubject,
} from '../rules/affinities.js'
import { getLlamadosRequeridos } from '../rules/regularCalls.js'
import { validateTribunals } from '../validation/validateTribunals.js'

// Controlled compaction only groups clearly compatible post-assignment mesas.
// It never assigns definitive dates and never generates a final schedule.

const COMPACTION_TYPES = {
  MISMO_TITULAR: 'MISMO_TITULAR',
  MATERIA_HOMONIMA: 'MATERIA_HOMONIMA',
  CORRELATIVA_DIRECTA: 'CORRELATIVA_DIRECTA',
  MISMA_CARRERA: 'MISMA_CARRERA',
  CARRERA_COMPATIBLE: 'CARRERA_COMPATIBLE',
  FAMILIA_IDONEIDAD: 'FAMILIA_IDONEIDAD',
  INGLES_INSTITUCIONAL: 'INGLES_INSTITUCIONAL',
}

export const TYPE_PRIORITY = [
  COMPACTION_TYPES.MISMO_TITULAR,
  COMPACTION_TYPES.MATERIA_HOMONIMA,
  COMPACTION_TYPES.INGLES_INSTITUCIONAL,
  COMPACTION_TYPES.CORRELATIVA_DIRECTA,
  COMPACTION_TYPES.MISMA_CARRERA,
  COMPACTION_TYPES.CARRERA_COMPATIBLE,
  COMPACTION_TYPES.FAMILIA_IDONEIDAD,
]

export const SAFE_COMPACTION_TYPES = new Set([
  COMPACTION_TYPES.MISMO_TITULAR,
  COMPACTION_TYPES.MATERIA_HOMONIMA,
  COMPACTION_TYPES.MISMA_CARRERA,
])

function clean(value) {
  return String(value ?? '').trim()
}

function normalizeCompactMode(value, defaultMode = true) {
  if (value === false || value === 'false') return false
  if (value === 'safe') return 'safe'
  if (value === true || value === 'true' || value === 'full') return true
  return defaultMode
}

function cloneMesa(mesa = {}) {
  return {
    ...mesa,
    warnings: Array.isArray(mesa.warnings) ? [...mesa.warnings] : [],
    errors: Array.isArray(mesa.errors) ? [...mesa.errors] : [],
    alertas: Array.isArray(mesa.alertas) ? [...mesa.alertas] : [],
    materiasAgrupadas: Array.isArray(mesa.materiasAgrupadas)
      ? mesa.materiasAgrupadas.map((materia) => ({ ...materia }))
      : mesa.materiasAgrupadas,
    metadata: {
      ...(mesa.metadata ?? {}),
    },
  }
}

function normalizeMesaForCompaction(mesa = {}) {
  const normalizedMesa = normalizeMesaExamen(mesa)

  return {
    ...cloneMesa(mesa),
    ...normalizedMesa,
    exam_call: normalizeLlamado(normalizedMesa.llamado || mesa.exam_call || mesa.llamado),
    llamado: normalizeLlamado(normalizedMesa.llamado || mesa.llamado || mesa.exam_call),
    titularId: normalizedMesa.titularId || mesa.titularId || '',
    vocal1Id: normalizedMesa.vocal1Id || mesa.vocal1Id || '',
    vocal2Id: normalizedMesa.vocal2Id || mesa.vocal2Id || '',
  }
}

function getMesaSubjects(mesa = {}) {
  if (Array.isArray(mesa.materiasAgrupadas) && mesa.materiasAgrupadas.length) {
    return mesa.materiasAgrupadas.map((subject) => ({
      ...subject,
      llamado: subject.llamado ?? mesa.llamado,
    }))
  }

  return [{
    id: mesa.id || mesa.materiaId,
    materiaId: mesa.materiaId,
    materiaCodigo: mesa.materiaCodigo,
    codigo: mesa.codigo ?? mesa.materiaCodigo,
    materia: mesa.materia,
    nombreMateria: mesa.nombreMateria ?? mesa.materia,
    carreraId: mesa.carreraId,
    carrera: mesa.carrera,
    anio: mesa.anio,
    titularId: mesa.titularId,
    titular: mesa.titular ?? mesa.titularNombre,
    familiaIdoneidad: mesa.familiaIdoneidad,
    grupo_afin_mesa: mesa.grupo_afin_mesa ?? mesa.grupoAfinMesa,
    codigos_materias_afines: mesa.codigos_materias_afines ?? mesa.codigosMateriasAfines,
    llamado: mesa.llamado,
  }]
}

function getDocenteKeys(docente = {}) {
  return [
    docente.id,
    docente.docenteId,
    docente.teacherKey,
    docente.dni,
    docente.email,
    docente.nombre,
    docente.full_name,
    docente.profesor,
  ].map(normalizeText).filter(Boolean)
}

function buildDocenteMap(docentes = []) {
  return docentes.reduce((map, docente) => {
    getDocenteKeys(docente).forEach((key) => map.set(key, docente))
    return map
  }, new Map())
}

function findDocente(docenteMap, docenteId = '') {
  return docenteMap.get(normalizeText(docenteId)) ?? null
}

function sameKey(left = '', right = '') {
  return normalizeText(left) === normalizeText(right)
}

function getCareerKey(subject = {}) {
  return normalizeText(subject.carrera ?? subject.carreraId)
}

function getSubjectNameKey(subject = {}) {
  return normalizeText(getSubjectName(subject) || subject.materia || subject.materiaId)
    .replaceAll(/\b(i|ii|iii|iv|v)\b/g, '')
    .replaceAll(/\s+/g, ' ')
    .trim()
}

function getVocalIds(mesa = {}) {
  return [mesa.vocal1Id, mesa.vocal2Id].map(clean).filter(Boolean)
}

function getUniqueValues(values = []) {
  return [...new Set(values.map(clean).filter(Boolean))]
}

function getTitularEntries(mesa = {}) {
  const entries = []
  const pushEntry = ({ docenteId = '', nombre = '', sourceMesaId = '' } = {}) => {
    const key = normalizeText(docenteId || nombre)
    if (!key || entries.some((entry) => entry.key === key)) return

    entries.push({
      key,
      docenteId: clean(docenteId || nombre),
      nombre: clean(nombre || docenteId),
      sourceMesaId: clean(sourceMesaId),
    })
  }

  pushEntry({
    docenteId: mesa.titularId,
    nombre: mesa.titular ?? mesa.titularNombre,
    sourceMesaId: mesa.id,
  })

  if (Array.isArray(mesa.titularesDetalle)) {
    mesa.titularesDetalle.forEach((entry) => pushEntry({
      docenteId: entry.docenteId ?? entry.id,
      nombre: entry.nombre,
      sourceMesaId: entry.sourceMesaId,
    }))
  }

  if (Array.isArray(mesa.titularesInvolucrados)) {
    mesa.titularesInvolucrados.forEach((entry) => {
      if (typeof entry === 'object') {
        pushEntry({
          docenteId: entry.docenteId ?? entry.id,
          nombre: entry.nombre,
          sourceMesaId: entry.sourceMesaId,
        })
        return
      }

      pushEntry({ docenteId: entry, sourceMesaId: mesa.id })
    })
  }

  getMesaSubjects(mesa).forEach((subject) => pushEntry({
    docenteId: subject.titularId,
    nombre: subject.titular ?? subject.titularNombre,
    sourceMesaId: subject.id ?? subject.mesaId ?? subject.materiaId,
  }))

  return entries
}

function createSkipped(mesaIds = [], reason, detail = '', severity = 'warning') {
  return {
    mesaIds,
    reason,
    severity,
    detail,
  }
}

function hasNonGroupableSubject(subjects = []) {
  return subjects.some(isNonGroupableSubject)
}

function hasTechnicalPracticeConflict(subjects = []) {
  const families = subjects.map(detectarFamiliaMateria)
  const hasTechnicalPractice = families.includes(FAMILIAS_AFINIDAD.PRACTICA_TECNICA)
  const hasPedagogicalPractice = families.includes(FAMILIAS_AFINIDAD.PRACTICA_PEDAGOGICA)
  if (hasTechnicalPractice && hasPedagogicalPractice) return true

  if (!hasTechnicalPractice) return false

  const technicalCareers = subjects
    .filter((subject) => detectarFamiliaMateria(subject) === FAMILIAS_AFINIDAD.PRACTICA_TECNICA)
    .map(getCareerKey)
    .filter(Boolean)

  return new Set(technicalCareers).size > 1
}

function areCareersCompatible(left = {}, right = {}) {
  const leftCareer = getCareerKey(left)
  const rightCareer = getCareerKey(right)
  if (!leftCareer || !rightCareer) return false
  if (leftCareer === rightCareer) return true

  return (
    (leftCareer.includes('profesorado') && rightCareer.includes('profesorado')) ||
    (leftCareer.includes('traductorado') && rightCareer.includes('traductorado'))
  )
}

function areFamiliesCompatible(left = {}, right = {}) {
  const leftDeclaredGroup = clean(left.grupo_afin_mesa ?? left.grupoAfinMesa).toUpperCase()
  const rightDeclaredGroup = clean(right.grupo_afin_mesa ?? right.grupoAfinMesa).toUpperCase()
  if (leftDeclaredGroup && leftDeclaredGroup === rightDeclaredGroup) return true
  const leftFamily = detectarFamiliaMateria(left)
  const rightFamily = detectarFamiliaMateria(right)
  return leftFamily !== FAMILIAS_AFINIDAD.GENERAL && leftFamily === rightFamily
}

function getCorrelativityNames(correlatividad = {}) {
  return Array.isArray(correlatividad.correlativas)
    ? correlatividad.correlativas.map((value) => normalizeText(value))
    : []
}

function hasDirectCorrelativity(left = {}, right = {}, correlatividades = []) {
  const leftKey = getSubjectKey(left)
  const rightKey = getSubjectKey(right)
  const leftName = normalizeText(getSubjectName(left) || left.materia)
  const rightName = normalizeText(getSubjectName(right) || right.materia)

  return correlatividades.some((row) => {
    const rowKey = getSubjectKey(row)
    const previas = getCorrelativityNames(row)
    if (rowKey === leftKey) return previas.includes(rightName)
    if (rowKey === rightKey) return previas.includes(leftName)
    return false
  })
}

export function hasInstitutionalEnglishCombination(left = {}, right = {}) {
  const leftSubjects = getMesaSubjects(left)
  const rightSubjects = getMesaSubjects(right)

  return leftSubjects.some((leftSubject) => (
    rightSubjects.some((rightSubject) => canCombineInstitutionalEnglishSubjects(leftSubject, rightSubject))
  ))
}

function hasBlockedServiceEnglishCombination(left = {}, right = {}) {
  const leftSubjects = getMesaSubjects(left)
  const rightSubjects = getMesaSubjects(right)

  return leftSubjects.some((leftSubject) => (
    rightSubjects.some((rightSubject) => (
      (isServiceEnglishSubject(leftSubject) || isServiceEnglishSubject(rightSubject)) &&
      !canCombineInstitutionalEnglishSubjects(leftSubject, rightSubject)
    ))
  ))
}

function getCompactionType(left = {}, right = {}, correlatividades = []) {
  if (sameKey(left.titularId, right.titularId)) return COMPACTION_TYPES.MISMO_TITULAR

  const leftSubject = getMesaSubjects(left)[0] ?? left
  const rightSubject = getMesaSubjects(right)[0] ?? right

  if (getSubjectNameKey(leftSubject) && getSubjectNameKey(leftSubject) === getSubjectNameKey(rightSubject)) {
    return COMPACTION_TYPES.MATERIA_HOMONIMA
  }

  if (hasInstitutionalEnglishCombination(left, right)) {
    return COMPACTION_TYPES.INGLES_INSTITUCIONAL
  }

  if (hasDirectCorrelativity(leftSubject, rightSubject, correlatividades)) {
    return COMPACTION_TYPES.CORRELATIVA_DIRECTA
  }

  if (getCareerKey(leftSubject) && getCareerKey(leftSubject) === getCareerKey(rightSubject)) {
    return COMPACTION_TYPES.MISMA_CARRERA
  }

  if (areCareersCompatible(leftSubject, rightSubject)) return COMPACTION_TYPES.CARRERA_COMPATIBLE
  if (areFamiliesCompatible(leftSubject, rightSubject)) return COMPACTION_TYPES.FAMILIA_IDONEIDAD

  return null
}

function haveCompatibleVocales(left = {}, right = {}) {
  const leftVocales = getVocalIds(left).map(normalizeText).sort()
  const rightVocales = getVocalIds(right).map(normalizeText).sort()
  if (!leftVocales.length || !rightVocales.length) return true
  if (leftVocales.length !== rightVocales.length) return false
  return leftVocales.every((docenteId, index) => docenteId === rightVocales[index])
}

function haveSameAssignedDateAndTurno(left = {}, right = {}) {
  const leftFecha = clean(left.fechaIso ?? left.fecha)
  const rightFecha = clean(right.fechaIso ?? right.fecha)
  const leftTurno = clean(left.turno)
  const rightTurno = clean(right.turno)

  return Boolean(
    leftFecha &&
    rightFecha &&
    leftTurno &&
    rightTurno &&
    leftFecha === rightFecha &&
    leftTurno === rightTurno,
  )
}

function hasTitularAsVocalInCompactedMesa(left = {}, right = {}) {
  const titulares = [...getTitularEntries(left), ...getTitularEntries(right)]
    .map((entry) => entry.key)
    .filter(Boolean)
  const vocales = [...getVocalIds(left), ...getVocalIds(right)].map(normalizeText)
  return titulares.some((titular) => vocales.includes(titular))
}

function validateGroupedVocalAffinities({ mesa, subjects, docentes, docenteMap }) {
  const errors = []
  getVocalIds(mesa).forEach((docenteId) => {
    const docente = findDocente(docenteMap, docenteId)
    if (!docente) return

    subjects.forEach((subject) => {
      const affinity = getNivelAfinidadDocenteMesa(docente, subject)
      if (!affinity.afinidadValida) {
        errors.push({
          docenteId,
          subject,
          motivo: affinity.motivo,
        })
      }
    })
  })

  if (!docentes.length) return errors
  return errors
}

function createCompactedMesa({ left, right, type, subjects }) {
  const titularesDetalle = [...getTitularEntries(left), ...getTitularEntries(right)]
    .reduce((entries, entry) => {
      if (!entry.key || entries.some((item) => item.key === entry.key)) return entries
      entries.push(entry)
      return entries
    }, [])
  const titularesInvolucrados = titularesDetalle.map((entry) => entry.docenteId)
  const tribunalCruzado = titularesInvolucrados.length > 1
  const warnings = [
    ...(left.warnings ?? []),
    ...(right.warnings ?? []),
  ]

  if (tribunalCruzado) {
    warnings.push({
      code: 'COMPACTACION_CON_TRIBUNAL_CRUZADO',
      message: 'La compactacion involucra titulares distintos y requiere registro separado.',
      severity: 'warning',
      mesaId: left.id,
      sourceMesaIds: [left.id, right.id],
    })
  }

  const materiaLabel = subjects.map((subject) => getSubjectName(subject) || subject.materia).filter(Boolean).join(' / ')
  const targetMesaId = `compact:${left.id}+${right.id}`
  // haveCompatibleVocales() approves the merge when either side has no
  // vocales loaded yet (not only when both sides match): whichever side
  // actually has vocales assigned must survive the ...left spread below.
  const vocalSource = getVocalIds(left).length ? left : right

  return {
    ...left,
    vocal1Id: vocalSource.vocal1Id,
    vocal1: vocalSource.vocal1,
    vocal2Id: vocalSource.vocal2Id,
    vocal2: vocalSource.vocal2,
    id: targetMesaId,
    sourceMesaIds: [left.id, right.id],
    materiaId: subjects.map((subject) => subject.materiaId || subject.materia || subject.id).filter(Boolean).join('+'),
    materia: materiaLabel,
    carreraId: getUniqueValues(subjects.map((subject) => subject.carreraId)).join('+') || left.carreraId,
    carrera: getUniqueValues(subjects.map((subject) => subject.carrera)).join(' / ') || left.carrera,
    llamado: left.llamado,
    exam_call: left.llamado,
    estado: 'COMPLETA',
    materiasAgrupadas: subjects.map((subject) => ({ ...subject })),
    titularesInvolucrados,
    titularesDetalle: titularesDetalle.map(({ key: _key, ...entry }) => entry),
    tribunalCruzado,
    tribunalesCruzados: tribunalCruzado
      ? titularesDetalle.slice(1).map((entry) => ({
        docenteId: entry.docenteId,
        sourceMesaId: entry.sourceMesaId || right.id,
        rol: 'TRIBUNAL_CRUZADO',
      }))
      : [],
    tipoCompactacion: type,
    compactada: true,
    warnings,
    errors: [
      ...(left.errors ?? []),
      ...(right.errors ?? []),
    ],
    metadata: {
      ...(left.metadata ?? {}),
      compactedFrom: [left.id, right.id],
    },
  }
}

function validatePair({ left, right, docentes, docenteMap, correlatividades, config, requireSameDateAndTurno = false, allowIncompleteTribunal = false }) {
  const mesaIds = [left.id, right.id]
  const subjects = [...getMesaSubjects(left), ...getMesaSubjects(right)]

  if (subjects.length > MAX_SUBJECTS_PER_MESA) {
    return { valid: false, skipped: createSkipped(mesaIds, 'MAXIMO_TRES_MATERIAS', 'La compactacion superaria tres materias.') }
  }

  if (hasNonGroupableSubject(subjects)) {
    return { valid: false, skipped: createSkipped(mesaIds, 'MATERIA_NO_AGRUPABLE', 'Una materia no agrupable debe permanecer individual.') }
  }

  if (!left.titularId || !right.titularId || !left.id || !right.id) {
    return { valid: false, skipped: createSkipped(mesaIds, 'DATOS_INCOMPLETOS', 'Faltan datos minimos para compactar.') }
  }

  if (normalizeLlamado(left.llamado) !== normalizeLlamado(right.llamado)) {
    return { valid: false, skipped: createSkipped(mesaIds, 'DISTINTO_LLAMADO', 'Las mesas pertenecen a llamados distintos.') }
  }

  if (requireSameDateAndTurno && !haveSameAssignedDateAndTurno(left, right)) {
    return {
      valid: false,
      skipped: createSkipped(
        mesaIds,
        'DISTINTA_FECHA_O_TURNO',
        'La compactacion date-aware requiere fecha y turno asignados exactamente iguales.',
      ),
    }
  }

  const requiredCalls = getLlamadosRequeridos(config)
  if (requiredCalls.length && !requiredCalls.includes(normalizeLlamado(left.llamado))) {
    return { valid: false, skipped: createSkipped(mesaIds, 'DATOS_INCOMPLETOS', 'El llamado no corresponde a la configuracion del periodo.') }
  }

  if (hasTechnicalPracticeConflict(subjects)) {
    return {
      valid: false,
      skipped: createSkipped(mesaIds, 'PRACTICA_TECNICA_INCOMPATIBLE', 'No se mezclan practicas tecnicas incompatibles ni practicas tecnicas con pedagogicas.'),
    }
  }

  if (hasTitularAsVocalInCompactedMesa(left, right)) {
    return {
      valid: false,
      skipped: createSkipped(mesaIds, 'TITULAR_DUPLICADO_COMO_VOCAL', 'Un titular quedaria registrado como vocal de la mesa compactada.', 'critical'),
    }
  }

  if (!haveCompatibleVocales(left, right)) {
    return { valid: false, skipped: createSkipped(mesaIds, 'TRIBUNAL_INVALIDO', 'Las mesas tienen vocales distintos y la compactacion podria perder tribunal.') }
  }

  const institutionalEnglishCombination = hasInstitutionalEnglishCombination(left, right)
  if (hasBlockedServiceEnglishCombination(left, right)) {
    return {
      valid: false,
      skipped: createSkipped(
        mesaIds,
        'SIN_AFINIDAD',
        'Ingles de carreras no ingles solo se combina con otro Ingles, primer anio de Profesorado/Traductorado de Ingles o materias de la misma titular en esas carreras.',
      ),
    }
  }

  const type = getCompactionType(left, right, correlatividades)
  if (!type) {
    return { valid: false, skipped: createSkipped(mesaIds, 'SIN_AFINIDAD', 'No se detecto compatibilidad suficiente para compactar.') }
  }

  if (
    !sameKey(left.titularId, right.titularId) &&
    !institutionalEnglishCombination &&
    !hasAcademicAffinity(subjects[0], subjects[1])
  ) {
    return { valid: false, skipped: createSkipped(mesaIds, 'SIN_AFINIDAD', 'Las materias no tienen afinidad academica suficiente.') }
  }

  const targetMesa = createCompactedMesa({ left, right, type, subjects })
  const affinityErrors = validateGroupedVocalAffinities({
    mesa: targetMesa,
    subjects,
    docentes,
    docenteMap,
  })
  if (affinityErrors.length) {
    return { valid: false, skipped: createSkipped(mesaIds, 'SIN_AFINIDAD', 'La compactacion romperia afinidad de vocales.') }
  }

  const tribunalValidation = allowIncompleteTribunal && getVocalIds(targetMesa).length === 0
    ? { valid: true, errors: [] }
    : validateTribunals({
        mesas: [targetMesa],
        docentes,
        config,
      })
  if (!tribunalValidation.valid) {
    const hasHalfPlusOneError = tribunalValidation.errors.some((error) => error.code === 'DOCENTE_EXCEDE_LIMITE_VOCALIAS')
    const hasTitularAsVocal = tribunalValidation.errors.some((error) => (
      error.code === 'TITULAR_AS_VOCAL' ||
      error.code === 'PARTICIPACION_TITULAR_COMO_VOCAL'
    ))

    if (hasHalfPlusOneError) {
      return { valid: false, skipped: createSkipped(mesaIds, 'MITAD_MAS_UNO_EXCEDIDA', 'La compactacion excederia mitad mas uno.', 'critical') }
    }

    if (hasTitularAsVocal) {
      return { valid: false, skipped: createSkipped(mesaIds, 'TITULAR_DUPLICADO_COMO_VOCAL', 'Un titular quedaria como vocal de su propia mesa.', 'critical') }
    }

    return { valid: false, skipped: createSkipped(mesaIds, 'TRIBUNAL_INVALIDO', 'El tribunal compactado no valida correctamente.', 'critical') }
  }

  return {
    valid: true,
    targetMesa,
    compactacion: {
      sourceMesaIds: mesaIds,
      targetMesaId: targetMesa.id,
      materiasAgrupadas: subjects.map((subject) => ({
        materiaId: subject.materiaId,
        materiaCodigo: getSubjectCode(subject),
        codigo: subject.codigo ?? subject.materiaCodigo,
        materia: subject.materia,
        nombreMateria: subject.nombreMateria,
        carreraId: subject.carreraId,
        carrera: subject.carrera,
      })),
      titularesInvolucrados: targetMesa.titularesInvolucrados,
      tipoCompactacion: type,
      motivo: `Compactacion controlada por ${type}.`,
      tribunalCruzado: targetMesa.tribunalCruzado,
      success: true,
      warnings: targetMesa.tribunalCruzado
        ? targetMesa.warnings.filter((warning) => warning.code === 'COMPACTACION_CON_TRIBUNAL_CRUZADO')
        : [],
    },
  }
}

function buildPairEvaluations({ mesas, docentes, docenteMap, correlatividades, config, requireSameDateAndTurno = false, allowIncompleteTribunal = false }) {
  const evaluations = []

  for (let leftIndex = 0; leftIndex < mesas.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < mesas.length; rightIndex += 1) {
      const left = mesas[leftIndex]
      const right = mesas[rightIndex]
      const evaluation = validatePair({
        left,
        right,
        docentes,
        docenteMap,
        correlatividades,
        config,
        requireSameDateAndTurno,
        allowIncompleteTribunal,
      })

      evaluations.push({
        ...evaluation,
        leftIndex,
        rightIndex,
        priority: evaluation.valid
          ? TYPE_PRIORITY.indexOf(evaluation.compactacion.tipoCompactacion)
          : Number.POSITIVE_INFINITY,
      })
    }
  }

  return evaluations
}

function isSafeCompactionEvaluation(evaluation = {}) {
  if (!evaluation.valid) return false
  const compactacion = evaluation.compactacion ?? {}
  if (!SAFE_COMPACTION_TYPES.has(compactacion.tipoCompactacion)) return false
  if (compactacion.tribunalCruzado) return false
  return true
}

function createUnsafeSkipped(evaluation = {}) {
  const compactacion = evaluation.compactacion ?? {}

  return createSkipped(
    compactacion.sourceMesaIds ?? [],
    'COMPACTACION_NO_SEGURA',
    'La compactacion se omite en modo seguro por riesgo institucional.',
  )
}

function summarize({
  initialTotal,
  finalMesas,
  compactaciones,
  skipped,
  errors,
  warnings,
  compactMode = true,
  requireSameDateAndTurno = false,
}) {
  return {
    totalMesasIniciales: initialTotal,
    totalMesasFinales: finalMesas.length,
    totalCompactaciones: compactaciones.length,
    totalSkipped: skipped.length,
    compactMode,
    ...(requireSameDateAndTurno ? { requireSameDateAndTurno: true } : {}),
    materiasNoAgrupablesRespetadas: skipped.filter((item) => item.reason === 'MATERIA_NO_AGRUPABLE').length,
    compactacionesConTribunalCruzado: compactaciones.filter((item) => item.tribunalCruzado).length,
    erroresCriticos: errors.filter((error) => String(error.severity).toLowerCase() === 'critical').length,
    advertencias: warnings.length,
  }
}

export function canCompactSubjects(subjects = []) {
  if (subjects.length === 0) return false
  if (subjects.length > MAX_SUBJECTS_PER_MESA) return false
  if (subjects.some(isNonGroupableSubject)) return false
  if (subjects.length === 1) return true

  return hasAcademicAffinity(subjects[0], subjects[1])
}

export function compactCompatibleMesas(input = {}) {
  const rawMesas = Array.isArray(input.mesas) ? input.mesas : []
  const docentes = Array.isArray(input.docentes) ? input.docentes : []
  const correlatividades = Array.isArray(input.correlatividades) ? input.correlatividades : []
  const compactMode = normalizeCompactMode(
    input.options?.compactMode ?? input.options?.compact ?? input.compactMode ?? input.compact,
    true,
  )
  const requireSameDateAndTurno = input.options?.requireSameDateAndTurno === true || input.requireSameDateAndTurno === true
  const allowIncompleteTribunal = input.options?.allowIncompleteTribunal === true || input.allowIncompleteTribunal === true
  const configValidation = validateExamPeriodConfig(input.config ?? {})
  const config = normalizeExamPeriodConfig(input.config ?? {})
  const errors = configValidation.valid ? [] : configValidation.errors
  const warnings = []
  const skipped = []
  const compactaciones = []
  const mesas = rawMesas.map(normalizeMesaForCompaction)
  const docenteMap = buildDocenteMap(docentes)
  const usedIndexes = new Set()
  const finalMesas = []

  if (errors.length) {
    return {
      mesasCompactadas: mesas.map(cloneMesa),
      compactaciones,
      skipped,
      errors,
      warnings,
      summary: summarize({
        initialTotal: mesas.length,
        finalMesas: mesas,
        compactaciones,
        skipped,
        errors,
        warnings,
        compactMode,
        requireSameDateAndTurno,
      }),
      metadata: {
        compactMode,
        ...(requireSameDateAndTurno ? { requireSameDateAndTurno: true } : {}),
      },
    }
  }

  const evaluations = buildPairEvaluations({
    mesas,
    docentes,
    docenteMap,
    correlatividades,
    config,
    requireSameDateAndTurno,
    allowIncompleteTribunal,
  }).sort((left, right) => (
    left.priority - right.priority ||
    left.leftIndex - right.leftIndex ||
    left.rightIndex - right.rightIndex
  ))

  evaluations.forEach((evaluation) => {
    if (usedIndexes.has(evaluation.leftIndex) || usedIndexes.has(evaluation.rightIndex)) return

    if (!evaluation.valid) {
      skipped.push(evaluation.skipped)
      return
    }

    if (compactMode === 'safe' && !isSafeCompactionEvaluation(evaluation)) {
      skipped.push(createUnsafeSkipped(evaluation))
      return
    }

    usedIndexes.add(evaluation.leftIndex)
    usedIndexes.add(evaluation.rightIndex)
    compactaciones.push(evaluation.compactacion)
    if (evaluation.targetMesa.tribunalCruzado) {
      warnings.push(...evaluation.compactacion.warnings)
    }
    finalMesas.push(evaluation.targetMesa)
  })

  mesas.forEach((mesa, index) => {
    if (!usedIndexes.has(index)) finalMesas.push(cloneMesa(mesa))
  })

  return {
    mesasCompactadas: finalMesas,
    compactaciones,
    skipped,
    errors,
    warnings,
    summary: summarize({
      initialTotal: mesas.length,
      finalMesas,
      compactaciones,
      skipped,
      errors,
      warnings,
      compactMode,
      requireSameDateAndTurno,
    }),
    metadata: {
      compactMode,
      ...(requireSameDateAndTurno ? { requireSameDateAndTurno: true } : {}),
    },
  }
}

export function compactMesas(candidates = []) {
  return compactCompatibleMesas({ mesas: candidates }).mesasCompactadas
}
