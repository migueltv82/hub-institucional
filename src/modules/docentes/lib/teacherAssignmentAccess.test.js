import { describe, expect, it } from 'vitest'
import { isLeaveReplacement, teacherAssignmentAccessState } from './teacherAssignmentAccess.js'

const today = '2026-10-21'
const leave = { leave_starts_on: '2026-10-24', leave_ends_on: '2026-10-31' }

describe('teacherAssignmentAccessState (espejo de academic_teacher_assignment_grants_access)', () => {
  it('suplente: solo dentro de su periodo en las columnas nativas autoritativas', () => {
    expect(teacherAssignmentAccessState({ role: 'suplente', starts_on: '2026-10-24', ends_on: '2026-10-31' }, today).visible).toBe(false)
    expect(teacherAssignmentAccessState({ role: 'suplente', starts_on: '2026-10-20', ends_on: '2026-10-21', metadata: {} }, today).visible).toBe(true)
    expect(teacherAssignmentAccessState({ role: 'suplente', starts_on: '2026-10-01', ends_on: '2026-10-20', metadata: {} }, today).visible).toBe(false)
  })

  it('no sustituye columnas nulas por fechas legacy de metadata, igual que SQL', () => {
    expect(teacherAssignmentAccessState({ role: 'titular', starts_on: null, ends_on: null, metadata: { starts_on: '9999-01-01' } }, today).visible).toBe(true)
  })

  it.each(['garbage', '2026-02-30', '2026-10-24T00:00:00Z', ' 2026-10-24'])('licencia con fecha invalida %s no se convierte en titular', (value) => {
    expect(teacherAssignmentAccessState({ role: 'licencia', metadata: { leave_starts_on: value } }, today).onLeave).toBe(true)
  })

  it('titular en licencia: titular antes y despues del periodo, en licencia durante', () => {
    expect(teacherAssignmentAccessState({ role: 'licencia', metadata: leave }, today)).toEqual({ visible: true, onLeave: false, effectiveRole: 'titular' })
    expect(teacherAssignmentAccessState({ role: 'licencia', metadata: leave }, '2026-10-24')).toEqual({ visible: true, onLeave: true, effectiveRole: 'licencia' })
    expect(teacherAssignmentAccessState({ role: 'licencia', metadata: leave }, '2026-11-01').effectiveRole).toBe('titular')
    expect(teacherAssignmentAccessState({ role: 'licencia', metadata: {} }, today).onLeave).toBe(true)
  })

  it('reconoce una suplencia por vinculo, metadata o source', () => {
    expect(isLeaveReplacement({ replaces_assignment_id: 'a1' })).toBe(true)
    expect(isLeaveReplacement({ source: 'leave' })).toBe(true)
    expect(isLeaveReplacement({ metadata: { leave_parent_assignment_id: 'a1' } })).toBe(true)
    expect(isLeaveReplacement({ source: 'manual' })).toBe(false)
  })
})
