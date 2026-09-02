import { UsersRound } from 'lucide-react'
import { getPrimaryCareer } from '../../services/careerCatalog.js'

function clean(value) {
  return String(value ?? '').trim()
}

function firstClean(...values) {
  for (const value of values) {
    const cleaned = clean(value)
    if (cleaned) return cleaned
  }

  return ''
}

function normalizeText(value) {
  return clean(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function addCareerNameMapping(map, alias, name) {
  const cleanedAlias = clean(alias)
  const cleanedName = clean(name)

  if (!cleanedAlias || !cleanedName) return
  if (!map.has(cleanedAlias)) map.set(cleanedAlias, cleanedName)

  const normalizedAlias = normalizeText(cleanedAlias)
  if (normalizedAlias && !map.has(normalizedAlias)) map.set(normalizedAlias, cleanedName)
}

function buildCareerNamesById(planesEstudio = []) {
  return planesEstudio.reduce((map, row) => {
    const id = clean(row.carrera_id ?? row.carreraId ?? row.program_id ?? row.programId)
    const name = firstClean(
      row.carrera_nombre,
      row.carreraNombre,
      row.nombreCarrera,
      row.career_name,
      row.careerName,
      row.program_name,
      row.programName,
      row.carrera,
    )

    addCareerNameMapping(map, id, name)
    addCareerNameMapping(map, row.carrera, name)

    return map
  }, new Map())
}

function getMappedCareerName(careerNamesById, value) {
  const cleaned = clean(value)
  if (!cleaned) return ''

  return careerNamesById.get(cleaned) ?? careerNamesById.get(normalizeText(cleaned)) ?? ''
}

function studentIdentity(student = {}, index = 0) {
  return clean(student.alumno_id ?? student.alumnoId ?? student.id ?? student.dni ?? student.email) || `row:${index}`
}

function StudentCareerDashboard({
  alumnos = [],
  onSelectCareer,
  planesEstudio = [],
}) {
  const careerNamesById = buildCareerNamesById(planesEstudio)
  const studentsByCareer = alumnos.reduce((byCareer, student, index) => {
    const careerId = clean(student.carrera_id ?? student.carreraId)
    const primaryCareer = getPrimaryCareer(student)
    const mappedCareer = getMappedCareerName(careerNamesById, careerId) || getMappedCareerName(careerNamesById, primaryCareer)
    const career = mappedCareer || primaryCareer || (careerId ? `Carrera ID ${careerId}` : 'Sin carrera')
    const students = byCareer.get(career) ?? new Set()
    students.add(studentIdentity(student, index))
    byCareer.set(career, students)
    return byCareer
  }, new Map())
  const careerRows = Array.from(studentsByCareer.entries())
    .map(([career, students]) => [career, students.size])
    .sort((left, right) => {
      const byTotal = right[1] - left[1]
      return byTotal || left[0].localeCompare(right[0], 'es', { sensitivity: 'base' })
    })

  const maxTotal = careerRows[0]?.[1] ?? 0

  return (
    <section className="rise-in metric-card metric-card--blue">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">
            Dashboard alumnos
          </p>
          <h4 className="mt-2 text-2xl font-bold text-slate-950">
            Alumnos por carrera
          </h4>
        </div>
        <UsersRound className="h-5 w-5 text-sky-600" />
      </div>

      <div className="mt-5 space-y-4">
        {careerRows.length === 0 && (
          <p className="text-sm text-slate-600">
            Carga el padron de alumnos para ver la distribucion por carrera.
          </p>
        )}

        {careerRows.map(([career, total]) => (
          <button
            key={career}
            type="button"
            className="group block w-full space-y-2 rounded-lg p-2 text-left transition hover:bg-sky-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
            onClick={() => onSelectCareer?.(career)}
            aria-label={`Ver alumnos de ${career}`}
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-bold text-slate-950 group-hover:text-sky-800">{career}</p>
                <p className="text-xs text-slate-500">
                  {total} {total === 1 ? 'alumno cargado' : 'alumnos cargados'}
                </p>
              </div>
              <span className="status-chip border-slate-200 bg-slate-50 text-slate-800">
                {total}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-[linear-gradient(90deg,#06b6d4,#2563eb,#84cc16)]"
                style={{
                  width: `${maxTotal ? Math.max((total / maxTotal) * 100, 10) : 0}%`,
                }}
              />
            </div>
          </button>
        ))}
      </div>
    </section>
  )
}

export default StudentCareerDashboard
