import { describe, expect, it } from 'vitest'
import { buildCatalog, buildCatalogSql, dateText, parseArgs, sqlText, validateInstitutionName } from './buildAcademicCatalogSql.mjs'

const careersAndPlans = [
  { _fila: 2, carrera_id: 'ING', carrera_nombre: 'Profesorado de Inglés', plan_id: 'ING-2024', plan_nombre: 'Plan 2024', anio_plan: '2024', estado_plan: 'VIGENTE' },
]
const plan = (materia, extra = {}) => ({ plan_id: 'ING-2024', carrera: 'Profesorado de Inglés', materia, materia_id: `m-${materia}`, nombreMateria: `Materia ${materia}`, anio_cursada: '1', ...extra })
const correlatividades = [
  { _fila: 2, materia_id: 'm-ING02', correlativa_id: 'm-ING01', requisito: 'Aprobada', tipo_correlativa: 'FINAL' },
  { _fila: 3, materia_id: 'm-ING02', correlativa_id: 'm-ING01', requisito: 'Regular', tipo_correlativa: 'CURSADA' },
  { _fila: 4, materia_id: 'm-ING01', correlativa_id: '', correlativa_codigo: '' },
]

describe('buildCatalog', () => {
  it('arma carreras, planes y materias con el texto de carrera de la planilla', () => {
    const catalog = buildCatalog({ careersAndPlans, planesEstudio: [plan('ING01'), plan('ING02')], correlatividades })

    expect(catalog.errors).toEqual([])
    expect(catalog.careers).toEqual([{ code: 'ING', name: 'Profesorado de Inglés', duration: undefined }])
    expect(catalog.plans).toMatchObject([{ code: 'ING-2024', careerCode: 'ING', status: 'active' }])
    expect(catalog.planSubjects.map((item) => item.code)).toEqual(['ING01', 'ING02'])
    expect(catalog.prerequisites).toEqual([])
  })

  it('carga correlativas solo a pedido, separando cursada y final', () => {
    const catalog = buildCatalog({ careersAndPlans, planesEstudio: [plan('ING01'), plan('ING02')], correlatividades, withPrerequisites: true })

    expect(catalog.errors).toEqual([])
    expect(catalog.prerequisites).toEqual([
      { planCode: 'ING-2024', target: 'ING02', required: 'ING01', appliesTo: 'exam', condition: 'approved' },
      { planCode: 'ING-2024', target: 'ING02', required: 'ING01', appliesTo: 'enrollment', condition: 'regular' },
    ])
  })

  it('toma el plan de cada alumno de la planilla de alumnos, por DNI normalizado', () => {
    const catalog = buildCatalog({
      careersAndPlans,
      planesEstudio: [plan('ING01')],
      studentPlans: [
        { _fila: 2, dni: '30.111.222', plan_id: 'ING-2024' },
        { _fila: 3, dni: '30111222', plan_id: 'ING-2024' },
        { _fila: 4, dni: '', plan_id: 'ING-2024' },
      ],
    })

    expect(catalog.studentPlans).toEqual([{ dni: '30111222', planCode: 'ING-2024' }])
  })

  it('no genera nada si la planilla es inconsistente', () => {
    const catalog = buildCatalog({
      careersAndPlans: [
        ...careersAndPlans,
        { _fila: 3, carrera_id: 'ING', carrera_nombre: 'Otro nombre', plan_id: 'ING-2025' },
        { _fila: 4, carrera_id: 'MAT', carrera_nombre: 'PROFESORADO DE INGLES', plan_id: 'MAT-1' },
      ],
      planesEstudio: [plan('ING01'), plan('ING01'), plan('X01', { plan_id: 'NO-EXISTE' }), plan('ING03', { nombreMateria: '' }), plan('ING04', { plan_id: 'MAT-1', carrera: 'PROFESORADO DE INGLES' })],
      correlatividades: [
        { _fila: 2, materia_id: 'm-ING01', correlativa_id: 'm-ING01', plan_id: 'ING-2024' },
        { _fila: 3, materia_codigo: 'ING01', correlativa_codigo: 'ZZZ', plan_id: 'ING-2024' },
        { _fila: 4, materia_codigo: 'COMUN', correlativa_codigo: 'ING01' },
      ],
      studentPlans: [{ _fila: 2, dni: '1', plan_id: 'NO-EXISTE' }],
      withPrerequisites: true,
    })

    expect(catalog.errors).toEqual(expect.arrayContaining([
      expect.stringContaining('tiene dos nombres'),
      expect.stringContaining('dos carreras con el mismo nombre'),
      expect.stringContaining('esta dos veces en el plan ING-2024'),
      expect.stringContaining('no esta en carreras_planes'),
      expect.stringContaining('ING03 del plan ING-2024 no tiene materia_nombre'),
      expect.stringContaining('no puede ser correlativa de si misma'),
      expect.stringContaining('la correlativa ZZZ no esta en el plan'),
      expect.stringContaining('falta plan_id y la materia COMUN esta en 0 planes'),
      expect.stringContaining('alumnos_inscripciones fila 2: el plan "NO-EXISTE"'),
    ]))
  })

  it('avisa los valores desconocidos en lugar de cargarlos en silencio', () => {
    const catalog = buildCatalog({
      careersAndPlans: [{ ...careersAndPlans[0], estado_plan: 'No vigente', vigente_desde: 'marzo' }],
      planesEstudio: [plan('ING01'), plan('ING02')],
      correlatividades: [{ _fila: 2, materia_id: 'm-ING02', correlativa_id: 'm-ING01', requisito: 'Promocion', tipo_correlativa: 'Otra' }],
      withPrerequisites: true,
    })

    expect(catalog.errors).toEqual([])
    expect(catalog.warnings).toEqual([
      'carreras_planes fila 2: estado de plan "No vigente" desconocido; se carga como activo.',
      'carreras_planes fila 2 vigente_desde: fecha "marzo" no reconocida; queda sin fecha.',
      'correlatividades fila 2: requisito "Promocion" desconocido; se carga como regular.',
      'correlatividades fila 2: tipo_correlativa "Otra" desconocido; aplica a cursar y rendir.',
    ])
  })

  it('exige al menos una carrera y una materia', () => {
    expect(buildCatalog({}).errors).toEqual([
      'La planilla no tiene carreras en carreras_planes.',
      'La planilla no tiene materias validas en plan_estudios.',
    ])
  })
})

