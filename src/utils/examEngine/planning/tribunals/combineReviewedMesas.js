import { compactCompatibleMesas } from '../compactMesas.js'
import {
  detectarFamiliaMateria,
  esMateriaIntercarreraPermitida,
  FAMILIAS_AFINIDAD,
} from '../../rules/affinities.js'

// Manual merge of reviewed-schedule mesas into one, reusing compactMesas.js
// as the compatibility gate instead of duplicating institutional rules here.
//
// The merged mesa returns to the interactive tribunal step, where vocales are
// chosen or prefilled from cross titulares.

export const REASON_LABELS = {
  MAXIMO_DOS_MATERIAS: 'La combinacion superaria el maximo de dos materias por mesa.',
  MAXIMO_TRES_MATERIAS: 'La combinacion superaria el maximo de tres materias por mesa.',
  MATERIA_NO_AGRUPABLE: 'Una de las materias no se puede agrupar con otra.',
  DATOS_INCOMPLETOS: 'Faltan datos minimos (titular o identificador de mesa) para combinar.',
  DISTINTO_LLAMADO: 'Pertenecen a llamados distintos.',
  TITULARES_SIN_CLASE_ESE_DIA: 'No todos los titulares de las materias combinadas dictan clase ese dia.',
  PRACTICA_TECNICA_INCOMPATIBLE: 'No se pueden combinar practicas tecnicas incompatibles entre si ni con practicas pedagogicas.',
  TITULAR_DUPLICADO_COMO_VOCAL: 'Un titular quedaria registrado como vocal de la mesa combinada.',
  TRIBUNAL_INVALIDO: 'El tribunal resultante de la combinacion no es valido. Asigna primero los vocales de alguna de las dos mesas e intenta de nuevo.',
  SIN_AFINIDAD: 'Las materias no tienen afinidad academica suficiente para compartir tribunal.',
  MITAD_MAS_UNO_EXCEDIDA: 'Combinarlas superaria el limite de mitad mas uno de algun docente.',
  COMPACTACION_NO_SEGURA: 'La combinacion no es segura en el modo institucional actual.',
  INTERCARRERA_NO_PERMITIDA: 'Solo se pueden combinar carreras distintas en mesas pedagogicas/didacticas o TIC/Tecnologia de la Informacion.',
}

function clean(value) {
  return String(value ?? '').trim()
}

function normalize(value) {
  return clean(value)
    .toLowerCase()
    .normalize('NFD')
    .replaceAll(/[\u0300-\u036f]/g, '')
}

function sourceSubject(mesa = {}) {
  return mesa.metadata?.sourceMateria ?? mesa
}

function isTicSubject(subject = {}) {
  return detectarFamiliaMateria(subject) === FAMILIAS_AFINIDAD.INFORMATICA_TIC
}

function isPedagogicalSubject(subject = {}) {
  return esMateriaIntercarreraPermitida(subject) && !isTicSubject(subject)
}

export function canCombineMesasByCareerRule(mesaA = {}, mesaB = {}) {
  if (normalize(mesaA.carrera) && normalize(mesaA.carrera) === normalize(mesaB.carrera)) return true

  const subjectA = sourceSubject(mesaA)
  const subjectB = sourceSubject(mesaB)
  return (
    (isTicSubject(subjectA) && isTicSubject(subjectB)) ||
    (isPedagogicalSubject(subjectA) && isPedagogicalSubject(subjectB))
  )
}

