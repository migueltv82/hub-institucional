import { describe, expect, it } from 'vitest'
import {
  TEMPLATE_V2_ALLOWED_VALUES,
  TEMPLATE_V2_REQUIRED_KEYS,
  TEMPLATE_V2_UNIQUE_KEYS,
  validateTemplateV2SchemaDefinition,
} from './templateV2ValidationRules.js'

function definitionFor(templateName, overrides = {}) {
  return {
    [templateName]: {
      columns: TEMPLATE_V2_REQUIRED_KEYS[templateName],
      uniqueKey: TEMPLATE_V2_UNIQUE_KEYS[templateName],
      ...overrides,
    },
  }
}

function expectError(result, code) {
  expect(result.errors).toEqual(expect.arrayContaining([
    expect.objectContaining({ code }),
  ]))
}

describe('templateV2ValidationRules', () => {
  it('valida que plan_estudios exige plan_id', () => {
    const columns = TEMPLATE_V2_REQUIRED_KEYS.plan_estudios.filter((column) => column !== 'plan_id')
    const result = validateTemplateV2SchemaDefinition(definitionFor('plan_estudios', { columns }))

    expect(result.valid).toBe(false)
    expectError(result, 'FALTAN_COLUMNAS_REQUERIDAS')
    expect(result.errors[0].missing).toContain('plan_id')
  })

  it('valida que plan_estudios exige materia_codigo', () => {
    const columns = TEMPLATE_V2_REQUIRED_KEYS.plan_estudios.filter((column) => column !== 'materia_codigo')
    const result = validateTemplateV2SchemaDefinition(definitionFor('plan_estudios', { columns }))

    expect(result.valid).toBe(false)
    expectError(result, 'FALTAN_COLUMNAS_REQUERIDAS')
    expect(result.errors[0].missing).toContain('materia_codigo')
  })

  it('valida que docente_materia exige plan_id', () => {
    const columns = TEMPLATE_V2_REQUIRED_KEYS.docente_materia.filter((column) => column !== 'plan_id')
    const result = validateTemplateV2SchemaDefinition(definitionFor('docente_materia', { columns }))

    expect(result.valid).toBe(false)
    expectError(result, 'FALTAN_COLUMNAS_REQUERIDAS')
  })

  it('valida que horarios_docentes exige plan_id', () => {
    const columns = TEMPLATE_V2_REQUIRED_KEYS.horarios_docentes.filter((column) => column !== 'plan_id')
    const result = validateTemplateV2SchemaDefinition(definitionFor('horarios_docentes', { columns }))

    expect(result.valid).toBe(false)
    expectError(result, 'FALTAN_COLUMNAS_REQUERIDAS')
  })

  it('valida que correlatividades exige plan_id', () => {
    const columns = TEMPLATE_V2_REQUIRED_KEYS.correlatividades.filter((column) => column !== 'plan_id')
    const result = validateTemplateV2SchemaDefinition(definitionFor('correlatividades', { columns }))

    expect(result.valid).toBe(false)
    expectError(result, 'FALTAN_COLUMNAS_REQUERIDAS')
  })

  it('valida que alumnos_inscripciones exige plan_id', () => {
    const columns = TEMPLATE_V2_REQUIRED_KEYS.alumnos_inscripciones.filter((column) => column !== 'plan_id')
    const result = validateTemplateV2SchemaDefinition(definitionFor('alumnos_inscripciones', { columns }))

    expect(result.valid).toBe(false)
    expectError(result, 'FALTAN_COLUMNAS_REQUERIDAS')
  })

  it('rechaza definicion donde la clave sea solo materia_nombre', () => {
    const result = validateTemplateV2SchemaDefinition(definitionFor('plan_estudios', {
      uniqueKey: ['materia_nombre'],
    }))

    expect(result.valid).toBe(false)
    expectError(result, 'UNIQUE_KEY_SOLO_MATERIA_NOMBRE')
    expectError(result, 'UNIQUE_KEY_INCOMPLETA')
  })

  it('acepta convivencia de LAB-2015 y LAB-2024 con materias de nombre repetido', () => {
    const result = validateTemplateV2SchemaDefinition(definitionFor('plan_estudios', {
      rows: [
        {
          plan_id: 'LAB-2015',
          carrera_id: 'LAB',
          materia_codigo: 'QUIM1',
          materia_nombre: 'Quimica General',
          anio_cursada: '1',
          requiere_mesa: 'SI',
        },
        {
          plan_id: 'LAB-2024',
          carrera_id: 'LAB',
          materia_codigo: 'QUIM1',
          materia_nombre: 'Quimica General',
          anio_cursada: '1',
          requiere_mesa: 'SI',
        },
      ],
    }))

    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('detecta materia_id global duplicado', () => {
    const result = validateTemplateV2SchemaDefinition(definitionFor('plan_estudios', {
      rows: [
        {
          materia_id: 10,
          plan_id: 'LAB-2024',
          carrera_id: 'LAB',
          materia_codigo: 'QUIM1',
          materia_nombre: 'Quimica General',
          anio_cursada: '1',
          requiere_mesa: 'SI',
        },
        {
          materia_id: 10,
          plan_id: 'LAB-2024',
          carrera_id: 'LAB',
          materia_codigo: 'QUIM1',
          materia_nombre: 'Quimica I',
          anio_cursada: '1',
          requiere_mesa: 'SI',
        },
      ],
    }))

    expect(result.valid).toBe(false)
    expectError(result, 'UNIQUE_KEY_DUPLICADA')
  })

  it('valida valores permitidos para estado_plan, requiere_mesa, rol_en_materia y estado_asignacion', () => {
    expect(TEMPLATE_V2_ALLOWED_VALUES.estado_plan).toEqual(expect.arrayContaining([
      'VIGENTE',
      'CONVIVIENTE',
      'CERRADO',
      'REEMPLAZADO',
    ]))
    expect(TEMPLATE_V2_ALLOWED_VALUES.requiere_mesa).toEqual(expect.arrayContaining(['SI', 'NO', true, false, 1, 0]))
    expect(TEMPLATE_V2_ALLOWED_VALUES.rol_en_materia).toEqual(expect.arrayContaining([
      'TITULAR',
      'REEMPLAZO',
      'SUPLENTE',
      'CO_DOCENTE',
      'AUXILIAR',
    ]))
    expect(TEMPLATE_V2_ALLOWED_VALUES.estado_asignacion).toEqual(expect.arrayContaining([
      'ACTIVO',
      'LICENCIA',
      'RENUNCIA',
      'BAJA',
      'REEMPLAZADO',
    ]))
  })

  it('rechaza valores de fila fuera de los permitidos por el contrato v2', () => {
    const result = validateTemplateV2SchemaDefinition({
      carreras_planes: {
        columns: TEMPLATE_V2_REQUIRED_KEYS.carreras_planes,
        uniqueKey: TEMPLATE_V2_UNIQUE_KEYS.carreras_planes,
        rows: [
          {
            carrera_id: 'LAB',
            carrera_nombre: 'Tecnicatura Superior en Laboratorio',
            plan_id: 'LAB-2024',
            plan_nombre: 'Plan 2024',
            anio_plan: '2024',
            estado_plan: 'BORRADOR',
          },
        ],
      },
      docente_materia: {
        columns: TEMPLATE_V2_REQUIRED_KEYS.docente_materia,
        uniqueKey: TEMPLATE_V2_UNIQUE_KEYS.docente_materia,
        rows: [
          {
            plan_id: 'LAB-2024',
            carrera_id: 'LAB',
            materia_codigo: 'QUIM1',
            materia_nombre: 'Quimica General',
            docente_id: 'D1',
            rol_en_materia: 'JEFE',
            estado_asignacion: 'ACTIVO',
            requiere_mesa: 'TAL_VEZ',
          },
        ],
      },
    })

    expect(result.valid).toBe(false)
    expect(result.errors.filter((error) => error.code === 'VALOR_DE_FILA_INVALIDO')).toHaveLength(3)
  })
})