describe('buildCatalogSql', () => {
  it('escapa comillas, corre en una transaccion, no borra ni crea legajos y muestra el resultado despues del commit', () => {
    const catalog = buildCatalog({ careersAndPlans, planesEstudio: [plan('ING01', { nombreMateria: "Taller d'Arte" })] })
    const sql = buildCatalogSql(catalog, "Instituto O'Higgins")

    expect(sql).toContain("where name = 'Instituto O''Higgins' and status = 'active'")
    expect(sql).toContain("'Taller d''Arte'")
    expect(sql).toMatch(/\nbegin;\nset local standard_conforming_strings = on;\n/)
    expect(sql).not.toMatch(/\b(delete\s+from|truncate|drop\s+(table|policy|function|index|schema))\b/i)
    expect(sql).not.toMatch(/insert into public\.(student_records|teacher_records)/)
    expect(sql).not.toMatch(/update public\.(student_records|teacher_records)/)
    expect(sql.indexOf('commit;')).toBeLessThan(sql.lastIndexOf('select\n  (select count(*) from public.careers'))
  })

  it('rechaza nombres de institucion que podrian romper el SQL', () => {
    const catalog = buildCatalog({ careersAndPlans, planesEstudio: [plan('ING01')] })

    expect(() => buildCatalogSql(catalog, 'Instituto\rcommit; select 1')).toThrow('caracteres no permitidos')
    expect(() => buildCatalogSql(catalog, 'Instituto $$ X')).toThrow('caracteres no permitidos')
    expect(validateInstitutionName("Instituto O'Higgins")).toBe('')
  })
})

describe('helpers', () => {
  it('sqlText convierte vacios en null y duplica comillas', () => {
    expect(sqlText('  ')).toBe('null')
    expect(sqlText("a'b")).toBe("'a''b'")
  })

  it('dateText acepta Date, ISO, DD/MM/AAAA y serial de Excel', () => {
    expect(dateText(new Date(Date.UTC(2024, 2, 1)))).toBe('2024-03-01')
    expect(dateText('2024-03-01')).toBe('2024-03-01')
    expect(dateText('1/3/2024')).toBe('2024-03-01')
    expect(dateText('45352')).toBe('2024-03-01')
    expect(dateText('')).toBe('')
    expect(dateText('Mon Mar 01 2024')).toBe(null)
  })

  it('parseArgs exige planilla e institucion', () => {
    expect(() => parseArgs(['--institucion', 'X'])).toThrow('Falta --academica')
    expect(() => parseArgs(['--academica', 'a.xlsx'])).toThrow('Falta --institucion')
    expect(() => parseArgs(['--otra', '1'])).toThrow('Argumento desconocido')
    expect(parseArgs(['--academica', 'a.xlsx', '--institucion', 'X', '--con-correlativas'])).toEqual({ academica: 'a.xlsx', institucion: 'X', conCorrelativas: true, salida: 'catalogo-academico.sql' })
  })
})
