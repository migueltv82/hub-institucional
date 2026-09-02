import { useMemo } from 'react'
import toast from 'react-hot-toast'
import { buildInstitutionScheduleTimetableGroups } from '../../../components/generadorCronograma/adminInstitutionOverview.js'
import { ScheduleTimetablePanel } from '../../../components/generadorCronograma/InstitutionAdminOverview.jsx'
import { exportarHorariosCursadaXlsx, imprimirHorarioCursada } from '../../../utils/examEngine/scheduleExports.js'

function clean(value) {
  return String(value ?? '').trim()
}

function slugifyFilePart(value) {
  return clean(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'horario'
}

// Misma forma de fila que espera adminInstitutionOverview.js (buildInstitutionScheduleTimetableGroups),
// para reusar exactamente la misma grilla que ya usa el panel admin.
function mapScheduleToTimetableRow(schedule) {
  return {
    carrera: schedule.career,
    anio: schedule.subject_year,
    materia_codigo: schedule.subject_code,
    materia: schedule.subject_name,
    docente: schedule.teacher,
    dia: schedule.day,
    inicio: schedule.start,
    fin: schedule.end,
    aula: schedule.classroom,
  }
}

export default function StudentScheduleTimetable({ schedules = [], institutionName, studentName }) {
  const groups = useMemo(() => (
    buildInstitutionScheduleTimetableGroups(schedules.map(mapScheduleToTimetableRow))
  ), [schedules])

  async function handleDownload(group) {
    try {
      const filename = `horario_${slugifyFilePart(studentName)}_${slugifyFilePart(group.anio)}.xlsx`
      const result = await exportarHorariosCursadaXlsx(group.rows, { filename, groups: [group] })
      toast.success(`Horario descargado: ${result.rows} bloques.`)
    } catch (error) {
      toast.error(error.message || 'No se pudo descargar el horario.')
    }
  }

  function handlePrint(group) {
    try {
      imprimirHorarioCursada(group, {
        title: `${institutionName || 'Institucion'} - ${studentName || 'Alumno'} - ${group.carrera}`,
      })
    } catch (error) {
      toast.error(error.message || 'No se pudo imprimir el horario.')
    }
  }

  if (groups.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-600">
        No hay horarios cargados para tus materias actuales.
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {groups.map((group) => (
        <ScheduleTimetablePanel
          key={group.key}
          group={group}
          institutionName={institutionName}
          onDownload={handleDownload}
          onPrint={handlePrint}
        />
      ))}
    </div>
  )
}
