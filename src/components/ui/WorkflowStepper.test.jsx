import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import WorkflowStepper from './WorkflowStepper.jsx'

const steps = [
  { id: 'config', title: 'Configurar', description: 'Paso 1' },
  { id: 'draft', title: 'Precronograma', description: 'Paso 2' },
  { id: 'final', title: 'Final', description: 'Paso 3' },
]

describe('WorkflowStepper', () => {
  it('sin onSelectStep, no renderiza botones (modo solo lectura)', () => {
    render(<WorkflowStepper currentIndex={1} steps={steps} />)

    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.getByText('Precronograma')).toBeInTheDocument()
  })

  it('con onSelectStep, los pasos ya visitados y el actual son clickeables, pero no los futuros', () => {
    const onSelectStep = vi.fn()
    render(<WorkflowStepper currentIndex={1} steps={steps} onSelectStep={onSelectStep} />)

    const buttons = screen.getAllByRole('button')
    expect(buttons).toHaveLength(2)

    fireEvent.click(screen.getByRole('button', { name: /Configurar/ }))
    expect(onSelectStep).toHaveBeenCalledWith('config')

    fireEvent.click(screen.getByRole('button', { name: /Precronograma/ }))
    expect(onSelectStep).toHaveBeenCalledWith('draft')

    expect(screen.queryByRole('button', { name: /Final/ })).not.toBeInTheDocument()
  })

  it('marca aria-current en el paso resaltado por activeIndex, no solo en currentIndex', () => {
    render(<WorkflowStepper activeIndex={0} currentIndex={1} steps={steps} onSelectStep={vi.fn()} />)

    const configItem = screen.getByRole('button', { name: /Configurar/ }).closest('li')
    const draftItem = screen.getByRole('button', { name: /Precronograma/ }).closest('li')
    expect(configItem).toHaveAttribute('aria-current', 'step')
    expect(draftItem).not.toHaveAttribute('aria-current')
  })
})
