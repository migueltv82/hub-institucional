import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import RegularExamPreviewHarness from './RegularExamPreviewHarness.jsx'

vi.mock('./RegularExamPreviewDevContainer.jsx', () => ({
  default: () => <section data-testid="regular-exam-preview-dev-container">RegularExamPreviewDevContainer</section>,
}))

function readHarnessSource() {
  return readFileSync(
    join(process.cwd(), 'src/components/examEnginePreview/RegularExamPreviewHarness.jsx'),
    'utf8',
  )
}

describe('RegularExamPreviewHarness', () => {
  it('renderiza encabezado del harness', () => {
    render(<RegularExamPreviewHarness />)

    expect(screen.getByRole('heading', { name: 'Harness interno - Preview examEngine' })).toBeInTheDocument()
  })

  it('renderiza advertencia de uso interno', () => {
    render(<RegularExamPreviewHarness />)

    expect(
      screen.getByText('Uso exclusivo de desarrollo. No reemplaza el generador oficial.'),
    ).toBeInTheDocument()
  })

  it('renderiza RegularExamPreviewDevContainer', () => {
    render(<RegularExamPreviewHarness />)

    expect(screen.getByTestId('regular-exam-preview-dev-container')).toBeInTheDocument()
  })

  it('no importa el motor anterior', () => {
    const source = readHarnessSource()
    const oldEngine = ['cronograma', 'Inteligente.js'].join('')
    const legacy = ['legacy', 'Adapter'].join('')

    expect(source).not.toContain(oldEngine)
    expect(source).not.toContain(legacy)
  })

  it('no importa el hook de generacion anterior', () => {
    const source = readHarnessSource()
    const oldHook = ['useCronograma', 'Generation.js'].join('')

    expect(source).not.toContain(oldHook)
  })

  it('no toca rutas publicas', () => {
    const source = readHarnessSource()
    const routerPackage = ['react', '-router-dom'].join('')
    const routerFactory = ['createBrowser', 'Router'].join('')
    const routeElement = ['<', 'Route'].join('')

    expect(source).not.toContain(routerPackage)
    expect(source).not.toContain(routerFactory)
    expect(source).not.toContain(routeElement)
  })
})
