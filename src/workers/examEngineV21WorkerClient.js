const RUN_DRAFT_WORKFLOW = 'RUN_DRAFT_WORKFLOW'
const CANCEL_DRAFT_WORKFLOW = 'CANCEL_DRAFT_WORKFLOW'
const DRAFT_WORKFLOW_SUCCESS = 'DRAFT_WORKFLOW_SUCCESS'
const DRAFT_WORKFLOW_ERROR = 'DRAFT_WORKFLOW_ERROR'
const DEFAULT_TIMEOUT_MS = 30000

function createRequestId() {
  return `exam-engine-v21-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function workerError(message, code = 'EXAM_ENGINE_V21_WORKER_CLIENT_ERROR') {
  const error = new Error(message)
  error.code = code
  return error
}

export function isExamEngineV21WorkerSupported() {
  return typeof Worker !== 'undefined'
}

export function createExamEngineV21DraftWorkflowRun(payload = {}, options = {}) {
  if (!isExamEngineV21WorkerSupported()) {
    return {
      requestId: '',
      promise: Promise.reject(workerError(
        'El motor de mesas requiere Web Worker para no bloquear la pantalla.',
        'WORKER_NOT_SUPPORTED',
      )),
      cancel: () => {},
    }
  }

  const requestId = createRequestId()
  const timeoutMs = Number(options.timeoutMs ?? DEFAULT_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS
  const worker = new Worker(new URL('./examEngineV21.worker.js', import.meta.url), { type: 'module' })
  let settled = false
  let rejectRun = () => {}
  let timeoutId = null

  const cleanup = () => {
    if (timeoutId) globalThis.clearTimeout(timeoutId)
    timeoutId = null
    worker.terminate()
  }

  const promise = new Promise((resolve, reject) => {
    rejectRun = reject
    timeoutId = globalThis.setTimeout(() => {
      if (settled) return
      settled = true
      cleanup()
      reject(workerError(
        `El motor de mesas supero el tiempo maximo de ${timeoutMs} ms.`,
        'WORKER_TIMEOUT',
      ))
    }, timeoutMs)

    worker.onmessage = (event) => {
      const message = event.data ?? {}
      if (message.requestId !== requestId || settled) return

      settled = true
      cleanup()

      if (message.type === DRAFT_WORKFLOW_SUCCESS) {
        resolve(message.result)
        return
      }

      if (message.type === DRAFT_WORKFLOW_ERROR) {
        reject(workerError(
          message.error?.message ?? 'No se pudo ejecutar el motor de mesas en segundo plano.',
          message.error?.code ?? 'WORKER_ERROR',
        ))
        return
      }

      reject(workerError('Respuesta desconocida del worker del motor de mesas.', 'WORKER_UNKNOWN_RESPONSE'))
    }

    worker.onerror = () => {
      if (settled) return
      settled = true
      cleanup()
      reject(workerError('Fallo el worker del motor de mesas.', 'WORKER_RUNTIME_ERROR'))
    }

    worker.postMessage({
      type: RUN_DRAFT_WORKFLOW,
      requestId,
      payload,
    })
  })

  return {
    requestId,
    promise,
    cancel: () => {
      if (settled) return
      settled = true
      try {
        worker.postMessage({ type: CANCEL_DRAFT_WORKFLOW, requestId })
      } finally {
        cleanup()
      }
      rejectRun(workerError('Motor de mesas cancelado.', 'WORKER_CANCELLED'))
    },
  }
}

export function runExamEngineV21DraftWorkflowInWorker(payload = {}, options = {}) {
  return createExamEngineV21DraftWorkflowRun(payload, options).promise
}

export { DEFAULT_TIMEOUT_MS as EXAM_ENGINE_V21_WORKER_TIMEOUT_MS }
