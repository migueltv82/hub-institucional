import { buildRegularExamPreviewIntegrationContract } from '../utils/examEngine/preview'
import { compactPreviewResultForUi } from './examEnginePreviewResultCompaction.js'

const RUN_PREVIEW = 'RUN_PREVIEW'
const CANCEL_PREVIEW = 'CANCEL_PREVIEW'
const PREVIEW_SUCCESS = 'PREVIEW_SUCCESS'
const PREVIEW_ERROR = 'PREVIEW_ERROR'

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
    code: 'EXAM_ENGINE_WORKER_ERROR',
    message: error instanceof Error ? error.message : 'No se pudo ejecutar el preview interno en segundo plano.',
  }
}

self.addEventListener('message', (event) => {
  const message = event.data ?? {}
  const requestId = message.requestId

  if (message.type === CANCEL_PREVIEW) {
    if (requestId) cancelledRequests.add(requestId)
    return
  }

  if (message.type !== RUN_PREVIEW || !requestId) return

  const workerStartedAt = performanceNow()

  try {
    if (cancelledRequests.has(requestId)) return

    const contract = buildRegularExamPreviewIntegrationContract(
      message.input ?? {},
      message.filtersState ?? {},
    )

    if (cancelledRequests.has(requestId)) return

    const result = compactPreviewResultForUi(contract)
    result.metadata = {
      ...(result.metadata ?? {}),
      timings: {
        ...(result.metadata?.timings ?? {}),
        workerTotalMs: roundMs(performanceNow() - workerStartedAt),
      },
    }

    self.postMessage({
      type: PREVIEW_SUCCESS,
      requestId,
      result,
    })
  } catch (error) {
    self.postMessage({
      type: PREVIEW_ERROR,
      requestId,
      error: safeError(error),
    })
  } finally {
    cancelledRequests.delete(requestId)
  }
})
