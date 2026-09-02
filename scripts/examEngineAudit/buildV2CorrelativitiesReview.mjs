import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildV2CorrelativitiesReview } from '../../src/utils/examEngine/audit/buildV2CorrelativitiesReview.js'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(SCRIPT_DIR, '../..')
const LOCAL_AUDIT_DIR = resolve(REPO_ROOT, 'local-audit')
const SNAPSHOT_INPUT_PATH = resolve(LOCAL_AUDIT_DIR, 'workspaceSnapshot.real.local.json')
const SUBJECT_CODE_REVIEW_INPUT_PATH = resolve(LOCAL_AUDIT_DIR, 'v2-subject-code-review', 'v2_subject_code_review.json')
const OUTPUT_DIR = resolve(LOCAL_AUDIT_DIR, 'v2-correlativities-review')

const CAREER_OUTPUT_ORDER = ['ING', 'GEO', 'QUI', 'LAB', 'TUR', 'TRA', 'UNKNOWN']

export const CORRELATIVITIES_REVIEW_COLUMNS = [
  'review_id',
  'correlatividad_id',
  'carrera',
  'carrera_id_legacy',
  'posterior_materia_nombre',
  'posterior_materia_codigo_legacy',
  'posterior_plan_id_final',
  'posterior_materia_codigo_borrador',
  'posterior_materia_codigo_final',
  'posterior_estado_revision_codigo',
  'previa_materia_nombre',
  'previa_materia_codigo_legacy',
  'previa_plan_id_final',
  'previa_materia_codigo_borrador',
  'previa_materia_codigo_final',
  'previa_estado_revision_codigo',
  'estado_revision',
  'bloqueado_por_codigo_pendiente',
  'riesgo_plan_distinto',
  'riesgo_autorreferencia',
  'prioridad_revision',
  'motivo_revision',
  'accion_requerida',
  'observaciones_revision',
]

const SUMMARY_COLUMNS = [
  'grupo',
  'total_vinculos',
  'resueltos',
  'bloqueados_por_codigo_pendiente',
  'riesgo_plan_distinto',
  'prioridad_alta',
  'accion',
]

function fail(message) {
  console.error(`[v2 correlativities review] ${message}`)
  process.exitCode = 1
}

function clean(value) {
  return String(value ?? '').trim()
}

