import { readFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'
import vm from 'node:vm'
import { describe, expect, it, vi } from 'vitest'

// Run the actual Edge authorization functions without replacing identity or date checks.
const source = readFileSync('supabase/functions/admin-users/index.ts', 'utf8').replace(/\r\n/g, '\n')
const functions = [
  'isRecord', 'asRecordArray', 'getOptionalString', 'normalizePortalText', 'normalizePortalIdentity',
  'addTeacherRosterSubjectAlias', 'getTeacherRosterSubjectAliases', 'teacherRosterSubjectMatches',
  'teacherRosterProgramMatches', 'getTeacherRosterIsoDate', 'isTeacherRosterAssignmentInActiveWindow',
  'getTeacherRosterCallerDisplayName', 'getTeacherRosterSubjectId', 'getTeacherRosterProgramId',
  'snapshotTeacherRosterRowMatchesCaller', 'addAccessibleTeacherRosterSubject',
  'collectAccessibleTeacherRosterSubjects', 'fetchTeacherRosterAssignments',
]
function extract(name) {
  const match = source.match(new RegExp(`(?:async )?function ${name}\\([\\s\\S]*?\\n}(?=\\n|$)`))
  if (!match) throw new Error(`Missing Edge function: ${name}`)
  return match[0]
}
const edge = vm.createContext({ Date })
vm.runInContext(stripTypeScriptTypes(functions.map(extract).join('\n')), edge)
const today = '2026-10-21'
const row = (extra = {}) => ({
  teacher_id: 'teacher-A', subject_id: 'MAT1', program_id: 'Career',
  status: 'active', role: 'titular', deleted_at: null, metadata: {}, ...extra,
})
const snapshot = { docenteMateria: [{ teacher_id: 'teacher-A', subject_id: 'MAT1', program_id: 'Career' }] }
const args = (assignments, payload = snapshot) => ({
  assignments, snapshot: payload, context: { caller: { id: 'teacher-A', email: 'synthetic@example.invalid' }, profile: {} },
  teacherRecords: [], institutionId: 'institution-A',
})

describe('GATE.C2 N1: snapshot cannot override relational authorization', () => {
  it.each([
    ['future substitute', row({ role: 'suplente', starts_on: '9999-01-01' })],
    ['expired substitute', row({ role: 'suplente', ends_on: '2000-01-01' })],
    ['teacher on indefinite leave', row({ role: 'licencia' })],
    ['inactive assignment', row({ status: 'inactive' })],
    ['deleted assignment', row({ deleted_at: '2026-10-01T00:00:00Z' })],
    ['reassigned to another teacher', row({ teacher_id: 'teacher-B' })],
  ])('denies %s even with a stale matching snapshot', (_name, assignment) => {
    expect(edge.collectAccessibleTeacherRosterSubjects(args([assignment]))).toEqual([])
  })

  it('keeps a valid assignment and a genuine snapshot-only subject', () => {
    expect(edge.collectAccessibleTeacherRosterSubjects(args([row()]))).toEqual([
      { subjectId: 'MAT1', programId: 'Career', source: 'subject_teacher_assignments' },
    ])
    expect(edge.collectAccessibleTeacherRosterSubjects(args([]))).toEqual([
      { subjectId: 'MAT1', programId: 'Career', source: 'workspace_snapshot' },
    ])
  })

  it('does not use an assignment from a different career to suppress snapshot fallback', () => {
    expect(edge.collectAccessibleTeacherRosterSubjects(args([row({ program_id: 'Other', teacher_id: 'teacher-B' })]))).toEqual([
      { subjectId: 'MAT1', programId: 'Career', source: 'workspace_snapshot' },
    ])
  })

  it('an explicit teacher identity cannot be overridden by an old or homonymous teacher record', () => {
    expect(edge.collectAccessibleTeacherRosterSubjects({
      ...args([row({ teacher_id: 'teacher-B', teacher_record_id: 'record-A' })]),
      teacherRecords: [{ id: 'record-A' }],
    })).toEqual([])
  })

  it('fetches native dates and revocations, with institution and workspace filters', async () => {
    const query = {
      select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(), range: vi.fn().mockReturnThis(),
      then: (resolve) => resolve({ data: [], error: null }),
    }
    await edge.fetchTeacherRosterAssignments({ adminClient: { from: () => query }, institutionId: 'A', workspaceKey: 'main' })
    const selected = query.select.mock.calls[0][0].split(',').map((value) => value.trim())
    expect(selected).toEqual(expect.arrayContaining(['starts_on', 'ends_on', 'deleted_at']))
    expect(query.eq.mock.calls).toEqual([['institution_id', 'A'], ['workspace_key', 'main']])
  })

  it('a revocation on the second page still suppresses the stale snapshot', async () => {
    const firstPage = Array.from({ length: 500 }, (_, index) => row({ subject_id: `OTHER${index}`, teacher_id: 'teacher-B' }))
    const pages = [{ data: firstPage, error: null }, { data: [row({ status: 'inactive' })], error: null }]
    const ranges = []
    const query = {
      select() { return this }, eq() { return this }, order() { return this },
      range(start, end) { ranges.push([start, end]); return Promise.resolve(pages.shift()) },
    }
    const assignments = await edge.fetchTeacherRosterAssignments({ adminClient: { from: () => query }, institutionId: 'A', workspaceKey: 'main' })
    expect(ranges).toEqual([[0, 499], [500, 999]])
    expect(assignments).toHaveLength(501)
    expect(edge.collectAccessibleTeacherRosterSubjects(args(assignments))).toEqual([])
  })

  it('does not fall back to snapshot permissions when assignment lookup fails', async () => {
    const failure = { code: '42501', message: 'denied' }
    const query = {
      select() { return this }, eq() { return this }, order() { return this },
      range() { return Promise.resolve({ data: null, error: failure }) },
    }
    await expect(edge.fetchTeacherRosterAssignments({ adminClient: { from: () => query }, institutionId: 'A', workspaceKey: 'main' })).rejects.toEqual(failure)
  })
})

describe('GATE.C2 N2: strict license dates agree with academic_try_iso_date', () => {
  it.each(['garbage', '2026-13-45', '2026-02-30', '2026-10-24T00:00:00Z', '2026-10-24 garbage'])('invalid start %s does not grant access', (value) => {
    expect(edge.isTeacherRosterAssignmentInActiveWindow(row({ role: 'licencia', metadata: { leave_starts_on: value } }), today)).toBe(false)
  })

  it('accepts real ISO calendar dates only and respects inclusive boundaries', () => {
    expect(edge.getTeacherRosterIsoDate('2024-02-29')).toBe('2024-02-29')
    expect(edge.getTeacherRosterIsoDate('2025-02-29')).toBe('')
    expect(edge.isTeacherRosterAssignmentInActiveWindow(row({ starts_on: today, ends_on: today }), today)).toBe(true)
    const license = row({ role: 'licencia', metadata: { leave_starts_on: '2026-10-24', leave_ends_on: '2026-10-31' } })
    expect(edge.isTeacherRosterAssignmentInActiveWindow(license, today)).toBe(true)
    expect(edge.isTeacherRosterAssignmentInActiveWindow(license, '2026-10-24')).toBe(false)
    expect(edge.isTeacherRosterAssignmentInActiveWindow(license, '2026-10-31')).toBe(false)
    expect(edge.isTeacherRosterAssignmentInActiveWindow(license, '2026-11-01')).toBe(true)
  })
})
