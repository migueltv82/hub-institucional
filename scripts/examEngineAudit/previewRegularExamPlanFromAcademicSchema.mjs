// Script manual de solo lectura: arma la entrada del motor de mesas desde el schema
// relacional NUEVO (supabase/schema/02_academic_relational_schema.sql +
// 04_teacher_exam_date_exclusions.sql) y corre generateRegularExamPlan() de punta a punta,
// sin escribir nada. Distinto de los scripts *WorkspaceSnapshot*/*RelationalEfficiency*
// existentes en esta carpeta, que asumen el schema relacional viejo de `examenes`.
//
// Uso (respeta RLS, requiere sesion logueada como miembro de la institucion o
// devuelve 0 filas -- eso es RLS funcionando bien, no un bug):
//   node scripts/examEngineAudit/previewRegularExamPlanFromAcademicSchema.mjs \
//     --institution-id=<uuid> --fecha-inicio=2026-11-01 --fecha-fin=2026-11-30
//
// Requiere VITE_SUPABASE_URL + VITE_SUPABASE_PUBLISHABLE_KEY (o VITE_SUPABASE_ANON_KEY)
// en el entorno o en .env.local/.env -- nunca service_role, se bloquea si lo detecta.
//
// Uso con --admin (bypasea RLS via SUPABASE_SECRET_KEY, igual que
// scripts/importNormalizedData.mjs -- solo para chequear datos reales sin
// depender de un login; segui escribiendo la key solo en tu propia terminal,
// nunca la pegues en el chat):
//   node scripts/examEngineAudit/previewRegularExamPlanFromAcademicSchema.mjs \
//     --admin --institution-id=<uuid> --fecha-inicio=2026-11-01 --fecha-fin=2026-11-30

import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { buildExamEngineSnapshotFromAcademicSchema } from '../../src/utils/examEngine/relationalSource/buildExamEngineSnapshotFromAcademicSchema.js'
import { buildRegularExamInputFromWorkspaceSnapshot } from '../../src/utils/examEngine/comparison/buildRegularExamInputFromWorkspaceSnapshot.js'
import { generateRegularExamPlan } from '../../src/utils/examEngine/planning/generateRegular.js'
import { validateSupabaseReadOnlyEnv } from '../../src/utils/examEngine/supabaseAudit/supabaseAuditSafety.js'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(SCRIPT_DIR, '../..')
const ENV_FILES = ['.env.local', '.env']

function fail(message, extra = null) {
  console.error(`[examEngine relational preview] ${message}`)
  if (extra) console.error(JSON.stringify(extra, null, 2))
  process.exitCode = 1
}

function parseEnvLine(line) {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('#')) return null

  const normalized = trimmed.startsWith('export ') ? trimmed.slice('export '.length).trim() : trimmed
  const separatorIndex = normalized.indexOf('=')
  if (separatorIndex === -1) return null

  const key = normalized.slice(0, separatorIndex).trim()
  let value = normalized.slice(separatorIndex + 1).trim()

  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1)
  }

  return key ? [key, value] : null
}

function loadLocalEnv() {
  ENV_FILES.forEach((fileName) => {
    const filePath = resolve(REPO_ROOT, fileName)
    if (!existsSync(filePath)) return

    readFileSync(filePath, 'utf8')
      .split(/\r?\n/)
      .map(parseEnvLine)
      .filter(Boolean)
      .forEach(([key, value]) => {
        if (process.env[key] === undefined) {
          process.env[key] = value
        }
      })
  })
}

function parseArgs(argv = []) {
  const args = {}

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (!arg.startsWith('--')) continue

    const [rawKey, inlineValue] = arg.slice(2).split('=', 2)
    const key = rawKey.replaceAll('-', '_')
    const value = inlineValue ?? argv[index + 1]
    args[key] = value

    if (inlineValue === undefined && value && !value.startsWith('--')) {
      index += 1
    }
  }

  return args
}

