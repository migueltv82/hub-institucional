import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { buildRegularExamInputFromWorkspaceSnapshot } from '../../src/utils/examEngine/comparison/buildRegularExamInputFromWorkspaceSnapshot.js'
import { generateRegularExamPlan } from '../../src/utils/examEngine/planning/generateRegular.js'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(SCRIPT_DIR, '../..')
const LOCAL_AUDIT_DIR = resolve(REPO_ROOT, 'local-audit')
const DEFAULT_SNAPSHOT_PATH = resolve(LOCAL_AUDIT_DIR, 'workspaceSnapshot.real.local.json')
const DOCENTE_MATERIA_CORRECTED_PATH = resolve(LOCAL_AUDIT_DIR, 'docente_materia.corrected.json')
const DEFAULT_TRACE_PATH = resolve(LOCAL_AUDIT_DIR, 'legacy_universe_exclusions_trace.json')
const REPORT_OUTPUT_PATH = resolve(LOCAL_AUDIT_DIR, 'correlativity_blocking_gap.json')
const SUMMARY_OUTPUT_PATH = resolve(LOCAL_AUDIT_DIR, 'correlativity_blocking_gap.summary.json')
const CSV_OUTPUT_PATH = resolve(LOCAL_AUDIT_DIR, 'correlativity_blocking_gap.csv')
const MARKDOWN_OUTPUT_PATH = resolve(LOCAL_AUDIT_DIR, 'correlativity_blocking_gap.md')

const CSV_COLUMNS = [
  'case_id',
  'carrera',
  'materia_codigo',
  'materia_nombre',
  'llamado',
  'exam_engine_estado',
  'exam_engine_reason',
  'previas_total',
  'previas_planificadas',
  'previas_pendientes',
  'previas_no_encontradas',
  'previas_detalle',
  'decision_sugerida',
]

const CALL_ALIASES = new Map([
  ['1', 'PRIMER_LLAMADO'],
  ['first', 'PRIMER_LLAMADO'],
  ['primer', 'PRIMER_LLAMADO'],
  ['primero', 'PRIMER_LLAMADO'],
  ['primer llamado', 'PRIMER_LLAMADO'],
  ['primer_llamado', 'PRIMER_LLAMADO'],
  ['PRIMER_LLAMADO', 'PRIMER_LLAMADO'],
  ['2', 'SEGUNDO_LLAMADO'],
  ['second', 'SEGUNDO_LLAMADO'],
  ['segundo', 'SEGUNDO_LLAMADO'],
  ['segundo llamado', 'SEGUNDO_LLAMADO'],
  ['segundo_llamado', 'SEGUNDO_LLAMADO'],
  ['SEGUNDO_LLAMADO', 'SEGUNDO_LLAMADO'],
])

function fail(message) {
  console.error(`[correlativity blocking gap] ${message}`)
  process.exitCode = 1
}

function clean(value) {
  return String(value ?? '').trim()
}

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function cloneJson(value) {
  if (value === undefined) return undefined
  if (typeof structuredClone === 'function') return structuredClone(value)
  return JSON.parse(JSON.stringify(value))
}

function normalizeText(value) {
  return clean(value)
    .toLowerCase()
    .normalize('NFD')
    .replaceAll(/[\u0300-\u036f]/g, '')
    .replaceAll(/\s+/g, ' ')
    .trim()
}

function normalizeToken(value) {
  return normalizeText(value).replaceAll(/[^a-z0-9]+/g, '')
}

function normalizeCall(value) {
  const text = clean(value)
  if (!text) return ''
  return CALL_ALIASES.get(text) ?? CALL_ALIASES.get(normalizeText(text)) ?? CALL_ALIASES.get(normalizeToken(text)) ?? text
}

function splitParts(value) {
  return clean(value).split('/').map(clean).filter(Boolean)
}

function codeAliases(value) {
  const token = normalizeToken(value)
  if (!token) return []

  const aliases = new Set([token])
  const match = token.match(/^([a-z]+)0*(\d+)$/)
  if (match) {
    const [, prefix, numberText] = match
    const number = String(Number(numberText))
    aliases.add(`${prefix}${number}`)
    aliases.add(`${prefix}${number.padStart(2, '0')}`)
  }

  return [...aliases].filter((alias) => alias && !alias.endsWith('nan'))
}

