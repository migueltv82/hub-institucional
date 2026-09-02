# Motor v2 - Flujo administrativo de precronograma

## Objetivo

El nuevo corte separa la construccion del precronograma de la confirmacion de tribunales. El motor puede producir una base con titulares obligatorios y sugerencias, pero la aceptacion de agrupamientos y la incorporacion de vocales queda como decision administrativa explicita.

Este flujo no reemplaza aun a `cronogramaInteligente.js`, no elimina `horariosPreparados` y no modifica reglas institucionales existentes.

## Helpers puros

Archivo: `src/utils/examEngine/adminReviewWorkflow.js`

- `buildTitularOnlyPreSchedule`: arma mesas con titular obligatorio, sin vocales automaticos.
- `suggestExamTableGroupings`: sugiere agrupamientos por mismo titular, correlativas, materias homologas, area afin o afinidad entre carreras.
- `validateExamTableGroupingAgainstHardRules`: bloquea agrupamientos que violan reglas duras.
- `updateExamTableGroupingDecision`: registra decision administrativa `PENDING`, `ACCEPTED`, `REJECTED` o `EDITED`.
- `buildTeacherAffectationLedger`: calcula cupos docentes consumiendo solo roles de vocal/tribunal; el titular obligatorio no consume.
- `recommendTribunalTeachers`: recomienda docentes disponibles, con afinidad y cupo para completar tribunales.
- `validateTribunalSelectionAgainstHardRules`: valida una seleccion docente antes de aplicarla.
- `applyTeacherTribunalSelection`: aplica una seleccion valida y recalcula ledger.
- `validatePreScheduleHardRules`: evita marcar como valido un tribunal incompleto.

Archivo: `src/utils/examEngine/adminReviewApplyWorkflow.js`

- `buildExperimentalReviewedSchedule`: aplica decisiones administrativas sobre el precronograma y devuelve un cronograma revisado experimental, no oficial.
- `buildExperimentalReviewedScheduleDraft`: prepara una copia revisada experimental persistible, separada del cronograma oficial.
- `upsertExperimentalReviewedScheduleDraft`: agrega o reemplaza un borrador por `draftId`, sin duplicados.

## Contrato para panel administrativo

La vista experimental queda detras de la feature flag:

```env
VITE_ENABLE_EXAM_ADMIN_REVIEW_WORKFLOW=true
```

Con la flag apagada, no se agrega la seccion experimental al dashboard y la app mantiene el comportamiento actual.

Componente:

```txt
src/components/generadorCronograma/ExamAdminReviewWorkflowPanel.jsx
```

### Precronograma

```js
{
  source: 'structured' | 'legacy' | 'missing',
  mesas: [
    {
      id,
      carrera,
      materia,
      nombreMateria,
      anio,
      plan,
      fechaIso,
      turno,
      inicio,
      fin,
      titularId,
      titular,
      vocales: [],
      estado: 'TRIBUNAL_INCOMPLETO',
      tribunalStatus: 'PENDIENTE_VOCALES',
      adminDecision: 'PENDING',
      hardRuleViolations: []
    }
  ],
  warnings,
  diagnostics: {
    totalMesas,
    titularesOnly: true,
    autoAssignedVocales: 0
  }
}
```

### Sugerencia de agrupamiento

```js
{
  groupId,
  type,
  level,
  confidence,
  mesas,
  titular,
  careers,
  subjects,
  reasons,
  warnings,
  hardRuleViolations,
  risks,
  estimatedBenefit,
  estimatedAffectationSaving,
  adminDecision: 'PENDING',
  canAccept
}
```

Tipos previstos: `SAME_TITULAR`, `SAME_AREA`, `CORRELATIVE_CHAIN`, `CROSS_CAREER_AFFINITY`, `HOMOLOGOUS_SUBJECT`, `MANUAL_ADMIN_GROUP`.

Niveles previstos: `SAME_SLOT_SHARED_TRIBUNAL`, `SAME_DAY_CONSECUTIVE_SLOTS`, `SAME_DAY_SEPARATE_SLOTS`, `ADMIN_GROUP_ONLY`.

### Recomendacion de docentes

