import { describe, expect, it } from 'vitest'
import { applyMesaManualEdit } from './useManualMesaEditing.js'

describe('applyMesaManualEdit', () => {
  it('actualiza una mesa manualmente y mantiene el cronograma ordenado', () => {
    const cronograma = [
      {
        id: 'mesa-2',
        carrera: 'Historia',
        fechaIso: '2026-05-15',
        fecha: '15/05/2026',
        dia: 'Viernes',
        inicio: '10:00',
        fin: '12:00',
        aula: 'Aula 2',
        profesorTitular: 'Titular Dos',
        vocal1: 'Vocal Tres',
        vocal2: 'Vocal Cuatro',
        observacionManual: '',
      },
      {
        id: 'mesa-1',
        carrera: 'Matematica',
        fechaIso: '2026-05-16',
        fecha: '16/05/2026',
        dia: 'Sabado',
        inicio: '09:00',
        fin: '11:00',
        aula: 'Aula 1',
        profesorTitular: 'Titular Uno',
        vocal1: 'Vocal Uno',
        vocal2: 'Vocal Dos',
        observacionManual: '',
      },
    ]

    const result = applyMesaManualEdit({
      cronograma,
      mesaEnEdicionId: 'mesa-1',
      edicionMesa: {
        fechaIso: '2026-05-14',
        inicio: '08:30',
        fin: '10:00',
        profesorTitular: 'Nueva Titular',
        vocal1: 'Nuevo Vocal 1',
        vocal2: 'Nuevo Vocal 2',
        aula: '  ',
        observacionManual: '  Reprogramada por pedido docente  ',
      },
    })

    expect(result[0]).toMatchObject({
      id: 'mesa-1',
      fechaIso: '2026-05-14',
      fecha: '14/05/2026',
      dia: 'Jueves',
      inicio: '08:30',
      fin: '10:00',
      aula: 'A definir',
      profesorTitular: 'Nueva Titular',
      vocal1: 'Nuevo Vocal 1',
      vocal2: 'Nuevo Vocal 2',
      observacionManual: 'Reprogramada por pedido docente',
      ajusteManual: true,
    })
    expect(result[1].id).toBe('mesa-2')
    expect(cronograma[1].fechaIso).toBe('2026-05-16')
  })

  it('quita la advertencia automatica de conflicto cuando el tribunal editado queda libre', () => {
    const cronograma = [
      {
        id: 'mesa-1',
        carrera: 'Matematica',
        fechaIso: '2026-05-14',
        fecha: '14/05/2026',
        dia: 'Jueves',
        inicio: '08:30',
        fin: '10:00',
        fin_operativo: '10:00',
        aula: 'Aula 1',
        profesorTitular: 'Ana Diaz',
        vocal1: 'Luis Perez',
        vocal2: 'A designar',
        observacionManual: 'Mesa generada con conflicto de titular o vocales ya asignados en este horario. Ajustar antes de confirmar.',
      },
      {
        id: 'mesa-2',
        carrera: 'Historia',
        fechaIso: '2026-05-14',
        fecha: '14/05/2026',
        dia: 'Jueves',
        inicio: '08:30',
        fin: '10:00',
        fin_operativo: '10:00',
        aula: 'Aula 2',
        profesorTitular: 'Ana Diaz',
        vocal1: 'Carla Ruiz',
        vocal2: 'Rosa Gil',
        observacionManual: '',
      },
    ]

    const result = applyMesaManualEdit({
      cronograma,
      mesaEnEdicionId: 'mesa-1',
      edicionMesa: {
        fechaIso: '2026-05-14',
        inicio: '08:30',
        fin: '10:00',
        profesorTitular: 'Marta Solis',
        vocal1: 'Luis Perez',
        vocal2: 'Omar Lago',
        aula: 'Aula 1',
        observacionManual: cronograma[0].observacionManual,
      },
    })

    const edited = result.find((mesa) => mesa.id === 'mesa-1')

    expect(edited.observacionManual).toBe('')
    expect(edited.profesorTitular).toBe('Marta Solis')
    expect(edited.vocal2).toBe('Omar Lago')
  })

  it('mantiene advertencia cuando la edicion deja docentes repetidos en el mismo horario', () => {
    const cronograma = [
      {
        id: 'mesa-1',
        carrera: 'Matematica',
        fechaIso: '2026-05-14',
        fecha: '14/05/2026',
        dia: 'Jueves',
        inicio: '08:30',
        fin: '10:00',
        fin_operativo: '10:00',
        aula: 'Aula 1',
        profesorTitular: 'Ana Diaz',
        vocal1: 'Luis Perez',
        vocal2: 'A designar',
        observacionManual: '',
      },
      {
        id: 'mesa-2',
        carrera: 'Historia',
        fechaIso: '2026-05-14',
        fecha: '14/05/2026',
        dia: 'Jueves',
        inicio: '08:30',
        fin: '10:00',
        fin_operativo: '10:00',
        aula: 'Aula 2',
        profesorTitular: 'Carla Ruiz',
        vocal1: 'Rosa Gil',
        vocal2: 'Omar Lago',
        observacionManual: '',
      },
    ]

    const result = applyMesaManualEdit({
      cronograma,
      mesaEnEdicionId: 'mesa-1',
      edicionMesa: {
        fechaIso: '2026-05-14',
        inicio: '08:30',
        fin: '10:00',
        profesorTitular: 'Carla Ruiz',
        vocal1: 'Luis Perez',
        vocal2: 'A designar',
        aula: 'Aula 1',
        observacionManual: 'Revisar disponibilidad externa',
      },
    })

    const edited = result.find((mesa) => mesa.id === 'mesa-1')

    expect(edited.observacionManual).toContain('Revisar disponibilidad externa')
    expect(edited.observacionManual).toContain('conflicto de titular o vocales')
    expect(edited.observacionManual).not.toContain('vocal pendiente de designacion')
  })

  it('no marca advertencia si la mesa queda con titular y un vocal asignado', () => {
    const cronograma = [
      {
        id: 'mesa-1',
        carrera: 'Matematica',
        fechaIso: '2026-05-14',
        fecha: '14/05/2026',
        dia: 'Jueves',
        inicio: '08:30',
        fin: '10:00',
        fin_operativo: '10:00',
        aula: 'Aula 1',
        profesorTitular: 'Ana Diaz',
        vocal1: 'Luis Perez',
        vocal2: 'A designar',
        observacionManual: 'Mesa generada con un vocal pendiente de designacion. Revisar antes de confirmar.',
      },
    ]

    const result = applyMesaManualEdit({
      cronograma,
      mesaEnEdicionId: 'mesa-1',
      edicionMesa: {
        fechaIso: '2026-05-14',
        inicio: '08:30',
        fin: '10:00',
        profesorTitular: 'Ana Diaz',
        vocal1: 'Luis Perez',
        vocal2: 'A designar',
        aula: 'Aula 1',
        observacionManual: cronograma[0].observacionManual,
      },
    })

    expect(result[0].observacionManual).toBe('')
  })

  it('advierte cuando un docente queda duplicado dentro de la misma mesa', () => {
    const cronograma = [
      {
        id: 'mesa-1',
        carrera: 'Matematica',
        fechaIso: '2026-05-14',
        fecha: '14/05/2026',
        dia: 'Jueves',
        inicio: '08:30',
        fin: '10:00',
        fin_operativo: '10:00',
        aula: 'Aula 1',
        profesorTitular: 'Ana Diaz',
        vocal1: 'Luis Perez',
        vocal2: 'A designar',
        observacionManual: '',
      },
    ]

    const result = applyMesaManualEdit({
      cronograma,
      mesaEnEdicionId: 'mesa-1',
      edicionMesa: {
        fechaIso: '2026-05-14',
        inicio: '08:30',
        fin: '10:00',
        profesorTitular: 'Ana Diaz',
        vocal1: 'Ana Diaz',
        vocal2: 'Omar Lago',
        aula: 'Aula 1',
        observacionManual: '',
      },
    })

    expect(result[0].observacionManual).toContain('docente repetido')
    expect(result[0].observacionManual).not.toContain('conflicto de titular o vocales')
  })

  it('advierte cuando un docente queda como titular y vocal el mismo dia', () => {
    const cronograma = [
      {
        id: 'mesa-1',
        carrera: 'Matematica',
        materia: 'MAT01',
        fechaIso: '2026-05-14',
        fecha: '14/05/2026',
        dia: 'Jueves',
        inicio: '08:30',
        fin: '10:00',
        fin_operativo: '10:00',
        aula: 'Aula 1',
        profesorTitular: 'Marta Solis',
        vocal1: 'Luis Perez',
        vocal2: 'Omar Lago',
        observacionManual: '',
      },
      {
        id: 'mesa-2',
        carrera: 'Matematica',
        materia: 'MAT02',
        fechaIso: '2026-05-14',
        fecha: '14/05/2026',
        dia: 'Jueves',
        inicio: '10:30',
        fin: '12:00',
        fin_operativo: '12:00',
        aula: 'Aula 2',
        profesorTitular: 'Ana Diaz',
        vocal1: 'Carla Ruiz',
        vocal2: 'Rosa Gil',
        observacionManual: '',
      },
    ]

    const result = applyMesaManualEdit({
      cronograma,
      mesaEnEdicionId: 'mesa-1',
      edicionMesa: {
        fechaIso: '2026-05-14',
        inicio: '08:30',
        fin: '10:00',
        profesorTitular: 'Marta Solis',
        vocal1: 'Ana Diaz',
        vocal2: 'Omar Lago',
        aula: 'Aula 1',
        observacionManual: '',
      },
    })

    const edited = result.find((mesa) => mesa.id === 'mesa-1')

    expect(edited.observacionManual).toContain('titular y vocal')
  })

  it('advierte cuando la edicion supera mitad mas uno de dias afectados', () => {
    const cronograma = [
      {
        id: 'mesa-1',
        carrera: 'Matematica',
        materia: 'MAT01',
        fechaIso: '2026-05-11',
        fecha: '11/05/2026',
        dia: 'Lunes',
        inicio: '08:30',
        fin: '10:00',
        fin_operativo: '10:00',
        aula: 'Aula 1',
        profesorTitular: 'Marta Solis',
        vocal1: 'Luis Perez',
        vocal2: 'Omar Lago',
        exam_call: 'primer-llamado',
        observacionManual: '',
      },
      {
        id: 'mesa-2',
        carrera: 'Matematica',
        materia: 'MAT02',
        fechaIso: '2026-05-12',
        fecha: '12/05/2026',
        dia: 'Martes',
        inicio: '08:30',
        fin: '10:00',
        fin_operativo: '10:00',
        aula: 'Aula 2',
        profesorTitular: 'Docente Limite',
        vocal1: 'Carla Ruiz',
        vocal2: 'Rosa Gil',
        exam_call: 'primer-llamado',
        observacionManual: '',
      },
      {
        id: 'mesa-3',
        carrera: 'Matematica',
        materia: 'MAT03',
        fechaIso: '2026-05-13',
        fecha: '13/05/2026',
        dia: 'Miercoles',
        inicio: '08:30',
        fin: '10:00',
        fin_operativo: '10:00',
        aula: 'Aula 3',
        profesorTitular: 'Docente Limite',
        vocal1: 'Susana Gil',
        vocal2: 'Ramon Paz',
        exam_call: 'primer-llamado',
        observacionManual: '',
      },
    ]

    const result = applyMesaManualEdit({
      cronograma,
      generationScope: { applyHalfPlusOneRule: true },
      horariosDocentes: [
        { profesor: 'Docente Limite', dia: 'Lunes' },
        { profesor: 'Docente Limite', dia: 'Martes' },
        { profesor: 'Docente Limite', dia: 'Miercoles' },
      ],
      mesaEnEdicionId: 'mesa-1',
      edicionMesa: {
        fechaIso: '2026-05-11',
        inicio: '08:30',
        fin: '10:00',
        profesorTitular: 'Docente Limite',
        vocal1: 'Luis Perez',
        vocal2: 'Omar Lago',
        aula: 'Aula 1',
        observacionManual: '',
      },
    })

    const edited = result.find((mesa) => mesa.id === 'mesa-1')

    expect(edited.observacionManual).toContain('mitad mas uno')
  })

  it('advierte cuando un docente tiene dos mesas el mismo dia con materias no afines', () => {
    const cronograma = [
      {
        id: 'mesa-1',
        carrera: 'Matematica',
        materia: 'MAT01',
        fechaIso: '2026-05-14',
        fecha: '14/05/2026',
        dia: 'Jueves',
        inicio: '08:30',
        fin: '10:00',
        fin_operativo: '10:00',
        aula: 'Aula 1',
        profesorTitular: 'Marta Solis',
        vocal1: 'Luis Perez',
        vocal2: 'Omar Lago',
        observacionManual: '',
      },
      {
        id: 'mesa-2',
        carrera: 'Historia',
        materia: 'HIS01',
        fechaIso: '2026-05-14',
        fecha: '14/05/2026',
        dia: 'Jueves',
        inicio: '10:30',
        fin: '12:00',
        fin_operativo: '12:00',
        aula: 'Aula 2',
        profesorTitular: 'Docente Afinidad',
        vocal1: 'Carla Ruiz',
        vocal2: 'Rosa Gil',
        observacionManual: '',
      },
    ]

    const result = applyMesaManualEdit({
      cronograma,
      generationScope: { allowSameDayRelatedSubjects: true },
      mesaEnEdicionId: 'mesa-1',
      edicionMesa: {
        fechaIso: '2026-05-14',
        inicio: '08:30',
        fin: '10:00',
        profesorTitular: 'Docente Afinidad',
        vocal1: 'Luis Perez',
        vocal2: 'Omar Lago',
        aula: 'Aula 1',
        observacionManual: '',
      },
    })

    const edited = result.find((mesa) => mesa.id === 'mesa-1')

    expect(edited.observacionManual).toContain('materias no afines')
  })

  it('advierte cuando el flag no permite dos mesas el mismo dia aunque sean afines', () => {
    const cronograma = [
      {
        id: 'mesa-1',
        carrera: 'Matematica',
        materia: 'MAT01',
        fechaIso: '2026-05-14',
        fecha: '14/05/2026',
        dia: 'Jueves',
        inicio: '08:30',
        fin: '10:00',
        fin_operativo: '10:00',
        aula: 'Aula 1',
        profesorTitular: 'Marta Solis',
        vocal1: 'Luis Perez',
        vocal2: 'Omar Lago',
        observacionManual: '',
      },
      {
        id: 'mesa-2',
        carrera: 'Matematica',
        materia: 'MAT02',
        fechaIso: '2026-05-14',
        fecha: '14/05/2026',
        dia: 'Jueves',
        inicio: '10:30',
        fin: '12:00',
        fin_operativo: '12:00',
        aula: 'Aula 2',
        profesorTitular: 'Docente Afinidad',
        vocal1: 'Carla Ruiz',
        vocal2: 'Rosa Gil',
        observacionManual: '',
      },
    ]

    const result = applyMesaManualEdit({
      cronograma,
      generationScope: { allowSameDayRelatedSubjects: false },
      mesaEnEdicionId: 'mesa-1',
      edicionMesa: {
        fechaIso: '2026-05-14',
        inicio: '08:30',
        fin: '10:00',
        profesorTitular: 'Docente Afinidad',
        vocal1: 'Luis Perez',
        vocal2: 'Omar Lago',
        aula: 'Aula 1',
        observacionManual: '',
      },
    })

    const edited = result.find((mesa) => mesa.id === 'mesa-1')

    expect(edited.observacionManual).toContain('no permitidas')
  })
})
