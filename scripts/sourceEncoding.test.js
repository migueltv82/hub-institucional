import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// Texto UTF-8 decodificado dos veces: "padrÃ³n" en lugar de "padrón". Llega a la UI tal cual.
const MOJIBAKE = /[ÂÃ][\u0080-¿]/

function sourceFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return sourceFiles(path)
    return /\.(jsx?|css)$/.test(entry.name) ? [path] : []
  })
}

export function findMojibake(files) {
  return files.flatMap((file) => readFileSync(file, 'utf8')
    .split('\n')
    .flatMap((line, index) => (MOJIBAKE.test(line) ? [`${file}:${index + 1}`] : [])))
}

describe('codificacion del codigo fuente', () => {
  it('detecta acentos doblemente codificados', () => {
    expect(MOJIBAKE.test('padrÃ³n')).toBe(true)
    expect(MOJIBAKE.test('padrón, tenían, podés, Código')).toBe(false)
  })

  it('src no tiene textos con acentos rotos', () => {
    expect(findMojibake(sourceFiles('src'))).toEqual([])
  })
})
