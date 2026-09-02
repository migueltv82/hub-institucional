import { useState } from 'react'
import toast from 'react-hot-toast'
import {
  calcularLimiteMitadMasUno,
  convertirFechaDisplayAIso,
  convertirFechaIsoADisplay,
  obtenerDiaDesdeFechaIso,
  sonMateriasAfines,
  tieneConflictoTitularVocalMismoDia,
} from '../utils/examEngine/manualScheduleUtils.js'
import { initialEdicionMesa } from '../components/generadorCronograma/config.js'
import { ordenarCronogramaLocal } from '../components/generadorCronograma/helpers.js'

const DOCENTE_A_DESIGNAR = 'A designar'
const WARNING_DUPLICATE_TEACHER = 'Mesa editada con docente repetido dentro del tribunal. Revisar antes de confirmar.'
const WARNING_SLOT_CONFLICT = 'Mesa generada con conflicto de titular o vocales ya asignados en este horario. Ajustar antes de confirmar.'
const WARNING_ROLE_CONFLICT = 'Mesa editada con docente asignado como titular y vocal el mismo dia. Revisar antes de confirmar.'
const WARNING_HALF_PLUS_ONE = 'Mesa editada supera el limite de mitad mas uno de dias afectados. Revisar antes de confirmar.'
const WARNING_SAME_DAY_AFFINITY = 'Mesa editada asigna dos mesas el mismo dia a un docente con materias no afines o no permitidas. Revisar antes de confirmar.'
const WARNING_ONE_VOCAL_PENDING = 'Mesa generada con un vocal pendiente de designacion. Revisar antes de confirmar.'
const WARNING_TWO_VOCALS_PENDING = 'Mesa generada con dos vocales pendientes de designacion. Revisar antes de confirmar.'
const REVISION_MESSAGES = [
  WARNING_DUPLICATE_TEACHER,
  WARNING_SLOT_CONFLICT,
  WARNING_ROLE_CONFLICT,
  WARNING_HALF_PLUS_ONE,
  WARNING_SAME_DAY_AFFINITY,
  WARNING_ONE_VOCAL_PENDING,
  WARNING_TWO_VOCALS_PENDING,
]

function clean(value) {
  return String(value ?? '').trim()
}

function cleanTeacher(value) {
  return clean(value) || DOCENTE_A_DESIGNAR
}

function isAssignedTeacher(value) {
  const teacher = clean(value)
  return Boolean(teacher && teacher !== DOCENTE_A_DESIGNAR)
}

function normalizeKey(value) {
  return clean(value)
    .toLowerCase()
    .normalize('NFD')
    .replaceAll(/[\u0300-\u036f]/g, '')
}

function getMesaSlotKey(mesa) {
  const end = mesa.fin_operativo || mesa.fin || '23:59'
  return `${mesa.fecha}::${mesa.inicio}-${end}`
}

function getMesaFechaIso(mesa) {
  return mesa.fechaIso || convertirFechaDisplayAIso(mesa.fecha)
}

function getMesaCallKey(mesa) {
  return mesa.exam_call || mesa.llamado || 'default'
}

function getMesaTeacherRoles(mesa) {
  return [
    { profesor: mesa.profesorTitular, rol: 'titular' },
    { profesor: mesa.vocal1, rol: 'vocal' },
    { profesor: mesa.vocal2, rol: 'vocal' },
  ]
    .map((asignacion) => ({
      ...asignacion,
      profesor: clean(asignacion.profesor),
    }))
    .filter((asignacion) => isAssignedTeacher(asignacion.profesor))
}

function getAssignedTeachers(mesa) {
  return getMesaTeacherRoles(mesa).map((asignacion) => asignacion.profesor)
}

function hasDuplicateTeachersInMesa(mesa) {
  const teachers = getAssignedTeachers(mesa)
  return new Set(teachers.map(normalizeKey)).size !== teachers.length
}

function buildRoleAssignments(cronograma, editedMesa) {
  return cronograma
    .filter((mesa) => mesa.id !== editedMesa.id)
    .flatMap((mesa) => getMesaTeacherRoles(mesa).map((asignacion) => ({
      docenteId: asignacion.profesor,
      fecha: getMesaFechaIso(mesa),
      rol: asignacion.rol,
    })))
}

function hasRoleConflictSameDay(cronograma, editedMesa) {
  const asignaciones = buildRoleAssignments(cronograma, editedMesa)
  const fecha = getMesaFechaIso(editedMesa)

  return getMesaTeacherRoles(editedMesa).some((asignacion) => (
    tieneConflictoTitularVocalMismoDia(asignacion.profesor, fecha, asignacion.rol, asignaciones)
  ))
}

