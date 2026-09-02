import Papa from 'papaparse'

let mammothModulePromise
let excelModulePromise

function loadMammoth() {
  if (!mammothModulePromise) {
    mammothModulePromise = import('mammoth')
  }
  return mammothModulePromise
}

async function loadExcelJS() {
  if (!excelModulePromise) {
    excelModulePromise = import('exceljs')
  }
  const module = await excelModulePromise
  return module.default ?? module
}

function normalizarCampo(valor) {
  return String(valor ?? '').trim()
}

function normalizarKey(key) {
  return normalizarCampo(key).toLowerCase().normalize('NFD').replaceAll(/[\u0300-\u036f]/g, '')
}

function detectarAnio(row) {
  return Number(row.anio || row.ano || 1)
}

function separarLista(valor) {
  return normalizarCampo(valor)
    .replaceAll(',', '|')
    .replaceAll(';', '|')
    .split('|')
    .map((fecha) => fecha.trim())
    .filter(Boolean)
}

function normalizarRolDocenteMateria(valor) {
  const rol = normalizarKey(valor).replaceAll(/[^a-z0-9]+/g, '_').replaceAll(/^_+|_+$/g, '')

  if (['titular', 'profesor_titular', 'docente_titular'].includes(rol)) return 'TITULAR'
  if (['vocal', 'vocal_afin', 'afin', 'afines', 'docente_afin', 'idoneo', 'idoneidad'].includes(rol)) return 'VOCAL_AFIN'
  if (
    [
      'titular_y_vocal',
      'titular_y_vocal_afin',
      'titular_vocal',
      'titular_vocal_afin',
      'ambos',
    ].includes(rol)
  ) return 'TITULAR_Y_VOCAL_AFIN'
  if (['no_apto', 'no_afin', 'excluido', 'bloqueado', 'no'].includes(rol)) return 'NO_APTO'

  return normalizarCampo(valor).toUpperCase() || 'VOCAL_AFIN'
}

function extraerBloqueos(valor) {
  return separarLista(valor)
}

function pad2(value) {
  return String(value).padStart(2, '0')
}

function formatUtcDate(value) {
  return [
    value.getUTCFullYear(),
    pad2(value.getUTCMonth() + 1),
    pad2(value.getUTCDate()),
  ].join('-')
}

function formatUtcTime(value) {
  const totalMinutes = Math.round((
    (
      (value.getUTCHours() * 60 * 60) +
      (value.getUTCMinutes() * 60) +
      value.getUTCSeconds()
    ) * 1000 +
    value.getUTCMilliseconds()
  ) / 60000)
  const normalizedMinutes = ((totalMinutes % (24 * 60)) + (24 * 60)) % (24 * 60)
  const hours = Math.floor(normalizedMinutes / 60)
  const minutes = normalizedMinutes % 60

  return `${pad2(hours)}:${pad2(minutes)}`
}

function getCellNumberFormat(cell) {
  return normalizarCampo(cell?.numFmt || cell?.style?.numFmt).toLowerCase()
}

function classifyDateFormat(cell) {
  const numFmt = getCellNumberFormat(cell)
    .replace(/"[^"]*"/g, '')
    .replace(/\\./g, '')

  if (!numFmt) return 'unknown'

  const hasDateTokens = /y|d/.test(numFmt)
  const hasTimeTokens = /h|s|am\/pm|:/.test(numFmt)

  if (hasDateTokens && hasTimeTokens) return 'datetime'
  if (hasTimeTokens) return 'time'
  if (hasDateTokens) return 'date'

  return 'unknown'
}

function looksLikeExcelBaseTime(value) {
  return value.getUTCFullYear() <= 1900
}

function getCellText(cell) {
  const value = cell?.value

  if (value == null) return ''
  if (value instanceof Date) {
    const formatType = classifyDateFormat(cell)

    if (formatType === 'time' || (formatType === 'unknown' && looksLikeExcelBaseTime(value))) {
      return formatUtcTime(value)
    }

    if (formatType === 'datetime') {
      return `${formatUtcDate(value)} ${formatUtcTime(value)}`
    }

    return formatUtcDate(value)
  }
  if (typeof value !== 'object') return String(value)
  if ('text' in value) return String(value.text ?? '')
  if ('result' in value) return String(value.result ?? '')
  if ('richText' in value && Array.isArray(value.richText)) {
    return value.richText.map((entry) => entry.text ?? '').join('')
  }

  return String(value)
}

