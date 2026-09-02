import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createExamEnginePreviewWorkerRun,
  isExamEnginePreviewWorkerSupported,
  runExamEnginePreviewInWorker,
} from './examEnginePreviewWorkerClient.js'

class FakeWorker {
  static instances = []

  constructor(url, options) {
    this.url = url
    this.options = options
    this.messages = []
    this.postMessage = vi.fn((message) => {
      this.messages.push(message)
    })
    this.terminate = vi.fn()
    this.onmessage = null
    this.onerror = null
    FakeWorker.instances.push(this)
  }

  emit(message) {
    this.onmessage?.({ data: message })
  }

  fail() {
    this.onerror?.(new Error('worker boom'))
  }
}

describe('examEnginePreviewWorkerClient', () => {
  beforeEach(() => {
    FakeWorker.instances = []
    vi.stubGlobal('Worker', FakeWorker)
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('detecta soporte de Worker', () => {
    expect(isExamEnginePreviewWorkerSupported()).toBe(true)
  })

  it('crea worker y resuelve resultado', async () => {
    const run = createExamEnginePreviewWorkerRun({ materias: [] }, {})
    const worker = FakeWorker.instances[0]
    const request = worker.messages[0]

    expect(worker.options).toEqual({ type: 'module' })
    expect(request).toMatchObject({ type: 'RUN_PREVIEW', requestId: run.requestId })

    worker.emit({
      type: 'PREVIEW_SUCCESS',
      requestId: run.requestId,
      result: { status: 'WARNING' },
    })

    await expect(run.promise).resolves.toEqual({ status: 'WARNING' })
    expect(worker.terminate).toHaveBeenCalledTimes(1)
  })

  it('cancela terminando el worker', async () => {
    const run = createExamEnginePreviewWorkerRun({ materias: [] }, {})
    const worker = FakeWorker.instances[0]

    run.cancel()

    expect(worker.postMessage).toHaveBeenCalledWith({ type: 'CANCEL_PREVIEW', requestId: run.requestId })
    expect(worker.terminate).toHaveBeenCalledTimes(1)
    await expect(run.promise).rejects.toMatchObject({ code: 'WORKER_CANCELLED' })
  })

  it('rechaza errores del worker', async () => {
    const run = createExamEnginePreviewWorkerRun({ materias: [] }, {})
    const worker = FakeWorker.instances[0]

    worker.emit({
      type: 'PREVIEW_ERROR',
      requestId: run.requestId,
      error: { code: 'EXAM_ENGINE_WORKER_ERROR', message: 'fallo seguro' },
    })

    await expect(run.promise).rejects.toMatchObject({
      code: 'EXAM_ENGINE_WORKER_ERROR',
      message: 'fallo seguro',
    })
  })

  it('aplica timeout', async () => {
    const run = createExamEnginePreviewWorkerRun({ materias: [] }, {}, { timeoutMs: 25 })
    const worker = FakeWorker.instances[0]

    vi.advanceTimersByTime(25)

    await expect(run.promise).rejects.toMatchObject({ code: 'WORKER_TIMEOUT' })
    expect(worker.terminate).toHaveBeenCalledTimes(1)
  })

  it('no ejecuta si Worker no esta disponible', async () => {
    vi.stubGlobal('Worker', undefined)

    await expect(runExamEnginePreviewInWorker({}, {})).rejects.toMatchObject({
      code: 'WORKER_NOT_SUPPORTED',
    })
    expect(FakeWorker.instances).toHaveLength(0)
  })
})
