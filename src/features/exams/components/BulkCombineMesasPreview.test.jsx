import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import BulkCombineMesasPreview from './BulkCombineMesasPreview.jsx'

const examCallConfig = {
  fechaInicio: '2026-07-30',
  fechaFin: '2026-08-12',
  usarDiasHabiles: true,
  carrerasIncluidas: 'ALL',
  estadoSalida: 'TEACHER_REVIEW',
}

function combinableMesas() {
  return [
    {
      id: 'draft:prof-historia::MAT1:PRIMER_LLAMADO',
      draftMesaId: 'draft:prof-historia::MAT1:PRIMER_LLAMADO',
      fecha: '2026-07-30',
      fechaSugerida: '2026-07-30',
      carreraId: 'prof-historia',
      carrera: 'Profesorado de Historia',
      anio: 1,
      materiaId: 'MAT1',
      materiaMesa: 'Didactica General',
      materia: 'Didactica General',
      titularId: 'doc-titular',
      titular: 'Ana Titular',
      llamado: 'PRIMER_LLAMADO',
      estado: 'READY_FOR_TRIBUNAL',
      alertas: [],
    },
    {
      id: 'draft:prof-historia::MAT2:PRIMER_LLAMADO',
      draftMesaId: 'draft:prof-historia::MAT2:PRIMER_LLAMADO',
      fecha: '2026-07-30',
      fechaSugerida: '2026-07-30',
      carreraId: 'prof-historia',
      carrera: 'Profesorado de Historia',
      anio: 1,
      materiaId: 'MAT2',
      materiaMesa: 'Historia Antigua',
      materia: 'Historia Antigua',
      titularId: 'doc-titular',
      titular: 'Ana Titular',
      llamado: 'PRIMER_LLAMADO',
      estado: 'READY_FOR_TRIBUNAL',
      alertas: [],
    },
  ]
}

function nonCombinableMesas() {
  return [combinableMesas()[0]]
}

describe('BulkCombineMesasPreview', () => {
  it('muestra el ahorro y el desglose por tipo cuando hay mesas combinables por el mismo titular', () => {
    render(
      <BulkCombineMesasPreview
        reviewedSchedule={combinableMesas()}
        docentes={[]}
        correlatividades={[]}
        examCallConfig={examCallConfig}
        onApply={vi.fn()}
      />,
    )

    expect(screen.getByText('Te ahorrarías 1 tribunal combinando 2 mesas')).toBeInTheDocument()
    expect(screen.getByText('Mismo titular: 1')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Aplicar combinaciones sugeridas' })).toBeEnabled()
  })

  it('aplica la combinacion sugerida y avisa al padre con las mesas compactadas', () => {
    const onApply = vi.fn()
    render(
      <BulkCombineMesasPreview
        reviewedSchedule={combinableMesas()}
        docentes={[]}
        correlatividades={[]}
        examCallConfig={examCallConfig}
        onApply={onApply}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Aplicar combinaciones sugeridas' }))

    expect(onApply).toHaveBeenCalledTimes(1)
    const [nextReviewedSchedule] = onApply.mock.calls[0]
    expect(nextReviewedSchedule).toHaveLength(1)
    expect(nextReviewedSchedule[0]).toMatchObject({
      estado: 'READY_FOR_TRIBUNAL',
      combinada: true,
      tipoCompactacion: 'MISMO_TITULAR',
    })
  })

  it('muestra estado vacio cuando no hay precronograma todavia', () => {
    render(
      <BulkCombineMesasPreview
        reviewedSchedule={[]}
        docentes={[]}
        correlatividades={[]}
        examCallConfig={examCallConfig}
        onApply={vi.fn()}
      />,
    )

    expect(screen.getByText('Generá el precronograma primero para ver combinaciones posibles.')).toBeInTheDocument()
  })

  it('avisa cuando no hay combinaciones posibles con una sola mesa', () => {
    render(
      <BulkCombineMesasPreview
        reviewedSchedule={nonCombinableMesas()}
        docentes={[]}
        correlatividades={[]}
        examCallConfig={examCallConfig}
        onApply={vi.fn()}
      />,
    )

    expect(screen.getByText(/No se encontraron combinaciones/)).toBeInTheDocument()
  })
})
