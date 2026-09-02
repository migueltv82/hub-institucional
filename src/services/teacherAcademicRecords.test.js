import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  assertTeacherDisplayNames,
  assertTeacherWorkloadRows,
  buildTeacherAcademicMigrationPlan,
  buildTeacherAvailabilityRowsFromSnapshot,
  buildTeacherWorkloadRowsFromSnapshot,
  fetchTeacherAcademicRecords,
  getCareerName,
  getWorkloadSubjectName,
  normalizeTeacherAcademicStatus,
  normalizeTeacherRole,
  syncTeacherAcademicRecords,
} from './teacherAcademicRecords.js'

const mocks = vi.hoisted(() => ({
  store: {
    teacher_availability_records: [],
    teacher_workload_records: [],
  },
  calls: [],
  nextError: null,
}))

function keyForAvailability(row) {
  return [
    row.institution_id,
    row.workspace_key,
    row.teacher_identity,
    row.day_of_week,
    row.shift,
    row.start_time,
    row.end_time,
    row.valid_from,
    row.valid_until,
  ].join('::')
}

function keyForWorkload(row) {
  return [
    row.institution_id,
    row.workspace_key,
    row.teacher_identity,
    row.program_id,
    row.plan_id,
    row.subject_id,
    row.valid_from,
    row.valid_until,
  ].join('::')
}

function createQuery(tableName) {
  const query = {
    tableName,
    filters: [],
    select() {
      this.operation = 'select'
      return this
    },
    eq(column, value) {
      this.filters.push({ column, value })
      if (this.operation === 'select') {
        const data = mocks.store[tableName].filter((row) => (
          this.filters.every((filter) => row[filter.column] === filter.value)
        ))
        this.data = data
        this.error = mocks.nextError
      }
      return this
    },
    order() {
      return this
    },
    upsert(rows) {
      mocks.calls.push({ tableName, operation: 'upsert', rows })
      if (mocks.nextError) return { error: mocks.nextError }

      const keyForRow = tableName === 'teacher_availability_records' ? keyForAvailability : keyForWorkload
      const byKey = new Map(mocks.store[tableName].map((row) => [keyForRow(row), row]))
      rows.forEach((row, index) => {
        const existing = byKey.get(keyForRow(row))
        byKey.set(keyForRow(row), {
          ...existing,
          ...row,
          id: existing?.id ?? `${tableName}-${index + 1}`,
        })
      })
      mocks.store[tableName] = [...byKey.values()]
      return { error: null }
    },
    delete() {
      return {
        in(column, values) {
          mocks.calls.push({ tableName, operation: 'delete', column, values })
          mocks.store[tableName] = mocks.store[tableName].filter((row) => !values.includes(row[column]))
          return { error: null }
        },
      }
    },
  }

  return query
}

vi.mock('../lib/supabase.js', () => ({
  isSupabaseConfigured: true,
  supabase: {
    from: (tableName) => createQuery(tableName),
  },
}))

