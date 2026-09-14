import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import ImportantNoticeCenter from './ImportantNoticeCenter.jsx'
import { showImportantNotice } from '../services/importantNotice.js'

describe('ImportantNoticeCenter', () => {
  it('muestra un aviso importante hasta que el usuario lo cierra', async () => {
    render(<ImportantNoticeCenter />)

    showImportantNotice({
      tone: 'success',
      title: 'Plantilla de alumnos cargada',
      message: 'El padrón quedó actualizado.',
      details: ['2 alumnos nuevos.', '1 alumno actualizado.'],
    })

    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Plantilla de alumnos cargada' })).toBeInTheDocument()
    expect(screen.getByText('2 alumnos nuevos.')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Entendido' }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
  })
})
