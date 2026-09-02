import { describe, expect, it } from 'vitest'
import { buildTemplateV2AssetPayload } from './downloadTemplateV2Assets.js'
import { auditTemplateV2DownloadsAgainstContract } from './templateV2DownloadAudit.js'

describe('templateV2DownloadAudit', () => {
  it('valida el payload descargable v2 contra el contrato', () => {
    const result = auditTemplateV2DownloadsAgainstContract(buildTemplateV2AssetPayload())

    expect(result.valid).toBe(true)
    expect(result.summary).toMatchObject({
      expectedTemplates: 10,
      templatesFound: 10,
      templatesValid: 10,
      laboratorioCovered: true,
      errors: 0,
    })
  })

  it('detecta plantilla esperada faltante', () => {
    const payload = buildTemplateV2AssetPayload()
    payload.csvFiles = payload.csvFiles.filter((file) => file.templateName !== 'plan_estudios')

    const result = auditTemplateV2DownloadsAgainstContract(payload)

    expect(result.valid).toBe(false)
    expect(result.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({
        templateName: 'plan_estudios',
        code: 'PLANTILLA_FALTANTE',
      }),
    ]))
  })

  it('detecta columnas requeridas faltantes', () => {
    const payload = buildTemplateV2AssetPayload()
    const plan = payload.csvFiles.find((file) => file.templateName === 'plan_estudios')
    plan.columns = plan.columns.filter((column) => column !== 'plan_id')
    plan.content = plan.columns.join(',')

    const result = auditTemplateV2DownloadsAgainstContract(payload)

    expect(result.valid).toBe(false)
    expect(result.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({
        templateName: 'plan_estudios',
        code: 'FALTAN_COLUMNAS_REQUERIDAS',
      }),
      expect.objectContaining({
        templateName: 'plan_estudios',
        code: 'FALTA_PLAN_ID',
      }),
    ]))
  })

  it('detecta materia_nombre como unique key', () => {
    const payload = buildTemplateV2AssetPayload()
    const plan = payload.csvFiles.find((file) => file.templateName === 'plan_estudios')
    plan.uniqueKey = ['materia_nombre']

    const result = auditTemplateV2DownloadsAgainstContract(payload)

    expect(result.valid).toBe(false)
    expect(result.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({
        templateName: 'plan_estudios',
        code: 'UNIQUE_KEY_SOLO_MATERIA_NOMBRE',
      }),
    ]))
  })

  it('detecta si Laboratorio no esta contemplado', () => {
    const payload = buildTemplateV2AssetPayload()
    payload.csvFiles = payload.csvFiles.map((file) => ({
      ...file,
      content: String(file.content).replaceAll('LAB15-', 'PLAN-A-').replaceAll('LAB24-', 'PLAN-B-'),
    }))

    const result = auditTemplateV2DownloadsAgainstContract(payload)

    expect(result.valid).toBe(false)
    expect(result.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({
        templateName: 'templates-v2',
        code: 'LABORATORIO_NO_CONTEMPLADO',
      }),
    ]))
  })
})
