import {
  TEMPLATE_V2_ALLOWED_VALUES,
  TEMPLATE_V2_REQUIRED_KEYS,
  TEMPLATE_V2_UNIQUE_KEYS,
} from './templateV2ValidationRules.js'
import { buildTemplateV2PrefillRows } from './buildTemplateV2PrefillRows.js'

export const TEMPLATE_V2_LOAD_ORDER = [
  'carreras_planes',
  'docentes',
  'plan_estudios',
  'equivalencias_planes',
  'docente_materia',
  'horarios_docentes',
  'disponibilidad_docente',
  'alumnos_inscripciones',
  'correlatividades',
  'calendario_mesas',
]

const TEMPLATE_COLUMNS = Object.freeze({
  carreras_planes: [
    'carrera_id',
    'carrera_nombre',
    'duracion_anios',
    'plan_id',
    'plan_nombre',
    'anio_plan',
    'resolucion',
    'estado_plan',
    'vigente_desde',
    'vigente_hasta',
    'convive_con_plan_id',
    'observaciones',
  ],
  plan_estudios: [
    'plan_id',
    'carrera_id',
    'materia_id',
    'materia_codigo',
    'materia_nombre',
    'grupo_afin_mesa',
    'codigos_materias_afines',
    'anio_cursada',
    'cuatrimestre',
    'regimen',
    'campo_formacion',
    'formato',
    'requiere_mesa',
    'tipo_mesa',
    'orden_impresion',
    'vigente_desde',
    'vigente_hasta',
    'observaciones',
  ],
  equivalencias_planes: [
    'carrera_id',
    'plan_origen_id',
    'materia_origen_id',
    'materia_origen_codigo',
    'materia_origen_nombre',
    'plan_destino_id',
    'materia_destino_id',
    'materia_destino_codigo',
    'materia_destino_nombre',
    'tipo_equivalencia',
    'alcance',
    'requiere_resolucion',
    'observaciones',
  ],
  docentes: [
    'docente_id',
    'apellido',
    'nombre',
    'dni_docente',
    'email',
    'telefono',
    'estado_docente',
    'horas_catedra',
    'especialidad',
    'familias_idoneidad',
    'idoneidad_academica_explicita',
    'turnos_disponibles',
    'observaciones',
  ],
  docente_materia: [
    'plan_id',
    'carrera_id',
    'materia_id',
    'materia_codigo',
    'materia_nombre',
    'anio_cursada',
    'docente_id',
    'docente',
    'dni_docente',
    'rol_en_materia',
    'estado_asignacion',
    'vigencia_desde',
    'vigencia_hasta',
    'docente_reemplazado_id',
    'docente_reemplazado',
    'requiere_mesa',
    'observaciones',
  ],
  horarios_docentes: [
    'plan_id',
    'carrera_id',
    'materia_id',
    'materia_codigo',
    'materia_nombre',
    'anio_cursada',
    'docente_id',
    'docente',
    'dni_docente',
    'dia',
    'hora_inicio',
    'hora_fin',
    'modalidad',
    'sede',
    'comision',
    'observaciones',
  ],
  disponibilidad_docente: [
    'docente_id',
    'docente',
    'dni_docente',
    'dia',
    'turno',
    'hora_desde',
    'hora_hasta',
    'disponible_mesa',
    'motivo_no_disponible',
    'observaciones',
  ],
  alumnos_inscripciones: [
    'alumno_id',
    'apellido',
    'nombre',
    'dni',
    'email',
    'telefono',
    'carrera_id',
    'plan_id',
    'cohorte',
    'anio_ingreso',
    'anio_cursada',
    'estado_academico',
    'materia_id',
    'materia_codigo',
    'materia_nombre',
    'condicion',
    'regularidad_vigente',
    'fecha_regularidad',
    'observaciones',
  ],
  correlatividades: [
    'plan_id',
    'carrera_id',
    'materia_id',
    'materia_codigo',
    'materia_nombre',
    'correlativa_codigo',
    'correlativa_id',
    'correlativa_nombre',
    'tipo_correlativa',
    'requisito',
    'observaciones',
  ],
  calendario_mesas: [
    'llamado_id',
    'llamado',
    'fecha',
    'turno',
    'hora_inicio',
    'hora_fin',
    'sede',
    'capacidad_mesas',
    'habilitado',
    'observaciones',
  ],
})

