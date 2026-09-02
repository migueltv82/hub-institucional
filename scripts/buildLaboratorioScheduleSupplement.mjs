import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import ExcelJS from 'exceljs'

const outputDir = path.join('local-audit', 'laboratorio-horarios-2026-1c')
const academicXlsxPath = path.join(outputDir, 'laboratorio_planes_2015_2024.xlsx')
const teachersXlsxPath = path.join(outputDir, 'laboratorio_docentes_horarios_2015_2024_2026_1c.xlsx')
const legacyTeachersXlsxPath = path.join(outputDir, 'laboratorio_docentes_2026_1c.xlsx')

const careerId = 'LAB'
const careerName = 'TECNICO SUP EN LABORATORIO'

const slots = {
  1: ['18:20', '19:00'],
  2: ['19:00', '19:40'],
  3: ['19:40', '20:20'],
  4: ['20:30', '21:10'],
  5: ['21:10', '21:50'],
  6: ['21:55', '22:35'],
  7: ['22:35', '23:10'],
}

const carrerasPlanesColumns = [
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
]

const planEstudiosColumns = [
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
]

const equivalenciasColumns = [
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
]

const correlatividadesColumns = [
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
]

const docenteColumns = [
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
]

const docenteMateriaColumns = [
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
]

const horarioColumns = [
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
]

const resumenColumns = [
  'docente_id',
  'docente',
  'dni_docente',
  'materia_visible',
  'anio_cursada',
  'horas_catedra',
  'fuente',
  'observaciones',
]

const complementariosColumns = [
  'materia_visible',
  'anio_cursada',
  'docente_id',
  'docente',
  'dni_docente',
  'dia',
  'hora_inicio',
  'hora_fin',
  'horas_catedra',
  'observaciones',
]

const revisionColumns = ['tipo', 'referencia', 'detalle', 'accion_sugerida']

const plans = {
  '2015': {
    plan_id: 'LAB-2015',
    plan_nombre: 'Plan 2015',
    anio_plan: '2015',
    rows: [
      [1, 1, 'Cultura, Comunicacion y Trabajo'],
      [2, 1, 'Fisica'],
      [3, 1, 'Higiene y Bioseguridad'],
      [4, 1, 'Biologia e Histologia'],
      [5, 1, 'Quimica General e Inorganica'],
      [6, 1, 'Quimica Organica'],
      [7, 1, 'Informatica'],
      [8, 1, 'Taller de Laboratorio'],
      [9, 2, 'Quimica Analitica'],
      [10, 2, 'Quimica Biologica'],
      [11, 2, 'Metodologia de la Investigacion'],
      [12, 2, 'Anatomia y Fisiologia Humana'],
      [13, 2, 'Estadistica'],
      [14, 2, 'Ingles'],
      [15, 2, 'Relaciones Humanas'],
      [16, 2, 'Organizacion y Gestion de Instituciones de Salud'],
      [17, 2, 'Practica Profesionalizante I'],
      [18, 3, 'Etica y Deontologia Profesional'],
      [19, 3, 'Salud Publica'],
      [20, 3, 'Bioquimica Clinica e Inmunologia'],
      [21, 3, 'Hematologia y Hemostasia'],
      [22, 3, 'Microbiologia'],
      [23, 3, 'Bioquimica Especial'],
      [24, 3, 'Practica Profesionalizante II'],
    ],
  },
  '2024': {
    plan_id: 'LAB-2024',
    plan_nombre: 'Plan 2024',
    anio_plan: '2024',
    rows: [
      [1, 1, 'Tecnicas de Oratoria y Produccion Textual'],
      [2, 1, 'Fisica Aplicada'],
      [3, 1, 'Higiene y Bioseguridad Aplicada'],
      [4, 1, 'Biologia e Histologia'],
      [5, 1, 'Quimica'],
      [6, 1, 'Fundamento de Laboratorio'],
      [7, 1, 'Informatica'],
      [8, 1, 'Practicas Profesionalizantes I'],
      [9, 2, 'Quimica Analitica'],
      [10, 2, 'Quimica Biologica'],
      [11, 2, 'Metodologia de la Investigacion'],
      [12, 2, 'Anatomia y Fisiologia Humana'],
      [13, 2, 'Bioestadistica'],
      [14, 2, 'Ingles Tecnico'],
      [15, 2, 'Relaciones Humanas'],
      [16, 2, 'Organizacion y Gestion de Instituciones de Salud'],
      [17, 2, 'Practica Profesionalizante II'],
      [18, 3, 'Etica Profesional'],
      [19, 3, 'Salud Publica'],
      [20, 3, 'Bioquimica Clinica e Inmunologia'],
      [21, 3, 'Hematologia y Hemostasia'],
      [22, 3, 'Microbiologia'],
      [23, 3, 'Bioquimica Especial'],
      [24, 3, 'Practica Profesionalizante III'],
    ],
  },
}

