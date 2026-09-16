import { runExamEngineV21DraftWorkflow } from '../features/exams/examEngineV21FieldTestService.js'

const RUN_DRAFT_WORKFLOW = 'RUN_DRAFT_WORKFLOW'
const CANCEL_DRAFT_WORKFLOW = 'CANCEL_DRAFT_WORKFLOW'
const DRAFT_WORKFLOW_SUCCESS = 'DRAFT_WORKFLOW_SUCCESS'
const DRAFT_WORKFLOW_ERROR = 'DRAFT_WORKFLOW_ERROR'

const cancelledRequests = new Set()

function performanceNow() {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now()
}

function roundMs(value) {
  return Math.round(Number(value || 0) * 100) / 100
}

function safeError(error) {
  return {
    code: 'EXAM_ENGINE_V21_WORKER_ERROR',
    message: error instanceof Error ? error.message : 'No se pudo ejecutar el motor de mesas en segundo plano.',
  }
}

self.addEventListener('message', (event) => {
  const message = event.data ?? {}
  const requestId = message.requestId

  if (message.type === CANCEL_DRAFT_WORKFLOW) {
    if (requestId) cancelledRequests.add(requestId)
    return
  }

  if (message.type !== RUN_DRAFT_WORKFLOW || !requestId) return

  const workerStartedAt = performanceNow()

  try {
    if (cancelledRequests.has(requestId)) return

    const result = runExamEngineV21DraftWorkflow(message.payload ?? {})
    result.workerTimings = {
      workerTotalMs: roundMs(performanceNow() - workerStartedAt),
    }

    if (cancelledRequests.has(requestId)) return

    self.postMessage({
      type: DRAFT_WORKFLOW_SUCCESS,
      requestId,
      result,
    })
  } catch (error) {
    self.postMessage({
      type: DRAFT_WORKFLOW_ERROR,
      requestId,
      error: safeError(error),
    })
  } finally {
    cancelledRequests.delete(requestId)
  }
})