function buildSafeSummary({ diagnostics, input, result }) {
  const report = result?.report ?? {}
  // code/entityType/entityId son identificadores de materia (carrera::codigo) o de
  // config, no datos personales -- seguros para imprimir. Se lee result.diagnosis.errors
  // (forma cruda de feasibility.js) en vez de report.criticalErrors porque
  // buildPipelineReport() renormaliza a otro shape (materia/carrera/docenteId/
  // docenteNombre) que puede traer datos de docente -- por eso NO se imprime report.*
  // directamente, para no arriesgar filtrar nombres.
  const safeIssue = ({ code, entityType, entityId } = {}) => ({ code, entityType, entityId })
  const diagnosisErrors = Array.isArray(result?.diagnosis?.errors) ? result.diagnosis.errors.map(safeIssue) : []
  const diagnosisWarnings = Array.isArray(result?.diagnosis?.warnings) ? result.diagnosis.warnings.map(safeIssue) : []

  return {
    source: diagnostics.source,
    counts: diagnostics.counts,
    canRunPreview: diagnostics.canRunPreview,
    inputCounts: input.metadata?.counts ?? {},
    reportStatus: report.status ?? null,
    executiveSummary: report.executiveSummary ?? null,
    totalCandidatosMateria: Array.isArray(result?.candidates) ? result.candidates.length : 0,
    diagnosisCanGenerate: result?.diagnosis?.canGenerate ?? null,
    diagnosisErrors,
    diagnosisWarnings,
  }
}

async function main() {
  if (process.env.CI === 'true') {
    fail('Este script es solo local/manual y no debe ejecutarse en CI.')
    return
  }

  loadLocalEnv()
  const args = parseArgs(process.argv.slice(2))

  const institutionId = args.institution_id || process.env.SUPABASE_IMPORT_INSTITUTION_ID
  const fechaInicio = args.fecha_inicio
  const fechaFin = args.fecha_fin

  if (!institutionId || !fechaInicio || !fechaFin) {
    fail('Requiere --institution-id, --fecha-inicio y --fecha-fin (YYYY-MM-DD).')
    return
  }

  // Modo admin explicito (--admin): usa SUPABASE_SECRET_KEY para bypasear RLS,
  // igual que scripts/importNormalizedData.mjs. Sin --admin, la clave anon/publishable
  // respeta RLS -- si no hay sesion logueada como miembro de la institucion, las
  // queries devuelven 0 filas (comportamiento correcto de RLS, no un bug).
  const adminMode = args.admin !== undefined
  const supabaseUrl = process.env.VITE_SUPABASE_URL
  let supabaseKey

  if (adminMode) {
    supabaseKey = process.env.SUPABASE_SECRET_KEY
    if (!supabaseUrl || !supabaseKey) {
      fail('Modo --admin requiere VITE_SUPABASE_URL y SUPABASE_SECRET_KEY en el entorno.')
      return
    }
  } else {
    const envValidation = validateSupabaseReadOnlyEnv(process.env)
    if (!envValidation.valid) {
      fail('Variables de entorno invalidas para lectura read-only.', {
        errors: envValidation.errors,
        warnings: envValidation.warnings,
        config: envValidation.config,
      })
      return
    }
    supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  })

  try {
    const { snapshot, diagnostics } = await buildExamEngineSnapshotFromAcademicSchema({
      supabase,
      institutionId,
      fechaInicio,
      fechaFin,
      examType: args.exam_type || 'regular',
    })

    if (!diagnostics.canRunPreview) {
      fail('La institucion no tiene docentes ni materias cargadas todavia.', { counts: diagnostics.counts })
      return
    }

    const input = buildRegularExamInputFromWorkspaceSnapshot(snapshot)
    const result = generateRegularExamPlan(input)

    console.log(JSON.stringify(buildSafeSummary({ diagnostics, input, result }), null, 2))
  } catch (error) {
    fail(error instanceof Error ? error.message : 'No se pudo generar la previsualizacion.')
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main()
}
