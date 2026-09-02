import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  DOCENTE_MATERIA_REVIEW_COLUMNS,
  buildDocenteMateriaReviewPack,
} from '../../src/utils/examEngine/audit/buildDocenteMateriaReviewPack.js'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(SCRIPT_DIR, '../..')
const LOCAL_AUDIT_DIR = resolve(REPO_ROOT, 'local-audit')
const CANDIDATE_INPUT_PATH = resolve(LOCAL_AUDIT_DIR, 'docente_materia.candidate.json')
const IMPACT_INPUT_PATH = resolve(LOCAL_AUDIT_DIR, 'docente_materia.impact.json')
const ORPHAN_INPUT_PATH = resolve(LOCAL_AUDIT_DIR, 'docente_materia.orphan_horarios.json')
const CSV_OUTPUT_PATH = resolve(LOCAL_AUDIT_DIR, 'docente_materia.review.csv')
const JSON_OUTPUT_PATH = resolve(LOCAL_AUDIT_DIR, 'docente_materia.review.json')
const SUMMARY_OUTPUT_PATH = resolve(LOCAL_AUDIT_DIR, 'docente_materia.review.summary.json')

function fail(message) {
  console.error(`[docente_materia review] ${message}`)
  process.exitCode = 1
}

function readJsonFile(filePath) {
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'))
  } catch (error) {
    throw new Error(`No se pudo leer JSON local: ${error instanceof Error ? error.message : error}`)
  }
}

function readJsonArray(filePath, label) {
  const value = readJsonFile(filePath)
  if (!Array.isArray(value)) {
    throw new Error(`${label} debe ser un array JSON.`)
  }
  return value
}

function readOptionalJsonArray(filePath) {
  if (!existsSync(filePath)) return []
  const value = readJsonFile(filePath)
  return Array.isArray(value) ? value : []
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

function writeJson(filePath, value) {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

function buildSafeConsoleSummary(result = {}) {
  const summary = result.summary ?? {}

  return {
    source: {
      candidateRows: 'local-audit/docente_materia.candidate.json',
      impactReport: 'local-audit/docente_materia.impact.json',
      orphanHorarios: existsSync(ORPHAN_INPUT_PATH)
        ? 'local-audit/docente_materia.orphan_horarios.json'
        : null,
      readOnly: true,
    },
    outputs: {
      csv: 'local-audit/docente_materia.review.csv',
      json: 'local-audit/docente_materia.review.json',
      summary: 'local-audit/docente_materia.review.summary.json',
    },
    counts: {
      candidateRows: summary.candidateRows ?? 0,
      candidateRowsRequiringReview: summary.candidateRowsRequiringReview ?? 0,
      uniqueSubjectsRequiringReview: summary.uniqueSubjectsRequiringReview ?? 0,
      reviewRowsGenerated: summary.reviewRowsGenerated ?? 0,
      multidocenteNoPractica: summary.multidocenteNoPractica ?? 0,
      practicasProfesionalesMultidocente: summary.practicasProfesionalesMultidocente ?? 0,
      horariosHuerfanos: summary.horariosHuerfanos ?? 0,
      sinTitularVigente: summary.sinTitularVigente ?? 0,
      ambiguos: summary.ambiguos ?? 0,
      other: summary.other ?? 0,
    },
    impact: {
      completionRateWithoutDocenteMateria: summary.impactCompletionRateWithoutDocenteMateria,
      completionRateWithDocenteMateria: summary.impactCompletionRateWithDocenteMateria,
      titularesInferidosBefore: summary.impactTitularesInferidosBefore,
      titularesInferidosAfter: summary.impactTitularesInferidosAfter,
      titularesExplicitosAfter: summary.impactTitularesExplicitosAfter,
    },
  }
}

function main() {
  if (!existsSync(CANDIDATE_INPUT_PATH)) {
    fail('No existe local-audit/docente_materia.candidate.json. Ejecuta primero buildDocenteMateriaCandidateTemplate.mjs.')
    return
  }

  if (!existsSync(IMPACT_INPUT_PATH)) {
    fail('No existe local-audit/docente_materia.impact.json. Ejecuta primero compareDocenteMateriaImpact.mjs.')
    return
  }

  try {
    mkdirSync(LOCAL_AUDIT_DIR, { recursive: true })

    const candidateRows = readJsonArray(CANDIDATE_INPUT_PATH, 'docente_materia.candidate.json')
    const impactReport = readJsonFile(IMPACT_INPUT_PATH)
    const orphanHorarios = readOptionalJsonArray(ORPHAN_INPUT_PATH)
    const result = buildDocenteMateriaReviewPack({
      candidateRows,
      impactReport,
      orphanHorarios,
    })

    writeFileSync(CSV_OUTPUT_PATH, `${rowsToCsv(result.reviewRows)}\n`, 'utf8')
    writeJson(JSON_OUTPUT_PATH, {
      reviewRows: result.reviewRows,
      groupedReviewItems: result.groupedReviewItems,
    })
    writeJson(SUMMARY_OUTPUT_PATH, {
      ...result.summary,
      warnings: result.warnings,
      errors: result.errors,
    })

    console.log(JSON.stringify(buildSafeConsoleSummary(result), null, 2))
  } catch (error) {
    fail(error instanceof Error ? error.message : 'No se pudo generar el paquete de revision.')
  }
}

main()
