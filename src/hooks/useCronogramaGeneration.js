import toast from 'react-hot-toast'
import { generateCronogramaFromWorkspace } from '../services/examGenerationEngine.js'
import {
  createInitialRegularCallRanges,
  initialFiles,
} from '../components/generadorCronograma/config.js'

export function toggleMesaConfirmacion(cronograma, id, confirmedAt = new Date().toLocaleString('es-AR')) {
  return cronograma.map((mesa) => {
    if (mesa.id !== id) return mesa

    if (mesa.estado === 'confirmada') {
      return {
        ...mesa,
        estado: 'pendiente',
        confirmadaEn: '',
      }
    }

    return {
      ...mesa,
      estado: 'confirmada',
      confirmadaEn: confirmedAt,
    }
  })
}

function adjuntarMetadatosCronograma(cronograma, resultado) {
  if (!resultado || typeof resultado !== 'object') return cronograma

  const reporteGeneracion = resultado.reporteGeneracion ?? {
    cronogramaGenerado: cronograma.length,
    exclusiones: resultado.exclusiones ?? [],
    advertencias: resultado.advertencias ?? [],
    conflictos: resultado.conflictos ?? [],
    metricas: resultado.metricas ?? {},
  }

  Object.defineProperty(cronograma, 'reporteGeneracion', {
    value: reporteGeneracion,
    enumerable: false,
  })

  ;[
    'advertenciasCorrelatividades',
    'exclusionesCorrelatividades',
    'exclusionesDocentes',
    'exclusionesMitadMasUno',
    'validacionFinal',
  ].forEach((key) => {
    if (resultado[key] === undefined) return
    Object.defineProperty(cronograma, key, {
      value: resultado[key],
      enumerable: false,
    })
  })

  return cronograma
}

export function normalizarResultadoGeneracion(resultado) {
  if (Array.isArray(resultado)) return resultado
  if (!resultado || typeof resultado !== 'object') return []

  const cronograma = Array.isArray(resultado.cronograma) ? resultado.cronograma : []
  return adjuntarMetadatosCronograma(cronograma, resultado)
}

export function useCronogramaGeneration({
  alumnos,
  correlatividades,
  cronograma,
  examType,
  fechaFin,
  fechaInicio,
  generationScope,
  horariosDocentes,
  disponibilidadDocente = [],
  cargaHorariaDocente = [],
  docentes,
  docenteMateria = [],
  planesEstudio,
  regularCallRanges,
  selectedSpecialSubjectKeys = [],
  resetEdicionMesa,
  canEditWorkspace = true,
  setAlumnos,
  setCorrelatividades,
  setCronograma,
  setDocentes,
  setDocenteMateria,
  setFechaFin,
  setFechaInicio,
  setHorariosDocentes,
  setDisponibilidadDocente,
  setCargaHorariaDocente,
  setExamType,
  setGenerationScope,
  setPlanesEstudio,
  setRegularCallRanges,
  setRequiereRegeneracion,
  setSelectedSpecialSubjectKeys,
  setUploadedFiles,
}) {
  function marcarCronogramaPendiente() {
    if (!canEditWorkspace) return

    if (cronograma.length) {
      setRequiereRegeneracion(true)
    }
  }

  function updatePeriodo(setter, value) {
    if (!canEditWorkspace) {
      toast.error('Tu rol institucional es de solo lectura.')
      return
    }

    marcarCronogramaPendiente()
    setter(value)
  }

  function cambiarFechaInicio(value) {
    updatePeriodo(setFechaInicio, value)
  }

  function cambiarFechaFin(value) {
    updatePeriodo(setFechaFin, value)
  }

  function cambiarRangoLlamadoRegular(callKey, field, value) {
    if (!canEditWorkspace) {
      toast.error('Tu rol institucional es de solo lectura.')
      return
    }

    marcarCronogramaPendiente()
    setRegularCallRanges((current) => ({
      ...current,
      [callKey]: {
        ...current?.[callKey],
        [field]: value,
      },
    }))
  }

  function cambiarCantidadLlamadosRegulares(callCount) {
    if (!canEditWorkspace) {
      toast.error('Tu rol institucional es de solo lectura.')
      return
    }

    marcarCronogramaPendiente()
    setRegularCallRanges((current) => ({
      ...createInitialRegularCallRanges(),
      ...current,
      callCount: Number(callCount) === 1 ? 1 : 2,
    }))
  }

  function generar() {
    if (!canEditWorkspace) {
      toast.error('Tu rol institucional es de solo lectura.')
      return
    }

    try {
      const data = generateCronogramaFromWorkspace({
        alumnos,
        horariosDocentes,
        disponibilidadDocente,
        cargaHorariaDocente,
        docentes,
        docenteMateria,
        planesEstudio,
        correlatividades,
        fechaInicio,
        fechaFin,
        examType,
        generationScope,
        regularCallRanges,
        selectedSpecialSubjectKeys,
      })
      const cronogramaGenerado = normalizarResultadoGeneracion(data)

      setCronograma(cronogramaGenerado)
      setRequiereRegeneracion(false)
      resetEdicionMesa()
      toast.success('Cronograma generado. Listo para revisar, confirmar y exportar.')
    } catch (error) {
      toast.error(error.message)
    }
  }

  function limpiarTodo() {
    if (!canEditWorkspace) {
      toast.error('Tu rol institucional es de solo lectura.')
      return
    }

    setHorariosDocentes([])
    setDisponibilidadDocente?.([])
    setCargaHorariaDocente?.([])
    setPlanesEstudio([])
    setCorrelatividades([])
    setAlumnos?.([])
    setDocentes?.([])
    setDocenteMateria?.([])
    setUploadedFiles(initialFiles)
    setFechaInicio('')
    setFechaFin('')
    setRegularCallRanges?.(createInitialRegularCallRanges())
    setExamType?.('regular')
    setGenerationScope?.({ careers: [], year: '', respectCorrelativities: true })
    setSelectedSpecialSubjectKeys?.([])
    setCronograma([])
    setRequiereRegeneracion(false)
    resetEdicionMesa()
    toast.success('Se limpio la carga actual.')
  }

  function borrarCronograma() {
    if (!canEditWorkspace) {
      toast.error('Tu rol institucional es de solo lectura.')
      return
    }

    setCronograma([])
    setRequiereRegeneracion(false)
    resetEdicionMesa()
    toast.success('Cronograma de mesas borrado. Los archivos cargados se conservaron.')
  }

  function alternarConfirmacionMesa(id) {
    if (!canEditWorkspace) {
      toast.error('Tu rol institucional es de solo lectura.')
      return
    }

    setCronograma((current) => toggleMesaConfirmacion(current, id))
  }

  return {
    alternarConfirmacionMesa,
    borrarCronograma,
    cambiarFechaFin,
    cambiarFechaInicio,
    cambiarCantidadLlamadosRegulares,
    cambiarRangoLlamadoRegular,
    generar,
    limpiarTodo,
    marcarCronogramaPendiente,
  }
}
