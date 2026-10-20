import { describe, expect, it } from 'vitest'
import { parseTemplateV2MasterWorkbook, parseTemplateV2StudentsWorkbook, parseTemplateV2TeachersWorkbook } from '../src/utils/examEngine/templatesV2/importTemplateV2Workbook.js'
import { readAcademicCatalogFile } from '../src/services/academicCatalogPublish.js'
import { parseStudentHistoryWorkbook } from '../src/services/studentHistoryImport.js'
import { buildStudentEnrollmentRows, buildTeacherAssignmentRows } from '../src/services/bulkRoster.js'
import {
  buildAcademicWorkbook, buildHistoryWorkbook, buildStudentsWorkbook, buildTeachersWorkbook,
  HISTORY_PLAN, STUDENTS, SUBJECTS, TEACHERS, studentEmail, teacherEmail,
} from './buildDemoWorkbooks.mjs'

const asFile = async (workbook, name) => new File([await workbook.xlsx.writeBuffer()], name)

describe('buildDemoWorkbooks (D2)', () => {
  it('las cuatro planillas se leen con los mismos parsers que la app, sin errores', async () => {
    const master = await parseTemplateV2MasterWorkbook(await asFile(buildAcademicWorkbook(), 'demo-academica.xlsx'))
    const planesEstudio = master.datasets.planesEstudio
    expect(planesEstudio).toHaveLength(Object.values(SUBJECTS).flat().length)

    const teachers = await parseTemplateV2TeachersWorkbook(await asFile(buildTeachersWorkbook(), 'demo-docentes.xlsx'), { planesEstudio })
    expect(teachers.summary.docentes).toBe(TEACHERS.length)
    // Cada materia tiene un titular y un horario con sede (el aula por defecto de la mesa).
    expect(new Set(teachers.datasets.docenteMateria.map((row) => row.materia_codigo)).size).toBe(planesEstudio.length)
    expect(teachers.datasets.horariosDocentes.every((row) => row.sede && row.carrera && row.materia)).toBe(true)
    expect(buildTeacherAssignmentRows(teachers.datasets.docenteMateria).every((row) => row.dni && row.carrera && row.materia)).toBe(true)

    const students = await parseTemplateV2StudentsWorkbook(await asFile(buildStudentsWorkbook(), 'demo-alumnos.xlsx'), { planesEstudio })
    expect(students.summary.alumnos).toBe(STUDENTS.length)
    const enrollments = buildStudentEnrollmentRows(students.datasets.inscripcionesAlumnos)
    expect(enrollments.length).toBe(students.summary.inscripcionesAlumnos)
    expect(enrollments.every((row) => row.dni && row.carrera && row.materia)).toBe(true)

    const catalog = await readAcademicCatalogFile(await asFile(buildAcademicWorkbook(), 'demo-academica.xlsx'), { inscripcionesAlumnos: students.datasets.inscripcionesAlumnos, withPrerequisites: true })
    expect(catalog.errors).toEqual([])
    expect(catalog.warnings).toEqual([])
    expect(catalog.studentPlans).toHaveLength(STUDENTS.length)
    expect(catalog.prerequisites.length).toBeGreaterThan(0)
  })

  it('la historia es de alumnos de 2.o año: aprobadas con nota 4 a 10, algunas regulares (para la mesa) y una libre', async () => {
    const rows = await parseStudentHistoryWorkbook(await asFile(buildHistoryWorkbook(), 'demo-historia-academica.xlsx'))
    const secondYear = new Map(STUDENTS.filter((student) => student[5] === 2).map((student) => [student[3], student]))
    expect(rows.every((row) => secondYear.has(row.dni))).toBe(true)
    const byCondition = (condition) => rows.filter((row) => row.condicion === condition)
    expect(byCondition('aprobada').every((row) => Number(row.nota) >= 4 && Number(row.nota) <= 10)).toBe(true)
    const regulars = Object.values(HISTORY_PLAN).flatMap((plan) => plan.regular ?? [])
    expect(byCondition('regular')).toHaveLength(regulars.length)
    expect(byCondition('libre').length).toBeGreaterThan(0)
  })

  it('personas ficticias: DNI y emails unicos y con dominio reservado .invalid', () => {
    const dnis = [...TEACHERS.map((teacher) => teacher[3]), ...STUDENTS.map((student) => student[3])]
    expect(new Set(dnis).size).toBe(dnis.length)
    const emails = [...TEACHERS.map(teacherEmail), ...STUDENTS.map(studentEmail)]
    expect(new Set(emails).size).toBe(emails.length)
    expect(emails.every((email) => /^[a-z]+\.[a-z]+@([a-z]+\.)?demo\.invalid$/.test(email))).toBe(true)
  })
})
