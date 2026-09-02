import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  buildSafeRelationalAuditReport,
  buildWorkspaceSnapshotFromRelationalData,
} from './relationalWorkspaceSnapshot.js'

function clone(value) {
  return structuredClone(value)
}

function source() {
  return readFileSync(
    join(process.cwd(), 'src/utils/examEngine/supabaseAudit/relationalWorkspaceSnapshot.js'),
    'utf8',
  )
}

describe('buildWorkspaceSnapshotFromRelationalData', () => {
  it('construye snapshot viejo desde teacher_records y subject_teacher_assignments', () => {
    const input = {
      teacherRecords: [
        {
          id: 'teacher-record-1',
          full_name: 'Docente Uno',
          dni: '123',
          raw_payload: { carreras: ['Profesorado A'] },
        },
      ],
      subjectTeacherAssignments: [
        {
          subject_id: 'MAT-1',
          program_id: 'Profesorado A',
          teacher_record_id: 'teacher-record-1',
          metadata: {
            subject_name: 'Materia 1',
            dia: 'LUNES',
            turno: 'NOCHE',
            hora_desde: '18:00',
            hora_hasta: '20:00',
            horas_catedra: 3,
          },
        },
      ],
      auditConfig: {
        fechaInicio: '2026-07-27',
        fechaFin: '2026-08-07',
      },
    }
    const original = clone(input)

    const result = buildWorkspaceSnapshotFromRelationalData(input)

    expect(result.snapshot.docentes).toHaveLength(1)
    expect(result.snapshot.planesEstudio).toHaveLength(1)
    expect(result.snapshot.horariosDocentes).toHaveLength(1)
    expect(result.snapshot.disponibilidadDocente).toEqual([
      expect.objectContaining({
        docenteId: 'teacher-record-1',
        dia: 'LUNES',
        turno: 'NOCHE',
        hora_desde: '18:00',
        hora_hasta: '20:00',
      }),
    ])
    expect(result.snapshot.cargaHorariaDocente).toEqual([
      expect.objectContaining({
        docenteId: 'teacher-record-1',
        materia_codigo: 'MAT-1',
        carrera: 'Profesorado A',
        horasCatedra: '3',
      }),
    ])
    expect(result.snapshot.correlatividades).toHaveLength(0)
    expect(result.diagnostics.counts).toMatchObject({
      disponibilidadDocente: 1,
      cargaHorariaDocente: 1,
    })
    expect(result.snapshot.fechaInicio).toBe('2026-07-27')
    expect(result.diagnostics.canRunPreview).toBe(true)
    expect(input).toEqual(original)
  })

  it('reconstruye disponibilidadDocente y cargaHorariaDocente desde tablas docentes estructuradas', () => {
    const result = buildWorkspaceSnapshotFromRelationalData({
      teacherRecords: [
        {
          id: 'teacher-record-1',
          full_name: 'Docente Uno',
          dni: '123',
          raw_payload: { carreras: ['Profesorado A'] },
        },
      ],
      teacherAvailabilityRecords: [
        {
          id: 'availability-1',
          teacher_record_id: 'teacher-record-1',
          teacher_name: 'Docente Uno',
          teacher_dni: '123',
          day_of_week: 'MARTES',
          shift: 'TARDE',
          start_time: '16:00',
          end_time: '18:00',
          is_available: false,
          reason: 'Comision institucional',
          status: 'active',
        },
      ],
      teacherWorkloadRecords: [
        {
          id: 'load-1',
          teacher_record_id: 'teacher-record-1',
          program_id: 'Profesorado A',
          plan_id: '2024',
          subject_id: 'MAT-1',
          subject_name: 'Materia 1',
          academic_year: '1',
          role: 'titular',
          titularity: 'titular',
          teaching_hours: 3,
          status: 'active',
        },
      ],
    })

    expect(result.snapshot.disponibilidadDocente).toEqual([
      expect.objectContaining({
        id: 'availability-1',
        docenteId: 'teacher-record-1',
        dia: 'MARTES',
        turno: 'TARDE',
        disponible: false,
        observacion: 'Comision institucional',
        source: 'teacher_availability_records',
      }),
    ])
    expect(result.snapshot.cargaHorariaDocente).toEqual([
      expect.objectContaining({
        id: 'load-1',
        docenteId: 'teacher-record-1',
        carrera: 'Profesorado A',
        plan: '2024',
        materia_codigo: 'MAT-1',
        horasCatedra: '3',
        source: 'teacher_workload_records',
      }),
    ])
    expect(result.diagnostics.counts).toMatchObject({
      teacherAvailabilityRecords: 1,
      teacherWorkloadRecords: 1,
      disponibilidadDocente: 1,
      cargaHorariaDocente: 1,
    })
  })

  it('preserva cargas generadas desde horarios sin inventar titularidad', () => {
    const result = buildWorkspaceSnapshotFromRelationalData({
      teacherRecords: [
        {
          id: 'teacher-record-1',
          full_name: 'Docente Uno',
          dni: '123',
          raw_payload: {},
        },
      ],
      teacherWorkloadRecords: [
        {
          id: 'carga-desde-horarios-1',
          teacher_record_id: 'teacher-record-1',
          program_id: 'Profesorado A',
          plan_id: '2024',
          subject_id: 'MAT-1',
          subject_name: 'Materia 1',
          academic_year: '1',
          role: 'titular',
          titularity: 'titular',
          teaching_hours: 3,
          status: 'active',
          source: 'horarios_docentes',
        },
      ],
    })

    expect(result.snapshot.cargaHorariaDocente).toEqual([
      expect.objectContaining({
        id: 'carga-desde-horarios-1',
        materia_codigo: 'MAT-1',
        horasCatedra: '3',
        rol: '',
        rol_en_materia: '',
        titularidad: 'false',
        source: 'horarios_docentes',
      }),
    ])
  })

  it('deriva materias desde inscripciones aunque no haya asignaciones docentes', () => {
    const result = buildWorkspaceSnapshotFromRelationalData({
      teacherRecords: [
        { id: 'teacher-record-1', full_name: 'Docente Uno', raw_payload: {} },
      ],
      subjectEnrollments: [
        { subject_id: 'ING-1', program_id: 'Profesorado B' },
      ],
    })

    expect(result.snapshot.planesEstudio).toHaveLength(1)
    expect(result.snapshot.horariosDocentes).toHaveLength(0)
    expect(result.diagnostics.missingData.map((item) => item.type))
      .toContain('missing_teacher_assignments')
  })

  it('reporta faltantes si no hay materias o docentes reconstruibles', () => {
    const result = buildWorkspaceSnapshotFromRelationalData({})

    expect(result.diagnostics.canRunPreview).toBe(false)
    expect(result.diagnostics.missingData.map((item) => item.type)).toEqual([
      'missing_subjects',
      'missing_teacher_assignments',
      'missing_teachers',
    ])
  })

  it('el reporte seguro no expone datos personales ni payloads', () => {
    const report = buildSafeRelationalAuditReport({
      tableReads: {
        teacher_records: {
          ok: true,
          rows: 1,
          used: true,
          data: [{ full_name: 'Nombre Real', dni: '12345678' }],
        },
      },
      snapshotDiagnostics: {
        counts: { docentes: 1 },
        causes: ['No hay fechas reales.'],
        recommendations: ['Cargar fechas.'],
      },
      efficiencySummary: {
        conclusion: 'NO EFICIENTE',
        recommendations: ['Cargar titulares faltantes.'],
      },
      previewRan: true,
    })
    const serialized = JSON.stringify(report)

    expect(serialized).not.toContain('Nombre Real')
    expect(serialized).not.toContain('12345678')
    expect(serialized).not.toContain('payload')
    expect(report.recommendations).toEqual([
      'Cargar fechas.',
      'Cargar titulares faltantes.',
    ])
  })

  it('no importa motor viejo, UI ni legacyAdapter', () => {
    const text = source()
    const oldEngine = ['cronograma', 'Inteligente'].join('')
    const oldHook = ['useCronograma', 'Generation'].join('')
    const adapter = ['legacy', 'Adapter'].join('')

    expect(text).not.toContain(oldEngine)
    expect(text).not.toContain(oldHook)
    expect(text).not.toContain(adapter)
    expect(text).not.toContain('components/')
  })
})
