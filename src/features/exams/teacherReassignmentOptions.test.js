import { describe, expect, it } from 'vitest'
import { buildTeacherReassignmentOptions } from './teacherReassignmentOptions.js'

const objectedAssignment = {
  exam_table_id: 'mesa-origen',
  role: 'VOCAL_1',
  metadata: { carrera: 'Profesorado de Ingles', fecha: '2026-08-10' },
}

const teacher = {
  availability: [
    { fecha: '2026-08-12' },
    { fecha: '2026-08-13' },
    { fecha: '2026-08-14' },
  ],
}

function target(overrides = {}) {
  return {
    id: 'mesa-destino',
    carrera: 'PROFESORADO DE INGLES',
    materiaMesa: 'Lengua Inglesa',
    fecha: '2026-08-12',
    inicio: '18:00',
    fin: '20:00',
    titularId: 'doc-titular',
    vocal1Id: 'doc-vocal',
    vocal2Id: '',
    ...overrides,
  }
}

describe('buildTeacherReassignmentOptions', () => {
  it('ofrece un puesto vocal vacante de la misma carrera y fecha disponible', () => {
    expect(buildTeacherReassignmentOptions({ objectedAssignment, mesas: [target()], teacher })).toEqual([
      expect.objectContaining({
        sourceExamTableId: 'mesa-origen', targetExamTableId: 'mesa-destino',
        targetRole: 'VOCAL_2', fecha: '2026-08-12', reason: 'VACANT_ROLE_SAME_CAREER',
      }),
    ])
  })

  it('no ofrece otra carrera ni una fecha no disponible', () => {
    const options = buildTeacherReassignmentOptions({
      objectedAssignment,
      teacher,
      mesas: [
        target({ id: 'otra-carrera', carrera: 'Profesorado de Historia' }),
        target({ id: 'sin-disponibilidad', fecha: '2026-08-20' }),
      ],
    })
    expect(options).toEqual([])
  })

  it('ofrece una mesa completa como solicitud de intercambio sin cambiarla automaticamente', () => {
    const options = buildTeacherReassignmentOptions({
      objectedAssignment,
      teacher,
      mesas: [target({ vocal2Id: 'doc-vocal-2' })],
    })
    expect(options).toEqual([
      expect.objectContaining({ targetRole: 'VOCAL_1', requiresSwap: true, reason: 'ROLE_SWAP_REQUIRED' }),
    ])
  })

  it('ofrece fechas de la carrera si no hay restricciones explicitas de disponibilidad', () => {
    const options = buildTeacherReassignmentOptions({ objectedAssignment, teacher: {}, mesas: [target()] })
    expect(options).toHaveLength(1)
  })

  it('descarta una mesa que se superpone con otra asignacion del docente', () => {
    const options = buildTeacherReassignmentOptions({
      objectedAssignment,
      mesas: [target()],
      teacher,
      teacherAssignments: [{
        exam_table_id: 'mesa-ocupada', status: 'active',
        metadata: { fecha: '2026-08-12', inicio: '19:00', fin: '21:00' },
      }],
    })
    expect(options).toEqual([])
  })

  it('mantiene titular como titular y no ocupa un puesto vocal', () => {
    const options = buildTeacherReassignmentOptions({
      objectedAssignment: { ...objectedAssignment, role: 'TITULAR' },
      teacher,
      mesas: [target({ titularId: '', vocal2Id: '' })],
    })
    expect(options).toHaveLength(1)
    expect(options[0].targetRole).toBe('TITULAR')
  })
})
