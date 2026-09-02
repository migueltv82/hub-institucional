import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'
import { dirname, extname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildRegularExamInputFromWorkspaceSnapshot } from '../src/utils/examEngine/comparison/buildRegularExamInputFromWorkspaceSnapshot.js'
import { generateDraftExamSchedule } from '../src/utils/examEngine/planning/draftSchedule/generateDraftExamSchedule.js'
import { teacherIsAvailableOnDate } from '../src/utils/examEngine/rules/availability.js'
import { normalizeText } from '../src/utils/examEngine/normalize/subjects.js'
import { teacherHasAnyAvailabilityData } from '../src/utils/examEngine/planning/draftSchedule/planDraftScheduleDates.js'
import { buildFullAnonymizedWorkspaceSnapshotAuditPayload } from '../src/components/generadorCronograma/workspaceSnapshotAuditExport.js'
import { sha256Hex } from '../src/utils/examEngine/adminReviewPromotionWorkflow.js'

const SCRIPT_PATH = fileURLToPath(import.meta.url)
const SCRIPT_DIR = dirname(SCRIPT_PATH)
const REPO_ROOT = resolve(SCRIPT_DIR, '..')
const DEFAULT_REPORT_DIRECTORY = resolve(REPO_ROOT, 'docs', 'date-strategy-comparisons')

const VALUE_FLAGS = new Set(['--snapshot', '--fechaInicio', '--fechaFin', '--output'])
const BOOLEAN_FLAGS = new Set(['--anonymize', '--no-write'])

function clean(value) {
  return String(value ?? '').trim()
}

function safeTimestamp(value) {
  return clean(value).replaceAll(/[:.]/g, '').replace('T', '_').replace('Z', '')
}

export function parseCompareArguments(argv = []) {
  const options = {
    snapshot: '',
    fechaInicio: '',
    fechaFin: '',
    anonymize: false,
    output: '',
    noWrite: true,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (BOOLEAN_FLAGS.has(argument)) {
      if (argument === '--anonymize') options.anonymize = true
      if (argument === '--no-write') options.noWrite = true
      continue
    }
    if (!VALUE_FLAGS.has(argument)) throw new Error(`COMPARE_DATE_STRATEGIES_UNKNOWN_ARGUMENT:${argument}`)
    const value = argv[index + 1]
    if (!value || value.startsWith('--')) throw new Error(`COMPARE_DATE_STRATEGIES_ARGUMENT_VALUE_REQUIRED:${argument}`)
    index += 1
    if (argument === '--snapshot') options.snapshot = value
    if (argument === '--fechaInicio') options.fechaInicio = value
    if (argument === '--fechaFin') options.fechaFin = value
    if (argument === '--output') options.output = value
  }

  if (!options.snapshot) throw new Error('COMPARE_DATE_STRATEGIES_SNAPSHOT_ARGUMENT_REQUIRED')
  if (options.noWrite !== true) throw new Error('COMPARE_DATE_STRATEGIES_NO_WRITE_REQUIRED')
  return options
}

function extractSnapshot(parsed) {
  if (parsed?.snapshot && typeof parsed.snapshot === 'object' && !Array.isArray(parsed.snapshot)) {
    return parsed.snapshot
  }
  if (parsed?.payload && typeof parsed.payload === 'object' && !Array.isArray(parsed.payload)) {
    return parsed.payload
  }
  return parsed
}

function assertLocalJsonInput(filePath, fsApi) {
  if (!clean(filePath) || clean(filePath).includes('://')) throw new Error('COMPARE_DATE_STRATEGIES_LOCAL_SNAPSHOT_REQUIRED')
  if (extname(filePath).toLowerCase() !== '.json') throw new Error('COMPARE_DATE_STRATEGIES_SNAPSHOT_MUST_BE_JSON')
  if (!fsApi.existsSync(filePath)) throw new Error(`COMPARE_DATE_STRATEGIES_SNAPSHOT_NOT_FOUND:${filePath}`)
}

function assertSafeOutputPath({ inputPath, outputPath, expectedExtension }) {
  if (!outputPath) return
  if (resolve(outputPath) === resolve(inputPath)) throw new Error('COMPARE_DATE_STRATEGIES_OUTPUT_CANNOT_REPLACE_SNAPSHOT')
  if (extname(outputPath).toLowerCase() !== expectedExtension) {
    throw new Error(`COMPARE_DATE_STRATEGIES_OUTPUT_EXTENSION_REQUIRED:${expectedExtension}`)
  }
}

function buildDefaultMarkdownPath(now) {
  return resolve(DEFAULT_REPORT_DIRECTORY, `DRAFT_SCHEDULE_DATE_STRATEGY_COMPARISON_${safeTimestamp(now)}.md`)
}

function writeArtifact(filePath, content, fsApi) {
  fsApi.mkdirSync(dirname(filePath), { recursive: true })
  fsApi.writeFileSync(filePath, content, 'utf8')
}

