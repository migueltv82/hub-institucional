import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import {
  FULL_ANONYMIZED_WORKSPACE_SNAPSHOT_AUDIT_FILE_NAME,
  FULL_ANONYMIZED_WORKSPACE_SNAPSHOT_AUDIT_TEXT_FILE_NAME,
  WORKSPACE_SNAPSHOT_AUDIT_FILE_NAME,
  buildFullAnonymizedWorkspaceSnapshotAuditPayload,
  buildFullWorkspaceSnapshotAuditSummary,
  buildWorkspaceSnapshotAuditPayload,
  buildWorkspaceSnapshotAuditSummary,
  copyFullAnonymizedWorkspaceSnapshotAuditPayload,
  downloadFullAnonymizedWorkspaceSnapshotAuditPayload,
  downloadFullAnonymizedWorkspaceSnapshotAuditText,
  downloadWorkspaceSnapshotAuditPayload,
  saveFullAnonymizedWorkspaceSnapshotAuditPayload,
  serializeWorkspaceSnapshotAuditPayload,
  validateFullAnonymizedWorkspaceSnapshotAuditPayload,
} from './workspaceSnapshotAuditExport.js'

function fullSnapshotFixture() {
  return {
    carreras: [{ id: 'career-real-1', nombre: 'Profesorado de Ingles' }],
    docentes: [{
      id: 'teacher-real-1',
      nombre: 'Ana',
      apellido: 'Diaz',
      email: 'ana@example.edu',
      dni: '30111222',
      telefono: '3815550000',
    }],
    alumnos: [{
      id: 'student-real-1',
      nombre: 'Juan',
      apellido: 'Perez',
      email: 'juan@example.edu',
      documento: '40111222',
      carrera: 'Profesorado de Ingles',
      materias: ['ING1'],
    }],
    planesEstudio: [
      {
        id: 'subject-real-1',
        carreraId: 'career-real-1',
        carrera: 'Profesorado de Ingles',
        materia: 'ING1',
        nombreMateria: 'Lengua Inglesa I',
        requiereMesa: true,
      },
      {
        id: 'subject-real-2',
        carreraId: 'career-real-1',
        carrera: 'Profesorado de Ingles',
        materia: 'ING2',
        nombreMateria: 'Lengua Inglesa II',
        requiereMesa: true,
      },
    ],
    correlatividades: [{
      carrera: 'Profesorado de Ingles',
      materia: 'ING2',
      nombreMateria: 'Lengua Inglesa II',
      correlativas: ['ING1'],
    }],
    cargaHorariaDocente: [{
      id: 'workload-real-1',
      teacher_record_id: 'teacher-real-1',
      docente: 'Ana Diaz',
      carrera: 'Profesorado de Ingles',
      subject_id: 'subject-real-1',
      materia: 'ING1',
      nombreMateria: 'Lengua Inglesa I',
      rol: 'TITULAR',
      titularidad: true,
      horasCatedra: 6,
      estado: 'ACTIVE',
      observaciones: 'Nota docente sensible',
    }],
    disponibilidadDocente: [{
      id: 'availability-real-1',
      teacher_record_id: 'teacher-real-1',
      docente: 'Ana Diaz',
      dia: 'lunes',
      turno: 'NOCHE',
      horaDesde: '18:00',
      horaHasta: '21:00',
      disponible: true,
      estado: 'ACTIVE',
    }],
    fechasBloqueadasDocente: [{
      id: 'blocked-real-1',
      docenteId: 'teacher-real-1',
      docenteNombre: 'Ana Diaz',
      date: '2026-07-29',
      scope: 'FULL_DAY',
      reason: 'Motivo personal sensible',
      status: 'ACTIVE',
    }],
    horariosDocentes: [{
      id: 'legacy-real-1',
      docenteId: 'teacher-real-1',
      profesor: 'Ana Diaz',
      carrera: 'Profesorado de Ingles',
      materia: 'ING1',
      nombreMateria: 'Lengua Inglesa I',
      dia: 'lunes',
    }],
    docenteMateria: [{
      id: 'assignment-real-1',
      docenteId: 'teacher-real-1',
      docente: 'Ana Diaz',
      carrera: 'Profesorado de Ingles',
      materia: 'ING1',
    }],
    examEnrollments: [{
      id: 'exam-enrollment-real-1',
      student_id: 'student-real-1',
      subject_id: 'subject-real-1',
      carrera: 'Profesorado de Ingles',
      materia: 'ING1',
      status: 'registered',
    }],
    cronograma: [{
      id: 'table-real-1',
      carrera: 'Profesorado de Ingles',
      materia: 'ING1',
      nombreMateria: 'Lengua Inglesa I',
      profesorTitularId: 'teacher-real-1',
      profesorTitular: 'Ana Diaz',
      vocales: [],
      fechaIso: '2026-07-27',
    }],
    adminReviewDecisions: [{
      decisionId: 'decision-real-1',
      type: 'TRIBUNAL_SELECTION',
      decision: 'PENDING',
      reason: 'Observacion administrativa sensible',
      metadata: {
        tableId: 'table-real-1',
        teacherId: 'teacher-real-1',
        teacherName: 'Ana Diaz',
      },
    }],
    adminReviewDrafts: [],
    adminReviewPromotions: [],
    adminReviewApprovalRequests: [],
    adminReviewSecondApprovals: [],
    examGenerationConfig: {
      examType: 'regular',
      generationScope: { careers: ['Profesorado de Ingles'] },
      regularCallRanges: { first: { start: '2026-07-27', end: '2026-07-31' } },
    },
    fechaInicio: '2026-07-27',
    fechaFin: '2026-07-31',
  }
}

