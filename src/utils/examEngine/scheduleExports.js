function clean(value) {
  return String(value ?? '').trim()
}

function normalizeText(value) {
  return clean(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

const DAY_ORDER = new Map([
  ['lunes', 1],
  ['martes', 2],
  ['miercoles', 3],
  ['jueves', 4],
  ['viernes', 5],
  ['sabado', 6],
  ['domingo', 7],
])

async function downloadWorkbook({ filename, headers, rows = [], sheetName = 'Datos' }) {
  const ExcelJS = await import('exceljs')
  const workbook = new ExcelJS.default.Workbook()
  const sheet = workbook.addWorksheet(sheetName)
  sheet.addRow(headers)
  rows.forEach((row) => sheet.addRow(headers.map((header) => row[header] ?? '')))
  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF075985' } }
  sheet.columns.forEach((column) => { column.width = 22 })
  const buffer = await workbook.xlsx.writeBuffer()
  triggerDownload(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), filename)
  return { rows: rows.length, filename }
}

const CRONOGRAMA_HEADERS = ['fecha', 'dia', 'inicio', 'fin', 'carrera', 'materia', 'nombreMateria', 'profesorTitular', 'vocal1', 'vocal2', 'aula', 'llamado', 'estado']
const HORARIOS_HEADERS = ['carrera', 'anio', 'dia', 'inicio', 'fin', 'materia', 'docente', 'aula']

function getDayOrder(day) {
  return DAY_ORDER.get(normalizeText(day)) ?? 99
}

function safeSheetName(value, fallback = 'Horario') {
  const cleaned = clean(value)
    .replace(/[\\/*?:[\]]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return (cleaned || fallback).slice(0, 31)
}

function uniqueSheetName(value, usedNames, fallback = 'Horario') {
  const base = safeSheetName(value, fallback)
  let candidate = base
  let suffix = 2

  while (usedNames.has(candidate.toLowerCase())) {
    const suffixText = ` ${suffix}`
    candidate = `${base.slice(0, 31 - suffixText.length)}${suffixText}`
    suffix += 1
  }

  usedNames.add(candidate.toLowerCase())
  return candidate
}

function escapeHtml(value) {
  return clean(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function buildScheduleExportGrid(rows = []) {
  const safeRows = asArray(rows)
  const dayLabels = new Map()
  const slotLabels = new Map()

  safeRows.forEach((row) => {
    const day = clean(row.dia)
    const inicio = clean(row.inicio)
    const fin = clean(row.fin)
    const slotKey = `${inicio}::${fin}`
    if (day && !dayLabels.has(normalizeText(day))) dayLabels.set(normalizeText(day), day)
    if (!slotLabels.has(slotKey)) {
      slotLabels.set(slotKey, {
        key: slotKey,
        inicio,
        fin,
        label: clean(row.horario) || [inicio, fin].filter(Boolean).join(' - ') || '-',
      })
    }
  })

  const days = Array.from(dayLabels.entries())
    .sort((left, right) => (
      getDayOrder(left[1]) - getDayOrder(right[1]) ||
      left[1].localeCompare(right[1], 'es', { sensitivity: 'base' })
    ))
    .map(([key, label]) => ({ key, label }))
  const slots = Array.from(slotLabels.values())
    .sort((left, right) => (
      left.inicio.localeCompare(right.inicio, 'es', { sensitivity: 'base', numeric: true }) ||
      left.fin.localeCompare(right.fin, 'es', { sensitivity: 'base', numeric: true })
    ))

  return {
    days,
    slots: slots.map((slot) => ({
      ...slot,
      cells: days.reduce((cells, day) => {
        cells[day.key] = safeRows.filter((row) => (
          normalizeText(row.dia) === day.key &&
          clean(row.inicio) === slot.inicio &&
          clean(row.fin) === slot.fin
        ))
        return cells
      }, {}),
    })),
  }
}

function formatScheduleCell(rows = []) {
  return rows.map((row) => {
    const aula = clean(row.aula)
    return [
      clean(row.materia),
      clean(row.docente),
      [clean(row.carrera), clean(row.anio)].filter(Boolean).join(' - '),
      aula && aula !== '-' ? `Aula: ${aula}` : '',
    ].filter(Boolean).join('\n')
  }).join('\n\n')
}

function formatScheduleGroupTitle(group = {}) {
  return [
    clean(group.carrera),
    clean(group.anio) ? `${clean(group.anio)} ano` : '',
  ].filter(Boolean).join(' - ') || 'Horario'
}

function formatPrintableScheduleCell(rows = [], showScope = false) {
  if (!rows.length) return '<span class="empty">-</span>'

  return rows.map((row) => {
    const aula = clean(row.aula)
    const scope = showScope
      ? `<div class="scope">${escapeHtml(row.carrera)} / ${escapeHtml(row.anio)} ano</div>`
      : ''
    const aulaText = aula && aula !== '-' ? `<div class="room">Aula ${escapeHtml(aula)}</div>` : ''

    return `
      <div class="subject">
        <div class="subject-name">${escapeHtml(row.materia)}</div>
        <div class="teacher">Prof. ${escapeHtml(row.docente)}</div>
        ${scope}
        ${aulaText}
      </div>
    `
  }).join('')
}

function styleHeader(row) {
  row.font = { bold: true, color: { argb: 'FFFFFFFF' } }
  row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF075985' } }
}

function styleTimetableCell(cell, fill = 'FFFFFFFF') {
  cell.border = {
    top: { style: 'thin', color: { argb: 'FF1D4F8A' } },
    left: { style: 'thin', color: { argb: 'FF1D4F8A' } },
    bottom: { style: 'thin', color: { argb: 'FF1D4F8A' } },
    right: { style: 'thin', color: { argb: 'FF1D4F8A' } },
  }
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } }
  cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
}

function addAutoFilter(sheet, columnCount) {
  if (columnCount <= 0) return
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: columnCount },
  }
}

function addTimetableSheet(workbook, group, sheetName) {
  const sheet = workbook.addWorksheet(safeSheetName(sheetName, 'Horario'))
  const slots = asArray(group.slots)
  const gridRows = asArray(group.gridRows)

  sheet.views = [{ state: 'frozen', xSplit: 1, ySplit: 1 }]
  sheet.addRow([`${clean(group.anio) || ''} ANO`, ...slots.map((slot) => clean(slot.label))])
  const header = sheet.getRow(1)
  header.height = 32
  styleHeader(header)
  header.eachCell((cell) => styleTimetableCell(cell, 'FF8DB4E2'))

  gridRows.forEach((gridRow) => {
    const excelRow = sheet.addRow([clean(gridRow.label)])
    const rowNumber = excelRow.number
    sheet.getCell(rowNumber, 1).font = { bold: true }
    styleTimetableCell(sheet.getCell(rowNumber, 1), 'FF8DB4E2')

    let column = 2
    asArray(gridRow.cells).forEach((cell) => {
      const endColumn = column + Math.max(Number(cell.colSpan) || 1, 1) - 1
      const target = sheet.getCell(rowNumber, column)
      target.value = formatScheduleCell(cell.rows)
      target.font = { bold: asArray(cell.rows).length > 0 }
      styleTimetableCell(target, asArray(cell.rows).length > 0 ? 'FFFFFFFF' : 'FFF8FAFC')
      if (endColumn > column) sheet.mergeCells(rowNumber, column, rowNumber, endColumn)
      column = endColumn + 1
    })

    excelRow.height = 62
  })

  sheet.columns = [
    { width: 16 },
    ...slots.map(() => ({ width: 22 })),
  ]

  return sheet
}

export function crearTextoPublicacion(cronograma = []) {
  const rows = cronograma.map((mesa) => (
    `${clean(mesa.fecha)} - ${clean(mesa.carrera)} - ${clean(mesa.nombreMateria || mesa.materia)} - ${clean(mesa.profesorTitular)}`
  )).join('\n')
  return `CRONOGRAMA DE MESAS DE EXAMEN${rows ? `\n\n${rows}` : ''}`
}

export function exportarCronogramaXlsx(cronograma = []) {
  return downloadWorkbook({ filename: 'cronograma_examenes.xlsx', headers: CRONOGRAMA_HEADERS, rows: cronograma, sheetName: 'Cronograma' })
}

export function exportarMesasConfirmadasPorCarreraXlsx(cronograma = []) {
  const rows = cronograma.filter((mesa) => mesa.estado === 'confirmada')
  return downloadWorkbook({ filename: 'mesas_confirmadas_por_carrera.xlsx', headers: CRONOGRAMA_HEADERS, rows, sheetName: 'Mesas confirmadas' })
}

export async function exportarHorariosCursadaXlsx(rows = [], options = {}) {
  const safeRows = asArray(rows)
  const ExcelJS = await import('exceljs')
  const workbook = new ExcelJS.default.Workbook()
  const groups = asArray(options.groups)
  const filename = clean(options.filename) || 'horarios_cursada.xlsx'
  const grid = groups.length > 0 ? null : buildScheduleExportGrid(safeRows)
  const gridSheet = groups.length > 0 ? null : workbook.addWorksheet('Grilla')

  if (groups.length > 0) {
    const usedSheetNames = new Set(['detalle'])
    groups.forEach((group, index) => {
      const baseSheetName = groups.length === 1
        ? 'Horario'
        : `${clean(group.carrera).slice(0, 18)} ${clean(group.anio) || index + 1}`
      const sheetName = uniqueSheetName(baseSheetName, usedSheetNames, 'Horario')
      addTimetableSheet(workbook, group, sheetName)
    })
  } else {
    gridSheet.views = [{ state: 'frozen', xSplit: 1, ySplit: 1 }]
    gridSheet.addRow(['Horario', ...grid.days.map((day) => day.label)])
    styleHeader(gridSheet.getRow(1))
    grid.slots.forEach((slot) => {
      gridSheet.addRow([
        slot.label,
        ...grid.days.map((day) => formatScheduleCell(slot.cells[day.key] ?? [])),
      ])
    })
    gridSheet.columns = [
      { width: 18 },
      ...grid.days.map(() => ({ width: 32 })),
    ]
    gridSheet.eachRow((row) => {
      row.eachCell((cell) => {
        cell.alignment = { vertical: 'top', wrapText: true }
      })
    })
  }

  const detailSheet = workbook.addWorksheet('Detalle')
  detailSheet.addRow(HORARIOS_HEADERS)
  styleHeader(detailSheet.getRow(1))
  safeRows.forEach((row) => {
    detailSheet.addRow(HORARIOS_HEADERS.map((header) => row[header] ?? ''))
  })
  detailSheet.columns = HORARIOS_HEADERS.map((header) => ({
    header,
    key: header,
    width: header === 'materia' || header === 'docente' || header === 'carrera' ? 30 : 14,
  }))
  addAutoFilter(detailSheet, HORARIOS_HEADERS.length)

  const buffer = await workbook.xlsx.writeBuffer()
  triggerDownload(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), filename)
  return { rows: safeRows.length, filename }
}

export function imprimirHorarioCursada(group = {}, options = {}) {
  const printWindow = window.open('', '_blank', 'width=1200,height=800')
  if (!printWindow) throw new Error('No se pudo abrir la ventana de impresion.')

  const title = clean(options.title) || formatScheduleGroupTitle(group)
  const slots = asArray(group.slots)
  const gridRows = asArray(group.gridRows)
  const showScope = Boolean(options.showScope)
  const htmlRows = gridRows.map((gridRow) => `
    <tr>
      <th class="day">${escapeHtml(gridRow.label)}</th>
      ${asArray(gridRow.cells).map((cell) => `
        <td colspan="${Math.max(Number(cell.colSpan) || 1, 1)}">
          ${formatPrintableScheduleCell(cell.rows, showScope)}
        </td>
      `).join('')}
    </tr>
  `).join('')

  printWindow.document.write(`
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>${escapeHtml(title)}</title>
        <style>
          @page { size: landscape; margin: 10mm; }
          * { box-sizing: border-box; }
          body { margin: 0; font-family: Arial, sans-serif; color: #030712; }
          h1 { margin: 0 0 10px; text-align: center; font-size: 20px; text-transform: uppercase; }
          table { width: 100%; border-collapse: separate; border-spacing: 0; table-layout: fixed; }
          th, td { border: 2px solid #1d4f8a; padding: 8px; text-align: center; vertical-align: middle; }
          thead th, .day, .year { background: #8db4e2; font-weight: 800; }
          .year { font-size: 20px; }
          thead th { font-size: 12px; }
          .day { width: 13%; font-size: 16px; }
          td { min-height: 70px; background: #fff; }
          .subject { margin: 0 auto 6px; padding: 4px 3px; page-break-inside: avoid; }
          .subject:last-child { margin-bottom: 0; }
          .subject-name { font-size: 15px; font-weight: 800; text-transform: uppercase; }
          .teacher { margin-top: 3px; font-size: 12px; }
          .scope, .room { margin-top: 3px; font-size: 10px; font-weight: 700; color: #0f766e; text-transform: uppercase; }
          .empty { color: #94a3b8; }
        </style>
      </head>
      <body>
        <h1>${escapeHtml(title)}</h1>
        <table>
          <thead>
            <tr>
              <th class="year">${escapeHtml(clean(group.anio) || '')} ANO</th>
              ${slots.map((slot) => `<th>${escapeHtml(slot.label)}</th>`).join('')}
            </tr>
          </thead>
          <tbody>${htmlRows}</tbody>
        </table>
      </body>
    </html>
  `)
  printWindow.document.close()
  printWindow.focus()
  window.setTimeout(() => {
    printWindow.print()
  }, 250)

  return { rows: asArray(group.rows).length }
}

export async function exportarPlacaRedes(cronograma = []) {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.text('Cronograma de mesas de examen', 14, 18)
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  let y = 28
  cronograma.forEach((mesa) => {
    if (y > 280) { doc.addPage(); y = 18 }
    const line = `${clean(mesa.fecha)} | ${clean(mesa.carrera)} | ${clean(mesa.nombreMateria || mesa.materia)}`
    doc.text(doc.splitTextToSize(line, 180), 14, y)
    y += 8
  })
  doc.save('placa_cronograma.pdf')
  return { placas: cronograma.length }
}