const teachers = {
  'ALVAREZ ANA MARIA': { docente_id: '148d7f02-1791-4b52-b158-06f29259c292', apellido: 'ALVAREZ', nombre: 'Ana Maria', dni_docente: '17860791' },
  'BACA CAROLINA': { docente_id: 'lab-baca-carolina', apellido: 'BACA', nombre: 'Carolina', dni_docente: '' },
  'BILAVCIK CARLOS': { docente_id: 'lab-bilavcik-carlos', apellido: 'BILAVCIK', nombre: 'Carlos', dni_docente: '' },
  'CUELLO DIEGO': { docente_id: '259b5051-9f85-491d-a0ce-57d50501ab18', apellido: 'CUELLO', nombre: 'Diego', dni_docente: '27961864' },
  'FLORES SILVIA': { docente_id: 'lab-flores-silvia', apellido: 'FLORES', nombre: 'Silvia', dni_docente: '' },
  'GONZALEZ MARIA LAURA': { docente_id: 'lab-gonzalez-maria-laura', apellido: 'GONZALEZ', nombre: 'Maria Laura', dni_docente: '' },
  'GRUEV PABLO': { docente_id: 'lab-gruev-pablo', apellido: 'GRUEV', nombre: 'Pablo', dni_docente: '' },
  'KAMEL LORENA': { docente_id: 'ada85d57-7c7e-4531-a381-1c2bdd336d2b', apellido: 'KAMEL', nombre: 'Lorena', dni_docente: '26782015' },
  'LUNA MARTIN': { docente_id: 'lab-luna-martin', apellido: 'LUNA', nombre: 'Martin', dni_docente: '' },
  'OROZCO ELIZABETH': { docente_id: 'bbf0ba09-46a4-467e-a843-21806430a5af', apellido: 'OROZCO', nombre: 'Elizabeth', dni_docente: '32110882' },
  'ORRILLO PATRICIO': { docente_id: 'd758ccba-3df7-4d58-9a17-f4029c7c2a7f', apellido: 'ORRILLO', nombre: 'Patricio', dni_docente: '30758923' },
  'PIAZZA MIGUEL': { docente_id: 'b98717b3-a970-4da2-999d-d32bff2a0884', apellido: 'PIAZZA', nombre: 'Miguel', dni_docente: '21337810' },
  'PRADO JOSE MARIA': { docente_id: 'c4a5e6b2-eda9-4a53-b595-cdb8d0ed75ac', apellido: 'PRADO', nombre: 'Jose Maria', dni_docente: '34873439' },
}

function fullName(teacher) {
  return [teacher.apellido, teacher.nombre].filter(Boolean).join(' ')
}

function subjectFor(planKey, order) {
  const plan = plans[planKey]
  const row = plan.rows.find(([subjectOrder]) => subjectOrder === order)
  if (!row) throw new Error(`No existe materia ${order} en plan ${planKey}`)
  const [subjectOrder, year, name] = row
  return {
    plan_id: plan.plan_id,
    carrera_id: careerId,
    materia_id: `${plan.plan_id}-${String(subjectOrder).padStart(2, '0')}`,
    materia_codigo: `LAB${planKey}-${String(subjectOrder).padStart(2, '0')}`,
    materia_nombre: name,
    anio_cursada: String(year),
    orden_impresion: String(subjectOrder),
  }
}

const planSubjectRows = Object.entries(plans).flatMap(([planKey, plan]) => plan.rows.map(([order, year, name]) => ({
  plan_id: plan.plan_id,
  carrera_id: careerId,
  materia_id: `${plan.plan_id}-${String(order).padStart(2, '0')}`,
  materia_codigo: `LAB${planKey}-${String(order).padStart(2, '0')}`,
  materia_nombre: name,
  grupo_afin_mesa: '',
  codigos_materias_afines: '',
  anio_cursada: String(year),
  cuatrimestre: '',
  regimen: 'ANUAL',
  campo_formacion: '',
  formato: 'MATERIA',
  requiere_mesa: 'SI',
  tipo_mesa: 'REGULAR',
  orden_impresion: String(order),
  vigente_desde: `${planKey}-03-01`,
  vigente_hasta: '',
  observaciones: `Transcripto desde imagen PLAN ${planKey}.`,
})))

