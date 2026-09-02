import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildRegularExamInputFromWorkspaceSnapshot } from '../../src/utils/examEngine/comparison/buildRegularExamInputFromWorkspaceSnapshot.js'
import { runVocalAuditPlan } from '../../src/utils/examEngine/audit/vocalBottleneckDiagnosis.js'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(SCRIPT_DIR, '../..')
const LOCAL_SNAPSHOT_PATH = resolve(REPO_ROOT, 'local-audit/workspaceSnapshot.real.local.json')

function fail(message) {
  console.error(`[examEngine vocal phase summary] ${message}`)
  process.exitCode = 1
}

function main() {
  if (!existsSync(LOCAL_SNAPSHOT_PATH)) {
    fail('No existe local-audit/workspaceSnapshot.real.local.json.')
    return
  }

  const started = Date.now()
  const snapshot = JSON.parse(readFileSync(LOCAL_SNAPSHOT_PATH, 'utf8'))
  const input = buildRegularExamInputFromWorkspaceSnapshot(snapshot)
  const plan = runVocalAuditPlan(input)

  console.log(JSON.stringify({
    elapsedMs: Date.now() - started,
    inputCounts: {
      materias: Array.isArray(input.materias) ? input.materias.length : 0,
      docentes: Array.isArray(input.docentes) ? input.docentes.length : 0,
      fechasDisponibles: Array.isArray(input.fechasDisponibles) ? input.fechasDisponibles.length : 0,
      correlatividades: Array.isArray(input.correlatividades) ? input.correlatividades.length : 0,
    },
    stageSummaries: plan.summary?.stageSummaries ?? {},
    totals: {
      mesasPreliminares: Array.isArray(plan.mesasPreliminares) ? plan.mesasPreliminares.length : 0,
      mesasConVocales: Array.isArray(plan.mesasConVocales) ? plan.mesasConVocales.length : 0,
      mesasReparadas: Array.isArray(plan.mesasReparadas) ? plan.mesasReparadas.length : 0,
      mesasCompactadas: Array.isArray(plan.mesasCompactadas) ? plan.mesasCompactadas.length : 0,
      planned: Array.isArray(plan.plannedMesas) ? plan.plannedMesas.length : 0,
      unassigned: Array.isArray(plan.unassignedMesas) ? plan.unassignedMesas.length : 0,
      errors: Array.isArray(plan.errors) ? plan.errors.length : 0,
      warnings: Array.isArray(plan.warnings) ? plan.warnings.length : 0,
    },
  }, null, 2))
}

main()
