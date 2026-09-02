import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { compareDocenteMateriaImpact } from '../../src/utils/examEngine/audit/compareDocenteMateriaImpact.js'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(SCRIPT_DIR, '../..')
const LOCAL_AUDIT_DIR = resolve(REPO_ROOT, 'local-audit')
const SNAPSHOT_PATH = resolve(LOCAL_AUDIT_DIR, 'workspaceSnapshot.real.local.json')
const DOCENTE_MATERIA_CANDIDATE_PATH = resolve(LOCAL_AUDIT_DIR, 'docente_materia.candidate.json')
const DOCENTE_MATERIA_CORRECTED_PATH = resolve(LOCAL_AUDIT_DIR, 'docente_materia.corrected.json')
const ORPHAN_HORARIOS_PATH = resolve(LOCAL_AUDIT_DIR, 'docente_materia.orphan_horarios.json')
const IMPACT_OUTPUT_PATH = resolve(LOCAL_AUDIT_DIR, 'docente_materia.impact.json')
const SUMMARY_OUTPUT_PATH = resolve(LOCAL_AUDIT_DIR, 'docente_materia.impact.summary.json')

const SUMMARY_FIELDS = [
  'completionRate',
  'totalMesas',
  'planned',
  'pendientes',
  'mesasCompletas',
  'mesasConUnVocal',
  'mesasSinTribunal',
  'mesasSinFecha',
  'titularesInferidos',
  'titularesExplicitos',
  'materiasRequierenRevision',
  'fallbackHorariosDocentes',
  'sourceDocenteMateria',
  'sourceRequiereRevision',
]

function fail(message) {
  console.error(`[docente_materia impact] ${message}`)
  process.exitCode = 1
}

function readJsonFile(filePath) {
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'))
  } catch (error) {
    throw new Error(`No se pudo leer JSON local: ${error instanceof Error ? error.message : error}`)
  }
}

function readOptionalJsonArray(filePath) {
  if (!existsSync(filePath)) return []
  const value = readJsonFile(filePath)
  return Array.isArray(value) ? value : []
}

function writeJson(filePath, value) {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

function pickFields(value = {}, fields = SUMMARY_FIELDS) {
  return fields.reduce((result, field) => {
    result[field] = value[field]
    return result
  }, {})
}

function buildImpactSummary(result = {}, docenteMateriaSource = '') {
  return {
    source: {
      snapshot: 'local-audit/workspaceSnapshot.real.local.json',
      docenteMateria: docenteMateriaSource,
      readOnly: true,
    },
    parser: result.parser,
    withoutDocenteMateria: pickFields(result.withoutDocenteMateria),
    withDocenteMateria: pickFields(result.withDocenteMateria),
    diff: {
      ...pickFields(result.diff),
      warningCounts: result.diff.warningCounts,
    },
    interpretation: result.interpretation,
    recommendations: result.recommendations,
  }
}

function buildConsoleSummary(result = {}, docenteMateriaSource = '') {
  return {
    outputs: {
      impact: 'local-audit/docente_materia.impact.json',
      summary: 'local-audit/docente_materia.impact.summary.json',
    },
    source: {
      docenteMateria: docenteMateriaSource,
    },
    parser: result.parser,
    counts: {
      withoutDocenteMateria: pickFields(result.withoutDocenteMateria),
      withDocenteMateria: pickFields(result.withDocenteMateria),
    },
    diff: pickFields(result.diff),
    interpretation: {
      reduceInferencias: result.interpretation?.reduceInferencias,
      reduceAmbiguedad: result.interpretation?.reduceAmbiguedad,
      mejoraCompletionRate: result.interpretation?.mejoraCompletionRate,
      mantieneOreduceSinTribunal: result.interpretation?.mantieneOreduceSinTribunal,
      aparecenMasCasosRevision: result.interpretation?.aparecenMasCasosRevision,
      convieneUsarPlantillaCandidataComoBaseInstitucional:
        result.interpretation?.convieneUsarPlantillaCandidataComoBaseInstitucional,
    },
  }
}

function findDocenteMateriaSource() {
  if (existsSync(DOCENTE_MATERIA_CORRECTED_PATH)) {
    return {
      path: DOCENTE_MATERIA_CORRECTED_PATH,
      label: 'local-audit/docente_materia.corrected.json',
    }
  }

  if (existsSync(DOCENTE_MATERIA_CANDIDATE_PATH)) {
    return {
      path: DOCENTE_MATERIA_CANDIDATE_PATH,
      label: 'local-audit/docente_materia.candidate.json',
    }
  }

  return null
}

function main() {
  if (!existsSync(SNAPSHOT_PATH)) {
    fail('No existe local-audit/workspaceSnapshot.real.local.json.')
    return
  }

  const docenteMateriaSource = findDocenteMateriaSource()

  if (!docenteMateriaSource) {
    fail('No existe local-audit/docente_materia.corrected.json ni local-audit/docente_materia.candidate.json. Ejecuta primero buildDocenteMateriaCandidateTemplate.mjs.')
    return
  }

  try {
    const baseSnapshot = readJsonFile(SNAPSHOT_PATH)
    const docenteMateriaRows = readJsonFile(docenteMateriaSource.path)
    const orphanHorarios = readOptionalJsonArray(ORPHAN_HORARIOS_PATH)
    const result = compareDocenteMateriaImpact({
      baseSnapshot,
      docenteMateriaRows,
      options: {
        orphanHorariosCount: orphanHorarios.length,
      },
    })
    const summary = buildImpactSummary(result, docenteMateriaSource.label)

    writeJson(IMPACT_OUTPUT_PATH, result)
    writeJson(SUMMARY_OUTPUT_PATH, summary)

    console.log(JSON.stringify(buildConsoleSummary(result, docenteMateriaSource.label), null, 2))
  } catch (error) {
    fail(error instanceof Error ? error.message : 'No se pudo comparar el impacto de docente_materia.')
  }
}

main()