const equivalenceOrders = [
  [1, 1],
  [2, 2],
  [3, 3],
  [4, 4],
  [5, 5],
  [7, 7],
  [8, 6],
  [9, 9],
  [10, 10],
  [11, 11],
  [12, 12],
  [13, 13],
  [14, 14],
  [15, 15],
  [16, 16],
  [17, 17],
  [18, 18],
  [19, 19],
  [20, 20],
  [21, 21],
  [22, 22],
  [23, 23],
  [24, 24],
]

const equivalenciasRows = equivalenceOrders.map(([order2015, order2024]) => {
  const source = subjectFor('2015', order2015)
  const target = subjectFor('2024', order2024)
  return {
    carrera_id: careerId,
    plan_origen_id: source.plan_id,
    materia_origen_id: source.materia_id,
    materia_origen_codigo: source.materia_codigo,
    materia_origen_nombre: source.materia_nombre,
    plan_destino_id: target.plan_id,
    materia_destino_id: target.materia_id,
    materia_destino_codigo: target.materia_codigo,
    materia_destino_nombre: target.materia_nombre,
    tipo_equivalencia: 'TOTAL',
    alcance: 'Misma materia operativa entre planes',
    requiere_resolucion: 'NO',
    observaciones: 'Mismos docentes y horarios segun indicacion institucional.',
  }
})

const carrerasPlanesRows = Object.values(plans).map((plan) => ({
  carrera_id: careerId,
  carrera_nombre: careerName,
  duracion_anios: '3',
  plan_id: plan.plan_id,
  plan_nombre: plan.plan_nombre,
  anio_plan: plan.anio_plan,
  resolucion: '',
  estado_plan: plan.plan_id === 'LAB-2024' ? 'VIGENTE' : 'CONVIVIENTE',
  vigente_desde: `${plan.anio_plan}-03-01`,
  vigente_hasta: '',
  convive_con_plan_id: plan.plan_id === 'LAB-2024' ? 'LAB-2015' : 'LAB-2024',
  observaciones: 'Planes cargados desde imagenes PLAN 2015 y PLAN 2024.',
}))

const events = []
const complementaryEvents = []
const revisionRows = [
  {
    tipo: 'materia_sin_horario_en_imagen',
    referencia: 'Plan 2015 materia 6 / Planes 2015 y 2024 materia 14',
    detalle: 'Quimica Organica e Ingles/Ingles Tecnico no aparecen en los horarios LABO 1, LABO 2 y LABO 3 compartidos.',
    accion_sugerida: 'Completar docente y horario desde otra fuente si esas materias se dictan en este cuatrimestre.',
  },
]

function slotRange(startSlot, endSlot) {
  return {
    hora_inicio: slots[startSlot][0],
    hora_fin: slots[endSlot][1],
    horas_catedra: endSlot - startSlot + 1,
  }
}

function addEvent({ label, day, startSlot, endSlot, teacherKey, planOrders, observations = '' }) {
  const teacher = teachers[teacherKey]
  if (!teacher) throw new Error(`Docente no definido: ${teacherKey}`)
  events.push({
    label,
    day,
    startSlot,
    endSlot,
    teacherKey,
    planOrders,
    observations,
  })
}

function addComplementary({ label, year, day, startSlot, endSlot, teacherKey, observations = '' }) {
  const range = slotRange(startSlot, endSlot)
  const teacher = teachers[teacherKey]
  complementaryEvents.push({
    materia_visible: label,
    anio_cursada: String(year),
    docente_id: teacher?.docente_id ?? '',
    docente: teacher ? fullName(teacher) : '',
    dni_docente: teacher?.dni_docente ?? '',
    dia: day,
    hora_inicio: range.hora_inicio,
    hora_fin: range.hora_fin,
    horas_catedra: String(range.horas_catedra),
    observaciones: observations,
  })
  if (!teacher) {
    revisionRows.push({
      tipo: 'horario_complementario_sin_docente',
      referencia: `${label} ${day} ${range.hora_inicio}-${range.hora_fin}`,
      detalle: 'No se pudo leer el docente desde la imagen.',
      accion_sugerida: 'Completar docente si este bloque debe usarse como disponibilidad.',
    })
  }
}

