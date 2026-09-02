import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import {
  buildAdminReviewApprovalEligibility,
  buildAdminReviewSecondApprovalEligibility,
  buildTeacherExamSourceContext,
  createAdminReviewSecondApproval,
  promoteAdminReviewedDraft,
} from '../../utils/examEngine'
import ExamAdminReviewWorkflowPanel from './ExamAdminReviewWorkflowPanel.jsx'

function props(overrides = {}) {
  return {
    adminReviewDecisions: [],
    alumnos: [],
    docentes: [{ nombre: 'Ana Titular' }, { nombre: 'Bruno Vocal' }],
    disponibilidadDocente: [
      { docente: 'Ana Titular', dia: 'Lunes', turno: 'NOCHE', hora_desde: '18:00', hora_hasta: '20:00' },
      { docente: 'Bruno Vocal', dia: 'Lunes', turno: 'NOCHE', hora_desde: '18:00', hora_hasta: '20:00' },
    ],
    cargaHorariaDocente: [
      { docente: 'Ana Titular', carrera: 'Profesorado Ingles', materia_codigo: 'ING1', materia_nombre: 'Ingles I', horasCatedra: 8, rol_en_materia: 'TITULAR' },
      { docente: 'Ana Titular', carrera: 'Traductorado Ingles', materia_codigo: 'TRA1', materia_nombre: 'Ingles I', horasCatedra: 2, rol_en_materia: 'TITULAR' },
      { docente: 'Bruno Vocal', carrera: 'Profesorado Ingles', materia_codigo: 'ING2', materia_nombre: 'Ingles II', horasCatedra: 4, rol_en_materia: 'TITULAR' },
    ],
    horariosDocentes: [],
    planesEstudio: [
      { carrera: 'Profesorado Ingles', materia: 'ING1', nombreMateria: 'Ingles I', anio: 1 },
      { carrera: 'Traductorado Ingles', materia: 'TRA1', nombreMateria: 'Ingles I', anio: 1 },
      { carrera: 'Profesorado Ingles', materia: 'ING2', nombreMateria: 'Ingles II', anio: 2 },
    ],
    correlatividades: [
      { carrera: 'Profesorado Ingles', materia: 'ING2', correlativas: ['ING1'] },
    ],
    fechaInicio: '2026-07-13',
    fechaFin: '2026-07-13',
    regularCallRanges: {
      first: { start: '2026-07-13', end: '2026-07-13' },
    },
    canEditWorkspace: true,
    onAdminReviewDecisionsChange: vi.fn(),
    onAdminReviewDraftsChange: vi.fn(),
    onAdminReviewPromotionsChange: vi.fn(),
    onAdminReviewApprovalRequestsChange: vi.fn(),
    onAdminReviewSecondApprovalsChange: vi.fn(),
    env: { VITE_ENABLE_EXAM_ADMIN_REVIEW_WORKFLOW: 'true' },
    ...overrides,
  }
}

function selectedDecision({ tableId = 'pre-profesoradoingles::ing1', teacherId = 'teacher-brunovocal', teacherName = 'Bruno Vocal' } = {}) {
  return {
    decisionId: `TRIBUNAL_SELECTION:${tableId}::${teacherId}::VOCAL`,
    type: 'TRIBUNAL_SELECTION',
    targetId: `${tableId}::${teacherId}::VOCAL`,
    decision: 'SELECTED',
    reason: 'Docente seleccionado.',
    metadata: {
      tableId,
      teacherId,
      teacherName,
      role: 'VOCAL',
      date: '2026-07-13',
      shift: 'NOCHE',
      startTime: '18:00',
      endTime: '20:00',
      consumesAffectation: true,
    },
    hardRuleViolations: [],
    source: 'exam_admin_review_workflow',
    createdAt: '2026-07-09T12:00:00.000Z',
    updatedAt: '2026-07-09T12:00:00.000Z',
  }
}

function validDraft() {
  const bruno = selectedDecision()
  const carla = selectedDecision({
    teacherId: 'teacher-carlavocal',
    teacherName: 'Carla Vocal',
  })
  const decisions = [bruno, carla]

  return {
    decisions,
    draft: {
      draftId: 'admin-review-draft-ready',
      type: 'ADMIN_REVIEWED_SCHEDULE_DRAFT',
      status: 'REVIEW_READY',
      source: 'admin_review_workflow',
      basedOn: {
        preScheduleHash: 'hash-ready',
        decisionIds: decisions.map((decision) => decision.decisionId),
        teacherSource: 'structured',
        workspaceKey: 'main',
      },
      schedule: [{
        id: 'pre-profesoradoingles::ing1',
        carrera: 'Profesorado Ingles',
        materia: 'ING1',
        nombreMateria: 'Ingles I',
        titularId: 'teacher-anatitular',
        fechaIso: '2026-07-13',
        turno: 'NOCHE',
        inicio: '18:00',
        fin: '20:00',
        vocales: decisions.map((decision) => ({
          docenteId: decision.metadata.teacherId,
          docente: decision.metadata.teacherName,
          role: 'VOCAL',
          decisionId: decision.decisionId,
        })),
        isOfficial: false,
        confirmada: false,
        valid: false,
      }],
      appliedDecisions: decisions.map((decision) => ({
        decisionId: decision.decisionId,
        type: decision.type,
        decision: decision.decision,
      })),
      skippedDecisions: [],
      hardRuleViolations: [],
      warnings: [],
      diagnostics: { totalSchedule: 1 },
      isOfficial: false,
    },
  }
}