function buildDocenteLookup(docentes = []) {
  const map = new Map()
  docentes.forEach((docente) => {
    const keys = [docente.id, docente.docenteId, docente.dni, docente.email, docente.nombre, docente.full_name, docente.profesor]
      .map(normalizeText)
      .filter(Boolean)
    keys.forEach((key) => map.set(key, docente))
  })
  return map
}

// Summarizes one strategy's draftSchedule against the titulares' real
// availability, so the report can show whether the new strategy actually
// stops assigning mesas on days the titular does not attend.
function summarizeStrategyResult(result, docenteLookup) {
  const mesas = result.draftSchedule

  let titularAusenteEnFechaAsignada = 0
  let materiasSinDatosDisponibilidad = 0

  mesas.forEach((mesa) => {
    const titular = docenteLookup.get(normalizeText(mesa.titularId))
    if (!titular || !teacherHasAnyAvailabilityData(titular)) {
      materiasSinDatosDisponibilidad += 1
      return
    }
    if (mesa.fechaSugerida && !teacherIsAvailableOnDate(titular, mesa.fechaSugerida)) {
      titularAusenteEnFechaAsignada += 1
    }
  })

  return {
    totalMesas: mesas.length,
    mesasPorFecha: result.summary.mesasPorFecha,
    titularAusenteEnFechaAsignada,
    materiasSinDatosDisponibilidad,
  }
}

function buildChangedMesas(roundRobinResult, availabilityAwareResult) {
  const before = new Map(roundRobinResult.draftSchedule.map((mesa) => [mesa.draftMesaId, mesa]))

  return availabilityAwareResult.draftSchedule
    .map((mesa) => {
      const previous = before.get(mesa.draftMesaId)
      if (!previous || previous.fechaSugerida === mesa.fechaSugerida) return null
      return {
        draftMesaId: mesa.draftMesaId,
        carrera: mesa.carrera,
        materiaMesa: mesa.materiaMesa,
        titular: mesa.titular,
        fechaAntes: previous.fechaSugerida,
        fechaDespues: mesa.fechaSugerida,
      }
    })
    .filter(Boolean)
}

export function compareDraftScheduleDateStrategies({ workspaceSnapshot = {}, fechaInicio = '', fechaFin = '' } = {}) {
  const effectiveFechaInicio = clean(fechaInicio) || clean(workspaceSnapshot.fechaInicio)
  const effectiveFechaFin = clean(fechaFin) || clean(workspaceSnapshot.fechaFin)

  const adapted = buildRegularExamInputFromWorkspaceSnapshot({
    ...workspaceSnapshot,
    fechaInicio: effectiveFechaInicio,
    fechaFin: effectiveFechaFin,
    examType: 'regular',
    regularCallRanges: {
      first: { start: effectiveFechaInicio, end: effectiveFechaFin },
    },
  })

  const baseExamCallConfig = {
    tipoPeriodo: 'REGULAR',
    cantidadLlamados: 1,
    fechaInicio: effectiveFechaInicio,
    fechaFin: effectiveFechaFin,
    rangosLlamados: {
      PRIMER_LLAMADO: { inicio: effectiveFechaInicio, fin: effectiveFechaFin },
    },
    usarDiasHabiles: true,
    carrerasIncluidas: 'ALL',
    excepcionesPorCarrera: [],
    estadoSalida: 'TEACHER_REVIEW',
  }

  const roundRobinResult = generateDraftExamSchedule({
    docentes: adapted.docentes,
    materias: adapted.materias,
    examCallConfig: { ...baseExamCallConfig, fechaAssignmentStrategy: 'roundRobin' },
  })
  const availabilityAwareResult = generateDraftExamSchedule({
    docentes: adapted.docentes,
    materias: adapted.materias,
    examCallConfig: { ...baseExamCallConfig, fechaAssignmentStrategy: 'availabilityAware' },
  })

  const docenteLookup = buildDocenteLookup(adapted.docentes)
  const roundRobinSummary = summarizeStrategyResult(roundRobinResult, docenteLookup)
  const availabilityAwareSummary = summarizeStrategyResult(availabilityAwareResult, docenteLookup)
  const changedMesas = buildChangedMesas(roundRobinResult, availabilityAwareResult)

  return {
    fechaInicio: effectiveFechaInicio,
    fechaFin: effectiveFechaFin,
    roundRobinSummary,
    availabilityAwareSummary,
    changedMesas,
  }
}

function renderMesasPorFecha(mesasPorFecha = {}) {
  const entries = Object.entries(mesasPorFecha).sort(([left], [right]) => left.localeCompare(right))
  if (!entries.length) return '_Sin mesas._'
  return entries.map(([fecha, count]) => `- ${fecha}: ${count} mesas`).join('\n')
}