addEvent({ label: 'Fisica/Fisica Aplicada', day: 'LUNES', startSlot: 1, endSlot: 2, teacherKey: 'PIAZZA MIGUEL', planOrders: { 2015: 2, 2024: 2 } })
addEvent({ label: 'Cultura/Oratoria', day: 'LUNES', startSlot: 3, endSlot: 4, teacherKey: 'OROZCO ELIZABETH', planOrders: { 2015: 1, 2024: 1 } })
addEvent({ label: 'Higiene y Bioseguridad', day: 'LUNES', startSlot: 5, endSlot: 7, teacherKey: 'GONZALEZ MARIA LAURA', planOrders: { 2015: 3, 2024: 3 } })
addEvent({ label: 'Quimica', day: 'MARTES', startSlot: 1, endSlot: 3, teacherKey: 'BACA CAROLINA', planOrders: { 2015: 5, 2024: 5 } })
addEvent({ label: 'Practicas Profesionalizantes I', day: 'MARTES', startSlot: 4, endSlot: 6, teacherKey: 'FLORES SILVIA', planOrders: { 2024: 8 } })
addEvent({ label: 'Informatica', day: 'MIERCOLES', startSlot: 1, endSlot: 3, teacherKey: 'ALVAREZ ANA MARIA', planOrders: { 2015: 7, 2024: 7 } })
addEvent({ label: 'Quimica', day: 'MIERCOLES', startSlot: 4, endSlot: 6, teacherKey: 'BACA CAROLINA', planOrders: { 2015: 5, 2024: 5 } })
addEvent({ label: 'Biologia e Histologia', day: 'JUEVES', startSlot: 1, endSlot: 2, teacherKey: 'CUELLO DIEGO', planOrders: { 2015: 4, 2024: 4 } })
addComplementary({ label: 'Taller de Fortalecimiento en Ciencias Biologicas', year: 1, day: 'JUEVES', startSlot: 3, endSlot: 4, teacherKey: 'CUELLO DIEGO', observations: 'Bloque complementario visible en horario; no es materia de plan.' })
addEvent({ label: 'Practicas Profesionalizantes I', day: 'JUEVES', startSlot: 5, endSlot: 6, teacherKey: 'FLORES SILVIA', planOrders: { 2024: 8 } })
addEvent({ label: 'Taller/Fundamento de Laboratorio', day: 'JUEVES', startSlot: 7, endSlot: 7, teacherKey: 'FLORES SILVIA', planOrders: { 2015: 8, 2024: 6 } })
addEvent({ label: 'Fisica/Fisica Aplicada', day: 'VIERNES', startSlot: 1, endSlot: 2, teacherKey: 'PIAZZA MIGUEL', planOrders: { 2015: 2, 2024: 2 } })
addEvent({ label: 'Taller/Fundamento de Laboratorio', day: 'VIERNES', startSlot: 3, endSlot: 3, teacherKey: 'FLORES SILVIA', planOrders: { 2015: 8, 2024: 6 } })
addEvent({ label: 'Biologia e Histologia', day: 'VIERNES', startSlot: 4, endSlot: 5, teacherKey: 'CUELLO DIEGO', planOrders: { 2015: 4, 2024: 4 } })

