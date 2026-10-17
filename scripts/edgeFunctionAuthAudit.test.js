import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { auditNoVerifyJwtFunction, directLocalImports } from './edgeFunctionAuthAudit.mjs'

const repoSource = (path) => (existsSync(path) ? readFileSync(path, 'utf8') : null)
const fakeSources = (files) => (path) => files[path] ?? null
const reasons = (failures) => failures.map((failure) => failure.reason)

const VALID_HANDLER = `export function handler(req, createClient) {
  const bearer = req.headers.get('Authorization') || ''
  if (!bearer.startsWith('Bearer ')) throw new Error('401')
  const auth = await createClient().auth.getUser()
  await db.from('memberships').select('role')
}`

describe('edgeFunctionAuthAudit (SEC.1)', () => {
  it('source-file-storage pasa por las validaciones de su handler.js', () => {
    expect(auditNoVerifyJwtFunction('source-file-storage', repoSource)).toEqual([])
  })

  it('admin-users sigue pasando con las validaciones en index.ts', () => {
    expect(auditNoVerifyJwtFunction('admin-users', repoSource)).toEqual([])
  })

  it('una Edge sin validacion en index.ts ni en su handler falla las tres reglas', () => {
    const failures = auditNoVerifyJwtFunction('demo', fakeSources({
      'supabase/functions/demo/index.ts': "import { handler } from './handler.js'\nDeno.serve(handler)",
      'supabase/functions/demo/handler.js': 'export const handler = () => new Response("ok")',
    }))
    expect(reasons(failures)).toHaveLength(3)
  })

  it('el chequeo de Bearer en linea solo vale dentro de un handler delegado, no en index.ts', () => {
    const failures = auditNoVerifyJwtFunction('demo', fakeSources({
      'supabase/functions/demo/index.ts': VALID_HANDLER,
    }))
    expect(reasons(failures)).toEqual(['verify_jwt=false requires explicit Bearer authorization validation'])
  })

  it('ignora imports remotos, de carpetas padre o con subcarpetas', () => {
    const index = [
      "import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'",
      "import { handler } from '../_shared/handler.js'",
      "import { other } from './nested/handler.js'",
      "import { local } from './handler.js'",
    ].join('\n')
    expect(directLocalImports(index)).toEqual(['./handler.js'])
    const failures = auditNoVerifyJwtFunction('demo', fakeSources({
      'supabase/functions/demo/index.ts': index.replace("import { local } from './handler.js'", ''),
      'supabase/functions/_shared/handler.js': VALID_HANDLER,
      'supabase/functions/demo/nested/handler.js': VALID_HANDLER,
    }))
    expect(reasons(failures)).toHaveLength(3)
  })

  it('falla si la funcion declarada no existe', () => {
    expect(reasons(auditNoVerifyJwtFunction('missing', fakeSources({})))).toEqual(['verify_jwt=false configured but function source is missing'])
  })
})
