import { isSupabaseConfigured, supabase } from '../lib/supabase.js'
import { buildSubjects, getPlanCareers } from '../modules/alumnos/services/studentPortalData.js'
import { isMissingLegacySyncSchemaError } from './legacySyncCommon.js'

const TABLE_NAME = 'legacy_exam_sessions'

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function clean(value) {
  return String(value ?? '').trim()
}

function normalizeText(value) {
  return clean(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function sameIdentity(left, right) {
  const leftText = normalizeText(left)
  const rightText = normalizeText(right)
  return Boolean(leftText && rightText && leftText === rightText)
}

function getFirst(row, keys) {
  if (!row || typeof row !== 'object') return ''

  for (const key of keys) {
    const value = row[key]
    if (value !== undefined && value !== null && clean(value) !== '') return value
  }

  return ''
}

function canUseRemoteSync({ institutionId, useRemote }) {
  return Boolean(useRemote && institutionId && isSupabaseConfigured && supabase)
}

function getRowSubjectCode(row) {
  return clean(getFirst(row, [
    'subject_id',
    'canonical_subject_id',
    'materia',
    'materia_codigo',
    'materiaCodigo',
    'codigo_materia',
    'codigo',
    'code',
  ]))
}

function getRowSubjectName(row) {
  return clean(getFirst(row, [
    'subject_name',
    'nombreMateria',
    'materia_nombre',
    'materiaNombre',
    'nombre_materia',
    'nombre',
    'name',
  ])) || getRowSubjectCode(row)
}

function getRowCareer(row) {
  return clean(getFirst(row, ['program_id', 'canonical_program_id', 'carrera', 'programa', 'program', 'career']))
}

function getSubjectId(subject) {
  return clean(subject?.canonical_subject_id || subject?.subject_id || subject?.code || subject?.codigo || subject?.id)
}

function getSubjectProgramId(subject) {
  return clean(subject?.canonical_program_id || subject?.program_id || subject?.carrera || subject?.career)
}

function findSubject(subjects, row) {
  const code = getRowSubjectCode(row)
  const name = getRowSubjectName(row)

  return subjects.find((subject) => sameIdentity(getSubjectId(subject), code))
    ?? subjects.find((subject) => sameIdentity(subject?.code, code))
    ?? subjects.find((subject) => sameIdentity(subject?.name, name))
    ?? null
}

function normalizeExamDatePart(value) {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? '' : value.toISOString()
  }

  const rawDate = clean(value)
  if (!rawDate) return ''
  if (rawDate.includes('T')) return rawDate

  const isoDate = rawDate.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/)
  if (isoDate) {
    const [, year, month, day] = isoDate
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
  }

  const displayDate = rawDate.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/)
  if (displayDate) {
    const [, day, month, year] = displayDate
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
  }

  return rawDate
}

function normalizeExamTimePart(value) {
  const rawTime = clean(value) || '08:00'
  const time = rawTime.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/)

  if (time) {
    const [, hour, minute, second = '00'] = time
    return `${hour.padStart(2, '0')}:${minute}:${second}`
  }

  return rawTime
}

function buildExamDate(row) {
  const date = normalizeExamDatePart(getFirst(row, ['exam_date', 'fechaIso', 'fecha_iso', 'date', 'fecha', 'fechaSugerida']))
  if (!date) return null
  if (date.includes('T')) return date

  const time = normalizeExamTimePart(getFirst(row, ['inicio', 'hora', 'time']))
  return `${date}T${time}`
}

function buildExamTableId({ row, index, subjectId, programId, examDate, callLabel }) {
  return clean(row?.exam_table_id || row?.id)
    || [programId, subjectId, examDate, callLabel, index].map(clean).filter(Boolean).join('::')
    || `legacy-exam-session-${index}`
}

function shouldSyncExamRow(row) {
  const inscriptionMode = clean(row?.inscription_mode).toLowerCase()
  if (inscriptionMode === 'admin_only') return false
  return Boolean(getRowSubjectCode(row) || getRowSubjectName(row))
}

// Espeja el cronograma real guardado por el generador, incluso cuando las mesas
// todavia estan en estado `pendiente`. El portal alumno filtra publicacion en
// otra capa; esta tabla es el espejo operativo para cerrar la persistencia del
// cronograma en etapa 3 y para que futuras RPCs resuelvan fechas server-side.
export function buildLegacyExamSessionsFromSnapshot({ snapshot, institutionId, workspaceKey = 'main' }) {
  const planCareers = getPlanCareers(snapshot?.planesEstudio)
  const byId = new Map()
  const careers = planCareers.length > 0 ? planCareers : ['']
  const subjectsByCareer = new Map(careers.map((career) => [
    career,
    buildSubjects(snapshot?.planesEstudio, career, planCareers),
  ]))

  asArray(snapshot?.cronograma).forEach((row, index) => {
    if (!shouldSyncExamRow(row)) return

    const rawCareer = getRowCareer(row)
    const career = careers.find((candidate) => sameIdentity(candidate, rawCareer)) || rawCareer || careers[0] || ''
    const subjects = subjectsByCareer.get(career) || buildSubjects(snapshot?.planesEstudio, career, planCareers)
    const subject = findSubject(subjects, row)
    const subjectId = getSubjectId(subject) || getRowSubjectCode(row) || getRowSubjectName(row)
    const programId = getSubjectProgramId(subject) || career || rawCareer || ''
    const examDate = buildExamDate(row)
    const callLabel = clean(row?.llamado || row?.call_label || row?.exam_call)
    const examTableId = buildExamTableId({ row, index, subjectId, programId, examDate, callLabel })

    if (!examTableId || !subjectId) return

    byId.set(examTableId, {
      institution_id: institutionId,
      workspace_key: workspaceKey,
      exam_table_id: examTableId,
      subject_id: subjectId,
      program_id: programId,
      exam_date: examDate,
      call_label: callLabel,
    })
  })

  return Array.from(byId.values())
}

function warnMissingSchema(operation, error) {
  console.warn(
    `No se pudo completar ${operation} porque falta la tabla ${TABLE_NAME} en Supabase. Se omite la sincronizacion.`,
    error,
  )
}

export async function syncLegacyExamSessions({ institutionId, workspaceKey = 'main', snapshot, useRemote }) {
  if (!canUseRemoteSync({ institutionId, useRemote })) {
    return { skipped: true, synced: 0, deleted: 0 }
  }

  const rows = buildLegacyExamSessionsFromSnapshot({ snapshot, institutionId, workspaceKey })

  const { error: deleteError } = await supabase
    .from(TABLE_NAME)
    .delete()
    .eq('institution_id', institutionId)
    .eq('workspace_key', workspaceKey)

  if (deleteError) {
    if (isMissingLegacySyncSchemaError(deleteError, TABLE_NAME)) {
      warnMissingSchema(`la limpieza de ${TABLE_NAME}`, deleteError)
      return { skipped: true, synced: 0, deleted: 0 }
    }

    throw deleteError
  }

  if (rows.length === 0) {
    return { skipped: false, synced: 0, deleted: null }
  }

  const { error: upsertError } = await supabase
    .from(TABLE_NAME)
    .upsert(rows, { onConflict: 'institution_id,workspace_key,exam_table_id' })

  if (upsertError) {
    if (isMissingLegacySyncSchemaError(upsertError, TABLE_NAME)) {
      warnMissingSchema(`la sincronizacion de ${TABLE_NAME}`, upsertError)
      return { skipped: true, synced: 0, deleted: 0 }
    }

    throw upsertError
  }

  return { skipped: false, synced: rows.length, deleted: null }
}
