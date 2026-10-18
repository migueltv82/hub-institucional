import { describe, expect, it } from 'vitest'
import { buildCatalog, buildCatalogSql, parseArgs, sqlText } from './buildAcademicCatalogSql.mjs'

const careersAndPlans = [
  { _fila: 2, carrera_id: 'ING', carrera_nombre: 'Profesorado de Inglés', plan_id: 'ING-2024', plan_nombre: 'Plan 2024', anio_plan: '2024', estado_plan: 'VIGENTE' },
]
const plan = (materia, extra = {}) => ({ plan_id: 'ING-2024', carrera: 'Profesorado de Inglés', materia, materia_id: `m-${materia}`, nombreMateria: `Materia ${materia}`, anio_cursada: '1', ...extra })

describe('buildCatalog', () => {
  it('arma carreras, planes, materias y correlativas con el texto de carrera de la planilla', () => {
    const catalog = buildCatalog({
      careersAndPlans,
      planesEstudio: [plan('ING01'), plan('ING02')],
      correlatividades: [
        { _fila: 2, materia_id: 'm-ING02', correlativa_id: 'm-ING01', requisito: 'Aprobada' },
        { _fila: 3, materia_id: 'm-ING01', correlativa_id: '', correlativa_codigo: '' },
      ],
    })

    expect(catalog.errors).toEqual([])
    expect(catalog.careers).toEqual([{ code: 'ING', name: 'Profesorado de Inglés', duration: undefined }])
    expect(catalog.plans).toMatchObject([{ code: 'ING-2024', careerCode: 'ING', status: 'active' }])
    expect(catalog.planSubjects.map((item) => item.code)).toEqual(['ING01', 'ING02'])
    expect(catalog.prerequisites).toEqual([{ planCode: 'ING-2024', target: 'ING02', required: 'ING01', condition: 'approved' }])
  })

  it('no genera nada si la planilla es inconsistente', () => {
    const catalog = buildCatalog({
      careersAndPlans: [
        ...careersAndPlans,
        { _fila: 3, carrera_id: 'ING', carrera_nombre: 'Otro nombre', plan_id: 'ING-2025' },
        { _fila: 4, carrera_id: 'MAT', carrera_nombre: 'profesorado de inglés', plan_id: 'MAT-1' },
      ],
      planesEstudio: [plan('ING01'), plan('ING01'), plan('X01', { plan_id: 'NO-EXISTE' })],
      correlatividades: [
        { _fila: 2, materia_id: 'm-ING01', correlativa_id: 'm-ING01' },
        { _fila: 3, materia_codigo: 'ING01', correlativa_codigo: 'ZZZ', plan_id: 'ING-2024' },
      ],
    })

    expect(catalog.errors).toEqual(expect.arrayContaining([
      expect.stringContaining('tiene dos nombres'),
      expect.stringContaining('dos carreras con el mismo nombre'),
      expect.stringContaining('esta dos veces en el plan ING-2024'),
      expect.stringContaining('no esta en carreras_planes'),
      expect.stringContaining('no puede ser correlativa de si misma'),
      expect.stringContaining('la correlativa ZZZ no esta en el plan'),
    ]))
  })

  it('exige al menos una carrera y una materia', () => {
    expect(buildCatalog({}).errors).toEqual([
      'La planilla no tiene carreras en carreras_planes.',
      'La planilla no tiene materias validas en plan_estudios.',
    ])
  })
})

describe('buildCatalogSql', () => {
  it('escapa comillas, corre en una transaccion y no borra ni crea legajos', () => {
    const catalog = buildCatalog({ careersAndPlans, planesEstudio: [plan('ING01', { nombreMateria: "Taller d'Arte" })] })
    const sql = buildCatalogSql(catalog, "Instituto O'Higgins")

    expect(sql).toContain("where name = 'Instituto O''Higgins' and status = 'active'")
    expect(sql).toContain("'Taller d''Arte'")
    expect(sql.trimStart()).toMatch(/^-- CAT\.1/)
    expect(sql).toMatch(/\nbegin;\n/)
    expect(sql.trimEnd()).toMatch(/commit;$/)
    expect(sql).not.toMatch(/\b(delete\s+from|truncate|drop\s+(table|policy|function|index|schema))\b/i)
    expect(sql).not.toMatch(/insert into public\.(student_records|teacher_records)/)
  })
})

describe('sqlText y parseArgs', () => {
  it('convierte vacios en null', () => {
    expect(sqlText('  ')).toBe('null')
    expect(sqlText("a'b")).toBe("'a''b'")
  })

  it('exige planilla e institucion', () => {
    expect(() => parseArgs(['--institucion', 'X'])).toThrow('Falta --academica')
    expect(() => parseArgs(['--academica', 'a.xlsx'])).toThrow('Falta --institucion')
    expect(() => parseArgs(['--otra', '1'])).toThrow('Argumento desconocido')
    expect(parseArgs(['--academica', 'a.xlsx', '--institucion', 'X'])).toEqual({ academica: 'a.xlsx', institucion: 'X', salida: 'catalogo-academico.sql' })
  })
})
