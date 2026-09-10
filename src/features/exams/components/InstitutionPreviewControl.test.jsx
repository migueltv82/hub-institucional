import { act, fireEvent, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ auth: {}, fetch: vi.fn(), save: vi.fn() }))
vi.mock('../../../auth/AuthContext.jsx', () => ({ useAuth: () => mocks.auth }))
vi.mock('../../../services/relationalExamPreview.js', () => ({ fetchRelationalPreviewSetting: mocks.fetch, saveRelationalPreviewSetting: mocks.save }))
import InstitutionPreviewControl from './InstitutionPreviewControl.jsx'

function show() {
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter><InstitutionPreviewControl institution={{ id: 'a', name: 'Instituto A', status: 'active' }} /></MemoryRouter></QueryClientProvider>)
}

describe('habilitacion institucional desde Superadmin', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.auth = { user: { id: 'root' }, isRemoteSession: true, isSuperAdmin: true, profile: { is_global_admin: true }, setActiveInstitutionId: vi.fn() }
    mocks.fetch.mockResolvedValue(false)
  })
  it('guarda, confirma el estado y abre la institucion elegida en el panel admin', async () => {
    mocks.save.mockImplementation(async () => { mocks.fetch.mockResolvedValue(true); return true })
    show()
    await screen.findByText('Deshabilitada')
    fireEvent.click(screen.getByRole('switch'))
    expect(await screen.findByText('Habilitada')).toBeInTheDocument()
    expect(mocks.save).toHaveBeenCalledWith({ institutionId: 'a', enabled: true })
    const adminLink = screen.getByRole('link', { name: 'Abrir panel admin' })
    expect(adminLink).toHaveAttribute('href', '/app')
    fireEvent.click(adminLink)
    expect(mocks.auth.setActiveInstitutionId).toHaveBeenCalledWith('a')
  })
  it('un error al guardar mantiene deshabilitada la opcion y lo explica', async () => {
    mocks.save.mockRejectedValue(new Error('Permiso denegado'))
    show()
    await screen.findByText('Deshabilitada')
    fireEvent.click(screen.getByRole('switch'))
    expect(await screen.findByRole('alert')).toHaveTextContent('Permiso denegado')
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'false')
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })
  it('bloquea doble envio mientras esta guardando', async () => {
    let finish
    mocks.save.mockImplementation(() => new Promise((resolve) => { finish = resolve }))
    show()
    await screen.findByText('Deshabilitada')
    fireEvent.click(screen.getByRole('switch'))
    fireEvent.click(screen.getByRole('switch'))
    expect(mocks.save).toHaveBeenCalledTimes(1)
    await act(async () => finish(false))
  })
  it('no muestra el control a un administrador institucional ni a demo local', () => {
    mocks.auth.isSuperAdmin = false
    const view = show()
    expect(screen.queryByRole('switch')).not.toBeInTheDocument()
    expect(mocks.fetch).not.toHaveBeenCalled()
    view.unmount()
    mocks.auth.isSuperAdmin = true
    mocks.auth.isRemoteSession = false
    show()
    expect(screen.queryByRole('switch')).not.toBeInTheDocument()
  })
})
