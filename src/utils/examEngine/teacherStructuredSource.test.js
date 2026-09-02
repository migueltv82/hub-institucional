import { describe, expect, it } from 'vitest'
import {
  buildLegacyScheduleRowsFromStructuredTeacherSource,
  resolveTeacherScheduleSourceForGeneration,
  summarizeStructuredTeacherSource,
} from './teacherStructuredSource.js'

describe('teacherStructuredSource', () => {
  const workload = [{
    docente: 'Ana Diaz',
    carrera: 'Profesorado',
    materia_codigo: 'ING1',
    materia_nombre: 'Ingles I',
    horasCatedra: 4,
    rol_en_materia: 'titular',
    estado_asignacion: 'active',
  }]
  const availability = [{
    docente: 'Ana Diaz',
    dia: 'Lunes',
    turno: 'NOCHE',
    hora_desde: '18:00',
    hora_hasta: '20:00',
    estado: 'ACTIVE',
  }]

  it('detecta fuente estructurada valida con disponibilidad, carga, titularidad y horas', () => {
    expect(summarizeStructuredTeacherSource({
      disponibilidadDocente: availability,
      cargaHorariaDocente: workload,
    })).toMatchObject({
      source: 'structured',
      hasStructuredTeacherSource: true,
      hasValidTeacherSource: true,
      counts: {
        validAvailabilityRows: 1,
        validWorkloadRows: 1,
        titularRows: 1,
      },
    })
  })

  it('convierte la fuente estructurada a filas compatibles solo como puente de generacion', () => {
    expect(buildLegacyScheduleRowsFromStructuredTeacherSource({
      disponibilidadDocente: availability,
      cargaHorariaDocente: workload,
    })).toEqual([
      expect.objectContaining({
        profesor: 'Ana Diaz',
        carrera: 'Profesorado',
        materia: 'ING1',
        nombreMateria: 'Ingles I',
        horasCatedra: 4,
        rol_en_materia: 'TITULAR',
        dia: 'Lunes',
        inicio: '18:00',
        fin: '20:00',
        source: 'structured_teacher_source',
      }),
    ])
  })

  it('prioriza fuente estructurada valida sobre horariosDocentes legacy', () => {
    const result = resolveTeacherScheduleSourceForGeneration({
      disponibilidadDocente: availability,
      cargaHorariaDocente: workload,
      horariosDocentes: [{
        profesor: 'Docente Legacy',
        carrera: 'Profesorado',
        materia: 'ING1',
        dia: 'Martes',
      }],
    })

    expect(result).toMatchObject({
      source: 'structured',
      diagnostics: {
        hasStructuredTeacherSource: true,
        hasLegacyTeacherScheduleSource: true,
      },
    })
    expect(result.horariosDocentes).toEqual([
      expect.objectContaining({
        profesor: 'Ana Diaz',
        source: 'structured_teacher_source',
      }),
    ])
  })

  it('cae a horariosDocentes legacy cuando la fuente estructurada esta incompleta', () => {
    const legacyRows = [{ profesor: 'Docente Legacy', carrera: 'Profesorado', materia: 'ING1', dia: 'Martes' }]
    const result = resolveTeacherScheduleSourceForGeneration({
      disponibilidadDocente: [{ docente: 'Ana Diaz', hora_desde: '18:00', hora_hasta: '20:00' }],
      cargaHorariaDocente: [{ docente: 'Ana Diaz', materia_codigo: 'ING1', horasCatedra: 0 }],
      horariosDocentes: legacyRows,
    })

    expect(result.source).toBe('legacy')
    expect(result.horariosDocentes).toBe(legacyRows)
    expect(result.diagnostics.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'INCOMPLETE_TEACHER_AVAILABILITY' }),
      expect.objectContaining({ code: 'INCOMPLETE_TEACHER_WORKLOAD' }),
    ]))
  })
})