const TEMPLATE_DESCRIPTIONS = Object.freeze({
  carreras_planes: 'Declara carreras, planes vigentes y convivencia operativa entre planes.',
  plan_estudios: 'Declara materias de cada plan; materia_id numerico es la clave global permanente.',
  equivalencias_planes: 'Declara equivalencias explicitas entre materias de planes distintos.',
  docentes: 'Declara docentes como entidad estable independiente de materias y horarios.',
  docente_materia: 'Declara titularidad y roles por materia; fuente institucional de titulares.',
  horarios_docentes: 'Declara horarios por materia y docente; no define titularidad.',
  disponibilidad_docente: 'Declara disponibilidad explicita para mesas cuando no alcanza con horarios.',
  alumnos_inscripciones: 'Declara desde que plan y materia rinde cada alumno.',
  correlatividades: 'Declara correlatividades por plan; nunca se comparten por nombre.',
  calendario_mesas: 'Declara fechas, turnos y capacidad de mesas habilitadas.',
})

const CRITICAL_TEMPLATES = new Set([
  'carreras_planes',
  'plan_estudios',
  'docente_materia',
  'horarios_docentes',
  'alumnos_inscripciones',
  'correlatividades',
  'calendario_mesas',
])

const TEMPLATE_ROWS = Object.freeze({
  carreras_planes: [
    {
      carrera_id: '1',
      carrera_nombre: 'Tecnicatura Superior en Laboratorio',
      duracion_anios: '3',
      plan_id: '1',
      plan_nombre: 'Plan 2015',
      anio_plan: '2015',
      resolucion: 'Resolucion ejemplo 2015',
      estado_plan: 'CONVIVIENTE',
      vigente_desde: '2015-03-01',
      vigente_hasta: '',
      convive_con_plan_id: '2',
      observaciones: 'Plan para cohortes anteriores.',
    },
    {
      carrera_id: '1',
      carrera_nombre: 'Tecnicatura Superior en Laboratorio',
      duracion_anios: '3',
      plan_id: '2',
      plan_nombre: 'Plan 2024',
      anio_plan: '2024',
      resolucion: 'Resolucion ejemplo 2024',
      estado_plan: 'VIGENTE',
      vigente_desde: '2024-03-01',
      vigente_hasta: '',
      convive_con_plan_id: '1',
      observaciones: 'Plan para nuevas cohortes.',
    },
  ],
  plan_estudios: [
    {
      plan_id: '1',
      carrera_id: '1',
      materia_id: '1',
      materia_codigo: 'LAB15-QUIM1',
      materia_nombre: 'Quimica General',
      anio_cursada: '1',
      cuatrimestre: '1',
      regimen: 'CUATRIMESTRAL',
      campo_formacion: 'Formacion especifica',
      formato: 'MATERIA',
      requiere_mesa: 'SI',
      tipo_mesa: 'REGULAR',
      orden_impresion: '10',
      vigente_desde: '2015-03-01',
      vigente_hasta: '',
      observaciones: 'Materia del Plan 2015.',
    },
    {
      plan_id: '2',
      carrera_id: '1',
      materia_id: '2',
      materia_codigo: 'LAB24-QUIM1',
      materia_nombre: 'Quimica General',
      anio_cursada: '1',
      cuatrimestre: '1',
      regimen: 'CUATRIMESTRAL',
      campo_formacion: 'Formacion especifica',
      formato: 'MATERIA',
      requiere_mesa: 'SI',
      tipo_mesa: 'REGULAR',
      orden_impresion: '10',
      vigente_desde: '2024-03-01',
      vigente_hasta: '',
      observaciones: 'Mismo nombre visible, materia_id global diferente.',
    },
    {
      plan_id: '2',
      carrera_id: '1',
      materia_id: '3',
      materia_codigo: 'LAB24-MICRO1',
      materia_nombre: 'Microbiologia',
      anio_cursada: '2',
      cuatrimestre: '1',
      regimen: 'CUATRIMESTRAL',
      campo_formacion: 'Formacion especifica',
      formato: 'LABORATORIO',
      requiere_mesa: 'SI',
      tipo_mesa: 'REGULAR',
      orden_impresion: '20',
      vigente_desde: '2024-03-01',
      vigente_hasta: '',
      observaciones: '',
    },
  ],
  equivalencias_planes: [
    {
      carrera_id: '1',
      plan_origen_id: '1',
      materia_origen_id: '1',
      materia_origen_codigo: 'LAB15-QUIM1',
      materia_origen_nombre: 'Quimica General',
      plan_destino_id: '2',
      materia_destino_id: '2',
      materia_destino_codigo: 'LAB24-QUIM1',
      materia_destino_nombre: 'Quimica General',
      tipo_equivalencia: 'TOTAL',
      alcance: 'Cursada y final',
      requiere_resolucion: 'SI',
      observaciones: 'Ejemplo: equivalencia explicita; no inferir por nombre.',
    },
  ],
  docentes: [
    {
      docente_id: '1',
      apellido: 'Perez',
      nombre: 'Ana',
      dni_docente: '00000001',
      email: 'ana.perez@example.edu',
      telefono: '',
      estado_docente: 'ACTIVO',
      horas_catedra: '6',
      especialidad: 'Quimica',
      familias_idoneidad: 'LABORATORIO',
      idoneidad_academica_explicita: 'SI',
      turnos_disponibles: 'NOCHE',
      observaciones: 'Fila ejemplo con horas catedra declaradas para mitad mas uno.',
    },
    {
      docente_id: '2',
      apellido: 'Gomez',
      nombre: 'Luis',
      dni_docente: '00000002',
      email: 'luis.gomez@example.edu',
      telefono: '',
      estado_docente: 'ACTIVO',
      horas_catedra: '4',
      especialidad: 'Microbiologia',
      familias_idoneidad: 'LABORATORIO',
      idoneidad_academica_explicita: 'SI',
      turnos_disponibles: 'NOCHE',
      observaciones: 'Fila ejemplo con idoneidad declarada para vocalias.',
    },
  ],
  docente_materia: [
    {
      plan_id: '2',
      carrera_id: '1',
      materia_id: '2',
      materia_codigo: 'LAB24-QUIM1',
      materia_nombre: 'Quimica General',
      anio_cursada: '1',
      docente_id: '1',
      docente: 'Perez Ana',
      dni_docente: '00000001',
      rol_en_materia: 'TITULAR',
      estado_asignacion: 'ACTIVO',
      vigencia_desde: '2026-03-01',
      vigencia_hasta: '',
      docente_reemplazado_id: '',
      docente_reemplazado: '',
      requiere_mesa: 'SI',
      observaciones: 'Titular declarado, no inferido desde horarios.',
    },
    {
      plan_id: '2',
      carrera_id: '1',
      materia_id: '3',
      materia_codigo: 'LAB24-MICRO1',
      materia_nombre: 'Microbiologia',
      anio_cursada: '2',
      docente_id: '2',
      docente: 'Gomez Luis',
      dni_docente: '00000002',
      rol_en_materia: 'TITULAR',
      estado_asignacion: 'ACTIVO',
      vigencia_desde: '2026-03-01',
      vigencia_hasta: '',
      docente_reemplazado_id: '',
      docente_reemplazado: '',
      requiere_mesa: 'SI',
      observaciones: '',
    },
  ],
  horarios_docentes: [
    {
      plan_id: '2',
      carrera_id: '1',
      materia_id: '2',
      materia_codigo: 'LAB24-QUIM1',
      materia_nombre: 'Quimica General',
      anio_cursada: '1',
      docente_id: '1',
      docente: 'Perez Ana',
      dni_docente: '00000001',
      dia: 'LUNES',
      hora_inicio: '18:20',
      hora_fin: '19:40',
      modalidad: 'PRESENCIAL',
      sede: 'Sede central',
      comision: 'A',
      observaciones: 'Horario de asistencia, no titularidad.',
    },
    {
      plan_id: '1',
      carrera_id: '1',
      materia_id: '1',
      materia_codigo: 'LAB15-QUIM1',
      materia_nombre: 'Quimica General',
      anio_cursada: '1',
      docente_id: '1',
      docente: 'Perez Ana',
      dni_docente: '00000001',
      dia: 'MARTES',
      hora_inicio: '19:40',
      hora_fin: '21:10',
      modalidad: 'PRESENCIAL',
      sede: 'Sede central',
      comision: 'A',
      observaciones: 'Mismo nombre visible separado por plan.',
    },
  ],
  disponibilidad_docente: [
    {
      docente_id: '1',
      docente: 'Perez Ana',
      dni_docente: '00000001',
      dia: 'LUNES',
      turno: 'NOCHE',
      hora_desde: '18:00',
      hora_hasta: '22:30',
      disponible_mesa: 'SI',
      motivo_no_disponible: '',
      observaciones: '',
    },
    {
      docente_id: '2',
      docente: 'Gomez Luis',
      dni_docente: '00000002',
      dia: 'JUEVES',
      turno: 'NOCHE',
      hora_desde: '18:00',
      hora_hasta: '22:30',
      disponible_mesa: 'SI',
      motivo_no_disponible: '',
      observaciones: '',
    },
  ],
  alumnos_inscripciones: [
    {
      alumno_id: '1',
      apellido: 'Lopez',
      nombre: 'Maria',
      dni: '10000001',
      carrera_id: '1',
      plan_id: '1',
      cohorte: '2022',
      anio_ingreso: '2022',
      estado_academico: 'ACTIVO',
      materia_id: '1',
      materia_codigo: 'LAB15-QUIM1',
      materia_nombre: 'Quimica General',
      condicion: 'REGULAR',
      regularidad_vigente: 'SI',
      fecha_regularidad: '2025-11-30',
      observaciones: 'Alumno rinde desde Plan 2015.',
    },
    {
      alumno_id: '2',
      apellido: 'Diaz',
      nombre: 'Joaquin',
      dni: '10000002',
      carrera_id: '1',
      plan_id: '2',
      cohorte: '2024',
      anio_ingreso: '2024',
      estado_academico: 'ACTIVO',
      materia_id: '2',
      materia_codigo: 'LAB24-QUIM1',
      materia_nombre: 'Quimica General',
      condicion: 'REGULAR',
      regularidad_vigente: 'SI',
      fecha_regularidad: '2026-11-30',
      observaciones: 'Alumno rinde desde Plan 2024.',
    },
  ],
  correlatividades: [
    {
      plan_id: '2',
      carrera_id: '1',
      materia_id: '3',
      materia_codigo: 'LAB24-MICRO1',
      materia_nombre: 'Microbiologia',
      correlativa_id: '2',
      correlativa_codigo: 'LAB24-QUIM1',
      correlativa_nombre: 'Quimica General',
      tipo_correlativa: 'FINAL',
      requisito: 'APROBADA',
      observaciones: 'Correlatividad dentro del Plan 2024.',
    },
    {
      plan_id: '1',
      carrera_id: '1',
      materia_id: '4',
      materia_codigo: 'LAB15-MICRO1',
      materia_nombre: 'Microbiologia',
      correlativa_id: '1',
      correlativa_codigo: 'LAB15-QUIM1',
      correlativa_nombre: 'Quimica General',
      tipo_correlativa: 'FINAL',
      requisito: 'APROBADA',
      observaciones: 'Correlatividad dentro del Plan 2015.',
    },
  ],
  calendario_mesas: [
    {
      llamado_id: 'REG-2026-07-01-NOCHE',
      llamado: 'PRIMER_LLAMADO',
      fecha: '2026-07-01',
      turno: 'NOCHE',
      hora_inicio: '18:30',
      hora_fin: '22:30',
      sede: 'Sede central',
      capacidad_mesas: '12',
      habilitado: 'SI',
      observaciones: 'Fecha ejemplo.',
    },
    {
      llamado_id: 'REG-2026-07-02-NOCHE',
      llamado: 'SEGUNDO_LLAMADO',
      fecha: '2026-07-02',
      turno: 'NOCHE',
      hora_inicio: '18:30',
      hora_fin: '22:30',
      sede: 'Sede central',
      capacidad_mesas: '12',
      habilitado: 'SI',
      observaciones: 'Fecha ejemplo.',
    },
  ],
})

