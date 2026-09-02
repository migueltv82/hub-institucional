import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import ManualMesaBuilderForm from './ManualMesaBuilderForm.jsx'

const docentes = [
  { id: 'doc-titular', nombre: 'Ana Titular' },
  { id: 'doc-vocal-a', nombre: 'Bruno Vocal' },
]

const materias = [
  { materia: 'ESP01', nombreMateria: 'Coloquio Final', carrera: 'Profesorado de Historia', anio: 4 },
]

describe('ManualMesaBuilderForm', () => {
  it('el boton agregar y continuar arrancan deshabilitados sin datos', () => {
    render(<ManualMesaBuilderForm docentes={docentes} materias={materias} onConfirm={vi.fn()} />)

    expect(screen.getByRole('button', { name: /Agregar mesa/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: /Continuar a envío a docentes/ })).toBeDisabled()
  })

  it('seleccionar una materia del catalogo prellena carrera y anio, y agregar la suma a la lista', () => {
    render(<ManualMesaBuilderForm docentes={docentes} materias={materias} onConfirm={vi.fn()} />)

    fireEvent.change(screen.getByLabelText('Materia'), { target: { value: 'ESP01 - Coloquio Final (Profesorado de Historia, 4° año)' } })
    expect(screen.getByLabelText('Carrera')).toHaveValue('Profesorado de Historia')
    expect(screen.getByLabelText('Año')).toHaveValue('4')

    fireEvent.change(screen.getByLabelText('Titular'), { target: { value: 'Ana Titular' } })
    fireEvent.click(screen.getByRole('button', { name: /Agregar mesa/ }))

    expect(screen.getByText('Coloquio Final')).toBeInTheDocument()
    expect(screen.getByText('Ana Titular')).toBeInTheDocument()
    expect(screen.getByText('Sin vocales')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Continuar a envío a docentes/ })).toBeEnabled()
  })

  it('seleccionar una materia del catalogo prellena el titular asignado', () => {
    render(
      <ManualMesaBuilderForm
        docentes={[{ id: 'doc-titular', nombre: 'teacher-interno', full_name: 'Ana Titular' }]}
        materias={[{
          ...materias[0],
          titularId: 'doc-titular',
        }]}
        onConfirm={vi.fn()}
      />,
    )

    fireEvent.change(screen.getByLabelText('Materia'), { target: { value: 'ESP01 - Coloquio Final (Profesorado de Historia, 4° año)' } })

    expect(screen.getByLabelText('Titular')).toHaveValue('Ana Titular')
  })

  it('el buscador de docentes muestra nombres humanos y oculta codigos tecnicos', () => {
    const { container } = render(
      <ManualMesaBuilderForm
        docentes={[
          { id: 'teacher-real', nombre: 'teacher-interno', full_name: 'Carla Vocal' },
          { id: 'doc-uuid', nombre: '2b28c23c-6552-43bf-b458-6e7219f74386' },
          { id: 'doc-code', nombre: 'teacher-structured-001' },
          { id: 'doc-human', nombre: 'Dario Vocal' },
        ]}
        materias={materias}
        onConfirm={vi.fn()}
      />,
    )

    const options = [...container.querySelectorAll('#manual-mesa-docente-options option')]
      .map((option) => option.value)

    expect(options).toEqual(['Carla Vocal', 'Dario Vocal'])
    expect(options).not.toContain('teacher-interno')
    expect(options).not.toContain('teacher-structured-001')
    expect(options).not.toContain('2b28c23c-6552-43bf-b458-6e7219f74386')
  })

  it('quitar una mesa la saca de la lista', () => {
    render(<ManualMesaBuilderForm docentes={docentes} materias={materias} onConfirm={vi.fn()} />)

    fireEvent.change(screen.getByLabelText('Materia'), { target: { value: 'ESP01 - Coloquio Final (Profesorado de Historia, 4° año)' } })
    fireEvent.click(screen.getByRole('button', { name: /Agregar mesa/ }))
    expect(screen.getByText('Coloquio Final')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Quitar/ }))
    expect(screen.queryByText('Coloquio Final')).not.toBeInTheDocument()
  })

  it('continuar llama a onConfirm con las mesas construidas', () => {
    const onConfirm = vi.fn()
    render(<ManualMesaBuilderForm docentes={docentes} materias={materias} onConfirm={onConfirm} />)

    fireEvent.change(screen.getByLabelText('Materia'), { target: { value: 'ESP01 - Coloquio Final (Profesorado de Historia, 4° año)' } })
    fireEvent.change(screen.getByLabelText('Titular'), { target: { value: 'Ana Titular' } })
    fireEvent.change(screen.getByLabelText('Vocal 1'), { target: { value: 'Bruno Vocal' } })
    fireEvent.click(screen.getByRole('button', { name: /Agregar mesa/ }))
    fireEvent.click(screen.getByRole('button', { name: /Continuar a envío a docentes/ }))

    expect(onConfirm).toHaveBeenCalledTimes(1)
    const [mesas] = onConfirm.mock.calls[0]
    expect(mesas).toHaveLength(1)
    expect(mesas[0]).toMatchObject({
      materiaMesa: 'Coloquio Final',
      titularId: 'doc-titular',
      vocal1Id: 'doc-vocal-a',
      estado: 'TRIBUNAL_MINIMUM',
    })
  })

  it('continuar usa la mesa cargada aunque todavia no se haya agregado a la lista', () => {
    const onConfirm = vi.fn()
    render(<ManualMesaBuilderForm docentes={docentes} materias={materias} onConfirm={onConfirm} />)

    fireEvent.change(screen.getByLabelText('Materia'), { target: { value: 'ESP01 - Coloquio Final (Profesorado de Historia, 4° año)' } })
    fireEvent.change(screen.getByLabelText('Titular'), { target: { value: 'Ana Titular' } })
    fireEvent.click(screen.getByRole('button', { name: /Continuar a envío a docentes/ }))

    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(onConfirm.mock.calls[0][0]).toEqual([
      expect.objectContaining({
        materiaMesa: 'Coloquio Final',
        titularId: 'doc-titular',
      }),
    ])
  })

  it('el campo materia sin catalogo previo se toma como texto libre', () => {
    const onConfirm = vi.fn()
    render(<ManualMesaBuilderForm docentes={docentes} materias={[]} onConfirm={onConfirm} />)

    fireEvent.change(screen.getByLabelText('Materia'), { target: { value: 'Mesa suelta sin codigo' } })
    fireEvent.click(screen.getByRole('button', { name: /Agregar mesa/ }))
    fireEvent.click(screen.getByRole('button', { name: /Continuar a envío a docentes/ }))

    const [mesas] = onConfirm.mock.calls[0]
    expect(mesas[0].materiaMesa).toBe('Mesa suelta sin codigo')
  })
})
