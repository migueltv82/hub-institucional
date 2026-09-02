export const PUNTAJES_REGLAS_BLANDAS = {
  AGRUPACION_HOMONIMA_MISMO_TITULAR: 40,
  AGRUPACION_MISMO_DOCENTE: 25,
  PATRON_SEGUNDO_LLAMADO: 35,
  DOS_VOCALES: 20,
  UN_VOCAL: 10,
  EQUILIBRIO_CARGA_DOCENTE: 15,
  EVITAR_A_DESIGNAR: 20,
  EVITAR_CONCENTRACION_DIA: 10,
}

export const RAZONES_PUNTAJE = {
  AGRUPACION_HOMONIMA_MISMO_TITULAR: 'Agrupa materia homonima con mismo titular',
  AGRUPACION_MISMO_DOCENTE: 'Agrupa materias del mismo docente',
  PATRON_SEGUNDO_LLAMADO: 'Mantiene patron del primer llamado en el segundo',
  DOS_VOCALES: 'Asigna dos vocales',
  UN_VOCAL: 'Asigna un vocal',
  EQUILIBRIO_CARGA_DOCENTE: 'Equilibra carga docente',
  EVITAR_A_DESIGNAR: 'Evita A designar',
  EVITAR_CONCENTRACION_DIA: 'Evita concentracion excesiva de mesas el mismo dia',
}

function agregarPuntajeRegla(evaluacion, condicion, puntaje, razon) {
  if (!condicion) return

  evaluacion.puntaje += puntaje
  evaluacion.razones.push({ razon, puntaje })
}

export function construirEvaluacionPuntaje({
  advertencias = [],
  agrupacionHomonimaMismoTitular = false,
  agrupacionMismoDocente = false,
  cargaDocenteEquilibrada = false,
  errores = [],
  evitarConcentracionDia = false,
  mantienePatronSegundoLlamado = false,
  puntajeBase = 0,
  razones = [],
  usaADesignar = true,
  vocalesAsignados = 0,
} = {}) {
  const evaluacion = {
    permitido: errores.length === 0,
    errores,
    advertencias,
    puntaje: Number(puntajeBase || 0),
    razones: razones.filter(Boolean),
  }

  agregarPuntajeRegla(
    evaluacion,
    agrupacionHomonimaMismoTitular,
    PUNTAJES_REGLAS_BLANDAS.AGRUPACION_HOMONIMA_MISMO_TITULAR,
    RAZONES_PUNTAJE.AGRUPACION_HOMONIMA_MISMO_TITULAR,
  )
  agregarPuntajeRegla(
    evaluacion,
    agrupacionMismoDocente,
    PUNTAJES_REGLAS_BLANDAS.AGRUPACION_MISMO_DOCENTE,
    RAZONES_PUNTAJE.AGRUPACION_MISMO_DOCENTE,
  )
  agregarPuntajeRegla(
    evaluacion,
    mantienePatronSegundoLlamado,
    PUNTAJES_REGLAS_BLANDAS.PATRON_SEGUNDO_LLAMADO,
    RAZONES_PUNTAJE.PATRON_SEGUNDO_LLAMADO,
  )
  agregarPuntajeRegla(
    evaluacion,
    vocalesAsignados >= 2,
    PUNTAJES_REGLAS_BLANDAS.DOS_VOCALES,
    RAZONES_PUNTAJE.DOS_VOCALES,
  )
  agregarPuntajeRegla(
    evaluacion,
    vocalesAsignados === 1,
    PUNTAJES_REGLAS_BLANDAS.UN_VOCAL,
    RAZONES_PUNTAJE.UN_VOCAL,
  )
  agregarPuntajeRegla(
    evaluacion,
    cargaDocenteEquilibrada,
    PUNTAJES_REGLAS_BLANDAS.EQUILIBRIO_CARGA_DOCENTE,
    RAZONES_PUNTAJE.EQUILIBRIO_CARGA_DOCENTE,
  )
  agregarPuntajeRegla(
    evaluacion,
    !usaADesignar,
    PUNTAJES_REGLAS_BLANDAS.EVITAR_A_DESIGNAR,
    RAZONES_PUNTAJE.EVITAR_A_DESIGNAR,
  )
  agregarPuntajeRegla(
    evaluacion,
    evitarConcentracionDia,
    PUNTAJES_REGLAS_BLANDAS.EVITAR_CONCENTRACION_DIA,
    RAZONES_PUNTAJE.EVITAR_CONCENTRACION_DIA,
  )

  return evaluacion
}
