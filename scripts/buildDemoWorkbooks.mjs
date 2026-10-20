import ExcelJS from 'exceljs';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// D2: planillas de demo con datos inventados pero creibles, en el formato de public/plantillas.
// Determinista: siempre genera los mismos datos. Uso: node scripts/buildDemoWorkbooks.mjs [--salida docs/demo-data]
// Personas, DNI y emails son ficticios; los emails usan el dominio reservado .invalid (nunca reciben correo).

export const DEMO_INSTITUTION = 'Instituto Superior del Valle (demo)';
const EMAIL_DOMAIN = 'demo.invalid';

export const CAREERS = [
  { id: 'ING', name: 'PROFESORADO DE INGLES', years: 4, plan: 'ING-2023', planName: 'Plan 2023', planYear: 2023, resolution: 'Res. 2350/23', since: '2023-03-01' },
  { id: 'ENF', name: 'TECNICATURA SUPERIOR EN ENFERMERIA', years: 3, plan: 'ENF-2022', planName: 'Plan 2022', planYear: 2022, resolution: 'Res. 1180/22', since: '2022-03-01' },
];

// [codigo, nombre, anio, regimen, cuatrimestre, campo, formato]
export const SUBJECTS = {
  ING: [
    ['ING101', 'Lengua Inglesa I', 1, 'ANUAL', '', 'ESPECIFICA', 'ASIGNATURA'],
    ['ING102', 'Fonética y Fonología Inglesa I', 1, 'ANUAL', '', 'ESPECIFICA', 'ASIGNATURA'],
    ['ING103', 'Gramática Inglesa I', 1, 'ANUAL', '', 'ESPECIFICA', 'ASIGNATURA'],
    ['ING104', 'Pedagogía', 1, 'CUATRIMESTRAL', '1', 'GENERAL', 'ASIGNATURA'],
    ['ING105', 'Psicología Educacional', 1, 'CUATRIMESTRAL', '2', 'GENERAL', 'ASIGNATURA'],
    ['ING106', 'Práctica Docente I', 1, 'ANUAL', '', 'PRACTICA', 'TALLER'],
    ['ING201', 'Lengua Inglesa II', 2, 'ANUAL', '', 'ESPECIFICA', 'ASIGNATURA'],
    ['ING202', 'Fonética y Fonología Inglesa II', 2, 'ANUAL', '', 'ESPECIFICA', 'ASIGNATURA'],
    ['ING203', 'Gramática Inglesa II', 2, 'ANUAL', '', 'ESPECIFICA', 'ASIGNATURA'],
    ['ING204', 'Didáctica General', 2, 'CUATRIMESTRAL', '1', 'GENERAL', 'ASIGNATURA'],
    ['ING205', 'Literatura en Lengua Inglesa I', 2, 'CUATRIMESTRAL', '2', 'ESPECIFICA', 'ASIGNATURA'],
  ],
  ENF: [
    ['ENF101', 'Fundamentos de Enfermería', 1, 'ANUAL', '', 'ESPECIFICA', 'ASIGNATURA'],
    ['ENF102', 'Anatomía y Fisiología', 1, 'ANUAL', '', 'FUNDAMENTO', 'ASIGNATURA'],
    ['ENF103', 'Microbiología y Parasitología', 1, 'CUATRIMESTRAL', '1', 'FUNDAMENTO', 'ASIGNATURA'],
    ['ENF104', 'Salud Pública', 1, 'CUATRIMESTRAL', '2', 'GENERAL', 'ASIGNATURA'],
    ['ENF105', 'Práctica Profesionalizante I', 1, 'ANUAL', '', 'PRACTICA', 'PRACTICA'],
    ['ENF201', 'Enfermería del Adulto y el Adulto Mayor', 2, 'ANUAL', '', 'ESPECIFICA', 'ASIGNATURA'],
    ['ENF202', 'Farmacología', 2, 'CUATRIMESTRAL', '1', 'FUNDAMENTO', 'ASIGNATURA'],
    ['ENF203', 'Enfermería Materno Infantil', 2, 'ANUAL', '', 'ESPECIFICA', 'ASIGNATURA'],
    ['ENF204', 'Práctica Profesionalizante II', 2, 'ANUAL', '', 'PRACTICA', 'PRACTICA'],
  ],
};

// [materia, correlativa, tipo (cursar | rendir), requisito (regular | aprobada)]
export const PREREQUISITES = {
  ING: [['ING201', 'ING101', 'cursar', 'regular'], ['ING202', 'ING102', 'cursar', 'regular'], ['ING203', 'ING103', 'cursar', 'regular'], ['ING201', 'ING101', 'rendir', 'aprobada']],
  ENF: [['ENF201', 'ENF101', 'cursar', 'regular'], ['ENF202', 'ENF102', 'cursar', 'regular'], ['ENF204', 'ENF105', 'cursar', 'aprobada']],
};

