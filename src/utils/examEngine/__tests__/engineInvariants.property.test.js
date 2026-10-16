import { describe, expect, it } from 'vitest'
import { generateRegularExamPlan } from '../planning/generateRegular.js'
import { DOCENTE_A_DESIGNAR, MAX_SUBJECTS_PER_MESA } from '../constants.js'
import { getNivelAfinidadDocenteMesa } from '../rules/affinities.js'

// Prueba de propiedades del motor: instituciones sinteticas generadas con semilla fija y
// verificacion independiente de las reglas duras del README sobre la salida final.
// Si falla, el mensaje incluye la semilla para reproducir el caso con buildInstitution(seed).

const WEEKDAYS = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes']
const CAREERS = [
  { id: 'prof-ingles', name: 'Profesorado de Ingles' },
  { id: 'trad-ingles', name: 'Traductorado de Ingles' },
]
const SUBJECT_NAMES = ['Lengua Inglesa', 'Gramatica Inglesa', 'Fonetica Inglesa', 'Literatura Inglesa', 'Practicas Discursivas III', 'Practicas Discursivas IV', 'Ingles Tecnico', 'Cultura Inglesa']
const CASES = 200

function mulberry32(seed) {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6D2B79F5) >>> 0
    let value = Math.imul(state ^ (state >>> 15), 1 | state)
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

