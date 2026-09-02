import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  EXAM_GENERATION_ENGINE,
  generateCronogramaFromWorkspace,
} from '../../src/services/examGenerationEngine.js'
import { buildRegularExamInputFromWorkspaceSnapshot } from '../../src/utils/examEngine/comparison/buildRegularExamInputFromWorkspaceSnapshot.js'
import { generateRegularExamPlan } from '../../src/utils/examEngine/planning/generateRegular.js'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(SCRIPT_DIR, '../..')
const LOCAL_AUDIT_DIR = resolve(REPO_ROOT, 'local-audit')
const DEFAULT_SNAPSHOT_PATH = resolve(LOCAL_AUDIT_DIR, 'workspaceSnapshot.real.local.json')
const DOCENTE_MATERIA_CORRECTED_PATH = resolve(LOCAL_AUDIT_DIR, 'docente_materia.corrected.json')
const REPORT_OUTPUT_PATH = resolve(LOCAL_AUDIT_DIR, 'docente_superpuesto_pending_audit.json')
const SUMMARY_OUTPUT_PATH = resolve(LOCAL_AUDIT_DIR, 'docente_superpuesto_pending_audit.summary.json')
const CASES_OUTPUT_PATH = resolve(LOCAL_AUDIT_DIR, 'docente_superpuesto_pending_cases.csv')
const CONFLICTS_OUTPUT_PATH = resolve(LOCAL_AUDIT_DIR, 'docente_superpuesto_pending_conflicts.csv')
const MARKDOWN_OUTPUT_PATH = resolve(LOCAL_AUDIT_DIR, 'docente_superpuesto_pending_audit.md')

const CSV_CASE_COLUMNS = [
  'case_id',
  'carrera',
  'materia_codigo',
  'materia_nombre',
  'llamado',
  'titular',
  'vocal_1',
  'vocal_2',
  'intentos_fecha_turno',
  'intentos_con_superposicion',
  'docentes_bloqueantes',
  'mesas_bloqueantes',
  'legacy_estado',
  'legacy_fecha',
  'legacy_titular',
  'legacy_vocales',
  'recomendacion',
]

const CSV_CONFLICT_COLUMNS = [
  'case_id',
  'carrera',
  'materia_codigo',
  'materia_nombre',
  'llamado',
  'docente_bloqueante',
  'rol_bloqueado',
  'fecha',
  'turno',
  'mesa_bloqueante_carrera',
  'mesa_bloqueante_materia',
  'mesa_bloqueante_titular',
  'mesa_bloqueante_vocales',
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
  ['special', 'LLAMADO_ESPECIAL'],
  ['especial', 'LLAMADO_ESPECIAL'],
  ['llamado especial', 'LLAMADO_ESPECIAL'],
  ['llamado_especial', 'LLAMADO_ESPECIAL'],
  ['LLAMADO_ESPECIAL', 'LLAMADO_ESPECIAL'],
])

function fail(message) {
  console.error(`[docente superpuesto pending audit] ${message}`)
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

function normalizeTurno(value) {
  return normalizeText(value).toUpperCase()
}

function firstValue(...values) {
  return values.find((value) => value !== undefined && value !== null && clean(value) !== '')
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
  if (!requested) return DEFAULT_SNAPSHOT_PATH
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
  const fixes = []
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
      fixes.push('regularCallRanges.callCount=1 porque solo el primer llamado tiene rango completo')
    }
  }

  return { snapshot: normalized, fixes }
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

function splitParts(value) {
  return clean(value).split('/').map(clean).filter(Boolean)
}

function scheduleKey(docenteId = '', fecha = '', turno = '') {
  return [normalizeText(docenteId), clean(fecha), normalizeTurno(turno)].join('::')
}

function getTeacherLabel(teacher = {}) {
  if (typeof teacher === 'string') return clean(teacher)

  return clean(firstValue(
    teacher.nombre,
    teacher.full_name,
    teacher.fullName,
    teacher.display_name,
    teacher.displayName,
    [teacher.nombre, teacher.apellido].filter(Boolean).join(' '),
    teacher.id,
  ))
}

