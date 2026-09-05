// Mapeo puro (sin I/O): convierte filas crudas del schema relacional nuevo
// (supabase/schema/02_academic_relational_schema.sql + 04_teacher_exam_date_exclusions.sql)
// al shape que consume la Capa 2 del motor de mesas
// (src/utils/examEngine/comparison/buildRegularExamInputFromWorkspaceSnapshot.js).
//
// Trampas confirmadas leyendo esa Capa 2 -- no "obvias" desde el schema:
// - horariosDocentes sin nombre de docente resoluble se descarta entero (buildTeachers).
// - course_schedules.weekday (1=lunes..7=domingo) no coincide con la convencion interna
//   del adaptador (0=domingo estilo Date.getDay()) -- se traduce a string en español.
// - starts_at/ends_at vienen con segundos ("18:00:00"); el parser de horas del adaptador
//   no los reconoce -- hay que recortar a HH:MM.
// - teacher_subject_assignments.status='active' no lo reconoce normalizeDocenteMateriaEstado
//   (solo tokens en español) -- se traduce a 'ACTIVO'/'BAJA' explicito.
// - se agrega materia_id (el uuid de study_plan_subjects) tanto en planesEstudio como en
//   docenteMateria para que el match sea exacto por id (assignmentMatchesPlan lo prioriza
//   sobre el matching por texto carrera+codigo).

const WEEKDAY_TO_DAY_NAME = {
  1: 'lunes',
  2: 'martes',
  3: 'miercoles',
  4: 'jueves',
  5: 'viernes',
  6: 'sabado',
  7: 'domingo',
}

function clean(value) {
  return String(value ?? '').trim()
}

function truncateToHm(value) {
  const text = clean(value)
  return text ? text.slice(0, 5) : ''
}

function fullName(row = {}) {
  return clean(`${clean(row.first_name)} ${clean(row.last_name)}`)
}

function indexById(rows = []) {
  return new Map(rows.map((row) => [row.id, row]))
}

function buildPlanSubjectLookup({ studyPlanSubjects, studyPlansById, careersById, subjectsById }) {
  const lookup = new Map()

  studyPlanSubjects.forEach((row) => {
    const plan = studyPlansById.get(row.plan_id)
    const career = plan ? careersById.get(plan.career_id) : null
    const subject = subjectsById.get(row.subject_id)

    lookup.set(row.id, {
      id: row.id,
      code: subject?.code ?? '',
      name: subject?.name ?? '',
      careerId: career?.id ?? '',
      careerName: career?.name ?? '',
      yearNumber: row.year_number ?? '',
      examRequired: row.exam_required,
      examGroup: row.exam_group ?? '',
      relatedSubjectCodes: row.related_subject_codes ?? '',
    })
  })

  return lookup
}

function buildTeachers({ teacherRecords, exclusionsByTeacherId }) {
  return teacherRecords.map((row) => ({
    id: row.id,
    docenteId: row.id,
    nombre: fullName(row) || row.id,
    full_name: fullName(row) || row.id,
    dni: row.national_id ?? '',
    email: row.email ?? '',
    especialidad: row.specialty ?? '',
    activo: row.status === 'active',
    bloqueos: exclusionsByTeacherId.get(row.id) ?? [],
    ...(row.teaching_hours !== null && row.teaching_hours !== undefined
      ? { horasCatedra: row.teaching_hours }
      : {}),
  }))
}

function buildSchedules({ courseSchedules, teachersById, planSubjectLookup }) {
  return courseSchedules.map((row) => {
    const teacher = teachersById.get(row.teacher_id)
    if (!teacher) return null

    const planSubject = planSubjectLookup.get(row.plan_subject_id)
    const nombre = fullName(teacher) || teacher.id

    return {
      docenteId: row.teacher_id,
      teacherId: row.teacher_id,
      profesor: nombre,
      docente: nombre,
      materia: planSubject?.code ?? '',
      codigo: planSubject?.code ?? '',
      materia_id: row.plan_subject_id ?? '',
      nombreMateria: planSubject?.name ?? '',
      carrera: planSubject?.careerName ?? '',
      carreraId: planSubject?.careerId ?? '',
      dia: WEEKDAY_TO_DAY_NAME[row.weekday] ?? '',
      inicio: truncateToHm(row.starts_at),
      fin: truncateToHm(row.ends_at),
    }
  }).filter(Boolean)
}

function buildDocenteMateria({ teacherSubjectAssignments, teachersById, planSubjectLookup }) {
  return teacherSubjectAssignments.map((row) => {
    const teacher = teachersById.get(row.teacher_id)
    const planSubject = planSubjectLookup.get(row.plan_subject_id)

    return {
      docenteId: row.teacher_id,
      teacherId: row.teacher_id,
      docente: teacher ? fullName(teacher) || teacher.id : '',
      materia: planSubject?.code ?? '',
      codigo: planSubject?.code ?? '',
      materia_id: row.plan_subject_id ?? '',
      materia_nombre: planSubject?.name ?? '',
      nombreMateria: planSubject?.name ?? '',
      carrera: planSubject?.careerName ?? '',
      estado_asignacion: row.status === 'active' ? 'ACTIVO' : 'BAJA',
      vigencia_desde: row.valid_from ?? null,
      vigencia_hasta: row.valid_until ?? null,
      ...(row.role ? { rol_en_materia: row.role } : {}),
      ...(row.exam_required !== null && row.exam_required !== undefined
        ? { requiere_mesa: row.exam_required }
        : {}),
    }
  })
}