function csvEscape(value) {
  const text = String(value ?? '')
  if (!/[",\n\r;]/.test(text)) return text
  return `"${text.replaceAll('"', '""')}"`
}

function rowsToCsv(rows = [], columns = []) {
  return `${[
    columns.join(','),
    ...rows.map((row) => columns.map((column) => csvEscape(row[column])).join(',')),
  ].join('\n')}\n`
}

function writeJson(filePath, value) {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'))
}

function countRows(rows = [], predicate) {
  return rows.filter(predicate).length
}

function buildSummaryRows(result = {}) {
  const rowsByCareer = result.rowsByCareer ?? {}
  const rowsForCareer = (careerId) => rowsByCareer[careerId] ?? []

  const careerRows = CAREER_OUTPUT_ORDER
    .filter((careerId) => rowsForCareer(careerId).length > 0 || !['LAB', 'UNKNOWN'].includes(careerId))
    .map((careerId) => {
      const rows = rowsForCareer(careerId)
      return {
        grupo: careerId,
        total_vinculos: rows.length,
        resueltos: countRows(rows, (row) => row.bloqueado_por_codigo_pendiente === 'NO' && row.riesgo_plan_distinto === 'NO'),
        bloqueados_por_codigo_pendiente: countRows(rows, (row) => row.bloqueado_por_codigo_pendiente === 'SI'),
        riesgo_plan_distinto: countRows(rows, (row) => row.riesgo_plan_distinto === 'SI'),
        prioridad_alta: countRows(rows, (row) => row.prioridad_revision === 'ALTA'),
        accion: rows.length ? 'REVISAR_Y_CONFIRMAR_CORRELATIVIDAD' : 'SIN_FILAS',
      }
    })

  return [
    {
      grupo: 'TOTAL',
      total_vinculos: result.summary?.totalLinks ?? 0,
      resueltos: result.summary?.linksResolved ?? 0,
      bloqueados_por_codigo_pendiente: result.summary?.linksBlockedByPendingCode ?? 0,
      riesgo_plan_distinto: result.summary?.linksWithPlanMismatch ?? 0,
      prioridad_alta: result.summary?.highPriorityLinks ?? 0,
      accion: result.summary?.nextAction ?? '',
    },
    ...careerRows,
  ]
}

function buildReadme() {
  return [
    '# Confirmacion institucional de correlatividades v2',
    '',
    'Cada fila de este paquete es un vinculo de correlatividad: una materia "posterior" que requiere que una materia',
    '"previa" este aprobada dentro de la misma carrera. Esta revision cruza `correlatividades` (codigos legados)',
    'con `planesEstudio` (para obtener el nombre oficial de cada materia) y con la revision de',
    '`v2-subject-code-review` (para obtener `plan_id_final` y `materia_codigo_final` de cada materia).',
    '',
    'Por eso esta revision depende de que `v2-subject-code-review` este resuelta: mientras una materia no tenga',
    '`materia_codigo_final` confirmado alli, el vinculo que la usa (como posterior o como previa) queda',
    '`bloqueado_por_codigo_pendiente = SI` aca.',
    '',
    '## Columnas clave',
    '',
    '- `posterior_materia_codigo_final` / `previa_materia_codigo_final`: codigo v2 final de cada materia, tomado',
    '  de `v2-subject-code-review`. Si esta vacio, esa materia todavia no fue confirmada alli.',
    '- `bloqueado_por_codigo_pendiente`: `SI` si a la posterior o a la previa le falta `materia_codigo_final`.',
    '- `riesgo_plan_distinto`: `SI` si la posterior y la previa resolvieron a distinto `plan_id_final`. Puede',
    '  indicar un problema de datos, ya que las correlatividades deberian darse dentro del mismo plan.',
    '- `motivo_revision`: lista de motivos tecnicos separados por `|` (por ejemplo, materia no encontrada en',
    '  `planesEstudio` para esa carrera, lo que puede pasar si el nombre de la carrera no coincide exactamente',
    '  entre `correlatividades` y `planesEstudio`).',
    '- `estado_revision`: arranca en `PENDIENTE_CONFIRMACION`. Cambiar a `CONFIRMADO` solo cuando una persona',
    '  valide institucionalmente el vinculo.',
    '',
    '## Se puede revisar aunque este bloqueado',
    '',
    'Una fila bloqueada igual se puede leer, comentar en `observaciones_revision` o pre-confirmar si el vinculo',
    'en si es correcto (aunque el codigo final de la materia todavia no este). Pero mientras haya vinculos',
    'bloqueados, con riesgo de plan distinto, o sin `estado_revision = CONFIRMADO`, el paquete completo no se',
    'considera listo para aplicar (`readyForCorrelativitiesApply = false` en el resumen).',
    '',
    '## Fuera de alcance',
    '',
    'Las correlatividades de "Tecnico en Laboratorio" (planes 2015 y 2024) no se resuelven en este paquete:',
    'esa carrera todavia no tiene equivalencias 2015/2024 definidas institucionalmente. Esas filas van a',
    'aparecer bloqueadas o sin nombre de materia encontrado, igual que cualquier otra carrera sin resolver;',
    'no requieren un tratamiento especial en esta etapa.',
    '',
    '## Reglas de carga',
    '',
    '- No confirmar un vinculo (`estado_revision = CONFIRMADO`) si esta bloqueado o si tiene riesgo de plan distinto',
    '  sin explicar el motivo en `observaciones_revision`.',
    '- Revisar primero `01_bloqueadas_por_codigo_pendiente.csv` y despues las filas de prioridad alta dentro de',
    '  cada CSV por carrera.',
    '',
    '## Luego de confirmar',
    '',
    '1. Resolver `v2-subject-code-review` para las materias que todavia bloquean vinculos.',
    '2. Cambiar `estado_revision` a `CONFIRMADO` solo en los vinculos validados institucionalmente.',
    '3. Mergear/aplicar la revision de correlatividades.',
    '',
  ].join('\n')
}

function buildSummaryReport(result = {}) {
  return {
    ...(result.summary ?? {}),
    source: {
      snapshot: 'local-audit/workspaceSnapshot.real.local.json',
      subjectCodeReview: 'local-audit/v2-subject-code-review/v2_subject_code_review.json',
      readOnly: true,
    },
    outputs: {
      directory: 'local-audit/v2-correlativities-review/',
      summaryCsv: 'local-audit/v2-correlativities-review/00_resumen_correlatividades.csv',
      blockedCsv: 'local-audit/v2-correlativities-review/01_bloqueadas_por_codigo_pendiente.csv',
      reviewJson: 'local-audit/v2-correlativities-review/v2_correlativities_review.json',
      summaryJson: 'local-audit/v2-correlativities-review/v2_correlativities_review.summary.json',
      readme: 'local-audit/v2-correlativities-review/README_confirmacion_correlatividades.md',
    },
    summary: result.summary,
    recommendations: result.recommendations,
    warnings: result.warnings,
    errors: result.errors,
  }
}

function buildConsoleSummary(result = {}) {
  return {
    totalLinks: result.summary?.totalLinks,
    linksResolved: result.summary?.linksResolved,
    linksBlockedByPendingCode: result.summary?.linksBlockedByPendingCode,
    linksWithPlanMismatch: result.summary?.linksWithPlanMismatch,
    highPriorityLinks: result.summary?.highPriorityLinks,
    readyForCorrelativitiesApply: result.summary?.readyForCorrelativitiesApply,
    careerBreakdown: result.summary?.careerBreakdown,
    packagePath: 'local-audit/v2-correlativities-review/',
  }
}

function writeCareerFiles(result = {}) {
  CAREER_OUTPUT_ORDER.forEach((careerId) => {
    const rows = result.rowsByCareer?.[careerId] ?? []
    if (!rows.length && ['LAB', 'UNKNOWN'].includes(careerId)) return
    writeFileSync(
      resolve(OUTPUT_DIR, `${careerId}_correlatividades.csv`),
      rowsToCsv(rows, CORRELATIVITIES_REVIEW_COLUMNS),
      'utf8',
    )
  })
}

function main() {
  if (!existsSync(SNAPSHOT_INPUT_PATH)) {
    fail('No existe local-audit/workspaceSnapshot.real.local.json. Copia el snapshot real antes de ejecutar este script.')
    return
  }
  if (!existsSync(SUBJECT_CODE_REVIEW_INPUT_PATH)) {
    fail('No existe local-audit/v2-subject-code-review/v2_subject_code_review.json. Ejecuta primero buildV2SubjectCodeReview.mjs.')
    return
  }

  try {
    const snapshot = readJson(SNAPSHOT_INPUT_PATH)
    const subjectCodeReview = readJson(SUBJECT_CODE_REVIEW_INPUT_PATH)

    const result = buildV2CorrelativitiesReview({
      correlatividades: snapshot.correlatividades ?? [],
      planesEstudio: snapshot.planesEstudio ?? [],
      subjectCodeReviewRows: subjectCodeReview.reviewRows ?? [],
    })

    mkdirSync(OUTPUT_DIR, { recursive: true })
    writeFileSync(
      resolve(OUTPUT_DIR, '00_resumen_correlatividades.csv'),
      rowsToCsv(buildSummaryRows(result), SUMMARY_COLUMNS),
      'utf8',
    )
    writeFileSync(
      resolve(OUTPUT_DIR, '01_bloqueadas_por_codigo_pendiente.csv'),
      rowsToCsv(result.blockedRows, CORRELATIVITIES_REVIEW_COLUMNS),
      'utf8',
    )
    writeCareerFiles(result)
    writeJson(resolve(OUTPUT_DIR, 'v2_correlativities_review.json'), {
      reviewRows: result.reviewRows,
      rowsByCareer: result.rowsByCareer,
      blockedRows: result.blockedRows,
      priorityRows: result.priorityRows,
      recommendations: result.recommendations,
    })
    writeJson(resolve(OUTPUT_DIR, 'v2_correlativities_review.summary.json'), buildSummaryReport(result))
    writeFileSync(resolve(OUTPUT_DIR, 'README_confirmacion_correlatividades.md'), buildReadme(), 'utf8')

    console.log(JSON.stringify(buildConsoleSummary(result), null, 2))
    if ((result.warnings ?? []).length) {
      console.log(`[v2 correlativities review] ${result.warnings.length} advertencias. Ver v2_correlativities_review.summary.json.`)
    }
  } catch (error) {
    fail(error instanceof Error ? error.message : 'No se pudo generar el paquete de revision de correlatividades v2.')
  }
}

main()
