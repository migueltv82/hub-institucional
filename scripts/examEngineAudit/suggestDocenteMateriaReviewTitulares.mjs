import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  DOCENTE_MATERIA_REVIEW_COLUMNS,
} from '../../src/utils/examEngine/audit/buildDocenteMateriaReviewPack.js'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(SCRIPT_DIR, '../..')
const LOCAL_AUDIT_DIR = resolve(REPO_ROOT, 'local-audit')
const REVIEW_INPUT_PATH = resolve(LOCAL_AUDIT_DIR, 'docente_materia.review.json')
const GENERATION_REPORT_PATH = resolve(LOCAL_AUDIT_DIR, 'legacy_vs_exam_engine_generation.json')
const SUGGESTED_CSV_OUTPUT_PATH = resolve(LOCAL_AUDIT_DIR, 'docente_materia.review.suggested.csv')
const SUGGESTIONS_JSON_OUTPUT_PATH = resolve(LOCAL_AUDIT_DIR, 'docente_materia.review.suggestions.json')
const SUGGESTIONS_MD_OUTPUT_PATH = resolve(LOCAL_AUDIT_DIR, 'docente_materia.review.suggestions.md')

function fail(message) {
  console.error(`[docente_materia suggestions] ${message}`)
  process.exitCode = 1
}

function clean(value) {
  return String(value ?? '').trim()
}

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function normalizeText(value) {
  return clean(value)
    .toLowerCase()
    .normalize('NFD')
    .replaceAll(/[\u0300-\u036f]/g, '')
    .replaceAll(/[^a-z0-9]+/g, ' ')
    .replaceAll(/\s+/g, ' ')
    .trim()
}

function normalizeCompact(value) {
  return normalizeText(value).replaceAll(/\s+/g, '')
}

function nameTokenKey(value) {
  return normalizeText(value)
    .split(' ')
    .filter(Boolean)
    .sort()
    .join(' ')
}

function readJsonFile(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'))
}