```js
{
  docente: { id, nombre },
  disponibleEseDia,
  disponibleEnTurno,
  areaAfin,
  nivelAfinidad,
  horasCatedra,
  limiteAfectacion,
  afectacionesUsadas,
  afectacionesRestantes,
  conflictos,
  hardRuleViolations,
  eligible,
  score,
  reasons,
  warnings
}
```

## Reglas duras consideradas

- El titular obligatorio debe existir para cada mesa.
- Un precronograma con tribunal incompleto no puede confirmarse como valido.
- No se asignan vocales automaticamente.
- Una decision administrativa no omite reglas duras.
- Un agrupamiento de mismo slot exige misma fecha y franja.
- No se acepta una inversion de correlatividades detectada por las reglas existentes.
- Un vocal recomendado debe tener disponibilidad en fecha, turno y franja.
- Un vocal recomendado debe tener afinidad minima.
- Un vocal recomendado debe tener cupo restante.
- Las afectaciones descuentan solo roles de vocal/miembro de tribunal; el titular obligatorio no consume cupo.

## Prioridad de fuente docente

Los helpers consumen `teacherExamSourceContext`, por lo que respetan la prioridad ya vigente:

1. `disponibilidadDocente` + `cargaHorariaDocente`.
2. `horariosDocentes` legacy como fallback.
3. Contexto vacio con warnings si no hay fuente valida.

## Integracion pendiente

Etapa siguiente recomendada:

1. Definir si decisiones y borradores administrativos deben migrar luego a tablas relacionales.
2. Diseniar una accion explicita de "promover borrador" con validacion final y confirmacion administrativa.
3. Mantener esa promocion separada del flujo oficial hasta tener tests de caracterizacion.
4. Recien despues adaptar reglas internas criticas con tests de caracterizacion.

## Cronograma revisado experimental

Contrato:

```js
{
  status,
  schedule,
  appliedDecisions,
  skippedDecisions,
  hardRuleViolations,
  warnings,
  diagnostics
}
```

Estados:

```js
'REVIEW_READY'
'REVIEW_HAS_WARNINGS'
'REVIEW_BLOCKED_HARD_RULES'
'REVIEW_INCOMPLETE'
```

Reglas aplicadas:

- Aplica agrupamientos `ACCEPTED` solo si siguen siendo validos contra reglas duras.
- Aplica selecciones `TRIBUNAL_SELECTION` con `SELECTED` solo si el docente recomendado sigue siendo elegible.
- Trata `REMOVED`, `PENDING` y `BLOCKED_HARD_RULES` como decisiones saltadas.
- No marca ninguna mesa como oficial ni confirmada.
- No marca tribunal incompleto como valido.
- El titular obligatorio no consume afectacion.
- Los vocales consumen afectacion y se validan contra mitad mas uno.
- Bloquea docente duplicado dentro del mismo tribunal.
- Bloquea conflicto de docente por fecha/franja.
- Preserva trazabilidad con `appliedDecisionIds`, `appliedDecisions` y `skippedDecisions`.

La vista `ExamAdminReviewWorkflowPanel` muestra una seccion "Cronograma revisado experimental" con estado, decisiones aplicadas, decisiones saltadas y violaciones duras. Sigue siendo solo preview.

## Borrador revisado experimental

La accion experimental "Preparar copia revisada" crea un borrador separado del cronograma revisado. La accion esta habilitada solo cuando el preview esta en `REVIEW_READY` o `REVIEW_HAS_WARNINGS`; se bloquea con `REVIEW_BLOCKED_HARD_RULES` y tambien con `REVIEW_INCOMPLETE` para evitar confundir un tribunal incompleto con una version utilizable.

El borrador se guarda en:

```js
workspaceSnapshot.adminReviewDrafts
```

Contrato:

```js
{
  draftId,
  type: 'ADMIN_REVIEWED_SCHEDULE_DRAFT',
  status,
  source: 'admin_review_workflow',
  createdAt,
  updatedAt,
  basedOn: {
    preScheduleHash,
    decisionIds,
    teacherSource,
    workspaceKey
  },
  schedule,
  appliedDecisions,
  skippedDecisions,
  hardRuleViolations,
  warnings,
  diagnostics,
  isOfficial: false
}
```

Reglas de seguridad:

- El borrador no reemplaza `workspaceSnapshot.cronograma`.
- El borrador no borra `workspaceSnapshot.adminReviewDecisions`.
- Cada mesa del borrador queda con `isOfficial: false`, `confirmada: false` y `valid: false`.
- No se persiste automaticamente como cronograma oficial.
- No se exporta como definitivo.
- La trazabilidad guarda ids de decisiones, decisiones aplicadas, decisiones saltadas, warnings, violaciones y diagnostics sin filas crudas.

## Promocion experimental de borradores

La accion `Promover borrador` usa el helper puro `promoteAdminReviewedDraft` y requiere una segunda confirmacion explicita en la vista experimental. Solo se muestra para borradores que superan `validateAdminReviewedDraftForPromotion`.

La promocion se guarda en:

```js
workspaceSnapshot.adminReviewPromotions
```

Contrato:

```js
{
  promotionId,
  draftId,
  revisionNumber,
  previousPromotionId,
  type: 'ADMIN_REVIEWED_SCHEDULE_PROMOTION',
  status: 'PROMOTED_EXPERIMENTAL',
  promotedAt,
  source: 'admin_review_workflow',
  basedOn: {
    draftId,
    preScheduleHash,
    decisionIds,
    teacherSource,
    workspaceKey
  },
  schedule,
  appliedDecisionIds,
  skippedDecisionIds,
  integrity: {
    hash,
    algorithm: 'sha256',
    workflowVersion: '1.1.0',
    generatedAt,
    inputs: {
      draftHash,
      appliedDecisionsHash,
      skippedDecisionsHash,
      teacherContextHash
    }
  },
  adminActor: {
    userId,
    displayName,
    email,
    role
  },
  integrityStatus: 'VERIFIED' | 'MISMATCH' | 'LEGACY_UNVERIFIED' | 'VERIFY_ERROR',
  integrityVerification: {
    status,
    verifiedAt,
    workflowVersion,
    mismatchFields,
    warnings,
    candidateRequested,
    eligibleForFutureApproval
  },
  hardRuleViolations,
  warnings,
  diagnostics,
  isOfficialCandidate: true,
  isOfficial: false
}
```

Validaciones de promocion:

- Solo admite borradores `REVIEW_READY`, de tipo `ADMIN_REVIEWED_SCHEDULE_DRAFT` y con `isOfficial: false`.
- Requiere `draftId`, trazabilidad de decisiones y que todas las decisiones aplicadas sigan existiendo y siendo validas.
- Revalida tribunal completo, docentes duplicados, disponibilidad de dia/turno/franja, afinidad, conflicto por fecha/franja y limite mitad mas uno.
- Los conflictos de fecha/franja detectan intervalos parcialmente solapados. Las franjas contiguas no se consideran conflicto.
- El titular obligatorio no consume afectacion; los vocales si.
- El sello usa serializacion estable y cuatro hashes SHA-256 independientes para borrador, decisiones aplicadas, decisiones saltadas y metadata normalizada del contexto docente. El hash final incorpora `draftId`, timestamp y version del workflow.
- `verifyAdminReviewPromotionIntegrity` recalcula el sello con el borrador y contexto docente de origen, y reporta exactamente que componente no coincide.
- Al reconstruir la vista, `verifyAdminReviewPromotionEvents` busca el borrador por `draftId`, recalcula la integridad y compara tambien el schedule promovido con el derivado esperado.
- `VERIFIED` mantiene la candidatura futura; `MISMATCH`, `LEGACY_UNVERIFIED` y `VERIFY_ERROR` fuerzan `isOfficialCandidate: false` en la vista verificada.
- `integrityVerification.verifiedAt` se conserva cuando el resultado no cambia, evitando metadata inestable entre renders.
- La promocion persiste solamente hashes, nunca las filas docentes ni el payload crudo usado para calcularlos.
- Si el actor autenticado esta disponible se registran su id, nombre, email y rol. Si no esta disponible, la promocion no se bloquea pero guarda `ADMIN_REVIEW_USER_UNAVAILABLE` y el warning `ADMIN_ACTOR_UNAVAILABLE`.
- Si falla el calculo del sello, faltan decisiones criticas o el borrador presenta inconsistencias internas, la promocion se bloquea.
- La copia promovida conserva `isOfficial: false`, `confirmada: false` y `valid: false` en todas sus mesas.
- La promocion no reemplaza `workspaceSnapshot.cronograma`, no borra el borrador ni sus decisiones y no habilita exportacion oficial.
- Promociones anteriores sin `integrity` o `adminActor` siguen cargando como registros legacy y la UI las identifica como tales.
- Cada promocion nueva se agrega como evento inmutable. Una nueva promocion del mismo borrador incrementa `revisionNumber`, genera otro `promotionId` y enlaza `previousPromotionId` sin sobrescribir eventos anteriores.