function idParts(value) {
  const text = clean(value)
  const match = text.match(/candidate:([^:]+)::([^:]+):/i)
  if (!match) return { career: '', code: '' }

  return {
    career: match[1],
    code: match[2],
  }
}

function idSubjectCodes(value) {
  const text = clean(value)
  const codes = []
  const pattern = /candidate:[^:]+::([^:]+):/gi
  let match = pattern.exec(text)

  while (match) {
    codes.push(match[1])
    match = pattern.exec(text)
  }

  return codes
}

function isUuidLike(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clean(value))
}

function uniqueClean(values = []) {
  return [...new Set(values.map(clean).filter(Boolean))]
}

function displaySubjectCodes(item = {}) {
  const explicitCodes = uniqueClean([
    ...splitParts(item.materiaCodigo),
    ...splitParts(item.codigo),
  ])
  const idCodes = uniqueClean(idSubjectCodes(item.id))
  const groupedCodes = uniqueClean(asArray(item.materiasAgrupadas).flatMap((subject) => [
    ...splitParts(subject.materiaCodigo),
    ...splitParts(subject.codigo),
    ...idSubjectCodes(subject.id),
  ]))
  const fallbackCodes = uniqueClean([
    ...splitParts(item.materiaId).filter((value) => !isUuidLike(value)),
    ...splitParts(item.materia),
  ])
  const codes = explicitCodes.length
    ? explicitCodes
    : idCodes.length
      ? idCodes
      : groupedCodes.length
        ? groupedCodes
        : fallbackCodes

  return codes.map((code) => code.toUpperCase()).join(' / ')
}

function readJsonFile(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'))
}

function writeJson(filePath, value) {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

function toRepoPath(filePath) {
  return relative(REPO_ROOT, filePath).replaceAll('\\', '/')
}

function resolvePath(value, fallback) {
  const requested = clean(value)
  if (!requested) return fallback
  return isAbsolute(requested) ? requested : resolve(REPO_ROOT, requested)
}

function parseArgs(argv = []) {
  const args = {}

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (!arg.startsWith('--')) continue

    const [rawKey, inlineValue] = arg.slice(2).split('=', 2)
    const key = rawKey.replaceAll('-', '_')
    const value = inlineValue ?? argv[index + 1]
    args[key] = value

    if (inlineValue === undefined && value && !value.startsWith('--')) {
      index += 1
    }
  }

  return args
}

function isRegularExam(snapshot = {}) {
  return !['special', 'especial'].includes(normalizeText(snapshot.examType))
}

function rangeStart(range = {}) {
  return clean(range.start ?? range.inicio)
}

function rangeEnd(range = {}) {
  return clean(range.end ?? range.fin)
}

function hasCompleteRange(range = {}) {
  return Boolean(rangeStart(range) && rangeEnd(range))
}

function normalizeSnapshotForGeneration(snapshot = {}) {
  const normalized = cloneJson(snapshot)
  const ranges = normalized.regularCallRanges

  if (isRegularExam(normalized) && ranges && typeof ranges === 'object') {
    const firstComplete = hasCompleteRange(ranges.first)
    const secondComplete = hasCompleteRange(ranges.second)
    const explicitCallCount = Number(ranges.callCount)

    if (firstComplete && !secondComplete && explicitCallCount !== 1) {
      normalized.regularCallRanges = {
        ...ranges,
        callCount: 1,
      }
    }
  }

  return normalized
}

function injectDocenteMateriaCorrected(snapshot = {}) {
  if (!existsSync(DOCENTE_MATERIA_CORRECTED_PATH)) {
    return { snapshot, source: null, rows: 0 }
  }

  const rows = readJsonFile(DOCENTE_MATERIA_CORRECTED_PATH)
  if (!Array.isArray(rows) || rows.length === 0) {
    return { snapshot, source: null, rows: 0 }
  }

  return {
    snapshot: {
      ...snapshot,
      docenteMateria: rows,
    },
    source: toRepoPath(DOCENTE_MATERIA_CORRECTED_PATH),
    rows: rows.length,
  }
}

function subjectCodes(item = {}) {
  return [
    ...splitParts(item.materiaCodigo),
    ...splitParts(item.materiaId),
    ...splitParts(item.materia),
    ...splitParts(item.codigo),
    ...splitParts(item.nombreMateria),
    ...idSubjectCodes(item.id),
    ...asArray(item.materiasAgrupadas).flatMap((subject) => [
      ...splitParts(subject.materiaCodigo),
      ...splitParts(subject.materiaId),
      ...splitParts(subject.materia),
      ...splitParts(subject.codigo),
      ...splitParts(subject.nombreMateria),
      ...idSubjectCodes(subject.id),
    ]),
  ].flatMap(codeAliases).filter(Boolean)
}

