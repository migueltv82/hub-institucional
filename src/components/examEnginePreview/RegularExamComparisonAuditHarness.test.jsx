import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import RegularExamComparisonAuditHarness from './RegularExamComparisonAuditHarness.jsx'

vi.mock('./RegularExamComparisonAudit.jsx', () => ({
  default: () => <section data-testid="regular-exam-comparison-audit">RegularExamComparisonAudit</section>,
}))

function readHarnessSource() {
  return readFileSync(
    join(process.cwd(), 'src/components/examEnginePreview/RegularExamComparisonAuditHarness.jsx'),
    'utf8',
  )
}

describe('RegularExamComparisonAuditHarness', () => {
  it('renderiza encabezado', () => {
    render(<RegularExamComparisonAuditHarness />)

    expect(
      screen.getByRole('heading', { name: 'Harness interno - Auditoría comparativa examEngine' }),
    ).toBeInTheDocument()
  })

  it('renderiza advertencia de uso interno', () => {
    render(<RegularExamComparisonAuditHarness />)

    expect(
      screen.getByText('Uso exclusivo de desarrollo. No reemplaza el generador oficial.'),
    ).toBeInTheDocument()
    expect(
      screen.getByText('No guarda, no publica y no modifica cronogramas reales.'),
    ).toBeInTheDocument()
  })

  it('renderiza RegularExamComparisonAudit', () => {
    render(<RegularExamComparisonAuditHarness />)

    expect(screen.getByTestId('regular-exam-comparison-audit')).toBeInTheDocument()
  })

  it('no importa cronogramaInteligente', () => {
    const source = readHarnessSource()
    const oldEngine = ['cronograma', 'Inteligente'].join('')

    expect(source).not.toContain(oldEngine)
  })

  it('no importa useCronogramaGeneration', () => {
    const source = readHarnessSource()
    const oldHook = ['useCronograma', 'Generation'].join('')

    expect(source).not.toContain(oldHook)
  })

  it('no importa legacyAdapter', () => {
    const source = readHarnessSource()
    const adapter = ['legacy', 'Adapter'].join('')

    expect(source).not.toContain(adapter)
  })

  it('no toca rutas públicas', () => {
    const source = readHarnessSource()
    const routerPackage = ['react', '-router-dom'].join('')
    const routerFactory = ['createBrowser', 'Router'].join('')
    const routeElement = ['<', 'Route'].join('')
    const appFile = ['App', '.jsx'].join('')

    expect(source).not.toContain(routerPackage)
    expect(source).not.toContain(routerFactory)
    expect(source).not.toContain(routeElement)
    expect(source).not.toContain(appFile)
  })
})
