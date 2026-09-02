import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(SCRIPT_DIR, '../..')
const LOCAL_AUDIT_DIR = resolve(REPO_ROOT, 'local-audit')
const INPUT_PATH = resolve(LOCAL_AUDIT_DIR, 'correlativity_blocking_gap.json')
const CSV_OUTPUT_PATH = resolve(LOCAL_AUDIT_DIR, 'correlativity_cascade_map.csv')
const MARKDOWN_OUTPUT_PATH = resolve(LOCAL_AUDIT_DIR, 'correlativity_cascade_map.md')

const COLUMNS = [
  'materia_previa_codigo',
  'materia_previa_nombre',
  'carrera',
  'cantidad_materias_desbloqueadas',
  'lista_materias_desbloqueadas',
]

function fail(message) {
  console.error(`[correlativity cascade map] ${message}`)
  process.exitCode = 1
}

function clean(value) {
  return String(value ?? '').trim()
}

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function normalizeText(value) {
  return clean(value)
    .toLowerCase()
    .normalize('NFD')
    .replaceAll(/[\u0300-\u036f]/g, '')
    .replaceAll(/\s+/g, ' ')
    .trim()
}

function normalizeToken(value) {
  return normalizeText(value).replaceAll(/[^a-z0-9]+/g, '')
}

function splitParts(value) {
  return clean(value).split('/').map(clean).filter(Boolean)
}