describe('teacherAcademicRecords service', () => {
  beforeEach(() => {
    mocks.store.teacher_availability_records = []
    mocks.store.teacher_workload_records = []
    mocks.calls = []
    mocks.nextError = null
  })

  it('normaliza estados docentes al contrato relacional Supabase', () => {
    expect(normalizeTeacherAcademicStatus('active')).toBe('ACTIVE')
    expect(normalizeTeacherAcademicStatus('inactive')).toBe('INACTIVE')
    expect(normalizeTeacherAcademicStatus('archived')).toBe('ARCHIVED')
    expect(normalizeTeacherAcademicStatus('draft')).toBe('DRAFT')
    expect(normalizeTeacherAcademicStatus('')).toBe('ACTIVE')
    expect(normalizeTeacherAcademicStatus('desconocido')).toBe('ACTIVE')
  })

  it('normaliza roles docentes al contrato relacional Supabase', () => {
    expect(normalizeTeacherRole('titular')).toBe('TITULAR')
    expect(normalizeTeacherRole('co docente')).toBe('CO_DOCENTE')
    expect(normalizeTeacherRole('auxiliar')).toBe('AUXILIAR')
    expect(normalizeTeacherRole('suplente')).toBe('SUPLENTE')
    expect(normalizeTeacherRole('reemplazo')).toBe('REEMPLAZO')
    expect(normalizeTeacherRole('')).toBe('TITULAR')
    expect(normalizeTeacherRole('desconocido')).toBe('TITULAR')
  })

  it('normaliza nombre de carrera desde aliases de carga horaria', () => {
    expect(getCareerName({ careerName: 'Tecnicatura' })).toBe('Tecnicatura')
    expect(getCareerName({ carrera: 'Profesorado' })).toBe('Profesorado')
    expect(getCareerName({ career_name: 'Licenciatura' })).toBe('Licenciatura')
    expect(getCareerName({ career: { name: 'Postitulo' } })).toBe('Postitulo')
    expect(getCareerName({ raw_payload: { careerName: 'Raw Carrera' } })).toBe('Raw Carrera')
  })

  it('normaliza nombre de materia desde aliases de carga horaria', () => {
    expect(getWorkloadSubjectName({ subjectName: 'Ingles I' })).toBe('Ingles I')
    expect(getWorkloadSubjectName({ materia_nombre: 'Matematica' })).toBe('Matematica')
    expect(getWorkloadSubjectName({ materia: 'Historia' })).toBe('Historia')
  })

  it('guarda disponibilidad docente y evita duplicados', async () => {
    const result = await syncTeacherAcademicRecords({
      institutionId: 'inst-1',
      workspaceKey: 'main',
      useRemote: true,
      snapshot: {
        docentes: [{ record_id: 'teacher-1', full_name: 'Ana Diaz', dni: '30111222' }],
        disponibilidadDocente: [
          { docenteId: 'teacher-1', docente: 'Ana Diaz', dia: 'Lunes', turno: 'Noche', hora_desde: '18:00', hora_hasta: '20:00' },
          { docenteId: 'teacher-1', docente: 'Ana Diaz', dia: 'Lunes', turno: 'Noche', hora_desde: '18:00', hora_hasta: '20:00' },
        ],
        cargaHorariaDocente: [],
      },
    })

    expect(result.availability).toMatchObject({ skipped: false, synced: 1 })
    expect(mocks.store.teacher_availability_records).toEqual([
      expect.objectContaining({
        teacher_record_id: 'teacher-1',
        teacher_identity: 'teacher-1',
        teacher_display_name: 'Ana Diaz',
        teacher_name: 'Ana Diaz',
        status: 'ACTIVE',
        day_of_week: 'Lunes',
        start_time: '18:00',
        end_time: '20:00',
      }),
    ])
  })

  it('lee disponibilidad docente desde Supabase', async () => {
    mocks.store.teacher_availability_records = [{
      id: 'availability-1',
      institution_id: 'inst-1',
      workspace_key: 'main',
      teacher_record_id: 'teacher-1',
      teacher_name: 'Ana Diaz',
      teacher_dni: '30111222',
      day_of_week: 'Lunes',
      shift: 'Noche',
      start_time: '18:00',
      end_time: '20:00',
      is_available: true,
      reason: 'Prefiere noche',
      status: 'active',
      valid_from: '',
      valid_until: '',
      source: 'manual',
    }]

    const result = await fetchTeacherAcademicRecords({
      institutionId: 'inst-1',
      workspaceKey: 'main',
      useRemote: true,
    })

    expect(result.disponibilidadDocente).toEqual([
      expect.objectContaining({
        id: 'availability-1',
        docente: 'Ana Diaz',
        dia: 'Lunes',
        hora_desde: '18:00',
        hora_hasta: '20:00',
        observacion: 'Prefiere noche',
      }),
    ])
  })

  it('guarda carga horaria docente y evita duplicados por docente carrera materia vigencia', async () => {
    await syncTeacherAcademicRecords({
      institutionId: 'inst-1',
      workspaceKey: 'main',
      useRemote: true,
      snapshot: {
        docentes: [{ record_id: 'teacher-1', full_name: 'Ana Diaz', dni: '30111222' }],
        disponibilidadDocente: [],
        cargaHorariaDocente: [
          { docenteId: 'teacher-1', docente: 'Ana Diaz', carrera: 'Profesorado', plan: '2024', materia_codigo: 'ING1', materia_nombre: 'Ingles I', horasCatedra: 4, rol: 'titular' },
          { docenteId: 'teacher-1', docente: 'Ana Diaz', carrera: 'Profesorado', plan: '2024', materia_codigo: 'ING1', materia_nombre: 'Ingles I', horasCatedra: 4, rol: 'titular' },
        ],
      },
    })

    expect(mocks.store.teacher_workload_records).toEqual([
      expect.objectContaining({
        teacher_record_id: 'teacher-1',
        teacher_display_name: 'Ana Diaz',
        teacher_name: 'Ana Diaz',
        status: 'ACTIVE',
        program_id: 'Profesorado',
        career_name: 'Profesorado',
        plan_id: '2024',
        subject_id: 'ING1',
        subject_name: 'Ingles I',
        teaching_hours: 4,
        role: 'TITULAR',
      }),
    ])
  })

  it('no convierte cargas generadas desde horarios en titularidades relacionales', () => {
    const rows = buildTeacherWorkloadRowsFromSnapshot({
      institutionId: 'inst-1',
      workspaceKey: 'main',
      docentes: [{ record_id: 'teacher-1', full_name: 'Ana Diaz' }],
      cargaHorariaDocente: [
        {
          id: 'carga-desde-horarios-1',
          docenteId: 'teacher-1',
          carrera: 'Profesorado',
          materia_codigo: 'ING1',
          materia_nombre: 'Ingles I',
          horasCatedra: 4,
          rol_en_materia: 'TITULAR',
          titularidad: false,
          source: 'horarios_docentes',
          observaciones: 'Generado desde horarios docentes.',
        },
      ],
    })

    expect(rows).toEqual([
      expect.objectContaining({
        source: 'horarios_docentes',
        role: '',
        titularity: 'false',
      }),
    ])
  })

  it('lee carga horaria docente desde Supabase', async () => {
    mocks.store.teacher_workload_records = [{
      id: 'load-1',
      institution_id: 'inst-1',
      workspace_key: 'main',
      teacher_record_id: 'teacher-1',
      teacher_name: 'Ana Diaz',
      teacher_dni: '30111222',
      program_id: 'Profesorado',
      career_name: 'Profesorado',
      plan_id: '2024',
      subject_id: 'ING1',
      subject_name: 'Ingles I',
      academic_year: '1',
      role: 'titular',
      titularity: 'titular',
      teaching_hours: 4,
      status: 'active',
      valid_from: '',
      valid_until: '',
      source: 'manual',
    }]

    const result = await fetchTeacherAcademicRecords({
      institutionId: 'inst-1',
      workspaceKey: 'main',
      useRemote: true,
    })

    expect(result.cargaHorariaDocente).toEqual([
      expect.objectContaining({
        id: 'load-1',
        docente: 'Ana Diaz',
        carrera: 'Profesorado',
        plan: '2024',
        materia_codigo: 'ING1',
        horasCatedra: 4,
      }),
    ])
  })

  it('mapea teacher_display_name en disponibilidad cuando el docente se resuelve por teacher_record_id', () => {
    const rows = buildTeacherAvailabilityRowsFromSnapshot({
      institutionId: 'inst-1',
      workspaceKey: 'main',
      docentes: [{ record_id: 'teacher-1', full_name: 'Ana Diaz', dni: '30111222' }],
      disponibilidadDocente: [
        { teacher_record_id: 'teacher-1', dia: 'Martes', hora_desde: '09:00', hora_hasta: '11:00' },
      ],
    })

    expect(rows).toEqual([
      expect.objectContaining({
        teacher_record_id: 'teacher-1',
        teacher_identity: 'teacher-1',
        teacher_display_name: 'Ana Diaz',
        teacher_name: 'Ana Diaz',
        status: 'ACTIVE',
      }),
    ])
  })

  it('mapea teacher_display_name en carga horaria cuando el docente se resuelve por teacher_record_id', () => {
    const rows = buildTeacherWorkloadRowsFromSnapshot({
      institutionId: 'inst-1',
      workspaceKey: 'main',
      docentes: [{ record_id: 'teacher-1', full_name: 'Ana Diaz', dni: '30111222' }],
      cargaHorariaDocente: [
        { teacher_record_id: 'teacher-1', carrera: 'Profesorado', materia_codigo: 'ING1', horasCatedra: 4 },
      ],
    })

    expect(rows).toEqual([
      expect.objectContaining({
        teacher_record_id: 'teacher-1',
        teacher_identity: 'teacher-1',
        teacher_display_name: 'Ana Diaz',
        teacher_name: 'Ana Diaz',
        status: 'ACTIVE',
        career_name: 'Profesorado',
        subject_name: 'ING1',
      }),
    ])
  })

  it('normaliza status legacy en disponibilidad y carga horaria', () => {
    const availabilityRows = buildTeacherAvailabilityRowsFromSnapshot({
      institutionId: 'inst-1',
      workspaceKey: 'main',
      docentes: [{ record_id: 'teacher-1', full_name: 'Ana Diaz' }],
      disponibilidadDocente: [
        { docenteId: 'teacher-1', dia: 'Lunes', hora_desde: '18:00', hora_hasta: '20:00', status: 'inactive' },
      ],
    })
    const workloadRows = buildTeacherWorkloadRowsFromSnapshot({
      institutionId: 'inst-1',
      workspaceKey: 'main',
      docentes: [{ record_id: 'teacher-1', full_name: 'Ana Diaz' }],
      cargaHorariaDocente: [
        { docenteId: 'teacher-1', carrera: 'Profesorado', materia_codigo: 'ING1', horasCatedra: 4, estado: 'draft' },
      ],
    })

    expect(availabilityRows[0].status).toBe('INACTIVE')
    expect(workloadRows[0].status).toBe('DRAFT')
    expect(workloadRows[0].role).toBe('TITULAR')
  })

  it('carga horaria con careerName genera career_name y normaliza role', () => {
    const rows = buildTeacherWorkloadRowsFromSnapshot({
      institutionId: 'inst-1',
      workspaceKey: 'main',
      docentes: [{ record_id: 'teacher-1', full_name: 'Ana Diaz' }],
      cargaHorariaDocente: [
        { docenteId: 'teacher-1', careerName: 'Tecnicatura', subjectName: 'Algebra', subject_id: 'ALG1', horasCatedra: 3, rol: 'titular' },
      ],
    })

    expect(rows[0]).toMatchObject({
      program_id: 'Tecnicatura',
      career_name: 'Tecnicatura',
      subject_name: 'Algebra',
      role: 'TITULAR',
    })
  })

  it('carga horaria sin carrera no genera fila migrable', () => {
    const rows = buildTeacherWorkloadRowsFromSnapshot({
      institutionId: 'inst-1',
      workspaceKey: 'main',
      docentes: [{ record_id: 'teacher-1', full_name: 'Ana Diaz' }],
      cargaHorariaDocente: [
        { docenteId: 'teacher-1', materia_codigo: 'ING1', materia_nombre: 'Ingles I', horasCatedra: 4 },
      ],
    })

    expect(rows).toEqual([])
  })

  it('falla antes del upsert si carga horaria no tiene campos requeridos', () => {
    expect(() => assertTeacherWorkloadRows([
      {
        teacher_display_name: 'Ana Diaz',
        career_name: '',
        subject_name: 'Ingles I',
        teaching_hours: 4,
      },
    ])).toThrow(/faltan campos requeridos/)
  })

  it('falla antes del upsert si falta teacher_display_name', () => {
    expect(() => assertTeacherDisplayNames([
      { teacher_record_id: 'teacher-1', teacher_identity: 'teacher-1' },
    ], 'teacher_availability_records')).toThrow(/falta teacher_display_name/)
  })

  it('mantiene fallback si Supabase no tiene las tablas nuevas', async () => {
    mocks.nextError = {
      code: '42P01',
      message: 'relation teacher_availability_records does not exist',
    }

    const result = await fetchTeacherAcademicRecords({
      institutionId: 'inst-1',
      workspaceKey: 'main',
      useRemote: true,
    })

    expect(result).toMatchObject({
      skipped: true,
      disponibilidadDocente: [],
      cargaHorariaDocente: [],
    })
  })

  it('audita registros incompletos para migracion desde snapshot', () => {
    const plan = buildTeacherAcademicMigrationPlan({
      docentes: [{ record_id: 'teacher-1', full_name: 'Ana Diaz' }],
      disponibilidadDocente: [
        { docenteId: 'teacher-1', dia: 'Lunes', hora_desde: '18:00', hora_hasta: '20:00' },
        { docenteId: 'teacher-1', dia: '', hora_desde: '18:00', hora_hasta: '20:00' },
      ],
      cargaHorariaDocente: [
        { docenteId: 'teacher-1', carrera: 'Profesorado', materia_codigo: 'ING1', horasCatedra: 4 },
        { docenteId: 'teacher-1', carrera: 'Profesorado', materia_codigo: '', horasCatedra: 4 },
      ],
    })

    expect(plan.audit).toMatchObject({
      disponibilidadDocente: { total: 2, migratable: 1, incomplete: 1 },
      cargaHorariaDocente: { total: 2, migratable: 1, incomplete: 1 },
    })
  })
})
