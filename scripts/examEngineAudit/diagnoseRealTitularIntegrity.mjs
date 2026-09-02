import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildRegularExamInputFromWorkspaceSnapshot } from '../../src/utils/examEngine/comparison/buildRegularExamInputFromWorkspaceSnapshot.js'
import { buildRegularExamPreviewIntegrationContract } from '../../src/utils/examEngine/preview/index.js'
import { buildTitularIntegrityDiagnosis } from '../../src/utils/examEngine/audit/titularIntegrityDiagnosis.js'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(SCRIPT_DIR, '../..')
const LOCAL_SNAPSHOT_PATH = resolve(REPO_ROOT, 'local-audit/workspaceSnapshot.real.local.json')

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function fail(message) {
  console.error(`[examEngine titular integrity] ${message}`)
  process.exitCode = 1
}

function readJsonFile(filePath) {
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'))
  } catch (error) {
    throw new Error(`No se pudo leer JSON local: ${error instanceof Error ? error.message : error}`)
  }
}

function getPayloadCounts(snapshot = {}) {
  return {
    alumnos: asArray(snapshot.alumnos).length,
    docentes: asArray(snapshot.docentes).length,
    horariosDocentes: asArray(snapshot.horariosDocentes).length,
    planesEstudio: asArray(snapshot.planesEstudio).length,
    correlatividades: asArray(snapshot.correlatividades).length,
  }
}

function main() {
  if (!existsSync(LOCAL_SNAPSHOT_PATH)) {
    fail('No existe local-audit/workspaceSnapshot.real.local.json. Exporta el snapshot real desde el front dev-only.')
    return
  }

  try {
    const snapshot = readJsonFile(LOCAL_SNAPSHOT_PATH)
    const input = buildRegularExamInputFromWorkspaceSnapshot(snapshot)
    const contract = buildRegularExamPreviewIntegrationContract(input, {})
    const titularidad = buildTitularIntegrityDiagnosis({ snapshot, input, contract })

    console.log(JSON.stringify({
      source: {
        type: 'local-file',
        path: 'local-audit/workspaceSnapshot.real.local.json',
        snapshotCounts: getPayloadCounts(snapshot),
        inputCounts: {
          materias: asArray(input.materias).length,
          docentes: asArray(input.docentes).length,
          fechasDisponibles: asArray(input.fechasDisponibles).length,
          correlatividades: asArray(input.correlatividades).length,
        },
      },
      titularidad,
      seguridad: {
        imprimeDatosPersonales: false,
        imprimePayloadCompleto: false,
        soloLectura: true,
      },
    }, null, 2))
  } catch (error) {
    fail(error instanceof Error ? error.message : 'No se pudo diagnosticar integridad de titularidad.')
  }
}

main()
