// Acta volante de examen, segun el modelo institucional: encabezado con la mesa, tabla de inscriptos
// (Nº, DNI, apellido, nombre, calificaciones escrito/oral/promedio) y pie con totales y firmas.

const ARGENTINA_TIME_ZONE = 'America/Argentina/Buenos_Aires'
export const ACTA_ROWS_PER_PAGE = 25

function clean(value) {
  return String(value ?? '').trim()
}

export function formatActaDate(value) {
  const timestamp = Date.parse(clean(value))
  if (!Number.isFinite(timestamp)) return ''
  return new Date(timestamp).toLocaleDateString('es-AR', {
    timeZone: ARGENTINA_TIME_ZONE,
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  })
}

function examTypeLabel(tipo) {
  return clean(tipo) === 'special' ? 'ESPECIALES' : 'REGULARES'
}

function yearLabel(anio) {
  const number = Number(anio)
  return number > 0 ? `${number}º` : ''
}

// Apellido y nombre por separado; si el legajo solo tiene nombre completo, va entero en apellido.
export function splitStudentName(alumno = {}) {
  const apellido = clean(alumno.apellido)
  const nombres = clean(alumno.nombres)
  if (apellido || nombres) return { apellido: apellido.toUpperCase(), nombres: nombres.toUpperCase() }
  return { apellido: clean(alumno.nombre).toUpperCase(), nombres: '' }
}

export function buildActaPages(alumnos = [], rowsPerPage = ACTA_ROWS_PER_PAGE) {
  const rows = (Array.isArray(alumnos) ? alumnos : []).map((alumno, index) => ({
    numero: index + 1,
    dni: clean(alumno.dni),
    ...splitStudentName(alumno),
  }))
  const pages = []
  for (let start = 0; start < Math.max(rows.length, 1); start += rowsPerPage) {
    pages.push(rows.slice(start, start + rowsPerPage))
  }
  return pages
}

function drawActaPage(doc, { institutionName, mesa, rows, pageLabel }) {
  const left = 15
  const right = 195
  let y = 18

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.text(clean(institutionName) || 'Instituto', 105, y, { align: 'center' })
  doc.setLineWidth(0.6)
  doc.line(60, y + 3, 150, y + 3)

  y += 14
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.text('Folio Nº ________', right, y, { align: 'right' })
  y += 8
  doc.setFontSize(12)
  doc.text('ACTA VOLANTE DE EXAMEN', 105, y, { align: 'center' })
  if (pageLabel) {
    doc.setFontSize(8)
    doc.text(pageLabel, right, y, { align: 'right' })
  }

  y += 14
  doc.setFontSize(9)
  const field = (label, value, x, yy) => {
    doc.setFont('helvetica', 'normal')
    doc.text(label, x, yy)
    const width = doc.getTextWidth(label)
    doc.line(x, yy + 0.8, x + width, yy + 0.8)
    doc.text(clean(value), x + width + 2, yy)
  }
  field('Exámenes de Alumnos:', examTypeLabel(mesa.tipo), left, y)
  field('Fecha de Examen:', formatActaDate(mesa.inicio), 130, y)
  y += 6
  field('Asignatura:', mesa.materia, left, y)
  y += 6
  field('Carrera:', mesa.carrera, left, y)
  y += 6
  field('Plan de Estudio:', clean(mesa.plan_anio) || clean(mesa.plan), left, y)
  y += 6
  field('Año:', yearLabel(mesa.anio), left, y)

  // Tabla: Nº | DNI | APELLIDO | NOMBRE | Escrito | Oral | Promedio
  y += 8
  const columns = [left, 23, 43, 90, 147, 162, 177, right]
  const headerHeight = 9
  const rowHeight = 6
  doc.setLineWidth(0.2)
  doc.rect(left, y, right - left, headerHeight)
  ;[1, 2, 3, 4].forEach((index) => doc.line(columns[index], y, columns[index], y + headerHeight))
  ;[5, 6].forEach((index) => doc.line(columns[index], y + headerHeight / 2, columns[index], y + headerHeight))
  doc.line(columns[4], y + headerHeight / 2, right, y + headerHeight / 2)
  doc.setFontSize(9)
  doc.text('Nº', (columns[0] + columns[1]) / 2, y + 6, { align: 'center' })
  doc.text('DNI', (columns[1] + columns[2]) / 2, y + 6, { align: 'center' })
  doc.text('APELLIDO', (columns[2] + columns[3]) / 2, y + 6, { align: 'center' })
  doc.text('NOMBRE', (columns[3] + columns[4]) / 2, y + 6, { align: 'center' })
  doc.text('Calificaciones', (columns[4] + right) / 2, y + 3.4, { align: 'center' })
  doc.setFontSize(8)
  doc.text('Escrito', (columns[4] + columns[5]) / 2, y + 7.8, { align: 'center' })
  doc.text('Oral', (columns[5] + columns[6]) / 2, y + 7.8, { align: 'center' })
  doc.text('Promedio', (columns[6] + right) / 2, y + 7.8, { align: 'center' })

  y += headerHeight
  doc.setFontSize(7.5)
  for (let index = 0; index < ACTA_ROWS_PER_PAGE; index += 1) {
    const row = rows[index]
    doc.rect(left, y, right - left, rowHeight)
    columns.slice(1, -1).forEach((x) => doc.line(x, y, x, y + rowHeight))
    if (row) {
      doc.text(String(row.numero), columns[1] - 2, y + 4.5, { align: 'right' })
      doc.text(row.dni, columns[1] + 2, y + 4.5)
      doc.text(row.apellido, columns[2] + 2, y + 4.5, { maxWidth: columns[3] - columns[2] - 3 })
      doc.text(row.nombres, columns[3] + 2, y + 4.5, { maxWidth: columns[4] - columns[3] - 3 })
    }
    y += rowHeight
  }

  // Pie: observaciones, totales y firmas del tribunal.
  const footerTop = y
  doc.rect(left, footerTop, right - left, 14)
  doc.setFontSize(8.5)
  doc.text('Observaciones:', left + 2, footerTop + 5)
  y = footerTop + 14
  doc.rect(left, y, right - left, 26)
  doc.text('Se hace constar que sobre un total de __________ alumnos, resultaron __________ aprobados, __________ desaprobados', left + 2, y + 6)
  doc.text('y __________ ausentes.', left + 2, y + 11)
  const tribunal = mesa.tribunal ?? {}
  const signature = (label, name, x, yy, align) => {
    doc.setFontSize(8.5)
    doc.text(`${label} _______________`, x, yy, { align })
    if (clean(name)) {
      doc.setFontSize(7)
      doc.text(clean(name), x, yy + 3.5, { align })
    }
  }
  signature('Presidente', tribunal.titular, 105, y + 17, 'center')
  signature('Vocal', tribunal.vocal1, left + 4, y + 22, 'left')
  signature('Vocal', tribunal.vocal2, right - 4, y + 22, 'right')
}

// Un PDF con un acta por mesa (en orden). Las mesas sin inscriptos no se reciben: el que llama las filtra.
export async function buildExamActasPdf({ institutionName, actas = [] }) {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  let first = true
  actas.forEach(({ mesa, alumnos }) => {
    const pages = buildActaPages(alumnos)
    pages.forEach((rows, index) => {
      if (!first) doc.addPage()
      first = false
      drawActaPage(doc, {
        institutionName,
        mesa,
        rows,
        pageLabel: pages.length > 1 ? `Hoja ${index + 1} de ${pages.length}` : '',
      })
    })
  })
  return doc
}
