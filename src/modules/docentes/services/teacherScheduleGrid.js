import {
  buildInstitutionScheduleTimetableGroups,
  buildTimetableDays,
  buildTimetableGridRows,
  buildTimetableSlots,
} from '../../../components/generadorCronograma/adminInstitutionOverview.js'

function clean(value) {
  return String(value ?? '').trim()
}

function normalizeIdentity(value) {
  return clean(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '')
}

function getSubjectGroupKey(schedule = {}) {
  const subjectId = normalizeIdentity(schedule.subjectId || schedule.materiaCodigo || schedule.materia)
  const programId = normalizeIdentity(schedule.programId || schedule.carrera)
  return `${subjectId}::${programId}`
}

function getSubjectDisplayName(schedule = {}) {
  return clean(schedule.nombreMateria || schedule.subject_name || schedule.materia) || 'Materia'
}

function formatScheduleYearLabel(anio) {
  const value = clean(anio)
  if (!value) return ''
  return /^\d+$/.test(value) ? `${value}° Año` : value
}

function escapeHtml(value) {
  return clean(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * Formatea el contenido de una celda de la grilla compactada: como una
 * sola celda puede corresponder a cualquier materia (no hay un titulo de
 * materia por grilla como en buildTeacherScheduleGrids), hace falta nombrar
 * la materia y la carrera dentro de la celda misma.
 */
function formatCombinedCellLines(row) {
  if (!row) return null
  const aula = clean(row.aula)

  return {
    materia: getSubjectDisplayName(row),
    meta: [clean(row.carrera), formatScheduleYearLabel(row.anio)].filter(Boolean).join(' · '),
    aula: aula && aula !== '-' ? `Aula ${aula}` : '',
  }
}

/**
 * Agrupa el horario del docente por materia (subjectId+programId, con
 * fallback a materiaCodigo+carrera) y reusa la grilla dia x franja del
 * panel admin (buildInstitutionScheduleTimetableGroups) para cada materia
 * por separado, en vez de reimplementar esa logica.
 */
export function buildTeacherScheduleGrids(schedules = []) {
  const bySubject = new Map()

  schedules.forEach((schedule) => {
    if (!schedule || typeof schedule !== 'object') return

    const key = getSubjectGroupKey(schedule)
    const current = bySubject.get(key) ?? {
      key,
      nombreMateria: getSubjectDisplayName(schedule),
      carrera: clean(schedule.carrera),
      rows: [],
    }
    current.rows.push(schedule)
    bySubject.set(key, current)
  })

  return Array.from(bySubject.values())
    .sort((left, right) => left.nombreMateria.localeCompare(right.nombreMateria, 'es', { sensitivity: 'base' }))
    .flatMap((subject) => (
      buildInstitutionScheduleTimetableGroups(subject.rows).map((group) => ({
        ...group,
        subjectKey: subject.key,
        nombreMateria: subject.nombreMateria,
      }))
    ))
}

/**
 * Version compactada del horario: en vez de una grilla por materia, una
 * sola grilla dia x franja con todos los bloques del docente, sin agrupar
 * por carrera/anio (a diferencia de buildInstitutionScheduleTimetableGroups,
 * que si agrupa). Reusa los mismos helpers de armado de slots/dias/celdas
 * que ya usa el panel admin, solo que sobre TODAS las filas juntas.
 */
export function buildTeacherWeeklyOverviewGrid(schedules = []) {
  const rows = schedules.filter((schedule) => schedule && typeof schedule === 'object')
  const slots = buildTimetableSlots(rows)
  const days = buildTimetableDays(rows)

  return {
    rows,
    slots,
    days,
    gridRows: buildTimetableGridRows(rows, slots, days),
  }
}

/**
 * HTML imprimible del resumen semanal compactado: una unica tabla dia x
 * franja con todas las materias del docente, cada celda ocupada mostrando
 * materia + carrera/anio. Funcion pura -- separa el armado del HTML de la
 * ventana de impresion en si, para poder testearla sin abrir un browser real.
 */
export function buildWeeklySummaryPrintHtml(grid = {}, options = {}) {
  const title = clean(options.title) || 'Resumen semanal'
  const slots = grid.slots ?? []
  const rowsHtml = (grid.gridRows ?? []).map((day) => `
    <tr>
      <th class="day">${escapeHtml(day.label)}</th>
      ${(day.cells ?? []).map((cell) => {
        const lines = formatCombinedCellLines(cell.rows?.[0])
        const content = lines
          ? `
            <div class="subject">${escapeHtml(lines.materia)}</div>
            ${lines.meta ? `<div class="meta">${escapeHtml(lines.meta)}</div>` : ''}
            ${lines.aula ? `<div class="meta">${escapeHtml(lines.aula)}</div>` : ''}
          `
          : '<span class="empty">-</span>'
        return `<td colspan="${Math.max(Number(cell.colSpan) || 1, 1)}">${content}</td>`
      }).join('')}
    </tr>
  `).join('')

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(title)}</title>
    <style>
      @page { size: landscape; margin: 10mm; }
      * { box-sizing: border-box; }
      body { margin: 0; font-family: Arial, sans-serif; color: #030712; }
      h1 { margin: 0 0 14px; text-align: center; font-size: 20px; text-transform: uppercase; }
      table { width: 100%; border-collapse: separate; border-spacing: 0; table-layout: fixed; }
      th, td { border: 1px solid #0f766e; padding: 6px; text-align: center; vertical-align: middle; font-size: 11px; }
      thead th, .day { background: #ccfbf1; font-weight: 800; }
      .day { width: 12%; }
      .subject { font-weight: 800; text-transform: uppercase; font-size: 11px; }
      .meta { margin-top: 2px; font-size: 9px; font-weight: 700; color: #0f766e; text-transform: uppercase; }
      .empty { color: #94a3b8; }
    </style>
  </head>
  <body>
    <h1>${escapeHtml(title)}</h1>
    <table>
      <thead>
        <tr>
          <th class="day">Dia</th>
          ${slots.map((slot) => `<th>${escapeHtml(slot.label)}</th>`).join('')}
        </tr>
      </thead>
      <tbody>${rowsHtml}</tbody>
    </table>
  </body>
</html>`
}

export function imprimirResumenSemanal(grid = {}, options = {}) {
  const printWindow = window.open('', '_blank', 'width=1200,height=800')
  if (!printWindow) throw new Error('No se pudo abrir la ventana de impresion.')

  printWindow.document.write(buildWeeklySummaryPrintHtml(grid, options))
  printWindow.document.close()
  printWindow.focus()
  window.setTimeout(() => {
    printWindow.print()
  }, 250)
}

export async function downloadWeeklySummaryPdf(grid = {}, options = {}) {
  const slots = grid.slots ?? []
  const gridRows = (grid.gridRows ?? []).filter((day) => (day.cells ?? []).some((cell) => (cell.rows ?? []).length > 0))
  if (slots.length === 0 || gridRows.length === 0) {
    throw new Error('WEEKLY_SUMMARY_EMPTY')
  }

  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const marginX = 12
  const marginTop = 14
  const dayColWidth = 26
  const rowHeight = 16
  const headerHeight = 8
  let y = marginTop

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.setTextColor(3, 7, 18)
  doc.text(clean(options.title) || 'Resumen semanal', pageWidth / 2, y, { align: 'center' })
  y += 10

  const usableWidth = pageWidth - marginX * 2 - dayColWidth
  const colWidth = usableWidth / slots.length

  doc.setFontSize(7)
  doc.setDrawColor(15, 118, 110)
  doc.setFillColor(204, 251, 241)
  doc.rect(marginX, y, dayColWidth, headerHeight, 'FD')
  doc.text('DIA', marginX + dayColWidth / 2, y + headerHeight / 2 + 1, { align: 'center' })
  slots.forEach((slot, index) => {
    const x = marginX + dayColWidth + index * colWidth
    doc.rect(x, y, colWidth, headerHeight, 'FD')
    doc.text(clean(slot.label), x + colWidth / 2, y + headerHeight / 2 + 1, { align: 'center' })
  })
  y += headerHeight

  gridRows.forEach((day) => {
    doc.setFont('helvetica', 'bold')
    doc.setFillColor(204, 251, 241)
    doc.rect(marginX, y, dayColWidth, rowHeight, 'FD')
    doc.text(clean(day.label).toUpperCase(), marginX + dayColWidth / 2, y + rowHeight / 2 + 1, { align: 'center' })

    let x = marginX + dayColWidth
    ;(day.cells ?? []).forEach((cell) => {
      const span = Math.max(Number(cell.colSpan) || 1, 1)
      const width = colWidth * span
      const lines = formatCombinedCellLines(cell.rows?.[0])
      doc.setFillColor(255, 255, 255)
      doc.rect(x, y, width, rowHeight, 'FD')
      if (lines) {
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(7)
        doc.setTextColor(15, 23, 42)
        doc.text(doc.splitTextToSize(lines.materia, width - 4), x + width / 2, y + 5, { align: 'center' })
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(6)
        doc.setTextColor(15, 118, 110)
        const meta = [lines.meta, lines.aula].filter(Boolean).join(' - ')
        if (meta) doc.text(doc.splitTextToSize(meta, width - 4), x + width / 2, y + rowHeight - 4, { align: 'center' })
      }
      x += width
    })
    y += rowHeight
  })

  const fileName = clean(options.fileName) || 'resumen-semanal.pdf'
  doc.save(fileName)
  return { fileName }
}
