import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import TeacherRosterSection from './TeacherRosterSection.jsx'

describe('TeacherRosterSection fechas bloqueadas', () => {
  it('espera el alta manual asincronica antes de cerrar el modal', async () => {
    const onCreateTeacher = vi.fn().mockResolvedValue(true)

    render(
      <TeacherRosterSection
        canEditWorkspace
        careerOptions={['PROFESORADO DE INGLES']}
        docentes={[]}
        onCreateTeacher={onCreateTeacher}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /Nuevo docente/i }))
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Ana' } })
    fireEvent.change(screen.getByLabelText('Apellido'), { target: { value: 'Perez' } })
    fireEvent.change(screen.getByLabelText('DNI'), { target: { value: '30111222' } })
    fireEvent.click(screen.getByLabelText('PROFESORADO DE INGLES'))
    fireEvent.click(screen.getByRole('button', { name: 'Crear docente' }))

    await waitFor(() => {
      expect(onCreateTeacher).toHaveBeenCalledWith(expect.objectContaining({
        nombre: 'Ana',
        apellido: 'Perez',
        dni: '30111222',
        carreras: ['PROFESORADO DE INGLES'],
      }))
    })
  })

  it('no reintroduce codigos de carrera desde los perfiles docentes', () => {
    render(
      <TeacherRosterSection
        careerOptions={[
        'PROFESORADO DE GEOGRAFIA',
        'PROFESORADO DE INGLES',
        'PROFESORADO DE QUIMICA',
        'TECNICO SUPERIOR EN TRADUCTORADO',
        'TECNICO SUPERIOR EN TURISMO',
        ]}
        docentes={[
        { carrera: 'GEO' },
        { carreras: ['ING', 'QUI', 'TRA', 'TUR'] },
        { carrera: 'TECNICO SUP EN TRADUCTORADO' },
        { carrera: 'TECNICO SUP EN TURISMO' },
        ]}
      />,
    )

    const careerSelect = screen.getByRole('combobox', { name: 'Carrera' })
    expect(within(careerSelect).getAllByRole('option').map((option) => option.textContent)).toEqual([
      'Todas las carreras',
      'PROFESORADO DE GEOGRAFIA',
      'PROFESORADO DE INGLES',
      'PROFESORADO DE QUIMICA',
      'TECNICO SUPERIOR EN TRADUCTORADO',
      'TECNICO SUPERIOR EN TURISMO',
    ])
  })

  it('cuenta docentes incompletos sin duplicar faltantes del mismo docente', () => {
    render(
      <TeacherRosterSection
        docentes={[
          { nombre: 'Docente Completo', dni: '30111222' },
          { nombre: 'Docente Sin Datos' },
          { nombre: 'Docente Sin Materia', dni: '30222333', carreras: ['Laboratorio'] },
        ]}
        docenteMateria={[{
          docente: 'Docente Completo',
          dni_docente: '30111222',
          carrera: 'Profesorado de Ingles',
          materia_nombre: 'Ingles I',
        }]}
        cargaHorariaDocente={[]}
        disponibilidadDocente={[]}
        horariosDocentes={[]}
        fechasBloqueadasDocente={[]}
        careerOptions={['Profesorado de Ingles', 'Laboratorio']}
      />,
    )

    const incompleteCard = screen.getByText('Incompletos').closest('div')

    expect(within(incompleteCard).getByText('2')).toBeInTheDocument()
    expect(within(incompleteCard).getByText('Falta DNI, carrera o materia')).toBeInTheDocument()
  })

  it('oculta artefactos de validacion Supabase y no muestra contadores academicos internos', () => {
    render(
      <TeacherRosterSection
        docentes={[{
          record_id: 'teacher-1',
          full_name: 'Docente Real',
          dni: '30111222',
        }]}
        cargaHorariaDocente={[
          {
            docenteId: 'teacher-1',
            docente: 'Docente Real',
            dni_docente: '30111222',
            carrera: 'Profesorado de Ingles',
            materia_nombre: 'Ingles I',
            horasCatedra: 4,
          },
          {
            docente: 'Docente Validacion Supabase',
            dni_docente: '99945001',
            carrera: 'Validacion Carrera',
            materia_nombre: 'Validacion Supabase I',
            horasCatedra: 4,
            source: 'codex_teacher_academic_validation',
          },
        ]}
        disponibilidadDocente={[]}
        horariosDocentes={[]}
        fechasBloqueadasDocente={[]}
        careerOptions={['Profesorado de Ingles', 'Validacion Carrera']}
      />,
    )

    expect(screen.getByText('Docentes').closest('div')).toHaveTextContent('1')
    expect(screen.queryByText('Docente Validacion Supabase')).not.toBeInTheDocument()

    expect(screen.queryByRole('button', { name: 'Datos academicos' })).not.toBeInTheDocument()
    expect(screen.getByText('Docente Real')).toBeInTheDocument()
    expect(screen.queryByText('Docente Validacion Supabase')).not.toBeInTheDocument()
    expect(screen.queryByText('Validacion Supabase I')).not.toBeInTheDocument()
    expect(screen.queryByText('Horas catedra institucionales')).not.toBeInTheDocument()
    expect(screen.queryByText('Con carga horaria')).not.toBeInTheDocument()
    expect(screen.getAllByText('Con materias')).toHaveLength(1)
  })

  it('muestra en padron la carga horaria consolidada sin depender de datos academicos', () => {
    render(
      <TeacherRosterSection
        docentes={[{
          full_name: 'Ana Diaz',
          dni: '30111222',
          email: 'ana@example.edu',
          telefono: '1234',
        }]}
        cargaHorariaDocente={[{
          docente: 'Ana Diaz',
          dni_docente: '30111222',
          carrera: 'Profesorado de Ingles',
          materia_codigo: 'ING1',
          materia_nombre: 'Ingles I',
          horasCatedra: 6,
          rol_en_materia: 'TITULAR',
        }]}
        disponibilidadDocente={[]}
        horariosDocentes={[]}
        fechasBloqueadasDocente={[]}
        careerOptions={['Profesorado de Ingles']}
      />,
    )

    const rosterTable = screen.getByRole('table')
    const anaRow = within(rosterTable).getByText('Ana Diaz').closest('tr')

    expect(within(anaRow).getByText('1 carrera')).toBeInTheDocument()
    expect(within(anaRow).getByText('1 materia')).toBeInTheDocument()
    expect(within(anaRow).getByText('6')).toBeInTheDocument()
    expect(within(anaRow).queryByText('Ingles I')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Datos academicos' })).not.toBeInTheDocument()
    expect(screen.queryByText('Datos academicos docentes')).not.toBeInTheDocument()
  })

  it('cuenta carreras desde las materias asignadas y muestra horas en el padron', () => {
    render(
      <TeacherRosterSection
        docentes={[{
          full_name: 'ALVAREZ PABLO',
          dni: '30071977',
          carreras: [
            'PROFESORADO DE QUIMICA',
            'PROFESORADO DE INGLES',
            'TECNICO SUPERIOR EN LABORATORIO',
          ],
        }]}
        horariosDocentes={[
          {
            dni: '30071977',
            profesor: 'ALVAREZ PABLO',
            carrera: 'PROFESORADO DE QUIMICA',
            materia_codigo: 'QUI01',
            materia_nombre: 'FISICA I',
            dia: 'LUNES',
            inicio: '18:20',
            fin: '21:00',
          },
          {
            dni: '30071977',
            profesor: 'ALVAREZ PABLO',
            carrera: 'PROFESORADO DE QUIMICA',
            materia_codigo: 'QUI02',
            materia_nombre: 'QUIMICA DE LOS MATERIALES',
            dia: 'MARTES',
            inicio: '18:20',
            fin: '21:00',
          },
          {
            dni: '30071977',
            profesor: 'ALVAREZ PABLO',
            carrera: 'PROFESORADO DE QUIMICA',
            materia_codigo: 'QUI03',
            materia_nombre: 'QUIMICA GENERAL',
            dia: 'MIERCOLES',
            inicio: '18:20',
            fin: '21:00',
          },
        ]}
        cargaHorariaDocente={[]}
        disponibilidadDocente={[]}
        fechasBloqueadasDocente={[]}
        careerOptions={['PROFESORADO DE QUIMICA']}
      />,
    )

    const rosterTable = screen.getByRole('table')
    const rosterRow = within(rosterTable).getByText('ALVAREZ PABLO').closest('tr')

    expect(within(rosterRow).getByText('1 carrera')).toBeInTheDocument()
    expect(within(rosterRow).getByText('3 materias')).toBeInTheDocument()
    expect(within(rosterRow).getByText('12')).toBeInTheDocument()

    fireEvent.click(within(rosterRow).getByText('ALVAREZ PABLO'))

    const modal = screen.getByText('Detalle docente').closest('section')
    expect(within(within(modal).getByText('Materias').closest('div')).getByText('3')).toBeInTheDocument()
    expect(within(within(modal).getByText('Carreras').closest('div')).getByText('1')).toBeInTheDocument()
    expect(within(within(modal).getByText('Horas catedra').closest('div')).getByText('12')).toBeInTheDocument()

    fireEvent.click(within(modal).getByTitle('Cerrar'))

    expect(screen.queryByRole('button', { name: 'Datos academicos' })).not.toBeInTheDocument()
    expect(screen.queryByText(/FISICA I \(TITULAR\)/)).not.toBeInTheDocument()
    expect(screen.queryByText(/QUIMICA GENERAL \(TITULAR\)/)).not.toBeInTheDocument()
  })

  it('permite cargar un bloqueo administrativo validado', () => {
    const onCreateBlockedDate = vi.fn(() => true)
    render(
      <TeacherRosterSection
        canEditWorkspace
        cargaHorariaDocente={[{
          docente: 'Ana Diaz',
          carrera: 'Profesorado',
          materia_codigo: 'ING1',
          horasCatedra: 4,
        }]}
        disponibilidadDocente={[]}
        docentes={[]}
        horariosDocentes={[]}
        fechasBloqueadasDocente={[]}
        onCreateBlockedDate={onCreateBlockedDate}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Bloqueos' }))
    fireEvent.change(screen.getByLabelText('Docente'), { target: { value: 'Ana Diaz' } })
    fireEvent.change(screen.getByLabelText('Fecha'), { target: { value: '2026-07-30' } })
    fireEvent.change(screen.getByLabelText('Motivo'), { target: { value: 'Otra institucion' } })
    fireEvent.click(screen.getByRole('button', { name: 'Agregar bloqueo' }))

    expect(onCreateBlockedDate).toHaveBeenCalledWith(expect.objectContaining({
      docenteNombre: 'Ana Diaz',
      date: '2026-07-30',
      scope: 'FULL_DAY',
      reason: 'Otra institucion',
      status: 'ACTIVE',
    }))
  })

  it('lista bloqueos existentes por docente', () => {
    render(
      <TeacherRosterSection
        canEditWorkspace
        cargaHorariaDocente={[]}
        disponibilidadDocente={[]}
        docentes={[]}
        horariosDocentes={[]}
        fechasBloqueadasDocente={[{
          id: 'block-1',
          docenteNombre: 'Fernanda Salinas',
          date: '2026-08-04',
          scope: 'TIME_RANGE',
          startTime: '18:00',
          endTime: '20:00',
          status: 'ACTIVE',
        }]}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Bloqueos' }))
    expect(screen.getByText('Fernanda Salinas')).toBeInTheDocument()
    expect(screen.getByText('18:00 - 20:00')).toBeInTheDocument()
  })

  it('resume disponibilidad docente desde horarios docentes', () => {
    render(
      <TeacherRosterSection
        docentes={[
          { full_name: 'Ana Diaz', dni: '30111222' },
          { full_name: 'Bruno Gomez', dni: '30222333' },
        ]}
        horariosDocentes={[
          {
            dni: '30111222',
            profesor: 'Ana Diaz',
            materia: 'ING1',
            dia: 'Lunes',
            inicio: '18:00',
            fin: '20:00',
          },
          {
            dni: '30111222',
            profesor: 'Ana Diaz',
            materia: 'ING2',
            dia: 'Miercoles',
            inicio: '20:00',
            fin: '21:20',
          },
          {
            dni: '30222333',
            profesor: 'Bruno Gomez',
            carrera: 'Tecnicatura Superior en Turismo',
            materia: 'TUR1',
            dia: 'Lunes',
            inicio: '18:00',
            fin: '19:20',
          },
        ]}
        planesEstudio={[
          { carrera: 'Profesorado de Ingles', materia: 'ING1', nombre: 'Ingles I' },
          { carrera: 'Profesorado de Ingles', materia: 'ING2', nombre: 'Ingles II' },
          { carrera: 'Tecnicatura Superior en Turismo', materia: 'TUR1', nombre: 'Turismo I' },
        ]}
        cargaHorariaDocente={[]}
        disponibilidadDocente={[]}
        fechasBloqueadasDocente={[]}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Disponibilidad' }))

    const summary = screen.getByText('Resumen desde horarios docentes').closest('section')
    const expectStat = (label, value) => {
      const labelElement = within(summary).getAllByText(label)[0]
      expect(within(labelElement.closest('div')).getByText(value)).toBeInTheDocument()
    }

    expectStat('Docentes', '2')
    expectStat('Dias', '2')
    expectStat('Franjas', '3')
    expectStat('Horas catedra', '7')
    expect(within(summary).getByText('Ana Diaz')).toBeInTheDocument()
    expect(within(summary).getAllByText('Lunes').length).toBeGreaterThan(0)
    expect(within(summary).getAllByText('Miercoles').length).toBeGreaterThan(0)
    const anaRow = within(summary).getByText('Ana Diaz').closest('tr')
    expect(within(anaRow).getByText('Ingles I')).toBeInTheDocument()
    expect(within(anaRow).getByText('Ingles II')).toBeInTheDocument()
    expect(within(anaRow).getAllByText('Profesorado de Ingles').length).toBeGreaterThan(0)
    expect(within(anaRow).getByText(/Lunes 18:00 - 20:00/)).toBeInTheDocument()
    fireEvent.click(within(anaRow).getByRole('button', { name: 'Ver detalle de Ana Diaz' }))

    const modal = screen.getByText('Detalle docente').closest('section')
    const scheduleTable = within(modal).getAllByRole('table')[1]
    expect(within(scheduleTable).getByText('Ingles I')).toBeInTheDocument()
    expect(within(scheduleTable).getByText('Ingles II')).toBeInTheDocument()
    expect(within(scheduleTable).getAllByText('Profesorado de Ingles').length).toBeGreaterThan(0)
    expect(screen.getByText('No hay disponibilidad docente cargada.')).toBeInTheDocument()
  })

  it('muestra todos los recuadros de disponibilidad de un docente sin resumir excedentes', () => {
    const horariosDocentes = Array.from({ length: 6 }, (_, index) => ({
      dni: '30111222',
      profesor: 'Ana Diaz',
      materia: `MAT${index + 1}`,
      dia: 'Lunes',
      inicio: '18:00',
      fin: '18:40',
    }))

    render(
      <TeacherRosterSection
        docentes={[{ full_name: 'Ana Diaz', dni: '30111222' }]}
        horariosDocentes={horariosDocentes}
        planesEstudio={horariosDocentes.map((schedule, index) => ({
          carrera: 'Profesorado de Ingles',
          materia: schedule.materia,
          nombre: `Materia ${index + 1}`,
        }))}
        cargaHorariaDocente={[]}
        disponibilidadDocente={[]}
        fechasBloqueadasDocente={[]}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Disponibilidad' }))

    const summary = screen.getByText('Resumen desde horarios docentes').closest('section')
    const anaRow = within(summary).getByText('Ana Diaz').closest('tr')

    expect(within(anaRow).getByText('6 materias / 1 carreras')).toBeInTheDocument()
    for (let index = 1; index <= 6; index += 1) {
      expect(within(anaRow).getByText(`Materia ${index}`)).toBeInTheDocument()
    }
    expect(within(anaRow).queryByText('+1 horarios')).not.toBeInTheDocument()
  })

  it('diagnostica fuente estructurada incompleta y materias sin titular efectivo', () => {
    render(
      <TeacherRosterSection
        cargaHorariaDocente={[{
          docente: 'Ana Diaz',
          carrera: 'Profesorado de Ingles',
          materia_codigo: 'ING1',
          horasCatedra: 4,
          rol_en_materia: 'TITULAR',
        }]}
        disponibilidadDocente={[]}
        docentes={[{ id: 'teacher-1', nombre: 'Ana Diaz' }]}
        horariosDocentes={[{
          docente: 'Ana Diaz',
          carrera: 'Profesorado de Ingles',
          materia: 'ING1',
          horasCatedra: 4,
          dia: 'Lunes',
          inicio: '18:00',
          fin: '20:00',
        }]}
        fechasBloqueadasDocente={[]}
        planesEstudio={[
          { carrera: 'Profesorado de Ingles', materia: 'ING1', nombre: 'Ingles I', anio: 1 },
          { carrera: 'Profesorado de Ingles', materia: 'ING2', nombre: 'Ingles II', anio: 2 },
        ]}
        careerOptions={['Profesorado de Ingles']}
      />,
    )

    fireEvent.change(screen.getByLabelText('Carrera'), {
      target: { value: 'Profesorado de Ingles' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Control de datos' }))

    expect(screen.getByText('Carrera analizada: Profesorado de Ingles')).toBeInTheDocument()
    expect(screen.getByText('Datos tomados de horarios docentes')).toBeInTheDocument()
    expect(screen.getByText('ING2')).toBeInTheDocument()
    expect(screen.getByText(/Materias del plan a revisar/)).toBeInTheDocument()
  })

  it('muestra materias, carreras, condicion y horas catedra en el modal docente', () => {
    render(
      <TeacherRosterSection
        docentes={[{
          full_name: 'ALE JIMENA',
          dni: '36942805',
        }]}
        horariosDocentes={[
          {
            dni: '36942805',
            profesor: 'ALE JIMENA',
            materia: 'GEO38',
            dia: 'JUEVES',
            inicio: '18:20',
            fin: '19:40',
          },
          {
            dni: '36942805',
            profesor: 'ALE JIMENA',
            materia: 'GEO38',
            dia: 'MARTES',
            inicio: '19:40',
            fin: '21:10',
          },
        ]}
        planesEstudio={[{
          carrera: 'PROFESORADO DE GEOGRAFIA',
          materia: 'GEO38',
          nombre: 'Geografia Argentina',
          anio: 4,
        }]}
        cargaHorariaDocente={[]}
        disponibilidadDocente={[]}
        fechasBloqueadasDocente={[]}
        careerOptions={['PROFESORADO DE GEOGRAFIA']}
      />,
    )

    fireEvent.click(screen.getByText('ALE JIMENA'))

    const modal = screen.getByText('Detalle docente').closest('section')
    expect(within(within(modal).getByText('Materias').closest('div')).getByText('1')).toBeInTheDocument()
    expect(within(within(modal).getByText('Carreras').closest('div')).getByText('1')).toBeInTheDocument()
    expect(within(within(modal).getByText('Horas catedra').closest('div')).getByText('4')).toBeInTheDocument()

    const assignedCard = within(modal).getByText('Materias asignadas').closest('.rounded-lg')
    expect(within(assignedCard).getByText('Geografia Argentina')).toBeInTheDocument()
    expect(within(assignedCard).getByText('PROFESORADO DE GEOGRAFIA')).toBeInTheDocument()
    expect(within(assignedCard).getByRole('combobox', { name: 'Condicion de Geografia Argentina' })).toHaveValue('')
    expect(within(assignedCard).getAllByRole('option', { name: 'Reemplazo' }).length).toBeGreaterThan(0)
    expect(within(assignedCard).queryByText('Todavia no tiene materias asignadas.')).not.toBeInTheDocument()

    const scheduleTable = within(modal).getAllByRole('table')[1]
    expect(within(scheduleTable).getAllByText('Geografia Argentina')).toHaveLength(2)
    expect(within(scheduleTable).getAllByText('PROFESORADO DE GEOGRAFIA')).toHaveLength(2)
    expect(within(scheduleTable).queryByText('GEO38')).not.toBeInTheDocument()
  })

  it('desduplica materias equivalentes del horario en los contadores y la lista del modal', () => {
    render(
      <TeacherRosterSection
        docentes={[{
          full_name: 'RUSCONI PAULA',
          dni: '30111222',
        }]}
        horariosDocentes={[
          {
            dni: '30111222',
            profesor: 'RUSCONI PAULA',
            carrera: 'TECNICO SUPERIOR EN LABORATORIO',
            materia_codigo: 'LAB15-INF',
            materia_nombre: 'INFORMATICA',
            dia: 'MIERCOLES',
            inicio: '19:40',
            fin: '21:10',
          },
          {
            dni: '30111222',
            profesor: 'RUSCONI PAULA',
            carrera: 'TECNICO SUPERIOR EN LABORATORIO',
            materia_codigo: 'LAB24-INF',
            materia_nombre: 'INFORMATICA',
            dia: 'MIERCOLES',
            inicio: '19:40',
            fin: '21:10',
          },
        ]}
        planesEstudio={[]}
        cargaHorariaDocente={[]}
        disponibilidadDocente={[]}
        fechasBloqueadasDocente={[]}
        careerOptions={['TECNICO SUPERIOR EN LABORATORIO']}
      />,
    )

    fireEvent.click(screen.getByText('RUSCONI PAULA'))

    const modal = screen.getByText('Detalle docente').closest('section')
    expect(within(within(modal).getByText('Materias').closest('div')).getByText('1')).toBeInTheDocument()
    expect(within(within(modal).getByText('Carreras').closest('div')).getByText('1')).toBeInTheDocument()
    expect(within(within(modal).getByText('Horas catedra').closest('div')).getByText('2')).toBeInTheDocument()

    const assignedCard = within(modal).getByText('Materias asignadas').closest('.rounded-lg')
    expect(within(assignedCard).getAllByText('INFORMATICA')).toHaveLength(1)
  })
})