function buildPlanesEstudio({ studyPlanSubjects, planSubjectLookup }) {
  return studyPlanSubjects.map((row) => {
    const info = planSubjectLookup.get(row.id)

    return {
      id: row.id,
      materia_id: row.id,
      materia: info?.code ?? '',
      codigo: info?.code ?? '',
      nombreMateria: info?.name ?? '',
      carreraId: info?.careerId ?? '',
      carrera: info?.careerName ?? '',
      anio: row.year_number ?? '',
      requiereMesa: row.exam_required,
      grupo_afin_mesa: row.exam_group ?? '',
      codigos_materias_afines: row.related_subject_codes ?? '',
    }
  })
}

function buildCorrelatividades({ subjectPrerequisites, planSubjectLookup }) {
  const byTarget = new Map()

  subjectPrerequisites.filter((row) => row.status === 'active').forEach((row) => {
    const target = planSubjectLookup.get(row.target_plan_subject_id)
    const prerequisite = planSubjectLookup.get(row.prerequisite_plan_subject_id)
    if (!target || !prerequisite || !target.code || !prerequisite.code) return

    const existing = byTarget.get(row.target_plan_subject_id) ?? {
      carreraId: target.careerId,
      carrera: target.careerName,
      materia: target.code,
      codigo: target.code,
      nombreMateria: target.name,
      correlativas: new Set(),
    }
    existing.correlativas.add(prerequisite.code)
    byTarget.set(row.target_plan_subject_id, existing)
  })

  return [...byTarget.values()].map((entry) => ({
    ...entry,
    correlativas: [...entry.correlativas],
  }))
}

function buildAlumnos({ studentRecords, studentCareerPlans, careersById }) {
  const activePlansByStudent = new Map()
  studentCareerPlans
    .filter((plan) => plan.status === 'active')
    .forEach((plan) => {
      if (!activePlansByStudent.has(plan.student_id)) activePlansByStudent.set(plan.student_id, plan)
    })

  return studentRecords.map((row) => {
    const plan = activePlansByStudent.get(row.id)
    const career = plan ? careersById.get(plan.career_id) : null

    return {
      id: row.id,
      nombre: row.first_name ?? '',
      apellido: row.last_name ?? '',
      full_name: fullName(row) || row.id,
      dni: row.national_id ?? '',
      email: row.email ?? '',
      telefono: row.phone ?? '',
      estado: row.status ?? '',
      carrera: career?.name ?? '',
      anio: plan?.current_year ?? '',
      materias: [],
    }
  })
}

export function mapAcademicRelationalRowsToSnapshot(tables = {}) {
  const careers = tables.careers ?? []
  const studyPlans = tables.study_plans ?? []
  const subjects = tables.subjects ?? []
  const studyPlanSubjects = tables.study_plan_subjects ?? []
  const subjectPrerequisites = tables.subject_prerequisites ?? []
  const teacherRecords = tables.teacher_records ?? []
  const teacherSubjectAssignments = tables.teacher_subject_assignments ?? []
  const courseSchedules = tables.course_schedules ?? []
  const studentRecords = tables.student_records ?? []
  const studentCareerPlans = tables.student_career_plans ?? []
  const teacherExamDateExclusions = tables.teacher_exam_date_exclusions ?? []

  const careersById = indexById(careers)
  const studyPlansById = indexById(studyPlans)
  const subjectsById = indexById(subjects)
  const planSubjectLookup = buildPlanSubjectLookup({ studyPlanSubjects, studyPlansById, careersById, subjectsById })

  const exclusionsByTeacherId = new Map()
  teacherExamDateExclusions.forEach((row) => {
    const dates = exclusionsByTeacherId.get(row.teacher_id) ?? []
    dates.push(row.excluded_date)
    exclusionsByTeacherId.set(row.teacher_id, dates)
  })

  const docentes = buildTeachers({ teacherRecords, exclusionsByTeacherId })
  const teachersById = indexById(teacherRecords)
  const horariosDocentes = buildSchedules({ courseSchedules, teachersById, planSubjectLookup })
  const docenteMateria = buildDocenteMateria({ teacherSubjectAssignments, teachersById, planSubjectLookup })
  const planesEstudio = buildPlanesEstudio({ studyPlanSubjects, planSubjectLookup })
  const correlatividades = buildCorrelatividades({ subjectPrerequisites, planSubjectLookup })
  const alumnos = buildAlumnos({ studentRecords, studentCareerPlans, careersById })

  return {
    snapshot: {
      docentes,
      horariosDocentes,
      docenteMateria,
      planesEstudio,
      correlatividades,
      alumnos,
    },
    counts: {
      careers: careers.length,
      studyPlans: studyPlans.length,
      subjects: subjects.length,
      studyPlanSubjects: studyPlanSubjects.length,
      subjectPrerequisites: subjectPrerequisites.length,
      teacherRecords: teacherRecords.length,
      teacherSubjectAssignments: teacherSubjectAssignments.length,
      courseSchedules: courseSchedules.length,
      studentRecords: studentRecords.length,
      studentCareerPlans: studentCareerPlans.length,
      teacherExamDateExclusions: teacherExamDateExclusions.length,
    },
  }
}
