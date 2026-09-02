import { describe, expect, it } from 'vitest'
import {
  EXPECTED_SUBJECT_UNIVERSE_SOURCE_MISSING,
  buildExamEngineShadowAudit,
  buildSafeExamEngineShadowAuditJson,
  renderExamEngineShadowAuditMarkdown,
} from './buildExamEngineShadowAudit.js'

function workload({ docenteId, docente, materia, role = 'TITULAR', hours = 4 }) {
  return {
    docenteId,
    docente,
    carrera: 'Carrera A',
    materia,
    nombreMateria: `Materia ${materia}`,
    rol: role,
    titularidad: role === 'TITULAR',
    horasCatedra: hours,
    estado: 'ACTIVE',
  }
}

function availability(docenteId, docente) {
  return {
    docenteId,
    docente,
    dia: 'lunes',
    turno: 'NOCHE',
    horaDesde: '18:00',
    horaHasta: '20:00',
    disponible: true,
    estado: 'ACTIVE',
  }
}

function fixture(overrides = {}) {
  const tableId = 'pre-carreraa::mat1'
  return {
    planesEstudio: [
      { carrera: 'Carrera A', materia: 'MAT1', nombreMateria: 'Materia Uno', anio: '1', requiereMesa: true },
      { carrera: 'Carrera A', materia: 'MAT2', nombreMateria: 'Materia Dos', anio: '1', requiereMesa: true },
    ],
    cargaHorariaDocente: [
      workload({ docenteId: 'ana', docente: 'Ana Titular', materia: 'MAT1' }),
      workload({ docenteId: 'bruno', docente: 'Bruno Vocal', materia: 'MAT3', role: 'AUXILIAR' }),
      workload({ docenteId: 'carla', docente: 'Carla Vocal', materia: 'MAT4', role: 'AUXILIAR' }),
    ],
    disponibilidadDocente: [
      availability('ana', 'Ana Titular'),
      availability('bruno', 'Bruno Vocal'),
      availability('carla', 'Carla Vocal'),
    ],
    fechasBloqueadasDocente: [
      {
        id: 'block-ana',
        docenteId: 'ana',
        docenteNombre: 'Ana Titular',
        date: '2026-07-13',
        scope: 'FULL_DAY',
        status: 'ACTIVE',
        reason: 'Dato sensible titular',
      },
      {
        id: 'block-bruno',
        docenteId: 'bruno',
        docenteNombre: 'Bruno Vocal',
        date: '2026-07-13',
        scope: 'TIME_RANGE',
        startTime: '18:30',
        endTime: '19:30',
        status: 'ACTIVE',
        reason: 'Dato sensible vocal',
      },
    ],
    correlatividades: [],
    fechaInicio: '2026-07-13',
    fechaFin: '2026-07-13',
    examGenerationConfig: {
      regularCallRanges: {
        first: { start: '2026-07-13', end: '2026-07-13' },
      },
    },
    adminReviewDecisions: [{
      decisionId: 'decision-bruno',
      type: 'TRIBUNAL_SELECTION',
      targetId: `${tableId}::teacher-bruno::VOCAL`,
      decision: 'SELECTED',
      reason: 'Seleccion fixture',
      metadata: {
        tableId,
        teacherId: 'teacher-bruno',
        teacherName: 'Bruno Vocal',
        role: 'VOCAL',
        date: '2026-07-13',
        shift: 'NOCHE',
        startTime: '18:00',
        endTime: '20:00',
      },
      hardRuleViolations: [],
    }],
    adminReviewDrafts: [],
    adminReviewPromotions: [],
    adminReviewApprovalRequests: [],
    adminReviewSecondApprovals: [],
    cronograma: [{ id: 'official-1', materia: 'OLD', confirmada: true }],
    alumnos: [{ nombre: 'Alumno Secreto', email: 'alumno@example.edu', estado: 'ACTIVE' }],
    secret: 'RAW_SNAPSHOT_SECRET',
    ...overrides,
  }
}