function buildTeacherMap(docentes = []) {
  return docentes.reduce((map, teacher) => {
    const label = getTeacherLabel(teacher)
    ;[
      teacher.id,
      teacher.docenteId,
      teacher.teacherKey,
      teacher.dni,
      teacher.email,
      teacher.nombre,
      teacher.full_name,
      teacher.fullName,
      label,
    ].map(clean).filter(Boolean).forEach((key) => {
      map.set(normalizeText(key), {
        ...teacher,
        label,
      })
    })
    return map
  }, new Map())
}

function buildSubjectMap(materias = []) {
  return materias.reduce((map, subject) => {
    ;[
      subject.id,
      subject.materiaId,
      subject.codigo,
      subject.materia,
      subject.nombreMateria,
    ].map(clean).filter(Boolean).forEach((key) => {
      map.set(normalizeText(key), subject)
    })
    return map
  }, new Map())
}

function getTeacherName(teacherMap, docenteId = '', fallback = '') {
  return teacherMap.get(normalizeText(docenteId))?.label || clean(fallback) || clean(docenteId)
}

function getSubject(subjectMap, mesa = {}) {
  return subjectMap.get(normalizeText(mesa.materiaId)) ??
    subjectMap.get(normalizeText(mesa.id)) ??
    subjectMap.get(normalizeText(mesa.materia)) ??
    subjectMap.get(normalizeText(mesa.nombreMateria)) ??
    {}
}

function describeMesaSubject(mesa = {}, subjectMap = new Map()) {
  const subject = getSubject(subjectMap, mesa)

  return {
    carrera: clean(firstValue(subject.carrera, mesa.carrera, mesa.carreraId)),
    codigo: clean(firstValue(subject.codigo, subject.materia, mesa.codigo, mesa.materiaId, mesa.materia)),
    nombre: clean(firstValue(subject.nombreMateria, mesa.nombreMateria, mesa.materia, subject.codigo, mesa.materiaId)),
  }
}

function describeMesaSubjects(mesa = {}, subjectMap = new Map()) {
  if (asArray(mesa.materiasAgrupadas).length) {
    const grouped = asArray(mesa.materiasAgrupadas).map((subject) => describeMesaSubject({
      ...subject,
      carrera: subject.carrera || mesa.carrera,
      carreraId: subject.carreraId || mesa.carreraId,
    }, subjectMap))

    return {
      carrera: [...new Set(grouped.map((subject) => subject.carrera).filter(Boolean))].join(' / ') ||
        clean(firstValue(mesa.carrera, mesa.carreraId)),
      materiaCodigo: grouped.map((subject) => subject.codigo).filter(Boolean).join(' / '),
      materiaNombre: grouped.map((subject) => subject.nombre).filter(Boolean).join(' / '),
    }
  }

  const subject = describeMesaSubject(mesa, subjectMap)
  return {
    carrera: subject.carrera,
    materiaCodigo: subject.codigo,
    materiaNombre: subject.nombre,
  }
}

function describeMesa(mesa = {}, { teacherMap = new Map(), subjectMap = new Map() } = {}) {
  const subject = describeMesaSubjects(mesa, subjectMap)
  const titular = getTeacherName(teacherMap, mesa.titularId, mesa.titularNombre || mesa.profesorTitular)
  const vocal1 = getTeacherName(teacherMap, mesa.vocal1Id, mesa.vocal1Nombre || mesa.vocal1)
  const vocal2 = getTeacherName(teacherMap, mesa.vocal2Id, mesa.vocal2Nombre || mesa.vocal2)

  return {
    id: clean(mesa.id),
    carrera: subject.carrera,
    materiaCodigo: subject.materiaCodigo,
    materiaNombre: subject.materiaNombre,
    llamado: normalizeCall(firstValue(mesa.llamado, mesa.exam_call)),
    fecha: clean(firstValue(mesa.fechaIso, mesa.fecha)),
    turno: clean(mesa.turno),
    titular,
    vocal1,
    vocal2,
    docenteIds: {
      titular: clean(mesa.titularId),
      vocal1: clean(mesa.vocal1Id),
      vocal2: clean(mesa.vocal2Id),
    },
  }
}

