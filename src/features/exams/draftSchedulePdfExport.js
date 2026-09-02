function clean(value) {
  return String(value ?? '').trim()
}

function compareText(left, right) {
  return clean(left).localeCompare(clean(right), 'es', { numeric: true, sensitivity: 'base' })
}

function formatDate(value) {
  const date = new Date(`${clean(value)}T00:00:00`)
  if (Number.isNaN(date.getTime())) return clean(value) || 'Sin fecha'
  const weekday = new Intl.DateTimeFormat('es-AR', { weekday: 'long' }).format(date)
  return `${weekday} ${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}`
}

function yearLabel(value) {
  const year = Number(value)
  return Number.isFinite(year) && year > 0 ? `${year}º` : clean(value) || 'S/A'
}

export function buildDraftSchedulePdfModel(rows = []) {
  const byCareer = rows.reduce((map, row) => {
    const career = clean(row.carrera) || 'Sin carrera'
    const current = map.get(career) ?? []
    current.push(row)
    map.set(career, current)
    return map
  }, new Map())

  return [...byCareer.entries()]
    .sort(([left], [right]) => compareText(left, right))
    .map(([career, careerRows]) => {
      const years = [...new Set(careerRows.map((row) => clean(row.anio) || 'SIN_ANIO'))].sort(compareText)
      const dates = [...new Set(careerRows.map((row) => clean(row.fecha) || 'SIN_FECHA'))].sort(compareText)
      const cells = careerRows.reduce((map, row) => {
        const key = `${clean(row.fecha) || 'SIN_FECHA'}::${clean(row.anio) || 'SIN_ANIO'}`
        const current = map.get(key) ?? []
        current.push(row)
        map.set(key, current)
        return map
      }, new Map())

      return { career, years, dates, cells }
    })
}

function drawTitle(doc, career, periodLabel) {
  doc.setFillColor(190, 211, 232)
  doc.rect(10, 10, 277, 15, 'F')
  doc.setTextColor(15, 23, 42)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.text(career, 14, 17)
  doc.setFontSize(8)
  doc.text(`TURNO: ${periodLabel || 'REVISION DOCENTE'}`, 14, 22)
}

function drawGridHeader(doc, years, y, dateWidth, yearWidth) {
  doc.setFillColor(50, 105, 166)
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.rect(10, y, dateWidth, 8, 'FD')
  doc.text('DIA / AÑO', 12, y + 5.5)
  years.forEach((year, index) => {
    const x = 10 + dateWidth + (index * yearWidth)
    doc.rect(x, y, yearWidth, 8, 'FD')
    doc.text(yearLabel(year === 'SIN_ANIO' ? '' : year), x + (yearWidth / 2), y + 5.5, { align: 'center' })
  })
  return y + 8
}

function getCellLines(doc, rows, width) {
  return rows.flatMap((row, index) => {
    const subject = doc.splitTextToSize(clean(row.materiaMesa) || 'Materia sin nombre', width - 4)
    const titular = doc.splitTextToSize(clean(row.titular) || 'Titular a designar', width - 4)
    const vocalesTexto = [clean(row.vocal1), clean(row.vocal2)].filter(Boolean).join(' / ')
    const vocales = vocalesTexto
      ? doc.splitTextToSize(`Vocales: ${vocalesTexto}`, width - 4)
      : []
    const observation = clean(row.observaciones)
      ? doc.splitTextToSize(`Revisar: ${clean(row.observaciones)}`, width - 4)
      : []
    return [{ subject, titular, vocales, observation, gapAfter: index < rows.length - 1 }]
  })
}

function getCellHeight(groups) {
  const contentHeight = groups.reduce((total, group) => (
    total + (group.subject.length * 3.6) + (group.titular.length * 3.4) +
    (group.vocales.length * 3.2) +
    (group.observation.length * 3.2) + (group.gapAfter ? 2 : 0)
  ), 0)
  return Math.max(14, contentHeight + 4)
}

function drawCellContent(doc, groups, x, y) {
  let cursor = y + 4
  groups.forEach((group) => {
    doc.setTextColor(220, 38, 38)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7.5)
    doc.text(group.subject, x + 2, cursor)
    cursor += group.subject.length * 3.6
    doc.setTextColor(15, 23, 42)
    doc.text(group.titular, x + 2, cursor)
    cursor += group.titular.length * 3.4
    if (group.vocales.length) {
      doc.setTextColor(15, 118, 110)
      doc.setFontSize(6.8)
      doc.text(group.vocales, x + 2, cursor)
      cursor += group.vocales.length * 3.2
    }
    if (group.observation.length) {
      doc.setTextColor(146, 64, 14)
      doc.setFontSize(6.8)
      doc.text(group.observation, x + 2, cursor)
      cursor += group.observation.length * 3.2
    }
    if (group.gapAfter) cursor += 2
  })
}

export async function downloadDraftScheduleReviewPdf({
  rows = [],
  filename = 'precronograma_revision_docente.pdf',
  periodLabel = '',
} = {}) {
  const model = buildDraftSchedulePdfModel(rows)
  if (!model.length) throw new Error('No hay filas para exportar.')

  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const pageHeight = doc.internal.pageSize.getHeight()

  model.forEach((career, careerIndex) => {
    if (careerIndex > 0) doc.addPage()
    const dateWidth = 30
    const yearWidth = (277 - dateWidth) / Math.max(1, career.years.length)
    drawTitle(doc, career.career, periodLabel)
    let y = drawGridHeader(doc, career.years, 28, dateWidth, yearWidth)

    career.dates.forEach((date, dateIndex) => {
      const cellGroups = career.years.map((year) => getCellLines(
        doc,
        career.cells.get(`${date}::${year}`) ?? [],
        yearWidth,
      ))
      const rowHeight = Math.max(14, ...cellGroups.map(getCellHeight))

      if (y + rowHeight > pageHeight - 12) {
        doc.addPage()
        drawTitle(doc, career.career, periodLabel)
        y = drawGridHeader(doc, career.years, 28, dateWidth, yearWidth)
      }

      const fill = dateIndex % 2 === 0 ? [218, 231, 245] : [235, 244, 252]
      doc.setFillColor(...fill)
      doc.setDrawColor(30, 64, 104)
      doc.rect(10, y, dateWidth, rowHeight, 'FD')
      doc.setFillColor(55, 112, 177)
      doc.rect(10, y, dateWidth, rowHeight, 'F')
      doc.setTextColor(255, 255, 255)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(7.5)
      doc.text(formatDate(date === 'SIN_FECHA' ? '' : date), 10 + (dateWidth / 2), y + (rowHeight / 2), { align: 'center' })

      career.years.forEach((year, yearIndex) => {
        const x = 10 + dateWidth + (yearIndex * yearWidth)
        doc.setFillColor(...fill)
        doc.setDrawColor(30, 64, 104)
        doc.rect(x, y, yearWidth, rowHeight, 'FD')
        drawCellContent(doc, cellGroups[yearIndex], x, y)
      })
      y += rowHeight
    })
  })

  doc.save(filename)
  return { filename, rows: rows.length, careers: model.length }
}