function subjectCareers(item = {}) {
  return [
    item.carreraId,
    item.carrera,
    idParts(item.id).career,
  ].map(normalizeToken).filter(Boolean)
}

function subjectKeyParts(item = {}) {
  const careers = subjectCareers(item)
  const codes = subjectCodes(item)
  return careers.flatMap((career) => codes.map((code) => `${career}::${code}`))
}

function mesaMatchesTarget(mesa = {}, target = {}) {
  const wantedCareers = new Set(subjectCareers(target))
  const wantedCodes = new Set(subjectCodes(target))
  const mesaCareers = subjectCareers(mesa)
  const mesaCodes = subjectCodes(mesa)
  const careerMatches = mesaCareers.some((career) => wantedCareers.has(career))
  const codeMatches = mesaCodes.some((code) => wantedCodes.has(code))
  const targetCall = normalizeCall(target.llamado)
  const mesaCall = normalizeCall(mesa.llamado ?? mesa.exam_call)

  return careerMatches && codeMatches && (!targetCall || !mesaCall || targetCall === mesaCall)
}

function mesaCodeMatchesTarget(mesa = {}, target = {}) {
  const wantedCodes = new Set(subjectCodes(target))
  const mesaCodes = subjectCodes(mesa)
  const targetCall = normalizeCall(target.llamado)
  const mesaCall = normalizeCall(mesa.llamado ?? mesa.exam_call)
  const codeMatches = mesaCodes.some((code) => wantedCodes.has(code))

  return codeMatches && (!targetCall || !mesaCall || targetCall === mesaCall)
}

function indexMesas(mesas = []) {
  return asArray(mesas).reduce((index, mesa) => {
    subjectKeyParts(mesa).forEach((key) => {
      const rows = index.get(key) ?? []
      rows.push(mesa)
      index.set(key, rows)
    })
    return index
  }, new Map())
}

function findMesas(index = new Map(), target = {}) {
  const keys = subjectKeyParts(target)
  const seen = new Set()

  return keys.flatMap((key) => index.get(key) ?? []).filter((mesa) => {
    const id = clean(mesa.id) || JSON.stringify(mesa)
    if (seen.has(id)) return false
    seen.add(id)
    return true
  })
}

function findCorrelativityRows(correlatividades = [], target = {}) {
  const strictMatches = asArray(correlatividades).filter((row) => mesaMatchesTarget({
    ...row,
    materiaCodigo: row.materia,
  }, target))
  if (strictMatches.length) return strictMatches.map((row) => ({ ...row, matchMode: 'CAREER_AND_CODE' }))

  return asArray(correlatividades)
    .filter((row) => mesaCodeMatchesTarget({
      ...row,
      materiaCodigo: row.materia,
    }, target))
    .map((row) => ({ ...row, matchMode: 'CODE_ONLY' }))
}

function describeMesa(mesa = {}, estado = '') {
  return {
    estado,
    id: clean(mesa.id),
    carrera: clean(mesa.carrera),
    materiaCodigo: displaySubjectCodes(mesa),
    materiaNombre: clean(mesa.materiaNombre ?? mesa.materia),
    llamado: normalizeCall(mesa.llamado ?? mesa.exam_call),
    fecha: clean(mesa.fechaIso ?? mesa.fecha),
    reason: clean(mesa.reason),
  }
}

function isCorrelativityUnassignedMesa(mesa = {}) {
  return mesa.estado === 'SIN_FECHA_TENTATIVA' && mesa.reason === 'CORRELATIVIDAD_CONFLICTIVA'
}

function describeTargetMesa(mesa = {}) {
  return {
    id: clean(mesa.id),
    carrera: clean(mesa.carrera),
    carreraId: clean(mesa.carreraId),
    materiaCodigo: displaySubjectCodes(mesa),
    materiaNombre: clean(mesa.materiaNombre ?? mesa.nombreMateria ?? mesa.nombre ?? mesa.materia),
    llamado: normalizeCall(mesa.llamado ?? mesa.exam_call),
  }
}