// [id, apellido, nombre, dni, especialidad, materias que dicta (titular), dias]
export const TEACHERS = [
  ['d01', 'Ferreyra', 'Mariana Inés', '24518331', 'Profesora de Inglés', ['ING101', 'ING201'], ['Lunes', 'Miércoles']],
  ['d02', 'Quiroga', 'Esteban Javier', '27904115', 'Profesor de Inglés', ['ING102', 'ING202'], ['Martes', 'Jueves']],
  ['d03', 'Castellano', 'Lucía Beatriz', '29377462', 'Profesora de Inglés', ['ING103', 'ING203'], ['Lunes', 'Jueves']],
  ['d04', 'Benítez', 'Ricardo Omar', '22165903', 'Licenciado en Ciencias de la Educación', ['ING104', 'ING204'], ['Martes', 'Viernes']],
  ['d05', 'Olmedo', 'Graciela Noemí', '20843127', 'Licenciada en Psicopedagogía', ['ING105'], ['Miércoles']],
  ['d06', 'Sosa', 'Daniela Paola', '31260548', 'Profesora de Inglés', ['ING106'], ['Viernes']],
  ['d07', 'Medina', 'Julián Andrés', '30155790', 'Traductor Público de Inglés', ['ING205'], ['Miércoles']],
  ['d08', 'Acosta', 'Silvia Raquel', '23709884', 'Licenciada en Enfermería', ['ENF101', 'ENF201'], ['Lunes', 'Miércoles']],
  ['d09', 'Villalba', 'Héctor Daniel', '25932017', 'Médico', ['ENF102'], ['Martes']],
  ['d10', 'Paredes', 'Natalia Soledad', '32418756', 'Bioquímica', ['ENF103'], ['Jueves']],
  ['d11', 'Rojas', 'Fernando Luis', '26684302', 'Médico especialista en Salud Pública', ['ENF104'], ['Jueves']],
  ['d12', 'Juárez', 'Claudia Verónica', '28051369', 'Licenciada en Enfermería', ['ENF105', 'ENF204'], ['Viernes']],
  ['d13', 'Ledesma', 'Pablo Martín', '29810443', 'Farmacéutico', ['ENF202'], ['Martes']],
  ['d14', 'Toledo', 'Andrea Fabiana', '27155690', 'Licenciada en Obstetricia', ['ENF203'], ['Miércoles']],
];

// [id, apellido, nombre, dni, carrera, anio cursada]
export const STUDENTS = [
  ['a01', 'Gómez', 'Sofía Belén', '45120334', 'ING', 1], ['a02', 'Romero', 'Tomás Agustín', '45318902', 'ING', 1],
  ['a03', 'Díaz', 'Camila Abril', '44987215', 'ING', 1], ['a04', 'Herrera', 'Mateo Nicolás', '45602178', 'ING', 1],
  ['a05', 'Molina', 'Valentina', '44851369', 'ING', 1], ['a06', 'Ríos', 'Facundo Ezequiel', '45077421', 'ING', 1],
  ['a07', 'Suárez', 'Martina Lucía', '45233590', 'ING', 1], ['a08', 'Cabrera', 'Joaquín', '44729063', 'ING', 1],
  ['a09', 'Ortiz', 'Milagros Ayelén', '43914587', 'ING', 2], ['a10', 'Peralta', 'Lautaro Gabriel', '43650218', 'ING', 2],
  ['a11', 'Aguirre', 'Florencia', '44102736', 'ING', 2], ['a12', 'Navarro', 'Santiago Iván', '43877450', 'ING', 2],
  ['a13', 'Vega', 'Micaela Antonella', '43529961', 'ING', 2], ['a14', 'Luna', 'Agustina Rocío', '43790124', 'ING', 2],
  ['a15', 'Méndez', 'Brenda Carolina', '42988103', 'ENF', 1], ['a16', 'Ibáñez', 'Rodrigo Emanuel', '41567392', 'ENF', 1],
  ['a17', 'Godoy', 'Yamila Soledad', '44310876', 'ENF', 1], ['a18', 'Ponce', 'Gastón Hernán', '40873215', 'ENF', 1],
  ['a19', 'Figueroa', 'Rocío Daiana', '43201658', 'ENF', 1], ['a20', 'Arias', 'Melina Johana', '42660914', 'ENF', 1],
  ['a21', 'Correa', 'Lucas Matías', '42135027', 'ENF', 2], ['a22', 'Domínguez', 'Paula Andrea', '41899305', 'ENF', 2],
  ['a23', 'Carrizo', 'Jesica Noelia', '40722841', 'ENF', 2], ['a24', 'Maldonado', 'Ariel Sebastián', '42418669', 'ENF', 2],
];

