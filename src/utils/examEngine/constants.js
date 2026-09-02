// Shared constants for the new exam table engine.

export const EXAM_GENERATION_TYPES = {
  REGULAR: 'regular',
  SPECIAL: 'special',
}

export const ESTADOS_MESA = {
  PENDIENTE: 'pendiente',
  CONFIRMADA: 'confirmada',
  CANCELADA: 'cancelada',
  REQUIERE_REVISION: 'requiere_revision',
}

export const ROLES_PARTICIPACION = {
  TITULAR: 'TITULAR',
  VOCAL_1: 'VOCAL_1',
  VOCAL_2: 'VOCAL_2',
  VOCAL_EXTERNO: 'VOCAL_EXTERNO',
  TRIBUNAL_CRUZADO: 'TRIBUNAL_CRUZADO',
  VOCAL: 'VOCAL_1',
}

export const TIPOS_ALERTA = {
  INFO: 'info',
  WARNING: 'warning',
  REVISION: 'revision',
}

export const TIPOS_ERROR = {
  DATOS_INSUFICIENTES: 'datos_insuficientes',
  TITULAR_OBLIGATORIO: 'titular_obligatorio',
  CORRELATIVIDAD_INVERTIDA: 'correlatividad_invertida',
  LLAMADOS_REQUERIDOS: 'llamados_requeridos',
  CONFIG_PERIODO_INVALIDA: 'config_periodo_invalida',
  VOCAL_SIN_IDONEIDAD: 'vocal_sin_idoneidad',
}

export const TIPOS_PERIODO = {
  REGULAR: 'REGULAR',
  ESPECIAL: 'ESPECIAL',
}

export const CANTIDADES_LLAMADOS = {
  UNO: 1,
  DOS: 2,
}

export const LLAMADOS = {
  PRIMERO: 'PRIMER_LLAMADO',
  SEGUNDO: 'SEGUNDO_LLAMADO',
  ESPECIAL: 'LLAMADO_ESPECIAL',
}

export const TURNOS = {
  MANANA: 'manana',
  TARDE: 'tarde',
  NOCHE: 'noche',
}

export const EXAM_CALLS = {
  FIRST: LLAMADOS.PRIMERO,
  SECOND: LLAMADOS.SEGUNDO,
  SPECIAL: LLAMADOS.ESPECIAL,
}

export const REGULAR_CALL_DEFINITIONS = [
  { key: EXAM_CALLS.FIRST, number: 1, label: 'Primer llamado' },
  { key: EXAM_CALLS.SECOND, number: 2, label: 'Segundo llamado' },
]

export const DOCENTE_A_DESIGNAR = 'A designar'

export const MAX_SUBJECTS_PER_MESA = 3

export const MATERIAS_NO_AGRUPABLES = [
  'practicas discursivas iii',
  'practicas discursivas iv',
]

export const NON_GROUPABLE_SUBJECT_NAMES = MATERIAS_NO_AGRUPABLES

export const FAMILIAS_IDONEIDAD = {
  MISMA_CARRERA: 'misma_carrera',
  MISMA_AREA: 'misma_area',
  AFINIDAD_EXPLICITA: 'afinidad_explicita',
  CORRELATIVIDAD_DIRECTA: 'correlatividad_directa',
  TRIBUNAL_CRUZADO: 'tribunal_cruzado',
}

export const HARD_RULES = [
  {
    code: 'DIAGNOSE_BEFORE_GENERATE',
    description: 'The engine must run diagnostics before producing exam tables.',
  },
  {
    code: 'SUBJECT_HAS_CONFIGURED_CALLS',
    description: 'Every subject must have the calls required by examPeriodConfig.cantidadLlamados.',
  },
  {
    code: 'TITULAR_REQUIRED',
    description: 'Every exam table must have a titular teacher.',
  },
  {
    code: 'MAX_GROUPED_SUBJECTS',
    description: 'A table can group at most MAX_SUBJECTS_PER_MESA subjects.',
  },
  {
    code: 'CORRELATIVITIES_NOT_INVERTED',
    description: 'Prerequisite order cannot be inverted.',
  },
  {
    code: 'PRACTICAS_DISCURSIVAS_NOT_GROUPABLE',
    description: 'Practicas Discursivas III and IV cannot be grouped.',
  },
  {
    code: 'HALF_PLUS_ONE_ONLY_VOCALIAS',
    description: 'Half plus one applies only to vocalia assignments.',
  },
  {
    code: 'TITULAR_DOES_NOT_CONSUME_HALF_PLUS_ONE',
    description: 'Tables assigned as titular do not consume half plus one quota.',
  },
  {
    code: 'VOCALIA_LIMIT_BY_CALL',
    description: 'Vocalia limit per call uses Math.floor(horasCatedra / 2) + 1; attendance day remains mandatory.',
  },
  {
    code: 'CROSS_TRIBUNAL_SEPARATE_RECORD',
    description: 'Cross tribunals must be recorded apart from common vocalias.',
  },
  {
    code: 'VOCAL_REQUIRES_AFFINITY',
    description: 'Vocales require academic affinity or institutional suitability.',
  },
  {
    code: 'SECOND_CALL_REPLICATES_FIRST',
    description: 'Second call should replicate first call logic whenever possible.',
  },
]
