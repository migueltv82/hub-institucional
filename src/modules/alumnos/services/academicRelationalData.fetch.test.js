import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  tablesRead: [],
  grades: [],
}))

function queryFor(tableName) {
  const query = {
    select() { return query },
    eq() { return query },
    is() { return query },
    order() {
      return Promise.resolve({
        data: tableName === 'student_grades' ? mocks.grades : [],
        error: null,
      })
    },
  }
  return query
}

vi.mock('../../../lib/supabase.js', () => ({
  isSupabaseConfigured: true,
  supabase: {
    rpc: vi.fn(async () => ({
      data: {
        stage: 'snapshot_only',
        read_mode: 'snapshot_only',
        write_mode: 'snapshot_only',
        hybrid_read_enabled: false,
        relational_primary_enabled: false,
        snapshot_fallback_enabled: true,
      },
      error: null,
    })),
    from: vi.fn((tableName) => {
      mocks.tablesRead.push(tableName)
      return queryFor(tableName)
    }),
  },
}))

import { fetchAcademicRelationalSnapshotOverlay } from './academicRelationalData.js'

describe('fetchAcademicRelationalSnapshotOverlay', () => {
  beforeEach(() => {
    mocks.tablesRead = []
    mocks.grades = []
  })

  it('lee las notas propias aunque la transicion siga en snapshot_only', async () => {
    mocks.grades = [{
      id: 'grade-1',
      student_id: 'student-1',
      subject_id: 'ING06',
      program_id: 'PROFESORADO DE INGLES',
      grade_type: 'final',
      attempt_number: 1,
      grade_value: 8,
      grade_scale: 'numeric_0_10',
      academic_status: 'regular',
    }]

    const result = await fetchAcademicRelationalSnapshotOverlay({
      institutionId: 'institution-1',
      user: { id: 'student-1' },
      useRemote: true,
    })

    expect(mocks.tablesRead).toEqual(['student_grades'])
    expect(result.relationalData.grades).toEqual([
      expect.objectContaining({
        subject_id: 'ING06',
        score: 8,
        academic_status: 'regular',
        source: 'relational',
      }),
    ])
  })
})
