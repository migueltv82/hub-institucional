import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import PrerequisiteAlert from './PrerequisiteAlert.jsx'

describe('PrerequisiteAlert', () => {
  it('deja claro que la etiqueta es un requisito faltante, no una confirmacion', () => {
    render(
      <PrerequisiteAlert
        subjectId="ING12"
        prerequisites={[{
          subject_id: 'ING12',
          prerequisite_subject_id: 'ING01',
          prerequisite_subject: { id: 'ING01', code: 'ING01', name: 'Problematica de la educacion' },
          requirement_type: 'approved',
        }]}
        enrollments={[]}
        grades={[]}
        subjects={[]}
        compact
      />,
    )

    expect(screen.getByText('Correlatividades pendientes')).toBeInTheDocument()
    expect(screen.getByText('Requiere aprobada')).toBeInTheDocument()
    expect(screen.queryByText('Aprobada')).not.toBeInTheDocument()
  })

  it('muestra que cumple las correlatividades cuando no faltan', () => {
    render(
      <PrerequisiteAlert
        subjectId="ING01"
        prerequisites={[]}
        enrollments={[]}
        grades={[]}
        subjects={[]}
      />,
    )

    expect(screen.getByText('Esta materia no tiene correlatividades cargadas.')).toBeInTheDocument()
  })
})
