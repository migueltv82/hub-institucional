import { describe, expect, it } from 'vitest'
import { ACTA_ROWS_PER_PAGE, buildActaPages, buildExamActasPdf, formatActaDate, splitStudentName } from './examActaPdf.js'

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
})