addEvent({ label: 'Organizacion y Gestion de Instituciones de Salud', day: 'LUNES', startSlot: 1, endSlot: 2, teacherKey: 'GONZALEZ MARIA LAURA', planOrders: { 2015: 16, 2024: 16 } })
addEvent({ label: 'Relaciones Humanas', day: 'LUNES', startSlot: 3, endSlot: 4, teacherKey: 'KAMEL LORENA', planOrders: { 2015: 15, 2024: 15 } })
addEvent({ label: 'Quimica Biologica', day: 'LUNES', startSlot: 7, endSlot: 7, teacherKey: 'ORRILLO PATRICIO', planOrders: { 2015: 10, 2024: 10 } })
addEvent({ label: 'Practica Profesionalizante I/II', day: 'MARTES', startSlot: 1, endSlot: 2, teacherKey: 'LUNA MARTIN', planOrders: { 2015: 17, 2024: 17 } })
addEvent({ label: 'Quimica Biologica', day: 'MARTES', startSlot: 3, endSlot: 6, teacherKey: 'ORRILLO PATRICIO', planOrders: { 2015: 10, 2024: 10 } })
addEvent({ label: 'Estadistica/Bioestadistica', day: 'MARTES', startSlot: 7, endSlot: 7, teacherKey: 'PRADO JOSE MARIA', planOrders: { 2015: 13, 2024: 13 } })
addEvent({ label: 'Quimica Analitica', day: 'MIERCOLES', startSlot: 1, endSlot: 2, teacherKey: 'ORRILLO PATRICIO', planOrders: { 2015: 9, 2024: 9 } })
addEvent({ label: 'Practica Profesionalizante I/II', day: 'MIERCOLES', startSlot: 3, endSlot: 6, teacherKey: 'LUNA MARTIN', planOrders: { 2015: 17, 2024: 17 } })
addEvent({ label: 'Organizacion y Gestion de Instituciones de Salud', day: 'MIERCOLES', startSlot: 7, endSlot: 7, teacherKey: 'GONZALEZ MARIA LAURA', planOrders: { 2015: 16, 2024: 16 } })
addEvent({ label: 'Quimica Analitica', day: 'JUEVES', startSlot: 1, endSlot: 2, teacherKey: 'ORRILLO PATRICIO', planOrders: { 2015: 9, 2024: 9 } })
addEvent({ label: 'Anatomia y Fisiologia Humana', day: 'JUEVES', startSlot: 3, endSlot: 4, teacherKey: 'BILAVCIK CARLOS', planOrders: { 2015: 12, 2024: 12 } })
addComplementary({ label: 'Taller de Fortalecimiento Laboratorio Industrial e Investigacion', year: 2, day: 'JUEVES', startSlot: 5, endSlot: 6, teacherKey: 'ORRILLO PATRICIO', observations: 'Bloque complementario visible en horario; no es materia de plan.' })
addEvent({ label: 'Relaciones Humanas', day: 'JUEVES', startSlot: 7, endSlot: 7, teacherKey: 'KAMEL LORENA', planOrders: { 2015: 15, 2024: 15 } })
addEvent({ label: 'Estadistica/Bioestadistica', day: 'VIERNES', startSlot: 1, endSlot: 2, teacherKey: 'PRADO JOSE MARIA', planOrders: { 2015: 13, 2024: 13 }, observations: 'En la imagen figura Cardozo Rodrigo entre parentesis.' })
addEvent({ label: 'Metodologia de la Investigacion', day: 'VIERNES', startSlot: 3, endSlot: 4, teacherKey: 'PRADO JOSE MARIA', planOrders: { 2015: 11, 2024: 11 }, observations: 'En la imagen figura Cuello Diego entre parentesis.' })
addEvent({ label: 'Anatomia y Fisiologia Humana', day: 'VIERNES', startSlot: 5, endSlot: 6, teacherKey: 'BILAVCIK CARLOS', planOrders: { 2015: 12, 2024: 12 } })
addEvent({ label: 'Quimica Analitica', day: 'VIERNES', startSlot: 7, endSlot: 7, teacherKey: 'ORRILLO PATRICIO', planOrders: { 2015: 9, 2024: 9 } })