function adaptReviewedMesaForCompaction(mesa = {}) {
  const sourceMateria = mesa.metadata?.sourceMateria ?? {}
  return {
    id: clean(mesa.draftMesaId ?? mesa.id),
    materiaId: mesa.materiaId,
    materia: mesa.materiaMesa ?? mesa.materia,
    materiasAgrupadas: mesa.materiasAgrupadas,
    carreraId: mesa.carreraId,
    carrera: mesa.carrera,
    anio: mesa.anio,
    titularId: mesa.titularId,
    titular: mesa.titular,
    titularesInvolucrados: mesa.titularesInvolucrados,
    titularesDetalle: mesa.titularesDetalle,
    vocal1Id: mesa.vocal1Id ?? '',
    vocal2Id: mesa.vocal2Id ?? '',
    llamado: mesa.llamado,
    grupo_afin_mesa: mesa.grupo_afin_mesa ?? mesa.grupoAfinMesa ?? sourceMateria.grupo_afin_mesa ?? sourceMateria.grupoAfinMesa,
    codigos_materias_afines: mesa.codigos_materias_afines ?? mesa.codigosMateriasAfines ?? sourceMateria.codigos_materias_afines ?? sourceMateria.codigosMateriasAfines,
  }
}

function getOriginalSourceMesas(mesa = {}) {
  const sourceMesas = mesa.metadata?.combinedFrom?.sourceMesas
  if (Array.isArray(sourceMesas) && sourceMesas.length) return sourceMesas
  return [mesa]
}

function mapCompactedMesaToReviewedSchedule({ compactedMesa, mesaA, mesaB }) {
  const sourceMesas = [
    ...getOriginalSourceMesas(mesaA),
    ...getOriginalSourceMesas(mesaB),
  ]

  return {
    ...mesaA,
    id: compactedMesa.id,
    draftMesaId: compactedMesa.id,
    materiaId: compactedMesa.materiaId,
    materia: compactedMesa.materia,
    materiaMesa: compactedMesa.materia,
    carreraId: compactedMesa.carreraId,
    carrera: compactedMesa.carrera,
    llamado: compactedMesa.llamado,
    titularId: compactedMesa.titularId,
    vocal1Id: '',
    vocal2Id: '',
    fecha: mesaA.fechaSugerida ?? mesaA.fecha,
    fechaSugerida: mesaA.fechaSugerida ?? mesaA.fecha,
    turno: mesaA.turno,
    estado: 'READY_FOR_TRIBUNAL',
    materiasAgrupadas: compactedMesa.materiasAgrupadas,
    combinada: true,
    tribunalCruzado: compactedMesa.tribunalCruzado,
    titularesInvolucrados: compactedMesa.titularesInvolucrados,
    titularesDetalle: compactedMesa.titularesDetalle,
    tipoCompactacion: compactedMesa.tipoCompactacion,
    alertas: [
      ...(Array.isArray(mesaA.alertas) ? mesaA.alertas : []),
      ...(Array.isArray(mesaB.alertas) ? mesaB.alertas : []),
    ],
    metadata: {
      ...(compactedMesa.metadata ?? {}),
      combinedFrom: {
        sourceMesas,
      },
    },
  }
}

export function evaluateMesaCombination({
  mesaA,
  mesaB,
  docentes = [],
  correlatividades = [],
  config = {},
} = {}) {
  if (!canCombineMesasByCareerRule(mesaA, mesaB)) {
    return {
      success: false,
      reason: 'INTERCARRERA_NO_PERMITIDA',
      detail: REASON_LABELS.INTERCARRERA_NO_PERMITIDA,
    }
  }

  const result = compactCompatibleMesas({
    mesas: [
      adaptReviewedMesaForCompaction(mesaA),
      adaptReviewedMesaForCompaction(mesaB),
    ],
    docentes,
    correlatividades,
    config,
    options: { allowIncompleteTribunal: true },
  })

  if (result.skipped.length) {
    const [skipped] = result.skipped
    return {
      success: false,
      reason: skipped.reason,
      detail: skipped.detail,
    }
  }

  const [compactedMesa] = result.mesasCompactadas
  if (!compactedMesa || result.mesasCompactadas.length !== 1) {
    return {
      success: false,
      reason: 'TRIBUNAL_INVALIDO',
      detail: 'No se pudo generar la mesa combinada.',
    }
  }

  return {
    success: true,
    combinedMesa: mapCompactedMesaToReviewedSchedule({ compactedMesa, mesaA, mesaB }),
  }
}
