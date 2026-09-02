import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(SCRIPT_DIR, '../..')
const LOCAL_AUDIT_DIR = resolve(REPO_ROOT, 'local-audit')
const DEFAULT_AUDIT_PATH = resolve(LOCAL_AUDIT_DIR, 'docente_superpuesto_pending_audit.json')
const DEFAULT_TRACE_PATH = resolve(LOCAL_AUDIT_DIR, 'legacy_universe_exclusions_trace.json')
const WORKPACK_DIR = resolve(LOCAL_AUDIT_DIR, 'docente-superpuesto-triage-workpack')

const TRIAGE_FILES = {
  LEGACY_SIN_EQUIVALENTE: {
    fileName: '01_universo_sin_equivalente_legacy.csv',
    title: 'Sin equivalente en cronograma final legacy',
    decisionOptions: 'REVISAR_CORRELATIVIDAD|REVISAR_MATCHING_COMPACTACION|REVISAR_EXCLUSION_LEGACY|REVISAR_DATOS',
    defaultAction: 'REVISAR_DATOS',
  },
  LEGACY_RESUELVE_CON_TRIBUNAL_INCOMPLETO: {
    fileName: '02_legacy_tribunal_incompleto.csv',
    title: 'Legacy resolvia con tribunal incompleto',
    decisionOptions: 'PERMITIR_CON_REVISION|EXIGIR_TRIBUNAL_COMPLETO|REVISAR_DATOS',
    defaultAction: 'REVISAR_DATOS',
  },
  LEGACY_RESUELVE_COMPACTANDO: {
    fileName: '03_legacy_compactacion.csv',
    title: 'Legacy resolvia compactando',
    decisionOptions: 'PORTAR_COMPACTACION|NO_PORTAR|REQUIERE_PLAN_ID|REVISAR_DATOS',
    defaultAction: 'REQUIERE_PLAN_ID',
  },
}

const SUMMARY_COLUMNS = [
  'carril',
  'cantidad',
  'decision_default',
  'opciones_decision',
  'archivo',
]

const WORKPACK_COLUMNS = [
  'decision',
  'opciones_decision',
  'case_id',
  'carril',
  'carrera',
  'materia_codigo',
  'materia_nombre',
  'llamado',
  'titular_nuevo',
  'vocal_1_nuevo',
  'vocal_2_nuevo',
  'intentos_fecha_turno',
  'intentos_superposicion',
  'titular_no_disponible',
  'vocal_no_disponible',
  'docente_superpuesto',
  'docentes_bloqueantes',
  'mesas_bloqueantes',
  'legacy_fecha',
  'legacy_titular',
  'legacy_vocales',
  'legacy_carrera',
  'legacy_materia',
  'legacy_tribunal_incompleto',
  'legacy_compactada',
  'legacy_trace_status',
  'legacy_trace_reason',
  'legacy_trace_count',
  'decision_sugerida_trace',
  'recomendacion_tecnica',
  'observacion_revision',
]

function fail(message) {
  console.error(`[docente superpuesto triage workpack] ${message}`)
  process.exitCode = 1
}

function clean(value) {
  return String(value ?? '').trim()
}