export function buildCorrelativityTargetCasesFromPlan(plan = {}) {
  return asArray(plan.unassignedMesas)
    .filter(isCorrelativityUnassignedMesa)
    .map((mesa, index) => ({
      caseId: `CBG-${String(index + 1).padStart(4, '0')}`,
      mesa: describeTargetMesa(mesa),
    }))
}

function describePrevia({ previa = '', target = {}, plannedIndex = new Map(), unassignedIndex = new Map() } = {}) {
  const previaTarget = {
    carrera: target.carrera,
    carreraId: target.carreraId,
    materiaCodigo: previa,
    materia: previa,
    llamado: target.llamado,
  }
  const planned = findMesas(plannedIndex, previaTarget).map((mesa) => describeMesa(mesa, 'PLANIFICADA'))
  const unassigned = findMesas(unassignedIndex, previaTarget).map((mesa) => describeMesa(mesa, 'PENDIENTE'))

  if (planned.length) {
    return {
      previa,
      estado: 'PLANIFICADA',
      matches: planned,
    }
  }
  if (unassigned.length) {
    return {
      previa,
      estado: 'PENDIENTE',
      reason: [...new Set(unassigned.map((mesa) => mesa.reason).filter(Boolean))].join(' | '),
      matches: unassigned,
    }
  }
  return {
    previa,
    estado: 'NO_ENCONTRADA_EN_MOTOR',
    matches: [],
  }
}

function suggestedDecision(previas = [], engine = {}) {
  const engineStatus = clean(engine.estado)
  const engineReason = clean(engine.reason)
  if (engineStatus === 'PLANIFICADA') {
    return 'REVISAR_POR_QUE_LEGACY_EXCLUYO'
  }
  if (previas.some((previa) => previa.estado === 'PENDIENTE' || previa.estado === 'NO_ENCONTRADA_EN_MOTOR')) {
    return 'ALINEAR_EXAM_ENGINE_A_PREVIA_REQUERIDA'
  }
  if (engineReason === 'CORRELATIVIDAD_CONFLICTIVA') {
    return 'REVISAR_ORDEN_FECHAS_CORRELATIVAS'
  }
  if (engineStatus === 'PENDIENTE') {
    return 'REVISAR_SUPERPOSICION_DESPUES_DE_CORRELATIVIDAD'
  }
  return 'REVISAR_DATOS'
}

function buildCase({ traceCase = {}, plan = {}, input = {} } = {}) {
  const target = {
    id: traceCase.mesa?.id,
    carrera: traceCase.mesa?.carrera,
    carreraId: traceCase.mesa?.carreraId,
    materiaCodigo: traceCase.mesa?.materiaCodigo,
    materia: traceCase.mesa?.materiaCodigo,
    materiaNombre: traceCase.mesa?.materiaNombre,
    llamado: traceCase.mesa?.llamado,
  }
  const plannedIndex = indexMesas(plan.plannedMesas)
  const unassignedIndex = indexMesas(plan.unassignedMesas)
  const plannedMatches = findMesas(plannedIndex, target)
  const unassignedMatches = findMesas(unassignedIndex, target)
  const engineMatch = plannedMatches[0]
    ? describeMesa(plannedMatches[0], 'PLANIFICADA')
    : unassignedMatches[0]
      ? describeMesa(unassignedMatches[0], 'PENDIENTE')
      : null
  const correlativityRows = findCorrelativityRows(input.correlatividades, target)
  const previas = correlativityRows.flatMap((row) => asArray(row.correlativas))
  const uniquePrevias = [...new Set(previas.map(clean).filter(Boolean))]
    .map((previa) => describePrevia({ previa, target, plannedIndex, unassignedIndex }))
  const decision = suggestedDecision(uniquePrevias, engineMatch ?? { estado: 'SIN_MATCH', reason: '' })

  return {
    caseId: traceCase.caseId,
    mesa: traceCase.mesa,
    examEngine: engineMatch ?? { estado: 'SIN_MATCH', reason: '' },
    correlativityRows,
    previas: uniquePrevias,
    counts: {
      previasTotal: uniquePrevias.length,
      previasPlanificadas: uniquePrevias.filter((previa) => previa.estado === 'PLANIFICADA').length,
      previasPendientes: uniquePrevias.filter((previa) => previa.estado === 'PENDIENTE').length,
      previasNoEncontradas: uniquePrevias.filter((previa) => previa.estado === 'NO_ENCONTRADA_EN_MOTOR').length,
    },
    decisionSugerida: decision,
  }
}