## Elegibilidad para aprobacion futura

`buildAdminReviewApprovalEligibility` construye una vista derivada y no oficial con este contrato:

```js
{
  eligiblePromotions,
  blockedPromotions,
  supersededPromotions,
  latestPromotionByDraft,
  warnings,
  diagnostics
}
```

La evaluacion vuelve a verificar la integridad y solo considera candidatas las promociones `PROMOTED_EXPERIMENTAL`, no oficiales, con actor administrativo, sello `VERIFIED`, decisiones fuente presentes, tribunal completo y `eligibleForFutureApproval: true`.

Para cada `draftId` se elige la mayor `revisionNumber` entre las promociones que superan todos los bloqueos. Las revisiones validas anteriores quedan en `supersededPromotions` con `SUPERSEDED_BY_NEWER_REVISION`. Una revision posterior invalida no desplaza a la ultima revision verificada valida.

`MISMATCH`, `LEGACY_UNVERIFIED`, `VERIFY_ERROR`, falta de ids, actor, revision, integridad, decisiones, tribunal completo o cualquier estado oficial se registran en `blockedPromotions` con motivos explicitos. Revisiones maximas duplicadas se bloquean como ambiguas para no resolver concurrencia por orden del cliente.

La vista experimental muestra la seccion "Elegibilidad para aprobacion futura", pero no ofrece botones de aprobacion ni modifica `workspaceSnapshot.cronograma`.

## Solicitud de aprobacion administrativa

`createAdminReviewApprovalRequest` crea un evento append-only solamente para la promocion que figura en `eligiblePromotions` y `latestPromotionByDraft`.

Los eventos se guardan en:

```js
workspaceSnapshot.adminReviewApprovalRequests
```

Contrato:

```js
{
  requestId,
  type: 'ADMIN_REVIEW_APPROVAL_REQUEST',
  status: 'REQUESTED',
  promotionId,
  draftId,
  revisionNumber,
  requestedAt,
  requestedBy: {
    userId,
    displayName,
    email,
    role
  },
  basedOn: {
    promotionIntegrityHash,
    promotionWorkflowVersion,
    appliedDecisionIds,
    skippedDecisionIds
  },
  requiresSecondApproval: true,
  secondApproval: null,
  warnings,
  diagnostics,
  isOfficial: false
}
```

La solicitud se bloquea si la promocion no es elegible, esta superada o bloqueada, tiene integridad invalida, carece de actor, hash o ids, no es la ultima revision, conserva reglas duras o ya tiene una solicitud activa `REQUESTED`/`PENDING_SECOND_APPROVAL`.

La UI exige confirmacion explicita, lista las solicitudes creadas y oculta una nueva accion cuando ya existe una solicitud activa. Crear el evento no aprueba, publica, exporta ni reemplaza el cronograma oficial. `requiresSecondApproval` prepara el contrato futuro, pero en esta etapa `secondApproval` permanece en `null`.

## Elegibilidad para segunda aprobacion

`buildAdminReviewSecondApprovalEligibility` revalida cada request contra la promocion y la elegibilidad actuales:

```js
{
  eligibleRequests,
  blockedRequests,
  warnings,
  diagnostics
}
```

Una solicitud solo queda elegible si sigue en `REQUESTED`, requiere segunda aprobacion, no tiene `secondApproval`, conserva ids y revision, apunta a la ultima promocion elegible, mantiene el mismo hash y tiene solicitante inicial. El actor actual debe ser distinto y usar uno de los roles administrativos reales permitidos:

```js
['superadmin', 'admin_instituto']
```

Se bloquean promociones ausentes, superadas, ambiguas o no elegibles; hashes o revisiones diferentes; actores ausentes o repetidos; roles no autorizados; reglas duras y warnings marcados como bloqueantes. `SECOND_APPROVAL_REQUIRED` es informativo y no bloquea.

