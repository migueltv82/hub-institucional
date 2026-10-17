import { describe, expect, it } from 'vitest'
import { SENSITIVE_TABLES, assertPublicKey, parseArgs, runSmoke } from './smokeCheck.mjs'

const jwt = role => ['e30', Buffer.from(JSON.stringify({ role })).toString('base64url'), 'sig'].join('.')
const ANON = jwt('anon')
const BASE = 'https://abcdefghijklmnop.supabase.co'
const FRONT = 'https://hub.example.test'

function fakeFetch(overrides = {}) {
  const calls = []
  const impl = async (url, init) => {
    calls.push({ url, method: init?.method ?? 'GET', auth: init?.headers?.Authorization })
    const path = url.replace(BASE, '').replace(FRONT, '')
    const reply = (status, body = '') => ({ status, text: async () => body })
    if (overrides[path]) return overrides[path]()
    if (path === '/auth/v1/health') return reply(200, '{}')
    if (path === '/storage/v1/status') return reply(200, '')
    if (path === '/functions/v1/admin-users') return reply(405)
    if (path.startsWith('/rest/v1/institutions')) return reply(init?.headers?.Authorization === 'Bearer invalid.smoke.jwt' ? 401 : 200, '[]')
    if (path.startsWith('/rest/v1/')) return reply(200, '[]')
    if (path === '/') return reply(200, '<div id="root"></div><script src="/assets/index-a.js"></script><link href="/assets/index-b.css">')
    if (path.startsWith('/assets/') || path === '/ruta-inexistente-smoke') return reply(200, 'ok')
    return reply(404)
  }
  return { impl, calls }
}

const options = extra => parseArgs(['--supabase-url', `${BASE}/`, '--anon-key', ANON, '--frontend-url', FRONT, ...(extra ?? [])])

describe('smokeCheck', () => {
  it('pasa con un despliegue sano y solo hace GET', async () => {
    const { impl, calls } = fakeFetch()
    const report = await runSmoke(options(), impl)
    expect(report.result).toBe('PASS')
    expect(report.failed).toEqual([])
    expect(report.skipped).toEqual([])
    expect(calls.every(call => call.method === 'GET')).toBe(true)
    expect(calls.filter(call => call.url.includes('/rest/v1/') && SENSITIVE_TABLES.some(t => call.url.includes(`/rest/v1/${t}?`)))).toHaveLength(SENSITIVE_TABLES.length)
    expect(report.target).toBe('abcd…mnop.supabase.co')
  })

  it('falla si anon ve filas de una tabla sensible', async () => {
    const { impl } = fakeFetch({ '/rest/v1/student_grades?select=*&limit=1': () => ({ status: 200, text: async () => '[{"id":1}]' }) })
    const report = await runSmoke(options(), impl)
    expect(report.result).toBe('FAIL')
    expect(report.checks.anonSensitive.detail).toContain('student_grades')
  })

  it('acepta 401/403/404 como tabla no expuesta y rechaza un 500', async () => {
    const ok = fakeFetch({ '/rest/v1/admin_audit_logs?select=*&limit=1': () => ({ status: 401, text: async () => '' }) })
    expect((await runSmoke(options(), ok.impl)).checks.anonSensitive.status).toBe('PASS')
    const broken = fakeFetch({ '/rest/v1/profiles?select=*&limit=1': () => ({ status: 500, text: async () => '' }) })
    expect((await runSmoke(options(), broken.impl)).checks.anonSensitive.status).toBe('FAIL')
  })

  it('detecta la Edge no desplegada (404) y un JWT invalido aceptado', async () => {
    const { impl } = fakeFetch({
      '/functions/v1/admin-users': () => ({ status: 404, text: async () => '' }),
    })
    const report = await runSmoke(options(), impl)
    expect(report.checks.edge.status).toBe('FAIL')
    const lax = fakeFetch({ '/rest/v1/institutions?select=id&limit=1': () => ({ status: 200, text: async () => '[]' }) })
    expect((await runSmoke(options(), lax.impl)).checks.invalidJwt.status).toBe('FAIL')
  })

  it('un error de red cuenta como FAIL, no como excepcion', async () => {
    const { impl } = fakeFetch({ '/auth/v1/health': () => { throw new TypeError('fetch failed') } })
    const report = await runSmoke(options(), impl)
    expect(report.checks.auth).toEqual({ status: 'FAIL', detail: 'TypeError: fetch failed' })
  })

  it('reporta los checks salteados y omite frontend si no hay URL', async () => {
    const parsed = parseArgs(['--supabase-url', BASE, '--anon-key', ANON, '--skip', 'storage,edge'])
    const report = await runSmoke(parsed, fakeFetch().impl)
    expect(report.skipped).toEqual(['storage', 'edge', 'frontend'])
    expect(report.result).toBe('PASS')
    expect(() => parseArgs(['--supabase-url', BASE, '--anon-key', ANON, '--skip', 'todo'])).toThrow(/desconocido/)
  })

  it('rechaza claves privadas', () => {
    expect(() => assertPublicKey(jwt('service_role'))).toThrow(/service_role/)
    // Prefijo armado en runtime: un literal con forma de clave secreta dispara audit:repo.
    expect(() => assertPublicKey(['sb', 'secret', 'abc'].join('_'))).toThrow(/secreta/)
    expect(() => assertPublicKey('no-es-jwt')).toThrow(/formato/)
    expect(() => assertPublicKey('sb_publishable_abc')).not.toThrow()
    expect(() => assertPublicKey(ANON)).not.toThrow()
  })
})
