import { describe, expect, it } from 'vitest'
import { checkCorrelativityForSlot, markPlannedSubjects } from './planTentativeDates.js'

// Regresion (hallada por engineInvariants.property.test.js, semilla 175): la correlativa
// previa se buscaba sin distinguir llamado, asi que en el segundo llamado una materia
// posterior se comparaba contra la fecha de su previa en el PRIMER llamado y quedaba invertida.
const links = [{ previaAliases: ['m5'], posteriorAliases: ['m2'] }]
const mesa = (id, materia, llamado, fecha) => ({ id, materiaId: materia, materia, codigo: materia, llamado, fecha })

function plannedWith(...mesas) {
  const planned = new Map()
  mesas.forEach((entry) => markPlannedSubjects(planned, entry))
  return planned
}

describe('checkCorrelativityForSlot por llamado', () => {
  it('no usa la fecha de la previa de otro llamado para habilitar la posterior', () => {
    const planned = plannedWith(mesa('m5-p', 'M5', 'PRIMER_LLAMADO', '2026-07-27'))
    const result = checkCorrelativityForSlot({ mesa: mesa('m2-s', 'M2', 'SEGUNDO_LLAMADO'), slot: { fecha: '2026-08-04' }, plannedBySubject: planned, links })
    expect(result.errors.map((error) => error.code)).toEqual(['CORRELATIVIDAD_CONFLICTIVA'])
  })

  it('compara contra la previa del mismo llamado aunque la del otro llamado se haya registrado despues', () => {
    const planned = plannedWith(mesa('m5-s', 'M5', 'SEGUNDO_LLAMADO', '2026-08-06'), mesa('m5-p', 'M5', 'PRIMER_LLAMADO', '2026-07-27'))
    const inverted = checkCorrelativityForSlot({ mesa: mesa('m2-s', 'M2', 'SEGUNDO_LLAMADO'), slot: { fecha: '2026-08-04' }, plannedBySubject: planned, links })
    expect(inverted.errors[0]).toMatchObject({ code: 'CORRELATIVIDAD_CONFLICTIVA', previaMesaId: 'm5-s' })
    const ordered = checkCorrelativityForSlot({ mesa: mesa('m2-s', 'M2', 'SEGUNDO_LLAMADO'), slot: { fecha: '2026-08-07' }, plannedBySubject: planned, links })
    expect(ordered.errors).toEqual([])
  })

  it('protege tambien la direccion inversa: una previa no puede ir despues de su posterior del mismo llamado', () => {
    const planned = plannedWith(mesa('m2-p', 'M2', 'PRIMER_LLAMADO', '2026-07-28'), mesa('m2-s', 'M2', 'SEGUNDO_LLAMADO', '2026-08-07'))
    const result = checkCorrelativityForSlot({ mesa: mesa('m5-s', 'M5', 'SEGUNDO_LLAMADO'), slot: { fecha: '2026-08-06' }, plannedBySubject: planned, links })
    expect(result.errors).toEqual([])
  })
})
