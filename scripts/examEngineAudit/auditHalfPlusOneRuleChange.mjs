import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { auditHalfPlusOneRuleChange } from '../../src/utils/examEngine/audit/auditHalfPlusOneRuleChange.js'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const ROOT_DIR = resolve(SCRIPT_DIR, '../..')
const LOCAL_AUDIT_DIR = resolve(ROOT_DIR, 'local-audit')
const SNAPSHOT_PATH = resolve(LOCAL_AUDIT_DIR, 'workspaceSnapshot.real.local.json')
const FULL_REPORT_PATH = resolve(LOCAL_AUDIT_DIR, 'half_plus_one_rule_change_audit.json')
const SUMMARY_PATH = resolve(LOCAL_AUDIT_DIR, 'half_plus_one_rule_change_audit.summary.json')
const CSV_PATH = resolve(LOCAL_AUDIT_DIR, 'half_plus_one_teacher_comparison.csv')

const CSV_COLUMNS = [
  'teacherAnonId',
  'teachingHours',
  'teachingHoursSource',
  'attendanceDays',
  'legacyDaysBasedLimit',
  'teachingHoursBasedLimit',
  'difference',
  'capacityChange',
  'missingTeachingHours',
  'missingAttendanceDays',
  'blockedByAttendance',
  'dailyAttendanceStillRequired',
]

function csvCell(value) {
  const text = String(value ?? '')
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

function rowsToCsv(rows = []) {
  return [
    CSV_COLUMNS.join(','),
    ...rows.map((row) => CSV_COLUMNS.map((column) => csvCell(row[column])).join(',')),
  ].join('\n')
}

function readSnapshot() {
  if (!existsSync(SNAPSHOT_PATH)) {
    throw new Error('No existe local-audit/workspaceSnapshot.real.local.json')
  }
  return JSON.parse(readFileSync(SNAPSHOT_PATH, 'utf8'))
}

function printSafeSummary(report) {
  const summary = report.summary
  console.log('Auditoria cambio mitad mas uno')
  console.log(`- total docentes analizados: ${summary.totalTeachers}`)
  console.log(`- capacidad aumentada: ${summary.increasedCapacityTeachers}`)
  console.log(`- capacidad disminuida: ${summary.decreasedCapacityTeachers}`)
  console.log(`- sin cambio: ${summary.unchangedCapacityTeachers}`)
  console.log(`- sin horas catedra detectables: ${summary.teachersWithoutTeachingHours}`)
  console.log(`- sin dias de asistencia detectables: ${summary.teachersWithoutAttendanceDays}`)
  console.log(`- capacidad anterior por llamado: ${summary.legacyTotalCapacityPerCall}`)
  console.log(`- capacidad nueva por llamado: ${summary.teachingHoursTotalCapacityPerCall}`)
  console.log(`- fuente: ${summary.teachingHoursSource}`)
  console.log(`- recomendacion: ${summary.recommendation}`)
  console.log('- no se imprimieron nombres completos ni payload del snapshot')
}

function main() {
  mkdirSync(LOCAL_AUDIT_DIR, { recursive: true })
  const snapshot = readSnapshot()
  const report = auditHalfPlusOneRuleChange({ snapshot })
  const summaryReport = {
    summary: report.summary,
    templateDiagnostics: report.templateDiagnostics,
    recommendations: report.recommendations,
    warnings: report.warnings,
    errors: report.errors,
    outputs: {
      fullReport: 'local-audit/half_plus_one_rule_change_audit.json',
      summary: 'local-audit/half_plus_one_rule_change_audit.summary.json',
      teacherComparison: 'local-audit/half_plus_one_teacher_comparison.csv',
    },
  }

  writeFileSync(FULL_REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  writeFileSync(SUMMARY_PATH, `${JSON.stringify(summaryReport, null, 2)}\n`, 'utf8')
  writeFileSync(CSV_PATH, `${rowsToCsv(report.teacherComparisons)}\n`, 'utf8')
  printSafeSummary(report)

  if (report.errors.length) process.exitCode = 1
}

try {
  main()
} catch (error) {
  console.error(`No se pudo ejecutar la auditoria: ${error instanceof Error ? error.message : 'error desconocido'}`)
  process.exitCode = 1
}