addEvent({ label: 'Bioquimica Clinica e Inmunologia', day: 'LUNES', startSlot: 1, endSlot: 2, teacherKey: 'BACA CAROLINA', planOrders: { 2015: 20, 2024: 20 } })
addEvent({ label: 'Salud Publica', day: 'LUNES', startSlot: 3, endSlot: 4, teacherKey: 'GONZALEZ MARIA LAURA', planOrders: { 2015: 19, 2024: 19 } })
addEvent({ label: 'Etica Profesional', day: 'LUNES', startSlot: 5, endSlot: 7, teacherKey: 'GRUEV PABLO', planOrders: { 2015: 18, 2024: 18 }, observations: 'El ultimo bloque amarillo no muestra apellido completo; se asume continuidad de Etica Profesional.' })
addEvent({ label: 'Practica Profesionalizante II/III', day: 'MARTES', startSlot: 1, endSlot: 3, teacherKey: 'FLORES SILVIA', planOrders: { 2015: 24, 2024: 24 } })
addEvent({ label: 'Bioquimica Especial', day: 'MARTES', startSlot: 4, endSlot: 4, teacherKey: 'LUNA MARTIN', planOrders: { 2015: 23, 2024: 23 } })
addComplementary({ label: 'Taller de Fortalecimiento Laboratorio Clinico y Medicina Regenerativa', year: 3, day: 'MARTES', startSlot: 5, endSlot: 6, teacherKey: '', observations: 'No se lee docente en la imagen.' })
addEvent({ label: 'Microbiologia', day: 'MARTES', startSlot: 7, endSlot: 7, teacherKey: 'LUNA MARTIN', planOrders: { 2015: 22, 2024: 22 } })
addEvent({ label: 'Bioquimica Clinica e Inmunologia', day: 'MIERCOLES', startSlot: 1, endSlot: 3, teacherKey: 'BACA CAROLINA', planOrders: { 2015: 20, 2024: 20 } })
addEvent({ label: 'Practica Profesionalizante II/III', day: 'MIERCOLES', startSlot: 4, endSlot: 6, teacherKey: 'FLORES SILVIA', planOrders: { 2015: 24, 2024: 24 } })
addEvent({ label: 'Bioquimica Especial', day: 'MIERCOLES', startSlot: 7, endSlot: 7, teacherKey: 'LUNA MARTIN', planOrders: { 2015: 23, 2024: 23 } })
addEvent({ label: 'Practica Profesionalizante II/III', day: 'JUEVES', startSlot: 1, endSlot: 3, teacherKey: 'FLORES SILVIA', planOrders: { 2015: 24, 2024: 24 } })
addEvent({ label: 'Microbiologia', day: 'JUEVES', startSlot: 4, endSlot: 6, teacherKey: 'LUNA MARTIN', planOrders: { 2015: 22, 2024: 22 } })
addEvent({ label: 'Salud Publica', day: 'JUEVES', startSlot: 7, endSlot: 7, teacherKey: 'GONZALEZ MARIA LAURA', planOrders: { 2015: 19, 2024: 19 } })
addEvent({ label: 'Hematologia y Hemostasia', day: 'VIERNES', startSlot: 1, endSlot: 3, teacherKey: 'BILAVCIK CARLOS', planOrders: { 2015: 21, 2024: 21 } })
addEvent({ label: 'Practica Profesionalizante II/III', day: 'VIERNES', startSlot: 4, endSlot: 6, teacherKey: 'FLORES SILVIA', planOrders: { 2015: 24, 2024: 24 } })

const horarioRows = []
for (const event of events) {
  const range = slotRange(event.startSlot, event.endSlot)
  const teacher = teachers[event.teacherKey]
  for (const [planKey, order] of Object.entries(event.planOrders)) {
    const subject = subjectFor(planKey, order)
    horarioRows.push({
      plan_id: subject.plan_id,
      carrera_id: subject.carrera_id,
      materia_id: subject.materia_id,
      materia_codigo: subject.materia_codigo,
      materia_nombre: subject.materia_nombre,
      anio_cursada: subject.anio_cursada,
      docente_id: teacher.docente_id,
      docente: fullName(teacher),
      dni_docente: teacher.dni_docente,
      dia: event.day,
      hora_inicio: range.hora_inicio,
      hora_fin: range.hora_fin,
      modalidad: 'PRESENCIAL',
      sede: 'SAN MIGUEL',
      comision: `${subject.anio_cursada} ANIO`,
      observaciones: [event.label, event.observations].filter(Boolean).join(' - '),
      horas_catedra: range.horas_catedra,
    })
  }
}

const docenteMateriaByKey = new Map()
for (const row of horarioRows) {
  const key = `${row.plan_id}::${row.materia_id}::${row.docente_id}`
  if (docenteMateriaByKey.has(key)) continue
  docenteMateriaByKey.set(key, {
    plan_id: row.plan_id,
    carrera_id: row.carrera_id,
    materia_id: row.materia_id,
    materia_codigo: row.materia_codigo,
    materia_nombre: row.materia_nombre,
    anio_cursada: row.anio_cursada,
    docente_id: row.docente_id,
    docente: row.docente,
    dni_docente: row.dni_docente,
    rol_en_materia: 'TITULAR',
    estado_asignacion: 'ACTIVO',
    vigencia_desde: '2026-03-01',
    vigencia_hasta: '',
    docente_reemplazado_id: '',
    docente_reemplazado: '',
    requiere_mesa: 'SI',
    observaciones: 'Mismo docente y horario para ambos planes cuando aplica.',
  })
}

const docenteMateriaRows = [...docenteMateriaByKey.values()]

