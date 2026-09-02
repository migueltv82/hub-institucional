import { describe, expect, it } from 'vitest'
import { planBulkMesaCombinations } from './planBulkMesaCombinations.js'

const examCallConfig = {
  fechaInicio: '2026-07-30',
  fechaFin: '2026-08-12',
  usarDiasHabiles: true,
  carrerasIncluidas: 'ALL',
  estadoSalida: 'TEACHER_REVIEW',
}

function readyMesa(overrides = {}) {
  return {
    id: 'draft:default',
    draftMesaId: 'draft:default',
    fecha: '2026-07-30',
    fechaSugerida: '2026-07-30',
    carreraId: 'prof-historia',
    carrera: 'Profesorado de Historia',
    anio: 1,
    materiaId: 'MAT1',
    materiaMesa: 'Materia 1',
    materia: 'Materia 1',
    titularId: 'doc-titular',
    titular: 'Ana Titular',
    llamado: 'PRIMER_LLAMADO',
    estado: 'READY_FOR_TRIBUNAL',
    alertas: [],
    ...overrides,
  }
}

describe('planBulkMesaCombinations', () => {
  it('combina dos mesas del mismo titular y devuelve la mesa combinada lista para el panel interactivo', () => {
    const reviewedSchedule = [
      readyMesa({ id: 'm1', draftMesaId: 'm1', materiaId: 'MAT1', materiaMesa: 'Materia 1' }),
      readyMesa({ id: 'm2', draftMesaId: 'm2', materiaId: 'MAT2', materiaMesa: 'Materia 2' }),
    ]

    const plan = planBulkMesaCombinations({ reviewedSchedule, docentes: [], correlatividades: [], examCallConfig, compactMode: 'safe' })

    expect(plan.totalCombinaciones).toBe(1)
    expect(plan.typeCounts).toEqual({ MISMO_TITULAR: 1 })
    expect(plan.reviewedSchedule).toHaveLength(1)
    expect(plan.reviewedSchedule[0]).toMatchObject({
      estado: 'READY_FOR_TRIBUNAL',
      combinada: true,
      tipoCompactacion: 'MISMO_TITULAR',
    })
    expect(plan.reviewedSchedule[0].vocal1Id).toBe('')
  })

  it('no combina mesas de carreras distintas cuando la materia no es TIC ni pedagogica, ni en modo full', () => {
    const reviewedSchedule = [
      readyMesa({
        id: 'm1', draftMesaId: 'm1', materiaId: 'MAT1', materiaMesa: 'Fisica I',
        carreraId: 'prof-fisica', carrera: 'Profesorado de Fisica', titularId: 'doc-1', titular: 'Doc Uno',
      }),
      readyMesa({
        id: 'm2', draftMesaId: 'm2', materiaId: 'MAT2', materiaMesa: 'Quimica I',
        carreraId: 'prof-quimica', carrera: 'Profesorado de Quimica', titularId: 'doc-2', titular: 'Doc Dos',
      }),
    ]

    const plan = planBulkMesaCombinations({ reviewedSchedule, docentes: [], correlatividades: [], examCallConfig, compactMode: 'full' })

    expect(plan.totalCombinaciones).toBe(0)
    expect(plan.reviewedSchedule).toHaveLength(2)
  })

  it('con tres mesas del mismo titular, combina solo la primera pareja y deja la tercera sin tocar', () => {
    const reviewedSchedule = [
      readyMesa({ id: 'm1', draftMesaId: 'm1', materiaId: 'MAT1', materiaMesa: 'Materia 1' }),
      readyMesa({ id: 'm2', draftMesaId: 'm2', materiaId: 'MAT2', materiaMesa: 'Materia 2' }),
      readyMesa({ id: 'm3', draftMesaId: 'm3', materiaId: 'MAT3', materiaMesa: 'Materia 3' }),
    ]

    const plan = planBulkMesaCombinations({ reviewedSchedule, docentes: [], correlatividades: [], examCallConfig, compactMode: 'safe' })

    expect(plan.totalCombinaciones).toBe(1)
    expect(plan.reviewedSchedule).toHaveLength(2)
    expect(plan.reviewedSchedule.some((mesa) => mesa.id === 'm3')).toBe(true)
  })

  it('deja intactas las mesas que no estan READY_FOR_TRIBUNAL', () => {
    const reviewedSchedule = [
      readyMesa({ id: 'm1', draftMesaId: 'm1', materiaId: 'MAT1', materiaMesa: 'Materia 1' }),
      readyMesa({ id: 'm2', draftMesaId: 'm2', materiaId: 'MAT2', materiaMesa: 'Materia 2', estado: 'EXCLUDED_BY_REVIEW' }),
    ]

    const plan = planBulkMesaCombinations({ reviewedSchedule, docentes: [], correlatividades: [], examCallConfig, compactMode: 'safe' })

    expect(plan.totalCombinaciones).toBe(0)
    expect(plan.reviewedSchedule).toEqual(reviewedSchedule)
  })

  it('devuelve totalCombinaciones 0 y el mismo listado cuando no hay mesas', () => {
    const plan = planBulkMesaCombinations({ reviewedSchedule: [], docentes: [], correlatividades: [], examCallConfig })

    expect(plan.totalCombinaciones).toBe(0)
    expect(plan.reviewedSchedule).toEqual([])
  })
})
