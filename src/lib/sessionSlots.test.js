import { afterEach, describe, expect, it } from 'vitest'
import {
  buildSessionSlotUrl,
  listSessionSlots,
  removeSessionSlot,
  saveSessionSlot,
} from './sessionSlots.js'

describe('sessionSlots', () => {
  afterEach(() => {
    localStorage.clear()
    window.history.pushState(null, '', '/')
  })

  it('empieza sin sesiones guardadas', () => {
    expect(listSessionSlots()).toEqual([])
  })

  it('guarda y lista sesiones, y no duplica por slug', () => {
    saveSessionSlot({ slug: 'docente', label: 'Docente' })
    saveSessionSlot({ slug: 'alumno', label: 'Alumno' })
    saveSessionSlot({ slug: 'docente', label: 'Docente (renombrado)' })

    const slots = listSessionSlots()
    expect(slots).toHaveLength(2)
    expect(slots.find((entry) => entry.slug === 'docente').label).toBe('Docente (renombrado)')
  })

  it('elimina una sesion guardada por slug', () => {
    saveSessionSlot({ slug: 'docente', label: 'Docente' })
    removeSessionSlot('docente')

    expect(listSessionSlots()).toEqual([])
  })

  it('arma la URL de una sesion con el query param sesion=', () => {
    window.history.pushState(null, '', '/dashboard')

    expect(buildSessionSlotUrl('docente')).toContain('?sesion=docente')
    expect(buildSessionSlotUrl('')).not.toContain('sesion=')
  })
})