function writeJson(filePath, value) {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

function escapeCsvCell(value) {
  const text = String(value ?? '')
  if (!/[",\r\n;]/.test(text)) return text
  return `"${text.replaceAll('"', '""')}"`
}

function rowsToCsv(rows = []) {
  const header = DOCENTE_MATERIA_REVIEW_COLUMNS.join(',')
  const body = rows.map((row) => (
    DOCENTE_MATERIA_REVIEW_COLUMNS
      .map((column) => escapeCsvCell(row[column]))
      .join(',')
  ))
  return [header, ...body].join('\n')
}

function splitParts(value) {
  return clean(value).split('/').map(clean).filter(Boolean)
}

function subjectAliases(value) {
  const text = normalizeCompact(value)
  const aliases = new Set([text])
  const match = text.match(/^([a-z]+)0*(\d+)$/)

  if (match) {
    const [, prefix, number] = match
    const normalizedNumber = String(Number(number))
    aliases.add(`${prefix}${normalizedNumber}`)
    aliases.add(`${prefix}${normalizedNumber.padStart(2, '0')}`)
  }

  return [...aliases].filter(Boolean)
}

function careerMatches(rowCareer, reviewCareer) {
  const parts = splitParts(rowCareer)
  if (!parts.length) return normalizeText(rowCareer) === normalizeText(reviewCareer)
  return parts.some((part) => normalizeText(part) === normalizeText(reviewCareer))
}

function subjectMatches(rowSubject, reviewCode, reviewName) {
  const parts = splitParts(rowSubject)
  const rowAliases = parts.flatMap(subjectAliases)
  const codeAliases = subjectAliases(reviewCode)

  if (rowAliases.some((alias) => codeAliases.includes(alias))) return true

  return parts.some((part) => (
    normalizeText(part) === normalizeText(reviewCode) ||
    normalizeText(part) === normalizeText(reviewName)
  ))
}

function comparisonRows(comparison = {}) {
  const rows = [
    ...asArray(comparison.unmatchedLegacyMesas).map((mesa) => ({ kind: 'legacy-unmatched', ...mesa })),
    ...asArray(comparison.unmatchedNewMesas).map((mesa) => ({ kind: 'new-unmatched', ...mesa })),
  ]

  asArray(comparison.diffs).forEach((diff) => {
    const [carrera = '', materia = '', llamado = ''] = clean(diff.matchKey).split('::')

    if (diff.legacyMesaId) {
      rows.push({
        kind: 'legacy-diff',
        id: diff.legacyMesaId,
        carrera,
        materia,
        llamado,
        diffType: diff.type,
        legacyValue: diff.legacyValue,
        newValue: diff.newValue,
      })
    }

    if (diff.newMesaId) {
      rows.push({
        kind: 'new-diff',
        id: diff.newMesaId,
        carrera,
        materia,
        llamado,
        diffType: diff.type,
        legacyValue: diff.legacyValue,
        newValue: diff.newValue,
      })
    }
  })

  return rows
}

function detectedTeachers(review = {}) {
  return clean(review.docentes_detectados)
    .split('|')
    .map(clean)
    .filter(Boolean)
}

function rawTitularValues(row = {}) {
  return [
    row.titular,
    row.titularNombre,
    row.profesorTitular,
    row.original?.titular,
    row.original?.titularNombre,
    row.original?.profesorTitular,
    row.legacyValue,
    row.newValue,
  ].flatMap((value) => splitParts(value))
    .map(clean)
    .filter(Boolean)
}

function matchDetectedTeacher(value, teachers = []) {
  const key = nameTokenKey(value)
  if (!key) return ''
  return teachers.find((teacher) => nameTokenKey(teacher) === key) ?? ''
}

function sourceLabel(kind = '') {
  if (kind.startsWith('legacy')) return 'legacy'
  if (kind.startsWith('new')) return 'examEngine'
  return kind || 'comparacion'
}

function legacyPreferredCandidate(candidates = []) {
  const legacyCandidates = candidates.filter((candidate) => candidate.sources.includes('legacy'))
  return legacyCandidates.length === 1 ? legacyCandidates[0] : null
}

function suggestionForReview(review = {}, rows = []) {
  const teachers = detectedTeachers(review)
  const hits = rows.filter((row) => (
    careerMatches(row.carrera, review.carrera) &&
    subjectMatches(row.materia || row.nombreMateria, review.materia_codigo, review.materia_nombre)
  ))
  const votes = hits.flatMap((hit) => (
    rawTitularValues(hit)
      .map((value) => matchDetectedTeacher(value, teachers))
      .filter(Boolean)
      .map((teacher) => ({
        teacher,
        source: sourceLabel(hit.kind),
        rowKind: hit.kind,
        materia: clean(hit.materia),
        estado: clean(hit.original?.estado),
        fecha: clean(hit.fecha),
      }))
  ))
  const groupedVotes = votes.reduce((map, vote) => {
    const current = map.get(vote.teacher) ?? {
      teacher: vote.teacher,
      count: 0,
      sources: new Set(),
      examples: [],
    }
    current.count += 1
    current.sources.add(vote.source)
    current.examples.push(vote)
    map.set(vote.teacher, current)
    return map
  }, new Map())
  const candidates = [...groupedVotes.values()].map((candidate) => ({
    teacher: candidate.teacher,
    count: candidate.count,
    sources: [...candidate.sources].sort(),
    examples: candidate.examples.slice(0, 3),
  }))
  const uniqueTeachers = candidates.map((candidate) => candidate.teacher)
  let status = uniqueTeachers.length === 0
    ? 'SIN_SUGERENCIA'
    : uniqueTeachers.length === 1
      ? 'SUGERIDO'
      : 'CONFLICTO'
  let titularSugerido = status === 'SUGERIDO' ? uniqueTeachers[0] : ''

  // Para migracion de datos, legacy es la fuente mas actual cuando difiere del motor nuevo.
  const legacyCandidate = status === 'CONFLICTO' ? legacyPreferredCandidate(candidates) : null
  if (legacyCandidate) {
    status = 'SUGERIDO_LEGACY'
    titularSugerido = legacyCandidate.teacher
  }

  return {
    review_id: clean(review.review_id),
    carrera: clean(review.carrera),
    anio: clean(review.anio),
    materia_codigo: clean(review.materia_codigo),
    materia_nombre: clean(review.materia_nombre),
    docentes_detectados: teachers,
    status,
    titular_sugerido: titularSugerido,
    candidates,
    comparison_hits: hits.map((hit) => ({
      source: sourceLabel(hit.kind),
      kind: hit.kind,
      materia: clean(hit.materia),
      estado: clean(hit.original?.estado),
      fecha: clean(hit.fecha),
      titulares: rawTitularValues(hit),
    })).slice(0, 8),
  }
}

function observationForSuggestion(suggestion = {}) {
  if (suggestion.status === 'SUGERIDO') {
    const sources = suggestion.candidates[0]?.sources?.join('+') || 'comparacion'
    return `Sugerido por ${sources}; confirmar institucionalmente antes de aplicar.`
  }

  if (suggestion.status === 'SUGERIDO_LEGACY') {
    const options = suggestion.candidates.map((candidate) => (
      `${candidate.teacher} (${candidate.sources.join('+')})`
    )).join(' vs ')
    return `Sugerido por legacy como fuente vigente; conflicto detectado: ${options}.`
  }

  if (suggestion.status === 'CONFLICTO') {
    const options = suggestion.candidates.map((candidate) => (
      `${candidate.teacher} (${candidate.sources.join('+')})`
    )).join(' vs ')
    return `Conflicto de sugerencias: ${options}. Requiere decision institucional.`
  }

  return 'Sin sugerencia automatica; requiere decision institucional.'
}

function applySuggestionToReviewRow(row = {}, suggestion = {}) {
  return {
    ...row,
    titular_a_confirmar: suggestion.titular_sugerido || '',
    observaciones_revision: observationForSuggestion(suggestion),
  }
}

function buildMarkdown(suggestions = []) {
  const lines = [
    '# Sugerencias docente_materia',
    '',
    'Estas sugerencias no reemplazan la decision institucional. Sirven para prellenar revision.',
    '',
    '| Carrera | Materia | Estado | Sugerencia | Docentes detectados |',
    '|---|---|---|---|---|',
    ...suggestions.map((suggestion) => [
      clean(suggestion.carrera),
      `${clean(suggestion.materia_codigo)} - ${clean(suggestion.materia_nombre)}`,
      suggestion.status,
      suggestion.titular_sugerido || suggestion.candidates.map((candidate) => candidate.teacher).join(' / ') || '',
      suggestion.docentes_detectados.join(' / '),
    ].map((value) => clean(value).replaceAll('|', '/')).join(' | ')).map((row) => `| ${row} |`),
    '',
  ]

  return `${lines.join('\n')}\n`
}

function buildSummary(suggestions = []) {
  const byStatus = suggestions.reduce((counts, suggestion) => {
    counts[suggestion.status] = (counts[suggestion.status] ?? 0) + 1
    return counts
  }, {})

  return {
    total: suggestions.length,
    sugeridos: (byStatus.SUGERIDO ?? 0) + (byStatus.SUGERIDO_LEGACY ?? 0),
    sugeridosPorLegacy: byStatus.SUGERIDO_LEGACY ?? 0,
    conflictos: byStatus.CONFLICTO ?? 0,
    sinSugerencia: byStatus.SIN_SUGERENCIA ?? 0,
    readyForHumanReview: true,
  }
}

function main() {
  if (!existsSync(REVIEW_INPUT_PATH)) {
    fail('No existe local-audit/docente_materia.review.json. Ejecuta primero buildDocenteMateriaReviewPack.mjs.')
    return
  }

  if (!existsSync(GENERATION_REPORT_PATH)) {
    fail('No existe local-audit/legacy_vs_exam_engine_generation.json. Ejecuta primero compareLegacyVsExamEngineGeneration.mjs.')
    return
  }

  try {
    mkdirSync(LOCAL_AUDIT_DIR, { recursive: true })
    const reviewPayload = readJsonFile(REVIEW_INPUT_PATH)
    const generationReport = readJsonFile(GENERATION_REPORT_PATH)
    const reviewRows = asArray(reviewPayload.reviewRows)
    const rows = comparisonRows(generationReport.comparison)
    const suggestions = reviewRows.map((review) => suggestionForReview(review, rows))
    const suggestedRows = reviewRows.map((row) => {
      const suggestion = suggestions.find((item) => item.review_id === clean(row.review_id)) ?? {}
      return applySuggestionToReviewRow(row, suggestion)
    })
    const summary = buildSummary(suggestions)
    const outputs = {
      suggestedCsv: 'local-audit/docente_materia.review.suggested.csv',
      suggestionsJson: 'local-audit/docente_materia.review.suggestions.json',
      suggestionsMarkdown: 'local-audit/docente_materia.review.suggestions.md',
    }

    writeFileSync(SUGGESTED_CSV_OUTPUT_PATH, `${rowsToCsv(suggestedRows)}\n`, 'utf8')
    writeJson(SUGGESTIONS_JSON_OUTPUT_PATH, {
      source: {
        review: 'local-audit/docente_materia.review.json',
        generationReport: 'local-audit/legacy_vs_exam_engine_generation.json',
        readOnly: true,
      },
      summary,
      suggestions,
      outputs,
    })
    writeFileSync(SUGGESTIONS_MD_OUTPUT_PATH, buildMarkdown(suggestions), 'utf8')

    console.log(JSON.stringify({ summary, outputs }, null, 2))
  } catch (error) {
    fail(error instanceof Error ? error.message : 'No se pudieron generar sugerencias docente_materia.')
  }
}

main()
