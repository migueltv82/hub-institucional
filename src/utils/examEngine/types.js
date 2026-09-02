// JSDoc typedefs used while the engine remains plain JavaScript.

export const EXAM_ENGINE_TYPES_VERSION = '0.1.0'

/**
 * @typedef {'pendiente'|'confirmada'|'cancelada'|'requiere_revision'} EstadoMesa
 */

/**
 * @typedef {'TITULAR'|'VOCAL_1'|'VOCAL_2'|'VOCAL_EXTERNO'|'TRIBUNAL_CRUZADO'} RolParticipacion
 */

/**
 * @typedef {'lunes'|'martes'|'miercoles'|'jueves'|'viernes'|'sabado'|'domingo'} DiaSemana
 */

/**
 * @typedef {'manana'|'tarde'|'noche'} Turno
 */

/**
 * @typedef {Object} Carrera
 * @property {string} id
 * @property {string} nombre
 */

/**
 * @typedef {Object} Docente
 * @property {string} id
 * @property {string} nombre
 * @property {string} dni
 * @property {string} email
 * @property {Array<DiaSemana>} diasAsistencia
 * @property {number} horasCatedra
 * @property {'TEACHING_HOURS_EXPLICIT'|'TEACHING_HOURS_INFERRED_FROM_SCHEDULE'|'MISSING_TEACHING_HOURS_SOURCE'} horasCatedraSource
 * @property {'DAYS_BASED_HALF_PLUS_ONE'|'TEACHING_HOURS_HALF_PLUS_ONE'} halfPlusOneRuleMode
 * @property {Array<string>} materias
 * @property {Array<string>} carreras
 */

/**
 * @typedef {Object} Materia
 * @property {string} id
 * @property {string} carrera
 * @property {string} codigo
 * @property {string} nombre
 * @property {string} anio
 * @property {Array<string>} correlativas
 * @property {Array<string>} familiasIdoneidad
 */

/**
 * @typedef {Object} Llamado
 * @property {'PRIMER_LLAMADO'|'SEGUNDO_LLAMADO'|'LLAMADO_ESPECIAL'} key
 * @property {number} numero
 * @property {string} label
 * @property {string} fechaInicio
 * @property {string} fechaFin
 */

/**
 * @typedef {Object} ExamPeriodConfig
 * @property {'REGULAR'|'ESPECIAL'} tipoPeriodo
 * @property {1|2} cantidadLlamados
 * @property {string} fechaInicio
 * @property {string} fechaFin
 * @property {string} [descripcion]
 */

/**
 * @typedef {Object} Correlatividad
 * @property {string} carrera
 * @property {string} materia
 * @property {Array<string>} correlativas
 */

/**
 * @typedef {Object} Tribunal
 * @property {Docente|null} titular
 * @property {Array<Docente>} vocales
 * @property {Array<Object>} tribunalesCruzados
 */

/**
 * @typedef {Object} ParticipacionTribunal
 * @property {string} docenteId
 * @property {string} mesaId
 * @property {string} [materiaId]
 * @property {string} [carreraId]
 * @property {RolParticipacion} rol
 * @property {'PRIMER_LLAMADO'|'SEGUNDO_LLAMADO'|'LLAMADO_ESPECIAL'} llamado
 * @property {string} [fecha]
 * @property {Turno|string} [turno]
 */

/**
 * @typedef {Object} MesaExamen
 * @property {string} id
 * @property {number} [numero]
 * @property {string} [materiaId]
 * @property {Carrera|string} carrera
 * @property {string} [carreraId]
 * @property {Materia|string} materia
 * @property {string} [fechaIso]
 * @property {string} [fecha]
 * @property {DiaSemana|string} [dia]
 * @property {string} [inicio]
 * @property {string} [hora]
 * @property {string} [fin]
 * @property {string} [aula]
 * @property {EstadoMesa} estado
 * @property {Llamado|string} [llamado]
 * @property {string} [titularId]
 * @property {string} [vocal1Id]
 * @property {string} [vocal2Id]
 * @property {Tribunal} [tribunal]
 * @property {Array<AlertaMotor|Object>} [alertas]
 */

/**
 * @typedef {Object} MesaExamenContract
 * @property {string} id
 * @property {string} materiaId
 * @property {Materia|string} materia
 * @property {string} carreraId
 * @property {Carrera|string} carrera
 * @property {string} fecha
 * @property {string} hora
 * @property {Turno|string} turno
 * @property {'PRIMER_LLAMADO'|'SEGUNDO_LLAMADO'|'LLAMADO_ESPECIAL'|string} llamado
 * @property {string} titularId
 * @property {string} vocal1Id
 * @property {string} vocal2Id
 * @property {EstadoMesa|string} estado
 * @property {Array<AlertaMotor|Object>} alertas
 */

/**
 * @typedef {Object} AlertaMotor
 * @property {string} codigo
 * @property {string} mensaje
 * @property {'info'|'warning'|'revision'} tipo
 * @property {Object} detalle
 */

/**
 * @typedef {Object} ErrorCriticoMotor
 * @property {string} codigo
 * @property {string} mensaje
 * @property {Object} detalle
 */

/**
 * @typedef {Object} DiagnosticoMotor
 * @property {boolean} puedeGenerar
 * @property {Array<AlertaMotor>} alertas
 * @property {Array<ErrorCriticoMotor>} erroresCriticos
 * @property {Object} metricas
 */

/**
 * @typedef {Object} ResumenDocente
 * @property {string} docenteId
 * @property {string} nombre
 * @property {number} diasAsistencia
 * @property {number} horasCatedra
 * @property {'DAYS_BASED_HALF_PLUS_ONE'|'TEACHING_HOURS_HALF_PLUS_ONE'} halfPlusOneRuleMode
 * @property {number} limiteVocaliasPorLlamado
 * @property {number} vocaliasAsignadas
 * @property {number} titularidadesAsignadas
 */

/**
 * @typedef {Object} ResultadoGeneracion
 * @property {Array<MesaExamen>} mesas
 * @property {DiagnosticoMotor} diagnostico
 * @property {Array<AlertaMotor>} alertas
 * @property {Array<ErrorCriticoMotor>} erroresCriticos
 * @property {Array<ResumenDocente>} resumenDocentes
 */

/**
 * @typedef {Object} ExamEngineInput
 * @property {Array<Object>} horariosDocentes
 * @property {Array<Docente|Object>} docentes
 * @property {Array<Materia|Object>} planesEstudio
 * @property {Array<Correlatividad|Object>} correlatividades
 * @property {Array<Object>} alumnos
 * @property {string} examType
 * @property {ExamPeriodConfig} examPeriodConfig
 * @property {Object} generationScope
 * @property {Object} regularCallRanges
 * @property {Array<string>} selectedSpecialSubjectKeys
 */

/**
 * @typedef {MesaExamen} ExamMesa
 */

/**
 * @typedef {Object} ExamEngineReport
 * @property {Array<Object>} diagnostics
 * @property {Array<Object>} errors
 * @property {Array<Object>} warnings
 * @property {Array<Object>} exclusions
 * @property {Object} metrics
 */

/**
 * @typedef {Object} ExamEngineResult
 * @property {Array<ExamMesa>} cronograma
 * @property {ExamEngineReport} report
 * @property {Object|null} diagnostics
 */