function countBy(items = [], picker = (item) => item) {
  return items.reduce((counts, item) => {
    const key = clean(picker(item)) || 'SIN_DATO'
    counts[key] = (counts[key] ?? 0) + 1
    return counts
  }, {})
}

function topEntries(counts = {}, limit = 20) {
  return Object.entries(counts)
    .map(([key, count]) => ({ key, count }))
    .sort((left, right) => right.count - left.count || left.key.localeCompare(right.key))
    .slice(0, limit)
}

function buildSummary({ cases = [], plan = {}, input = {}, source = {} } = {}) {
  const previas = cases.flatMap((item) => item.previas)
  const plannedPosteriorWithMissingPrevia = cases.filter((item) => (
    item.examEngine?.estado === 'PLANIFICADA' &&
    item.previas.some((previa) => previa.estado !== 'PLANIFICADA')
  ))
  const byEngineReason = countBy(cases, (item) => item.examEngine?.reason)
  const correlativityCases = byEngineReason.CORRELATIVIDAD_CONFLICTIVA ?? 0

  return {
    source,
    totals: {
      analyzedCases: cases.length,
      examEnginePlanned: asArray(plan.plannedMesas).length,
      examEngineUnassigned: asArray(plan.unassignedMesas).length,
      correlativityRows: asArray(input.correlatividades).length,
      previasTotal: previas.length,
      previasPlanificadas: previas.filter((previa) => previa.estado === 'PLANIFICADA').length,
      previasPendientes: previas.filter((previa) => previa.estado === 'PENDIENTE').length,
      previasNoEncontradas: previas.filter((previa) => previa.estado === 'NO_ENCONTRADA_EN_MOTOR').length,
      plannedPosteriorWithMissingPrevia: plannedPosteriorWithMissingPrevia.length,
    },
    byEngineStatus: countBy(cases, (item) => item.examEngine?.estado),
    byEngineReason,
    byPreviaStatus: countBy(previas, (item) => item.estado),
    byPreviaPendingReason: countBy(previas.filter((item) => item.estado === 'PENDIENTE'), (item) => item.reason),
    byDecision: countBy(cases, (item) => item.decisionSugerida),
    topPreviasPendientes: topEntries(countBy(
      previas.filter((item) => item.estado !== 'PLANIFICADA'),
      (item) => item.previa,
    ), 20),
    recommendation: plannedPosteriorWithMissingPrevia.length
      ? 'Hay posteriores planificadas sin previa planificada: el motor nuevo debe bloquear posterior cuando la previa no tiene fecha.'
      : correlativityCases
        ? 'El motor nuevo ya clasifica este frente como correlatividad: resolver previas base, carreras alias y cascadas antes de volver a superposiciones.'
      : 'Revisar si el reason DOCENTE_SUPERPUESTO esta ocultando una previa pendiente/no encontrada.',
  }
}

