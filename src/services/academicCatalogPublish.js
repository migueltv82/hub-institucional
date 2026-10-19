import { isSupabaseConfigured, supabase } from '../lib/supabase.js'
import { buildCatalogFromWorkbook, buildCatalogPayload, clean, studentPlansFromEnrollments } from '../utils/academicCatalog.js'
import { parseTemplateV2MasterWorkbook } from '../utils/examEngine/templatesV2/importTemplateV2Workbook.js'

export { studentPlansFromEnrollments }

// I2c: publicar el catalogo academico (carreras, planes, materias, correlativas y plan de cada alumno) desde
// la app, por la RPC academic_admin_publish_catalog. Mismo armado que scripts/buildAcademicCatalogSql.mjs.

const RPC = Object.freeze({ publish: 'academic_admin_publish_catalog' })

const CATALOG_ERRORS = {
  CATALOG_CAREER_RENAME: 'Una carrera ya publicada tiene otro nombre en la planilla. Renombrarla rompe inscripciones y asignaciones: corregi la planilla o pedi soporte.',
  CATALOG_PLAN_MOVED: 'Un plan ya publicado aparece en otra carrera en la planilla. Corregi la planilla.',
  CATALOG_CAREER_NAME_TAKEN: 'Ya hay otra carrera publicada con ese nombre. Corregi la planilla.',
  CATALOG_PAYLOAD_INVALID: 'La planilla no tiene carreras o materias para publicar.',
}

// Lee la planilla academica y arma el catalogo con errores y advertencias para la vista previa.
export async function readAcademicCatalogFile(file, { inscripcionesAlumnos = [], withPrerequisites = false } = {}) {
  if (clean(file?.name).split('.').pop()?.toLowerCase() !== 'xlsx') throw new Error('La planilla academica tiene que ser un archivo XLSX.')
  const parsed = await parseTemplateV2MasterWorkbook(file)
  const excelModule = await import('exceljs')
  const ExcelJS = excelModule.default ?? excelModule
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(await file.arrayBuffer())
  return buildCatalogFromWorkbook({
    workbook,
    planesEstudio: parsed.datasets.planesEstudio,
    studentPlans: studentPlansFromEnrollments(inscripcionesAlumnos),
    withPrerequisites,
  })
}

export function summarizeCatalog(catalog, { withPrerequisites = false } = {}) {
  return {
    carreras: catalog?.careers?.length ?? 0,
    planes: catalog?.plans?.length ?? 0,
    materias: catalog?.subjects?.length ?? 0,
    materiasEnPlanes: catalog?.planSubjects?.length ?? 0,
    correlativas: withPrerequisites ? catalog?.prerequisites?.length ?? 0 : null,
    alumnosConPlan: catalog?.studentPlans?.length ?? 0,
  }
}

function translateError(error) {
  const message = clean(error?.message)
  const code = Object.keys(CATALOG_ERRORS).find((key) => message.includes(key))
  if (code) return CATALOG_ERRORS[code]
  if (error?.code === '42501') return 'Solo el owner o admin de la institucion puede publicar el catalogo.'
  if (error?.code === 'PGRST202') return 'Falta actualizar la base de datos para publicar el catalogo. Avisale al responsable tecnico.'
  return 'No se pudo publicar el catalogo.'
}

export async function publishAcademicCatalog({ institutionId, catalog }) {
  if (!isSupabaseConfigured || !supabase) throw new Error('Publicar el catalogo requiere Supabase configurado.')
  if (!clean(institutionId)) throw new Error('No hay una institucion activa.')
  if (!catalog || catalog.errors?.length) throw new Error('La planilla tiene errores: corregilos antes de publicar.')
  const { data, error } = await supabase.rpc(RPC.publish, {
    p_institution_id: institutionId,
    p_catalog: buildCatalogPayload(catalog),
  })
  if (error) throw new Error(translateError(error))
  return {
    carreras: Number(data?.carreras) || 0,
    planes: Number(data?.planes) || 0,
    materiasEnPlanes: Number(data?.materias_en_planes) || 0,
    correlativas: Number(data?.correlativas) || 0,
    alumnosActivos: Number(data?.alumnos_activos) || 0,
    alumnosConPlan: Number(data?.alumnos_con_plan) || 0,
  }
}
