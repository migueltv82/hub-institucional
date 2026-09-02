import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { isExamEngineAuditEnabled } from './isExamEngineAuditEnabled.js'

function readHelperSource() {
  return readFileSync(
    join(process.cwd(), 'src/components/examEnginePreview/isExamEngineAuditEnabled.js'),
    'utf8',
  )
}

describe('isExamEngineAuditEnabled', () => {
  it("devuelve true solo en DEV cuando VITE_ENABLE_EXAM_ENGINE_AUDIT es 'true'", () => {
    expect(isExamEngineAuditEnabled({ DEV: true, VITE_ENABLE_EXAM_ENGINE_AUDIT: 'true' })).toBe(true)
  })

  it("devuelve false en produccion aunque VITE_ENABLE_EXAM_ENGINE_AUDIT sea 'true'", () => {
    expect(isExamEngineAuditEnabled({ DEV: false, PROD: true, VITE_ENABLE_EXAM_ENGINE_AUDIT: 'true' })).toBe(false)
  })

  it('devuelve false si falta la variable', () => {
    expect(isExamEngineAuditEnabled({})).toBe(false)
  })

  it("devuelve false si la variable es 'false'", () => {
    expect(isExamEngineAuditEnabled({ VITE_ENABLE_EXAM_ENGINE_AUDIT: 'false' })).toBe(false)
  })

  it('devuelve false si la variable es false booleano', () => {
    expect(isExamEngineAuditEnabled({ VITE_ENABLE_EXAM_ENGINE_AUDIT: false })).toBe(false)
  })

  it('devuelve false si la variable es string vacio', () => {
    expect(isExamEngineAuditEnabled({ VITE_ENABLE_EXAM_ENGINE_AUDIT: '' })).toBe(false)
  })

  it('devuelve false si la variable tiene otro valor', () => {
    expect(isExamEngineAuditEnabled({ VITE_ENABLE_EXAM_ENGINE_AUDIT: 'TRUE' })).toBe(false)
    expect(isExamEngineAuditEnabled({ VITE_ENABLE_EXAM_ENGINE_AUDIT: '1' })).toBe(false)
    expect(isExamEngineAuditEnabled({ VITE_ENABLE_EXAM_ENGINE_AUDIT: true })).toBe(false)
  })

  it('no lee window ni localStorage', () => {
    const source = readHelperSource()

    expect(source).not.toContain('window')
    expect(source).not.toContain('localStorage')
  })

  it('no depende de rutas ni UI', () => {
    const source = readHelperSource()
    const routerPackage = ['react', '-router-dom'].join('')

    expect(source).not.toContain(routerPackage)
    expect(source).not.toContain('Route')
    expect(source).not.toContain('jsx')
  })

  it('no importa motor viejo', () => {
    const source = readHelperSource()
    const oldEngine = ['cronograma', 'Inteligente'].join('')

    expect(source).not.toContain(oldEngine)
  })

  it('no importa useCronogramaGeneration', () => {
    const source = readHelperSource()
    const oldHook = ['useCronograma', 'Generation'].join('')

    expect(source).not.toContain(oldHook)
  })

  it('no importa legacyAdapter', () => {
    const source = readHelperSource()
    const adapter = ['legacy', 'Adapter'].join('')

    expect(source).not.toContain(adapter)
  })
})