function createAttendanceDaysByTeacher(horariosDocentes = []) {
  return horariosDocentes.reduce((map, horario) => {
    const profesor = normalizeKey(horario.profesor)
    const dia = normalizeKey(horario.dia)
    if (!profesor || !dia) return map

    const dias = map.get(profesor) ?? new Set()
    dias.add(dia)
    map.set(profesor, dias)
    return map
  }, new Map())
}

function hasHalfPlusOneConflict({ cronograma, editedMesa, generationScope = {}, horariosDocentes = [] }) {
  if (generationScope.applyHalfPlusOneRule === false) return false

  const diasAsistenciaPorDocente = createAttendanceDaysByTeacher(horariosDocentes)
  if (!diasAsistenciaPorDocente.size) return false

  const cronogramaEditado = cronograma.map((mesa) => (mesa.id === editedMesa.id ? editedMesa : mesa))
  const docentesEditados = new Set(getAssignedTeachers(editedMesa).map(normalizeKey))
  const diasPorDocenteYLlamado = new Map()

  cronogramaEditado.forEach((mesa) => {
    const fecha = getMesaFechaIso(mesa)
    const llamado = getMesaCallKey(mesa)

    getAssignedTeachers(mesa).forEach((profesor) => {
      const profesorKey = normalizeKey(profesor)
      if (!docentesEditados.has(profesorKey)) return

      const key = `${llamado}::${profesorKey}`
      const dias = diasPorDocenteYLlamado.get(key) ?? new Set()
      dias.add(fecha)
      diasPorDocenteYLlamado.set(key, dias)
    })
  })

  return [...diasPorDocenteYLlamado.entries()].some(([key, diasAfectados]) => {
    const keyParts = key.split('::')
    const profesorKey = keyParts[keyParts.length - 1]
    const diasAsistencia = diasAsistenciaPorDocente.get(profesorKey)?.size ?? 0
    if (!diasAsistencia) return false

    return diasAfectados.size > calcularLimiteMitadMasUno(diasAsistencia)
  })
}

function hasSameDayRelatedSubjectsConflict({ cronograma, editedMesa, generationScope = {} }) {
  const allowSameDayRelatedSubjects = generationScope.allowSameDayRelatedSubjects ?? true
  const fecha = getMesaFechaIso(editedMesa)
  const docentesEditados = new Set(getAssignedTeachers(editedMesa).map(normalizeKey))

  if (!docentesEditados.size) return false

  return cronograma
    .filter((mesa) => mesa.id !== editedMesa.id && getMesaFechaIso(mesa) === fecha)
    .some((mesa) => {
      const comparteDocente = getAssignedTeachers(mesa).some((profesor) => (
        docentesEditados.has(normalizeKey(profesor))
      ))

      if (!comparteDocente) return false
      if (!allowSameDayRelatedSubjects) return true

      return !sonMateriasAfines(mesa, editedMesa)
    })
}

function hasTeacherConflict(cronograma, editedMesa) {
  const editedSlotKey = getMesaSlotKey(editedMesa)
  const editedTeachers = [
    editedMesa.profesorTitular,
    editedMesa.vocal1,
    editedMesa.vocal2,
  ]
    .map(clean)
    .filter((teacher) => teacher && teacher !== DOCENTE_A_DESIGNAR)

  const busyTeachers = new Set(
    cronograma
      .filter((mesa) => mesa.id !== editedMesa.id && getMesaSlotKey(mesa) === editedSlotKey)
      .flatMap((mesa) => [mesa.profesorTitular, mesa.vocal1, mesa.vocal2])
      .map(clean)
      .filter((teacher) => teacher && teacher !== DOCENTE_A_DESIGNAR),
  )

  return editedTeachers.some((teacher) => busyTeachers.has(teacher))
}

function buildManualObservation({
  baseObservation,
  cronograma,
  editedMesa,
  generationScope,
  horariosDocentes,
}) {
  const manualObservation = REVISION_MESSAGES.reduce(
    (observation, message) => observation.replaceAll(message, ''),
    clean(baseObservation),
  ).replaceAll(/\s+/g, ' ').trim()

  const generatedMessages = []

  if (hasDuplicateTeachersInMesa(editedMesa)) {
    generatedMessages.push(WARNING_DUPLICATE_TEACHER)
  }

  if (hasTeacherConflict(cronograma, editedMesa)) {
    generatedMessages.push(WARNING_SLOT_CONFLICT)
  }

  if (hasRoleConflictSameDay(cronograma, editedMesa)) {
    generatedMessages.push(WARNING_ROLE_CONFLICT)
  }

  if (hasHalfPlusOneConflict({ cronograma, editedMesa, generationScope, horariosDocentes })) {
    generatedMessages.push(WARNING_HALF_PLUS_ONE)
  }

  if (hasSameDayRelatedSubjectsConflict({ cronograma, editedMesa, generationScope })) {
    generatedMessages.push(WARNING_SAME_DAY_AFFINITY)
  }

  const vocalesAsignados = [editedMesa.vocal1, editedMesa.vocal2]
    .filter(isAssignedTeacher)
    .length

  if (vocalesAsignados === 0) generatedMessages.push(WARNING_ONE_VOCAL_PENDING)

  return [
    manualObservation,
    ...generatedMessages,
  ].filter(Boolean).join(' ')
}

