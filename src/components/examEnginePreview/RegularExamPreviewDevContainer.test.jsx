import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import RegularExamPreviewDevContainer from './RegularExamPreviewDevContainer.jsx'
import { buildRegularPreviewInstitutionalFixture } from '../../utils/examEngine/__fixtures__/regularPreviewInstitutionalFixture.js'

const { screenPropsSpy } = vi.hoisted(() => ({
  screenPropsSpy: vi.fn(),
}))

vi.mock('./RegularExamPreviewScreen.jsx', () => ({
  default: (props) => {
    screenPropsSpy(props)
    return <div data-testid="regular-exam-preview-screen">RegularExamPreviewScreen</div>
  },
}))

function readContainerSource() {
  return readFileSync(
    join(process.cwd(), 'src/components/examEnginePreview/RegularExamPreviewDevContainer.jsx'),
    'utf8',
  )
}

describe('RegularExamPreviewDevContainer', () => {
  beforeEach(() => {
    screenPropsSpy.mockClear()
  })

  it('renderiza encabezado interno', () => {
    render(<RegularExamPreviewDevContainer />)

    expect(screen.getByRole('heading', { name: 'Vista interna de desarrollo - Motor nuevo' })).toBeInTheDocument()
  })

  it('renderiza RegularExamPreviewScreen', () => {
    render(<RegularExamPreviewDevContainer />)

    expect(screen.getByTestId('regular-exam-preview-screen')).toBeInTheDocument()
    expect(screenPropsSpy).toHaveBeenCalledTimes(1)
  })

  it('usa el fixture institucional', () => {
    render(<RegularExamPreviewDevContainer />)

    expect(screenPropsSpy).toHaveBeenCalledWith({
      input: buildRegularPreviewInstitutionalFixture(),
      initialFilters: {},
    })
  })

  it('muestra aclaracion de no reemplazo', () => {
    render(<RegularExamPreviewDevContainer />)

    expect(screen.getByText('No reemplaza el generador actual ni publica cronograma oficial.')).toBeInTheDocument()
  })

  it('no importa el motor anterior', () => {
    const source = readContainerSource()
    const oldEngine = ['cronograma', 'Inteligente.js'].join('')
    const legacy = ['legacy', 'Adapter'].join('')

    expect(source).not.toContain(oldEngine)
    expect(source).not.toContain(legacy)
  })

  it('no importa el hook de generacion anterior', () => {
    const source = readContainerSource()
    const oldHook = ['useCronograma', 'Generation.js'].join('')

    expect(source).not.toContain(oldHook)
  })

  it('no modifica rutas', () => {
    const source = readContainerSource()
    const routerPackage = ['react', '-router-dom'].join('')
    const routerFactory = ['createBrowser', 'Router'].join('')
    const routeElement = ['<', 'Route'].join('')

    expect(source).not.toContain(routerPackage)
    expect(source).not.toContain(routerFactory)
    expect(source).not.toContain(routeElement)
  })
})
