import {
  expandCareerAbbreviations,
  getSubjectCareer,
  getSubjectName,
  normalizeCareerText,
  normalizeText,
} from '../normalize/subjects.js'

// Institutional rule: vocales need academic affinity or explicit institutional suitability.

export const FAMILIAS_AFINIDAD = {
  GENERAL: 'GENERAL',
  INGLES: 'INGLES',
  INFORMATICA_TIC: 'INFORMATICA_TIC',
  PRACTICA_PEDAGOGICA: 'PRACTICA_PEDAGOGICA',
  PRACTICA_TECNICA: 'PRACTICA_TECNICA',
}

export const NIVELES_AFINIDAD = {
  CARRERA_INCOMPATIBLE: 'CARRERA_INCOMPATIBLE',
  MISMA_CARRERA: 'MISMA_CARRERA',
  MATERIA_HOMONIMA: 'MATERIA_HOMONIMA',
  MATERIA_SIMILAR: 'MATERIA_SIMILAR',
  ESPECIALIDAD_DECLARADA: 'ESPECIALIDAD_DECLARADA',
  FAMILIA_INGLES: 'FAMILIA_INGLES',
  FAMILIA_INFORMATICA_TIC: 'FAMILIA_INFORMATICA_TIC',
  PRACTICA_PEDAGOGICA_TRANSVERSAL: 'PRACTICA_PEDAGOGICA_TRANSVERSAL',
  PRACTICA_TECNICA_MISMA_CARRERA: 'PRACTICA_TECNICA_MISMA_CARRERA',
  IDONEIDAD_EXPLICITA: 'IDONEIDAD_EXPLICITA',
  SIN_AFINIDAD: 'SIN_AFINIDAD',
}

const WEAK_AFFINITY_LEVELS = new Set([
  NIVELES_AFINIDAD.ESPECIALIDAD_DECLARADA,
  NIVELES_AFINIDAD.IDONEIDAD_EXPLICITA,
])

const STOP_WORDS = new Set([
  'a',
  'al',
  'de',
  'del',
  'e',
  'el',
  'en',
  'i',
  'ii',
  'iii',
  'iv',
  'la',
  'las',
  'los',
  'para',
  'por',
  'y',
])

function clean(value) {
  return String(value ?? '').trim()
}

function textFromObject(value = {}) {
  return [
    value.carrera,
    value.programa,
    value.program,
    value.career,
    value.materia,
    value.codigo,
    value.code,
    value.nombreMateria,
    value.nombre,
    value.name,
    value.subject_name,
    value.area,
    value.campo,
    value.departamento,
    value.especialidad,
    value.especialidades,
    value.especialidadDeclarada,
    value.materias,
    value.materiasAsignadas,
    value.materiasDictadas,
    value.asignaturas,
    value.familiasIdoneidad,
    value.idoneidades,
    value.titulo,
    value.formacion,
  ].map(valueToText).filter(Boolean).join(' ')
}

function valueToText(value) {
  if (Array.isArray(value)) return value.map(valueToText).filter(Boolean).join(' ')
  if (value && typeof value === 'object') return textFromObject(value)
  return clean(value)
}

export function normalizeTextoAcademico(value) {
  return normalizeText(valueToText(value))
    .replaceAll(/[^a-z0-9]+/g, ' ')
    .replaceAll(/\s+/g, ' ')
    .trim()
}

function splitList(value) {
  if (Array.isArray(value)) return value.map(valueToText).map(clean).filter(Boolean)
  return String(value ?? '').split(/[|,;/]+/).map(clean).filter(Boolean)
}

function words(value) {
  return normalizeTextoAcademico(value).split(' ').filter(Boolean)
}

function wordSet(value) {
  return new Set(words(value))
}

function hasAnyWord(value, tokens) {
  const set = wordSet(value)
  return tokens.some((token) => set.has(token))
}

function hasPhrase(value, phrase) {
  return normalizeTextoAcademico(value).includes(normalizeTextoAcademico(phrase))
}

function getCareerValue(subject = {}) {
  if (typeof subject?.carrera === 'object') return subject.carrera.nombre ?? subject.carrera.name ?? subject.carrera.id
  return getSubjectCareer(subject) || subject.carreraId || subject.carrera_id
}

export { expandCareerAbbreviations }

