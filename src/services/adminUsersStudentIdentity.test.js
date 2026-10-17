import { readFileSync } from 'node:fs'
import { createHash, randomUUID } from 'node:crypto'
import { runInNewContext } from 'node:vm'
import { transformWithOxc } from 'vite'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'

const A = '10000000-0000-4000-8000-000000000001'
const B = '10000000-0000-4000-8000-000000000002'
const hash = (value) => createHash('sha256').update(value).digest('hex')
let compiled
let fixtures = []

beforeAll(async () => {
  const source = readFileSync('supabase/functions/admin-users/index.ts', 'utf8')
  compiled = (await transformWithOxc(source.replace(/^import .*createClient.*\r?\n/, ''), 'admin-users.ts')).code
})

function fixture(options = {}) {
  const tables = { institutions: [{ id: A, status: 'active' }, { id: B, status: 'active' }], profiles: [], memberships: [], student_records: [], admin_audit_logs: [] }
  const users = []
  const writes = []
  const authWrites = []
  const credentials = new Map()
  let handler
  const addUser = (email, tenant, role = 'alumno', link = true) => {
    const user = { id: randomUUID(), email, user_metadata: { account_role: role, full_name: 'Original' } }
    users.push(user)
    credentials.set(user.id, hash('original-password'))
    tables.profiles.push({ user_id: user.id, email, account_role: role, is_global_admin: false, is_blocked: false, display_name: 'Original' })
    if (tenant) tables.memberships.push({ institution_id: tenant, user_id: user.id, role: role === 'admin_instituto' ? 'admin' : 'viewer' })
    if (tenant && link) tables.student_records.push({ id: randomUUID(), institution_id: tenant, workspace_key: 'main', profile_id: user.id, email, career: '' })
    return user
  }
  const actor = addUser('admin@example.invalid', A, 'admin_instituto', false)
  const superActor = addUser('super@example.invalid', null, 'admin_instituto', false)
  tables.profiles.find((p) => p.user_id === superActor.id).is_global_admin = true
  const targetA = addUser('same@example.invalid', A)
  const targetB = addUser('foreign@example.invalid', B)
  class Query {
    constructor(table) { this.table = table; this.filters = []; this.mode = 'read'; this.singleMode = false }
    select(_fields, config) { this.countRequested = config?.count === 'exact'; return this }
    eq(key, value) { this.filters.push((row) => row[key] === value); return this }
    ilike(key, value) { this.filters.push((row) => String(row[key]).toLowerCase() === value.replace(/\\([\\%_])/g, '$1').toLowerCase()); return this }
    maybeSingle() { this.singleMode = true; return this }
    single() { this.singleMode = true; return this }
    update(value) { this.mode = 'update'; this.value = value; return this }
    upsert(value, config) { this.mode = 'upsert'; this.value = value; this.conflict = config.onConflict.split(','); return this }
    insert(value) { this.mode = 'insert'; this.value = value; return this }
    then(resolve, reject) {
      return Promise.resolve().then(() => {
        if (options.lookupError && this.table === 'student_records' && this.mode === 'read') return { data: null, error: { message: 'Synthetic lookup failure' } }
        const rows = tables[this.table] ?? (tables[this.table] = [])
        let selected = rows.filter((row) => this.filters.every((filter) => filter(row)))
        if (this.mode !== 'read') {
          if (this.table !== 'admin_audit_logs') writes.push({ table: this.table, mode: this.mode })
          if (this.mode === 'update') selected.forEach((row) => Object.assign(row, this.value))
          else {
            selected = (Array.isArray(this.value) ? this.value : [this.value]).map((value) => {
              let row = this.mode === 'upsert' ? rows.find((entry) => this.conflict.every((key) => entry[key] === value[key])) : null
              if (row) Object.assign(row, value)
              else { row = { id: randomUUID(), ...value }; rows.push(row) }
              return row
            })
          }
        }
        if (this.singleMode && selected.length > 1) return { data: null, error: { code: 'PGRST116', message: 'Ambiguous rows' } }
        return { data: this.singleMode ? selected[0] ?? null : selected, count: this.countRequested ? selected.length : null, error: null }
      }).then(resolve, reject)
    }
  }
  const client = {
    from: (table) => new Query(table),
    auth: { admin: {
      listUsers: async ({ page, perPage }) => ({ data: { users: options.incompleteAuthList ? Array.from({ length: 1000 }, () => ({ id: 'other', email: 'other@example.invalid' })) : users.slice((page - 1) * perPage, page * perPage) }, error: null }),
      createUser: async (body) => {
        authWrites.push({ kind: 'create', email: body.email })
        if (options.creationConflict) return { data: {}, error: { code: 'email_exists' } }
        const user = { id: randomUUID(), email: body.email, user_metadata: body.user_metadata }
        users.push(user); credentials.set(user.id, hash(body.password))
        return { data: { user }, error: null }
      },
      updateUserById: async (id, body) => {
        authWrites.push({ kind: 'update', id })
        if (options.resetError) return { error: { message: 'Synthetic reset failure' } }
        if (body.password) credentials.set(id, hash(body.password))
        Object.assign(users.find((u) => u.id === id).user_metadata, body.user_metadata)
        return { data: {}, error: null }
      },
      deleteUser: async (id) => { authWrites.push({ kind: 'delete', id }); return { error: null } },
    } },
  }
  runInNewContext(compiled, {
    createClient: (_url, _key, config) => config.global ? { auth: { getUser: async () => ({ data: { user: users.find((u) => `Bearer synthetic-jwt-${u.id}` === config.global.headers.Authorization) }, error: null }) } } : client,
    Deno: { env: { get: (key) => ({ SUPABASE_URL: 'http://127.0.0.1', SUPABASE_ANON_KEY: 'synthetic-anon', SUPABASE_SERVICE_ROLE_KEY: 'synthetic-service' })[key] }, serve: (fn) => { handler = fn } },
    Response, console,
  })
  const request = async (body, caller = actor) => {
    const response = await handler(new Request('http://127.0.0.1/admin-users', { method: 'POST', headers: { Authorization: `Bearer synthetic-jwt-${caller.id}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }))
    return { status: response.status, body: await response.json() }
  }
  const bulk = (email, caller = actor) => request({ action: 'bulk_create_students', institution_id: A, students: [{ email, dni: '12345678', full_name: 'Changed' }] }, caller)
  const cleanup = () => { users.length = 0; Object.values(tables).forEach((rows) => { rows.length = 0 }); credentials.clear() }
  const result = { users, tables, credentials, writes, authWrites, addUser, actor, superActor, targetA, targetB, request, bulk, cleanup }
  fixtures.push(result)
  return result
}

afterEach(() => {
  for (const f of fixtures) {
    f.cleanup()
    expect(f.users).toHaveLength(0)
    expect(f.credentials.size).toBe(0)
    expect(Object.values(f.tables).every((rows) => rows.length === 0)).toBe(true)
  }
  fixtures = []
})

describe('admin-users: identidad alumno y credenciales aisladas', () => {
  it('institucion suspendida corta al admin institucional sin escribir (06.3)', async () => {
    const f = fixture()
    f.tables.institutions.find((row) => row.id === A).status = 'suspended'
    const response = await f.bulk('nuevo@example.invalid')
    expect(response.status).toBe(403)
    expect(response.body.error).toMatch(/suspendida/)
    expect(f.authWrites).toEqual([])
    expect(f.writes).toEqual([])
  })
  it.each(['foreign@example.invalid', ' FOREIGN@EXAMPLE.INVALID ', '\tForeign@example.invalid\n'])('deniega email ajeno %s sin modificar password, metadata o links', async (email) => {
    const f = fixture()
    const before = JSON.stringify({ users: f.users, tables: f.tables })
    const password = f.credentials.get(f.targetB.id)
    expect((await f.bulk(email)).status).toBe(409)
    expect(f.credentials.get(f.targetB.id)).toBe(password)
    expect(f.authWrites).toEqual([])
    expect(f.writes).toEqual([])
    const after = { users: f.users, tables: { ...f.tables, admin_audit_logs: [] } }
    expect(JSON.stringify(after)).toBe(before)
  })
  it('reutiliza alumno del mismo tenant sin modificar credenciales, perfil ni membership', async () => {
    const f = fixture()
    const userBefore = JSON.stringify(f.targetA)
    const profileBefore = JSON.stringify(f.tables.profiles)
    const membershipBefore = JSON.stringify(f.tables.memberships)
    const recordsBefore = JSON.stringify(f.tables.student_records)
    const password = f.credentials.get(f.targetA.id)
    const result = await f.bulk(' SAME@EXAMPLE.INVALID ')
    expect(result.status).toBe(200)
    expect(result.body).toMatchObject({ success: true, created: 0, updated: 1 })
    expect(result.body.results[0].user_id).toBe(f.targetA.id)
    expect(f.credentials.get(f.targetA.id)).toBe(password)
    expect(JSON.stringify(f.targetA)).toBe(userBefore)
    expect(JSON.stringify(f.tables.profiles)).toBe(profileBefore)
    expect(JSON.stringify(f.tables.memberships)).toBe(membershipBefore)
    expect(JSON.stringify(f.tables.student_records)).toBe(recordsBefore)
    expect(f.writes).toEqual([])
    expect(f.authWrites).toEqual([])
  })
  it('reuse sin DNI no borra legajo, identidad ni informacion academica', async () => {
    const f = fixture()
    Object.assign(f.tables.student_records.find((r) => r.profile_id === f.targetA.id), { dni: 'original-dni', national_id: 'original-id', legajo: 'original-legajo', phone: 'original-phone' })
    const before = JSON.stringify(f.tables.student_records)
    const result = await f.request({ action: 'bulk_create_students', institution_id: A, students: [{ email: f.targetA.email }] })
    expect(result.status).toBe(200)
    expect(result.body.results[0]).toMatchObject({ user_id: f.targetA.id, student_record_id: f.tables.student_records.find((r) => r.profile_id === f.targetA.id).id })
    expect(JSON.stringify(f.tables.student_records)).toBe(before)
    expect(f.authWrites).toEqual([])
    expect(f.writes).toEqual([])
  })
  it('email nuevo crea Auth y links solo en tenant destino', async () => {
    const f = fixture()
    const result = await f.bulk(' New@Example.Invalid ')
    expect(result.status).toBe(200)
    expect(result.body).toMatchObject({ success: true, created: 1 })
    const id = result.body.results[0].user_id
    expect(f.credentials.get(id)).toBe(hash('12345678'))
    expect(f.tables.memberships.filter((r) => r.user_id === id)).toEqual([expect.objectContaining({ institution_id: A, role: 'viewer' })])
    expect(f.authWrites).toEqual([{ kind: 'create', email: 'new@example.invalid' }])
  })
  it('email sin Auth pero con student link a otra identidad no crea ni sobrescribe', async () => {
    const f = fixture()
    f.tables.student_records.push({ id: randomUUID(), institution_id: A, workspace_key: 'main', email: 'new@example.invalid', profile_id: f.targetA.id, career: '' })
    expect((await f.bulk('new@example.invalid')).status).toBe(409)
    expect(f.authWrites).toEqual([])
    expect(f.writes).toEqual([])
  })
  it.each(['missing-link', 'missing-membership', 'conflicting-link', 'unlinked-email', 'missing-profile', 'blocked', 'wrong-role'])('identidad %s falla cerrada sin mutacion', async (variant) => {
    const f = fixture()
    if (variant === 'missing-link') f.tables.student_records = f.tables.student_records.filter((r) => r.profile_id !== f.targetA.id)
    if (variant === 'missing-membership') f.tables.memberships = f.tables.memberships.filter((r) => r.user_id !== f.targetA.id)
    if (variant === 'conflicting-link' || variant === 'unlinked-email') f.tables.student_records.push({ id: randomUUID(), institution_id: A, email: f.targetA.email, profile_id: variant === 'conflicting-link' ? f.targetB.id : null })
    if (variant === 'missing-profile') f.tables.profiles = f.tables.profiles.filter((r) => r.user_id !== f.targetA.id)
    if (variant === 'blocked') f.tables.profiles.find((r) => r.user_id === f.targetA.id).is_blocked = true
    if (variant === 'wrong-role') f.tables.profiles.find((r) => r.user_id === f.targetA.id).account_role = 'admin_instituto'
    expect((await f.bulk(f.targetA.email)).status).toBe(409)
    expect(f.authWrites).toEqual([])
    expect(f.writes).toEqual([])
  })
  it('Auth duplicado por email normalizado es ambiguo, tambien para superadmin', async () => {
    const f = fixture()
    f.addUser('SAME@EXAMPLE.INVALID', B)
    expect((await f.bulk(f.targetA.email, f.superActor)).status).toBe(409)
    expect(f.authWrites).toEqual([])
    expect(f.writes).toEqual([])
  })
  it('busqueda Auth incompleta no autoriza crear un supuesto email nuevo', async () => {
    const f = fixture({ incompleteAuthList: true })
    expect((await f.bulk('new@example.invalid')).status).toBe(409)
    expect(f.authWrites).toEqual([])
    expect(f.writes).toEqual([])
  })
  it('colision concurrente en create no hace fallback a reset/reuse', async () => {
    const f = fixture({ creationConflict: true })
    expect((await f.bulk('race@example.invalid')).status).toBe(409)
    expect(f.authWrites).toEqual([{ kind: 'create', email: 'race@example.invalid' }])
    expect(f.writes).toEqual([])
  })
  it('fallo de lectura de identidad no modifica Auth ni DB', async () => {
    const f = fixture({ lookupError: true })
    expect((await f.bulk(f.targetA.email)).status).not.toBe(200)
    expect(f.authWrites).toEqual([])
    expect(f.writes).toEqual([])
  })
  it('set_user_password conserva autorizacion superadmin y valida scope exacto', async () => {
    const f = fixture()
    const payload = { action: 'set_user_password', institution_id: A, target_user_id: f.targetA.id, new_password: 'dedicated-new-password' }
    expect((await f.request(payload)).status).toBe(403)
    expect(f.authWrites).toEqual([])
    expect((await f.request(payload, f.superActor)).status).toBe(200)
    expect(f.credentials.get(f.targetA.id)).toBe(hash(payload.new_password))
    const before = f.credentials.get(f.targetB.id)
    f.authWrites.length = 0
    expect((await f.request({ ...payload, target_user_id: f.targetB.id }, f.superActor)).status).toBe(403)
    expect(f.credentials.get(f.targetB.id)).toBe(before)
    expect(f.authWrites).toEqual([])
  })
  it('reset con scope y fallo Auth no borra ni recrea usuarios', async () => {
    const f = fixture({ resetError: true })
    expect((await f.request({ action: 'set_user_password', institution_id: A, target_user_id: f.targetA.id, new_password: 'dedicated-password' }, f.superActor)).status).toBe(500)
    expect(f.authWrites).toEqual([{ kind: 'update', id: f.targetA.id }])
    expect(f.credentials.get(f.targetA.id)).toBe(hash('original-password'))
    expect(f.writes).toEqual([])
  })
  it('superadmin mantiene reset global contractual sin ampliar permisos institucionales', async () => {
    const f = fixture()
    expect((await f.request({ action: 'set_user_password', target_user_id: f.targetB.id, new_password: 'global-explicit-password' }, f.superActor)).status).toBe(200)
    expect(f.credentials.get(f.targetB.id)).toBe(hash('global-explicit-password'))
  })
})