function worksheetToRows(worksheet) {
  const rows = []

  worksheet.eachRow({ includeEmpty: false }, (row) => {
    const values = []
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      values[colNumber - 1] = getCellText(cell)
    })

    if (values.some((value) => normalizarCampo(value))) {
      rows.push(values)
    }
  })

  if (rows.length < 2) return []

  const headers = rows[0].map((cell) => normalizarCampo(cell))

  return rows.slice(1).map((cells) => (
    headers.reduce((acc, header, index) => {
      if (header) acc[header] = cells[index] ?? ''
      return acc
    }, {})
  ))
}

function mapearFila(row, options = {}) {
  const mapped = {}
  Object.entries(row).forEach(([k, v]) => {
    const key = normalizarKey(k)
    const compactKey = key.replaceAll(/[^a-z0-9]/g, '')
    const value = normalizarCampo(v)

    mapped[key] = value
    if (compactKey && !mapped[compactKey]) {
      mapped[compactKey] = value
    }
  })

  if (!mapped.carrera && options.defaultCarrera) {
    mapped.carrera = normalizarCampo(options.defaultCarrera)
  }

  return mapped
}

function getFilaEtiqueta(index, options = {}) {
  const fila = (options.rowNumberOffset ?? 2) + index
  return options.origenLabel ? `${options.origenLabel}, fila ${fila}` : `Fila ${fila}`
}

function shouldSkipWorkbookSheet(worksheet) {
  const sheetName = normalizarKey(worksheet?.name)
  return ['instrucciones', 'instruccion', 'ayuda', 'readme'].includes(sheetName)
}

function parseApellidoYNombre(value) {
  const fullName = normalizarCampo(value)
  if (!fullName) return { nombre: '', apellido: '', fullName: '' }

  const [apellido, ...nombreParts] = fullName.split(',')
  if (nombreParts.length > 0) {
    const parsedApellido = normalizarCampo(apellido)
    const parsedNombre = normalizarCampo(nombreParts.join(','))

    return {
      nombre: parsedNombre,
      apellido: parsedApellido,
      fullName: [parsedNombre, parsedApellido].filter(Boolean).join(' ') || fullName,
    }
  }

  return {
    nombre: fullName,
    apellido: '',
    fullName,
  }
}

