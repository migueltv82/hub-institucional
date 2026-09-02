import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import RegularExamComparisonAudit from './RegularExamComparisonAudit.jsx'

function readAuditSource() {
  return readFileSync(
    join(process.cwd(), 'src/components/examEnginePreview/RegularExamComparisonAudit.jsx'),
    'utf8',
  )
}

function generateNormalAudit() {
  render(<RegularExamComparisonAudit />)
  fireEvent.click(screen.getByRole('button', { name: 'Generar auditoría normal' }))
}

function generateStressAudit() {
  render(<RegularExamComparisonAudit />)
  fireEvent.click(screen.getByRole('button', { name: 'Generar auditoría stress' }))
}

function generateInstitutionalAudit() {
  render(<RegularExamComparisonAudit />)
  fireEvent.click(screen.getByRole('button', { name: 'Generar auditoría institucional' }))
}

describe('RegularExamComparisonAudit', () => {
  it('renderiza título', () => {
    render(<RegularExamComparisonAudit />)

    expect(screen.getByRole('heading', { name: 'Auditoría comparativa examEngine' })).toBeInTheDocument()
  })

  it('muestra advertencias de uso interno', () => {
    render(<RegularExamComparisonAudit />)

    expect(screen.getByText('Auditoría interna. No reemplaza el generador oficial.')).toBeInTheDocument()
    expect(screen.getByText('No guarda, no publica y no modifica cronogramas reales.')).toBeInTheDocument()
  })

  it('genera auditoría normal', () => {
    generateNormalAudit()

    const summary = screen.getByRole('region', { name: 'Resumen de auditoria' })
    expect(summary).toBeInTheDocument()
    expect(within(summary).getByText(/Resumen de auditoria comparativa/)).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Export interno serializable' })).toBeInTheDocument()
  })

  it('genera auditoría stress', () => {
    generateStressAudit()

    expect(screen.getByRole('region', { name: 'Resumen de auditoria' })).toBeInTheDocument()
    expect(screen.getByLabelText('Estado de auditoria')).toHaveTextContent(/WARNING|CRITICAL/)
    expect(screen.getByText(/Fixture stress/)).toBeInTheDocument()
  })

  it('renderiza botón de auditoría institucional', () => {
    render(<RegularExamComparisonAudit />)

    expect(screen.getByRole('button', { name: 'Generar auditoría institucional' })).toBeInTheDocument()
  })

  it('genera auditoría institucional', () => {
    generateInstitutionalAudit()

    expect(screen.getByRole('region', { name: 'Resumen de auditoria' })).toBeInTheDocument()
    expect(screen.getByText(/Fixture institucional/)).toBeInTheDocument()
  })

  it('muestra modo activo institucional', () => {
    generateInstitutionalAudit()

    expect(screen.getByLabelText('Modo activo de auditoria')).toHaveTextContent('Modo activo: institucional')
  })

  it('muestra métricas', () => {
    generateNormalAudit()

    const metrics = screen.getByRole('region', { name: 'Metricas de auditoria' })
    expect(within(metrics).getByText('Mesas legacy')).toBeInTheDocument()
    expect(within(metrics).getByText('Mesas nuevo')).toBeInTheDocument()
    expect(within(metrics).getByText('Diferencias')).toBeInTheDocument()
    expect(within(metrics).getByText('Diferencias criticas')).toBeInTheDocument()
  })

  it('muestra métricas institucionales', () => {
    generateInstitutionalAudit()

    const metrics = screen.getByRole('region', { name: 'Metricas de auditoria' })
    expect(within(metrics).getByText('Mesas legacy')).toBeInTheDocument()
    expect(within(metrics).getByText('Mesas nuevo')).toBeInTheDocument()
    expect(within(metrics).getByText('Diferencias')).toBeInTheDocument()
  })

  it('muestra recomendaciones', () => {
    generateStressAudit()

    const recommendations = screen.getByRole('region', { name: 'Recomendaciones' })
    expect(within(recommendations).getAllByText(/Revisar|Auditar|Verificar|Confirmar/).length).toBeGreaterThan(0)
  })

  it('muestra recomendaciones institucionales', () => {
    generateInstitutionalAudit()

    const recommendations = screen.getByRole('region', { name: 'Recomendaciones' })
    expect(within(recommendations).getAllByText(/Revisar|Auditar|Verificar|Confirmar|Validar/).length).toBeGreaterThan(0)
  })

  it('muestra estado warning o critical cuando corresponde', () => {
    generateStressAudit()

    expect(screen.getByLabelText('Estado de auditoria')).toHaveTextContent(/Estado: (WARNING|CRITICAL)/)
  })

  it('muestra mesas sin equivalente', () => {
    generateStressAudit()

    expect(screen.getByRole('region', { name: 'Mesas legacy sin equivalente' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Mesas nuevas sin equivalente' })).toBeInTheDocument()
  })

  it('limpia resultado', () => {
    generateNormalAudit()

    expect(screen.getByRole('region', { name: 'Resumen de auditoria' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Limpiar resultado' }))

    expect(screen.getByText('Sin auditoría generada.')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Resumen de auditoria' })).not.toBeInTheDocument()
  })

  it('no importa cronogramaInteligente', () => {
    const source = readAuditSource()
    const oldEngine = ['cronograma', 'Inteligente'].join('')

    expect(source).not.toContain(oldEngine)
  })

  it('no importa useCronogramaGeneration', () => {
    const source = readAuditSource()
    const oldHook = ['useCronograma', 'Generation'].join('')

    expect(source).not.toContain(oldHook)
  })

  it('no importa legacyAdapter', () => {
    const source = readAuditSource()
    const adapter = ['legacy', 'Adapter'].join('')

    expect(source).not.toContain(adapter)
  })

  it('no toca rutas públicas ni UI productiva', () => {
    const source = readAuditSource()
    const routerPackage = ['react', '-router-dom'].join('')
    const routeElement = ['<', 'Route'].join('')
    const appFile = ['App', '.jsx'].join('')
    const productiveGenerator = ['Generador', 'Cronograma'].join('')

    expect(source).not.toContain(routerPackage)
    expect(source).not.toContain(routeElement)
    expect(source).not.toContain(appFile)
    expect(source).not.toContain(productiveGenerator)
  })

  it('no descarga ni exporta archivos físicos', () => {
    const source = readAuditSource()

    expect(source).not.toContain('createObjectURL')
    expect(source).not.toContain('download')
    expect(source).not.toContain('Blob')
    expect(source).not.toContain('writeFile')
  })
})