function getCareerKey(subject = {}) {
  return normalizeCareerText(getCareerValue(subject))
}

// Un docente puede dictar en varias carreras; si el adaptador dejo un listado
// completo en `carreras`, se usa para no perder afinidad "misma carrera" fuera
// de la primera carrera detectada para ese docente.
function getCareerKeys(subject = {}) {
  const many = Array.isArray(subject?.carreras) ? subject.carreras : null
  if (many && many.length) {
    const keys = new Set(many.map((value) => normalizeCareerText(
      typeof value === 'object' ? (value?.nombre ?? value?.name ?? value?.id) : value,
    )).filter(Boolean))
    if (keys.size) return keys
  }

  const single = getCareerKey(subject)
  return single ? new Set([single]) : new Set()
}

function getSubjectNameValue(subject = {}) {
  if (typeof subject?.materia === 'object') {
    return subject.materia.nombreMateria ?? subject.materia.nombre ?? subject.materia.name ?? subject.materia.codigo
  }

  return getSubjectName(subject)
}

function importantTokens(value) {
  return words(value).filter((token) => !STOP_WORDS.has(token))
}

function hasEnglishFamily(subject = {}) {
  return hasAnyWord(subject, ['english', 'ingles', 'inglesa', 'inglesas', 'ingleses'])
}

function getIntercareerClassification(subject = {}) {
  return {
    nombreMateria: getSubjectNameValue(subject),
    familiaIdoneidad: subject.familiaIdoneidad ?? subject.familia_idoneidad,
    area: subject.area,
    campo: subject.campo,
    departamento: subject.departamento,
  }
}

function isIntercareerPedagogical(subject = {}) {
  const name = getIntercareerClassification(subject)
  return isProfesoradoPractice(subject) ||
    hasAnyWord(name, ['didactica', 'didacticas', 'pedagogia', 'pedagogica', 'pedagogicas']) ||
    hasPhrase(name, 'psicologia educacional') ||
    hasPhrase(name, 'psicologia educativa') ||
    hasPhrase(name, 'practica docente') ||
    hasPhrase(name, 'residencia docente')
}

export function esMateriaIntercarreraPermitida(subject = {}) {
  return isIntercareerPedagogical(subject) ||
    hasComputingFamily(getIntercareerClassification(subject))
}

function hasComputingFamily(subject = {}) {
  return (
    hasAnyWord(subject, ['computacion', 'informatica', 'programacion']) ||
    hasPhrase(subject, 'tecnologia de la informacion') ||
    hasAnyWord(subject, ['tic'])
  )
}

function isProfesoradoCareer(subject = {}) {
  return getCareerKey(subject).includes('profesorado')
}

function isTechnicalCareer(subject = {}) {
  const career = getCareerKey(subject)
  return career.includes('tecnicatura') || career.includes('tecnica') || career.includes('tecnico')
}

export function isEnglishDegreeCareer(subject = {}) {
  const career = getCareerKey(subject)
  return (
    ((career.includes('profesorado') || career.includes('prof ')) && career.includes('ingles')) ||
    career.includes('traductorado') ||
    career.includes('trad ')
  )
}

export function isEnglishFamilySubject(subject = {}) {
  return detectarFamiliaMateria(subject) === FAMILIAS_AFINIDAD.INGLES
}

export function isServiceEnglishSubject(subject = {}) {
  return isEnglishFamilySubject(subject) && !isEnglishDegreeCareer(subject)
}

function getSubjectYearNumber(subject = {}) {
  const raw = subject.anio ?? subject.ano ?? subject.year ?? subject.curso ?? subject.nivel
  const direct = Number(raw)
  if (Number.isFinite(direct) && direct > 0) return direct

  const match = clean(raw).match(/\d+/)
  return match ? Number(match[0]) : 0
}

export function isFirstYearEnglishDegreeSubject(subject = {}) {
  return isEnglishDegreeCareer(subject) && getSubjectYearNumber(subject) === 1
}

function sameTeacherKey(left = {}, right = {}) {
  const leftKey = normalizeText(left.titularId ?? left.docenteId ?? left.teacherId ?? left.titular ?? left.docente)
  const rightKey = normalizeText(right.titularId ?? right.docenteId ?? right.teacherId ?? right.titular ?? right.docente)
  return Boolean(leftKey && leftKey === rightKey)
}