La UI muestra solicitudes elegibles y bloqueadas con sus motivos. No existe accion de segunda aprobacion en esta etapa y no se modifica el cronograma oficial.

## Evento de segunda aprobacion

`createAdminReviewSecondApproval` crea un evento separado y append-only para un request incluido en `eligibleRequests`. Se persiste en:

```js
workspaceSnapshot.adminReviewSecondApprovals
```

Contrato:

```js
{
  secondApprovalId,
  type: 'ADMIN_REVIEW_SECOND_APPROVAL',
  status: 'SECOND_APPROVED',
  requestId,
  promotionId,
  draftId,
  revisionNumber,
  approvedAt,
  approvedBy,
  requestIntegrity: {
    hash,
    algorithm: 'sha256',
    generatedAt,
    inputs: {
      requestCoreHash,
      promotionHash
    }
  },
  basedOn: {
    requestId,
    requestHash,
    promotionIntegrityHash,
    promotionWorkflowVersion,
    appliedDecisionIds,
    skippedDecisionIds
  },
  warnings,
  diagnostics,
  isOfficial: false
}
```

El hash del request usa un nucleo estable con ids, revision, fechas, rol e identidad tecnica del solicitante, pero persiste solamente hashes. La creacion exige request elegible, promocion verificada, hash coincidente, segundo actor autorizado y diferente, ausencia de reglas duras y que no exista otro `SECOND_APPROVED` para el mismo request.

La UI requiere confirmacion explicita, oculta la accion si ya hay una segunda aprobacion y lista los eventos registrados. El request original conserva `secondApproval: null`; no se muta ningun evento previo y no se oficializa el cronograma.

## Persistencia inicial

Las decisiones administrativas se guardan en:

```js
workspaceSnapshot.adminReviewDecisions
```

No se crean tablas nuevas en este corte y no se modifica Supabase estructural.

Contrato:

```js
{
  decisionId,
  type: 'GROUPING' | 'TRIBUNAL_SELECTION',
  targetId,
decision: 'ACCEPTED' | 'REJECTED' | 'EDITED' | 'PENDING',
  reason,
  metadata,
  hardRuleViolations,
  source: 'exam_admin_review_workflow',
  createdAt,
  updatedAt
}
```

Para selecciones de tribunal se usa el mismo arreglo, con:

```js
{
  decisionId,
  type: 'TRIBUNAL_SELECTION',
  targetId,
  decision: 'SELECTED' | 'REMOVED' | 'PENDING' | 'BLOCKED_HARD_RULES',
  reason,
  metadata: {
    tableId,
    groupId,
    teacherId,
    teacherName,
    role,
    date,
    shift,
    startTime,
    endTime,
    consumesAffectation,
    affectationBefore,
    affectationAfter,
    recommendationScore,
    recommendationReasons,
    recommendationWarnings
  },
  hardRuleViolations,
  source: 'exam_admin_review_workflow',
  createdAt,
  updatedAt
}
```

Las decisiones `TRIBUNAL_SELECTION` con `decision: 'SELECTED'` se transforman en selecciones locales para recalcular el ledger experimental. Las decisiones `REMOVED` permanecen como auditoria, pero no consumen afectacion.

Regla de seguridad:

- `ACCEPTED` solo se persiste si el target no tiene `hardRuleViolations` y `canAccept === true`.
- Si se intenta aceptar un agrupamiento invalido, queda `PENDING` con `reason: 'ACCEPT_BLOCKED_HARD_RULES'`.
- Las decisiones se actualizan por `type + targetId`, sin duplicar registros previos.
- Una seleccion de vocal solo queda `SELECTED` si la recomendacion es `eligible === true` y no tiene `hardRuleViolations`.
- Si una seleccion viola reglas duras, se persiste como `BLOCKED_HARD_RULES` para auditoria.
- Quitar una seleccion persiste `REMOVED` y libera el cupo en el ledger experimental.

## Riesgos

- Las afinidades siguen dependiendo de la normalizacion actual de nombres de materia/carrera.
- Las sugerencias por pares no resuelven todavia agrupamientos de tres o mas mesas.
- La persistencia en snapshot es suficiente para el corte experimental, pero no reemplaza una auditoria relacional futura.
- El flujo oficial sigue usando `cronogramaInteligente.js`; este contrato es preparatorio.
