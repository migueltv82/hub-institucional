import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import StudentCareerDashboard from './StudentCareerDashboard.jsx'

describe('StudentCareerDashboard', () => {
  it('resuelve carrera_id con el plan academico y cuenta alumnos unicos', () => {
    render(<StudentCareerDashboard
      alumnos={[
        { alumno_id: '1', carrera_id: '2' },
        { alumno_id: '2', carrera_id: '2' },
        { alumno_id: '2', carrera_id: '2', materia_id: 'ING02' },
        { alumno_id: '3', carrera_id: '4' },
      ]}
      planesEstudio={[
        { carrera_id: '2', carrera: 'PROFESORADO DE INGLES' },
        { carrera_id: '4', carrera: 'TECNICO SUPERIOR EN LABORATORIO' },
      ]}
    />)

    expect(screen.getByText('PROFESORADO DE INGLES')).toBeInTheDocument()
    expect(screen.getByText('2 alumnos cargados')).toBeInTheDocument()
    expect(screen.getByText('TECNICO SUPERIOR EN LABORATORIO')).toBeInTheDocument()
    expect(screen.getByText('1 alumno cargado')).toBeInTheDocument()
    expect(screen.queryByText('Sin carrera')).not.toBeInTheDocument()
  })

  it('muestra el nombre oficial cuando el alumno llega con codigo de carrera', () => {
    render(<StudentCareerDashboard
      alumnos={[
        { alumno_id: '1', carrera: 'ING' },
        { alumno_id: '2', carrera_id: 'LAB' },
      ]}
      planesEstudio={[
        { carrera_id: 'ING', carrera: 'ING', carrera_nombre: 'PROFESORADO DE INGLES' },
        { carrera_id: 'LAB', carrera: 'LAB', carrera_nombre: 'TECNICO SUPERIOR EN LABORATORIO' },
      ]}
    />)

    expect(screen.getByText('PROFESORADO DE INGLES')).toBeInTheDocument()
    expect(screen.getByText('TECNICO SUPERIOR EN LABORATORIO')).toBeInTheDocument()
    expect(screen.queryByText('ING')).not.toBeInTheDocument()
    expect(screen.queryByText('LAB')).not.toBeInTheDocument()
  })

  it('abre la carrera seleccionada al hacer click', () => {
    const onSelectCareer = vi.fn()
    render(<StudentCareerDashboard
      alumnos={[{ alumno_id: '1', carrera: 'PROFESORADO DE INGLES' }]}
      onSelectCareer={onSelectCareer}
    />)

    fireEvent.click(screen.getByRole('button', { name: 'Ver alumnos de PROFESORADO DE INGLES' }))
    expect(onSelectCareer).toHaveBeenCalledWith('PROFESORADO DE INGLES')
  })
})