export function canCombineInstitutionalEnglishSubjects(left = {}, right = {}) {
  const serviceSubject = isServiceEnglishSubject(left)
    ? left
    : isServiceEnglishSubject(right)
      ? right
      : null
  if (!serviceSubject) return false

  const otherSubject = serviceSubject === left ? right : left
  if (isServiceEnglishSubject(otherSubject)) return true
  if (!isEnglishDegreeCareer(otherSubject)) return false

  return isFirstYearEnglishDegreeSubject(otherSubject) || sameTeacherKey(serviceSubject, otherSubject)
}

export function docenteHasServiceEnglishAssignment(docente = {}) {
  const assignments = [
    ...(Array.isArray(docente.materiasAsignadas) ? docente.materiasAsignadas : []),
    ...(Array.isArray(docente.materiasDictadas) ? docente.materiasDictadas : []),
    ...(Array.isArray(docente.asignaturas) ? docente.asignaturas : []),
  ]

  if (assignments.some(isServiceEnglishSubject)) return true
  return isServiceEnglishSubject(docente)
}

export function canServiceEnglishTeacherBeVocalForMesa(docente = {}, mesa = {}) {
  if (!docenteHasServiceEnglishAssignment(docente)) return true
  return isEnglishFamilySubject(mesa)
}

function isProfesoradoPractice(subject = {}) {
  if (!isProfesoradoCareer(subject)) return false
  const text = normalizeTextoAcademico(getSubjectNameValue(subject))
  const tokens = wordSet(text)

  return (
    text.includes('residencia') ||
    text.includes('practica profesional docente') ||
    text.includes('practica docente') ||
    text.includes('practicas de ensenanza') ||
    (
      (tokens.has('practica') || tokens.has('practicas')) &&
      (tokens.has('docente') || tokens.has('ensenanza') || tokens.has('pedagogica') || tokens.has('pedagogicas'))
    )
  )
}

function isTechnicalPractice(subject = {}) {
  if (!isTechnicalCareer(subject)) return false
  const text = normalizeTextoAcademico(getSubjectNameValue(subject))
  return (
    text.includes('practica profesionalizante') ||
    text.includes('practicas profesionalizantes') ||
    text.includes('practica profesional') ||
    text.includes('practicas profesionales')
  )
}

function hasSameCareer(left = {}, right = {}) {
  const leftCareers = getCareerKeys(left)
  const rightCareers = getCareerKeys(right)
  if (!leftCareers.size || !rightCareers.size) return false

  for (const career of leftCareers) {
    if (rightCareers.has(career)) return true
  }
  return false
}

function hasHomonymousSubject(left = {}, right = {}) {
  const leftName = normalizeTextoAcademico(getSubjectNameValue(left))
  const rightName = normalizeTextoAcademico(getSubjectNameValue(right))
  if (!leftName || !rightName) return false
  return leftName === rightName
}

function hasSimilarSubject(left = {}, right = {}) {
  const leftName = normalizeTextoAcademico(getSubjectNameValue(left))
  const rightName = normalizeTextoAcademico(getSubjectNameValue(right))
  if (!leftName || !rightName) return false
  if (leftName.includes(rightName) || rightName.includes(leftName)) return true

  const leftTokens = new Set(importantTokens(leftName))
  const rightTokens = new Set(importantTokens(rightName))
  const shared = [...leftTokens].filter((token) => rightTokens.has(token))
  return shared.length >= 2
}

function getExplicitAffinityCodes(docente = {}) {
  return splitList(docente.codigos_materias_afines ?? docente.materias_afines ?? docente.materiasAfines)
    .map(normalizeTextoAcademico)
    .filter(Boolean)
}

function getAffinityGroups(value = {}) {
  return splitList(value.grupo_afin_mesa ?? value.grupoAfinMesa ?? value.gruposAfinidad)
    .map(normalizeTextoAcademico)
    .filter(Boolean)
}

function hasExplicitSubjectAffinity(docente = {}, mesa = {}) {
  const teacherGroups = getAffinityGroups(docente)
  const mesaGroups = getAffinityGroups(mesa)
  if (teacherGroups.some((group) => mesaGroups.includes(group))) return true

  const teacherCodes = splitList(docente.codigosMaterias ?? docente.materiasCodigos)
    .map(normalizeTextoAcademico)
  const mesaAffinityCodes = getExplicitAffinityCodes(mesa)
  return teacherCodes.some((code) => mesaAffinityCodes.includes(code))
}

