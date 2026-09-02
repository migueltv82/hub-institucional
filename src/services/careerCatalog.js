function clean(value) {
  return String(value ?? '').trim()
}

function normalizeText(value) {
  return clean(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function asArray(value) {
  return Array.isArray(value) ? value : []
}

const INSTITUTIONAL_CAREER_NAMES_BY_CODE = new Map([
  ['geo', 'PROFESORADO DE GEOGRAFIA'],
  ['ing', 'PROFESORADO DE INGLES'],
  ['qui', 'PROFESORADO DE QUIMICA'],
  ['lab', 'TECNICO SUPERIOR EN LABORATORIO'],
  ['tra', 'TECNICO SUPERIOR EN TRADUCTORADO'],
  ['tur', 'TECNICO SUPERIOR EN TURISMO'],
  ['tecnico sup en traductorado', 'TECNICO SUPERIOR EN TRADUCTORADO'],
  ['tecnico super en traductorado', 'TECNICO SUPERIOR EN TRADUCTORADO'],
  ['tecnico superior en traductorado', 'TECNICO SUPERIOR EN TRADUCTORADO'],
  ['tecnico sup en turismo', 'TECNICO SUPERIOR EN TURISMO'],
  ['tecnico super en turismo', 'TECNICO SUPERIOR EN TURISMO'],
  ['tecnico superior en turismo', 'TECNICO SUPERIOR EN TURISMO'],
])

export function resolveCareerDisplayName(value) {
  return INSTITUTIONAL_CAREER_NAMES_BY_CODE.get(normalizeText(value)) ?? ''
}

const resolveInstitutionalCareerCode = resolveCareerDisplayName

function isLikelyCareerCode(value) {
  const compact = clean(value).replaceAll(/[^a-z0-9]/gi, '')
  return Boolean(compact) && (/^[a-z]{2,5}$/i.test(compact) || /^\d+$/.test(compact))
}

function uniqCareers(careers = []) {
  const byKey = new Map()

  careers.forEach((career) => {
    const cleaned = clean(career)
    const key = normalizeText(cleaned)

    if (!cleaned || !key || byKey.has(key)) return
    byKey.set(key, cleaned)
  })

  return Array.from(byKey.values())
    .sort((left, right) => left.localeCompare(right, 'es', { sensitivity: 'base' }))
}

function pushCareer(target, value) {
  const cleaned = clean(value)
  if (cleaned) target.push(cleaned)
}

function collectCareersFromRows(rows = []) {
  const careers = []

  asArray(rows).forEach((row) => {
    getCareerValues(row).forEach((career) => careers.push(career))
  })

  return uniqCareers(careers)
}

function getExplicitCareerNames(row = {}) {
  if (!row || typeof row !== 'object') return []

  const raw = row.raw ?? row.raw_payload ?? null
  const profile = row.profile && typeof row.profile === 'object' ? row.profile : null
  const careers = []

  ;[
    row.carrera_nombre,
    row.carreraNombre,
    row.nombreCarrera,
    row.career_name,
    row.careerName,
    row.program_name,
    row.programName,
    raw?.carrera_nombre,
    raw?.carreraNombre,
    raw?.nombreCarrera,
    raw?.career_name,
    raw?.careerName,
    raw?.program_name,
    raw?.programName,
    profile?.carrera_nombre,
    profile?.carreraNombre,
    profile?.nombreCarrera,
    profile?.career_name,
    profile?.careerName,
    profile?.program_name,
    profile?.programName,
  ].forEach((value) => pushCareer(careers, value))

  return uniqCareers(careers)
}

function collectPlanCareersFromRows(rows = []) {
  const groupsById = new Map()
  const ungroupedCareers = []

  asArray(rows).forEach((row) => {
    const careerId = clean(
      row?.carrera_id ?? row?.carreraId ?? row?.program_id ?? row?.programId,
    )
    const explicitNames = getExplicitCareerNames(row)
      .map((career) => resolveCareerDisplayName(career) || career)
    const values = getCareerValues(row)
      .map((career) => resolveCareerDisplayName(career) || career)

    if (!careerId) {
      const preferred = explicitNames.length
        ? explicitNames
        : values.flatMap((career) => (
          resolveInstitutionalCareerCode(career) || (!isLikelyCareerCode(career) ? career : [])
        ))
      preferred.forEach((career) => ungroupedCareers.push(career))
      return
    }

    const key = normalizeText(careerId)
    const group = groupsById.get(key) ?? {
      careerId,
      explicitNames: [],
      descriptiveNames: [],
    }
    explicitNames.forEach((career) => group.explicitNames.push(career))
    values
      .filter((career) => !isLikelyCareerCode(career))
      .forEach((career) => group.descriptiveNames.push(career))
    groupsById.set(key, group)
  })

  const groupedCareers = Array.from(groupsById.values()).flatMap((group) => {
    const candidates = uniqCareers(
      group.explicitNames.length ? group.explicitNames : group.descriptiveNames,
    )
    if (!candidates.length) {
      const knownName = resolveInstitutionalCareerCode(group.careerId)
      return knownName ? [knownName] : []
    }

    return [candidates.reduce((preferred, candidate) => (
      candidate.length > preferred.length ? candidate : preferred
    ))]
  })

  return uniqCareers([...groupedCareers, ...ungroupedCareers])
}

export function getCareerValues(row = {}) {
  if (!row || typeof row !== 'object') return []

  const raw = row.raw ?? row.raw_payload ?? null
  const profile = row.profile && typeof row.profile === 'object' ? row.profile : null
  const careers = []
  const explicitNames = getExplicitCareerNames(row)
  const hasExplicitName = explicitNames.length > 0

  explicitNames.forEach((career) => pushCareer(careers, career))

  ;[
    row.carrera,
    row.programa,
    row.program,
    row.career,
    row.program_name,
    raw?.carrera,
    raw?.programa,
    raw?.program,
    raw?.career,
    profile?.carrera,
    profile?.programa,
    profile?.program,
    profile?.career,
  ].forEach((value) => pushCareer(careers, value))

  ;[
    row.carreras,
    raw?.careers,
    raw?.carreras,
    profile?.carreras,
    profile?.raw?.careers,
    profile?.raw?.carreras,
  ].forEach((value) => {
    asArray(value).forEach((entry) => pushCareer(careers, entry))
  })

  const unique = uniqCareers(careers)
  return hasExplicitName
    ? unique.filter((career) => !isLikelyCareerCode(career) || explicitNames.some((explicit) => sameCareer(explicit, career)))
    : unique
}

function sameCareer(left, right) {
  return normalizeText(left) === normalizeText(right)
}

export function getPrimaryCareer(row = {}) {
  return getCareerValues(row)[0] ?? ''
}

export function buildCareerCatalog({
  alumnos = [],
  correlatividades = [],
  cronograma = [],
  docentes = [],
  horariosDocentes = [],
  planesEstudio = [],
} = {}) {
  const planCareers = collectPlanCareersFromRows(planesEstudio)

  if (planCareers.length > 0) {
    return planCareers
  }

  const fallbackSources = [
    alumnos,
    correlatividades,
    cronograma,
    docentes,
    horariosDocentes,
  ]
  const fallbackCareers = []

  fallbackSources.forEach((rows) => {
    collectCareersFromRows(rows).forEach((career) => fallbackCareers.push(career))
  })

  return uniqCareers(fallbackCareers)
}