const SCHEDULE_SLOTS = [['18:00', '20:00'], ['20:00', '22:00']];
const ROOMS = { ING: ['Sede Centro · Aula 3', 'Sede Centro · Aula 4', 'Sede Centro · Aula 5'], ENF: ['Anexo Salud · Aula 1', 'Anexo Salud · Laboratorio'] };

function slug(text) {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().split(/\s+/)[0];
}

export function studentEmail([, apellido, nombre]) {
  return `${slug(nombre)}.${slug(apellido)}@${EMAIL_DOMAIN}`;
}

export function teacherEmail([, apellido, nombre]) {
  return `${slug(nombre)}.${slug(apellido)}@docentes.${EMAIL_DOMAIN}`;
}

const career = (id) => CAREERS.find((item) => item.id === id);
const subjectsOf = (careerId, year) => SUBJECTS[careerId].filter((subject) => year === undefined || subject[2] === year);
const subjectById = new Map(Object.entries(SUBJECTS).flatMap(([careerId, list]) => list.map((subject) => [subject[0], { careerId, subject }])));
const teacherOf = (code) => TEACHERS.find((teacher) => teacher[5].includes(code));

// Historia de 2.o anio: notas y condiciones fijas (sin azar) para que la demo cuente siempre lo mismo.
// Cada alumno de 2.o tiene sus materias de 1.o aprobadas, salvo las que quedan regulares (para rendir en la
// mesa) y una libre (para mostrar que el portal no lo deja inscribirse).
export const HISTORY_PLAN = {
  a09: { regular: ['ING102'] }, a10: { regular: ['ING101', 'ING103'] }, a11: {}, a12: { regular: ['ING103'], libre: ['ING105'] },
  a13: { regular: ['ING101'] }, a14: {},
  a21: { regular: ['ENF102'] }, a22: {}, a23: { regular: ['ENF101', 'ENF103'] }, a24: { libre: ['ENF104'] },
};

export function historyRows() {
  const rows = [];
  STUDENTS.filter((student) => student[5] === 2).forEach((student, studentIndex) => {
    const plan = HISTORY_PLAN[student[0]] ?? {};
    subjectsOf(student[4], 1).forEach((subject, subjectIndex) => {
      const code = subject[0];
      const base = { dni: student[3], carrera: career(student[4]).name, materia_codigo: code };
      if (plan.libre?.includes(code)) rows.push({ ...base, condicion: 'libre', nota: '', fecha: '', libro: '', folio: '' });
      else if (plan.regular?.includes(code)) rows.push({ ...base, condicion: 'regular', nota: '', fecha: '28/11/2025', libro: '', folio: '' });
      else rows.push({
        ...base,
        condicion: 'aprobada',
        nota: String(4 + ((studentIndex * 3 + subjectIndex * 5) % 7)),
        fecha: subjectIndex % 2 ? '15/12/2025' : '05/12/2025',
        libro: '12',
        folio: String(40 + studentIndex * 6 + subjectIndex),
      });
    });
  });
  return rows;
}

function addSheet(workbook, name, headers, rows) {
  const sheet = workbook.addWorksheet(name);
  sheet.addRow(headers);
  sheet.getRow(1).font = { bold: true };
  for (const row of rows) sheet.addRow(headers.map((header) => row[header] ?? ''));
  sheet.columns.forEach((column) => { column.width = 18; });
  return sheet;
}

