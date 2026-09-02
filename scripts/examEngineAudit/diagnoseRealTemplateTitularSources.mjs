import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildTemplateTitularSourcesDiagnosis } from '../../src/utils/examEngine/audit/templateTitularSourcesDiagnosis.js'
import { buildRegularExamInputFromWorkspaceSnapshot } from '../../src/utils/examEngine/comparison/buildRegularExamInputFromWorkspaceSnapshot.js'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(SCRIPT_DIR, '../..')
const LOCAL_SNAPSHOT_PATH = resolve(REPO_ROOT, 'local-audit/workspaceSnapshot.real.local.json')

function fail(message) {
  console.error(`[examEngine template titular audit] ${message}`)
  process.exitCode = 1
}

function readJsonFile(filePath) {
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'))
  } catch (error) {
    throw new Error(`No se pudo leer JSON local: ${error instanceof Error ? error.message : error}`)
  }
}

function count(value) {
  return Array.isArray(value) ? value.length : 0
}

function pickExamples(rows = [], limit = 30) {
  return rows.slice(0, limit)
}

function buildSafeReport({ snapshot, diagnosis }) {
  const motivos = diagnosis.motivos ?? {}

  return {
    fuente: {
      tipo: 'local-file',
      path: 'local-audit/workspaceSnapshot.real.local.json',
      counts: {
        alumnos: count(snapshot.alumnos),
        docentes: count(snapshot.docentes),
        horariosDocentes: count(snapshot.horariosDocentes),
        planesEstudio: count(snapshot.planesEstudio),
        correlatividades: count(snapshot.correlatividades),
      },
      readOnly: true,
    },
    resumen: diagnosis.summary,
    gruposPlanHorarios: diagnosis.grupos,
    gruposEjemplos: diagnosis.gruposEjemplos,
    motivos,
    interpretacionTitularidad: {
      materiasNoRequeridasPorFaltaDeHorario: motivos.MATERIA_NO_REQUERIDA ?? 0,
      titularesFaltantesReales: diagnosis.summary?.titularesFaltantesReales ?? 0,
      mensaje: (diagnosis.summary?.titularesFaltantesReales ?? 0) === 0
        ? 'No hay titulares faltantes reales en materias que requieren mesa; las diferencias visibles provienen de materias no requeridas o sin horario asociado.'
        : 'Hay materias que requieren mesa pero no logran titular inferido desde horarios/docentes.',
    },
    ejemplosSeguros: pickExamples(diagnosis.ejemplosSeguros, 30),
    horariosHuerfanosEjemplos: pickExamples(diagnosis.horariosHuerfanosEjemplos, 30),
    recomendaciones: diagnosis.recomendaciones,
  }
}

function main() {
  if (!existsSync(LOCAL_SNAPSHOT_PATH)) {
    fail('No existe local-audit/workspaceSnapshot.real.local.json.')
    return
  }

  try {
    const snapshot = readJsonFile(LOCAL_SNAPSHOT_PATH)
    const input = buildRegularExamInputFromWorkspaceSnapshot(snapshot)
    const diagnosis = buildTemplateTitularSourcesDiagnosis({ snapshot, input })

    console.log(JSON.stringify(buildSafeReport({ snapshot, diagnosis }), null, 2))
  } catch (error) {
    fail(error instanceof Error ? error.message : 'No se pudo ejecutar la auditoria de plantillas.')
  }
}

main()
