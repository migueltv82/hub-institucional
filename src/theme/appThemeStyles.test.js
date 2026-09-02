import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const SEMANTIC_COLORS = '(?:amber|blue|cyan|emerald|fuchsia|indigo|lime|orange|red|rose|sky|teal|violet|yellow)'
const LIGHT_BACKGROUND_PATTERN = new RegExp(`\\bbg-${SEMANTIC_COLORS}-(?:50|100)(?:/[0-9]+)?\\b`, 'g')
const DARK_TEXT_PATTERN = new RegExp(`\\btext-${SEMANTIC_COLORS}-(?:600|700|800|900|950)\\b`, 'g')
const TRANSLUCENT_WHITE_PATTERN = /\bbg-white\/(?:70|80|85|86|88|90|92|95)\b/g

function listSourceFiles(directory) {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry)
    return statSync(path).isDirectory()
      ? listSourceFiles(path)
      : (path.endsWith('.jsx') ? [path] : [])
  })
}

function toCssSelector(className) {
  return `.${className.replace('/', '\\/')}`
}

describe('dark theme coverage', () => {
  it('cubre fondos claros y textos semanticos usados por los modulos', () => {
    const sourceRoot = resolve(process.cwd(), 'src')
    const css = readFileSync(join(sourceRoot, 'styles/globals.css'), 'utf8')
    const classNames = new Set()

    listSourceFiles(sourceRoot).forEach((filePath) => {
      const source = readFileSync(filePath, 'utf8')
      source.match(LIGHT_BACKGROUND_PATTERN)?.forEach((className) => classNames.add(className))
      source.match(DARK_TEXT_PATTERN)?.forEach((className) => classNames.add(className))
      source.match(TRANSLUCENT_WHITE_PATTERN)?.forEach((className) => classNames.add(className))
    })

    const missingSelectors = [...classNames]
      .map(toCssSelector)
      .filter((selector) => !css.includes(selector))

    expect(missingSelectors).toEqual([])
  })

  it('adapta superficies propias y conserva impresion clara', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/styles/globals.css'), 'utf8')

    expect(css).toContain('html[data-theme="dark"] .login-form-surface')
    expect(css).toContain('html[data-theme="dark"] .visual-caption')
    expect(css).toContain('html[data-theme="dark"] .pwa-install-modal__panel')
    expect(css).toContain('@media print')
    expect(css).toContain('html[data-theme="dark"] .certificate-document')
  })

  it('mantiene legible la guia para quien continua el trabajo', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/styles/globals.css'), 'utf8')
    const component = readFileSync(resolve(process.cwd(), 'src/components/ui/OperatorHandbook.jsx'), 'utf8')

    expect(css).toContain('html[data-theme="dark"] .operator-handbook')
    expect(css).toContain('html[data-theme="dark"] .operator-handbook__eyebrow')
    expect(css).toContain('html[data-theme="dark"] .operator-handbook__step')
    expect(css).toContain('html[data-theme="dark"] .operator-handbook__step-title')
    expect(css).toContain('html[data-theme="dark"] .operator-handbook__step-detail')
    expect(css).toContain('html[data-theme="dark"] .operator-handbook__tip')
    expect(component).toContain('operator-handbook__step-title')
    expect(component).toContain('operator-handbook__step-detail')
    expect(component).not.toContain('bg-white/90')
    expect(component).not.toContain('text-slate-600')
  })

  it('mantiene legibles el contexto institucional y el panel operativo', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/styles/globals.css'), 'utf8')
    const workspace = readFileSync(resolve(process.cwd(), 'src/components/generadorCronograma/WorkspaceContextSection.jsx'), 'utf8')
    const generator = readFileSync(resolve(process.cwd(), 'src/components/GeneradorCronograma.jsx'), 'utf8')

    expect(css).toContain('html[data-theme="dark"] .workspace-context__institution')
    expect(css).toContain('html[data-theme="dark"] .workspace-context__description')
    expect(css).toContain('html[data-theme="dark"] .operational-dashboard-hero__title')
    expect(css).toContain('html[data-theme="dark"] .operational-dashboard-hero__description')
    expect(css).toContain('html[data-theme="dark"] .operational-dashboard-hero .dashboard-progress-card')
    expect(css).toContain('html[data-theme="dark"] .operational-dashboard-hero .dashboard-section-tab')
    expect(css).toMatch(/html\[data-theme="dark"\] \.dashboard-section-tab--active[^}]+color: #f8fafc;/s)
    expect(workspace).not.toContain('bg-white/85')
    expect(generator).toContain('operational-dashboard-hero__title')
  })
})
