import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const page = readFileSync(resolve('src/pages/SuperAdminInstitutionsPage.jsx'), 'utf8')

describe('SuperAdminInstitutionsPage', () => {
  it('decisión de Miguel (20/10): una institución se suspende, no se borra desde la app', () => {
    // El borrado directo fallaba por FK con los recursos del gateway y no limpia nada de forma controlada:
    // el borrado definitivo de una institución de prueba es el procedimiento I3 (runbook §8.0).
    expect(page).not.toContain('deleteInstitution')
    expect(page).not.toContain("title=\"Eliminar\"")
    expect(page).toContain("'Suspender' : 'Reactivar'")
    expect(page).toContain("updates: { status: newStatus }")
  })
})