function csvEscape(value) {
  const text = Array.isArray(value) ? value.map(clean).filter(Boolean).join(' | ') : clean(value)
  if (!/[",\n\r;]/.test(text)) return text
  return `"${text.replaceAll('"', '""')}"`
}

function markdownEscape(value) {
  return clean(value).replaceAll('|', '\\|').replaceAll('\n', '<br>')
}

function toRepoPath(filePath) {
  return relative(REPO_ROOT, filePath).replaceAll('\\', '/')
}

function readJsonFile(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'))
}

function subjectListFromMesa(mesa = {}) {
  const codes = splitParts(mesa.materiaCodigo)
  const names = splitParts(mesa.materiaNombre)

  if (!codes.length) {
    return [{
      code: clean(mesa.materiaNombre),
      name: clean(mesa.materiaNombre),
    }].filter((subject) => subject.code || subject.name)
  }

  return codes.map((code, index) => ({
    code,
    name: names.length === codes.length ? names[index] : clean(mesa.materiaNombre),
  }))
}

function posteriorLabel(subject = {}) {
  const code = clean(subject.code)
  const name = clean(subject.name)
  if (code && name && normalizeToken(code) !== normalizeToken(name)) return `${code} - ${name}`
  return code || name
}

function pickPreviaName(previaCode = '', previa = {}) {
  const wantedCode = normalizeToken(previaCode)
  const exactMatch = asArray(previa.matches).find((match) => normalizeToken(match.materiaCodigo) === wantedCode)
  if (exactMatch?.materiaNombre) return clean(exactMatch.materiaNombre)

  const splitMatch = asArray(previa.matches).find((match) => splitParts(match.materiaCodigo).some((code) => (
    normalizeToken(code) === wantedCode
  )))
  if (splitMatch) {
    const codes = splitParts(splitMatch.materiaCodigo)
    const names = splitParts(splitMatch.materiaNombre)
    const index = codes.findIndex((code) => normalizeToken(code) === wantedCode)
    if (index >= 0 && names.length === codes.length) return names[index]
    if (splitMatch.materiaNombre) return clean(splitMatch.materiaNombre)
  }

  return clean(previa.nombreMateria ?? previa.materiaNombre ?? previa.nombre ?? '')
}

function addPosterior(group, posterior = {}) {
  const label = posteriorLabel(posterior)
  if (!label) return

  const key = [normalizeToken(posterior.code), normalizeText(posterior.name)].join('::')
  group.posteriors.set(key, {
    code: clean(posterior.code),
    name: clean(posterior.name),
    label,
  })
}

function buildCascadeRows(report = {}) {
  const groups = new Map()

  asArray(report.cases).forEach((item) => {
    const carrera = clean(item.mesa?.carrera)
    const posteriors = subjectListFromMesa(item.mesa)

    asArray(item.previas)
      .filter((previa) => clean(previa.estado) !== 'PLANIFICADA')
      .forEach((previa) => {
        const previaCode = clean(previa.previa)
        if (!previaCode) return

        const key = [normalizeText(carrera), normalizeToken(previaCode)].join('::')
        const group = groups.get(key) ?? {
          materia_previa_codigo: previaCode,
          materia_previa_nombre: pickPreviaName(previaCode, previa),
          carrera,
          posteriors: new Map(),
        }

        if (!group.materia_previa_nombre) {
          group.materia_previa_nombre = pickPreviaName(previaCode, previa)
        }

        posteriors
          .filter((posterior) => normalizeToken(posterior.code) !== normalizeToken(previaCode))
          .forEach((posterior) => addPosterior(group, posterior))
        groups.set(key, group)
      })
  })

  return [...groups.values()]
    .map((group) => ({
      materia_previa_codigo: group.materia_previa_codigo,
      materia_previa_nombre: group.materia_previa_nombre,
      carrera: group.carrera,
      cantidad_materias_desbloqueadas: group.posteriors.size,
      lista_materias_desbloqueadas: [...group.posteriors.values()]
        .sort((left, right) => left.code.localeCompare(right.code) || left.name.localeCompare(right.name))
        .map((posterior) => posterior.label)
        .join(' | '),
    }))
    .sort((left, right) => (
      right.cantidad_materias_desbloqueadas - left.cantidad_materias_desbloqueadas ||
      left.carrera.localeCompare(right.carrera) ||
      left.materia_previa_codigo.localeCompare(right.materia_previa_codigo)
    ))
}

function rowsToCsv(rows = []) {
  return [
    COLUMNS.join(','),
    ...rows.map((row) => COLUMNS.map((column) => csvEscape(row[column])).join(',')),
  ].join('\n') + '\n'
}

function rowsToMarkdown(rows = []) {
  const table = [
    `| ${COLUMNS.join(' | ')} |`,
    `| ${COLUMNS.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${COLUMNS.map((column) => markdownEscape(row[column])).join(' | ')} |`),
  ]

  return `${[
    '# Mapa de cascada de correlatividades',
    '',
    `Fuente: \`${toRepoPath(INPUT_PATH)}\``,
    '',
    'Incluye previas no planificadas (`PENDIENTE` y `NO_ENCONTRADA_EN_MOTOR`) que bloquean materias posteriores en el reporte de brecha.',
    '',
    ...table,
    '',
  ].join('\n')}`
}

function main() {
  if (!existsSync(INPUT_PATH)) {
    fail(`No existe ${toRepoPath(INPUT_PATH)}. Ejecuta primero diagnoseCorrelativityBlockingGap.mjs.`)
    return
  }

  try {
    mkdirSync(LOCAL_AUDIT_DIR, { recursive: true })
    const report = readJsonFile(INPUT_PATH)
    const rows = buildCascadeRows(report)

    writeFileSync(CSV_OUTPUT_PATH, rowsToCsv(rows), 'utf8')
    writeFileSync(MARKDOWN_OUTPUT_PATH, rowsToMarkdown(rows), 'utf8')

    console.log(JSON.stringify({
      totalPreviasBloqueantes: rows.length,
      outputs: {
        csv: toRepoPath(CSV_OUTPUT_PATH),
        markdown: toRepoPath(MARKDOWN_OUTPUT_PATH),
      },
      topImpact: rows.slice(0, 10),
    }, null, 2))
  } catch (error) {
    fail(error instanceof Error ? error.message : 'No se pudo construir el mapa de cascada.')
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
}
