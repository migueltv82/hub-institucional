import { useMemo } from 'react'
import toast from 'react-hot-toast'
import {
  crearTextoPublicacion,
  exportarCronogramaXlsx,
  exportarMesasConfirmadasPorCarreraXlsx,
  exportarPlacaRedes,
} from '../utils/examEngine/scheduleExports.js'
import { downloadTemplateV2Workbook } from '../utils/examEngine/templatesV2/downloadTemplateV2Assets.js'
import {
  exportarCronogramaCarrerasPdf,
  exportarCronogramaDestinatariosPdf,
} from '../utils/cronogramaPdfExports.js'

const PREFILLED_WORKBOOK_HREF = '/plantillas/plantilla_institucional_precargada_completa.xlsx'
const PREFILLED_WORKBOOK_FILE_NAME = 'plantilla_institucional_precargada_completa.xlsx'
const ACADEMIC_WORKBOOK_HREF = '/plantillas/plantilla-academica.xlsx'
const ACADEMIC_WORKBOOK_FILE_NAME = 'plantilla-academica.xlsx'
const TEACHERS_WORKBOOK_HREF = '/plantillas/plantilla-docentes.xlsx'
const TEACHERS_WORKBOOK_FILE_NAME = 'plantilla-docentes.xlsx'
const STUDENTS_WORKBOOK_HREF = '/plantillas/plantilla-alumnos.xlsx'
const STUDENTS_WORKBOOK_FILE_NAME = 'plantilla-alumnos.xlsx'

function downloadStaticAsset({
  documentRef = globalThis.document,
  fileName,
  href,
} = {}) {
  if (!documentRef || !href) {
    throw new Error('No hay contexto de navegador disponible para descargar la planilla.')
  }

  const anchor = documentRef.createElement('a')
  anchor.href = href
  anchor.download = fileName
  anchor.rel = 'noopener'
  documentRef.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
}

const defaultExportHandlers = {
  downloadStaticAsset,
  downloadTemplateV2Workbook,
  exportarCronogramaXlsx,
  exportarCronogramaCarrerasPdf,
  exportarCronogramaDestinatariosPdf,
  exportarMesasConfirmadasPorCarreraXlsx,
  exportarPlacaRedes,
}

function normalizeText(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replaceAll(/[\u0300-\u036f]/g, '')
}

function getGeneratedCareerOptions({ careerOptions = [], cronograma = [] }) {
  const generatedCareers = new Set(
    cronograma
      .map((mesa) => normalizeText(mesa.carrera))
      .filter(Boolean),
  )

  return careerOptions.filter((career) => generatedCareers.has(normalizeText(career)))
}

export function useCronogramaExports({
  academicData = {},
  alumnos = [],
  careerOptions = [],
  correlatividades = [],
  cronograma,
  docentes = [],
  exportHandlers = defaultExportHandlers,
  institution = null,
}) {
  const textoPublicacion = useMemo(() => crearTextoPublicacion(cronograma), [cronograma])

  async function copiarTexto() {
    if (!textoPublicacion) {
      toast.error('Genera el cronograma antes de copiar el texto.')
      return
    }

    if (!navigator.clipboard?.writeText) {
      toast.error('El portapapeles no esta disponible en este navegador.')
      return
    }

    try {
      await navigator.clipboard.writeText(textoPublicacion)
      toast.success('Texto copiado al portapapeles.')
    } catch {
      toast.error('No se pudo copiar el texto. Intenta nuevamente.')
    }
  }

  async function descargarPlantilla(handler, label) {
    try {
      await handler()
      toast.success(`Plantilla descargada: ${label}.`)
    } catch (error) {
      toast.error(error.message || 'No se pudo descargar la plantilla.')
    }
  }

  async function exportarCronograma() {
    try {
      await exportHandlers.exportarCronogramaXlsx(cronograma)
      toast.success('Cronograma exportado en XLSX.')
    } catch (error) {
      toast.error(error.message || 'No se pudo exportar el XLSX.')
    }
  }

  async function exportarConfirmadasPorCarrera() {
    try {
      await exportHandlers.exportarMesasConfirmadasPorCarreraXlsx(cronograma)
      toast.success('Reporte de confirmadas exportado por carrera.')
    } catch (error) {
      toast.error(error.message || 'No se pudo exportar el reporte por carrera.')
    }
  }

  async function exportarPdfPorCarrera() {
    try {
      const generatedCareerOptions = getGeneratedCareerOptions({ careerOptions, cronograma })
      const result = await exportHandlers.exportarCronogramaCarrerasPdf({
        careerOptions: generatedCareerOptions,
        cronograma,
        institution,
      })
      toast.success(`PDFs por carrera generados: ${result.careers}.`)
    } catch (error) {
      toast.error(error.message || 'No se pudieron generar los PDFs por carrera.')
    }
  }

  async function exportarPdfDestinatarios() {
    try {
      const result = await exportHandlers.exportarCronogramaDestinatariosPdf({
        academicData,
        alumnos,
        correlatividades,
        cronograma,
        docentes,
        institution,
      })
      toast.success(`PDFs personalizados: ${result.students} alumnos y ${result.teachers} docentes.`)
    } catch (error) {
      toast.error(error.message || 'No se pudieron generar los PDFs personalizados.')
    }
  }

  async function exportarPlaca() {
    try {
      const result = await exportHandlers.exportarPlacaRedes(cronograma)
      const placas = Number(result?.placas ?? result?.pages ?? 1)
      toast.success(placas > 1 ? `Placas PNG generadas: ${placas}.` : 'Placa PNG generada.')
    } catch (error) {
      toast.error(error.message || 'No se pudo generar la placa PNG.')
    }
  }

  return {
    copiarTexto,
    descargarKitExamEngineV2: () => descargarPlantilla(
      () => exportHandlers.downloadStaticAsset({
        fileName: ACADEMIC_WORKBOOK_FILE_NAME,
        href: ACADEMIC_WORKBOOK_HREF,
      }),
      'Plantilla academica',
    ),
    descargarPlantillaDocentes: () => descargarPlantilla(
      () => exportHandlers.downloadStaticAsset({
        fileName: TEACHERS_WORKBOOK_FILE_NAME,
        href: TEACHERS_WORKBOOK_HREF,
      }),
      'Plantilla de docentes',
    ),
    descargarPlantillaAlumnos: () => descargarPlantilla(
      () => exportHandlers.downloadStaticAsset({
        fileName: STUDENTS_WORKBOOK_FILE_NAME,
        href: STUDENTS_WORKBOOK_HREF,
      }),
      'Plantilla de alumnos',
    ),
    descargarPlanillaPrecargada: () => descargarPlantilla(
      () => exportHandlers.downloadStaticAsset({
        fileName: PREFILLED_WORKBOOK_FILE_NAME,
        href: PREFILLED_WORKBOOK_HREF,
      }),
      'Planilla institucional precargada',
    ),
    exportarConfirmadasPorCarrera,
    exportarCronograma,
    exportarPdfDestinatarios,
    exportarPdfPorCarrera,
    exportarPlaca,
    textoPublicacion,
  }
}