export function buildAcademicWorkbook() {
  const workbook = new ExcelJS.Workbook();
  addSheet(workbook, 'carreras_planes', ['carrera_id', 'carrera_nombre', 'duracion_anios', 'plan_id', 'plan_nombre', 'anio_plan', 'resolucion', 'estado_plan', 'vigente_desde', 'vigente_hasta', 'convive_con_plan_id', 'observaciones'],
    CAREERS.map((item) => ({ carrera_id: item.id, carrera_nombre: item.name, duracion_anios: item.years, plan_id: item.plan, plan_nombre: item.planName, anio_plan: item.planYear, resolucion: item.resolution, estado_plan: 'VIGENTE', vigente_desde: item.since })));
  addSheet(workbook, 'plan_estudios', ['plan_id', 'carrera_id', 'materia_id', 'materia_codigo', 'materia_nombre', 'grupo_afin_mesa', 'codigos_materias_afines', 'anio_cursada', 'cuatrimestre', 'regimen', 'campo_formacion', 'formato', 'requiere_mesa', 'tipo_mesa', 'orden_impresion', 'vigente_desde', 'vigente_hasta', 'observaciones'],
    CAREERS.flatMap((item) => SUBJECTS[item.id].map(([code, name, year, regimen, term, field, format], index) => ({
      plan_id: item.plan, carrera_id: item.id, materia_id: `m-${code.toLowerCase()}`, materia_codigo: code, materia_nombre: name, anio_cursada: year, cuatrimestre: term, regimen,
      campo_formacion: field, formato: format, requiere_mesa: format === 'ASIGNATURA' ? 'SI' : 'NO', tipo_mesa: format === 'ASIGNATURA' ? 'ESCRITO Y ORAL' : '', orden_impresion: index + 1,
    }))));
  addSheet(workbook, 'equivalencias_planes', ['carrera_id', 'plan_origen_id', 'materia_origen_id', 'materia_origen_codigo', 'materia_origen_nombre', 'plan_destino_id', 'materia_destino_id', 'materia_destino_codigo', 'materia_destino_nombre', 'tipo_equivalencia', 'alcance', 'requiere_resolucion', 'observaciones'], []);
  addSheet(workbook, 'correlatividades', ['plan_id', 'carrera_id', 'materia_id', 'materia_codigo', 'materia_nombre', 'correlativa_codigo', 'correlativa_id', 'correlativa_nombre', 'tipo_correlativa', 'requisito', 'observaciones'],
    CAREERS.flatMap((item) => PREREQUISITES[item.id].map(([target, required, type, condition]) => ({
      plan_id: item.plan, carrera_id: item.id, materia_id: `m-${target.toLowerCase()}`, materia_codigo: target, materia_nombre: subjectById.get(target).subject[1],
      correlativa_codigo: required, correlativa_id: `m-${required.toLowerCase()}`, correlativa_nombre: subjectById.get(required).subject[1], tipo_correlativa: type, requisito: condition,
    }))));
  addSheet(workbook, 'calendario_mesas', ['llamado_id', 'llamado', 'fecha', 'turno', 'hora_inicio', 'hora_fin', 'sede', 'capacidad_mesas', 'habilitado', 'observaciones'],
    ['2026-12-01', '2026-12-02', '2026-12-03', '2026-12-04'].map((fecha) => ({ llamado_id: 'DIC-2026-1', llamado: 'Primer llamado diciembre 2026', fecha, turno: 'NOCHE', hora_inicio: '18:00', hora_fin: '22:00', sede: 'Sede Centro', capacidad_mesas: 6, habilitado: 'SI' })));
  return workbook;
}

export function buildTeachersWorkbook() {
  const workbook = new ExcelJS.Workbook();
  addSheet(workbook, 'docentes', ['docente_id', 'apellido', 'nombre', 'dni_docente', 'email', 'telefono', 'estado_docente', 'horas_catedra', 'especialidad', 'familias_idoneidad', 'idoneidad_academica_explicita', 'turnos_disponibles', 'observaciones'],
    TEACHERS.map((teacher, index) => ({ docente_id: teacher[0], apellido: teacher[1], nombre: teacher[2], dni_docente: teacher[3], email: teacherEmail(teacher), telefono: `351 4${String(100000 + index * 7919).slice(-6)}`,
      estado_docente: 'ACTIVO', horas_catedra: teacher[5].length * 4, especialidad: teacher[4], familias_idoneidad: teacher[5][0].startsWith('ING') ? 'INGLES' : 'SALUD', turnos_disponibles: 'NOCHE' })));
  const assignments = TEACHERS.flatMap((teacher) => teacher[5].map((code) => ({ teacher, code })));
  const subjectRow = ({ teacher, code }) => {
    const { careerId, subject } = subjectById.get(code);
    return { plan_id: career(careerId).plan, carrera_id: careerId, materia_id: `m-${code.toLowerCase()}`, materia_codigo: code, materia_nombre: subject[1], anio_cursada: subject[2],
      docente_id: teacher[0], docente: `${teacher[2].split(' ')[0]} ${teacher[1]}`, dni_docente: teacher[3] };
  };
  addSheet(workbook, 'docente_materia', ['plan_id', 'carrera_id', 'materia_id', 'materia_codigo', 'materia_nombre', 'anio_cursada', 'docente_id', 'docente', 'dni_docente', 'rol_en_materia', 'estado_asignacion', 'vigencia_desde', 'vigencia_hasta', 'docente_reemplazado_id', 'docente_reemplazado', 'requiere_mesa', 'observaciones'],
    assignments.map((item) => ({ ...subjectRow(item), rol_en_materia: 'TITULAR', estado_asignacion: 'ACTIVO', vigencia_desde: '2026-03-01', requiere_mesa: subjectById.get(item.code).subject[6] === 'ASIGNATURA' ? 'SI' : 'NO' })));
  addSheet(workbook, 'horarios_docentes', ['plan_id', 'carrera_id', 'materia_id', 'materia_codigo', 'materia_nombre', 'anio_cursada', 'docente_id', 'docente', 'dni_docente', 'dia', 'hora_inicio', 'hora_fin', 'modalidad', 'sede', 'comision', 'observaciones'],
    assignments.map((item, index) => {
      const days = item.teacher[6];
      const [start, end] = SCHEDULE_SLOTS[item.teacher[5].indexOf(item.code) % SCHEDULE_SLOTS.length];
      const rooms = ROOMS[subjectById.get(item.code).careerId];
      return { ...subjectRow(item), dia: days[item.teacher[5].indexOf(item.code) % days.length], hora_inicio: start, hora_fin: end, modalidad: 'PRESENCIAL', sede: rooms[index % rooms.length], comision: 'A' };
    }));
  addSheet(workbook, 'disponibilidad_docente', ['docente_id', 'docente', 'dni_docente', 'dia', 'turno', 'hora_desde', 'hora_hasta', 'disponible_mesa', 'motivo_no_disponible', 'observaciones'],
    TEACHERS.flatMap((teacher) => teacher[6].map((dia) => ({ docente_id: teacher[0], docente: `${teacher[2].split(' ')[0]} ${teacher[1]}`, dni_docente: teacher[3], dia, turno: 'NOCHE', hora_desde: '18:00', hora_hasta: '22:00', disponible_mesa: 'SI' }))));
  return workbook;
}

