import { describe, expect, it } from 'vitest'
import {
  buildStudentExamRecipients,
  buildTeacherExamRecipients,
} from './cronogramaPdfExports.js'

describe('cronogramaPdfExports', () => {
  it('arma destinatarios alumnos solo con mesas donde cumple regularidad y correlatividad', () => {
    const recipients = buildStudentExamRecipients({
      alumnos: [{
        email: 'ana@example.com',
        nombre: 'Ana',
        apellido: 'Diaz',
        carrera: 'Profesorado de Ingles',
      }],
      academicData: {
        academicStatusRows: [
          {
            email: 'ana@example.com',
            carrera: 'Profesorado de Ingles',
            materia: 'ING01',
            estado: 'regular',
          },
          {
            email: 'ana@example.com',
            carrera: 'Profesorado de Ingles',
            materia: 'FON01',
            estado: 'aprobada',
          },
          {
            email: 'ana@example.com',
            carrera: 'Profesorado de Ingles',
            materia: 'LIT01',
            estado: 'regular',
          },
        ],
      },
      correlatividades: [
        {
          carrera: 'Profesorado de Ingles',
          materia: 'ING01',
          correlativas: 'FON01',
        },
        {
          carrera: 'Profesorado de Ingles',
          materia: 'LIT01',
          correlativas: 'ING99',
        },
      ],
      cronograma: [
        {
          id: 'mesa-1',
          carrera: 'Profesorado de Ingles',
          materia: 'ING01',
          nombreMateria: 'Ingles I',
          exam_type: 'regular',
        },
        {
          id: 'mesa-2',
          carrera: 'Profesorado de Ingles',
          materia: 'LIT01',
          nombreMateria: 'Literatura I',
          exam_type: 'regular',
        },
      ],
    })

    expect(recipients).toHaveLength(1)
    expect(recipients[0].mesas).toHaveLength(1)
    expect(recipients[0].mesas[0].materia).toBe('ING01')
  })

  it('arma PDFs docentes solo con mesas donde participa como titular o vocal', () => {
    const recipients = buildTeacherExamRecipients({
      docentes: [{
        nombre: 'Ana',
        apellido: 'Diaz',
        email: 'ana.docente@example.com',
      }],
      cronograma: [
        {
          id: 'mesa-1',
          carrera: 'Profesorado de Ingles',
          materia: 'ING01',
          profesorTitular: 'Ana Diaz',
          vocal1: 'Luis Perez',
          vocal2: 'Carla Ruiz',
        },
        {
          id: 'mesa-2',
          carrera: 'Profesorado de Ingles',
          materia: 'FON01',
          profesorTitular: 'Luis Perez',
          vocal1: 'Ana Diaz',
          vocal2: 'Carla Ruiz',
        },
      ],
    })

    const ana = recipients.find((recipient) => recipient.name === 'Ana Diaz')
    expect(ana).toBeTruthy()
    expect(ana.email).toBe('ana.docente@example.com')
    expect(ana.mesas.map((mesa) => mesa.rolDocente)).toEqual(['Titular', 'Vocal 1'])
  })
})
