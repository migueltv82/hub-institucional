import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { academicRelationalSchemaFixture } from '../../utils/examEngine/relationalSource/__fixtures__/academicRelationalSchema.fixture.js'
import { mapAcademicRelationalRowsToSnapshot } from '../../utils/examEngine/relationalSource/mapAcademicRelationalRowsToSnapshot.js'
import { buildExamEngineV21DataFromWorkspace, createDefaultExamCallConfigForm, runRelationalPreviewDraftStep } from './examEngineV21FieldTestService.js'
import { buildTribunalCandidatePool } from '../../utils/examEngine/planning/tribunals/buildTribunalCandidatePool.js'

const config = { tipoPeriodo: 'REGULAR', cantidadLlamados: 1, fechaInicio: '2026-11-02', fechaFin: '2026-11-06', usarDiasHabiles: true, carrerasIncluidas: 'ALL' }

function buildData({ blockedDates = [], missingTeacher = false } = {}) {
  const tables = structuredClone(academicRelationalSchemaFixture)
  tables.course_schedules.push({ institution_id: 'inst-1', plan_subject_id: 'sps-ing03', teacher_id: 'teacher-3', weekday: 2, starts_at: '18:00:00', ends_at: '20:00:00' })
  tables.teacher_subject_assignments.push({ institution_id: 'inst-1', plan_subject_id: 'sps-ing02', teacher_id: 'teacher-2', role: 'titular', status: 'active' })
  tables.teacher_exam_date_exclusions = blockedDates.map((date) => ({ teacher_id: 'teacher-1', excluded_date: date }))
  if (missingTeacher) {
    tables.teacher_subject_assignments = []
    tables.course_schedules = []
  }
  const { snapshot } = mapAcademicRelationalRowsToSnapshot(tables)
  return buildExamEngineV21DataFromWorkspace({ workspaceSnapshot: snapshot, examCallConfig: config })
}

describe('circuito relacional hacia la UI V21', () => {
  it('entra por la UI administradora existente y no agrega accesos paralelos al topbar', () => {
    const dashboardPage = readFileSync('src/pages/DashboardPage.jsx', 'utf8')
    const app = readFileSync('src/App.jsx', 'utf8')
    const adminWorkspace = readFileSync('src/components/GeneradorCronograma.jsx', 'utf8')

    expect(adminWorkspace).toContain("mode={isRelationalWorkspaceSource ? 'preview' : undefined}")
    expect(app).not.toContain('RelationalExamPreviewPage')
    expect(app).not.toContain('/app/mesas/previsualizacion')
    expect(dashboardPage).not.toContain('RelationalPreviewEntry')
    expect(dashboardPage).not.toContain("to=\"/app/alumnos\"")
    expect(dashboardPage).not.toContain("to=\"/app/docentes\"")
    expect(dashboardPage).not.toContain("to=\"/app/mesas/previsualizacion\"")
  })

  it('no bloquea el llamado por una materia de otra carrera excluida del alcance', () => {
    const data = buildData()
    data.materias.push({ ...data.materias[0], id: 'otra', carrera: 'OTRA CARRERA', titularId: '' })
    const result = runRelationalPreviewDraftStep({ data, examCallConfig: { ...config, carrerasIncluidas: ['PROFESORADO DE INGLES'] } })
    expect(result.errors).toEqual([])
  })

  it('excluye tambien al docente como vocal en la fecha bloqueada', () => {
    const data = buildData({ blockedDates: ['2026-11-02'] })
    const blocked = data.docentes.find((teacher) => teacher.bloqueos.length)
    const pool = buildTribunalCandidatePool({
      docentes: data.docentes,
      mesa: { id: 'mesa-test', fecha: '2026-11-02', carrera: 'PROFESORADO DE INGLES', titularId: data.docentes.find((teacher) => teacher.id !== blocked.id).id },
    })
    expect(pool.rejectedCandidates.find((candidate) => candidate.docenteId === blocked.id).rechazos).toContain('SIN_DISPONIBILIDAD')
    expect(pool.validCandidates.some((candidate) => candidate.docenteId === blocked.id)).toBe(false)
  })
  it('no propone fechas antiguas al iniciar una previsualizacion', () => {
    expect(createDefaultExamCallConfigForm({}, { requireExplicitDates: true })).toMatchObject({ fechaInicio: '', fechaFin: '' })
    expect(createDefaultExamCallConfigForm({}).fechaInicio).toBe('2026-07-30')
  })
  it('conserva las exclusiones hasta la seleccion de fecha del titular', () => {
    const data = buildData({ blockedDates: ['2026-11-02'] })
    expect(data.docentes.find((teacher) => teacher.bloqueos.length)?.bloqueos).toEqual(['2026-11-02'])
    const result = runRelationalPreviewDraftStep({ data, examCallConfig: config })
    expect(result.errors).toEqual([])
    const blockedTeacher = data.docentes.find((teacher) => teacher.bloqueos.length)
    expect(result.draftResult.draftSchedule.filter((mesa) => mesa.titularId === blockedTeacher.id).every((mesa) => mesa.fecha !== '2026-11-02')).toBe(true)
  })
  it('rechaza el fallback a una fecha cuando todas las disponibles estan excluidas', () => {
    const result = runRelationalPreviewDraftStep({ data: buildData({ blockedDates: ['2026-11-02', '2026-11-03'] }), examCallConfig: config })
    expect(result.errors.length).toBeGreaterThan(0)
  })
  it('conserva cada materia faltante en el diagnostico, sin inventar titular', () => {
    const result = runRelationalPreviewDraftStep({ data: buildData({ missingTeacher: true }), examCallConfig: config })
    const issues = result.errors.filter((issue) => issue.code === 'MATERIA_SIN_TITULAR')
    expect(issues).toHaveLength(2)
    expect(new Set(issues.map((issue) => issue.entityId)).size).toBe(2)
    expect(result.draftResult).toBeUndefined()
  })
})
