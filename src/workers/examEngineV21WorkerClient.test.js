import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createExamEngineV21DraftWorkflowRun,
  isExamEngineV21WorkerSupported,
  runExamEngineV21DraftWorkflowInWorker,
} from './examEngineV21WorkerClient.js'

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

describe('examEngineV21WorkerClient', () => {
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
    expect(isExamEngineV21WorkerSupported()).toBe(true)
  })

  it('crea worker y resuelve el workflow', async () => {
    const run = createExamEngineV21DraftWorkflowRun({ workspaceSnapshot: {} })
    const worker = FakeWorker.instances[0]
    const request = worker.messages[0]

    expect(worker.options).toEqual({ type: 'module' })
    expect(request).toMatchObject({ type: 'RUN_DRAFT_WORKFLOW', requestId: run.requestId })

    worker.emit({
      type: 'DRAFT_WORKFLOW_SUCCESS',
      requestId: run.requestId,
      result: { draft: { draftExport: { rows: [] } } },
    })

    await expect(run.promise).resolves.toEqual({ draft: { draftExport: { rows: [] } } })
    expect(worker.terminate).toHaveBeenCalledTimes(1)
  })

  it('cancela terminando el worker', async () => {
    const run = createExamEngineV21DraftWorkflowRun({ workspaceSnapshot: {} })
    const worker = FakeWorker.instances[0]

    run.cancel()

    expect(worker.postMessage).toHaveBeenCalledWith({ type: 'CANCEL_DRAFT_WORKFLOW', requestId: run.requestId })
    expect(worker.terminate).toHaveBeenCalledTimes(1)
    await expect(run.promise).rejects.toMatchObject({ code: 'WORKER_CANCELLED' })
  })

  it('rechaza errores del worker', async () => {
    const run = createExamEngineV21DraftWorkflowRun({ workspaceSnapshot: {} })
    const worker = FakeWorker.instances[0]

    worker.emit({
      type: 'DRAFT_WORKFLOW_ERROR',
      requestId: run.requestId,
      error: { code: 'EXAM_ENGINE_V21_WORKER_ERROR', message: 'fallo seguro' },
    })

    await expect(run.promise).rejects.toMatchObject({
      code: 'EXAM_ENGINE_V21_WORKER_ERROR',
      message: 'fallo seguro',
    })
  })

  it('no ejecuta si Worker no esta disponible', async () => {
    vi.stubGlobal('Worker', undefined)

    await expect(runExamEngineV21DraftWorkflowInWorker({})).rejects.toMatchObject({
      code: 'WORKER_NOT_SUPPORTED',
    })
    expect(FakeWorker.instances).toHaveLength(0)
  })
})