function getMesaTeacherRoles(mesa = {}) {
  return [
    { rol: 'TITULAR', docenteId: mesa.titularId },
    { rol: 'VOCAL_1', docenteId: mesa.vocal1Id },
    { rol: 'VOCAL_2', docenteId: mesa.vocal2Id },
  ].filter((entry) => clean(entry.docenteId))
}

function buildPlannedScheduleIndex(plannedMesas = [], context = {}) {
  return plannedMesas.reduce((map, mesa) => {
    getMesaTeacherRoles(mesa).forEach(({ rol, docenteId }) => {
      const key = scheduleKey(docenteId, mesa.fechaIso || mesa.fecha, mesa.turno)
      const rows = map.get(key) ?? []
      rows.push({
        rol,
        docenteId,
        mesa: describeMesa(mesa, context),
      })
      map.set(key, rows)
    })
    return map
  }, new Map())
}

function getLegacyRows(legacyResult) {
  if (Array.isArray(legacyResult)) return legacyResult
  return asArray(legacyResult?.cronograma)
}

function legacyVocales(row = {}) {
  return [row.vocal1, row.vocal2].filter((vocal) => {
    const text = clean(vocal)
    return text && normalizeText(text) !== 'a designar'
  })
}

function isLegacyCompacted(row = {}) {
  return Boolean(row.compactada) ||
    splitParts(row.materia).length > 1 ||
    splitParts(row.carrera).length > 1 ||
    asArray(row.materiasAgrupadas).length > 1
}

function legacyHasIncompleteTribunal(row = {}) {
  const titular = normalizeText(row.profesorTitular)
  return !titular || titular === 'a designar' || legacyVocales(row).length < 2
}

function legacySubjects(row = {}) {
  const grouped = asArray(row.materiasAgrupadas).flatMap((subject) => [
    subject.materia,
    subject.materiaId,
    subject.codigo,
    subject.nombreMateria,
  ])
  return [
    ...splitParts(row.materia),
    ...splitParts(row.nombreMateria),
    ...grouped,
  ].map(clean).filter(Boolean)
}

function legacyCareers(row = {}) {
  const grouped = asArray(row.materiasAgrupadas).map((subject) => subject.carrera)
  return [
    ...splitParts(row.carrera),
    ...grouped,
  ].map(clean).filter(Boolean)
}

function legacyMatchKey(carrera = '', materia = '', llamado = '') {
  return [normalizeText(carrera), normalizeText(materia), normalizeCall(llamado)].join('::')
}

function buildLegacyIndex(legacyRows = []) {
  return legacyRows.reduce((map, row) => {
    const careers = legacyCareers(row)
    const subjects = legacySubjects(row)
    const llamado = normalizeCall(firstValue(row.exam_call, row.llamado))

    careers.forEach((career) => {
      subjects.forEach((subject) => {
        const key = legacyMatchKey(career, subject, llamado)
        const rows = map.get(key) ?? []
        rows.push(row)
        map.set(key, rows)
      })
    })
    return map
  }, new Map())
}

