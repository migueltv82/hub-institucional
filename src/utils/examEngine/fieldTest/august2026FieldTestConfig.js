import { CANTIDADES_LLAMADOS, TIPOS_PERIODO } from '../constants.js'
import { buildDateRange, getDayName } from '../normalize/dates.js'

export const DRAFT_SCHEDULE_STATUSES = {
  TEACHER_REVIEW: 'TEACHER_REVIEW',
  REVIEWED: 'REVIEWED',
  CONFIRMED: 'CONFIRMED',
  EXCLUDED_BY_REVIEW: 'EXCLUDED_BY_REVIEW',
  NEEDS_INSTITUTIONAL_REVIEW: 'NEEDS_INSTITUTIONAL_REVIEW',
  READY_FOR_TRIBUNAL: 'READY_FOR_TRIBUNAL',
}

const WEEKDAY_KEYS = new Set([
  'lunes',
  'martes',
  'miercoles',
  'jueves',
  'viernes',
])

export const AUGUST_2026_FIELD_TEST_START_DATE = '2026-07-30'
export const AUGUST_2026_FIELD_TEST_END_DATE = '2026-08-12'

export const AUGUST_2026_FIELD_TEST_WORKING_DATES = buildDateRange(
  AUGUST_2026_FIELD_TEST_START_DATE,
  AUGUST_2026_FIELD_TEST_END_DATE,
).filter((fecha) => WEEKDAY_KEYS.has(getDayName(fecha)))

export const august2026FieldTestConfig = {
  id: 'julio-agosto-2026-field-test',
  label: 'Julio-Agosto 2026',
  descripcion: 'Precronograma docente del llamado Julio-Agosto 2026.',
  tipoPeriodo: TIPOS_PERIODO.REGULAR,
  cantidadLlamados: CANTIDADES_LLAMADOS.UNO,
  fechaInicio: AUGUST_2026_FIELD_TEST_START_DATE,
  fechaFin: AUGUST_2026_FIELD_TEST_END_DATE,
  usarSoloDiasHabiles: true,
  diasHabiles: [...WEEKDAY_KEYS],
  fechasHabiles: [...AUGUST_2026_FIELD_TEST_WORKING_DATES],
  carrerasIncluidas: 'ALL',
  excepcionesCarrera: [
    {
      carrera: 'Geografia',
      soloAnios: [4],
      reasonCode: 'GEOGRAFIA_SOLO_CUARTO_ANIO',
      reason: 'En el llamado de prueba Geografia solo genera mesas de cuarto anio.',
    },
  ],
  estadoSalida: DRAFT_SCHEDULE_STATUSES.TEACHER_REVIEW,
  asignarVocales: false,
  aplicarMitadMasUno: false,
}

export function getAugust2026FieldTestConfig() {
  return {
    ...august2026FieldTestConfig,
    diasHabiles: [...august2026FieldTestConfig.diasHabiles],
    fechasHabiles: [...august2026FieldTestConfig.fechasHabiles],
    excepcionesCarrera: august2026FieldTestConfig.excepcionesCarrera.map((exception) => ({
      ...exception,
      soloAnios: [...exception.soloAnios],
    })),
  }
}