describe('buildExamEngineShadowAudit', () => {
  it('clona la entrada y no modifica snapshot ni cronograma oficial', () => {
    const snapshot = fixture()
    const before = structuredClone(snapshot)
    const result = buildExamEngineShadowAudit({ snapshot, options: { now: () => '2026-07-14T10:00:00.000Z' } })

    expect(snapshot).toEqual(before)
    expect(result.safety).toMatchObject({
      readOnly: true,
      supabaseUsed: false,
      persistencePerformed: false,
      snapshotUnchanged: true,
      officialScheduleUnchanged: true,
      officializationPerformed: false,
    })
    expect(result.safety.officialScheduleFingerprintBefore).toBe(result.safety.officialScheduleFingerprintAfter)
  })

  it('construye universo desde plan y detecta materia omitida y sin titular', () => {
    const result = buildExamEngineShadowAudit({ snapshot: fixture() })

    expect(result.expectedUniverse).toMatchObject({ source: 'planesEstudio_fallback', count: 2 })
    expect(result.generated.count).toBe(1)
    expect(result.gaps.omitted.map((row) => row.materia)).toContain('MAT2')
    expect(result.gaps.withoutTitular.map((row) => row.materia)).toContain('MAT2')
    expect(result.hardRules.byCode.NO_TITULAR).toBeGreaterThan(0)
  })

  it('detecta titular y vocal afectados por fechas bloqueadas', () => {
    const result = buildExamEngineShadowAudit({ snapshot: fixture() })

    expect(result.blockedDates).toMatchObject({ active: 2, fullDay: 1, timeRange: 1 })
    expect(result.blockedDates.titularSubjects.map((row) => row.materia)).toContain('MAT1')
    expect(result.blockedDates.vocalSubjects.map((row) => row.materia)).toContain('MAT1')
    expect(result.hardRules.byCode.TITULAR_BLOCKED_DATE).toBeGreaterThan(0)
    expect(result.hardRules.byCode.VOCAL_BLOCKED_DATE).toBeGreaterThan(0)
    expect(result.hardRules.byCode.BLOCKED_DATE_CONFLICT).toBeGreaterThan(0)
  })

  it('reporta explicitamente si no existe fuente para universo esperado', () => {
    const result = buildExamEngineShadowAudit({
      snapshot: fixture({ planesEstudio: [], alumnos: [], examEnrollments: [] }),
    })

    expect(result.expectedUniverse.count).toBe(0)
    expect(result.expectedUniverse.warnings).toContain(EXPECTED_SUBJECT_UNIVERSE_SOURCE_MISSING)
    expect(result.hardRules.byCode[EXPECTED_SUBJECT_UNIVERSE_SOURCE_MISSING]).toBe(1)
  })

  it('genera Markdown con las catorce secciones requeridas', () => {
    const markdown = renderExamEngineShadowAuditMarkdown(buildExamEngineShadowAudit({ snapshot: fixture() }))

    expect(markdown).toContain('# Shadow audit del motor de examenes')
    expect(markdown).toContain('## 4. Universo esperado de materias')
    expect(markdown).toContain('## 8. Impacto de fechas bloqueadas')
    expect(markdown).toContain('## 10. Estado del flujo administrativo experimental')
    expect(markdown).toContain('## 14. Conclusion')
  })

  it('anonimiza materias y carreras y no expone payload sensible', () => {
    const result = buildExamEngineShadowAudit({ snapshot: fixture(), options: { anonymize: true } })
    const json = JSON.stringify(buildSafeExamEngineShadowAuditJson(result))
    const markdown = renderExamEngineShadowAuditMarkdown(result)

    expect(json).toContain('MATERIA_001')
    expect(json).toContain('CARRERA_001')
    expect(json).not.toContain('Carrera A')
    expect(json).not.toContain('Materia Uno')
    expect(json).not.toContain('Alumno Secreto')
    expect(json).not.toContain('alumno@example.edu')
    expect(json).not.toContain('RAW_SNAPSHOT_SECRET')
    expect(json).not.toContain('Dato sensible')
    expect(markdown).not.toContain('Ana Titular')
    expect(result.diagnostics).toMatchObject({
      rawSnapshotIncluded: false,
      studentNamesIncluded: false,
      emailsIncluded: false,
    })
  })
})