const physicalHoursByTeacher = new Map()
const physicalHoursByTeacherSubject = new Map()
for (const event of events) {
  const teacher = teachers[event.teacherKey]
  const range = slotRange(event.startSlot, event.endSlot)
  physicalHoursByTeacher.set(teacher.docente_id, (physicalHoursByTeacher.get(teacher.docente_id) ?? 0) + range.horas_catedra)
  const key = `${teacher.docente_id}::${event.label}`
  const current = physicalHoursByTeacherSubject.get(key) ?? {
    docente_id: teacher.docente_id,
    docente: fullName(teacher),
    dni_docente: teacher.dni_docente,
    materia_visible: event.label,
    anio_cursada: '',
    horas_catedra: 0,
    fuente: 'Imagenes LABO 1, LABO 2 y LABO 3',
    observaciones: '',
  }
  current.horas_catedra += range.horas_catedra
  physicalHoursByTeacherSubject.set(key, current)
}

for (const row of complementaryEvents) {
  if (!row.docente_id) continue
  const hours = Number(row.horas_catedra || 0)
  physicalHoursByTeacher.set(row.docente_id, (physicalHoursByTeacher.get(row.docente_id) ?? 0) + hours)
  const key = `${row.docente_id}::${row.materia_visible}`
  const current = physicalHoursByTeacherSubject.get(key) ?? {
    docente_id: row.docente_id,
    docente: row.docente,
    dni_docente: row.dni_docente,
    materia_visible: row.materia_visible,
    anio_cursada: row.anio_cursada,
    horas_catedra: 0,
    fuente: 'Imagenes LABO 1, LABO 2 y LABO 3',
    observaciones: row.observaciones,
  }
  current.horas_catedra += hours
  physicalHoursByTeacherSubject.set(key, current)
}

const docentesRows = Object.values(teachers)
  .filter((teacher) => physicalHoursByTeacher.has(teacher.docente_id))
  .map((teacher) => ({
    docente_id: teacher.docente_id,
    apellido: teacher.apellido,
    nombre: teacher.nombre,
    dni_docente: teacher.dni_docente,
    email: '',
    telefono: '',
    estado_docente: 'ACTIVO',
    horas_catedra: String(physicalHoursByTeacher.get(teacher.docente_id) ?? 0),
    especialidad: 'LABORATORIO',
    familias_idoneidad: 'LABORATORIO',
    idoneidad_academica_explicita: 'SI',
    turnos_disponibles: 'NOCHE',
    observaciones: teacher.dni_docente ? 'Detectado en padron local y horario Laboratorio.' : 'Detectado en horario Laboratorio; DNI pendiente de completar.',
  }))

revisionRows.push({
  tipo: 'docentes_sin_dni_en_padron_local',
  referencia: 'Laboratorio 2026 1C',
  detalle: docentesRows.filter((row) => !row.dni_docente).map((row) => `${row.apellido} ${row.nombre}`).join('; '),
  accion_sugerida: 'Completar DNI/telefono/email desde la planilla institucional si existen.',
})

revisionRows.push({
  tipo: 'criterio_planes',
  referencia: 'PLAN 2015 / PLAN 2024',
  detalle: 'Se replicaron docentes y horarios entre planes segun equivalencia por materia operativa. Los cambios de nombre quedan separados por plan.',
  accion_sugerida: 'Revisar equivalencias_planes.csv si alguna materia no debe considerarse equivalente.',
})

const cargaResumenRows = [...physicalHoursByTeacherSubject.values()].map((row) => ({
  ...row,
  horas_catedra: String(row.horas_catedra),
}))

function stripInternal(row) {
  const { horas_catedra: _horas, ...publicRow } = row
  return publicRow
}

function escapeCsvCell(value) {
  const text = String(value ?? '')
  if (!/[",\r\n;]/.test(text)) return text
  return `"${text.replaceAll('"', '""')}"`
}

function writeCsvRows(columns, rows) {
  return [
    columns.join(','),
    ...rows.map((row) => columns.map((column) => escapeCsvCell(row[column])).join(',')),
  ].join('\n')
}

function addWorksheet(workbook, name, columns, rows) {
  const sheet = workbook.addWorksheet(name)
  sheet.columns = columns.map((header) => ({
    header,
    key: header,
    width: Math.min(Math.max(header.length + 4, 14), 46),
  }))
  rows.forEach((row) => sheet.addRow(row))
  sheet.getRow(1).font = { bold: true }
  sheet.views = [{ state: 'frozen', ySplit: 1 }]
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: columns.length },
  }
}

async function writeWorkbook(filePath, sheets) {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'Codex'
  workbook.created = new Date()
  workbook.modified = new Date()
  for (const sheet of sheets) addWorksheet(workbook, sheet.name, sheet.columns, sheet.rows)
  await workbook.xlsx.writeFile(filePath)
}