function findLegacyMatches(legacyIndex = new Map(), mesa = {}) {
  const keys = [
    legacyMatchKey(mesa.carrera, mesa.materiaCodigo, mesa.llamado),
    legacyMatchKey(mesa.carrera, mesa.materiaNombre, mesa.llamado),
  ]
  const matches = keys.flatMap((key) => legacyIndex.get(key) ?? [])
  const seen = new Set()

  return matches.filter((row) => {
    const key = clean(row.id) || JSON.stringify(row)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function describeLegacyRow(row = {}) {
  return {
    id: clean(row.id),
    carrera: clean(row.carrera),
    materia: clean(row.materia),
    nombreMateria: clean(row.nombreMateria),
    llamado: normalizeCall(firstValue(row.exam_call, row.llamado)),
    fecha: clean(firstValue(row.fechaIso, row.fecha)),
    turno: clean(row.turno || row.inicio),
    titular: clean(row.profesorTitular),
    vocales: legacyVocales(row),
    compactada: isLegacyCompacted(row),
    tribunalIncompleto: legacyHasIncompleteTribunal(row),
  }
}

function classifyLegacyEvidence(matches = []) {
  if (!matches.length) return 'LEGACY_SIN_EQUIVALENTE'
  if (matches.some(isLegacyCompacted)) return 'LEGACY_RESUELVE_COMPACTANDO'
  if (matches.some(legacyHasIncompleteTribunal)) return 'LEGACY_RESUELVE_CON_TRIBUNAL_INCOMPLETO'
  return 'LEGACY_RESUELVE_CON_MESA_SIMPLE'
}

function issueCounts(errors = []) {
  return errors.reduce((counts, error) => {
    const code = clean(error.code) || 'SIN_CODIGO'
    counts[code] = (counts[code] ?? 0) + 1
    return counts
  }, {})
}

function uniqueBy(items = [], keyFn = (item) => item) {
  const seen = new Set()
  const result = []

  items.forEach((item) => {
    const key = keyFn(item)
    if (seen.has(key)) return
    seen.add(key)
    result.push(item)
  })
  return result
}

function pickRecommendation({ legacyStatus = '', conflicts = [] } = {}) {
  const hasTitularConflict = conflicts.some((conflict) => conflict.rolBloqueado === 'TITULAR')
  if (legacyStatus === 'LEGACY_SIN_EQUIVALENTE') {
    return 'No aparece en cronograma final legacy; revisar exclusiones legacy antes de decidir requiere_mesa.'
  }
  if (legacyStatus === 'LEGACY_RESUELVE_COMPACTANDO') {
    return 'Revisar compactacion legacy con plan_id antes de portar la regla.'
  }
  if (legacyStatus === 'LEGACY_RESUELVE_CON_TRIBUNAL_INCOMPLETO') {
    return 'Decidir si se permite planificar con tribunal incompleto y revision manual.'
  }
  if (hasTitularConflict) {
    return 'Mover fecha o compactar: el titular es el docente bloqueado.'
  }
  return 'Probar re-seleccion de vocales/fecha para evitar superposicion.'
}

function buildCase({
  index,
  mesa = {},
  legacyIndex = new Map(),
  plannedSchedule = new Map(),
  context = {},
}) {
  const described = describeMesa(mesa, context)
  const superpositionErrors = asArray(mesa.errors).filter((error) => error.code === 'DOCENTE_SUPERPUESTO')
  const attemptedSlots = uniqueBy(asArray(mesa.errors), (error) => [
    clean(error.fecha),
    normalizeTurno(error.turno),
  ].join('::')).filter((error) => clean(error.fecha))
  const conflicts = uniqueBy(superpositionErrors.flatMap((error) => {
    const blockers = plannedSchedule.get(scheduleKey(error.docenteId, error.fecha, error.turno)) ?? []
    return blockers.map((blocker) => ({
      docenteId: clean(error.docenteId),
      docente: getTeacherName(context.teacherMap, error.docenteId),
      rolBloqueado: clean(error.rol),
      fecha: clean(error.fecha),
      turno: clean(error.turno),
      mesaBloqueante: blocker.mesa,
      rolEnMesaBloqueante: blocker.rol,
    }))
  }), (conflict) => [
    conflict.docenteId,
    conflict.fecha,
    normalizeTurno(conflict.turno),
    conflict.mesaBloqueante.id,
  ].join('::'))
  const legacyMatches = findLegacyMatches(legacyIndex, described)
  const legacyStatus = classifyLegacyEvidence(legacyMatches)
  const recommendation = pickRecommendation({ legacyStatus, conflicts })

  return {
    caseId: `DSP-${String(index + 1).padStart(4, '0')}`,
    mesa: described,
    reason: clean(mesa.reason),
    issueCounts: issueCounts(asArray(mesa.errors)),
    attemptedSlots: attemptedSlots.length,
    superpositionAttempts: superpositionErrors.length,
    blockingTeachers: uniqueBy(conflicts, (conflict) => conflict.docenteId).map((conflict) => ({
      docenteId: conflict.docenteId,
      docente: conflict.docente,
    })),
    blockingMesas: uniqueBy(conflicts, (conflict) => conflict.mesaBloqueante.id).map((conflict) => conflict.mesaBloqueante),
    conflicts,
    legacy: {
      status: legacyStatus,
      matches: legacyMatches.map(describeLegacyRow),
      compactedMatches: legacyMatches.filter(isLegacyCompacted).length,
      incompleteTribunalMatches: legacyMatches.filter(legacyHasIncompleteTribunal).length,
    },
    recommendation,
  }
}

function countBy(items = [], keyFn = (item) => item) {
  return items.reduce((counts, item) => {
    const key = clean(keyFn(item)) || 'SIN_DATO'
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

function summarizeCases({ cases = [], plan = {}, legacyRows = [], source = {} } = {}) {
  const conflicts = cases.flatMap((item) => item.conflicts)
  const legacyStatuses = countBy(cases, (item) => item.legacy.status)
  const blockingTeacherCounts = countBy(conflicts, (conflict) => conflict.docente)
  const blockingMesaCounts = countBy(conflicts, (conflict) => [
    conflict.mesaBloqueante.carrera,
    conflict.mesaBloqueante.materiaCodigo || conflict.mesaBloqueante.materiaNombre,
  ].join(' - '))
  const byCareer = countBy(cases, (item) => item.mesa.carrera)

  return {
    source,
    totals: {
      legacyMesas: legacyRows.length,
      examEnginePlanned: asArray(plan.plannedMesas).length,
      examEngineUnassigned: asArray(plan.unassignedMesas).length,
      docenteSuperpuestoPending: cases.length,
      superpositionAttempts: cases.reduce((total, item) => total + item.superpositionAttempts, 0),
      conflictsLinkedToPlannedMesas: conflicts.length,
      uniqueBlockingTeachers: new Set(conflicts.map((conflict) => conflict.docenteId).filter(Boolean)).size,
      uniqueBlockingMesas: new Set(conflicts.map((conflict) => conflict.mesaBloqueante.id).filter(Boolean)).size,
    },
    legacyStatuses,
    byCareer: topEntries(byCareer, 30),
    topBlockingTeachers: topEntries(blockingTeacherCounts, 30),
    topBlockingMesas: topEntries(blockingMesaCounts, 30),
    recommendations: [
      'No reemplazar legacy todavia.',
      'Revisar primero los docentes bloqueantes recurrentes y las mesas bloqueantes top.',
      'Separar casos que legacy resolvia con tribunal incompleto de casos que resolvia compactando.',
      'No portar compactaciones legacy sin plan_id y revision institucional.',
    ],
  }
}

function csvEscape(value) {
  const text = Array.isArray(value) ? value.join(' | ') : String(value ?? '')
  if (!/[",\n\r;]/.test(text)) return text
  return `"${text.replaceAll('"', '""')}"`
}

function casesToCsv(cases = []) {
  const rows = [
    CSV_CASE_COLUMNS.join(','),
    ...cases.map((item) => {
      const legacy = item.legacy.matches[0] ?? {}
      return CSV_CASE_COLUMNS.map((column) => {
        const values = {
          case_id: item.caseId,
          carrera: item.mesa.carrera,
          materia_codigo: item.mesa.materiaCodigo,
          materia_nombre: item.mesa.materiaNombre,
          llamado: item.mesa.llamado,
          titular: item.mesa.titular,
          vocal_1: item.mesa.vocal1,
          vocal_2: item.mesa.vocal2,
          intentos_fecha_turno: item.attemptedSlots,
          intentos_con_superposicion: item.superpositionAttempts,
          docentes_bloqueantes: item.blockingTeachers.map((teacher) => teacher.docente),
          mesas_bloqueantes: item.blockingMesas.map((mesa) => `${mesa.carrera} - ${mesa.materiaCodigo || mesa.materiaNombre}`),
          legacy_estado: item.legacy.status,
          legacy_fecha: legacy.fecha,
          legacy_titular: legacy.titular,
          legacy_vocales: legacy.vocales,
          recomendacion: item.recommendation,
        }
        return csvEscape(values[column])
      }).join(',')
    }),
  ]
  return `${rows.join('\n')}\n`
}

function conflictsToCsv(cases = []) {
  const rows = cases.flatMap((item) => item.conflicts.map((conflict) => ({
    case_id: item.caseId,
    carrera: item.mesa.carrera,
    materia_codigo: item.mesa.materiaCodigo,
    materia_nombre: item.mesa.materiaNombre,
    llamado: item.mesa.llamado,
    docente_bloqueante: conflict.docente,
    rol_bloqueado: conflict.rolBloqueado,
    fecha: conflict.fecha,
    turno: conflict.turno,
    mesa_bloqueante_carrera: conflict.mesaBloqueante.carrera,
    mesa_bloqueante_materia: conflict.mesaBloqueante.materiaCodigo || conflict.mesaBloqueante.materiaNombre,
    mesa_bloqueante_titular: conflict.mesaBloqueante.titular,
    mesa_bloqueante_vocales: [conflict.mesaBloqueante.vocal1, conflict.mesaBloqueante.vocal2].filter(Boolean),
  })))

  return `${[
    CSV_CONFLICT_COLUMNS.join(','),
    ...rows.map((row) => CSV_CONFLICT_COLUMNS.map((column) => csvEscape(row[column])).join(',')),
  ].join('\n')}\n`
}

function markdownList(entries = [], limit = 10) {
  if (!entries.length) return '- sin datos'
  return entries.slice(0, limit).map((entry) => `- ${entry.key}: ${entry.count}`).join('\n')
}

function buildMarkdown(summary = {}) {
  return `${[
    '# Auditoria DOCENTE_SUPERPUESTO',
    '',
    '## Decision',
    '',
    'No reemplazar legacy todavia. Este reporte identifica las mesas pendientes por superposicion docente y contra que agenda planificada chocan.',
    '',
    '## Totales',
    '',
    `- mesas legacy: ${summary.totals.legacyMesas}`,
    `- examEngine planificadas: ${summary.totals.examEnginePlanned}`,
    `- examEngine pendientes: ${summary.totals.examEngineUnassigned}`,
    `- pendientes DOCENTE_SUPERPUESTO: ${summary.totals.docenteSuperpuestoPending}`,
    `- intentos con superposicion: ${summary.totals.superpositionAttempts}`,
    `- conflictos vinculados a mesas planificadas: ${summary.totals.conflictsLinkedToPlannedMesas}`,
    `- docentes bloqueantes unicos: ${summary.totals.uniqueBlockingTeachers}`,
    `- mesas bloqueantes unicas: ${summary.totals.uniqueBlockingMesas}`,
    '',
    '## Como lo resolvia legacy',
    '',
    markdownList(topEntries(summary.legacyStatuses, 20), 20),
    '',
    '## Carreras mas afectadas',
    '',
    markdownList(summary.byCareer, 15),
    '',
    '## Docentes bloqueantes',
    '',
    markdownList(summary.topBlockingTeachers, 15),
    '',
    '## Mesas bloqueantes',
    '',
    markdownList(summary.topBlockingMesas, 15),
    '',
    '## Proximas acciones',
    '',
    ...summary.recommendations.map((item) => `- ${item}`),
    '',
  ].join('\n')}\n`
}

function buildConsoleSummary(summary = {}, outputs = {}) {
  return {
    totals: summary.totals,
    legacyStatuses: summary.legacyStatuses,
    topBlockingTeachers: summary.topBlockingTeachers.slice(0, 8),
    topBlockingMesas: summary.topBlockingMesas.slice(0, 8),
    outputs,
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  const snapshotPath = resolveInputPath(args.snapshot)

  if (!existsSync(snapshotPath)) {
    fail(`No existe ${toRepoPath(snapshotPath)}.`)
    return
  }

  try {
    mkdirSync(LOCAL_AUDIT_DIR, { recursive: true })
    const rawSnapshot = readJsonFile(snapshotPath)
    const { snapshot: normalizedSnapshotBase, fixes } = normalizeSnapshotForGeneration(rawSnapshot)
    const injected = injectDocenteMateriaCorrected(normalizedSnapshotBase)
    const snapshot = injected.snapshot
    const input = buildRegularExamInputFromWorkspaceSnapshot(snapshot)
    if (args.vocal_planning_mode) {
      input.options = {
        ...(input.options ?? {}),
        vocalPlanningMode: args.vocal_planning_mode,
      }
    }
    const plan = generateRegularExamPlan(input)
    const legacyResult = generateCronogramaFromWorkspace(cloneJson(snapshot), {
      engine: EXAM_GENERATION_ENGINE.LEGACY,
    })
    const teacherMap = buildTeacherMap(input.docentes)
    const subjectMap = buildSubjectMap(input.materias)
    const context = { teacherMap, subjectMap }
    const plannedSchedule = buildPlannedScheduleIndex(plan.plannedMesas, context)
    const legacyRows = getLegacyRows(legacyResult)
    const legacyIndex = buildLegacyIndex(legacyRows)
    const pending = asArray(plan.unassignedMesas).filter((mesa) => mesa.reason === 'DOCENTE_SUPERPUESTO')
    const cases = pending.map((mesa, index) => buildCase({
      index,
      mesa,
      legacyIndex,
      plannedSchedule,
      context,
    }))
    const outputs = {
      report: toRepoPath(REPORT_OUTPUT_PATH),
      summary: toRepoPath(SUMMARY_OUTPUT_PATH),
      markdown: toRepoPath(MARKDOWN_OUTPUT_PATH),
      casesCsv: toRepoPath(CASES_OUTPUT_PATH),
      conflictsCsv: toRepoPath(CONFLICTS_OUTPUT_PATH),
    }
    const source = {
      snapshot: toRepoPath(snapshotPath),
      readOnly: true,
      vocalPlanningMode: plan.metadata?.vocalPlanningMode,
      generatedAt: new Date().toISOString(),
      normalizedInMemory: fixes,
      docenteMateria: injected.source
        ? {
            source: injected.source,
            rows: injected.rows,
            injectedInMemory: true,
          }
        : null,
    }
    const summary = summarizeCases({
      cases,
      plan,
      legacyRows,
      source,
    })
    const report = {
      source,
      summary,
      cases,
      outputs,
    }

    writeJson(REPORT_OUTPUT_PATH, report)
    writeJson(SUMMARY_OUTPUT_PATH, summary)
    writeFileSync(CASES_OUTPUT_PATH, casesToCsv(cases), 'utf8')
    writeFileSync(CONFLICTS_OUTPUT_PATH, conflictsToCsv(cases), 'utf8')
    writeFileSync(MARKDOWN_OUTPUT_PATH, buildMarkdown(summary), 'utf8')

    console.log(JSON.stringify(buildConsoleSummary(summary, outputs), null, 2))
  } catch (error) {
    fail(error instanceof Error ? error.message : 'No se pudo diagnosticar DOCENTE_SUPERPUESTO.')
  }
}

main()