function verifiedPromotionFixture() {
  const { decisions, draft } = validDraft()
  const disponibilidadDocente = [
    { docente: 'Ana Titular', dia: 'Lunes', turno: 'NOCHE', hora_desde: '18:00', hora_hasta: '20:00' },
    { docente: 'Bruno Vocal', dia: 'Lunes', turno: 'NOCHE', hora_desde: '18:00', hora_hasta: '20:00' },
    { docente: 'Carla Vocal', dia: 'Lunes', turno: 'NOCHE', hora_desde: '18:00', hora_hasta: '20:00' },
  ]
  const cargaHorariaDocente = [
    { docente: 'Ana Titular', carrera: 'Profesorado Ingles', materia_codigo: 'ING1', materia_nombre: 'Ingles I', horasCatedra: 8, rol_en_materia: 'TITULAR' },
    { docente: 'Bruno Vocal', carrera: 'Profesorado Ingles', materia_codigo: 'ING2', materia_nombre: 'Ingles II', horasCatedra: 4, rol_en_materia: 'AUXILIAR' },
    { docente: 'Carla Vocal', carrera: 'Profesorado Ingles', materia_codigo: 'ING3', materia_nombre: 'Ingles III', horasCatedra: 4, rol_en_materia: 'AUXILIAR' },
  ]
  const teacherExamSourceContext = buildTeacherExamSourceContext({
    disponibilidadDocente,
    cargaHorariaDocente,
    horariosDocentes: [],
  })
  const promotion = promoteAdminReviewedDraft({
    draft,
    adminReviewDecisions: decisions,
    teacherExamSourceContext,
    options: {
      now: () => '2026-07-10T12:00:00.000Z',
      adminActor: {
        userId: 'admin-1',
        displayName: 'Admin Instituto',
        email: 'admin@example.com',
        role: 'admin_instituto',
      },
    },
  }).promotionRecord

  return {
    decisions,
    draft,
    promotion,
    disponibilidadDocente,
    cargaHorariaDocente,
    teacherExamSourceContext,
  }
}

function approvalRequestFixture(fixture, overrides = {}) {
  return {
    requestId: 'request-eligible',
    type: 'ADMIN_REVIEW_APPROVAL_REQUEST',
    status: 'REQUESTED',
    promotionId: fixture.promotion.promotionId,
    draftId: fixture.draft.draftId,
    revisionNumber: 1,
    requestedAt: '2026-07-10T15:00:00.000Z',
    requestedBy: {
      userId: 'requester-1',
      displayName: 'Solicitante Uno',
      email: 'requester@example.com',
      role: 'admin_instituto',
    },
    basedOn: {
      promotionIntegrityHash: fixture.promotion.integrity.hash,
      promotionWorkflowVersion: '1.1.0',
      appliedDecisionIds: fixture.promotion.appliedDecisionIds,
      skippedDecisionIds: fixture.promotion.skippedDecisionIds,
    },
    requiresSecondApproval: true,
    secondApproval: null,
    warnings: ['SECOND_APPROVAL_REQUIRED'],
    isOfficial: false,
    ...overrides,
  }
}

function finalReadinessFixture() {
  const fixture = verifiedPromotionFixture()
  const request = approvalRequestFixture(fixture)
  const currentActor = {
    userId: 'second-admin-1',
    displayName: 'Segundo Admin',
    email: 'second@example.com',
    role: 'superadmin',
  }
  const approvalEligibility = buildAdminReviewApprovalEligibility({
    promotions: [fixture.promotion],
    drafts: [fixture.draft],
    adminReviewDecisions: fixture.decisions,
    teacherExamSourceContext: fixture.teacherExamSourceContext,
  })
  const secondApprovalEligibility = buildAdminReviewSecondApprovalEligibility({
    approvalRequests: [request],
    promotions: [fixture.promotion],
    approvalEligibility,
    currentActor,
  })
  const secondApproval = createAdminReviewSecondApproval({
    approvalRequest: request,
    promotion: fixture.promotion,
    secondApprovalEligibility,
    currentActor,
    options: { now: () => '2026-07-10T16:00:00.000Z' },
  }).secondApproval
  return { ...fixture, request, secondApproval, currentActor }
}

