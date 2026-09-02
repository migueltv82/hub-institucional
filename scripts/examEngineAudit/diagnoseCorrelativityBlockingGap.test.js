import { describe, expect, it } from 'vitest'
import { buildCorrelativityTargetCasesFromPlan } from './diagnoseCorrelativityBlockingGap.mjs'

describe('diagnoseCorrelativityBlockingGap target cases', () => {
  it('selecciona solo mesas pendientes por correlatividad del plan generado', () => {
    const cases = buildCorrelativityTargetCasesFromPlan({
      unassignedMesas: [
        {
          id: 'mesa-preliminar:candidate:profesorado de ingles::ing39:PRIMER_LLAMADO',
          estado: 'SIN_FECHA_TENTATIVA',
          reason: 'CORRELATIVIDAD_CONFLICTIVA',
          carrera: 'PROFESORADO DE INGLES',
          materiaId: 'aaaaaaaa-1111-4222-8333-bbbbbbbbbbbb',
          materia: 'LITERATURA ANGLOFONA',
          llamado: 'PRIMER_LLAMADO',
        },
        {
          id: 'compact:mesa-preliminar:candidate:profesorado de ingles::ing36:PRIMER_LLAMADO+mesa-preliminar:candidate:profesorado de ingles::ing28:PRIMER_LLAMADO',
          estado: 'SIN_FECHA_TENTATIVA',
          reason: 'CORRELATIVIDAD_CONFLICTIVA',
          carrera: 'PROFESORADO DE INGLES',
          materiaId: 'cccccccc-1111-4222-8333-dddddddddddd+eeeeeeee-1111-4222-8333-ffffffffffff',
          materia: 'EDI / PRACTICAS DISCURSIVAS EN INGLES III',
          llamado: 'PRIMER_LLAMADO',
        },
        {
          id: 'mesa-docente',
          estado: 'SIN_FECHA_TENTATIVA',
          reason: 'DOCENTE_SUPERPUESTO',
          carrera: 'PROFESORADO DE INGLES',
          materiaId: 'ING40',
        },
        {
          id: 'mesa-planificada',
          estado: 'FECHA_TENTATIVA',
          reason: 'CORRELATIVIDAD_CONFLICTIVA',
          carrera: 'PROFESORADO DE INGLES',
          materiaId: 'ING41',
        },
      ],
    })

    expect(cases).toEqual([
      {
        caseId: 'CBG-0001',
        mesa: {
          id: 'mesa-preliminar:candidate:profesorado de ingles::ing39:PRIMER_LLAMADO',
          carrera: 'PROFESORADO DE INGLES',
          carreraId: '',
          materiaCodigo: 'ING39',
          materiaNombre: 'LITERATURA ANGLOFONA',
          llamado: 'PRIMER_LLAMADO',
        },
      },
      {
        caseId: 'CBG-0002',
        mesa: {
          id: 'compact:mesa-preliminar:candidate:profesorado de ingles::ing36:PRIMER_LLAMADO+mesa-preliminar:candidate:profesorado de ingles::ing28:PRIMER_LLAMADO',
          carrera: 'PROFESORADO DE INGLES',
          carreraId: '',
          materiaCodigo: 'ING36 / ING28',
          materiaNombre: 'EDI / PRACTICAS DISCURSIVAS EN INGLES III',
          llamado: 'PRIMER_LLAMADO',
        },
      },
    ])
  })
})
