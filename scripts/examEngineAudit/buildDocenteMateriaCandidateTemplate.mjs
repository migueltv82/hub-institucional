import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  DOCENTE_MATERIA_CANDIDATE_COLUMNS,
  buildDocenteMateriaCandidateTemplate,
} from '../../src/utils/examEngine/audit/buildDocenteMateriaCandidateTemplate.js'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(SCRIPT_DIR, '../..')
const LOCAL_AUDIT_DIR = resolve(REPO_ROOT, 'local-audit')
const LOCAL_SNAPSHOT_PATH = resolve(LOCAL_AUDIT_DIR, 'workspaceSnapshot.real.local.json')
const CSV_OUTPUT_PATH = resolve(LOCAL_AUDIT_DIR, 'docente_materia.candidate.csv')
const JSON_OUTPUT_PATH = resolve(LOCAL_AUDIT_DIR, 'docente_materia.candidate.json')
const SUMMARY_OUTPUT_PATH = resolve(LOCAL_AUDIT_DIR, 'docente_materia.candidate.summary.json')
const ORPHAN_OUTPUT_PATH = resolve(LOCAL_AUDIT_DIR, 'docente_materia.orphan_horarios.json')

function fail(message) {
  console.error(`[docente_materia candidate] ${message}`)
  process.exitCode = 1
}

function readJsonFile(filePath) {
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'))
  } catch (error) {
    throw new Error(`No se pudo leer JSON local: ${error instanceof Error ? error.message : error}`)
  }
}

function escapeCsvCell(value) {
  const text = String(value ?? '')
  if (!/[",\r\n;]/.test(text)) return text
  return `"${text.replaceAll('"', '""')}"`
}

function rowsToCsv(rows = []) {
  const header = DOCENTE_MATERIA_CANDIDATE_COLUMNS.join(',')
  const body = rows.map((row) => (
    DOCENTE_MATERIA_CANDIDATE_COLUMNS
      .map((column) => escapeCsvCell(row[column]))
      .join(',')
  ))
  return [header, ...body].join('\n')
}

function writeJson(filePath, value) {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

function safeConsoleSummary(result) {
  const summary = result.summary ?? {}
  return {
    source: 'local-audit/workspaceSnapshot.real.local.json',
    outputs: {
      csv: 'local-audit/docente_materia.candidate.csv',
      json: 'local-audit/docente_materia.candidate.json',
      summary: 'local-audit/docente_materia.candidate.summary.json',
      orphanHorarios: result.orphanHorarios.length
        ? 'local-audit/docente_materia.orphan_horarios.json'
        : null,
    },
    counts: {
      totalRowsGenerated: summary.totalRowsGenerated ?? 0,
      filasRequierenRevision: summary.filasRequierenRevision ?? 0,
      materiasSinHorarioNoRequeridas: summary.materiasSinHorarioNoRequeridas ?? 0,
      horariosHuerfanos: summary.horariosHuerfanos ?? 0,
      parserErrors: summary.parserErrors ?? 0,
      parserWarnings: summary.parserWarnings ?? 0,
    },
    parserOk: Number(summary.parserErrors ?? 0) === 0,
  }
}

function main() {
  if (!existsSync(LOCAL_SNAPSHOT_PATH)) {
    fail('No existe local-audit/workspaceSnapshot.real.local.json.')
    return
  }

  try {
    mkdirSync(LOCAL_AUDIT_DIR, { recursive: true })

    const snapshot = readJsonFile(LOCAL_SNAPSHOT_PATH)
    const result = buildDocenteMateriaCandidateTemplate(snapshot)

    writeFileSync(CSV_OUTPUT_PATH, `${rowsToCsv(result.rows)}\n`, 'utf8')
    writeJson(JSON_OUTPUT_PATH, result.rows)
    writeJson(SUMMARY_OUTPUT_PATH, {
      summary: result.summary,
      warnings: result.warnings,
      errors: result.errors,
    })
    writeJson(ORPHAN_OUTPUT_PATH, result.orphanHorarios)

    console.log(JSON.stringify(safeConsoleSummary(result), null, 2))
  } catch (error) {
    fail(error instanceof Error ? error.message : 'No se pudo generar la plantilla candidata.')
  }
}

main()
