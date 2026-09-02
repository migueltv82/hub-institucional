import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { diagnoseTemplateV2Readiness } from '../../src/utils/examEngine/audit/diagnoseTemplateV2Readiness.js'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(SCRIPT_DIR, '../..')
const LOCAL_AUDIT_DIR = resolve(REPO_ROOT, 'local-audit')
const SNAPSHOT_INPUT_PATH = resolve(LOCAL_AUDIT_DIR, 'workspaceSnapshot.real.local.json')
const REPORT_OUTPUT_PATH = resolve(LOCAL_AUDIT_DIR, 'template_v2_readiness.json')
const SUMMARY_OUTPUT_PATH = resolve(LOCAL_AUDIT_DIR, 'template_v2_readiness.summary.json')

function fail(message) {
  console.error(`[template_v2 readiness] ${message}`)
  process.exitCode = 1
}

function readJsonFile(filePath) {
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'))
  } catch (error) {
    throw new Error(`No se pudo leer JSON local: ${error instanceof Error ? error.message : error}`)
  }
}

function writeJson(filePath, value) {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

function buildSummaryReport(result = {}) {
  const diagnostics = result.templateDiagnostics ?? {}
  const sourceCompatibility = Object.fromEntries(
    Object.entries(diagnostics).map(([sourceKey, diagnostic]) => [
      sourceKey,
      {
        totalRows: diagnostic.totalRows,
        compatibilityPercent: diagnostic.compatibilityPercent,
        hasPlanId: diagnostic.hasPlanId,
        hasMateriaCodigo: diagnostic.hasMateriaCodigo,
        dependsOnMateriaNombre: diagnostic.dependsOnMateriaNombre,
        missingFields: diagnostic.missingFields,
      },
    ]),
  )

  return {
    source: {
      snapshot: 'local-audit/workspaceSnapshot.real.local.json',
      readOnly: true,
    },
    outputs: {
      report: 'local-audit/template_v2_readiness.json',
      summary: 'local-audit/template_v2_readiness.summary.json',
    },
    summary: result.summary,
    sourceCompatibility,
    risks: {
      missingFields: result.missingFields.length,
      weakKeys: result.weakKeys.length,
      duplicateNameRisks: result.duplicateNameRisks.length,
      multiPlanRisks: result.multiPlanRisks.length,
    },
    recommendations: result.recommendations,
    warnings: result.warnings.map((warning) => ({
      code: warning.code,
      message: warning.message,
    })),
    errors: result.errors.map((error) => ({
      code: error.code,
      message: error.message,
    })),
  }
}

function buildConsoleSummary(summaryReport = {}) {
  return {
    outputs: summaryReport.outputs,
    summary: summaryReport.summary,
    sourceCompatibility: Object.fromEntries(
      Object.entries(summaryReport.sourceCompatibility ?? {}).map(([sourceKey, diagnostic]) => [
        sourceKey,
        {
          totalRows: diagnostic.totalRows,
          compatibilityPercent: diagnostic.compatibilityPercent,
          hasPlanId: diagnostic.hasPlanId,
          hasMateriaCodigo: diagnostic.hasMateriaCodigo,
          missingFieldsCount: diagnostic.missingFields.length,
        },
      ]),
    ),
    risks: summaryReport.risks,
    recommendations: summaryReport.recommendations,
  }
}

function main() {
  if (!existsSync(SNAPSHOT_INPUT_PATH)) {
    fail('No existe local-audit/workspaceSnapshot.real.local.json.')
    return
  }

  try {
    mkdirSync(LOCAL_AUDIT_DIR, { recursive: true })

    const snapshot = readJsonFile(SNAPSHOT_INPUT_PATH)
    const result = diagnoseTemplateV2Readiness(snapshot)
    const summaryReport = buildSummaryReport(result)

    writeJson(REPORT_OUTPUT_PATH, result)
    writeJson(SUMMARY_OUTPUT_PATH, summaryReport)

    console.log(JSON.stringify(buildConsoleSummary(summaryReport), null, 2))
  } catch (error) {
    fail(error instanceof Error ? error.message : 'No se pudo diagnosticar compatibilidad con templates v2.')
  }
}

main()
