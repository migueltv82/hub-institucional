import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(SCRIPT_DIR, '../..')
const LOCAL_AUDIT_DIR = resolve(REPO_ROOT, 'local-audit')
const PENDING_INPUT_PATH = resolve(LOCAL_AUDIT_DIR, 'docente_materia.corrected.pending.json')
const REVIEW_INPUT_PATH = resolve(LOCAL_AUDIT_DIR, 'docente_materia.review.json')
const REPORT_OUTPUT_PATH = resolve(LOCAL_AUDIT_DIR, 'docente_materia.pending_review_report.json')

const showNames = process.argv.includes('--show-names')

function fail(message) {
  console.error(`[docente_materia pending] ${message}`)
  process.exitCode = 1
}

function readJsonFile(filePath) {
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'))
  } catch (error) {
    throw new Error(`No se pudo leer JSON local: ${error instanceof Error ? error.message : error}`)
  }
}

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function clean(value) {
  return String(value ?? '').trim()
}

function normalizeType(value) {
  return clean(value).toUpperCase() || 'OTRO'
}

function splitDetectedTeachers(value) {
  return clean(value)
    .split('|')
    .map(clean)
    .filter(Boolean)
}

function isOrphan(item = {}) {
  return normalizeType(item.tipo_revision) === 'HORARIO_HUERFANO'
}

function detectTeacherCount(review = {}) {
  const explicitCount = Number(review.cantidad_docentes_detectados)
  if (Number.isFinite(explicitCount) && explicitCount >= 0) return explicitCount
  return splitDetectedTeachers(review.docentes_detectados).length
}

function actionForPending(item = {}) {
  const type = normalizeType(item.tipo_revision)
  if (type === 'PRACTICA_PROFESIONAL_MULTIDOCENTE') {
    return 'Completar titular_a_confirmar con el docente que actuara como TITULAR de mesa.'
  }
  if (type === 'MULTIDOCENTE_NO_PRACTICA') {
    return 'Completar titular_a_confirmar con el unico TITULAR institucional de la materia.'
  }
  if (type === 'HORARIO_HUERFANO') {
    return 'Revisar carrera/materia en las plantillas fuente; no se aplica automaticamente.'
  }
  if (type === 'SIN_TITULAR_VIGENTE') {
    return 'Cargar TITULAR activo o REEMPLAZO activo vigente antes de comparar impacto.'
  }
  if (type === 'AMBIGUO_REQUIERE_REVISION') {
    return 'Resolver la ambiguedad y dejar un unico titular vigente para mesa.'
  }
  return 'Revisar manualmente la fila antes de generar docente_materia.corrected.'
}

function reviewRowsFromPayload(payload = {}) {
  if (Array.isArray(payload)) return payload
  return asArray(payload.reviewRows)
}

function buildReviewIndex(reviewRows = []) {
  return reviewRows.reduce((index, row) => {
    const reviewId = clean(row.review_id)
    if (reviewId) index.set(reviewId, row)
    return index
  }, new Map())
}

function buildPendingRecord(pending = {}, review = {}) {
  const base = {
    review_id: clean(pending.review_id ?? review.review_id),
    carrera: clean(pending.carrera ?? review.carrera),
    anio: clean(pending.anio ?? review.anio),
    materia_codigo: clean(pending.materia_codigo ?? review.materia_codigo),
    materia_nombre: clean(pending.materia_nombre ?? review.materia_nombre),
    tipo_revision: normalizeType(pending.tipo_revision ?? review.tipo_revision),
    motivo_revision: clean(review.motivo_revision ?? pending.reason),
    cantidad_docentes_detectados: detectTeacherCount(review),
    accion_necesaria: actionForPending(pending),
  }

  if (showNames) {
    return {
      ...base,
      docentes_detectados: splitDetectedTeachers(review.docentes_detectados),
    }
  }

  return base
}

function buildReport({ pendingPayload, reviewPayload }) {
  const pendingItems = asArray(pendingPayload.pendingReviewItems)
  const reviewIndex = buildReviewIndex(reviewRowsFromPayload(reviewPayload))
  const operationalItems = pendingItems.map((pending) => (
    buildPendingRecord(pending, reviewIndex.get(clean(pending.review_id)) ?? {})
  ))
  const pendingSubjects = operationalItems.filter((item) => !isOrphan(item))
  const orphanHorarios = operationalItems.filter(isOrphan)
  const nextActions = [
    'Abrir local-audit/docente_materia.review.csv.',
    'Completar titular_a_confirmar en cada materia que requiere titular, copiando exactamente uno de los docentes detectados.',
    'Para ver nombres desde la consola local, ejecutar este script con --show-names.',
    'Revisar los horarios huerfanos en las plantillas fuente; este script no los corrige automaticamente.',
    'Volver a ejecutar node scripts/examEngineAudit/applyDocenteMateriaReview.mjs.',
    'Si readyForImpactComparison queda true, ejecutar la comparacion de impacto con docente_materia.corrected.',
  ]
  const sourceSummary = pendingPayload.summary ?? {}
  const summary = {
    subjectsRequiringTitular: pendingSubjects.length,
    orphanHorarios: orphanHorarios.length,
    totalPending: operationalItems.length,
    appliedReviewItems: Number(sourceSummary.appliedReviewItems ?? 0),
    titularesConfirmados: Number(sourceSummary.titularesConfirmados ?? 0),
    assignmentErrors: Number(sourceSummary.assignmentErrors ?? 0),
    readyForImpactComparison: sourceSummary.readyForImpactComparison === true,
    showNames,
    generatedReport: 'local-audit/docente_materia.pending_review_report.json',
  }

  return {
    pendingSubjects,
    orphanHorarios,
    summary,
    nextActions,
  }
}

function buildConsolePayload(report = {}) {
  return {
    summary: report.summary,
    pendingItems: [
      ...report.pendingSubjects,
      ...report.orphanHorarios,
    ],
    nextActions: report.nextActions,
  }
}

function main() {
  if (!existsSync(PENDING_INPUT_PATH)) {
    fail('No existe local-audit/docente_materia.corrected.pending.json. Ejecuta primero applyDocenteMateriaReview.mjs.')
    return
  }

  if (!existsSync(REVIEW_INPUT_PATH)) {
    fail('No existe local-audit/docente_materia.review.json. Ejecuta primero buildDocenteMateriaReviewPack.mjs.')
    return
  }

  try {
    mkdirSync(LOCAL_AUDIT_DIR, { recursive: true })

    const pendingPayload = readJsonFile(PENDING_INPUT_PATH)
    const reviewPayload = readJsonFile(REVIEW_INPUT_PATH)
    const report = buildReport({ pendingPayload, reviewPayload })

    writeFileSync(REPORT_OUTPUT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8')

    console.log(JSON.stringify(buildConsolePayload(report), null, 2))
  } catch (error) {
    fail(error instanceof Error ? error.message : 'No se pudo imprimir el resumen de pendientes.')
  }
}

main()