describe('ExamAdminReviewWorkflowPanel', () => {
  it('no renderiza si la feature flag esta apagada', () => {
    render(<ExamAdminReviewWorkflowPanel {...props({
      env: { VITE_ENABLE_EXAM_ADMIN_REVIEW_WORKFLOW: 'false' },
    })} />)

    expect(screen.queryByRole('region', { name: 'Revision administrativa experimental de examenes' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Promover borrador' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Solicitar aprobacion' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Registrar segunda aprobacion' })).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Plan de oficializacion segura' })).not.toBeInTheDocument()
  })

  it('muestra precronograma titular-only, sugerencias y recomendaciones con la flag prendida', () => {
    render(<ExamAdminReviewWorkflowPanel {...props()} />)

    expect(screen.getByRole('region', { name: 'Revision administrativa experimental de examenes' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Precronograma solo con titulares' })).toBeInTheDocument()
    expect(screen.getAllByText('PENDIENTE_VOCALES').length).toBeGreaterThan(0)
    expect(screen.getByRole('region', { name: 'Sugerencias de agrupamiento administrativo' })).toBeInTheDocument()
    expect(screen.getByText('SAME_TITULAR')).toBeInTheDocument()
    const recommendations = screen.getByRole('region', { name: 'Docentes recomendados para vocales' })
    expect(recommendations).toBeInTheDocument()
    expect(within(recommendations).getByText('Bruno Vocal')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Cupos docentes del flujo experimental' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Cronograma revisado experimental' })).toBeInTheDocument()
    expect(screen.getByText(/Preview no oficial/)).toBeInTheDocument()
    const readiness = screen.getByRole('region', { name: 'Readiness final experimental' })
    expect(within(readiness).getByText('Bloqueado hasta resolver las validaciones pendientes.')).toBeInTheDocument()
    expect(within(readiness).getByText('Esto todavia no oficializa ni reemplaza el cronograma.')).toBeInTheDocument()
    const plan = screen.getByRole('region', { name: 'Plan de oficializacion segura' })
    expect(within(plan).getByText('El plan no puede prepararse con el estado actual.')).toBeInTheDocument()
    expect(within(plan).getByText('Este plan no oficializa el cronograma.')).toBeInTheDocument()
  })

  it('muestra candidato cuando el readiness final experimental esta listo', () => {
    const fixture = finalReadinessFixture()
    render(<ExamAdminReviewWorkflowPanel {...props({
      adminReviewDecisions: fixture.decisions,
      adminReviewDrafts: [fixture.draft],
      adminReviewPromotions: [fixture.promotion],
      adminReviewApprovalRequests: [fixture.request],
      adminReviewSecondApprovals: [fixture.secondApproval],
      adminActor: fixture.currentActor,
      disponibilidadDocente: fixture.disponibilidadDocente,
      cargaHorariaDocente: fixture.cargaHorariaDocente,
    })} />)

    const readiness = screen.getByRole('region', { name: 'Readiness final experimental' })
    expect(within(readiness).getByText('Listo para futura oficializacion.')).toBeInTheDocument()
    expect(within(readiness).getByRole('region', { name: 'Candidato final experimental' })).toBeInTheDocument()
    expect(within(readiness).getByText(/READY_FOR_OFFICIALIZATION/)).toBeInTheDocument()
    const plan = screen.getByRole('region', { name: 'Plan de oficializacion segura' })
    expect(within(plan).getByText('Plan tecnico preparado para validacion servidor-side.')).toBeInTheDocument()
    const technicalPlan = within(plan).getByRole('region', { name: 'Plan tecnico de oficializacion' })
    expect(within(technicalPlan).getByText(/Fingerprint actual: [a-f0-9]{64}/)).toBeInTheDocument()
    expect(within(technicalPlan).getByText(/Fingerprint propuesto: [a-f0-9]{64}/)).toBeInTheDocument()
    expect(within(technicalPlan).getByText(/AUTHORIZATION, HASH_REVERIFICATION/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /oficializar/i })).not.toBeInTheDocument()
  })

  it('permite aceptar agrupamiento valido y persiste decision en snapshot contract', () => {
    const onChange = vi.fn()
    render(<ExamAdminReviewWorkflowPanel {...props({ onAdminReviewDecisionsChange: onChange })} />)

    fireEvent.click(screen.getAllByRole('button', { name: 'Aceptar' })[0])

    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange.mock.calls[0][0][0]).toMatchObject({
      type: 'GROUPING',
      decision: 'ACCEPTED',
      source: 'exam_admin_review_workflow',
    })
    expect(screen.getByText('Agrupamiento aceptado. No se modifica el cronograma oficial.')).toBeInTheDocument()
  })

  it('bloquea aceptar agrupamiento invalido y lo mantiene pendiente', () => {
    const onChange = vi.fn()
    render(<ExamAdminReviewWorkflowPanel {...props({
      onAdminReviewDecisionsChange: onChange,
      disponibilidadDocente: [
        { docente: 'Ana Titular', dia: 'Martes', turno: 'NOCHE', hora_desde: '18:00', hora_hasta: '20:00' },
        { docente: 'Bruno Vocal', dia: 'Lunes', turno: 'NOCHE', hora_desde: '18:00', hora_hasta: '20:00' },
      ],
    })} />)

    fireEvent.click(screen.getAllByRole('button', { name: 'Aceptar' })[0])

    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange.mock.calls[0][0][0]).toMatchObject({
      decision: 'PENDING',
      reason: 'ACCEPT_BLOCKED_HARD_RULES',
      hardRuleViolations: expect.arrayContaining(['TITULAR_NOT_AVAILABLE']),
    })
    expect(screen.getByText(/Aceptacion bloqueada por reglas duras:/)).toBeInTheDocument()
  })

  it('permite rechazar agrupamiento y persiste la decision', () => {
    const onChange = vi.fn()
    render(<ExamAdminReviewWorkflowPanel {...props({ onAdminReviewDecisionsChange: onChange })} />)

    fireEvent.click(screen.getAllByRole('button', { name: 'Rechazar' })[0])

    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange.mock.calls[0][0][0]).toMatchObject({
      type: 'GROUPING',
      decision: 'REJECTED',
      reason: 'Agrupamiento rechazado desde revision administrativa experimental.',
    })
  })

  it('persiste seleccion de vocal valida y no modifica cronograma oficial', () => {
    const onChange = vi.fn()
    render(<ExamAdminReviewWorkflowPanel {...props({
      onAdminReviewDecisionsChange: onChange,
      cronograma: [{ id: 'oficial-1' }],
    })} />)

    fireEvent.click(screen.getAllByRole('button', { name: 'Seleccionar vocal' })[0])

    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange.mock.calls[0][0][0]).toMatchObject({
      type: 'TRIBUNAL_SELECTION',
      decision: 'SELECTED',
      metadata: {
        tableId: 'pre-profesoradoingles::ing1',
        teacherId: 'teacher-brunovocal',
        teacherName: 'Bruno Vocal',
        role: 'VOCAL',
        date: '2026-07-13',
        shift: 'NOCHE',
        startTime: '18:00',
        endTime: '20:00',
        consumesAffectation: true,
        affectationBefore: {
          used: 0,
          remaining: 3,
          limit: 3,
        },
        affectationAfter: {
          used: 1,
          remaining: 2,
          limit: 3,
        },
      },
    })
    expect(screen.getByText('Vocal seleccionado en revision experimental. No se modifica el cronograma oficial.')).toBeInTheDocument()
  })

  it('bloquea seleccion de vocal con violaciones duras', () => {
    const onChange = vi.fn()
    render(<ExamAdminReviewWorkflowPanel {...props({
      onAdminReviewDecisionsChange: onChange,
      disponibilidadDocente: [
        { docente: 'Ana Titular', dia: 'Lunes', turno: 'NOCHE', hora_desde: '18:00', hora_hasta: '20:00' },
        { docente: 'Bruno Vocal', dia: 'Lunes', turno: 'TARDE', hora_desde: '14:00', hora_hasta: '16:00' },
      ],
    })} />)

    fireEvent.click(screen.getAllByRole('button', { name: 'Seleccionar vocal' })[0])

    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange.mock.calls[0][0][0]).toMatchObject({
      type: 'TRIBUNAL_SELECTION',
      decision: 'BLOCKED_HARD_RULES',
      reason: 'Seleccion bloqueada por reglas duras.',
      hardRuleViolations: expect.arrayContaining(['TEACHER_NOT_AVAILABLE_ON_SHIFT']),
    })
    expect(screen.getByText(/Seleccion bloqueada por reglas duras:/)).toBeInTheDocument()
  })

  it('seleccion valida descuenta afectacion en ledger local al recargar decisiones', () => {
    render(<ExamAdminReviewWorkflowPanel {...props({
      adminReviewDecisions: [selectedDecision()],
    })} />)

    const ledger = screen.getByRole('region', { name: 'Cupos docentes del flujo experimental' })
    expect(within(ledger).getByText(/Horas 4 \/ limite 3 \/ restante 2/)).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Selecciones actuales del tribunal experimental' })).toBeInTheDocument()
    expect(screen.getByText('SELECTED')).toBeInTheDocument()
  })

  it('quitar seleccion libera afectacion en decisiones recargadas', () => {
    const onChange = vi.fn()

    render(<ExamAdminReviewWorkflowPanel {...props({
      adminReviewDecisions: [selectedDecision()],
      onAdminReviewDecisionsChange: onChange,
    })} />)

    fireEvent.click(screen.getAllByRole('button', { name: 'Quitar seleccion' })[0])

    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange.mock.calls[0][0][0]).toMatchObject({
      type: 'TRIBUNAL_SELECTION',
      decision: 'REMOVED',
      metadata: expect.objectContaining({
        teacherId: 'teacher-brunovocal',
        consumesAffectation: true,
      }),
    })
    expect(screen.getByText('Seleccion removida. El cupo queda liberado en el ledger experimental.')).toBeInTheDocument()
  })

  it('prepara borrador revisado cuando el review esta listo y no reemplaza cronograma oficial', () => {
    const onDraftsChange = vi.fn()
    const bruno = selectedDecision()
    const carla = selectedDecision({
      teacherId: 'teacher-carlavocal',
      teacherName: 'Carla Vocal',
    })

    render(<ExamAdminReviewWorkflowPanel {...props({
      adminReviewDecisions: [bruno, carla],
      onAdminReviewDraftsChange: onDraftsChange,
      cronograma: [{ id: 'oficial-1', confirmada: true }],
      cargaHorariaDocente: [
        { docente: 'Ana Titular', carrera: 'Profesorado Ingles', materia_codigo: 'ING1', materia_nombre: 'Ingles I', horasCatedra: 8, rol_en_materia: 'TITULAR' },
        { docente: 'Bruno Vocal', carrera: 'Profesorado Ingles', materia_codigo: 'ING2', materia_nombre: 'Ingles II', horasCatedra: 4, rol_en_materia: 'AUXILIAR' },
        { docente: 'Carla Vocal', carrera: 'Profesorado Ingles', materia_codigo: 'ING3', materia_nombre: 'Ingles III', horasCatedra: 4, rol_en_materia: 'AUXILIAR' },
      ],
      disponibilidadDocente: [
        { docente: 'Ana Titular', dia: 'Lunes', turno: 'NOCHE', hora_desde: '18:00', hora_hasta: '20:00' },
        { docente: 'Bruno Vocal', dia: 'Lunes', turno: 'NOCHE', hora_desde: '18:00', hora_hasta: '20:00' },
        { docente: 'Carla Vocal', dia: 'Lunes', turno: 'NOCHE', hora_desde: '18:00', hora_hasta: '20:00' },
      ],
    })} />)

    fireEvent.click(screen.getByRole('button', { name: 'Preparar copia revisada' }))

    expect(onDraftsChange).toHaveBeenCalledTimes(1)
    const [draft] = onDraftsChange.mock.calls[0][0]
    expect(draft).toMatchObject({
      type: 'ADMIN_REVIEWED_SCHEDULE_DRAFT',
      status: 'REVIEW_READY',
      source: 'admin_review_workflow',
      isOfficial: false,
      basedOn: {
        decisionIds: [bruno.decisionId, carla.decisionId],
        teacherSource: 'structured',
        workspaceKey: 'main',
      },
      appliedDecisions: expect.any(Array),
      skippedDecisions: [],
      hardRuleViolations: [],
    })
    expect(draft.schedule[0]).toMatchObject({
      isOfficial: false,
      confirmada: false,
      valid: false,
    })
    expect(screen.getByText('Copia revisada preparada como borrador experimental. No reemplaza el cronograma oficial.')).toBeInTheDocument()
  })

  it('no prepara borrador si hay reglas duras o review incompleto', () => {
    const onDraftsChange = vi.fn()
    render(<ExamAdminReviewWorkflowPanel {...props({
      onAdminReviewDraftsChange: onDraftsChange,
    })} />)

    expect(screen.getByRole('button', { name: 'Preparar copia revisada' })).toBeDisabled()
    expect(onDraftsChange).not.toHaveBeenCalled()
  })

  it('recarga borrador revisado desde snapshot', () => {
    render(<ExamAdminReviewWorkflowPanel {...props({
      adminReviewDrafts: [{
        draftId: 'admin-review-draft-1',
        type: 'ADMIN_REVIEWED_SCHEDULE_DRAFT',
        status: 'REVIEW_READY',
        schedule: [{ id: 'mesa-1' }],
        isOfficial: false,
      }],
    })} />)

    const drafts = screen.getByRole('region', { name: 'Borradores revisados experimentales preparados' })
    expect(within(drafts).getByText('admin-review-draft-1')).toBeInTheDocument()
    expect(within(drafts).getByText(/REVIEW_READY \/ oficial: no \/ mesas 1/)).toBeInTheDocument()
  })

  it('promueve un borrador elegible con confirmacion explicita y no reemplaza cronograma oficial', () => {
    const onPromotionsChange = vi.fn()
    const { decisions, draft } = validDraft()

    render(<ExamAdminReviewWorkflowPanel {...props({
      adminReviewDecisions: decisions,
      adminReviewDrafts: [draft],
      adminActor: {
        userId: 'admin-1',
        displayName: 'Admin Instituto',
        email: 'admin@example.com',
        role: 'admin_instituto',
      },
      onAdminReviewPromotionsChange: onPromotionsChange,
      cronograma: [{ id: 'oficial-1', confirmada: true }],
      cargaHorariaDocente: [
        { docente: 'Ana Titular', carrera: 'Profesorado Ingles', materia_codigo: 'ING1', materia_nombre: 'Ingles I', horasCatedra: 8, rol_en_materia: 'TITULAR' },
        { docente: 'Bruno Vocal', carrera: 'Profesorado Ingles', materia_codigo: 'ING2', materia_nombre: 'Ingles II', horasCatedra: 4, rol_en_materia: 'AUXILIAR' },
        { docente: 'Carla Vocal', carrera: 'Profesorado Ingles', materia_codigo: 'ING3', materia_nombre: 'Ingles III', horasCatedra: 4, rol_en_materia: 'AUXILIAR' },
      ],
      disponibilidadDocente: [
        { docente: 'Ana Titular', dia: 'Lunes', turno: 'NOCHE', hora_desde: '18:00', hora_hasta: '20:00' },
        { docente: 'Bruno Vocal', dia: 'Lunes', turno: 'NOCHE', hora_desde: '18:00', hora_hasta: '20:00' },
        { docente: 'Carla Vocal', dia: 'Lunes', turno: 'NOCHE', hora_desde: '18:00', hora_hasta: '20:00' },
      ],
    })} />)

    fireEvent.click(screen.getByRole('button', { name: 'Promover borrador' }))

    expect(onPromotionsChange).not.toHaveBeenCalled()
    expect(screen.getByText('Esto crea una copia promovida experimental; no reemplaza el cronograma oficial.')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Confirmar promocion' }))

    expect(onPromotionsChange).toHaveBeenCalledTimes(1)
    expect(onPromotionsChange.mock.calls[0][0][0]).toMatchObject({
      type: 'ADMIN_REVIEWED_SCHEDULE_PROMOTION',
      status: 'PROMOTED_EXPERIMENTAL',
      draftId: draft.draftId,
      revisionNumber: 1,
      previousPromotionId: null,
      isOfficialCandidate: true,
      isOfficial: false,
      schedule: [expect.objectContaining({ isOfficial: false, confirmada: false, valid: false })],
      integrity: {
        hash: expect.stringMatching(/^[a-f0-9]{64}$/),
        workflowVersion: '1.1.0',
      },
      adminActor: {
        userId: 'admin-1',
        displayName: 'Admin Instituto',
        email: 'admin@example.com',
        role: 'admin_instituto',
      },
    })
    expect(screen.getByText('Copia promovida experimental creada. No reemplaza el cronograma oficial.')).toBeInTheDocument()
  })

  it('no muestra accion de promocion para un borrador no elegible', () => {
    const { decisions, draft } = validDraft()
    render(<ExamAdminReviewWorkflowPanel {...props({
      adminReviewDecisions: decisions,
      adminReviewDrafts: [{ ...draft, status: 'REVIEW_INCOMPLETE' }],
    })} />)

    expect(screen.queryByRole('button', { name: 'Promover borrador' })).not.toBeInTheDocument()
    expect(screen.getByText('No elegible para promocion')).toBeInTheDocument()
  })

  it('recarga promociones experimentales desde snapshot', () => {
    const fixture = verifiedPromotionFixture()
    render(<ExamAdminReviewWorkflowPanel {...props({
      adminReviewDecisions: fixture.decisions,
      adminReviewDrafts: [fixture.draft],
      adminReviewPromotions: [fixture.promotion],
      disponibilidadDocente: fixture.disponibilidadDocente,
      cargaHorariaDocente: fixture.cargaHorariaDocente,
    })} />)

    const promotions = screen.getByRole('region', { name: 'Promociones experimentales preparadas' })
    expect(within(promotions).getByText('admin-review-promotion-admin-review-draft-ready-r1')).toBeInTheDocument()
    expect(within(promotions).getByText(/PROMOTED_EXPERIMENTAL \/ revision 1 \/ oficial: no \/ mesas 1/)).toBeInTheDocument()
    expect(within(promotions).getByText(`Sello: ${fixture.promotion.integrity.hash.slice(0, 12)}`)).toBeInTheDocument()
    expect(within(promotions).getByText('Workflow: 1.1.0')).toBeInTheDocument()
    expect(within(promotions).getByText('Administrador: Admin Instituto / admin_instituto')).toBeInTheDocument()
    expect(within(promotions).getByText('Integridad: VERIFIED')).toBeInTheDocument()
    expect(within(promotions).getByText(/Verificadas: 1 \/ alteradas: 0/)).toBeInTheDocument()
  })

  it('persiste automaticamente la metadata de verificacion al recargar', async () => {
    const fixture = verifiedPromotionFixture()
    const onPromotionsChange = vi.fn()
    const promotionWithoutVerification = {
      ...fixture.promotion,
      integrityStatus: undefined,
      integrityVerification: undefined,
    }
    render(<ExamAdminReviewWorkflowPanel {...props({
      adminReviewDecisions: fixture.decisions,
      adminReviewDrafts: [fixture.draft],
      adminReviewPromotions: [promotionWithoutVerification],
      disponibilidadDocente: fixture.disponibilidadDocente,
      cargaHorariaDocente: fixture.cargaHorariaDocente,
      onAdminReviewPromotionsChange: onPromotionsChange,
    })} />)

    await waitFor(() => expect(onPromotionsChange).toHaveBeenCalledTimes(1))
    expect(onPromotionsChange.mock.calls[0][0][0]).toMatchObject({
      promotionId: fixture.promotion.promotionId,
      integrityStatus: 'VERIFIED',
      integrityVerification: {
        status: 'VERIFIED',
        mismatchFields: [],
        eligibleForFutureApproval: true,
      },
    })
  })

  it('muestra advertencia fuerte si una promocion fue alterada', () => {
    const fixture = verifiedPromotionFixture()
    const alteredPromotion = {
      ...fixture.promotion,
      schedule: [{ ...fixture.promotion.schedule[0], nombreMateria: 'Contenido alterado' }],
    }
    render(<ExamAdminReviewWorkflowPanel {...props({
      adminReviewDecisions: fixture.decisions,
      adminReviewDrafts: [fixture.draft],
      adminReviewPromotions: [alteredPromotion],
      disponibilidadDocente: fixture.disponibilidadDocente,
      cargaHorariaDocente: fixture.cargaHorariaDocente,
    })} />)

    const promotions = screen.getByRole('region', { name: 'Promociones experimentales preparadas' })
    expect(within(promotions).getByText('Integridad: MISMATCH')).toBeInTheDocument()
    expect(within(promotions).getByRole('alert')).toHaveTextContent('Promocion alterada: no es candidata a una aprobacion futura.')
    expect(within(promotions).getByText(/promotion.schedule/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Solicitar aprobacion' })).not.toBeInTheDocument()
  })

  it('muestra error de verificacion si falta el borrador fuente', () => {
    const fixture = verifiedPromotionFixture()
    render(<ExamAdminReviewWorkflowPanel {...props({
      adminReviewPromotions: [fixture.promotion],
      adminReviewDrafts: [],
      disponibilidadDocente: fixture.disponibilidadDocente,
      cargaHorariaDocente: fixture.cargaHorariaDocente,
    })} />)

    const promotions = screen.getByRole('region', { name: 'Promociones experimentales preparadas' })
    expect(within(promotions).getByText('Integridad: VERIFY_ERROR')).toBeInTheDocument()
    expect(within(promotions).getByText('No se pudo verificar: SOURCE_DRAFT_NOT_FOUND')).toBeInTheDocument()
  })

  it('muestra elegible actual, bloqueadas y revisiones superadas sin aprobar cronograma', () => {
    const fixture = verifiedPromotionFixture()
    const second = promoteAdminReviewedDraft({
      draft: fixture.draft,
      adminReviewDecisions: fixture.decisions,
      teacherExamSourceContext: fixture.teacherExamSourceContext,
      options: {
        existingPromotions: [fixture.promotion],
        adminActor: fixture.promotion.adminActor,
        now: () => '2026-07-10T13:00:00.000Z',
      },
    }).promotionRecord
    const third = promoteAdminReviewedDraft({
      draft: fixture.draft,
      adminReviewDecisions: fixture.decisions,
      teacherExamSourceContext: fixture.teacherExamSourceContext,
      options: {
        existingPromotions: [fixture.promotion, second],
        adminActor: fixture.promotion.adminActor,
        now: () => '2026-07-10T14:00:00.000Z',
      },
    }).promotionRecord
    const alteredThird = {
      ...third,
      schedule: [{ ...third.schedule[0], nombreMateria: 'Alterada' }],
    }
    render(<ExamAdminReviewWorkflowPanel {...props({
      adminReviewDecisions: fixture.decisions,
      adminReviewDrafts: [fixture.draft],
      adminReviewPromotions: [fixture.promotion, second, alteredThird],
      disponibilidadDocente: fixture.disponibilidadDocente,
      cargaHorariaDocente: fixture.cargaHorariaDocente,
    })} />)

    const eligibility = screen.getByRole('region', { name: 'Elegibilidad para aprobacion futura' })
    expect(within(eligibility).getByText('Esto todavia no aprueba ni reemplaza el cronograma oficial.')).toBeInTheDocument()
    expect(within(eligibility).getByText('Elegibles: 1 / bloqueadas: 1 / superadas: 1')).toBeInTheDocument()
    expect(within(eligibility).getByText('Promocion elegible actual')).toBeInTheDocument()
    expect(within(eligibility).getByText(second.promotionId)).toBeInTheDocument()
    expect(within(eligibility).getByText(/INTEGRITY_NOT_VERIFIED:MISMATCH/)).toBeInTheDocument()
    expect(within(eligibility).getByText(/SUPERSEDED_BY_NEWER_REVISION/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /aprobar/i })).not.toBeInTheDocument()
  })

  it('crea una solicitud append-only para la promocion elegible con confirmacion explicita', () => {
    const fixture = verifiedPromotionFixture()
    const onRequestsChange = vi.fn()
    render(<ExamAdminReviewWorkflowPanel {...props({
      adminReviewDecisions: fixture.decisions,
      adminReviewDrafts: [fixture.draft],
      adminReviewPromotions: [fixture.promotion],
      adminActor: {
        userId: 'requester-1',
        displayName: 'Solicitante Uno',
        email: 'requester@example.com',
        role: 'admin_instituto',
      },
      disponibilidadDocente: fixture.disponibilidadDocente,
      cargaHorariaDocente: fixture.cargaHorariaDocente,
      onAdminReviewApprovalRequestsChange: onRequestsChange,
    })} />)

    fireEvent.click(screen.getByRole('button', { name: 'Solicitar aprobacion' }))
    expect(onRequestsChange).not.toHaveBeenCalled()
    expect(screen.getByText('Esto no convierte el cronograma en oficial.')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Confirmar solicitud' }))

    expect(onRequestsChange).toHaveBeenCalledTimes(1)
    expect(onRequestsChange.mock.calls[0][0][0]).toMatchObject({
      type: 'ADMIN_REVIEW_APPROVAL_REQUEST',
      status: 'REQUESTED',
      promotionId: fixture.promotion.promotionId,
      draftId: fixture.draft.draftId,
      revisionNumber: 1,
      requestedBy: {
        userId: 'requester-1',
        displayName: 'Solicitante Uno',
        email: 'requester@example.com',
        role: 'admin_instituto',
      },
      basedOn: {
        promotionIntegrityHash: fixture.promotion.integrity.hash,
        promotionWorkflowVersion: '1.1.0',
      },
      requiresSecondApproval: true,
      secondApproval: null,
      isOfficial: false,
    })
    expect(screen.getByText('Solicitud de aprobacion creada. El cronograma sigue siendo experimental y no oficial.')).toBeInTheDocument()
  })

  it('recarga una solicitud activa, la lista y evita mostrar otra accion', () => {
    const fixture = verifiedPromotionFixture()
    const request = {
      requestId: 'request-existing',
      type: 'ADMIN_REVIEW_APPROVAL_REQUEST',
      status: 'REQUESTED',
      promotionId: fixture.promotion.promotionId,
      draftId: fixture.draft.draftId,
      revisionNumber: 1,
      isOfficial: false,
    }
    render(<ExamAdminReviewWorkflowPanel {...props({
      adminReviewDecisions: fixture.decisions,
      adminReviewDrafts: [fixture.draft],
      adminReviewPromotions: [fixture.promotion],
      adminReviewApprovalRequests: [request],
      disponibilidadDocente: fixture.disponibilidadDocente,
      cargaHorariaDocente: fixture.cargaHorariaDocente,
    })} />)

    expect(screen.queryByRole('button', { name: 'Solicitar aprobacion' })).not.toBeInTheDocument()
    expect(screen.getByText('Solicitud activa: REQUESTED')).toBeInTheDocument()
    const requests = screen.getByRole('region', { name: 'Solicitudes de aprobacion administrativa' })
    expect(within(requests).getByText('request-existing')).toBeInTheDocument()
    expect(within(requests).getByText(/REQUESTED \/ revision 1 \/ oficial: no/)).toBeInTheDocument()
  })

  it('muestra elegibilidad y bloqueos para segunda aprobacion sin aprobar oficialmente', () => {
    const fixture = verifiedPromotionFixture()
    const baseRequest = approvalRequestFixture(fixture)
    const sameActorRequest = {
      ...baseRequest,
      requestId: 'request-same-actor',
      requestedBy: {
        userId: 'second-admin-1',
        displayName: 'Segundo Admin',
        email: 'second@example.com',
        role: 'superadmin',
      },
    }
    render(<ExamAdminReviewWorkflowPanel {...props({
      adminReviewDecisions: fixture.decisions,
      adminReviewDrafts: [fixture.draft],
      adminReviewPromotions: [fixture.promotion],
      adminReviewApprovalRequests: [baseRequest, sameActorRequest],
      adminActor: {
        userId: 'second-admin-1',
        displayName: 'Segundo Admin',
        email: 'second@example.com',
        role: 'superadmin',
      },
      disponibilidadDocente: fixture.disponibilidadDocente,
      cargaHorariaDocente: fixture.cargaHorariaDocente,
    })} />)

    const secondApproval = screen.getByRole('region', { name: 'Elegibilidad para segunda aprobacion' })
    expect(within(secondApproval).getByText('Esto todavia no aprueba ni reemplaza el cronograma oficial.')).toBeInTheDocument()
    expect(within(secondApproval).getByText('Elegibles: 1 / bloqueadas: 1')).toBeInTheDocument()
    expect(within(secondApproval).getByText('Solicitud elegible')).toBeInTheDocument()
    expect(within(secondApproval).getByText('request-eligible')).toBeInTheDocument()
    expect(within(secondApproval).getByText(/SAME_ACTOR_NOT_ALLOWED/)).toBeInTheDocument()
    expect(within(secondApproval).getByRole('button', { name: 'Registrar segunda aprobacion' })).toBeInTheDocument()
  })

  it('registra segunda aprobacion para request elegible con confirmacion explicita', () => {
    const fixture = verifiedPromotionFixture()
    const request = approvalRequestFixture(fixture)
    const onSecondApprovalsChange = vi.fn()
    render(<ExamAdminReviewWorkflowPanel {...props({
      adminReviewDecisions: fixture.decisions,
      adminReviewDrafts: [fixture.draft],
      adminReviewPromotions: [fixture.promotion],
      adminReviewApprovalRequests: [request],
      adminActor: {
        userId: 'second-admin-1',
        displayName: 'Segundo Admin',
        email: 'second@example.com',
        role: 'superadmin',
      },
      disponibilidadDocente: fixture.disponibilidadDocente,
      cargaHorariaDocente: fixture.cargaHorariaDocente,
      onAdminReviewSecondApprovalsChange: onSecondApprovalsChange,
    })} />)

    fireEvent.click(screen.getByRole('button', { name: 'Registrar segunda aprobacion' }))
    expect(onSecondApprovalsChange).not.toHaveBeenCalled()
    expect(screen.getByText('Esto no convierte el cronograma en oficial.')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Confirmar segunda aprobacion' }))

    expect(onSecondApprovalsChange).toHaveBeenCalledTimes(1)
    expect(onSecondApprovalsChange.mock.calls[0][0][0]).toMatchObject({
      type: 'ADMIN_REVIEW_SECOND_APPROVAL',
      status: 'SECOND_APPROVED',
      requestId: request.requestId,
      promotionId: fixture.promotion.promotionId,
      draftId: fixture.draft.draftId,
      revisionNumber: 1,
      approvedBy: {
        userId: 'second-admin-1',
        displayName: 'Segundo Admin',
        email: 'second@example.com',
        role: 'superadmin',
      },
      requestIntegrity: {
        hash: expect.stringMatching(/^[a-f0-9]{64}$/),
        algorithm: 'sha256',
      },
      basedOn: {
        requestId: request.requestId,
        promotionIntegrityHash: fixture.promotion.integrity.hash,
      },
      isOfficial: false,
    })
    expect(request.secondApproval).toBeNull()
    expect(screen.getByText('Segunda aprobacion registrada. El cronograma sigue siendo experimental y no oficial.')).toBeInTheDocument()
  })

  it('recarga segunda aprobacion y oculta una nueva accion para el mismo request', () => {
    const fixture = verifiedPromotionFixture()
    const request = approvalRequestFixture(fixture)
    const secondApproval = {
      secondApprovalId: 'second-existing',
      type: 'ADMIN_REVIEW_SECOND_APPROVAL',
      status: 'SECOND_APPROVED',
      requestId: request.requestId,
      promotionId: fixture.promotion.promotionId,
      draftId: fixture.draft.draftId,
      revisionNumber: 1,
      isOfficial: false,
    }
    render(<ExamAdminReviewWorkflowPanel {...props({
      adminReviewDecisions: fixture.decisions,
      adminReviewDrafts: [fixture.draft],
      adminReviewPromotions: [fixture.promotion],
      adminReviewApprovalRequests: [request],
      adminReviewSecondApprovals: [secondApproval],
      adminActor: {
        userId: 'second-admin-1',
        email: 'second@example.com',
        role: 'superadmin',
      },
      disponibilidadDocente: fixture.disponibilidadDocente,
      cargaHorariaDocente: fixture.cargaHorariaDocente,
    })} />)

    expect(screen.queryByRole('button', { name: 'Registrar segunda aprobacion' })).not.toBeInTheDocument()
    expect(screen.getByText('Segunda aprobacion registrada: SECOND_APPROVED')).toBeInTheDocument()
    const approvals = screen.getByRole('region', { name: 'Segundas aprobaciones registradas' })
    expect(within(approvals).getByText('second-existing')).toBeInTheDocument()
    expect(within(approvals).getByText(/SECOND_APPROVED \/ revision 1 \/ oficial: no/)).toBeInTheDocument()
  })

  it('muestra compatibilidad y warning para promociones antiguas sin sello ni actor', () => {
    render(<ExamAdminReviewWorkflowPanel {...props({
      adminReviewPromotions: [{
        promotionId: 'legacy-promotion-1',
        draftId: 'legacy-draft-1',
        status: 'PROMOTED_EXPERIMENTAL',
        schedule: [],
        isOfficial: false,
      }],
    })} />)

    const promotions = screen.getByRole('region', { name: 'Promociones experimentales preparadas' })
    expect(within(promotions).getByText('Sello: no disponible (registro anterior)')).toBeInTheDocument()
    expect(within(promotions).getByText('Workflow: legacy')).toBeInTheDocument()
    expect(within(promotions).getByText('Administrador: ADMIN_REVIEW_USER_UNAVAILABLE')).toBeInTheDocument()
    expect(within(promotions).getByText('Advertencia: identidad administrativa no disponible.')).toBeInTheDocument()
  })

  it('recarga decision persistida desde snapshot', () => {
    render(<ExamAdminReviewWorkflowPanel {...props({
      adminReviewDecisions: [{
        decisionId: 'GROUPING:group-pre-profesoradoingles::ing1-pre-traductoradoingles::tra1',
        type: 'GROUPING',
        targetId: 'group-pre-profesoradoingles::ing1-pre-traductoradoingles::tra1',
        decision: 'ACCEPTED',
        reason: 'Decision previa.',
        source: 'exam_admin_review_workflow',
        createdAt: '2026-07-09T12:00:00.000Z',
        updatedAt: '2026-07-09T12:00:00.000Z',
      }],
    })} />)

    const suggestions = screen.getByRole('region', { name: 'Sugerencias de agrupamiento administrativo' })
    expect(within(suggestions).getByText('ACCEPTED')).toBeInTheDocument()
    expect(within(suggestions).getByText('Decision guardada: Decision previa.')).toBeInTheDocument()
  })

  it('no permite marcar tribunal incompleto como valido', () => {
    render(<ExamAdminReviewWorkflowPanel {...props()} />)

    const validation = screen.getByRole('region', { name: 'Validacion del precronograma experimental' })
    expect(within(validation).getByText(/Confirmable: no/)).toBeInTheDocument()
    expect(within(validation).getByText(/TRIBUNAL_INCOMPLETE:/)).toBeInTheDocument()
  })
})