export function applyMesaManualEdit({
  cronograma,
  edicionMesa,
  generationScope = {},
  horariosDocentes = [],
  mesaEnEdicionId,
}) {
  return [...cronograma]
    .map((mesa) => {
      if (mesa.id !== mesaEnEdicionId) return mesa

      const fechaIso = edicionMesa.fechaIso
      const editedMesa = {
        ...mesa,
        fechaIso,
        fecha: convertirFechaIsoADisplay(fechaIso),
        dia: obtenerDiaDesdeFechaIso(fechaIso),
        inicio: edicionMesa.inicio,
        fin: edicionMesa.fin,
        fin_operativo: edicionMesa.fin || mesa.fin_operativo,
        profesorTitular: cleanTeacher(edicionMesa.profesorTitular),
        vocal1: cleanTeacher(edicionMesa.vocal1),
        vocal2: cleanTeacher(edicionMesa.vocal2),
        aula: edicionMesa.aula.trim() || 'A definir',
        ajusteManual: true,
      }

      return {
        ...editedMesa,
        observacionManual: buildManualObservation({
          baseObservation: edicionMesa.observacionManual,
          cronograma,
          editedMesa,
          generationScope,
          horariosDocentes,
        }),
      }
    })
    .sort(ordenarCronogramaLocal)
}

export function useManualMesaEditing({
  canEditWorkspace = true,
  generationScope = {},
  horariosDocentes = [],
  setCronograma,
}) {
  const [mesaEnEdicionId, setMesaEnEdicionId] = useState(null)
  const [edicionMesa, setEdicionMesa] = useState(initialEdicionMesa)

  function resetEdicionMesa() {
    setMesaEnEdicionId(null)
    setEdicionMesa(initialEdicionMesa)
  }

  function iniciarEdicionMesa(mesa) {
    if (!canEditWorkspace) {
      toast.error('Tu rol institucional es de solo lectura.')
      return
    }

    setMesaEnEdicionId(mesa.id)
    setEdicionMesa({
      fechaIso: mesa.fechaIso || convertirFechaDisplayAIso(mesa.fecha),
      inicio: mesa.inicio,
      fin: mesa.fin,
      examType: mesa.exam_type || 'regular',
      profesorTitular: mesa.profesorTitular || '',
      vocal1: mesa.vocal1 || '',
      vocal2: mesa.vocal2 || '',
      aula: mesa.aula,
      observacionManual: mesa.observacionManual || '',
    })
  }

  function actualizarCampoEdicion(key, value) {
    if (!canEditWorkspace) return

    setEdicionMesa((current) => ({
      ...current,
      [key]: value,
    }))
  }

  function guardarEdicionMesa() {
    if (!canEditWorkspace) {
      toast.error('Tu rol institucional es de solo lectura.')
      return
    }

    if (!mesaEnEdicionId) return

    const isSpecialExam = edicionMesa.examType === 'special'

    if (!edicionMesa.fechaIso || !edicionMesa.inicio || (isSpecialExam && !edicionMesa.fin)) {
      toast.error(isSpecialExam
        ? 'Completa fecha, inicio y fin para guardar la edicion.'
        : 'Completa fecha e inicio para guardar la edicion.')
      return
    }

    if (!edicionMesa.profesorTitular?.trim()) {
      toast.error('Indica el docente titular para guardar la mesa.')
      return
    }

    if (edicionMesa.fin && edicionMesa.inicio >= edicionMesa.fin) {
      toast.error('La hora de inicio debe ser anterior a la hora de fin.')
      return
    }

    setCronograma((current) =>
      applyMesaManualEdit({
        cronograma: current,
        edicionMesa,
        generationScope,
        horariosDocentes,
        mesaEnEdicionId,
      }),
    )

    resetEdicionMesa()
    toast.success('Mesa actualizada manualmente.')
  }

  return {
    actualizarCampoEdicion,
    edicionMesa,
    guardarEdicionMesa,
    iniciarEdicionMesa,
    mesaEnEdicionId,
    resetEdicionMesa,
  }
}