export function buildStudentsWorkbook() {
  const workbook = new ExcelJS.Workbook();
  addSheet(workbook, 'alumnos_inscripciones', ['alumno_id', 'apellido', 'nombre', 'dni', 'email', 'telefono', 'carrera_id', 'plan_id', 'cohorte', 'anio_ingreso', 'anio_cursada', 'estado_academico', 'materia_id', 'materia_codigo', 'materia_nombre', 'condicion', 'regularidad_vigente', 'fecha_regularidad', 'observaciones'],
    STUDENTS.flatMap((student, index) => {
      const item = career(student[4]);
      const cohort = 2027 - student[5];
      return subjectsOf(student[4], student[5]).map(([code, name]) => ({
        alumno_id: student[0], apellido: student[1], nombre: student[2], dni: student[3], email: studentEmail(student), telefono: `351 6${String(200000 + index * 6151).slice(-6)}`,
        carrera_id: item.id, plan_id: item.plan, cohorte: cohort, anio_ingreso: cohort, anio_cursada: student[5], estado_academico: 'ACTIVO',
        materia_id: `m-${code.toLowerCase()}`, materia_codigo: code, materia_nombre: name, condicion: 'CURSANDO',
      }));
    }));
  return workbook;
}

export function buildHistoryWorkbook() {
  const workbook = new ExcelJS.Workbook();
  addSheet(workbook, 'historia_academica', ['dni', 'carrera', 'materia_codigo', 'condicion', 'nota', 'fecha', 'libro', 'folio'], historyRows());
  return workbook;
}

export const OUTPUT_FILES = {
  'demo-academica.xlsx': buildAcademicWorkbook,
  'demo-docentes.xlsx': buildTeachersWorkbook,
  'demo-alumnos.xlsx': buildStudentsWorkbook,
  'demo-historia-academica.xlsx': buildHistoryWorkbook,
};

export async function main(argv = process.argv.slice(2)) {
  const index = argv.indexOf('--salida');
  const output = resolve(index >= 0 ? argv[index + 1] : 'docs/demo-data');
  mkdirSync(output, { recursive: true });
  for (const [file, build] of Object.entries(OUTPUT_FILES)) {
    const workbook = build();
    // Fecha fija en las propiedades: el contenido es siempre el mismo (el zip igual guarda la hora de escritura).
    workbook.created = new Date('2026-10-20T00:00:00Z');
    workbook.modified = new Date('2026-10-20T00:00:00Z');
    await workbook.xlsx.writeFile(resolve(output, file));
  }
  console.log(JSON.stringify({ institucion: DEMO_INSTITUTION, salida: output, archivos: Object.keys(OUTPUT_FILES), docentes: TEACHERS.length, alumnos: STUDENTS.length, historia: historyRows().length }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
