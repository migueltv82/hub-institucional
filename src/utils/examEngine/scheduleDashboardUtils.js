function clean(value) {
  return String(value ?? '').trim()
}

function normalize(value) {
  return clean(value).toLowerCase().normalize('NFD').replaceAll(/[\u0300-\u036f]/g, '').replaceAll(/[^a-z0-9]+/g, ' ').trim()
}

function subjectCode(value) {
  return normalize(value).replaceAll(' ', '')
}

function hoursBetween(start, end) {
  const toMinutes = (value) => {
    const [hours, minutes] = clean(value).split(':').map(Number)
    return Number.isFinite(hours) && Number.isFinite(minutes) ? (hours * 60) + minutes : 0
  }
  return Math.max(0, toMinutes(end) - toMinutes(start)) / 60
}

export function crearClaveMateriaCronograma(subject = {}) {
  return `${normalize(subject.carrera)}::${subjectCode(subject.materia ?? subject.codigo)}`
}

export function materiaTieneHorarioCronograma(subject = {}, schedules = []) {
  const career = normalize(subject.carrera)
  const code = subjectCode(subject.materia ?? subject.codigo)
  return schedules.some((schedule) => (
    normalize(schedule.carrera) === career &&
    subjectCode(schedule.materia ?? schedule.codigo) === code
  ))
}

export function crearRankingDocentesPorHoras(schedules = [], schedule = []) {
  const ranking = new Map()
  schedules.forEach((row) => {
    const teacher = clean(row.profesor)
    if (!teacher) return
    const current = ranking.get(teacher) ?? { profesor: teacher, horas: 0, bloques: 0, carreras: new Set(), materias: new Set(), mesasAsignadas: 0 }
    current.horas += hoursBetween(row.inicio, row.fin)
    current.bloques += 1
    if (clean(row.carrera)) current.carreras.add(clean(row.carrera))
    if (clean(row.materia)) current.materias.add(clean(row.materia))
    ranking.set(teacher, current)
  })
  schedule.forEach((mesa) => {
    ;[mesa.profesorTitular, mesa.vocal1, mesa.vocal2].forEach((teacher) => {
      if (!clean(teacher) || clean(teacher) === 'A designar') return
      const current = ranking.get(teacher) ?? { profesor: teacher, horas: 0, bloques: 0, carreras: new Set(), materias: new Set(), mesasAsignadas: 0 }
      current.mesasAsignadas += 1
      ranking.set(teacher, current)
    })
  })
  return [...ranking.values()].map((teacher) => ({
    profesor: teacher.profesor,
    horas: Number(teacher.horas.toFixed(1)),
    bloques: teacher.bloques,
    carreras: teacher.carreras.size,
    materias: teacher.materias.size,
    mesasAsignadas: teacher.mesasAsignadas,
  })).sort((a, b) => b.horas - a.horas || b.mesasAsignadas - a.mesasAsignadas || a.profesor.localeCompare(b.profesor))
}