describe('workspaceSnapshotAuditExport', () => {
  it('arma payload compatible con la auditoria local', () => {
    const payload = buildWorkspaceSnapshotAuditPayload({
      alumnos: [{ email: 'persona@example.com' }],
      docentes: [{ dni: '123' }],
      docenteMateria: [{ id: 'dm1', docente: 'Nombre Sensible' }],
      horariosDocentes: [{ id: 'h1' }],
      planesEstudio: [{ id: 'p1' }],
      correlatividades: [{ id: 'c1' }],
      fechaInicio: '2026-07-27',
      fechaFin: '2026-08-07',
      examType: 'regular',
      generationScope: { careers: ['Carrera A'], year: '1' },
      regularCallRanges: {
        first: { start: '2026-07-27', end: '2026-07-31' },
      },
      selectedSpecialSubjectKeys: ['subject-1'],
    })

    expect(payload).toEqual({
      alumnos: [{ email: 'persona@example.com' }],
      docentes: [{ dni: '123' }],
      docenteMateria: [{ id: 'dm1', docente: 'Nombre Sensible' }],
      horariosDocentes: [{ id: 'h1' }],
      planesEstudio: [{ id: 'p1' }],
      correlatividades: [{ id: 'c1' }],
      fechaInicio: '2026-07-27',
      fechaFin: '2026-08-07',
      examType: 'regular',
      generationScope: { careers: ['Carrera A'], year: '1' },
      regularCallRanges: {
        first: { start: '2026-07-27', end: '2026-07-31' },
      },
      selectedSpecialSubjectKeys: ['subject-1'],
    })
  })

  it('resume sin exponer datos personales', () => {
    const payload = buildWorkspaceSnapshotAuditPayload({
      alumnos: [{ email: 'persona@example.com' }],
      docentes: [{ dni: '123' }],
      docenteMateria: [{ id: 'dm1', docente: 'Nombre Sensible' }],
      horariosDocentes: [{ id: 'h1' }],
      planesEstudio: [{ id: 'p1' }, { id: 'p2' }],
      correlatividades: [{ id: 'c1' }],
      fechaInicio: '2026-07-27',
      fechaFin: '2026-08-07',
      examType: 'regular',
      generationScope: { careers: ['Carrera A'] },
    })
    const summary = buildWorkspaceSnapshotAuditSummary(payload)
    const serialized = JSON.stringify(summary)

    expect(summary).toEqual({
      alumnos: 1,
      docentes: 1,
      docenteMateria: 1,
      docenteMateriaCount: 1,
      horariosDocentes: 1,
      planesEstudio: 2,
      correlatividades: 1,
      fechaInicio: '2026-07-27',
      fechaFin: '2026-08-07',
      examType: 'regular',
      generationScope: { careers: ['Carrera A'] },
    })
    expect(serialized).not.toContain('persona@example.com')
    expect(serialized).not.toContain('123')
    expect(serialized).not.toContain('Nombre Sensible')
  })

  it('serializa y descarga con nombre local protegido', () => {
    const appendChild = vi.fn()
    const click = vi.fn()
    const remove = vi.fn()
    const anchor = {
      click,
      remove,
      set download(value) {
        this.downloadValue = value
      },
      set href(value) {
        this.hrefValue = value
      },
      set rel(value) {
        this.relValue = value
      },
    }
    const documentRef = {
      body: { appendChild },
      createElement: vi.fn(() => anchor),
    }
    const urlRef = {
      createObjectURL: vi.fn(() => 'blob:workspace'),
      revokeObjectURL: vi.fn(),
    }
    const snapshot = buildWorkspaceSnapshotAuditPayload({ alumnos: [{ id: 'a1' }] })

    expect(serializeWorkspaceSnapshotAuditPayload(snapshot)).toContain('"alumnos"')

    downloadWorkspaceSnapshotAuditPayload(snapshot, {
      documentRef,
      urlRef,
      scheduleRevoke: (callback) => callback(),
    })

    expect(documentRef.createElement).toHaveBeenCalledWith('a')
    expect(anchor.downloadValue).toBe(WORKSPACE_SNAPSHOT_AUDIT_FILE_NAME)
    expect(anchor.hrefValue).toBe('blob:workspace')
    expect(appendChild).toHaveBeenCalledWith(anchor)
    expect(click).toHaveBeenCalled()
    expect(remove).toHaveBeenCalled()
    expect(urlRef.revokeObjectURL).toHaveBeenCalledWith('blob:workspace')
  })

  it('exporta el snapshot completo sin mutar el original y elimina PII', () => {
    const original = fullSnapshotFixture()
    const before = structuredClone(original)
    const payload = buildFullAnonymizedWorkspaceSnapshotAuditPayload(original, {
      now: () => '2026-07-14T16:00:00.000Z',
    })
    const serialized = JSON.stringify(payload)

    expect(original).toEqual(before)
    expect(payload).toHaveProperty('disponibilidadDocente')
    expect(payload).toHaveProperty('cargaHorariaDocente')
    expect(payload).toHaveProperty('fechasBloqueadasDocente')
    expect(payload).toHaveProperty('adminReviewDecisions')
    expect(payload).toHaveProperty('cronograma')
    expect(serialized).not.toContain('Ana')
    expect(serialized).not.toContain('Juan')
    expect(serialized).not.toContain('@example.edu')
    expect(serialized).not.toContain('30111222')
    expect(serialized).not.toContain('3815550000')
    expect(serialized).not.toContain('Nota docente sensible')
    expect(serialized).not.toContain('Motivo personal sensible')
    expect(serialized).not.toContain('Profesorado de Ingles')
    expect(serialized).not.toContain('Lengua Inglesa I')
    expect(serialized).not.toContain('ING1')
  })

  it('mantiene aliases estables entre docentes, alumnos, materias y carreras', () => {
    const payload = buildFullAnonymizedWorkspaceSnapshotAuditPayload(fullSnapshotFixture())
    const teacher = payload.docentes[0]
    const workload = payload.cargaHorariaDocente[0]
    const availability = payload.disponibilidadDocente[0]
    const blockedDate = payload.fechasBloqueadasDocente[0]
    const table = payload.cronograma[0]

    expect(teacher).toMatchObject({ id: 'teacher-anon-001', nombre: 'DOCENTE_001' })
    expect(workload).toMatchObject({
      teacher_record_id: 'teacher-anon-001',
      docente: 'DOCENTE_001',
    })
    expect(availability.teacher_record_id).toBe('teacher-anon-001')
    expect(availability.docente).toBe('DOCENTE_001')
    expect(blockedDate.docenteId).toBe('teacher-anon-001')
    expect(blockedDate.docenteNombre).toBe('DOCENTE_001')
    expect(table.profesorTitularId).toBe('teacher-anon-001')
    expect(table.profesorTitular).toBe('DOCENTE_001')
    expect(payload.adminReviewDecisions[0].metadata.teacherName).toBe('DOCENTE_001')

    expect(payload.alumnos[0]).toMatchObject({ id: 'student-anon-001', nombre: 'ALUMNO_001' })
    expect(payload.alumnos[0].materias).toEqual([payload.planesEstudio[0].materia])
    expect(payload.examEnrollments[0].student_id).toBe('student-anon-001')
    expect(workload.materia).toBe(payload.planesEstudio[0].materia)
    expect(table.materia).toBe(payload.planesEstudio[0].materia)
    expect(payload.correlatividades[0].correlativas).toEqual([payload.planesEstudio[0].materia])
    expect(workload.carrera).toBe(payload.planesEstudio[0].carrera)
    expect(table.carrera).toBe(payload.planesEstudio[0].carrera)
    expect(payload.carreras[0]).toMatchObject({ id: 'career-anon-001', nombre: 'CARRERA_001' })
  })

  it('incluye metadata y diagnosticos seguros de las secciones exportadas', () => {
    const payload = buildFullAnonymizedWorkspaceSnapshotAuditPayload(fullSnapshotFixture())
    const summary = buildFullWorkspaceSnapshotAuditSummary(payload)
    const metadata = JSON.stringify(payload._auditExport)

    expect(payload._auditExport).toMatchObject({
      source: 'DEV_AUDIT_SNAPSHOT_EXPORT',
      mode: 'FULL_ANONYMIZED_SHADOW_AUDIT',
      anonymizationApplied: true,
      hasStructuredTeacherSource: true,
      hasLegacyTeacherSource: true,
      hasBlockedDates: true,
      hasAdminReviewEvents: true,
      hasOfficialSchedule: true,
    })
    expect(payload._auditExport.includedSections).toEqual(expect.arrayContaining([
      'planesEstudio',
      'disponibilidadDocente',
      'cargaHorariaDocente',
      'fechasBloqueadasDocente',
      'adminReviewDecisions',
      'cronograma',
    ]))
    expect(payload._auditExport.missingSections).toContain('materias')
    expect(summary.anonymizationApplied).toBe(true)
    expect(metadata).not.toContain('Profesorado de Ingles')
    expect(metadata).not.toContain('Ana Diaz')
    expect(metadata).not.toContain('@example.edu')
  })

  it('descarga el snapshot completo con el nombre esperado', () => {
    const anchor = { click: vi.fn(), remove: vi.fn() }
    const documentRef = {
      body: { appendChild: vi.fn() },
      createElement: vi.fn(() => anchor),
    }
    const urlRef = {
      createObjectURL: vi.fn(() => 'blob:full-workspace'),
      revokeObjectURL: vi.fn(),
    }

    downloadFullAnonymizedWorkspaceSnapshotAuditPayload(
      buildFullAnonymizedWorkspaceSnapshotAuditPayload(fullSnapshotFixture()),
      { documentRef, urlRef, scheduleRevoke: (callback) => callback() },
    )

    expect(anchor.download).toBe(FULL_ANONYMIZED_WORKSPACE_SNAPSHOT_AUDIT_FILE_NAME)
    expect(anchor.click).toHaveBeenCalledOnce()
  })

  it('valida serializacion, tamano, hash y secciones antes de exportar', () => {
    const payload = buildFullAnonymizedWorkspaceSnapshotAuditPayload(fullSnapshotFixture())
    const result = validateFullAnonymizedWorkspaceSnapshotAuditPayload(payload)

    expect(result.valid).toBe(true)
    expect(result.errors).toEqual([])
    expect(result.serialized).toContain('"_auditExport"')
    expect(result.diagnostics).toMatchObject({
      exportMode: 'FULL_ANONYMIZED_SHADOW_AUDIT',
      fileName: FULL_ANONYMIZED_WORKSPACE_SNAPSHOT_AUDIT_FILE_NAME,
      includedSectionsCount: expect.any(Number),
      missingSectionsCount: expect.any(Number),
      hasStructuredTeacherSource: true,
      hasLegacyTeacherSource: true,
      hasBlockedDates: true,
      hasAdminReviewEvents: true,
      hasOfficialSchedule: true,
    })
    expect(result.diagnostics.jsonSize).toBeGreaterThan(0)
    expect(result.diagnostics.hash).toMatch(/^[a-f0-9]{64}$/)
  })

  it('bloquea la descarga si el payload contiene campos sensibles', () => {
    const payload = buildFullAnonymizedWorkspaceSnapshotAuditPayload(fullSnapshotFixture())
    payload.leak = { email: 'persona@example.edu' }
    const documentRef = { body: { appendChild: vi.fn() }, createElement: vi.fn() }
    const urlRef = { createObjectURL: vi.fn(), revokeObjectURL: vi.fn() }

    const validation = validateFullAnonymizedWorkspaceSnapshotAuditPayload(payload)

    expect(validation.valid).toBe(false)
    expect(validation.errors).toContain('AUDIT_EXPORT_SENSITIVE_FIELD_DETECTED')
    expect(() => downloadFullAnonymizedWorkspaceSnapshotAuditPayload(payload, {
      documentRef,
      urlRef,
    })).toThrow('AUDIT_EXPORT_VALIDATION_FAILED')
    expect(urlRef.createObjectURL).not.toHaveBeenCalled()
  })

  it('ofrece descarga TXT con el mismo JSON anonimizado', () => {
    const payload = buildFullAnonymizedWorkspaceSnapshotAuditPayload(fullSnapshotFixture())
    const anchor = { click: vi.fn(), remove: vi.fn() }
    const documentRef = {
      body: { appendChild: vi.fn() },
      createElement: vi.fn(() => anchor),
    }
    let exportedBlob
    const urlRef = {
      createObjectURL: vi.fn((blob) => {
        exportedBlob = blob
        return 'blob:text-workspace'
      }),
      revokeObjectURL: vi.fn(),
    }

    downloadFullAnonymizedWorkspaceSnapshotAuditText(payload, {
      documentRef,
      urlRef,
      scheduleRevoke: (callback) => callback(),
    })

    expect(anchor.download).toBe(FULL_ANONYMIZED_WORKSPACE_SNAPSHOT_AUDIT_TEXT_FILE_NAME)
    expect(exportedBlob.type).toBe('text/plain;charset=utf-8')
    expect(exportedBlob.size).toBeGreaterThan(0)
    expect(anchor.click).toHaveBeenCalledOnce()
  })

  it('copia al portapapeles solo despues de validar el contenido', async () => {
    const payload = buildFullAnonymizedWorkspaceSnapshotAuditPayload(fullSnapshotFixture())
    const writeText = vi.fn().mockResolvedValue(undefined)

    const result = await copyFullAnonymizedWorkspaceSnapshotAuditPayload(payload, {
      navigatorRef: { clipboard: { writeText } },
    })

    expect(writeText).toHaveBeenCalledOnce()
    const copied = writeText.mock.calls[0][0]
    expect(copied).toContain('"anonymizationApplied": true')
    expect(copied).not.toContain('persona@example.edu')
    expect(result.copiedToClipboard).toBe(true)
  })

  it('devuelve un error estable si el portapapeles no esta disponible', async () => {
    const payload = buildFullAnonymizedWorkspaceSnapshotAuditPayload(fullSnapshotFixture())

    await expect(copyFullAnonymizedWorkspaceSnapshotAuditPayload(payload, {
      navigatorRef: {},
    })).rejects.toThrow('CLIPBOARD_EXPORT_FAILED')
  })

  it('guarda JSON con File System Access API y nombre sugerido', async () => {
    const payload = buildFullAnonymizedWorkspaceSnapshotAuditPayload(fullSnapshotFixture())
    const write = vi.fn().mockResolvedValue(undefined)
    const close = vi.fn().mockResolvedValue(undefined)
    const createWritable = vi.fn().mockResolvedValue({ write, close })
    const showSaveFilePicker = vi.fn().mockResolvedValue({ createWritable })

    const result = await saveFullAnonymizedWorkspaceSnapshotAuditPayload(payload, {
      windowRef: { showSaveFilePicker },
    })

    expect(showSaveFilePicker).toHaveBeenCalledWith(expect.objectContaining({
      suggestedName: FULL_ANONYMIZED_WORKSPACE_SNAPSHOT_AUDIT_FILE_NAME,
    }))
    expect(write).toHaveBeenCalledWith(expect.stringContaining('"_auditExport"'))
    expect(close).toHaveBeenCalledOnce()
    expect(result.savedWithFilePicker).toBe(true)
  })

  it('mantiene el exportador aislado de Supabase y de la persistencia del workspace', () => {
    const source = [
      'workspaceSnapshotAuditExport.js',
      'workspaceSnapshotAuditAnonymizer.js',
      'DevAuditSnapshotExport.jsx',
    ].map((fileName) => readFileSync(new URL(fileName, import.meta.url), 'utf8')).join('\n')

    expect(source).not.toContain('@supabase/supabase-js')
    expect(source).not.toContain('saveWorkspaceSnapshot')
    expect(source).not.toContain('workspaceSnapshot.cronograma =')
  })
})
