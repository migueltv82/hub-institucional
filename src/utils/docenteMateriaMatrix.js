import { isProfessionalPracticeSubject } from './examEngine/comparison/resolveDocenteMateriaAssignment.js'

const TRIBUNAL_ROLES = {
  TITULAR: 'TITULAR',
  VOCAL_AFIN: 'VOCAL_AFIN',
  TITULAR_Y_VOCAL_AFIN: 'TITULAR_Y_VOCAL_AFIN',
  NO_APTO: 'NO_APTO',
}

function clean(value) {
  return String(value ?? '').trim()
}

export function normalizeMatrixText(value) {
  return clean(value)
    .toLowerCase()
    .normalize('NFD')
    .replaceAll(/[\u0300-\u036f]/g, '')
    .replaceAll(/[^a-z0-9]+/g, ' ')
    .trim()
}

function compactKey(...parts) {
  return parts.map(normalizeMatrixText).filter(Boolean).join('::')
}

function getSubjectCode(row = {}) {
  return clean(row.materia ?? row.codigo ?? row.codigo_materia ?? row.materiaCodigo)
}

function getSubjectName(row = {}) {
  return clean(row.nombreMateria ?? row.nombre_materia ?? row.nombre ?? row.asignatura ?? getSubjectCode(row))
}

function getCareer(row = {}) {
  return clean(row.carrera ?? row.programa ?? row.program ?? row.career)
}

function getTeacherName(row = {}) {
  return clean(row.docente ?? row.profesor ?? row.nombre_docente ?? row.nombreDocente ?? row.titular)
}

function getTeacherKey(row = {}) {
  return compactKey(row.docenteId ?? row.docente_id ?? row.dni ?? row.documento ?? row.email ?? getTeacherName(row))
}

export function normalizeDocenteMateriaRole(value) {
  const role = clean(value).toUpperCase()
  if (Object.values(TRIBUNAL_ROLES).includes(role)) return role

  const normalized = normalizeMatrixText(value).replaceAll(' ', '_')
  if (['titular', 'profesor_titular', 'docente_titular'].includes(normalized)) return TRIBUNAL_ROLES.TITULAR
  if (['vocal', 'vocal_afin', 'afin', 'docente_afin', 'idoneo', 'idoneidad'].includes(normalized)) return TRIBUNAL_ROLES.VOCAL_AFIN
  if (['titular_y_vocal', 'titular_y_vocal_afin', 'titular_vocal', 'titular_vocal_afin', 'ambos'].includes(normalized)) {
    return TRIBUNAL_ROLES.TITULAR_Y_VOCAL_AFIN
  }
  if (['no_apto', 'no_afin', 'excluido', 'bloqueado', 'no'].includes(normalized)) return TRIBUNAL_ROLES.NO_APTO

  return TRIBUNAL_ROLES.VOCAL_AFIN
}

function subjectKeys(row = {}) {
  const career = getCareer(row)
  const code = getSubjectCode(row)
  const name = getSubjectName(row)

  return [
    compactKey(career, code),
    compactKey(career, name),
  ].filter(Boolean)
}

