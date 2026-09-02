import { cleanText, normalizeText } from '../normalize/subjects.js'

export const MANUAL_EXAM_EXCLUSION_REASONS = {
  GEOGRAFIA_CERRADA_1_2_3: 'GEOGRAFIA_CERRADA_1_2_3',
}

const CLOSED_GEOGRAPHIA_YEARS = new Set([1, 2, 3])

function firstValue(...values) {
  return values.find((value) => value !== undefined && value !== null && cleanText(value) !== '')
}

function normalizeKey(value) {
  return normalizeText(value)
    .replaceAll(/[^a-z0-9]+/g, ' ')
    .replaceAll(/\s+/g, ' ')
    .trim()
}

function readCareer(row = {}) {
  const value = firstValue(
    row.carrera,
    row.carreraNombre,
    row.carrera_id,
    row.carreraId,
    row.nombreCarrera,
    row.career_name,
    row.careerName,
    row.career_id,
    row.careerId,
    row.programa,
    row.program_id,
    row.programId,
    row.program,
    row.career,
  )

  return cleanText(typeof value === 'object' ? value?.nombre ?? value?.name : value)
}

function readYearValue(row = {}) {
  return firstValue(
    row.anio,
    row.ano,
    row['a\u00f1o'],
    row['a\u00c3\u00b1o'],
    row.year,
    row.curso,
    row.nivel,
    row.grado,
    row.yearLevel,
    row.year_level,
    row.anio_carrera,
    row.anioCarrera,
  )
}

function isGeografiaCareer(value) {
  const career = normalizeKey(value)
  const tokens = new Set(career.split(' ').filter(Boolean))
  return career.includes('geografia') || tokens.has('geo')
}

export function readAcademicYearNumber(row = {}) {
  const normalized = normalizeKey(readYearValue(row))
  if (!normalized) return null

  const explicitNumber = normalized.match(/\b0?([1-9])\b/)
  if (explicitNumber) return Number(explicitNumber[1])

  const tokenNumber = normalized
    .split(' ')
    .map((token) => token.match(/^0?([1-9])(?:ro|do|er|to)?$/)?.[1])
    .find(Boolean)
  if (tokenNumber) return Number(tokenNumber)

  const words = new Map([
    ['primer', 1],
    ['primero', 1],
    ['segundo', 2],
    ['tercer', 3],
    ['tercero', 3],
    ['i', 1],
    ['ii', 2],
    ['iii', 3],
  ])
  const word = normalized.split(' ').find((token) => words.has(token))
  return word ? words.get(word) : null
}

export function getManualExamExclusion(subject = {}) {
  const academicYear = readAcademicYearNumber(subject)

  if (isGeografiaCareer(readCareer(subject)) && CLOSED_GEOGRAPHIA_YEARS.has(academicYear)) {
    return {
      reason: MANUAL_EXAM_EXCLUSION_REASONS.GEOGRAFIA_CERRADA_1_2_3,
      message: 'Geografia 1, 2 y 3 corresponde a una carrera cerrada y se resuelve manualmente.',
    }
  }

  return null
}

export function isManualExamExcludedSubject(subject = {}) {
  return Boolean(getManualExamExclusion(subject))
}
