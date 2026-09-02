// ---------------------------------------------------------------------------
// Reglas del algoritmo (R1–R4) — extraidas de ExamGenerationOptions.jsx para
// que ese archivo solo exporte componentes (requisito de react-refresh).
// ---------------------------------------------------------------------------

/** R1 — ⌊diasDeAsistencia/2⌋ + 1 */
export function calcMaxDiasAsignables(diasDeAsistencia) {
  if (!diasDeAsistencia || diasDeAsistencia <= 0) return 1
  return Math.floor(diasDeAsistencia / 2) + 1
}

/** R1 — ¿el docente ya alcanzó su límite de días? */
export function verificarLimiteMitadMasUno(docente, fecha, asignaciones) {
  const maxDias = calcMaxDiasAsignables(docente.diasDeAsistencia ?? docente.diasLaborales)
  const diasConAsignacion = new Set(
    asignaciones.filter((a) => a.docenteId === docente.id).map((a) => a.fecha)
  )
  const esFechaNueva = !diasConAsignacion.has(fecha)
  const diasUsados = diasConAsignacion.size
  return { superaLimite: esFechaNueva && diasUsados >= maxDias, diasUsados, maxDias }
}

/** R2 — No titular + vocal el mismo día */
export function verificarConflictoRoles(docenteId, fecha, rolNuevo, asignaciones) {
  const asignacionesDia = asignaciones.filter(
    (a) => a.docenteId === docenteId && a.fecha === fecha
  )
  if (rolNuevo === 'titular' && asignacionesDia.some((a) => a.rol === 'vocal'))
    return { conflicto: true, razon: 'El docente ya es vocal en otra mesa ese día.' }
  if (rolNuevo === 'vocal' && asignacionesDia.some((a) => a.rol === 'titular'))
    return { conflicto: true, razon: 'El docente ya es titular en otra mesa ese día.' }
  return { conflicto: false, razon: null }
}

/**
 * R3 — ¿dos materias son afines? (departamento → area → carrera)
 * FIX: el fallback a `carrera` ahora exige que el campo exista en ambas,
 * evitando que `undefined === undefined` retorne un falso positivo.
 */
export function sonMateriasAfines(materia1, materia2) {
  if (!materia1 || !materia2) return false
  if (materia1.id === materia2.id) return true
  if (materia1.departamento && materia2.departamento)
    return materia1.departamento === materia2.departamento
  if (materia1.area && materia2.area)
    return materia1.area === materia2.area
  // Fallback solo si carrera está definida en ambas
  if (materia1.carrera && materia2.carrera)
    return materia1.carrera === materia2.carrera
  return false
}

/** R3 — Chequea afinidad contra todas las mesas que ya tiene el docente ese día */
export function verificarAfinidadMateriasMismoDia(
  docenteId,
  fecha,
  nuevaMateria,
  asignaciones,
  allowSameDayRelatedSubjects
) {
  const asignacionesDia = asignaciones.filter(
    (a) => a.docenteId === docenteId && a.fecha === fecha
  )
  if (asignacionesDia.length === 0) return { conflicto: false, razon: null }
  if (!allowSameDayRelatedSubjects)
    return { conflicto: true, razon: 'La configuración no permite múltiples mesas el mismo día.' }
  const hayNoAfin = asignacionesDia.some((a) => !sonMateriasAfines(a.materia, nuevaMateria))
  if (hayNoAfin)
    return { conflicto: true, razon: 'Alguna mesa ya asignada ese día no es afín con esta materia.' }
  return { conflicto: false, razon: null }
}

/**
 * Validación unificada R1 + R2 + R3.
 * Retorna { puede: boolean, razon: string|null }
 */
export function puedeAsignarDocente(docente, fecha, rol, materia, asignaciones, opciones = {}) {
  const { applyHalfPlusOneRule = true, allowSameDayRelatedSubjects = true } = opciones

  const checkRoles = verificarConflictoRoles(docente.id, fecha, rol, asignaciones)
  if (checkRoles.conflicto) return { puede: false, razon: checkRoles.razon }

  const checkAfin = verificarAfinidadMateriasMismoDia(
    docente.id, fecha, materia, asignaciones, allowSameDayRelatedSubjects
  )
  if (checkAfin.conflicto) return { puede: false, razon: checkAfin.razon }

  const diasDeAsistencia = docente.diasDeAsistencia ?? docente.diasLaborales

  if (applyHalfPlusOneRule && diasDeAsistencia) {
    const { superaLimite, diasUsados, maxDias } = verificarLimiteMitadMasUno(
      docente, fecha, asignaciones
    )
    if (superaLimite)
      return {
        puede: false,
        razon: `El docente consumió ${diasUsados} de ${maxDias} días permitidos (⌊${diasDeAsistencia}/2⌋+1).`,
      }
  }

  return { puede: true, razon: null }
}

/**
 * R4 — Asigna hasta 2 vocales; acepta 1 si no hay más disponibles.
 * Retorna { vocales: Array, advertencia: string|null }
 */
export function asignarVocales(candidatos, fecha, materia, asignaciones, opciones = {}) {
  const vocales = []
  for (const candidato of candidatos) {
    if (vocales.length >= 2) break
    const { puede } = puedeAsignarDocente(
      candidato, fecha, 'vocal', materia, asignaciones, opciones
    )
    if (puede) vocales.push(candidato)
  }
  const advertencia =
    vocales.length === 0
      ? `Sin vocales disponibles para "${materia.nombre}".`
      : vocales.length === 1
        ? `Solo 1 vocal disponible para "${materia.nombre}".`
        : null
  return { vocales, advertencia }
}

/** Resumen de carga por docente — útil para debug o panel de estado */
export function resumenCargaDocentes(docentes, asignaciones) {
  return docentes.map((docente) => {
    const maxDias = calcMaxDiasAsignables(docente.diasDeAsistencia ?? docente.diasLaborales)
    const diasUsados = new Set(
      asignaciones.filter((a) => a.docenteId === docente.id).map((a) => a.fecha)
    ).size
    return {
      docenteId: docente.id,
      nombre: docente.nombre,
      diasUsados,
      maxDias,
      disponible: diasUsados < maxDias,
    }
  })
}

// ---------------------------------------------------------------------------
// Constantes de módulo (no pertenecen al ciclo de vida del componente)
// ---------------------------------------------------------------------------

export const EJEMPLO_DIAS = 4
export const EJEMPLO_MAX = calcMaxDiasAsignables(EJEMPLO_DIAS)
