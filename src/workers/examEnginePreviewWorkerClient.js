const RUN_PREVIEW = 'RUN_PREVIEW'
const CANCEL_PREVIEW = 'CANCEL_PREVIEW'
const PREVIEW_SUCCESS = 'PREVIEW_SUCCESS'
const PREVIEW_ERROR = 'PREVIEW_ERROR'
const DEFAULT_TIMEOUT_MS = 30000

function createRequestId() {
  return `exam-preview-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function previewError(message, code = 'EXAM_ENGINE_WORKER_CLIENT_ERROR') {
  const error = new Error(message)
  error.code = code
  return error
}

export function isExamEnginePreviewWorkerSupported() {
  return typeof Worker !== 'undefined'
}

export function createExamEnginePreviewWorkerRun(input = {}, filtersState = {}, options = {}) {
  if (!isExamEnginePreviewWorkerSupported()) {
    return {
      requestId: '',
      promise: Promise.reject(previewError(
        'El preview interno requiere Web Worker para no bloquear la pantalla.',
        'WORKER_NOT_SUPPORTED',
      )),
      cancel: () => {},
    }
  }

  const requestId = createRequestId()
  const timeoutMs = Number(options.timeoutMs ?? DEFAULT_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS
  const worker = new Worker(new URL('./examEnginePreview.worker.js', import.meta.url), { type: 'module' })
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
      reject(previewError(
        `El preview interno supero el tiempo maximo de ${timeoutMs} ms.`,
        'WORKER_TIMEOUT',
      ))
    }, timeoutMs)

    worker.onmessage = (event) => {
      const message = event.data ?? {}
      if (message.requestId !== requestId || settled) return

      settled = true
      cleanup()

      if (message.type === PREVIEW_SUCCESS) {
        resolve(message.result)
        return
      }

      if (message.type === PREVIEW_ERROR) {
        reject(previewError(
          message.error?.message ?? 'No se pudo ejecutar el preview interno en segundo plano.',
          message.error?.code ?? 'WORKER_ERROR',
        ))
        return
      }

      reject(previewError('Respuesta desconocida del worker de preview.', 'WORKER_UNKNOWN_RESPONSE'))
    }

    worker.onerror = () => {
      if (settled) return
      settled = true
      cleanup()
      reject(previewError('Fallo el worker del preview interno.', 'WORKER_RUNTIME_ERROR'))
    }

    worker.postMessage({
      type: RUN_PREVIEW,
      requestId,
      input,
      filtersState,
    })
  })

  return {
    requestId,
    promise,
    cancel: () => {
      if (settled) return
      settled = true
      try {
        worker.postMessage({ type: CANCEL_PREVIEW, requestId })
      } finally {
        cleanup()
      }
      rejectRun(previewError('Preview interno cancelado.', 'WORKER_CANCELLED'))
    },
  }
}

export function runExamEnginePreviewInWorker(input = {}, filtersState = {}, options = {}) {
  return createExamEnginePreviewWorkerRun(input, filtersState, options).promise
}

export { DEFAULT_TIMEOUT_MS as EXAM_ENGINE_PREVIEW_WORKER_TIMEOUT_MS }
