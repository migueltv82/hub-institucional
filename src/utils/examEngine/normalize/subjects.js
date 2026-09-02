import { NON_GROUPABLE_SUBJECT_NAMES } from '../constants.js'

// Subject normalization helpers shared by rules and planning.

export function cleanText(value) {
  return String(value ?? '').trim()
}

export function normalizeText(value) {
  return cleanText(value)
    .toLowerCase()
    .normalize('NFD')
    .replaceAll(/[\u0300-\u036f]/g, '')
}

// Distintas planillas institucionales abrevian "superior" como "sup" de forma
// inconsistente (ej. "TECNICO SUP EN TURISMO" vs "TECNICO SUPERIOR EN TURISMO").
// La carrera forma parte del subjectKey, asi que la expansion vive aca para que
// correlatividades, compactacion y llamados compartan la misma identidad.
export function expandCareerAbbreviations(text = '') {
  return cleanText(text).replaceAll(/\bsup\b/gi, 'superior')
}

export function normalizeCareerText(value) {
  return expandCareerAbbreviations(
    normalizeText(value)
      .replaceAll(/[^a-z0-9]+/g, ' ')
      .replaceAll(/\s+/g, ' ')
      .trim(),
  )
}

export function normalizeSubjectCode(value) {
  return normalizeText(value).replaceAll(/[^a-z0-9]/g, '')
}

export function getSubjectCode(subject = {}) {
  return cleanText(
    subject.materiaCodigo ??
    subject.codigoMateria ??
    subject.codigo_materia ??
    subject.subjectCode ??
    subject.subject_code ??
    subject.codigo ??
    subject.code ??
    subject.materia,
  )
}

export function getSubjectName(subject = {}) {
  return cleanText(subject.nombreMateria ?? subject.nombre ?? subject.subject_name ?? subject.name ?? getSubjectCode(subject))
}

export function getSubjectCareer(subject = {}) {
  return cleanText(subject.carrera ?? subject.programa ?? subject.program ?? subject.career)
}

export function getSubjectKey(subject = {}) {
  return [
    normalizeCareerText(getSubjectCareer(subject)),
    normalizeSubjectCode(getSubjectCode(subject) || getSubjectName(subject)),
  ].join('::')
}

export function isNonGroupableSubject(subject = {}) {
  const name = normalizeText(getSubjectName(subject) || getSubjectCode(subject))
  return NON_GROUPABLE_SUBJECT_NAMES.some((blockedName) => name.includes(blockedName))
}
