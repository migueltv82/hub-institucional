import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import WorkspaceConflictBanner from './WorkspaceConflictBanner.jsx'

describe('WorkspaceConflictBanner', () => {
  afterEach(() => vi.restoreAllMocks())

  it('sin conflicto no muestra nada', () => {
    const { container } = render(<WorkspaceConflictBanner conflict={null} onResolve={vi.fn()} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('avisa el conflicto y "ver los cambios" recarga sin confirmar', async () => {
    const onResolve = vi.fn().mockResolvedValue(null)
    render(<WorkspaceConflictBanner conflict={{ remoteUpdatedAt: '2026-10-20T15:30:00.000Z' }} onResolve={onResolve} />)
    expect(screen.getByRole('alert')).toHaveTextContent('Hay cambios de otra sesión')
    fireEvent.click(screen.getByRole('button', { name: 'Ver los cambios (recargar)' }))
    await waitFor(() => expect(onResolve).toHaveBeenCalledWith('reload'))
  })

  it('"subir los míos igual" pide confirmación y no pisa si se cancela', async () => {
    const onResolve = vi.fn().mockResolvedValue({})
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true)
    render(<WorkspaceConflictBanner conflict={{ remoteUpdatedAt: null }} onResolve={onResolve} />)
    fireEvent.click(screen.getByRole('button', { name: 'Subir los míos igual' }))
    expect(onResolve).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Subir los míos igual' }))
    await waitFor(() => expect(onResolve).toHaveBeenCalledWith('overwrite'))
    expect(confirm).toHaveBeenCalledTimes(2)
  })
})