export function renderDraftScheduleDateStrategyComparisonMarkdown({
  generatedAt,
  fechaInicio,
  fechaFin,
  roundRobinSummary,
  availabilityAwareSummary,
  changedMesas,
  anonymized,
}) {
  const lines = [
    '# Comparacion de estrategias de fecha del precronograma',
    '',
    `Generado: ${generatedAt}`,
    `Periodo comparado: ${fechaInicio} al ${fechaFin}`,
    `Datos: ${anonymized ? 'anonimizados' : 'reales — uso solo local, no compartir este archivo'}`,
    '',
    '## Resumen',
    '',
    '| Metrica | roundRobin (actual) | availabilityAware (nuevo) |',
    '|---|---|---|',
    `| Total mesas | ${roundRobinSummary.totalMesas} | ${availabilityAwareSummary.totalMesas} |`,
    `| Titular en fecha que no asiste | ${roundRobinSummary.titularAusenteEnFechaAsignada} | ${availabilityAwareSummary.titularAusenteEnFechaAsignada} |`,
    `| Materias sin datos de disponibilidad (van a fallback round-robin igual) | ${roundRobinSummary.materiasSinDatosDisponibilidad} | ${availabilityAwareSummary.materiasSinDatosDisponibilidad} |`,
    '',
    '## Mesas por fecha — roundRobin (actual)',
    '',
    renderMesasPorFecha(roundRobinSummary.mesasPorFecha),
    '',
    '## Mesas por fecha — availabilityAware (nuevo)',
    '',
    renderMesasPorFecha(availabilityAwareSummary.mesasPorFecha),
    '',
    `## Mesas con fecha distinta entre estrategias (${changedMesas.length})`,
    '',
  ]

  if (changedMesas.length) {
    lines.push('| Mesa | Carrera | Materia | Titular | Fecha actual | Fecha nueva |')
    lines.push('|---|---|---|---|---|---|')
    changedMesas.forEach((row) => {
      lines.push(`| ${row.draftMesaId} | ${row.carrera} | ${row.materiaMesa} | ${row.titular} | ${row.fechaAntes} | ${row.fechaDespues} |`)
    })
  } else {
    lines.push('Ninguna mesa cambio de fecha entre estrategias.')
  }

  lines.push('')
  return lines.join('\n')
}

export function runCompareDraftScheduleDateStrategiesCli({
  argv = process.argv.slice(2),
  cwd = process.cwd(),
  now = () => new Date().toISOString(),
  fsApi = { existsSync, mkdirSync, readFileSync, writeFileSync },
  writeReports = true,
} = {}) {
  const options = parseCompareArguments(argv)
  const snapshotPath = resolve(cwd, options.snapshot)
  const generatedAt = now()
  const markdownPath = options.output ? resolve(cwd, options.output) : buildDefaultMarkdownPath(generatedAt)
  assertLocalJsonInput(snapshotPath, fsApi)
  assertSafeOutputPath({ inputPath: snapshotPath, outputPath: markdownPath, expectedExtension: '.md' })

  const originalFileContent = fsApi.readFileSync(snapshotPath, 'utf8')
  let parsed
  try {
    parsed = JSON.parse(originalFileContent)
  } catch {
    throw new Error('COMPARE_DATE_STRATEGIES_SNAPSHOT_JSON_INVALID')
  }
  const rawSnapshot = extractSnapshot(parsed)
  if (!rawSnapshot || typeof rawSnapshot !== 'object' || Array.isArray(rawSnapshot)) {
    throw new Error('COMPARE_DATE_STRATEGIES_SNAPSHOT_PAYLOAD_INVALID')
  }

  const workspaceSnapshot = options.anonymize
    ? buildFullAnonymizedWorkspaceSnapshotAuditPayload(rawSnapshot, { now })
    : JSON.parse(JSON.stringify(rawSnapshot))

  const comparison = compareDraftScheduleDateStrategies({
    workspaceSnapshot,
    fechaInicio: options.fechaInicio,
    fechaFin: options.fechaFin,
  })
  const markdown = renderDraftScheduleDateStrategyComparisonMarkdown({
    generatedAt,
    ...comparison,
    anonymized: options.anonymize,
  })

  if (writeReports) writeArtifact(markdownPath, `${markdown.trim()}\n`, fsApi)

  const finalFileContent = fsApi.readFileSync(snapshotPath, 'utf8')
  const sourceFileUnchanged = sha256Hex(originalFileContent) === sha256Hex(finalFileContent)
  if (!sourceFileUnchanged) throw new Error('COMPARE_DATE_STRATEGIES_SOURCE_FILE_CHANGED')

  return {
    comparison,
    markdown,
    summary: {
      sourceFileUnchanged,
      anonymized: options.anonymize,
      totalMesas: comparison.roundRobinSummary.totalMesas,
      mesasConFechaDistinta: comparison.changedMesas.length,
      titularAusenteAntes: comparison.roundRobinSummary.titularAusenteEnFechaAsignada,
      titularAusenteDespues: comparison.availabilityAwareSummary.titularAusenteEnFechaAsignada,
      output: writeReports ? markdownPath : null,
    },
  }
}

function printFailure(error) {
  const message = error instanceof Error ? error.message : 'COMPARE_DATE_STRATEGIES_UNKNOWN_ERROR'
  console.error(JSON.stringify({ ok: false, message }, null, 2))
}

function main() {
  try {
    const result = runCompareDraftScheduleDateStrategiesCli()
    console.log(JSON.stringify(result.summary, null, 2))
  } catch (error) {
    printFailure(error)
    process.exitCode = 1
  }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(SCRIPT_PATH)) main()