function parseRows(rows, tipo, options = {}) {
  if (!rows.length) throw new Error('El archivo no contiene filas.')

  if (tipo === 'horarios-docentes') {
    return rows.map((row, index) => {
      const r = mapearFila(row, options)
      const filaLabel = getFilaEtiqueta(index, options)
      const profesor = r.profesor || r.docente || r.nombre
      const carrera = r.carrera
      const materia = r.materia || r.materiacodigo || r.codigo
      const dia = r.dia
      const inicio = r.inicio || r.desde
      const fin = r.fin || r.hasta
      const aula = r.aula || r.ubicacion || 'A definir'
      const dni = r.dni || r.documento || ''
      const telefono = r.telefono || r.celular || r.phone || ''
      const bloqueos = extraerBloqueos(
        r.bloqueo || r.bloqueos || r.fechasbloqueo || r.fechas_bloqueo,
      )

      if (!profesor || !carrera || !materia || !dia || !inicio || !fin) {
        throw new Error(`${filaLabel}: faltan campos obligatorios de horario docente.`)
      }

      return {
        id: crypto.randomUUID(),
        profesor,
        carrera,
        materia,
        dia,
        inicio,
        fin,
        aula,
        dni,
        telefono,
        bloqueos,
      }
    })
  }

  if (tipo === 'correlatividades') {
    return rows.map((row, index) => {
      const r = mapearFila(row, options)
      const filaLabel = getFilaEtiqueta(index, options)
      const carrera = r.carrera
      const materia = r.materia || r.materiacodigo || r.codigo
      const nombre = r.nombremateria || r.nombre || materia
      const correlativas = separarLista(r.correlativas || r.requisitosprevios)

      if (!carrera || !materia) {
        throw new Error(`${filaLabel}: faltan campos obligatorios de correlatividades.`)
      }

      return {
        id: crypto.randomUUID(),
        carrera,
        materia,
        nombre,
        correlativas,
      }
    })
  }

  if (tipo === 'planes-estudio') {
    return rows.map((row, index) => {
      const r = mapearFila(row, options)
      const filaLabel = getFilaEtiqueta(index, options)
      const carrera = r.carrera
      const materia = r.materia || r.materiacodigo || r.codigo
      const nombre = r.nombremateria || r.nombre || materia
      const anio = detectarAnio(r)

      if (!carrera || !materia) {
        throw new Error(`${filaLabel}: faltan campos obligatorios de plan de estudios.`)
      }

      const grupoAfinMesa = normalizarCampo(
        r.grupo_afin_mesa ||
        r.grupoafinmesa ||
        r.grupoafin ||
        r.grupo_afin ||
        r.grupo
      )
      const codigosMateriasAfines = normalizarCampo(
        r.codigos_materias_afines ||
        r.codigosmateriasafines ||
        r.codigo_materia_afin ||
        r.codigomateriaafin ||
        r.materias_afines ||
        r.materiasafines
      )

      return {
        id: crypto.randomUUID(),
        carrera,
        materia,
        nombre,
        anio: Number.isNaN(anio) ? 1 : anio,
        grupo_afin_mesa: grupoAfinMesa,
        grupoAfinMesa,
        codigos_materias_afines: codigosMateriasAfines,
        codigosMateriasAfines,
      }
    })
  }
  if (tipo === 'alumnos') {
    return rows.map((row, index) => {
      const r = mapearFila(row, options)
      const filaLabel = getFilaEtiqueta(index, options)
      const email = normalizarCampo(r.email || r.correo || r.mail).toLowerCase()
      const nombreCompleto = r.apellidoynombre || r.apellidonombre || r.nombrecompleto || r.nombre_completo || r.fullname || r.full_name || r.display_name
      const parsedNombreCompleto = parseApellidoYNombre(nombreCompleto)
      const nombre = r.nombre || r.nombres || r.first_name || parsedNombreCompleto.nombre
      const apellido = r.apellido || r.apellidos || r.last_name || parsedNombreCompleto.apellido
      const carrera = r.carrera || r.programa || r.program || r.career
      const anio = normalizarCampo(r.anio || r.ano || r.year || r.curso)
      const dni = r.dni || r.documento || r.document_number || ''
      const legajo = r.legajo || r.matricula || r.student_number || ''
      const telefono = r.telefono || r.celular || r.phone || ''
      const estado = r.estado || r.status || 'activo'

      if (!email || !email.includes('@') || !carrera) {
        throw new Error(`${filaLabel}: faltan campos obligatorios de alumno. Usa email y carrera como minimo.`)
      }

      return {
        id: crypto.randomUUID(),
        email,
        nombre,
        apellido,
        full_name: [nombre, apellido].filter(Boolean).join(' ') || parsedNombreCompleto.fullName || email,
        carrera,
        anio,
        dni,
        legajo,
        telefono,
        estado,
        role: 'alumno',
      }
    })
  }
  if (tipo === 'docentes') {
    return rows.map((row, index) => {
      const r = mapearFila(row, options)
      const filaLabel = getFilaEtiqueta(index, options)
      const nombre = r.nombre || r.nombres || r.first_name || ''
      const apellido = r.apellido || r.apellidos || r.last_name || ''
      const dni = r.dni || r.documento || r.document_number || ''
      const telefono = r.telefono || r.celular || r.phone || ''
      const estado = r.estado || r.status || 'activo'
      const agrupacionPreferida = r.agrupacion_preferida || r.agrupacionpreferida || ''

      if (!nombre || !apellido || !dni) {
        throw new Error(`${filaLabel}: faltan campos obligatorios de docente. Usa nombre, apellido y DNI como minimo.`)
      }

      return {
        id: crypto.randomUUID(),
        nombre,
        apellido,
        full_name: [nombre, apellido].filter(Boolean).join(' '),
        dni,
        telefono,
        estado,
        agrupacion_preferida: agrupacionPreferida,
      }
    })
  }
  if (tipo === 'docente-materia') {
    return rows.map((row, index) => {
      const r = mapearFila(row, options)
      const filaLabel = getFilaEtiqueta(index, options)
      const carrera = r.carrera || r.programa || r.program || r.career
      const materia = r.materia || r.materiacodigo || r.codigo || r.codigo_materia || r.codigomateria
      const nombreMateria = r.nombremateria || r.nombre_materia || r.nombre || r.asignatura || materia
      const docente = r.docente || r.profesor || r.nombre_docente || r.nombredocente || r.profesor_titular || r.titular
      const docenteId = r.docente_id || r.docenteid || r.dni || r.documento || r.email || docente
      const rolEnMateria = normalizarRolDocenteMateria(
        r.rol_en_materia || r.rolenmateria || r.rol || r.tipo || r.relacion || r.afinidad,
      )
      const tipoAfinidad = r.tipo_afinidad || r.tipoafinidad || r.afinidad || ''
      const prioridad = Number(r.prioridad || r.orden || '')

      if (!carrera || !materia || !docente) {
        throw new Error(`${filaLabel}: faltan campos obligatorios de matriz docente-materia. Usa carrera, materia y docente como minimo.`)
      }

      return {
        id: crypto.randomUUID(),
        carrera,
        materia,
        nombreMateria,
        docente,
        docenteId,
        rol_en_materia: rolEnMateria,
        rolEnMateria,
        tipo_afinidad: tipoAfinidad,
        tipoAfinidad,
        prioridad: Number.isFinite(prioridad) ? prioridad : null,
        observaciones: r.observaciones || r.observacion || r.notas || '',
      }
    })
  }
  throw new Error('Tipo de archivo no reconocido para este flujo de cronograma.')
}