function uniqueBy(items = [], keyGetter) {
  const seen = new Set()
  return items.filter((item) => {
    const key = keyGetter(item)
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function buildRowsBySubject(docenteMateria = []) {
  return docenteMateria.reduce((map, row) => {
    subjectKeys(row).forEach((key) => {
      const rows = map.get(key) ?? []
      rows.push({
        ...row,
        docente: getTeacherName(row),
        docenteKey: getTeacherKey(row),
        rolEnMateria: normalizeDocenteMateriaRole(row.rolEnMateria ?? row.rol_en_materia ?? row.rol),
      })
      map.set(key, rows)
    })

    return map
  }, new Map())
}

function buildAutomaticTitularRowsFromSchedules(horariosDocentes = []) {
  const groups = horariosDocentes.reduce((map, row, index) => {
    const subjectKey = subjectKeys(row)[0] || compactKey(getSubjectName(row))
    const teacherKey = getTeacherKey(row)
    if (!subjectKey || !teacherKey) return map

    const group = map.get(subjectKey) ?? { row, teachers: new Map() }
    if (!group.teachers.has(teacherKey)) {
      group.teachers.set(teacherKey, {
        index,
        row: {
          ...row,
          id: row.id ?? `titular-horario-${index}`,
          rol_en_materia: 'TITULAR',
          source: 'course_schedules',
        },
      })
    }
    map.set(subjectKey, group)
    return map
  }, new Map())

  return [...groups.values()].flatMap(({ row, teachers }) => {
    if (teachers.size > 1 && !isProfessionalPracticeSubject(row)) return []
    return [...teachers.values()].map(({ row: teacherRow }) => teacherRow)
  })
}

function getRowsForSubject(map, subject = {}) {
  const collected = subjectKeys(subject).flatMap((key) => map.get(key) ?? [])
  return uniqueBy(collected, (row) => `${row.docenteKey}::${row.rolEnMateria}`)
}

function getSubjectStatus({ titulares, vocales }) {
  if (!titulares.length && vocales.length < 2) return 'SIN_TITULAR_Y_VOCALES'
  if (!titulares.length) return 'SIN_TITULAR'
  if (vocales.length < 2) return 'VOCALES_INSUFICIENTES'
  return 'COMPLETA'
}

export function buildDocenteMateriaTribunalDiagnosis({
  planesEstudio = [],
  docenteMateria = [],
  horariosDocentes = [],
} = {}) {
  const automaticTitularRows = buildAutomaticTitularRowsFromSchedules(horariosDocentes)
  const rowsBySubject = buildRowsBySubject([
    ...docenteMateria,
    ...automaticTitularRows,
  ])
  const subjects = planesEstudio.length ? planesEstudio : docenteMateria

  const subjectsDiagnosis = subjects.map((subject) => {
    const rows = getRowsForSubject(rowsBySubject, subject)
    const titulares = uniqueBy(
      rows.filter((row) => (
        row.rolEnMateria === TRIBUNAL_ROLES.TITULAR ||
        row.rolEnMateria === TRIBUNAL_ROLES.TITULAR_Y_VOCAL_AFIN
      )),
      (row) => row.docenteKey,
    )
    const titularKeys = new Set(titulares.map((row) => row.docenteKey))
    const vocales = uniqueBy(
      rows.filter((row) => (
        (
          row.rolEnMateria === TRIBUNAL_ROLES.VOCAL_AFIN ||
          row.rolEnMateria === TRIBUNAL_ROLES.TITULAR_Y_VOCAL_AFIN
        ) &&
        !titularKeys.has(row.docenteKey)
      )),
      (row) => row.docenteKey,
    )
    const noAptos = uniqueBy(
      rows.filter((row) => row.rolEnMateria === TRIBUNAL_ROLES.NO_APTO),
      (row) => row.docenteKey,
    )
    const status = getSubjectStatus({ titulares, vocales })

    return {
      key: subjectKeys(subject)[0] || compactKey(getSubjectName(subject)),
      carrera: getCareer(subject),
      materia: getSubjectCode(subject),
      nombreMateria: getSubjectName(subject),
      titulares,
      vocales,
      noAptos,
      status,
      completa: status === 'COMPLETA',
    }
  })

  const summary = {
    totalMaterias: subjectsDiagnosis.length,
    completas: subjectsDiagnosis.filter((subject) => subject.status === 'COMPLETA').length,
    sinTitular: subjectsDiagnosis.filter((subject) => subject.status === 'SIN_TITULAR').length,
    vocalesInsuficientes: subjectsDiagnosis.filter((subject) => subject.status === 'VOCALES_INSUFICIENTES').length,
    sinTitularYVocales: subjectsDiagnosis.filter((subject) => subject.status === 'SIN_TITULAR_Y_VOCALES').length,
    relacionesCargadas: docenteMateria.length,
    titularesAutomaticosDesdeHorarios: automaticTitularRows.length,
  }

  return {
    subjects: subjectsDiagnosis,
    summary: {
      ...summary,
      listasParaTribunal: summary.completas,
      conObservaciones: summary.totalMaterias - summary.completas,
    },
  }
}

export { TRIBUNAL_ROLES }
