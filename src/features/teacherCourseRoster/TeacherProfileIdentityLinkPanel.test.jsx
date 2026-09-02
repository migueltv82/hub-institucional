import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import TeacherProfileIdentityLinkPanel from './TeacherProfileIdentityLinkPanel.jsx'

function candidates() {
  return {
    profiles: [{ profileId: 'profile-1', displayName: 'Docente Uno', linkedTeacherRecordId: '' }],
    teacherRecords: [{ teacherRecordId: 'record-1', displayName: 'Ficha Uno', status: 'activo', profileId: '' }],
    diagnostics: { unlinkedProfiles: 1, unlinkedTeacherRecords: 1, automaticMatchingUsed: false },
  }
}

describe('TeacherProfileIdentityLinkPanel', () => {
  it('muestra candidatos minimizados y vincula con confirmacion explicita', async () => {
    const loadCandidates = vi.fn().mockResolvedValue(candidates())
    const linkIdentity = vi.fn().mockResolvedValue({ status: 'LINKED' })
    const onLinked = vi.fn()
    render(<TeacherProfileIdentityLinkPanel institutionId="institution-1" loadCandidates={loadCandidates} linkIdentity={linkIdentity} onLinked={onLinked} />)

    expect(await screen.findByText(/Profiles sin vinculo: 1/)).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Ficha docente'), { target: { value: 'record-1' } })
    fireEvent.change(screen.getByLabelText('Usuario docente'), { target: { value: 'profile-1' } })
    fireEvent.change(screen.getByLabelText('Motivo'), { target: { value: 'Identidad verificada' } })
    fireEvent.click(screen.getByRole('button', { name: /Vincular identidad/ }))

    await waitFor(() => expect(linkIdentity).toHaveBeenCalledWith({ teacherRecordId: 'record-1', profileId: 'profile-1', reason: 'Identidad verificada' }))
    expect(onLinked).toHaveBeenCalledWith('profile-1')
    expect(screen.getByText(/Identidad docente vinculada y auditada/)).toBeInTheDocument()
  })

  it('no muestra DNI, email ni telefono', async () => {
    render(<TeacherProfileIdentityLinkPanel institutionId="institution-1" loadCandidates={vi.fn().mockResolvedValue(candidates())} />)
    await screen.findByText(/Profiles sin vinculo/)
    expect(screen.queryByText(/@example|9939|Telefono:/i)).not.toBeInTheDocument()
  })
})
