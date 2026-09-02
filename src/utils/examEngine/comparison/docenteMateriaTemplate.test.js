import { describe, expect, it } from 'vitest'
import {
  DOCENTE_MATERIA_TEMPLATE_COLUMNS,
  buildDocenteMateriaTemplateRows,
} from './docenteMateriaTemplate.js'
import {
  VALID_DOCENTE_MATERIA_ESTADOS,
  VALID_DOCENTE_MATERIA_ROLES,
  parseDocenteMateriaRows,
} from './parseDocenteMateriaRows.js'

describe('docenteMateriaTemplate', () => {
  it('expone las columnas canonicas esperadas', () => {
    expect(DOCENTE_MATERIA_TEMPLATE_COLUMNS).toEqual([
      'carrera',
      'materia_codigo',
      'materia_nombre',
      'anio',
      'docente',
      'dni_docente',
      'rol_en_materia',
      'estado_asignacion',
      'vigencia_desde',
      'vigencia_hasta',
      'docente_reemplazado',
      'requiere_mesa',
      'observaciones',
    ])
  })

  it('genera filas ejemplo compatibles con la plantilla', () => {
    const rows = buildDocenteMateriaTemplateRows()

    expect(rows.length).toBeGreaterThanOrEqual(6)
    expect(rows.every((row) => DOCENTE_MATERIA_TEMPLATE_COLUMNS.every((column) => column in row))).toBe(true)
  })

  it('incluye ejemplos institucionales mínimos', () => {
    const rows = buildDocenteMateriaTemplateRows()

    expect(rows).toEqual(expect.arrayContaining([
      expect.objectContaining({ rol_en_materia: 'TITULAR', estado_asignacion: 'ACTIVO', requiere_mesa: 'SI' }),
      expect.objectContaining({ rol_en_materia: 'TITULAR', estado_asignacion: 'LICENCIA' }),
      expect.objectContaining({ rol_en_materia: 'REEMPLAZO', estado_asignacion: 'ACTIVO' }),
      expect.objectContaining({ materia_nombre: 'Taller Institucional sin Mesa', requiere_mesa: 'NO' }),
      expect.objectContaining({ materia_nombre: 'Practica Profesional Docente III', rol_en_materia: 'CO_DOCENTE' }),
    ]))
  })

  it('usa solo roles validos', () => {
    const rows = buildDocenteMateriaTemplateRows()

    expect(rows.every((row) => VALID_DOCENTE_MATERIA_ROLES.has(row.rol_en_materia))).toBe(true)
  })

  it('usa solo estados validos', () => {
    const rows = buildDocenteMateriaTemplateRows()

    expect(rows.every((row) => VALID_DOCENTE_MATERIA_ESTADOS.has(row.estado_asignacion))).toBe(true)
  })

  it('puede pasar por el parser sin errores bloqueantes', () => {
    const result = parseDocenteMateriaRows(buildDocenteMateriaTemplateRows())

    expect(result.errors).toEqual([])
    expect(result.rows).toHaveLength(buildDocenteMateriaTemplateRows().length)
  })
})