function cloneArray(values = []) {
  return values.map((value) => (
    value && typeof value === 'object' ? { ...value } : value
  ))
}

function allowedValuesForTemplate(templateName) {
  const byTemplate = {
    carreras_planes: ['estado_plan'],
    plan_estudios: ['regimen', 'cuatrimestre', 'requiere_mesa'],
    docente_materia: ['rol_en_materia', 'estado_asignacion', 'requiere_mesa'],
  }

  return (byTemplate[templateName] ?? []).reduce((values, key) => {
    values[key] = cloneArray(TEMPLATE_V2_ALLOWED_VALUES[key])
    return values
  }, {})
}

function escapeCsvCell(value) {
  const text = String(value ?? '')
  if (!/[",\r\n;]/.test(text)) return text
  return `"${text.replaceAll('"', '""')}"`
}

export function rowsToTemplateCsv(columns = [], rows = []) {
  const header = columns.join(',')
  const body = rows.map((row) => (
    columns.map((column) => escapeCsvCell(row[column])).join(',')
  ))
  return [header, ...body].join('\n')
}

function buildTemplate(templateName, loadOrder, prefillRows = null) {
  const columns = cloneArray(TEMPLATE_COLUMNS[templateName])
  const rows = prefillRows ? cloneArray(prefillRows[templateName] ?? []) : cloneArray(TEMPLATE_ROWS[templateName])
  return {
    name: templateName,
    filename: `${templateName}.template.csv`,
    description: TEMPLATE_DESCRIPTIONS[templateName],
    columns,
    requiredColumns: cloneArray(TEMPLATE_V2_REQUIRED_KEYS[templateName]),
    uniqueKey: cloneArray(TEMPLATE_V2_UNIQUE_KEYS[templateName]),
    allowedValues: allowedValuesForTemplate(templateName),
    criticalForEngine: CRITICAL_TEMPLATES.has(templateName),
    recommendedLoadOrder: loadOrder,
    rows,
    csv: rowsToTemplateCsv(columns, rows),
  }
}

function buildTemplates(prefillRows = null) {
  return Object.fromEntries(
    TEMPLATE_V2_LOAD_ORDER.map((templateName, index) => [
      templateName,
      buildTemplate(templateName, index + 1, prefillRows),
    ]),
  )
}

function buildManifest(templates) {
  return {
    version: 'templates-v2',
    rule: 'Toda entidad usa un ID numerico global y permanente; los codigos y nombres son referencias visibles.',
    generatedFor: 'examEngine',
    templates: TEMPLATE_V2_LOAD_ORDER.map((templateName) => {
      const template = templates[templateName]
      return {
        name: template.name,
        filename: template.filename,
        description: template.description,
        columns: cloneArray(template.columns),
        requiredColumns: cloneArray(template.requiredColumns),
        uniqueKey: cloneArray(template.uniqueKey),
        allowedValues: template.allowedValues,
        criticalForEngine: template.criticalForEngine,
        recommendedLoadOrder: template.recommendedLoadOrder,
      }
    }),
  }
}

function buildReadme() {
  return `# Kit local de plantillas v2 para examEngine

Este kit contiene modelos CSV para preparar plantillas compatibles con el contrato v2 del nuevo examEngine.

## Regla madre

Toda materia debe identificarse internamente por \`materia_id\`, un numero global y permanente.

\`materia_codigo\` y \`materia_nombre\` son datos visibles. Pueden repetirse entre carreras, pero \`materia_id\` nunca se repite.

Los IDs se crean una sola vez y no deben renumerarse. Para corregir carrera, plan, codigo, nombre o docente, editar la hoja maestra correspondiente; las hojas relacionadas del workbook Excel actualizan sus columnas grises automaticamente a partir del ID seleccionado.

## Carreras institucionales precargadas

- TECNICO SUPERIOR EN TURISMO
- TECNICO SUPERIOR EN LABORATORIO: Plan 2015 y Plan 2024 activos
- TECNICO SUPERIOR EN TRADUCTORADO
- PROFESORADO DE INGLES
- PROFESORADO DE QUIMICA
- PROFESORADO DE GEOGRAFIA

## Laboratorio Plan 2015 y Plan 2024

Tecnicatura Superior en Laboratorio debe cargarse separando explicitamente:

- plan_id \`1\`: Plan 2015
- plan_id \`2\`: Plan 2024

Una materia con el mismo nombre en ambos planes no es la misma materia para el motor. Por ejemplo, \`Quimica General\` puede conservar los codigos visibles \`LAB15-QUIM1\` y \`LAB24-QUIM1\`, pero cada fila debe tener un \`materia_id\` numerico diferente.

Las equivalencias entre planes se declaran en \`equivalencias_planes.template.csv\`. No deben inferirse por nombre parecido.

## Rol de cada plantilla

- \`carreras_planes\`: declara carreras, planes y convivencia operativa entre planes.
- \`docentes\`: declara docentes como entidad estable.
- \`plan_estudios\`: declara materias de cada plan.
- \`equivalencias_planes\`: declara puentes explicitos entre planes.
- \`docente_materia\`: define titularidad y roles. Esta es la fuente institucional de titulares.
- \`horarios_docentes\`: declara horarios de cursada o asistencia. No define titularidad.
- \`disponibilidad_docente\`: declara disponibilidad para mesas por dia, turno y franja horaria.
- \`alumnos_inscripciones\`: indica desde que plan rinde cada alumno.
- \`correlatividades\`: declara correlatividades por plan.
- \`calendario_mesas\`: declara llamados, fechas, turnos y capacidad habilitada.

## Orden recomendado de carga

1. \`carreras_planes\`
2. \`docentes\`
3. \`plan_estudios\`
4. \`equivalencias_planes\`
5. \`docente_materia\`
6. \`horarios_docentes\`
7. \`disponibilidad_docente\`
8. \`alumnos_inscripciones\`
9. \`correlatividades\`
10. \`calendario_mesas\`

## Criterios institucionales

- No usar \`materia_nombre\` como clave unica.
- En \`plan_estudios.regimen\` elegir \`ANUAL\` o \`CUATRIMESTRAL\`. Para una materia cuatrimestral indicar \`1\` o \`2\` en \`cuatrimestre\`; para una anual dejarlo vacio.
- No mezclar planes por similitud de nombre.
- \`docente_materia\` define titularidad.
- \`docentes.horas_catedra\` define la base de mitad mas uno cuando esta declarada.
- \`horarios_docentes\` ayuda a disponibilidad y contexto, pero no decide titularidad.
- \`disponibilidad_docente\` confirma si el docente puede integrar mesas en un dia y turno.
- \`equivalencias_planes\` evita mezclar Plan 2015 y Plan 2024 por nombres parecidos.
`
}

function buildSummary(templates) {
  return {
    templatesGenerated: Object.keys(templates).length,
    templateNames: cloneArray(TEMPLATE_V2_LOAD_ORDER),
    outputDirectory: 'local-audit/templates-v2',
    includesLaboratorioPlans: true,
    laboratorioPlanIds: ['LAB-2015', 'LAB-2024'],
    rule: 'IDs numericos globales y permanentes',
  }
}

function buildWarnings(templates) {
  const warnings = []
  Object.values(templates).forEach((template) => {
    if (template.uniqueKey.length === 1 && template.uniqueKey[0] === 'materia_nombre') {
      warnings.push({
        code: 'UNIQUE_KEY_SOLO_MATERIA_NOMBRE',
        template: template.name,
        message: 'Una plantilla no debe usar materia_nombre como clave unica.',
      })
    }
  })
  return warnings
}

export function buildTemplateV2Kit(options = {}) {
  const prefillRows = options.sourceData ? buildTemplateV2PrefillRows(options.sourceData) : null
  const templates = buildTemplates(prefillRows)
  const manifest = buildManifest(templates)
  const readme = buildReadme()
  const warnings = options.includeWarnings === false ? [] : buildWarnings(templates)
  const errors = []

  return {
    templates,
    manifest,
    readme,
    summary: buildSummary(templates),
    warnings,
    errors,
  }
}
