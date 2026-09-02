import { beforeEach, describe, expect, it } from 'vitest'
import {
  clearWorkspaceData,
  createEmptyWorkspaceSnapshot,
  fetchWorkspaceSnapshot,
  mergeSubjectTeacherAssignmentsIntoSnapshot,
  normalizeWorkspaceSnapshot,
  saveWorkspaceSnapshot,
} from './workspaceSnapshot.js'

describe('workspaceSnapshot service', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('crea snapshots vacios independientes', () => {
    const first = createEmptyWorkspaceSnapshot()
    const second = createEmptyWorkspaceSnapshot()

    first.horariosDocentes.push({ profesor: 'Ana' })
    first.docenteMateria.push({ materia: 'ING1' })
    first.disponibilidadDocente.push({ docente: 'Ana', dia: 'lunes' })
    first.cargaHorariaDocente.push({ docente: 'Ana', materia: 'ING1', horasCatedra: 4 })
    first.fechasBloqueadasDocente.push({ docenteNombre: 'Ana', date: '2026-07-30' })
    first.adminReviewDecisions.push({ decisionId: 'GROUPING:g1' })
    first.adminReviewDrafts.push({ draftId: 'draft-1' })
    first.adminReviewPromotions.push({ promotionId: 'promotion-1' })
    first.adminReviewApprovalRequests.push({ requestId: 'request-1' })
    first.adminReviewSecondApprovals.push({ secondApprovalId: 'second-1' })
    first.uploadedFiles.horarios = 'horarios.xlsx'

    expect(second.horariosDocentes).toEqual([])
    expect(second.docenteMateria).toEqual([])
    expect(second.disponibilidadDocente).toEqual([])
    expect(second.cargaHorariaDocente).toEqual([])
    expect(second.fechasBloqueadasDocente).toEqual([])
    expect(second.adminReviewDecisions).toEqual([])
    expect(second.adminReviewDrafts).toEqual([])
    expect(second.adminReviewPromotions).toEqual([])
    expect(second.adminReviewApprovalRequests).toEqual([])
    expect(second.adminReviewSecondApprovals).toEqual([])
    expect(second.uploadedFiles.horarios).toBeNull()
  })

  it('normaliza payloads incompletos o invalidos', () => {
    const snapshot = normalizeWorkspaceSnapshot({
      horariosDocentes: [{ id: 'h1' }],
      docenteMateria: [{ id: 'dm1' }],
      disponibilidadDocente: [{ id: 'disp1' }],
      cargaHorariaDocente: [{ id: 'load1' }],
      fechasBloqueadasDocente: [{ id: 'block1' }],
      planesEstudio: 'no-array',
      uploadedFiles: {
        horarios: 'horarios.xlsx',
        extra: 'ignorado.xlsx',
      },
      fechaInicio: '2026-07-13',
      fechaFin: 123,
      cronograma: [{ id: 'mesa-1' }],
      requiereRegeneracion: 1,
    })

    expect(snapshot).toEqual({
      horariosDocentes: [{ id: 'h1' }],
      docenteMateria: [{ id: 'dm1' }],
      disponibilidadDocente: [{ id: 'disp1' }],
      cargaHorariaDocente: [{ id: 'load1' }],
      fechasBloqueadasDocente: [{ id: 'block1' }],
      planesEstudio: [],
      correlatividades: [],
      alumnos: [],
      docentes: [],
      students: [],
      estadoAcademico: [],
      academicStatusRows: [],
      enrollments: [],
      grades: [],
      examEnrollments: [],
      academicStatus: null,
      adminReviewDecisions: [],
      adminReviewDrafts: [],
      adminReviewPromotions: [],
      adminReviewApprovalRequests: [],
      adminReviewSecondApprovals: [],
      uploadedFiles: {
        masterWorkbook: null,
        docentesWorkbook: null,
        alumnosWorkbook: null,
        horarios: 'horarios.xlsx',
        planes: null,
        correlatividades: null,
        alumnos: null,
        docentes: null,
        docenteMateria: null,
      },
      fechaInicio: '2026-07-13',
      fechaFin: '',
      examGenerationConfig: {
        examType: 'regular',
        generationScope: {
          careers: [],
          year: '',
          applyHalfPlusOneRule: true,
          allowSameDayRelatedSubjects: true,
          respectCorrelativities: true,
        },
        regularCallRanges: {
          first: {
            start: '',
            end: '',
          },
          second: {
            start: '',
            end: '',
          },
        },
        selectedSpecialSubjectKeys: [],
      },
      cronograma: [{ id: 'mesa-1' }],
      requiereRegeneracion: true,
    })
  })

  it('incorpora titularidades remotas al snapshot aunque la carrera no tenga horarios docentes', () => {
    const snapshot = normalizeWorkspaceSnapshot({
      docentes: [{
        id: 'teacher-row-1',
        full_name: 'Ana Diaz',
        dni: '30111222',
      }],
      planesEstudio: [{
        carrera: 'TECNICO SUP EN LABORATORIO',
        materia: 'LAB05',
        nombre: 'QUIMICA GENERAL',
        anio: '1',
      }],
      horariosDocentes: [],
      docenteMateria: [],
    })

    const merged = mergeSubjectTeacherAssignmentsIntoSnapshot(snapshot, [{
      id: 'assignment-1',
      teacher_id: 'auth-user-1',
      teacher_record_id: 'teacher-row-1',
      program_id: 'TECNICO SUP EN LABORATORIO',
      subject_id: 'LAB05',
      role: 'titular',
      status: 'active',
    }])

    expect(merged.docenteMateria).toEqual([
      expect.objectContaining({
        assignment_id: 'assignment-1',
        teacher_record_id: 'teacher-row-1',
        docenteId: 'teacher-row-1',
        docente: 'Ana Diaz',
        dni_docente: '30111222',
        carrera: 'TECNICO SUP EN LABORATORIO',
        materia_codigo: 'LAB05',
        materia_nombre: 'QUIMICA GENERAL',
        rol_en_materia: 'titular',
        source: 'subject_teacher_assignments',
      }),
    ])
  })

  it('preserva decisiones administrativas del flujo experimental', async () => {
    const payload = normalizeWorkspaceSnapshot({
      adminReviewDecisions: [{
        decisionId: 'GROUPING:group-1',
        type: 'GROUPING',
        targetId: 'group-1',
        decision: 'ACCEPTED',
        reason: 'Mismo titular.',
        createdAt: '2026-07-09T12:00:00.000Z',
        updatedAt: '2026-07-09T12:01:00.000Z',
        source: 'exam_admin_review_workflow',
      }],
    })

    await saveWorkspaceSnapshot({
      institutionId: 'inst-1',
      workspaceKey: 'main',
      ownerEmail: 'admin@example.com',
      ownerUserId: 'user-1',
      payload,
      useRemote: false,
    })

    const result = await fetchWorkspaceSnapshot({
      institutionId: 'inst-1',
      workspaceKey: 'main',
      useRemote: false,
    })

    expect(result.snapshot.adminReviewDecisions).toEqual([{
      decisionId: 'GROUPING:group-1',
      type: 'GROUPING',
      targetId: 'group-1',
      decision: 'ACCEPTED',
      reason: 'Mismo titular.',
      createdAt: '2026-07-09T12:00:00.000Z',
      updatedAt: '2026-07-09T12:01:00.000Z',
      source: 'exam_admin_review_workflow',
    }])
  })

  it('preserva fechas bloqueadas docentes y mantiene snapshots antiguos compatibles', async () => {
    expect(normalizeWorkspaceSnapshot({ horariosDocentes: [] }).fechasBloqueadasDocente).toEqual([])
    const block = {
      id: 'block-1',
      docenteId: 'teacher-ana',
      docenteNombre: 'Ana Diaz',
      date: '2026-07-30',
      startTime: '',
      endTime: '',
      scope: 'FULL_DAY',
      reason: 'Otra institucion',
      source: 'manual_admin',
      status: 'ACTIVE',
      createdAt: '2026-07-11T12:00:00.000Z',
      updatedAt: '2026-07-11T12:00:00.000Z',
    }
    await saveWorkspaceSnapshot({
      institutionId: 'inst-1',
      workspaceKey: 'main',
      payload: normalizeWorkspaceSnapshot({ fechasBloqueadasDocente: [block] }),
      useRemote: false,
    })
    const result = await fetchWorkspaceSnapshot({ institutionId: 'inst-1', workspaceKey: 'main', useRemote: false })

    expect(result.snapshot.fechasBloqueadasDocente).toEqual([block])
  })

  it('preserva borradores revisados experimentales sin tocar cronograma oficial', async () => {
    const payload = normalizeWorkspaceSnapshot({
      cronograma: [{ id: 'oficial-1', confirmada: true }],
      adminReviewDecisions: [{ decisionId: 'GROUPING:group-1' }],
      adminReviewDrafts: [{
        draftId: 'draft-1',
        type: 'ADMIN_REVIEWED_SCHEDULE_DRAFT',
        status: 'REVIEW_READY',
        source: 'admin_review_workflow',
        createdAt: '2026-07-09T12:00:00.000Z',
        updatedAt: '2026-07-09T12:00:00.000Z',
        basedOn: {
          preScheduleHash: 'abc',
          decisionIds: ['GROUPING:group-1'],
          teacherSource: 'structured',
          workspaceKey: 'main',
        },
        schedule: [{ id: 'preview-1', isOfficial: false }],
        appliedDecisions: [{ decisionId: 'GROUPING:group-1' }],
        skippedDecisions: [],
        hardRuleViolations: [],
        warnings: [],
        diagnostics: { totalSchedule: 1 },
        isOfficial: false,
      }],
    })

    await saveWorkspaceSnapshot({
      institutionId: 'inst-1',
      workspaceKey: 'main',
      ownerEmail: 'admin@example.com',
      ownerUserId: 'user-1',
      payload,
      useRemote: false,
    })

    const result = await fetchWorkspaceSnapshot({
      institutionId: 'inst-1',
      workspaceKey: 'main',
      useRemote: false,
    })

    expect(result.snapshot.cronograma).toEqual([{ id: 'oficial-1', confirmada: true }])
    expect(result.snapshot.adminReviewDecisions).toEqual([{ decisionId: 'GROUPING:group-1' }])
    expect(result.snapshot.adminReviewDrafts).toHaveLength(1)
    expect(result.snapshot.adminReviewDrafts[0]).toMatchObject({
      draftId: 'draft-1',
      type: 'ADMIN_REVIEWED_SCHEDULE_DRAFT',
      isOfficial: false,
      schedule: [{ id: 'preview-1', isOfficial: false }],
    })
  })

  it('preserva promociones experimentales sin reemplazar borradores, decisiones ni cronograma oficial', async () => {
    const payload = normalizeWorkspaceSnapshot({
      cronograma: [{ id: 'oficial-1', confirmada: true }],
      adminReviewDecisions: [{ decisionId: 'TRIBUNAL_SELECTION:mesa-1::teacher-1::VOCAL' }],
      adminReviewDrafts: [{ draftId: 'draft-1', isOfficial: false }],
      adminReviewPromotions: [{
        promotionId: 'admin-review-promotion-draft-1',
        draftId: 'draft-1',
        type: 'ADMIN_REVIEWED_SCHEDULE_PROMOTION',
        status: 'PROMOTED_EXPERIMENTAL',
        source: 'admin_review_workflow',
        promotedAt: '2026-07-10T12:00:00.000Z',
        basedOn: { draftId: 'draft-1', workspaceKey: 'main' },
        schedule: [{ id: 'promoted-1', isOfficial: false, isOfficialCandidate: true }],
        appliedDecisionIds: ['TRIBUNAL_SELECTION:mesa-1::teacher-1::VOCAL'],
        skippedDecisionIds: [],
        hardRuleViolations: [],
        warnings: [],
        diagnostics: { scheduleCount: 1 },
        isOfficialCandidate: true,
        isOfficial: false,
      }],
    })

    await saveWorkspaceSnapshot({
      institutionId: 'inst-1',
      workspaceKey: 'main',
      ownerEmail: 'admin@example.com',
      ownerUserId: 'user-1',
      payload,
      useRemote: false,
    })

    const result = await fetchWorkspaceSnapshot({
      institutionId: 'inst-1',
      workspaceKey: 'main',
      useRemote: false,
    })

    expect(result.snapshot.cronograma).toEqual([{ id: 'oficial-1', confirmada: true }])
    expect(result.snapshot.adminReviewDecisions).toHaveLength(1)
    expect(result.snapshot.adminReviewDrafts).toEqual([{ draftId: 'draft-1', isOfficial: false }])
    expect(result.snapshot.adminReviewPromotions[0]).toMatchObject({
      promotionId: 'admin-review-promotion-draft-1',
      isOfficialCandidate: true,
      isOfficial: false,
      schedule: [{ id: 'promoted-1', isOfficial: false, isOfficialCandidate: true }],
    })
    expect(result.snapshot.adminReviewPromotions[0].integrity).toBeUndefined()
    expect(result.snapshot.adminReviewPromotions[0].adminActor).toBeUndefined()
  })

  it('preserva multiples eventos inmutables de promocion para el mismo borrador', async () => {
    const promotions = [1, 2].map((revisionNumber) => ({
      promotionId: `admin-review-promotion-draft-1-r${revisionNumber}`,
      draftId: 'draft-1',
      revisionNumber,
      previousPromotionId: revisionNumber === 1 ? null : 'admin-review-promotion-draft-1-r1',
      type: 'ADMIN_REVIEWED_SCHEDULE_PROMOTION',
      status: 'PROMOTED_EXPERIMENTAL',
      integrityStatus: 'VERIFIED',
      integrityVerification: {
        status: 'VERIFIED',
        verifiedAt: `2026-07-10T1${revisionNumber}:00:00.000Z`,
        workflowVersion: '1.1.0',
        mismatchFields: [],
        warnings: [],
      },
      isOfficialCandidate: true,
      isOfficial: false,
    }))
    const payload = normalizeWorkspaceSnapshot({
      cronograma: [{ id: 'oficial-1' }],
      adminReviewPromotions: promotions,
    })

    await saveWorkspaceSnapshot({
      institutionId: 'inst-1',
      workspaceKey: 'main',
      ownerEmail: 'admin@example.com',
      ownerUserId: 'user-1',
      payload,
      useRemote: false,
    })
    const result = await fetchWorkspaceSnapshot({
      institutionId: 'inst-1',
      workspaceKey: 'main',
      useRemote: false,
    })

    expect(result.snapshot.adminReviewPromotions).toEqual(promotions)
    expect(result.snapshot.cronograma).toEqual([{ id: 'oficial-1' }])
  })

  it('preserva solicitudes de aprobacion sin modificar el cronograma oficial', async () => {
    const request = {
      requestId: 'approval-request-1',
      type: 'ADMIN_REVIEW_APPROVAL_REQUEST',
      status: 'REQUESTED',
      promotionId: 'promotion-1',
      draftId: 'draft-1',
      revisionNumber: 1,
      requestedAt: '2026-07-10T15:00:00.000Z',
      requestedBy: {
        userId: 'admin-1',
        displayName: 'Admin Uno',
        email: 'admin@example.com',
        role: 'admin_instituto',
      },
      basedOn: {
        promotionIntegrityHash: 'a'.repeat(64),
        promotionWorkflowVersion: '1.1.0',
        appliedDecisionIds: ['decision-1'],
        skippedDecisionIds: [],
      },
      requiresSecondApproval: true,
      secondApproval: null,
      warnings: ['SECOND_APPROVAL_REQUIRED'],
      diagnostics: { source: 'admin_review_approval_request' },
      isOfficial: false,
    }
    const payload = normalizeWorkspaceSnapshot({
      cronograma: [{ id: 'oficial-1', confirmada: true }],
      adminReviewPromotions: [{ promotionId: 'promotion-1' }],
      adminReviewApprovalRequests: [request],
    })

    await saveWorkspaceSnapshot({
      institutionId: 'inst-1',
      workspaceKey: 'main',
      ownerEmail: 'admin@example.com',
      ownerUserId: 'user-1',
      payload,
      useRemote: false,
    })
    const result = await fetchWorkspaceSnapshot({
      institutionId: 'inst-1',
      workspaceKey: 'main',
      useRemote: false,
    })

    expect(result.snapshot.adminReviewApprovalRequests).toEqual([request])
    expect(result.snapshot.adminReviewPromotions).toEqual([{ promotionId: 'promotion-1' }])
    expect(result.snapshot.cronograma).toEqual([{ id: 'oficial-1', confirmada: true }])
  })

  it('preserva segundas aprobaciones como eventos separados y no oficiales', async () => {
    const secondApproval = {
      secondApprovalId: 'second-approval-1',
      type: 'ADMIN_REVIEW_SECOND_APPROVAL',
      status: 'SECOND_APPROVED',
      requestId: 'request-1',
      promotionId: 'promotion-1',
      draftId: 'draft-1',
      revisionNumber: 1,
      approvedAt: '2026-07-10T16:00:00.000Z',
      approvedBy: {
        userId: 'admin-2',
        displayName: 'Admin Dos',
        email: 'admin2@example.com',
        role: 'superadmin',
      },
      requestIntegrity: {
        hash: 'b'.repeat(64),
        algorithm: 'sha256',
        generatedAt: '2026-07-10T16:00:00.000Z',
        inputs: { requestCoreHash: 'c'.repeat(64), promotionHash: 'a'.repeat(64) },
      },
      basedOn: {
        requestId: 'request-1',
        requestHash: 'b'.repeat(64),
        promotionIntegrityHash: 'a'.repeat(64),
        promotionWorkflowVersion: '1.1.0',
        appliedDecisionIds: ['decision-1'],
        skippedDecisionIds: [],
      },
      warnings: ['OFFICIALIZATION_NOT_PERFORMED'],
      diagnostics: { source: 'admin_review_second_approval' },
      isOfficial: false,
    }
    const payload = normalizeWorkspaceSnapshot({
      cronograma: [{ id: 'oficial-1', confirmada: true }],
      adminReviewApprovalRequests: [{ requestId: 'request-1', status: 'REQUESTED' }],
      adminReviewSecondApprovals: [secondApproval],
    })

    await saveWorkspaceSnapshot({
      institutionId: 'inst-1',
      workspaceKey: 'main',
      ownerEmail: 'admin@example.com',
      ownerUserId: 'user-1',
      payload,
      useRemote: false,
    })
    const result = await fetchWorkspaceSnapshot({
      institutionId: 'inst-1',
      workspaceKey: 'main',
      useRemote: false,
    })

    expect(result.snapshot.adminReviewSecondApprovals).toEqual([secondApproval])
    expect(result.snapshot.adminReviewApprovalRequests).toEqual([{ requestId: 'request-1', status: 'REQUESTED' }])
    expect(result.snapshot.cronograma).toEqual([{ id: 'oficial-1', confirmada: true }])
  })

  it('guarda applyHalfPlusOneRule en la configuracion normalizada', () => {
    const snapshot = normalizeWorkspaceSnapshot({
      examGenerationConfig: {
        generationScope: {
          applyHalfPlusOneRule: false,
        },
      },
    })

    expect(snapshot.examGenerationConfig.generationScope.applyHalfPlusOneRule).toBe(false)
  })

  it('guarda allowSameDayRelatedSubjects en la configuracion normalizada', () => {
    const snapshot = normalizeWorkspaceSnapshot({
      examGenerationConfig: {
        generationScope: {
          allowSameDayRelatedSubjects: false,
        },
      },
    })

    expect(snapshot.examGenerationConfig.generationScope.allowSameDayRelatedSubjects).toBe(false)
  })

  it('guarda respectCorrelativities en la configuracion normalizada', () => {
    const snapshot = normalizeWorkspaceSnapshot({
      examGenerationConfig: {
        generationScope: {
          respectCorrelativities: false,
        },
      },
    })

    expect(snapshot.examGenerationConfig.generationScope.respectCorrelativities).toBe(false)
  })

  it('restaura ambos flags desde snapshot local', async () => {
    const payload = normalizeWorkspaceSnapshot({
      examGenerationConfig: {
        generationScope: {
          careers: ['Profesorado de Ingles'],
          year: '2',
          applyHalfPlusOneRule: false,
          allowSameDayRelatedSubjects: false,
          respectCorrelativities: false,
        },
      },
    })

    await saveWorkspaceSnapshot({
      institutionId: 'inst-1',
      workspaceKey: 'main',
      ownerEmail: 'admin@example.com',
      ownerUserId: 'user-1',
      payload,
      useRemote: false,
    })

    const result = await fetchWorkspaceSnapshot({
      institutionId: 'inst-1',
      workspaceKey: 'main',
      useRemote: false,
    })

    expect(result.snapshot.examGenerationConfig.generationScope).toMatchObject({
      careers: ['Profesorado de Ingles'],
      year: '2',
      applyHalfPlusOneRule: false,
      allowSameDayRelatedSubjects: false,
      respectCorrelativities: false,
    })
  })

  it('normaliza snapshots antiguos sin flags de generacion', () => {
    const snapshot = normalizeWorkspaceSnapshot({
      examGenerationConfig: {
        generationScope: {
          careers: ['Profesorado de Ingles'],
          year: '1',
        },
      },
    })

    expect(snapshot.examGenerationConfig.generationScope).toEqual({
      careers: ['Profesorado de Ingles'],
      year: '1',
      applyHalfPlusOneRule: true,
      allowSameDayRelatedSubjects: true,
      respectCorrelativities: true,
    })
  })

  it('guarda y recupera snapshot local cuando no usa remoto', async () => {
    const payload = normalizeWorkspaceSnapshot({
      horariosDocentes: [{ id: 'h1', profesor: 'Ana' }],
      uploadedFiles: {
        horarios: 'horarios.xlsx',
      },
      fechaInicio: '2026-07-13',
      fechaFin: '2026-07-20',
    })

    const saveResult = await saveWorkspaceSnapshot({
      institutionId: 'inst-1',
      workspaceKey: 'main',
      ownerEmail: 'admin@example.com',
      ownerUserId: 'user-1',
      payload,
      useRemote: false,
    })

    const fetchResult = await fetchWorkspaceSnapshot({
      institutionId: 'inst-1',
      workspaceKey: 'main',
      useRemote: false,
    })

    expect(saveResult.source).toBe('local')
    expect(saveResult.updatedAt).toEqual(expect.any(String))
    expect(fetchResult).toMatchObject({
      snapshot: payload,
      updatedAt: saveResult.updatedAt,
      source: 'local',
    })
  })

  it('elimina la carga local y deja un snapshot vacio', async () => {
    const payload = normalizeWorkspaceSnapshot({
      alumnos: [{ email: 'ana@example.com', carrera: 'INGLES' }],
      cronograma: [{ id: 'mesa-1' }],
      docenteMateria: [{ docente: 'Ana Diaz', materia: 'ING01' }],
      docentes: [{ full_name: 'Ana Diaz', dni: '30111222' }],
      horariosDocentes: [{ profesor: 'Ana Diaz', materia: 'ING01' }],
      planesEstudio: [{ carrera: 'INGLES', materia: 'ING01' }],
      uploadedFiles: {
        masterWorkbook: 'academica.xlsx',
        docentesWorkbook: 'docentes.xlsx',
        alumnosWorkbook: 'alumnos.xlsx',
      },
    })

    await saveWorkspaceSnapshot({
      institutionId: 'inst-1',
      workspaceKey: 'main',
      ownerEmail: 'admin@example.com',
      ownerUserId: 'user-1',
      payload,
      useRemote: false,
    })

    const result = await clearWorkspaceData({
      institutionId: 'inst-1',
      workspaceKey: 'main',
      ownerEmail: 'admin@example.com',
      ownerUserId: 'user-1',
      useRemote: false,
    })
    const fetched = await fetchWorkspaceSnapshot({
      institutionId: 'inst-1',
      workspaceKey: 'main',
      useRemote: false,
    })

    expect(result.snapshot).toEqual(createEmptyWorkspaceSnapshot())
    expect(result.cleanup).toEqual([])
    expect(fetched.snapshot).toEqual(createEmptyWorkspaceSnapshot())
  })

  it('devuelve snapshot vacio si localStorage contiene JSON invalido', async () => {
    localStorage.setItem('mesaflow.workspace:inst-1:main', '{broken')

    const result = await fetchWorkspaceSnapshot({
      institutionId: 'inst-1',
      workspaceKey: 'main',
      useRemote: false,
    })

    expect(result).toEqual({
      snapshot: createEmptyWorkspaceSnapshot(),
      updatedAt: null,
      source: 'local',
    })
  })

  it('falla si se solicita sincronizacion remota sin institucion activa', async () => {
    await expect(saveWorkspaceSnapshot({
      institutionId: null,
      workspaceKey: 'main',
      ownerEmail: 'admin@example.com',
      ownerUserId: 'user-1',
      payload: createEmptyWorkspaceSnapshot(),
      useRemote: true,
    })).rejects.toThrow('No hay una institucion activa')
  })
})
