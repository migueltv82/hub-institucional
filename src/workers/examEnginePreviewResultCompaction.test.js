import { describe, expect, it } from 'vitest'
import { compactPreviewResultForUi } from './examEnginePreviewResultCompaction.js'

function many(count, factory) {
  return Array.from({ length: count }, (_, index) => factory(index))
}

function contract(overrides = {}) {
  return {
    phase: 'warning',
    status: 'WARNING',
    canExportJson: true,
    preview: {
      summary: {
        stageSummaries: {
          tribunals: { mesasSinTribunal: 10 },
        },
      },
      metadata: { cantidadLlamados: 2 },
    },
    uiDto: {
      success: false,
      status: 'WARNING',
      uiSummary: {
        totalMesas: 252,
        totalPlanned: 149,
        totalUnassigned: 103,
        totalWarnings: 2731,
      },
      uiTables: {
        planned: many(60, (index) => ({
          id: `planned-${index}`,
          materia: `Materia ${index}`,
          titular: { id: `doc-${index}`, nombre: `Nombre sensible ${index}` },
          vocales: [{ id: `vocal-${index}`, nombre: `Vocal sensible ${index}` }],
        })),
        unassigned: [],
      },
      uiAlerts: many(25, (index) => ({
        id: `alert-${index}`,
        code: index % 2 ? 'VOCAL_NO_DISPONIBLE' : 'TITULAR_NO_DISPONIBLE',
        message: `Alerta ${index}`,
        docenteNombre: `Nombre sensible ${index}`,
      })),
      audit: {
        exportedReport: { raw: { payload: true } },
        exportValidation: { valid: true },
        metadata: { safe: true },
      },
    },
    filteredDto: null,
    validation: { valid: true, errors: [], warnings: [] },
    errors: many(22, (index) => ({ code: 'ERROR_CRITICO', message: `Error ${index}` })),
    warnings: many(30, (index) => ({
      code: index % 3 ? 'VOCAL_NO_DISPONIBLE' : 'TITULAR_NO_DISPONIBLE',
      message: `Warning ${index}`,
      docenteNombre: `Nombre sensible ${index}`,
    })),
    metadata: {
      timings: { totalContractMs: 123 },
    },
    ...overrides,
  }
}

describe('compactPreviewResultForUi', () => {
  it('compacta warnings por codigo y limita top warnings/errors', () => {
    const result = compactPreviewResultForUi(contract())

    expect(result.errors).toHaveLength(20)
    expect(result.warnings).toHaveLength(20)
    expect(result.metadata.issueSummary.totalErrors).toBe(22)
    expect(result.metadata.issueSummary.totalWarnings).toBe(30)
    expect(result.metadata.issueSummary.topWarningsByCode[0]).toEqual({
      code: 'VOCAL_NO_DISPONIBLE',
      count: 20,
    })
  })

  it('conserva metricas principales y limita tablas', () => {
    const result = compactPreviewResultForUi(contract())

    expect(result.uiDto.uiSummary).toMatchObject({
      totalMesas: 252,
      totalPlanned: 149,
      totalUnassigned: 103,
    })
    expect(result.uiDto.uiTables.planned).toHaveLength(50)
    expect(result.preview.summary.stageSummaries.tribunals.mesasSinTribunal).toBe(10)
  })

  it('no incluye payload completo ni nombres docentes en alerts/filas compactadas', () => {
    const result = compactPreviewResultForUi(contract())

    expect(result.uiDto.audit).not.toHaveProperty('exportedReport')
    expect(JSON.stringify(result)).not.toContain('"raw"')
    expect(JSON.stringify(result)).not.toContain('Nombre sensible')
    expect(result.uiDto.uiTables.planned[0].titular).toEqual({ id: 'doc-0', rol: '' })
    expect(result.uiDto.uiAlerts[0]).not.toHaveProperty('docenteNombre')
  })
})