function getMesaCodes(mesa = {}) {
  return [
    mesa.materia,
    mesa.codigo,
    mesa.code,
    mesa.nombre,
    mesa.nombreMateria,
    getSubjectNameValue(mesa),
  ].map(normalizeTextoAcademico).filter(Boolean)
}

function hasDeclaredSpecialty(docente = {}, mesa = {}) {
  const specialties = splitList(
    docente.especialidad ??
    docente.especialidades ??
    docente.especialidadDeclarada ??
    docente.familiasIdoneidad ??
    docente.idoneidades,
  )
  if (!specialties.length) return false

  const mesaText = normalizeTextoAcademico(mesa)
  const mesaFamily = detectarFamiliaMateria(mesa)

  return specialties.some((specialty) => {
    const specialtyText = normalizeTextoAcademico(specialty)
    if (!specialtyText) return false
    if (mesaText.includes(specialtyText)) return true
    if (specialtyText.includes('ingles') && mesaFamily === FAMILIAS_AFINIDAD.INGLES) return true
    if (
      (specialtyText.includes('informatica') ||
      specialtyText.includes('computacion') ||
      specialtyText.includes('programacion') ||
      specialtyText.includes('tic')) &&
      mesaFamily === FAMILIAS_AFINIDAD.INFORMATICA_TIC
    ) return true
    if (specialtyText.includes('pedagog') && mesaFamily === FAMILIAS_AFINIDAD.PRACTICA_PEDAGOGICA) return true
    return false
  })
}

export function detectarFamiliaMateria(materia = {}) {
  if (isProfesoradoPractice(materia)) return FAMILIAS_AFINIDAD.PRACTICA_PEDAGOGICA
  if (isTechnicalPractice(materia)) return FAMILIAS_AFINIDAD.PRACTICA_TECNICA
  if (hasEnglishFamily(materia)) return FAMILIAS_AFINIDAD.INGLES
  if (hasComputingFamily(materia)) return FAMILIAS_AFINIDAD.INFORMATICA_TIC
  return FAMILIAS_AFINIDAD.GENERAL
}

