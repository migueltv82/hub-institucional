import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildCatalog } from '../utils/academicCatalog.js'

afterEach(() => {
  vi.clearAllMocks()
  vi.resetModules()
  vi.doUnmock('../lib/supabase.js')
})

async function loadService(rpc = vi.fn()) {
  vi.resetModules()
  vi.doMock('../lib/supabase.js', () => ({ isSupabaseConfigured: true, supabase: { rpc } }))
  return import('./academicCatalogPublish.js')
}

const careersAndPlans = [{ _fila: 2, carrera_id: 'ING', carrera_nombre: 'PROFESORADO DE INGLES', plan_id: 'ING-2024', estado_plan: 'VIGENTE', vigente_desde: '01/03/2024' }]
const planesEstudio = [{ plan_id: 'ING-2024', carrera: 'PROFESORADO DE INGLES', materia: 'ING01', materia_id: 'm1', nombreMateria: 'Lengua I', anio_cursada: '1' }]

describe('academicCatalogPublish (I2c)', () => {
  it('toma el plan de cada alumno de las inscripciones importadas', async () => {
    const service = await loadService()
    expect(service.studentPlansFromEnrollments([
      { dni: '30111222', plan_id: 'ING-2024' },
      { dni: '30222333', plan_id: '' },
      { dni: '', plan_id: 'ING-2024' },
      null,
    ])).toEqual([{ _fila: 2, dni: '30111222', plan_id: 'ING-2024' }])
  })

  it('publica el payload canonico por la RPC y devuelve los conteos', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { carreras: 1, planes: 1, materias_en_planes: 1, correlativas: 0, alumnos_activos: 3, alumnos_con_plan: 2 }, error: null })
    const service = await loadService(rpc)
    const catalog = buildCatalog({ careersAndPlans, planesEstudio, studentPlans: [{ _fila: 2, dni: '30.111.222', plan_id: 'ING-2024' }] })

    await expect(service.publishAcademicCatalog({ institutionId: 'i1', catalog })).resolves.toEqual({
      carreras: 1, planes: 1, materiasEnPlanes: 1, correlativas: 0, alumnosActivos: 3, alumnosConPlan: 2,
    })
    expect(rpc).toHaveBeenCalledWith('academic_admin_publish_catalog', {
      p_institution_id: 'i1',
      p_catalog: expect.objectContaining({
        careers: [{ code: 'ING', name: 'PROFESORADO DE INGLES', duration: null }],
        plans: [expect.objectContaining({ code: 'ING-2024', career_code: 'ING', status: 'active', valid_from: '2024-03-01' })],
        plan_subjects: [expect.objectContaining({ plan_code: 'ING-2024', code: 'ING01', year_number: 1 })],
        prerequisites: [],
        student_plans: [{ dni: '30111222', plan_code: 'ING-2024' }],
      }),
    })
  })

  it('no publica una planilla con errores ni sin institucion', async () => {
    const rpc = vi.fn()
    const service = await loadService(rpc)
    await expect(service.publishAcademicCatalog({ institutionId: 'i1', catalog: buildCatalog({}) })).rejects.toThrow('La planilla tiene errores')
    await expect(service.publishAcademicCatalog({ institutionId: '', catalog: buildCatalog({ careersAndPlans, planesEstudio }) })).rejects.toThrow('No hay una institucion activa')
    expect(rpc).not.toHaveBeenCalled()
  })

  it('traduce los rechazos de la base', async () => {
    const catalog = buildCatalog({ careersAndPlans, planesEstudio })
    const cases = [
      [{ code: '22023', message: 'CATALOG_CAREER_RENAME: la carrera ING ya existe' }, /Renombrarla rompe inscripciones/],
      [{ code: '22023', message: 'CATALOG_PLAN_MOVED: ...' }, /otra carrera/],
      [{ code: '42501', message: 'Acceso denegado' }, /Solo el owner o admin/],
      [{ code: 'PGRST202', message: 'not found' }, /Falta actualizar la base/],
      [{ code: 'XX000', message: 'boom' }, /No se pudo publicar el catalogo/],
    ]
    for (const [error, expected] of cases) {
      const service = await loadService(vi.fn().mockResolvedValue({ data: null, error }))
      await expect(service.publishAcademicCatalog({ institutionId: 'i1', catalog })).rejects.toThrow(expected)
    }
  })

  it('resume el catalogo para la vista previa', async () => {
    const service = await loadService()
    const catalog = buildCatalog({ careersAndPlans, planesEstudio })
    expect(service.summarizeCatalog(catalog)).toEqual({ carreras: 1, planes: 1, materias: 1, materiasEnPlanes: 1, correlativas: null, alumnosConPlan: 0 })
    expect(service.summarizeCatalog(catalog, { withPrerequisites: true }).correlativas).toBe(0)
  })

  it('rechaza archivos que no son XLSX', async () => {
    const service = await loadService()
    await expect(service.readAcademicCatalogFile({ name: 'plan.csv' })).rejects.toThrow('XLSX')
  })
})
