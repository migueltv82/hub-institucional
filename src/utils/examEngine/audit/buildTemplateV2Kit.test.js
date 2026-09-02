import { describe, expect, it } from 'vitest'
import { TEMPLATE_V2_UNIQUE_KEYS } from './templateV2ValidationRules.js'
import { buildTemplateV2Kit } from './buildTemplateV2Kit.js'

const EXPECTED_TEMPLATES = [
  'carreras_planes',
  'plan_estudios',
  'equivalencias_planes',
  'docentes',
  'docente_materia',
  'horarios_docentes',
  'disponibilidad_docente',
  'alumnos_inscripciones',
  'correlatividades',
  'calendario_mesas',
]

describe('buildTemplateV2Kit', () => {
  it('genera las 10 plantillas esperadas', () => {
    const result = buildTemplateV2Kit()

    expect(Object.keys(result.templates)).toHaveLength(10)
    expect(Object.keys(result.templates)).toEqual(expect.arrayContaining(EXPECTED_TEMPLATES))
    expect(result.summary.templatesGenerated).toBe(10)
  })

  it('cada plantilla incluye columnas obligatorias', () => {
    const result = buildTemplateV2Kit()

    Object.values(result.templates).forEach((template) => {
      expect(template.columns).toEqual(expect.arrayContaining(template.requiredColumns))
      expect(template.csv.startsWith(template.columns.join(','))).toBe(true)
    })
  })

  it('manifest incluye claves unicas', () => {
    const result = buildTemplateV2Kit()

    result.manifest.templates.forEach((template) => {
      expect(template.uniqueKey).toEqual(TEMPLATE_V2_UNIQUE_KEYS[template.name])
    })
  })

  it('plan_estudios usa materia_id global', () => {
    const result = buildTemplateV2Kit()

    expect(result.templates.plan_estudios.uniqueKey).toEqual(['materia_id'])
  })

  it('docente_materia usa materia_id + docente_id', () => {
    const result = buildTemplateV2Kit()

    expect(result.templates.docente_materia.uniqueKey).toEqual(['materia_id', 'docente_id'])
  })

  it('ejemplos incluyen materias de los planes 2015 y 2024 de Laboratorio', () => {
    const result = buildTemplateV2Kit()
    const serialized = JSON.stringify({
      templates: result.templates,
      readme: result.readme,
      manifest: result.manifest,
    })

    expect(serialized).toContain('LAB15-QUIM1')
    expect(serialized).toContain('LAB24-QUIM1')
  })

  it('README contiene la regla madre', () => {
    const result = buildTemplateV2Kit()

    expect(result.readme).toContain('materia_id')
    expect(result.readme).toContain('materia_nombre')
  })

  it('no depende de materia_nombre como clave unica', () => {
    const result = buildTemplateV2Kit()

    Object.values(result.templates).forEach((template) => {
      expect(template.uniqueKey).not.toEqual(['materia_nombre'])
    })
    expect(result.warnings).toHaveLength(0)
  })

  it('no muta configuraciones compartidas', () => {
    const beforeUniqueKeys = JSON.stringify(TEMPLATE_V2_UNIQUE_KEYS)
    const first = buildTemplateV2Kit()
    first.templates.plan_estudios.columns.push('columna_mutada')
    first.templates.plan_estudios.uniqueKey.push('clave_mutada')
    first.templates.plan_estudios.rows[0].plan_id = 'MUTADO'

    const second = buildTemplateV2Kit()

    expect(JSON.stringify(TEMPLATE_V2_UNIQUE_KEYS)).toBe(beforeUniqueKeys)
    expect(second.templates.plan_estudios.columns).not.toContain('columna_mutada')
    expect(second.templates.plan_estudios.uniqueKey).not.toContain('clave_mutada')
    expect(second.templates.plan_estudios.rows[0].plan_id).toBe('1')
  })

  it('precarga duracion, titularidades y horarios desde las planillas actuales', () => {
    const result = buildTemplateV2Kit({
      sourceData: {
        planesEstudio: [
          { carrera: 'Profesorado de Ingles', materia: 'ING1', nombre: 'Ingles I', anio: 1 },
          { carrera: 'Profesorado de Ingles', materia: 'ING4', nombre: 'Ingles IV', anio: 4 },
        ],
        horariosDocentes: [{
          profesor: 'Ana Diaz',
          dni: '30111222',
          carrera: 'Profesorado de Ingles',
          materia: 'ING1',
          dia: 'Lunes',
          inicio: '18:00',
          fin: '20:00',
        }],
      },
    })

    expect(result.templates.carreras_planes.rows.find((row) => (
      row.carrera_nombre === 'PROFESORADO DE INGLES'
    ))).toMatchObject({ duracion_anios: 4 })
    expect(result.templates.docente_materia.rows[0]).toMatchObject({
      materia_codigo: 'ING1',
      rol_en_materia: 'TITULAR',
      estado_asignacion: 'ACTIVO',
    })
    expect(result.templates.horarios_docentes.rows[0]).toMatchObject({
      materia_codigo: 'ING1',
      dia: 'LUNES',
      hora_inicio: '18:00',
      hora_fin: '20:00',
    })
  })

  it('no elige titular arbitrariamente cuando horarios contiene varios docentes para la misma materia', () => {
    const result = buildTemplateV2Kit({
      sourceData: {
        planesEstudio: [
          { carrera: 'Profesorado de Ingles', materia: 'PRA2', nombre: 'Practica Profesional II', anio: 2 },
        ],
        horariosDocentes: [
          { profesor: 'Ana Diaz', dni: '30111222', carrera: 'Profesorado de Ingles', materia: 'PRA2', dia: 'Lunes' },
          { profesor: 'Beatriz Ruiz', dni: '30222333', carrera: 'Profesorado de Ingles', materia: 'PRA2', dia: 'Martes' },
        ],
      },
    })

    const assignments = result.templates.docente_materia.rows.filter((row) => row.materia_codigo === 'PRA2')
    expect(assignments).toHaveLength(2)
    expect(assignments.every((row) => row.rol_en_materia === '')).toBe(true)
    expect(assignments.every((row) => row.observaciones.includes('revision institucional'))).toBe(true)
  })

  it('precarga las afinidades institucionales en plan_estudios', () => {
    const result = buildTemplateV2Kit({
      sourceData: {
        planesEstudio: [{
          carrera: 'Tecnico Superior en Laboratorio',
          materia: 'LAB05',
          nombre: 'Quimica General e Inorganica',
          anio: 1,
        }],
      },
    })

    expect(result.templates.plan_estudios.columns).toEqual(expect.arrayContaining([
      'grupo_afin_mesa',
      'codigos_materias_afines',
    ]))
    expect(result.templates.plan_estudios.rows[0]).toMatchObject({
      grupo_afin_mesa: 'QUIMICA-GENERAL-INORGANICA',
      codigos_materias_afines: 'QUI05, QUI06',
    })
  })

  it('precarga las seis carreras institucionales y los dos planes activos de Laboratorio', () => {
    const result = buildTemplateV2Kit({ sourceData: {} })
    const rows = result.templates.carreras_planes.rows
    const careerNames = [...new Set(rows.map((row) => row.carrera_nombre))]

    expect(careerNames).toEqual([
      'TECNICO SUPERIOR EN TURISMO',
      'TECNICO SUPERIOR EN LABORATORIO',
      'TECNICO SUPERIOR EN TRADUCTORADO',
      'PROFESORADO DE INGLES',
      'PROFESORADO DE QUIMICA',
      'PROFESORADO DE GEOGRAFIA',
    ])
    expect(rows.filter((row) => row.carrera_nombre === 'TECNICO SUPERIOR EN LABORATORIO'))
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ plan_nombre: 'Plan 2015', estado_plan: 'VIGENTE' }),
        expect.objectContaining({ plan_nombre: 'Plan 2024', estado_plan: 'VIGENTE' }),
      ]))
  })

  it('consolida variantes de carrera usando el nombre oficial del plan', () => {
    const result = buildTemplateV2Kit({
      sourceData: {
        planesEstudio: [{
          carrera: 'Tecnicatura Superior en Laboratorio de Analisis Clinicos',
          materia: 'LAB1',
          anio: 1,
        }],
        horariosDocentes: [{
          profesor: 'Ana Diaz',
          carrera: 'Laboratorio de Analisis Clinicos',
          materia: 'LAB1',
          dia: 'Lunes',
          inicio: '18:00',
          fin: '20:00',
        }],
        alumnos: [{
          id: 'alu-1',
          carrera: 'Tecnico Superior en Laboratorio de Analisis Clinicos',
        }],
      },
    })

    expect(new Set(result.templates.carreras_planes.rows.map((row) => row.carrera_id)).size).toBe(6)
    const laboratoryPlans = result.templates.carreras_planes.rows.filter((row) => (
      row.carrera_nombre === 'TECNICO SUPERIOR EN LABORATORIO'
    ))
    expect(laboratoryPlans).toHaveLength(2)
    expect(laboratoryPlans.map((row) => row.plan_nombre)).toEqual(['Plan 2015', 'Plan 2024'])
    const careerId = laboratoryPlans[0].carrera_id
    expect(result.templates.horarios_docentes.rows[0].carrera_id).toBe(careerId)
    expect(result.templates.alumnos_inscripciones.rows[0].carrera_id).toBe(careerId)
  })

  it('unifica todas las variantes historicas de Traductorado en una sola carrera', () => {
    const result = buildTemplateV2Kit({
      sourceData: {
        planesEstudio: [
          { carrera: 'Traductorado de Ingles', materia: 'TRA1', anio: 1 },
          { carrera: 'TECNICO SUP EN TRADUCTORADO', materia: 'TRA2', anio: 2 },
        ],
        horariosDocentes: [
          { carrera: 'Traductorado Ingles', materia: 'TRA1', profesor: 'Ana Uno' },
          { carrera: 'Tradcutorado de Ingles', materia: 'TRA2', profesor: 'Ana Dos' },
        ],
        alumnos: [{ id: 'alu-1', carrera: 'Tecnico Superior en Traductorado' }],
      },
    })
    const careerRows = result.templates.carreras_planes.rows.filter((row) => (
      row.carrera_nombre.includes('TRADUCTORADO')
    ))
    const officialCareerId = careerRows[0].carrera_id

    expect(careerRows).toHaveLength(1)
    expect(careerRows[0].carrera_nombre).toBe('TECNICO SUPERIOR EN TRADUCTORADO')
    expect(result.templates.plan_estudios.rows.every((row) => row.carrera_id === officialCareerId)).toBe(true)
    expect(result.templates.horarios_docentes.rows.every((row) => row.carrera_id === officialCareerId)).toBe(true)
    expect(result.templates.alumnos_inscripciones.rows[0].carrera_id).toBe(officialCareerId)
  })

  it('unifica docente_id y nombre entre todas las hojas', () => {
    const result = buildTemplateV2Kit({
      sourceData: {
        docentes: [{
          id: 'perfil-aleatorio',
          nombre: 'Ana',
          apellido: 'Diaz',
          dni: '30111222',
          email: 'ana@example.edu',
        }],
        docenteMateria: [{
          docenteId: 'Ana Diaz',
          docente: 'Diaz, Ana',
          carrera: 'Profesorado de Ingles',
          materia: 'ING1',
          rol_en_materia: 'TITULAR',
        }],
        horariosDocentes: [{
          id: 'horario-1',
          profesor: 'Ana Diaz',
          carrera: 'Profesorado de Ingles',
          materia: 'ING1',
          dia: 'Lunes',
          inicio: '18:00',
          fin: '20:00',
        }],
        planesEstudio: [{ carrera: 'Profesorado de Ingles', materia: 'ING1', anio: 1 }],
      },
    })

    const teacher = result.templates.docentes.rows[0]
    const assignment = result.templates.docente_materia.rows[0]
    const schedule = result.templates.horarios_docentes.rows[0]
    expect(teacher.docente_id).toBe(1)
    expect(assignment.docente_id).toBe(teacher.docente_id)
    expect(schedule.docente_id).toBe(teacher.docente_id)
    expect(assignment.docente).toBe('Ana Diaz')
    expect(schedule.docente).toBe('Ana Diaz')
  })
})