function addDays(iso, days) {
  const date = new Date(`${iso}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

function weekdayOf(iso) {
  return ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'][new Date(`${iso}T12:00:00Z`).getUTCDay()]
}

// dense: plantel chico que asiste todos los dias y materias de una misma familia, para que
// el motor comparta tribunal y fecha y ejercite la compactacion (maximo de materias, no agrupables).
export function buildInstitution(seed, { dense = false } = {}) {
  const random = mulberry32(seed)
  const pick = (items) => items[Math.floor(random() * items.length)]
  const between = (min, max) => min + Math.floor(random() * (max - min + 1))

  const docentes = Array.from({ length: dense ? 3 : between(4, 10) }, (_, index) => {
    const days = dense ? [...WEEKDAYS] : WEEKDAYS.filter(() => random() < 0.6)
    const otherArea = !dense && random() < 0.2
    return {
      id: `doc-${index}`,
      nombre: `Docente ${index}`,
      activo: true,
      // Algunos docentes de otra area (Historia) para que la regla de afinidad de vocales no sea vacia.
      carrera: dense ? CAREERS[0].name : (otherArea ? 'Profesorado de Historia' : pick(CAREERS).name),
      nombreMateria: dense ? 'Lengua Inglesa' : (otherArea ? 'Historia Antigua' : pick(SUBJECT_NAMES)),
      diasAsistencia: days.length ? days : [pick(WEEKDAYS)],
      horasCatedra: dense ? between(10, 16) : between(2, 12),
      turnosDisponibles: ['NOCHE'],
    }
  })

  const usedNames = new Set()
  const materias = Array.from({ length: dense ? between(4, 8) : between(2, 7) }, (_, index) => {
    const career = dense ? CAREERS[0] : pick(CAREERS)
    let name = dense ? pick(['Lengua Inglesa', 'Gramatica Inglesa', 'Practicas Discursivas III', 'Practicas Discursivas IV']) : pick(SUBJECT_NAMES)
    if (usedNames.has(`${career.id}:${name}`)) name = `${name} ${index}`
    usedNames.add(`${career.id}:${name}`)
    return {
      id: `M${index}`,
      materia: `M${index}`,
      nombreMateria: name,
      carreraId: career.id,
      carrera: career.name,
      anio: between(1, 4),
      titular_id: pick(docentes).id,
      requiereMesa: true,
    }
  })

  const correlatividades = []
  for (const target of materias) {
    const previous = materias.filter((candidate) => candidate.carreraId === target.carreraId && candidate.anio < target.anio && random() < 0.4)
    if (previous.length) correlatividades.push({ carrera: target.carrera, carreraId: target.carreraId, materia: target.id, nombreMateria: target.nombreMateria, correlativas: previous.map((subject) => subject.id) })
  }

  const cantidadLlamados = random() < 0.5 ? 1 : 2
  const start = '2026-07-27'
  const fechasDisponibles = []
  const calls = cantidadLlamados === 2 ? ['PRIMER_LLAMADO', 'SEGUNDO_LLAMADO'] : ['PRIMER_LLAMADO']
  calls.forEach((llamado, callIndex) => {
    for (let offset = 0; offset < 5; offset += 1) {
      if (random() < 0.75) {
        const fecha = addDays(start, callIndex * 7 + offset)
        fechasDisponibles.push({ fecha, diaSemana: weekdayOf(fecha).toUpperCase(), llamado, turno: 'NOCHE', disponible: true })
      }
    }
  })

  return {
    docentes,
    materias,
    correlatividades,
    config: { tipoPeriodo: 'REGULAR', cantidadLlamados, fechaInicio: start, fechaFin: addDays(start, 13) },
    fechasDisponibles,
    options: { force: true },
  }
}

function subjectsOf(mesa) {
  if (Array.isArray(mesa.materiasAgrupadas) && mesa.materiasAgrupadas.length) return mesa.materiasAgrupadas
  return [mesa]
}

function subjectId(subject) {
  return subject.materiaId ?? subject.materia ?? subject.id
}

function isAssigned(teacherId) {
  return Boolean(teacherId) && teacherId !== DOCENTE_A_DESIGNAR
}

export function checkInvariants(input, result) {
  const violations = []
  const docentes = new Map(input.docentes.map((docente) => [docente.id, docente]))
  const materias = new Map(input.materias.map((materia) => [materia.id, materia]))
  const datesByCall = new Map()
  for (const date of input.fechasDisponibles) datesByCall.set(date.llamado, new Set([...(datesByCall.get(date.llamado) ?? []), date.fecha]))
  const vocalias = new Map()
  const datesBySubjectCall = new Map()

  for (const mesa of result.plannedMesas ?? []) {
    const subjects = subjectsOf(mesa)
    const fail = (rule, detail) => violations.push({ rule, mesa: mesa.id, ...detail })
    if (!isAssigned(mesa.titularId)) fail('TITULAR_OBLIGATORIO')
    if (subjects.length > MAX_SUBJECTS_PER_MESA) fail('MAX_SUBJECTS_PER_MESA', { count: subjects.length })
    const discursivas = subjects.filter((subject) => /practicas discursivas (iii|iv)\b/i.test(String(subject.materia ?? subject.nombreMateria ?? '')))
    if (discursivas.length && subjects.length > 1) fail('PRACTICAS_DISCURSIVAS_AGRUPADAS', { subjects: subjects.map(subjectId) })
    for (const subject of subjects) {
      const source = materias.get(subjectId(subject))
      if (!source) { fail('MATERIA_DESCONOCIDA', { subject: subjectId(subject) }); continue }
      const titular = subject.titularId ?? mesa.titularId
      if (titular !== source.titular_id) fail('TITULARIDAD_MOVIDA', { subject: source.id, expected: source.titular_id, actual: titular })
      if (subject.llamado && subject.llamado !== mesa.llamado) fail('MATERIA_AGRUPADA_DE_OTRO_LLAMADO', { subject: source.id })
      const key = `${source.id}:${mesa.llamado}`
      if (mesa.fecha) datesBySubjectCall.set(key, mesa.fecha)
    }
    if (mesa.fecha && !(datesByCall.get(mesa.llamado) ?? new Set()).has(mesa.fecha)) fail('FECHA_FUERA_DEL_LLAMADO', { fecha: mesa.fecha, llamado: mesa.llamado })
    const vocales = [mesa.vocal1Id, mesa.vocal2Id].filter(isAssigned)
    const tribunal = [mesa.titularId, ...vocales].filter(isAssigned)
    if (new Set(tribunal).size !== tribunal.length) fail('ROL_DUPLICADO_EN_TRIBUNAL', { tribunal })
    for (const vocalId of vocales) {
      vocalias.set(`${vocalId}:${mesa.llamado}`, (vocalias.get(`${vocalId}:${mesa.llamado}`) ?? 0) + 1)
      // Regla 11: oraculo = la regla de afinidad del propio motor (definicion institucional compleja).
      const docente = docentes.get(vocalId)
      if (docente && !getNivelAfinidadDocenteMesa(docente, mesa).afinidadValida) fail('VOCAL_SIN_AFINIDAD', { vocalId })
    }
    if (mesa.fecha) {
      const weekday = weekdayOf(mesa.fecha)
      for (const teacherId of tribunal) {
        const docente = docentes.get(teacherId)
        if (docente && !docente.diasAsistencia.includes(weekday)) fail('DOCENTE_NO_ASISTE_ESE_DIA', { teacherId, weekday })
      }
    }
  }

  for (const [key, count] of vocalias) {
    const [teacherId] = key.split(':')
    const limit = Math.floor((docentes.get(teacherId)?.horasCatedra ?? 0) / 2) + 1
    if (count > limit) violations.push({ rule: 'LIMITE_VOCALIAS_MITAD_MAS_UNO', key, count, limit })
  }

  for (const entry of input.correlatividades) {
    for (const previous of entry.correlativas) {
      for (const llamado of datesByCall.keys()) {
        const before = datesBySubjectCall.get(`${previous}:${llamado}`)
        const after = datesBySubjectCall.get(`${entry.materia}:${llamado}`)
        if (before && after && before > after) violations.push({ rule: 'CORRELATIVIDAD_INVERTIDA', previous, subject: entry.materia, llamado, before, after })
      }
    }
  }
  return violations
}

describe('examEngine: invariantes de reglas duras sobre instituciones sinteticas', () => {
  it(`respeta las reglas duras en ${CASES} instituciones generadas con semilla fija`, () => {
    const failures = []
    let plannedTotal = 0
    for (let seed = 1; seed <= CASES; seed += 1) {
      const input = buildInstitution(seed)
      const result = generateRegularExamPlan(input)
      plannedTotal += result.plannedMesas?.length ?? 0
      const violations = checkInvariants(input, result)
      if (violations.length) failures.push({ seed, violations: violations.slice(0, 3) })
    }
    expect(plannedTotal).toBeGreaterThan(CASES)
    expect(failures).toEqual([])
  }, 60000)

  it('respeta las mismas reglas en el modo de planificacion dateAware', () => {
    const failures = []
    for (let seed = 1; seed <= 100; seed += 1) {
      const input = buildInstitution(seed)
      input.options = { ...input.options, vocalPlanningMode: 'dateAware' }
      const violations = checkInvariants(input, generateRegularExamPlan(input))
      if (violations.length) failures.push({ seed, violations: violations.slice(0, 3) })
    }
    expect(failures).toEqual([])
  }, 60000)

  it('respeta las reglas cuando el motor compacta (plantel chico, materias afines)', () => {
    const failures = []
    let grouped = 0
    for (const compact of ['safe', 'aggressive']) {
      for (let seed = 1; seed <= 120; seed += 1) {
        const input = buildInstitution(seed, { dense: true })
        input.options = { ...input.options, compact }
        const result = generateRegularExamPlan(input)
        grouped += result.plannedMesas.filter((mesa) => (mesa.materiasAgrupadas ?? []).length > 1).length
        const violations = checkInvariants(input, result)
        if (violations.length) failures.push({ compact, seed, violations: violations.slice(0, 3) })
      }
    }
    expect(grouped).toBeGreaterThan(20)
    expect(failures).toEqual([])
  }, 60000)

  it('es determinista: la misma entrada produce las mismas mesas', () => {
    for (const seed of [3, 17, 42, 99, 150]) {
      const first = generateRegularExamPlan(buildInstitution(seed)).plannedMesas
      const second = generateRegularExamPlan(buildInstitution(seed)).plannedMesas
      expect(second).toEqual(first)
    }
  })

  it('el chequeo detecta violaciones fabricadas (no es vacio)', () => {
    const input = buildInstitution(7)
    const [first, second] = input.materias
    const fake = {
      plannedMesas: [
        { id: 'x1', llamado: 'PRIMER_LLAMADO', fecha: '2030-01-01', titularId: 'otro', vocal1Id: 'otro', vocal2Id: null, materiaId: first.id, materia: 'Practicas Discursivas III', materiasAgrupadas: [{ materiaId: first.id, materia: 'Practicas Discursivas III' }, { materiaId: second.id, materia: second.nombreMateria }] },
        { id: 'x2', llamado: 'PRIMER_LLAMADO', fecha: null, titularId: null, materiaId: first.id },
      ],
    }
    const historia = { id: 'doc-historia', nombre: 'Historia', activo: true, carrera: 'Profesorado de Historia', nombreMateria: 'Historia Antigua', diasAsistencia: ['lunes'], horasCatedra: 2, turnosDisponibles: ['NOCHE'] }
    input.docentes.push(historia)
    const lunes = input.fechasDisponibles.find((date) => date.llamado === 'PRIMER_LLAMADO')?.fecha ?? '2026-07-27'
    const martes = '2026-07-28'
    fake.plannedMesas.push(
      { id: 'x3', llamado: 'PRIMER_LLAMADO', fecha: martes, titularId: 'otro-titular', vocal1Id: historia.id, vocal2Id: null, materiaId: second.id, materia: second.nombreMateria },
      { id: 'x4', llamado: 'PRIMER_LLAMADO', fecha: lunes, titularId: second.titular_id, vocal1Id: historia.id, vocal2Id: null, materiaId: second.id, materia: second.nombreMateria },
      { id: 'x5', llamado: 'PRIMER_LLAMADO', fecha: lunes, titularId: second.titular_id, vocal1Id: historia.id, vocal2Id: null, materiaId: second.id, materia: second.nombreMateria },
    )
    const rules = new Set(checkInvariants(input, fake).map((violation) => violation.rule))
    for (const rule of ['TITULAR_OBLIGATORIO', 'PRACTICAS_DISCURSIVAS_AGRUPADAS', 'FECHA_FUERA_DEL_LLAMADO', 'ROL_DUPLICADO_EN_TRIBUNAL', 'TITULARIDAD_MOVIDA', 'VOCAL_SIN_AFINIDAD', 'DOCENTE_NO_ASISTE_ESE_DIA', 'LIMITE_VOCALIAS_MITAD_MAS_UNO']) expect(rules.has(rule), rule).toBe(true)
  })
})
