import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import ExamCallConfigForm from './ExamCallConfigForm.jsx'

function baseForm(overrides = {}) {
  return {
    tipoPeriodo: 'REGULAR',
    cantidadLlamados: 1,
    fechaInicio: '2026-07-30',
    fechaFin: '2026-08-12',
    usarDiasHabiles: true,
    carrerasIncluidas: 'ALL',
    alcanceCarrera: 'ALL',
    alcanceAnios: [],
    excepcionesPorCarrera: [],
    ...overrides,
  }
}

const careerOptions = [
  { name: 'Profesorado de Geografia', years: [1, 2, 3, 4] },
  { name: 'Profesorado de Quimica', years: [1, 2, 3, 4] },
]

describe('ExamCallConfigForm', () => {
  it('permite elegir una carrera como alcance y reinicia los anos', () => {
    const onChange = vi.fn()
    render(
      <ExamCallConfigForm
        careerOptions={careerOptions}
        form={baseForm()}
        onChange={onChange}
        onGenerateDraft={vi.fn()}
        validation={{ errors: [], warnings: [] }}
      />,
    )

    fireEvent.change(screen.getByLabelText('Carrera a generar'), {
      target: { value: 'Profesorado de Geografia' },
    })

    expect(onChange).toHaveBeenCalledWith('alcanceCarrera', 'Profesorado de Geografia')
    expect(onChange).toHaveBeenCalledWith('alcanceAnios', [])
  })

  it('permite seleccionar anos incluidos para la carrera elegida', () => {
    const onChange = vi.fn()
    render(
      <ExamCallConfigForm
        careerOptions={careerOptions}
        form={baseForm({
          alcanceCarrera: 'Profesorado de Geografia',
          alcanceAnios: [],
        })}
        onChange={onChange}
        onGenerateDraft={vi.fn()}
        validation={{ errors: [], warnings: [] }}
      />,
    )

    fireEvent.click(screen.getByRole('checkbox', { name: /1 a.o/i }))

    expect(onChange).toHaveBeenCalledWith('alcanceAnios', [1])
  })

  it('marca todos los anos cuando no hay anos especificos seleccionados', () => {
    const onChange = vi.fn()
    render(
      <ExamCallConfigForm
        careerOptions={careerOptions}
        form={baseForm({
          alcanceCarrera: 'Profesorado de Geografia',
          alcanceAnios: [4],
        })}
        onChange={onChange}
        onGenerateDraft={vi.fn()}
        validation={{ errors: [], warnings: [] }}
      />,
    )

    fireEvent.click(screen.getByRole('checkbox', { name: /Todos los a.os/i }))

    expect(onChange).toHaveBeenCalledWith('alcanceAnios', [])
  })

  it('en llamado especial, oculta el alcance por carrera/anio y cambia el label del boton principal', () => {
    render(
      <ExamCallConfigForm
        careerOptions={careerOptions}
        form={baseForm({ tipoPeriodo: 'ESPECIAL' })}
        onChange={vi.fn()}
        onGenerateDraft={vi.fn()}
        validation={{ errors: [], warnings: [] }}
      />,
    )

    expect(screen.queryByLabelText('Carrera a generar')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Continuar a armar mesas/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Generar precronograma/ })).not.toBeInTheDocument()
  })

  it('en llamado regular, muestra el alcance por carrera/anio y el label original', () => {
    render(
      <ExamCallConfigForm
        careerOptions={careerOptions}
        form={baseForm()}
        onChange={vi.fn()}
        onGenerateDraft={vi.fn()}
        validation={{ errors: [], warnings: [] }}
      />,
    )

    expect(screen.getByLabelText('Carrera a generar')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Generar precronograma/ })).toBeInTheDocument()
  })
})