function parseCsvText(texto, tipo) {
  const { data, errors } = Papa.parse(texto, {
    delimiter: '',
    header: true,
    skipEmptyLines: true,
  })
  if (errors.length) throw new Error(errors[0].message)
  return parseRows(data, tipo)
}

async function parseExcel(buffer, tipo) {
  const ExcelJS = await loadExcelJS()
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer)

  if (tipo === 'planes-estudio' || tipo === 'alumnos') {
    const rows = workbook.worksheets.flatMap((worksheet) => {
      if (shouldSkipWorkbookSheet(worksheet)) return []

      const sheetRows = worksheetToRows(worksheet)

      if (!sheetRows.length) return []

      return parseRows(sheetRows, tipo, {
        defaultCarrera: worksheet.name,
        origenLabel: `Hoja "${worksheet.name}"`,
      })
    })

    if (!rows.length) {
      const label = tipo === 'planes-estudio' ? 'plan de estudios' : 'alumnos'
      throw new Error(`El Excel de ${label} no contiene filas en ninguna hoja.`)
    }

    return rows
  }

  const worksheet = workbook.worksheets[0]
  if (!worksheet) {
    throw new Error('El Excel no contiene hojas.')
  }

  const rows = worksheetToRows(worksheet)
  return parseRows(rows, tipo, {
    origenLabel: `Hoja "${worksheet.name}"`,
  })
}

function htmlTableToRows(html) {
  const parser = new DOMParser()
  const doc = parser.parseFromString(html, 'text/html')
  const tables = [...doc.querySelectorAll('table')]

  return tables.flatMap((table) => {
    const rows = [...table.querySelectorAll('tr')]
    if (!rows.length) return []

    const headerCells = [...rows[0].querySelectorAll('th, td')].map((cell) => normalizarCampo(cell.textContent))
    if (!headerCells.length) return []

    return rows.slice(1).map((row) => {
      const cells = [...row.querySelectorAll('td, th')].map((cell) => normalizarCampo(cell.textContent))
      return headerCells.reduce((acc, header, index) => {
        acc[header] = cells[index] ?? ''
        return acc
      }, {})
    })
  })
}

function detectarDelimitador(line) {
  if (line.includes('\t')) return '\t'

  const candidates = [';', ',', '|']
  let best = candidates[0]

  candidates.forEach((candidate) => {
    if (line.split(candidate).length > line.split(best).length) {
      best = candidate
    }
  })

  return best
}

function textLinesToRows(text) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  if (lines.length < 2) return []

  const delimiter = detectarDelimitador(lines[0])
  const headers = lines[0].split(delimiter).map((cell) => normalizarCampo(cell))
  if (!headers.length) return []

  return lines.slice(1).map((line) => {
    const cells = line.split(delimiter).map((cell) => normalizarCampo(cell))
    return headers.reduce((acc, header, index) => {
      acc[header] = cells[index] ?? ''
      return acc
    }, {})
  })
}

async function parseWord(buffer, tipo) {
  if (tipo !== 'planes-estudio') {
    throw new Error('Los archivos Word solo estan habilitados para plan de estudios.')
  }

  const mammoth = await loadMammoth()
  const [{ value: html }, { value: text }] = await Promise.all([
    mammoth.convertToHtml({ arrayBuffer: buffer }),
    mammoth.extractRawText({ arrayBuffer: buffer }),
  ])

  const tableRows = htmlTableToRows(html)
  if (tableRows.length) {
    return parseRows(tableRows, tipo)
  }

  const textRows = textLinesToRows(text)
  if (textRows.length) {
    return parseRows(textRows, tipo)
  }

  throw new Error(
    'No se pudo reconocer una tabla o lineas separadas en el Word. Usa un .docx con columnas carrera, materia y nombre. Anio es opcional.',
  )
}

export async function parseArchivo(file, tipo) {
  const ext = file.name.split('.').pop()?.toLowerCase()
  if (!['csv', 'xlsx', 'docx'].includes(ext)) {
    throw new Error('Formato no soportado. Usa CSV, XLSX o DOCX.')
  }

  if (ext === 'csv') {
    const text = await file.text()
    return parseCsvText(text, tipo)
  }

  const buffer = await file.arrayBuffer()

  if (ext === 'docx') {
    return parseWord(buffer, tipo)
  }

  return parseExcel(buffer, tipo)
}
