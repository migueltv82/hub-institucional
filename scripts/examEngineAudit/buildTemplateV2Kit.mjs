import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildTemplateV2Kit } from '../../src/utils/examEngine/audit/buildTemplateV2Kit.js'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(SCRIPT_DIR, '../..')
const OUTPUT_DIR = resolve(REPO_ROOT, 'local-audit/templates-v2')
const MANIFEST_OUTPUT_PATH = resolve(OUTPUT_DIR, 'templates_v2_manifest.json')
const README_OUTPUT_PATH = resolve(OUTPUT_DIR, 'README.md')

function fail(message) {
  console.error(`[templates_v2 kit] ${message}`)
  process.exitCode = 1
}

function writeText(filePath, value) {
  writeFileSync(filePath, `${String(value).replace(/\s*$/, '')}\n`, 'utf8')
}

function writeJson(filePath, value) {
  writeText(filePath, JSON.stringify(value, null, 2))
}

function buildSafeConsoleSummary(result = {}) {
  return {
    outputDirectory: 'local-audit/templates-v2',
    templatesGenerated: result.summary?.templatesGenerated ?? 0,
    templateNames: result.summary?.templateNames ?? [],
    laboratorioPlanIds: result.summary?.laboratorioPlanIds ?? [],
    rule: result.summary?.rule,
    outputs: {
      manifest: 'local-audit/templates-v2/templates_v2_manifest.json',
      readme: 'local-audit/templates-v2/README.md',
    },
    warnings: result.warnings?.length ?? 0,
    errors: result.errors?.length ?? 0,
  }
}

function main() {
  try {
    mkdirSync(OUTPUT_DIR, { recursive: true })

    const result = buildTemplateV2Kit()

    Object.values(result.templates).forEach((template) => {
      writeText(resolve(OUTPUT_DIR, template.filename), template.csv)
    })

    writeJson(MANIFEST_OUTPUT_PATH, result.manifest)
    writeText(README_OUTPUT_PATH, result.readme)

    console.log(JSON.stringify(buildSafeConsoleSummary(result), null, 2))
  } catch (error) {
    fail(error instanceof Error ? error.message : 'No se pudo generar el kit de plantillas v2.')
  }
}

main()
