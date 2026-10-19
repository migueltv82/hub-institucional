import { describe, expect, it } from 'vitest'
import { ACTA_ROWS_PER_PAGE, buildActaPages, buildExamActasPdf, fitActaLogo, formatActaDate, splitStudentName } from './examActaPdf.js'

const mesa = {
  mesa_id: 'm1',
  tipo: 'regular',
  inicio: '2026-11-02T11:00:00Z',
  materia: 'Practicas Discursivas en Ingles IV',
  carrera: 'Profesorado de Ingles',
  plan_anio: 2015,
  anio: 4,
  tribunal: { titular: 'Titular Uno', vocal1: 'Vocal Uno', vocal2: 'Vocal Dos' },
}

describe('examActaPdf', () => {
  it('separa apellido y nombre en mayusculas, como el acta institucional', () => {
    expect(splitStudentName({ apellido: 'Diaz Lozano', nombres: 'Maria Cristina' })).toEqual({ apellido: 'DIAZ LOZANO', nombres: 'MARIA CRISTINA' })
    expect(splitStudentName({ nombre: 'Ana Regular' })).toEqual({ apellido: 'ANA REGULAR', nombres: '' })
  })

  it('numera los alumnos y pasa a otra hoja despues de 25 renglones', () => {
    const alumnos = Array.from({ length: ACTA_ROWS_PER_PAGE + 2 }, (_, index) => ({ apellido: `A${index}`, nombres: 'X', dni: String(index) }))
    const pages = buildActaPages(alumnos)
    expect(pages.map((page) => page.length)).toEqual([25, 2])
    expect(pages[1][0].numero).toBe(26)
  })

  it('usa la fecha de Argentina con el formato del acta', () => {
    expect(formatActaDate('2026-11-03T01:30:00Z')).toBe('02/11/26')
  })

  it('genera una hoja por mesa con los datos del acta volante', async () => {
    const doc = await buildExamActasPdf({
      institutionName: 'Instituto de Prueba',
      actas: [
        { mesa, alumnos: [{ apellido: 'Diaz Lozano', nombres: 'Maria Cristina', dni: '37656860' }] },
        { mesa: { ...mesa, mesa_id: 'm2', materia: 'Fonetica I' }, alumnos: [{ nombre: 'Ana Regular', dni: '11111111' }] },
      ],
    })
    expect(doc.getNumberOfPages()).toBe(2)
    const text = doc.output()
    for (const expected of ['ACTA VOLANTE DE EXAMEN', 'REGULARES', '02/11/26', 'Practicas Discursivas en Ingles IV', 'Profesorado de Ingles', '2015', '37656860', 'DIAZ LOZANO', 'MARIA CRISTINA', 'Presidente', 'Titular Uno', 'Fonetica I']) {
      expect(text).toContain(expected)
    }
  })

  it('ubica el logo centrado, sin deformarlo y dentro del encabezado', () => {
    const size = fitActaLogo(441, 135)
    expect(size.width).toBeCloseTo(84.93, 1)
    expect(size.height).toBeCloseTo(26, 5)
    expect(size.x + size.width / 2).toBeCloseTo(105, 5)
    expect(fitActaLogo(0, 10)).toBeNull()
  })

  it('pone el logo del colegio en el encabezado; sin logo usa el nombre', async () => {
    const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
    const actas = [{ mesa, alumnos: [{ apellido: 'Diaz', nombres: 'Ana', dni: '1' }] }]
    const withLogo = (await buildExamActasPdf({ institutionName: 'Instituto Con Logo', institutionLogo: PNG, actas })).output()
    const withoutLogo = (await buildExamActasPdf({ institutionName: 'Instituto Sin Logo', actas })).output()

    expect(withLogo).toContain('/Subtype /Image')
    expect(withLogo).not.toContain('Instituto Con Logo')
    expect(withoutLogo).not.toContain('/Subtype /Image')
    expect(withoutLogo).toContain('Instituto Sin Logo')
  })

  it('si el logo no es una imagen valida, cae al nombre en lugar de romper el acta', async () => {
    const doc = await buildExamActasPdf({ institutionName: 'Instituto', institutionLogo: 'data:image/png;base64,AAAA', actas: [{ mesa, alumnos: [{ nombre: 'Ana' }] }] })
    expect(doc.output()).toContain('Instituto')
  })
})

describe('F1a: notas en el acta', () => {
  it('imprime escrito, oral y promedio con coma, y el ausente en la columna del promedio', async () => {
    const { actaGradeColumns, actaTotals } = await import('./examActaPdf.js')
    expect(actaGradeColumns({ resultado: 'approved', escrito: 7, oral: 8.5, nota: 7.75 })).toEqual({ escrito: '7', oral: '8,5', promedio: '7,75' })
    expect(actaGradeColumns({ resultado: 'absent' })).toEqual({ escrito: '', oral: '', promedio: 'Ausente' })
    expect(actaGradeColumns({})).toEqual({ escrito: '', oral: '', promedio: '' })
    expect(actaTotals([{ resultado: 'approved' }, { resultado: 'failed' }, { resultado: 'absent' }, { resultado: 'approved' }]))
      .toEqual({ total: 4, aprobados: 2, desaprobados: 1, ausentes: 1 })
    expect(actaTotals([{}, {}])).toBeNull()
  })

  it('el PDF se genera con notas cargadas', async () => {
    const doc = await buildExamActasPdf({ institutionName: 'Instituto', actas: [{ mesa: { materia: 'Ingles I' }, alumnos: [{ apellido: 'Perez', nombres: 'Ana', dni: '1', resultado: 'approved', nota: 8 }] }] })
    expect(doc.getNumberOfPages()).toBe(1)
  })
})