function asArray(value) {
  return Array.isArray(value) ? value : []
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

function resolveInputPath(value) {
  const requested = clean(value)
  if (!requested) return DEFAULT_AUDIT_PATH
  return isAbsolute(requested) ? requested : resolve(REPO_ROOT, requested)
}

function resolveTracePath(value) {
  const requested = clean(value)
  if (!requested) return DEFAULT_TRACE_PATH
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

function csvEscape(value) {
  const text = Array.isArray(value) ? value.map(clean).filter(Boolean).join(' | ') : String(value ?? '')
  if (!/[",\n\r;]/.test(text)) return text
  return `"${text.replaceAll('"', '""')}"`
}

function writeCsv(filePath, columns = [], rows = []) {
  const lines = [
    columns.join(','),
    ...rows.map((row) => columns.map((column) => csvEscape(row[column])).join(',')),
  ]
  writeFileSync(filePath, `${lines.join('\n')}\n`, 'utf8')
}

function groupCases(cases = []) {
  return cases.reduce((groups, item) => {
    const status = clean(item.legacy?.status) || 'SIN_CARRIL'
    const rows = groups.get(status) ?? []
    rows.push(item)
    groups.set(status, rows)
    return groups
  }, new Map())
}

function uniqueLabels(items = [], picker = (item) => item) {
  return [...new Set(items.map(picker).map(clean).filter(Boolean))]
}

function firstLegacyMatch(item = {}) {
  return asArray(item.legacy?.matches)[0] ?? {}
}

function buildTraceIndex(traceReport = {}) {
  return asArray(traceReport.cases).reduce((index, item) => {
    const caseId = clean(item.caseId)
    if (caseId) index.set(caseId, item)
    return index
  }, new Map())
}

function decisionFromTrace(item = {}, triage = {}, trace = {}) {
  if (item.legacy?.status !== 'LEGACY_SIN_EQUIVALENTE' || !trace.traceStatus) {
    return triage.defaultAction
  }
  if (trace.traceStatus === 'LEGACY_EXCLUSION_CORRELATIVIDAD') {
    return 'REVISAR_CORRELATIVIDAD'
  }
  if (trace.traceStatus === 'LEGACY_FINAL_MATCH') {
    return 'REVISAR_MATCHING_COMPACTACION'
  }
  if (trace.traceStatus === 'LEGACY_EXCLUSION_OTRA') {
    return 'REVISAR_EXCLUSION_LEGACY'
  }
  return triage.defaultAction
}

function toWorkpackRow(item = {}, triage = {}, traceIndex = new Map()) {
  const legacy = firstLegacyMatch(item)
  const trace = traceIndex.get(clean(item.caseId)) ?? {}

  return {
    decision: decisionFromTrace(item, triage, trace),
    opciones_decision: triage.decisionOptions,
    case_id: item.caseId,
    carril: item.legacy?.status,
    carrera: item.mesa?.carrera,
    materia_codigo: item.mesa?.materiaCodigo,
    materia_nombre: item.mesa?.materiaNombre,
    llamado: item.mesa?.llamado,
    titular_nuevo: item.mesa?.titular,
    vocal_1_nuevo: item.mesa?.vocal1,
    vocal_2_nuevo: item.mesa?.vocal2,
    intentos_fecha_turno: item.attemptedSlots,
    intentos_superposicion: item.superpositionAttempts,
    titular_no_disponible: item.issueCounts?.TITULAR_NO_DISPONIBLE ?? 0,
    vocal_no_disponible: item.issueCounts?.VOCAL_NO_DISPONIBLE ?? 0,
    docente_superpuesto: item.issueCounts?.DOCENTE_SUPERPUESTO ?? 0,
    docentes_bloqueantes: uniqueLabels(item.blockingTeachers, (teacher) => teacher.docente),
    mesas_bloqueantes: uniqueLabels(item.blockingMesas, (mesa) => `${mesa.carrera} - ${mesa.materiaCodigo || mesa.materiaNombre}`),
    legacy_fecha: legacy.fecha,
    legacy_titular: legacy.titular,
    legacy_vocales: asArray(legacy.vocales),
    legacy_carrera: legacy.carrera,
    legacy_materia: legacy.materia || legacy.nombreMateria,
    legacy_tribunal_incompleto: legacy.tribunalIncompleto === true ? 'SI' : (clean(legacy.id) ? 'NO' : ''),
    legacy_compactada: legacy.compactada === true ? 'SI' : (clean(legacy.id) ? 'NO' : ''),
    legacy_trace_status: trace.traceStatus,
    legacy_trace_reason: trace.traceReason,
    legacy_trace_count: trace.traceCount,
    decision_sugerida_trace: trace.suggestedDecision,
    recomendacion_tecnica: item.recommendation,
    observacion_revision: '',
  }
}

function countBy(items = [], picker = (item) => item) {
  return items.reduce((counts, item) => {
    const key = clean(picker(item)) || 'SIN_DATO'
    counts[key] = (counts[key] ?? 0) + 1
    return counts
  }, {})
}

function topEntries(counts = {}, limit = 12) {
  return Object.entries(counts)
    .map(([key, count]) => ({ key, count }))
    .sort((left, right) => right.count - left.count || left.key.localeCompare(right.key))
    .slice(0, limit)
}

function summarizeWorkpack(groups = new Map(), outputs = {}) {
  const rows = Object.entries(TRIAGE_FILES).map(([status, triage]) => ({
    carril: status,
    cantidad: asArray(groups.get(status)).length,
    decision_default: triage.defaultAction,
    opciones_decision: triage.decisionOptions,
    archivo: outputs[status] ?? '',
  }))

  return {
    totalCases: [...groups.values()].reduce((total, items) => total + items.length, 0),
    groups: rows,
    outputs,
  }
}

function buildReadme({ summary = {}, auditPath = '', tracePath = '' } = {}) {
  return `${[
    '# Workpack DOCENTE_SUPERPUESTO',
    '',
    'Este paquete es local y read-only respecto de la app/Supabase. Sale del diagnostico de pendientes por superposicion docente.',
    '',
    `Fuente: \`${auditPath}\``,
    tracePath ? `Trazas legacy del carril sin equivalente: \`${tracePath}\`` : 'Trazas legacy del carril sin equivalente: no cargadas',
    '',
    '## Carriles',
    '',
    ...summary.groups.map((group) => [
      `### ${group.carril}`,
      '',
      `- Casos: ${group.cantidad}`,
      `- Archivo: \`${group.archivo}\``,
      `- Decision default: \`${group.decision_default}\``,
      `- Opciones: \`${group.opciones_decision}\``,
      '',
    ].join('\n')),
    '## Como usarlo',
    '',
    '- Revisar la columna `decision` y cambiarla solo cuando haya validacion institucional.',
    '- Completar `observacion_revision` cuando la decision no sea obvia.',
    '- No portar compactaciones legacy automaticamente: las filas compactadas necesitan `plan_id`/identidad canonica antes de transformarse en regla.',
    '- El carril sin equivalente legacy significa sin equivalente en el cronograma final. Si hay trazas de exclusiones legacy, no asumir que la materia no requiere mesa.',
    '- Para el carril sin equivalente, revisar primero `legacy_trace_status` y `legacy_trace_reason`: la mayoria de los casos puede venir de correlatividades o matching de compactacion.',
    '',
  ].join('\n')}\n`
}

function buildConsoleSummary(summary = {}, extra = {}) {
  return {
    totalCases: summary.totalCases,
    groups: summary.groups.map((group) => ({
      carril: group.carril,
      cantidad: group.cantidad,
      archivo: group.archivo,
    })),
    topBlockingTeachers: extra.topBlockingTeachers,
    workpackDir: toRepoPath(WORKPACK_DIR),
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  const auditPath = resolveInputPath(args.audit)
  const tracePath = resolveTracePath(args.trace)

  if (!existsSync(auditPath)) {
    fail(`No existe ${toRepoPath(auditPath)}. Ejecuta primero diagnoseDocenteSuperpuestoPending.mjs.`)
    return
  }

  try {
    mkdirSync(WORKPACK_DIR, { recursive: true })
    const audit = readJsonFile(auditPath)
    const traceReport = existsSync(tracePath) ? readJsonFile(tracePath) : null
    const traceIndex = traceReport ? buildTraceIndex(traceReport) : new Map()
    const cases = asArray(audit.cases)
    const groups = groupCases(cases)
    const outputs = {}

    Object.entries(TRIAGE_FILES).forEach(([status, triage]) => {
      const filePath = resolve(WORKPACK_DIR, triage.fileName)
      const rows = asArray(groups.get(status)).map((item) => toWorkpackRow(item, triage, traceIndex))
      writeCsv(filePath, WORKPACK_COLUMNS, rows)
      outputs[status] = toRepoPath(filePath)
    })

    const summary = summarizeWorkpack(groups, outputs)
    const summaryCsvPath = resolve(WORKPACK_DIR, '00_resumen.csv')
    const summaryJsonPath = resolve(WORKPACK_DIR, 'workpack_summary.json')
    const readmePath = resolve(WORKPACK_DIR, 'README_revision.md')
    const topBlockingTeachers = topEntries(countBy(
      cases.flatMap((item) => asArray(item.blockingTeachers)),
      (teacher) => teacher.docente,
    ), 12)

    writeCsv(summaryCsvPath, SUMMARY_COLUMNS, summary.groups)
    writeJson(summaryJsonPath, {
      source: {
        audit: toRepoPath(auditPath),
        legacyTrace: traceReport
          ? {
              source: toRepoPath(tracePath),
              cases: traceIndex.size,
            }
          : null,
        generatedAt: new Date().toISOString(),
        readOnly: true,
      },
      ...summary,
      topBlockingTeachers,
      nextActions: [
        'Validar institucionalmente las decisiones en los CSV.',
        'Revisar primero las trazas legacy del carril sin equivalente final.',
        'Luego decidir si se acepta tribunal incompleto con revision manual.',
        'Portar compactaciones solo despues de tener identidad canonica/plan_id suficiente.',
      ],
    })
    writeFileSync(readmePath, buildReadme({
      summary: {
        ...summary,
        groups: summary.groups.map((group) => ({
          ...group,
          archivo: group.archivo,
        })),
      },
      auditPath: toRepoPath(auditPath),
      tracePath: traceReport ? toRepoPath(tracePath) : '',
    }), 'utf8')

    console.log(JSON.stringify(buildConsoleSummary(summary, { topBlockingTeachers }), null, 2))
  } catch (error) {
    fail(error instanceof Error ? error.message : 'No se pudo construir el workpack.')
  }
}

main()
