import { describe, expect, it } from 'vitest'
import { parseDocenteMateriaRows } from './parseDocenteMateriaRows.js'

function parse(rows) {
  return parseDocenteMateriaRows(rows)
}

describe('parseDocenteMateriaRows', () => {
  it('parsea una fila completa valida', () => {
    const result = parse([{
      carrera: ' Profesorado de Ingles ',
      materia_codigo: 'ING1',
      materia_nombre: ' Ingles I ',
      anio: '1',
      docente: ' Docente Titular ',
      dni_docente: '12345678',
      rol_en_materia: 'titular',
      estado_asignacion: 'activo',
      vigencia_desde: '27/07/2026',
      vigencia_hasta: '2026-12-31',
      docente_reemplazado: '',
      requiere_mesa: 'SI',
      observaciones: 'Alta inicial',
    }])

    expect(result.errors).toEqual([])
    expect(result.rows[0]).toMatchObject({
      carrera: 'Profesorado de Ingles',
      materia_codigo: 'ING1',
      materia_nombre: 'Ingles I',
      anio: '1',
      docente: 'Docente Titular',
      dni_docente: '12345678',
      rol_en_materia: 'TITULAR',
      estado_asignacion: 'ACTIVO',
      vigencia_desde: '2026-07-27',
      vigencia_hasta: '2026-12-31',
      requiere_mesa: true,
      observaciones: 'Alta inicial',
    })
    expect(result.summary).toMatchObject({
      totalRowsRead: 1,
      validRows: 1,
      titularesActivos: 1,
      requiereMesaSi: 1,
    })
  })

  it('acepta alias de columnas', () => {
    const result = parse([{
      carrera: 'Tecnicatura',
      curso: '2',
      materia: 'Gestion I',
      apellido_nombre: 'Docente Alias',
      rol: 'reemplazo',
      situacion: 'licencia',
      'requiere mesa': 'NO',
    }])

    expect(result.errors).toEqual([])
    expect(result.rows[0]).toMatchObject({
      anio: '2',
      materia_nombre: 'Gestion I',
      docente: 'Docente Alias',
      rol_en_materia: 'REEMPLAZO',
      estado_asignacion: 'LICENCIA',
      requiere_mesa: false,
    })
  })

  it('ignora filas vacias', () => {
    const result = parse([
      {},
      { carrera: '', materia_nombre: ' ', docente: null },
      {
        carrera: 'Tecnicatura',
        materia_nombre: 'Gestion I',
        docente: 'Docente',
        estado_asignacion: 'ACTIVO',
      },
    ])

    expect(result.summary).toMatchObject({
      totalRowsRead: 3,
      ignoredRows: 2,
      validRows: 1,
    })
  })

  it('exige carrera', () => {
    const result = parse([{ materia_nombre: 'Gestion I', docente: 'Docente', estado_asignacion: 'ACTIVO' }])

    expect(result.rows).toEqual([])
    expect(result.errors[0]).toMatchObject({
      code: 'FALTA_CARRERA',
      field: 'carrera',
    })
  })

  it('exige materia_nombre', () => {
    const result = parse([{ carrera: 'Tecnicatura', docente: 'Docente', estado_asignacion: 'ACTIVO' }])

    expect(result.rows).toEqual([])
    expect(result.errors[0]).toMatchObject({
      code: 'FALTA_MATERIA_NOMBRE',
      field: 'materia_nombre',
    })
  })

  it('exige docente', () => {
    const result = parse([{ carrera: 'Tecnicatura', materia_nombre: 'Gestion I', estado_asignacion: 'ACTIVO' }])

    expect(result.rows).toEqual([])
    expect(result.errors[0]).toMatchObject({
      code: 'FALTA_DOCENTE',
      field: 'docente',
    })
  })

  it('permite docente vacio si requiere_mesa es NO y la opcion segura esta activa', () => {
    const result = parseDocenteMateriaRows([{
      carrera: 'Tecnicatura',
      materia_nombre: 'Taller Institucional',
      requiere_mesa: 'NO',
    }], { allowEmptyDocenteWhenNoRequiereMesa: true })

    expect(result.errors).toEqual([])
    expect(result.rows[0]).toMatchObject({
      docente: '',
      requiere_mesa: false,
    })
  })

  it('normaliza rol', () => {
    const result = parse([{
      carrera: 'Tecnicatura',
      materia_nombre: 'Gestion I',
      docente: 'Docente Co',
      rol_en_materia: 'co docente',
      estado_asignacion: 'ACTIVO',
    }])

    expect(result.rows[0].rol_en_materia).toBe('CO_DOCENTE')
    expect(result.summary.coDocentesActivos).toBe(1)
  })

  it('normaliza estado', () => {
    const result = parse([{
      carrera: 'Tecnicatura',
      materia_nombre: 'Gestion I',
      docente: 'Docente Reemplazo',
      rol_en_materia: ' reemplazo ',
      estado_asignacion: ' activa ',
    }])

    expect(result.rows[0]).toMatchObject({
      rol_en_materia: 'REEMPLAZO',
      estado_asignacion: 'ACTIVO',
    })
    expect(result.summary.reemplazosActivos).toBe(1)
  })

  it('infiere ACTIVO si falta estado_asignacion', () => {
    const result = parse([{
      carrera: 'Tecnicatura',
      materia_nombre: 'Gestion I',
      docente: 'Docente Sin Estado',
      rol_en_materia: 'TITULAR',
      estado_asignacion: '',
    }])

    expect(result.rows[0]).toMatchObject({
      estado_asignacion: 'ACTIVO',
      estadoInferido: true,
    })
    expect(result.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'ESTADO_ASIGNACION_INFERIDO_ACTIVO',
        field: 'estado_asignacion',
      }),
    ]))
    expect(result.summary.filasConEstadoInferido).toBe(1)
  })

  it('permite rol vacio con warning leve', () => {
    const result = parse([{
      carrera: 'Tecnicatura',
      materia_nombre: 'Gestion I',
      docente: 'Docente Sin Rol',
      estado_asignacion: 'ACTIVO',
    }])

    expect(result.errors).toEqual([])
    expect(result.rows[0]).toMatchObject({
      rol_en_materia: '',
      rolVacio: true,
    })
    expect(result.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'ROL_EN_MATERIA_VACIO',
        field: 'rol_en_materia',
      }),
    ]))
    expect(result.summary.filasConRolVacio).toBe(1)
  })

  it('detecta rol invalido', () => {
    const result = parse([{
      carrera: 'Tecnicatura',
      materia_nombre: 'Gestion I',
      docente: 'Docente',
      rol_en_materia: 'INVITADO',
      estado_asignacion: 'ACTIVO',
    }])

    expect(result.rows).toEqual([])
    expect(result.errors[0]).toMatchObject({
      code: 'ROL_EN_MATERIA_INVALIDO',
      field: 'rol_en_materia',
    })
  })

  it('detecta estado invalido', () => {
    const result = parse([{
      carrera: 'Tecnicatura',
      materia_nombre: 'Gestion I',
      docente: 'Docente',
      rol_en_materia: 'TITULAR',
      estado_asignacion: 'PENDIENTE',
    }])

    expect(result.rows).toEqual([])
    expect(result.errors[0]).toMatchObject({
      code: 'ESTADO_ASIGNACION_INVALIDO',
      field: 'estado_asignacion',
    })
  })

  it('detecta fecha invalida', () => {
    const result = parse([{
      carrera: 'Tecnicatura',
      materia_nombre: 'Gestion I',
      docente: 'Docente',
      rol_en_materia: 'TITULAR',
      estado_asignacion: 'ACTIVO',
      vigencia_desde: '31/02/2026',
      vigencia_hasta: 'sin fecha',
    }])

    expect(result.rows).toHaveLength(1)
    expect(result.warnings.map((warning) => warning.code)).toEqual([
      'VIGENCIA_DESDE_INVALIDA',
      'VIGENCIA_HASTA_INVALIDA',
    ])
    expect(result.summary.rowsWithWarnings).toBe(1)
  })

  it('normaliza requiere_mesa SI/NO', () => {
    const result = parse([
      {
        carrera: 'Tecnicatura',
        materia_nombre: 'Gestion I',
        docente: 'Docente A',
        rol_en_materia: 'TITULAR',
        estado_asignacion: 'ACTIVO',
        requiere_mesa: 'SI',
      },
      {
        carrera: 'Tecnicatura',
        materia_nombre: 'Gestion II',
        docente: 'Docente B',
        rol_en_materia: 'TITULAR',
        estado_asignacion: 'ACTIVO',
        requiere_mesa: 'NO',
      },
    ])

    expect(result.rows.map((row) => row.requiere_mesa)).toEqual([true, false])
    expect(result.summary).toMatchObject({
      requiereMesaSi: 1,
      requiereMesaNo: 1,
    })
  })

  it('normaliza requiere_mesa true/false/1/0', () => {
    const result = parse([
      {
        carrera: 'Tecnicatura',
        materia_nombre: 'Gestion I',
        docente: 'Docente A',
        rol_en_materia: 'TITULAR',
        estado_asignacion: 'ACTIVO',
        requiere_mesa: true,
      },
      {
        carrera: 'Tecnicatura',
        materia_nombre: 'Gestion II',
        docente: 'Docente B',
        rol_en_materia: 'TITULAR',
        estado_asignacion: 'ACTIVO',
        requiere_mesa: false,
      },
      {
        carrera: 'Tecnicatura',
        materia_nombre: 'Gestion III',
        docente: 'Docente C',
        rol_en_materia: 'TITULAR',
        estado_asignacion: 'ACTIVO',
        requiere_mesa: 1,
      },
      {
        carrera: 'Tecnicatura',
        materia_nombre: 'Gestion IV',
        docente: 'Docente D',
        rol_en_materia: 'TITULAR',
        estado_asignacion: 'ACTIVO',
        requiere_mesa: 0,
      },
    ])

    expect(result.rows.map((row) => row.requiere_mesa)).toEqual([true, false, true, false])
  })

  it('deja requiere_mesa invalido como null y genera warning', () => {
    const result = parse([{
      carrera: 'Tecnicatura',
      materia_nombre: 'Gestion I',
      docente: 'Docente',
      rol_en_materia: 'TITULAR',
      estado_asignacion: 'ACTIVO',
      requiere_mesa: 'quizas',
    }])

    expect(result.rows[0].requiere_mesa).toBeNull()
    expect(result.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'REQUIERE_MESA_INVALIDO',
        field: 'requiere_mesa',
      }),
    ]))
  })

  it('conserva observaciones', () => {
    const result = parse([{
      carrera: 'Tecnicatura',
      materia_nombre: 'Gestion I',
      docente: 'Docente',
      rol_en_materia: 'TITULAR',
      estado_asignacion: 'ACTIVO',
      observaciones: 'Revisar designacion institucional',
    }])

    expect(result.rows[0].observaciones).toBe('Revisar designacion institucional')
  })

  it('no expone datos personales completos en errores', () => {
    const result = parse([{
      carrera: '',
      materia_nombre: 'Gestion I',
      docente: 'Nombre Sensible',
      rol_en_materia: 'TITULAR',
      estado_asignacion: 'ACTIVO',
    }])

    expect(JSON.stringify(result.errors)).not.toContain('Nombre Sensible')
  })
})