function csvEscape(value) {
  const text = Array.isArray(value) ? value.map(clean).filter(Boolean).join(' | ') : String(value ?? '')
  if (!/[",\n\r;]/.test(text)) return text
  return `"${text.replaceAll('"', '""')}"`
}

function casesToCsv(cases = []) {
  const rows = [
    CSV_COLUMNS.join(','),
    ...cases.map((item) => {
      const values = {
        case_id: item.caseId,
        carrera: item.mesa?.carrera,
        materia_codigo: item.mesa?.materiaCodigo,
        materia_nombre: item.mesa?.materiaNombre,
        llamado: item.mesa?.llamado,
        exam_engine_estado: item.examEngine?.estado,
        exam_engine_reason: item.examEngine?.reason,
        previas_total: item.counts.previasTotal,
        previas_planificadas: item.counts.previasPlanificadas,
        previas_pendientes: item.counts.previasPendientes,
        previas_no_encontradas: item.counts.previasNoEncontradas,
        previas_detalle: item.previas.map((previa) => `${previa.previa}:${previa.estado}${previa.reason ? `:${previa.reason}` : ''}`),
        decision_sugerida: item.decisionSugerida,
      }
      return CSV_COLUMNS.map((column) => csvEscape(values[column])).join(',')
    }),
  ]
  return `${rows.join('\n')}\n`
}

function markdownList(entries = [], limit = 12) {
  if (!entries.length) return '- sin datos'
  return entries.slice(0, limit).map((entry) => `- ${entry.key}: ${entry.count}`).join('\n')
}

function buildMarkdown(summary = {}) {
  return `${[
    '# Brecha de correlatividades legacy vs examEngine',
    '',
    '## Lectura',
    '',
    summary.recommendation,
    '',
    '## Totales',
    '',
    `- casos analizados: ${summary.totals.analyzedCases}`,
    `- previas planificadas: ${summary.totals.previasPlanificadas}`,
    `- previas pendientes: ${summary.totals.previasPendientes}`,
    `- previas no encontradas: ${summary.totals.previasNoEncontradas}`,
    `- posteriores planificadas sin previa planificada: ${summary.totals.plannedPosteriorWithMissingPrevia}`,
    '',
    '## Estado del motor nuevo para esos casos',
    '',
    markdownList(topEntries(summary.byEngineStatus, 20), 20),
    '',
    '## Reason del motor nuevo',
    '',
    markdownList(topEntries(summary.byEngineReason, 20), 20),
    '',
    '## Estado de previas',
    '',
    markdownList(topEntries(summary.byPreviaStatus, 20), 20),
    '',
    '## Previas pendientes por motivo',
    '',
    markdownList(topEntries(summary.byPreviaPendingReason, 20), 20),
    '',
    '## Decisiones sugeridas',
    '',
    markdownList(topEntries(summary.byDecision, 20), 20),
    '',
  ].join('\n')}\n`
}

function buildConsoleSummary(summary = {}, outputs = {}) {
  return {
    totals: summary.totals,
    byEngineReason: summary.byEngineReason,
    byPreviaStatus: summary.byPreviaStatus,
    byPreviaPendingReason: summary.byPreviaPendingReason,
    byDecision: summary.byDecision,
    recommendation: summary.recommendation,
    outputs,
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  const snapshotPath = resolvePath(args.snapshot, DEFAULT_SNAPSHOT_PATH)
  const tracePath = resolvePath(args.trace, DEFAULT_TRACE_PATH)

  if (!existsSync(snapshotPath)) {
    fail(`No existe ${toRepoPath(snapshotPath)}.`)
    return
  }

  try {
    mkdirSync(LOCAL_AUDIT_DIR, { recursive: true })
    const rawSnapshot = readJsonFile(snapshotPath)
    const injected = injectDocenteMateriaCorrected(normalizeSnapshotForGeneration(rawSnapshot))
    const input = buildRegularExamInputFromWorkspaceSnapshot(injected.snapshot)
    if (args.vocal_planning_mode) {
      input.options = {
        ...(input.options ?? {}),
        vocalPlanningMode: args.vocal_planning_mode,
      }
    }
    const plan = generateRegularExamPlan(input)
    const targetCases = buildCorrelativityTargetCasesFromPlan(plan)
    const cases = targetCases.map((traceCase) => buildCase({ traceCase, plan, input }))
    const source = {
      snapshot: toRepoPath(snapshotPath),
      trace: existsSync(tracePath) ? toRepoPath(tracePath) : null,
      targetCases: 'generateRegularExamPlan.unassignedMesas[estado=SIN_FECHA_TENTATIVA,reason=CORRELATIVIDAD_CONFLICTIVA]',
      readOnly: true,
      vocalPlanningMode: plan.metadata?.vocalPlanningMode,
      generatedAt: new Date().toISOString(),
      docenteMateria: injected.source
        ? {
            source: injected.source,
            rows: injected.rows,
            injectedInMemory: true,
          }
        : null,
    }
    const summary = buildSummary({ cases, plan, input, source })
    const outputs = {
      report: toRepoPath(REPORT_OUTPUT_PATH),
      summary: toRepoPath(SUMMARY_OUTPUT_PATH),
      csv: toRepoPath(CSV_OUTPUT_PATH),
      markdown: toRepoPath(MARKDOWN_OUTPUT_PATH),
    }

    writeJson(REPORT_OUTPUT_PATH, {
      source,
      summary,
      cases,
      outputs,
    })
    writeJson(SUMMARY_OUTPUT_PATH, summary)
    writeFileSync(CSV_OUTPUT_PATH, casesToCsv(cases), 'utf8')
    writeFileSync(MARKDOWN_OUTPUT_PATH, buildMarkdown(summary), 'utf8')

    console.log(JSON.stringify(buildConsoleSummary(summary, outputs), null, 2))
  } catch (error) {
    fail(error instanceof Error ? error.message : 'No se pudo diagnosticar la brecha de correlatividades.')
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
}