async function main() {
  await mkdir(outputDir, { recursive: true })

  await writeWorkbook(academicXlsxPath, [
    { name: 'carreras_planes', columns: carrerasPlanesColumns, rows: carrerasPlanesRows },
    { name: 'plan_estudios', columns: planEstudiosColumns, rows: planSubjectRows },
    { name: 'correlatividades', columns: correlatividadesColumns, rows: [] },
    { name: 'equivalencias_planes', columns: equivalenciasColumns, rows: equivalenciasRows },
    { name: 'revision_manual', columns: revisionColumns, rows: revisionRows },
  ])

  const teacherSheets = [
    { name: 'docentes', columns: docenteColumns, rows: docentesRows },
    { name: 'docente_materia', columns: docenteMateriaColumns, rows: docenteMateriaRows },
    { name: 'horarios_docentes', columns: horarioColumns, rows: horarioRows.map(stripInternal) },
    { name: 'carga_horaria_resumen', columns: resumenColumns, rows: cargaResumenRows },
    { name: 'horarios_complementarios', columns: complementariosColumns, rows: complementaryEvents },
    { name: 'revision_manual', columns: revisionColumns, rows: revisionRows },
  ]
  await writeWorkbook(teachersXlsxPath, teacherSheets)
  await writeWorkbook(legacyTeachersXlsxPath, teacherSheets)

  await writeFile(path.join(outputDir, 'carreras_planes.csv'), writeCsvRows(carrerasPlanesColumns, carrerasPlanesRows), 'utf8')
  await writeFile(path.join(outputDir, 'plan_estudios.csv'), writeCsvRows(planEstudiosColumns, planSubjectRows), 'utf8')
  await writeFile(path.join(outputDir, 'equivalencias_planes.csv'), writeCsvRows(equivalenciasColumns, equivalenciasRows), 'utf8')
  await writeFile(path.join(outputDir, 'correlatividades.csv'), writeCsvRows(correlatividadesColumns, []), 'utf8')
  await writeFile(path.join(outputDir, 'docentes.csv'), writeCsvRows(docenteColumns, docentesRows), 'utf8')
  await writeFile(path.join(outputDir, 'docente_materia.csv'), writeCsvRows(docenteMateriaColumns, docenteMateriaRows), 'utf8')
  await writeFile(path.join(outputDir, 'horarios_docentes.csv'), writeCsvRows(horarioColumns, horarioRows.map(stripInternal)), 'utf8')
  await writeFile(path.join(outputDir, 'horarios_complementarios.csv'), writeCsvRows(complementariosColumns, complementaryEvents), 'utf8')
  await writeFile(path.join(outputDir, 'carga_horaria_resumen.csv'), writeCsvRows(resumenColumns, cargaResumenRows), 'utf8')
  await writeFile(path.join(outputDir, 'revision_manual.csv'), writeCsvRows(revisionColumns, revisionRows), 'utf8')
  await writeFile(path.join(outputDir, 'README.md'), [
    '# Laboratorio planes y horarios 2026 1C',
    '',
    'Fuente: imagenes PLAN 2015, PLAN 2024, LABO 1, LABO 2 y LABO 3 compartidas por el usuario.',
    '',
    `Maestra academica importable: ${path.basename(academicXlsxPath)}`,
    `Docentes y horarios importable: ${path.basename(teachersXlsxPath)}`,
    '',
    `Materias de plan: ${planSubjectRows.length}`,
    `Equivalencias 2015 -> 2024: ${equivalenciasRows.length}`,
    `Docentes detectados: ${docentesRows.length}`,
    `Titularidades cargadas: ${docenteMateriaRows.length}`,
    `Bloques horarios curriculares cargados: ${horarioRows.length}`,
    `Bloques complementarios para revisar: ${complementaryEvents.length}`,
    '',
    'Primero importar la maestra academica y despues la plantilla de docentes/horarios.',
    'La app conserva las demas carreras y reemplaza solo la carrera incluida en la maestra importada.',
  ].join('\n'), 'utf8')

  console.log(JSON.stringify({
    academicXlsxPath,
    teachersXlsxPath,
    legacyTeachersXlsxPath,
    planes: planSubjectRows.length,
    equivalencias: equivalenciasRows.length,
    docentes: docentesRows.length,
    docenteMateria: docenteMateriaRows.length,
    horariosDocentes: horarioRows.length,
    complementarios: complementaryEvents.length,
    revision: revisionRows.length,
  }, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
