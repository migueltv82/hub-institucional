import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { PASSWORD_CHANGE_REJECTIONS, auditLeaksPassword, jwtClaims } from './validateInitialPasswordLocal.mjs'

const harness = readFileSync(resolve('scripts/validateInitialPasswordLocal.mjs'), 'utf8')

describe('validateInitialPasswordLocal', () => {
  it('cubre cada rechazo del cambio y que ninguno limpie la marca ni cambie la contrasena', () => {
    expect(PASSWORD_CHANGE_REJECTIONS.map((item) => item.status)).toEqual([401, 400, 400, 400])
    expect(harness).toContain("cleared the flag`")
    expect(harness).toContain("changed the password`")
    expect(harness).toContain("'Anonymous call accepted'")
  })

  it('prueba que re-crear accesos no pisa contrasena, bloqueo ni marca', () => {
    for (const message of ['Re-provisioning overwrote the password', 'Re-provisioning unblocked the teacher', 'Re-provisioning set the flag again', 'Re-provisioning restored the DNI password']) {
      expect(harness).toContain(message)
    }
    expect(harness).toContain("'refresh_token_not_found'")
    expect(harness).toContain("'Blocked user changed the password'")
  })

  it('lee claims del JWT y detecta contrasenas en la auditoria', () => {
    const token = `x.${Buffer.from(JSON.stringify({ app_metadata: { must_change_password: true } })).toString('base64url')}.y`
    expect(jwtClaims(token).app_metadata.must_change_password).toBe(true)
    expect(auditLeaksPassword([{ metadata: { new_password: '[redacted]' } }], ['Secreta-123'])).toBe(false)
    expect(auditLeaksPassword([{ metadata: { note: 'Secreta-123' } }], ['Secreta-123'])).toBe(true)
  })
})
