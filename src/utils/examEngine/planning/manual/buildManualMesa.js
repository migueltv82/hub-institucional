import { normalizeSubjectCode } from '../../normalize/subjects.js'
import {
  findTribunalDocente,
  getTribunalDocenteId,
  getTribunalDocenteLabel,
} from '../tribunals/buildTribunalCandidatePool.js'

function clean(value) {
  return String(value ?? '').trim()
}

// Same tolerant resolution reconcileFinalTribunalReview.js already uses when
// importing a reviewed row: if the typed text does not match a real
// docente, keep it as free text with an empty id instead of failing. The
// mesa still gets built; validateFinalTribunals flags the unresolved
// titular/vocal downstream instead of silently dropping the mesa.
function resolveDocenteInput(input, docenteMap) {
  const text = clean(input)
  if (!text) return { id: '', nombre: '' }

  const docente = findTribunalDocente(docenteMap, text)
  if (docente) return { id: getTribunalDocenteId(docente), nombre: getTribunalDocenteLabel(docente) }

  return { id: '', nombre: text }
}

// Same estado vocabulary the automatic engine uses (generateTribunalsFromReviewedSchedule.js),
// so badges and TribunalReviewTable render manual mesas identically to
// generated ones without extra branching.
function resolveEstado(vocal1Id, vocal2Id) {
  const resolvedCount = [vocal1Id, vocal2Id].filter(Boolean).length
  if (resolvedCount === 2) return 'TRIBUNAL_COMPLETE'
  if (resolvedCount === 1) return 'TRIBUNAL_MINIMUM'
  return 'TRIBUNAL_INCOMPLETE'
}

function resolveAnio(anio) {
  const text = clean(anio)
  if (!text) return ''
  const numeric = Number(text)
  return Number.isFinite(numeric) ? numeric : text
}

// Builds one mesa entirely from admin input for ESPECIAL calls, bypassing
// generateDraftExamSchedule and useInteractiveTribunalSession completely.
// The result matches the plain-field shape every downstream consumer
// (exportGeneratedTribunalsForReview, publishExamTeacherAssignmentsForReview,
// validateFinalTribunals) already reads from an automatically generated
// mesa, so it flows into "Envio a docentes" / "Cronograma final" unchanged.
export function buildManualMesa({
  materiaCodigo = '',
  materiaNombre = '',
  carrera = '',
  anio = '',
  titularInput = '',
  vocal1Input = '',
  vocal2Input = '',
  fecha = '',
  turno = '',
  docenteMap = new Map(),
  index = 0,
} = {}) {
  const titular = resolveDocenteInput(titularInput, docenteMap)
  const vocal1 = resolveDocenteInput(vocal1Input, docenteMap)
  const vocal2 = resolveDocenteInput(vocal2Input, docenteMap)
  const materiaCodigoClean = clean(materiaCodigo)
  const materiaLabel = clean(materiaNombre) || materiaCodigoClean
  const draftMesaId = `especial:${index}:${normalizeSubjectCode(materiaCodigoClean || materiaLabel || String(index))}`

  return {
    id: draftMesaId,
    draftMesaId,
    materiaId: materiaCodigoClean,
    materia: materiaLabel,
    materiaMesa: materiaLabel,
    carrera: clean(carrera),
    anio: resolveAnio(anio),
    llamado: 'LLAMADO_ESPECIAL',
    fecha: clean(fecha),
    fechaSugerida: clean(fecha),
    turno: clean(turno),
    titularId: titular.id,
    titular: titular.nombre,
    vocal1Id: vocal1.id,
    vocal1: vocal1.nombre,
    vocal2Id: vocal2.id,
    vocal2: vocal2.nombre,
    estado: resolveEstado(vocal1.id, vocal2.id),
    alertas: [],
    metadata: { source: 'MANUAL_ESPECIAL_BUILD' },
  }
}
