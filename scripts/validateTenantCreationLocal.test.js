import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { FAILURE_TRIGGERS_SQL, tenantPayload } from './validateTenantCreationLocal.mjs'

const harness = readFileSync(resolve('scripts/validateTenantCreationLocal.mjs'), 'utf8')

describe('validateTenantCreationLocal', () => {
  it('induce fallas en el alta del usuario y en la membresia, y verifica que no queden huerfanos', () => {
    expect(FAILURE_TRIGGERS_SQL).toContain('before insert on auth.users')
    expect(FAILURE_TRIGGERS_SQL).toContain('before insert on public.memberships')
    for (const message of ['Auth failure left an orphan institution', 'Membership failure left an orphan institution', 'Membership failure left an orphan Auth user', 'Membership failure left an orphan profile', 'Rollback deleted a pre-existing user', 'Retry after rollback failed']) {
      expect(harness).toContain(message)
    }
  })

  it('no degrada, promueve ni desbloquea identidades existentes, y conserva la contrasena del admin reutilizado', () => {
    expect(harness).toContain("for (const key of ['superadmin', 'alumno', 'blocked'])")
    expect(harness).toContain('profile changed`')
    expect(harness).toContain("'Reuse changed the password'")
    expect(harness).toContain("'Reuse applied the new password'")
  })

  it('arma payloads sinteticos con slug y email unicos por corrida', () => {
    const payload = tenantPayload('0123456789abcdef', 'ok')
    expect(payload).toMatchObject({ action: 'create_tenant_with_admin', institution_slug: '0123456789abcdef-ok', admin_email: '0123456789abcdef-ok@example.invalid' })
    expect(payload.admin_password).toHaveLength(32)
    expect(() => tenantPayload('bad', 'ok')).toThrow()
  })
})
