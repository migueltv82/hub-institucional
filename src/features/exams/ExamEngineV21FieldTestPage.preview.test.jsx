import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { academicRelationalSchemaFixture } from '../../utils/examEngine/relationalSource/__fixtures__/academicRelationalSchema.fixture.js'
import { mapAcademicRelationalRowsToSnapshot } from '../../utils/examEngine/relationalSource/mapAcademicRelationalRowsToSnapshot.js'

const remote = vi.hoisted(() => ({ fetchExamTeacherAssignmentsForReview: vi.fn(), publishExamTeacherAssignmentsForReview: vi.fn(), resetExamProcessForWorkspace: vi.fn() }))
vi.mock('../../services/examTeacherAssignments.js', () => remote)
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }))
// Exercise review/reset boundaries without depending on manual vocal interactions.
vi.mock('./components/InteractiveVocalSelectionPanel.jsx', () => ({ default: ({ onConfirm, confirmLabel }) => <button onClick={() => onConfirm({ generatedTribunals: [{ id: 'preview-1', draftMesaId: 'preview-1', materiaId: 'ING01', materia: 'Pedagogia', materiaMesa: 'Pedagogia', fecha: '2026-11-03', titularId: 'teacher-1', titular: 'Ana', vocal1Id: 'teacher-2', vocal1: 'Luis', vocal2Id: 'teacher-3', vocal2: 'Marta', carrera: 'INGLES', estado: 'TRIBUNAL_COMPLETE' }] })}>{confirmLabel}</button> }))
import ExamEngineV21FieldTestPage from './ExamEngineV21FieldTestPage.jsx'

function snapshot() {
  const tables = structuredClone(academicRelationalSchemaFixture)
  tables.course_schedules.push({ institution_id: 'inst-1', plan_subject_id: 'sps-ing03', teacher_id: 'teacher-3', weekday: 2, starts_at: '18:00:00', ends_at: '20:00:00' })
  tables.teacher_subject_assignments.push({ institution_id: 'inst-1', plan_subject_id: 'sps-ing02', teacher_id: 'teacher-2', role: 'titular', status: 'active' })
  return mapAcademicRelationalRowsToSnapshot(tables).snapshot
}

describe('modo preview sin operaciones remotas', () => {
  beforeEach(() => vi.clearAllMocks())
  it('exige fechas, genera, revisa y reinicia sin publicaciones ni escrituras', async () => {
    const publish = vi.fn()
    const reset = vi.fn()
    render(<ExamEngineV21FieldTestPage mode="preview" institutionId="inst-1" workspaceSnapshot={snapshot()} onPublishOfficialSchedule={publish} onResetExamProcess={reset} />)
    expect(screen.getByLabelText('Inicio del primer llamado')).toHaveValue('')
    expect(screen.queryByRole('option', { name: 'Especial' })).not.toBeInTheDocument()
    expect(screen.queryByText(/Considerar el cronograma actual/)).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Inicio del primer llamado'), { target: { value: '2026-11-02' } })
    fireEvent.change(screen.getByLabelText('Fin del primer llamado'), { target: { value: '2026-11-06' } })
    fireEvent.click(screen.getByRole('button', { name: 'Generar precronograma' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Ver resultado de la previsualizacion' }))
    expect(await screen.findByText('Resultado de la previsualizacion')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Publicar/ })).not.toBeInTheDocument()
    expect(screen.queryByText('PDF para docentes')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Reiniciar previsualizacion' }))
    expect(screen.getByRole('button', { name: 'Generar precronograma' })).toBeInTheDocument()
    Object.values(remote).forEach((mock) => expect(mock).not.toHaveBeenCalled())
    expect(publish).not.toHaveBeenCalled()
    expect(reset).not.toHaveBeenCalled()
  })
})