export function getNivelAfinidadDocenteMesa(docente = {}, mesa = {}, options = {}) {
  const docenteFamily = detectarFamiliaMateria(docente)
  const mesaFamily = detectarFamiliaMateria(mesa)
  const sameCareer = hasSameCareer(docente, mesa)
  const docenteCareers = getCareerKeys(docente)
  const mesaCareers = getCareerKeys(mesa)

  if (mesaFamily === FAMILIAS_AFINIDAD.PRACTICA_TECNICA || docenteFamily === FAMILIAS_AFINIDAD.PRACTICA_TECNICA) {
    if (sameCareer && isTechnicalCareer(docente) && isTechnicalCareer(mesa)) {
      return {
        afinidadValida: true,
        nivelAfinidad: NIVELES_AFINIDAD.PRACTICA_TECNICA_MISMA_CARRERA,
        motivo: 'Practica tecnica dentro de la misma carrera tecnica.',
      }
    }

    return {
      afinidadValida: false,
      nivelAfinidad: NIVELES_AFINIDAD.SIN_AFINIDAD,
      motivo: 'Las practicas tecnicas solo admiten vocales de la misma carrera tecnica.',
    }
  }

  if (sameCareer) {
    return {
      afinidadValida: true,
      nivelAfinidad: NIVELES_AFINIDAD.MISMA_CARRERA,
      motivo: 'Docente y mesa pertenecen a la misma carrera.',
    }
  }

  if (hasExplicitSubjectAffinity(docente, mesa)) {
    return {
      afinidadValida: true,
      nivelAfinidad: NIVELES_AFINIDAD.ESPECIALIDAD_DECLARADA,
      motivo: 'Afinidad institucional declarada en la plantilla maestra.',
    }
  }

  if (
    options.requireCareerCompatibility === true &&
    docenteCareers.size &&
    mesaCareers.size &&
    !esMateriaIntercarreraPermitida(mesa)
  ) {
    return {
      afinidadValida: false,
      nivelAfinidad: NIVELES_AFINIDAD.CARRERA_INCOMPATIBLE,
      motivo: 'Los vocales de otra carrera solo se admiten en espacios pedagogicos, didacticos o TIC.',
    }
  }

  if (hasDeclaredSpecialty(docente, mesa)) {
    return {
      afinidadValida: true,
      nivelAfinidad: NIVELES_AFINIDAD.ESPECIALIDAD_DECLARADA,
      motivo: 'Especialidad declarada compatible con la mesa.',
    }
  }

  if (docenteFamily === FAMILIAS_AFINIDAD.INGLES && mesaFamily === FAMILIAS_AFINIDAD.INGLES) {
    return {
      afinidadValida: true,
      nivelAfinidad: NIVELES_AFINIDAD.FAMILIA_INGLES,
      motivo: 'Afinidad por familia Ingles.',
    }
  }

  if (hasHomonymousSubject(docente, mesa)) {
    return {
      afinidadValida: true,
      nivelAfinidad: NIVELES_AFINIDAD.MATERIA_HOMONIMA,
      motivo: 'Materia homonima.',
    }
  }

  if (hasSimilarSubject(docente, mesa)) {
    return {
      afinidadValida: true,
      nivelAfinidad: NIVELES_AFINIDAD.MATERIA_SIMILAR,
      motivo: 'Materia similar.',
    }
  }

  if (docenteFamily === FAMILIAS_AFINIDAD.INFORMATICA_TIC && mesaFamily === FAMILIAS_AFINIDAD.INFORMATICA_TIC) {
    return {
      afinidadValida: true,
      nivelAfinidad: NIVELES_AFINIDAD.FAMILIA_INFORMATICA_TIC,
      motivo: 'Afinidad por familia Informatica/TIC.',
    }
  }

  if (docenteFamily === FAMILIAS_AFINIDAD.PRACTICA_PEDAGOGICA && mesaFamily === FAMILIAS_AFINIDAD.PRACTICA_PEDAGOGICA) {
    return {
      afinidadValida: true,
      nivelAfinidad: NIVELES_AFINIDAD.PRACTICA_PEDAGOGICA_TRANSVERSAL,
      motivo: 'Practicas pedagogicas transversales entre profesorados.',
    }
  }

  const explicitAffinityCodes = getExplicitAffinityCodes(docente)
  const mesaCodes = getMesaCodes(mesa)
  if (explicitAffinityCodes.some((code) => mesaCodes.includes(code))) {
    return {
      afinidadValida: true,
      nivelAfinidad: NIVELES_AFINIDAD.ESPECIALIDAD_DECLARADA,
      motivo: 'Materia declarada como afin por el docente.',
    }
  }

  if (docente.idoneidadAcademica === true || docente.idoneidadAcademicaExplicita === true || options.idoneidadAcademica === true) {
    return {
      afinidadValida: true,
      nivelAfinidad: NIVELES_AFINIDAD.IDONEIDAD_EXPLICITA,
      motivo: 'Idoneidad academica explicita.',
    }
  }

  return {
    afinidadValida: false,
    nivelAfinidad: NIVELES_AFINIDAD.SIN_AFINIDAD,
    motivo: 'No se detecto afinidad academica.',
  }
}

export function docenteTieneAfinidadConMesa(docente = {}, mesa = {}, options = {}) {
  return getNivelAfinidadDocenteMesa(docente, mesa, options).afinidadValida
}

export function isAfinidadDebil(nivelAfinidad) {
  return WEAK_AFFINITY_LEVELS.has(nivelAfinidad)
}

export function hasAcademicAffinity(left = {}, right = {}, options = {}) {
  return docenteTieneAfinidadConMesa(left, right, options)
}

export function hasAcademicSuitability(teacherRow = {}, mesa = {}) {
  return docenteTieneAfinidadConMesa(teacherRow, mesa) || teacherRow.idoneidadAcademica === true
}

export function canAssignVocalByAffinity(teacherRow = {}, mesa = {}, options = {}) {
  const affinity = getNivelAfinidadDocenteMesa(teacherRow, mesa, options)

  return {
    allowed: affinity.afinidadValida,
    reason: affinity.afinidadValida ? null : 'Vocal without academic affinity or suitability.',
    nivelAfinidad: affinity.nivelAfinidad,
    motivo: affinity.motivo,
  }
}
