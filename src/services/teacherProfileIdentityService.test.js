import { describe, expect, it, vi } from 'vitest'
import {
  getTeacherProfileLinkCandidates,
  linkTeacherRecordProfile,
  TEACHER_PROFILE_LINK_CANDIDATES_RPC,
  TEACHER_PROFILE_LINK_RPC,
} from './teacherProfileIdentityService.js'

describe('teacherProfileIdentityService', () => {
  it('lista candidatos solo por RPC y elimina campos no autorizados', async () => {
    const client = {
      rpc: vi.fn().mockResolvedValue({
        data: {
          profiles: [{ profileId: 'profile-1', displayName: 'Docente Uno', email: 'hidden@example.invalid' }],
          teacherRecords: [{ teacherRecordId: 'record-1', displayName: 'Ficha Uno', dni: 'hidden' }],
          diagnostics: { unlinkedProfiles: 1, unlinkedTeacherRecords: 1, automaticMatchingUsed: false },
        },
        error: null,
      }),
      from: vi.fn(),
    }
    const result = await getTeacherProfileLinkCandidates({ institutionId: 'institution-1' }, { client })
    expect(client.rpc).toHaveBeenCalledWith(TEACHER_PROFILE_LINK_CANDIDATES_RPC, { p_institution_id: 'institution-1' })
    expect(client.from).not.toHaveBeenCalled()
    expect(JSON.stringify(result)).not.toContain('hidden')
    expect(result.diagnostics.automaticMatchingUsed).toBe(false)
  })

  it('vincula por RPC con IDs y motivo explicitos', async () => {
    const client = { rpc: vi.fn().mockResolvedValue({ data: { status: 'LINKED', teacherRecordId: 'record-1', profileId: 'profile-1' }, error: null }) }
    const result = await linkTeacherRecordProfile({ teacherRecordId: 'record-1', profileId: 'profile-1', reason: 'Verificado por administracion' }, { client })
    expect(client.rpc).toHaveBeenCalledWith(TEACHER_PROFILE_LINK_RPC, {
      p_teacher_record_id: 'record-1',
      p_profile_id: 'profile-1',
      p_reason: 'Verificado por administracion',
    })
    expect(result.status).toBe('LINKED')
  })

  it('rechaza IDs o motivo faltantes antes de llamar Supabase', async () => {
    const client = { rpc: vi.fn() }
    await expect(linkTeacherRecordProfile({ teacherRecordId: '', profileId: 'profile-1', reason: 'x' }, { client })).rejects.toThrow('TEACHER_PROFILE_IDENTITY_IDS_REQUIRED')
    await expect(linkTeacherRecordProfile({ teacherRecordId: 'record-1', profileId: 'profile-1', reason: '' }, { client })).rejects.toThrow('TEACHER_PROFILE_IDENTITY_REASON_REQUIRED')
    expect(client.rpc).not.toHaveBeenCalled()
  })
})
