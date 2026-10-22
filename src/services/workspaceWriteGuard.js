// El gateway de archivos toma un lock por workspace en cada escritura (SOURCE_FILE_WORKSPACE_BUSY, 55P03)
// y no espera: si dos escrituras del mismo workspace se cruzan, una falla. Por eso las escrituras de
// esta pestana van de a una (serializeWorkspaceWrite) y un cruce con otra sesion se reintenta.
export const WORKSPACE_BUSY_MESSAGE = 'Se estaban guardando otros cambios de este espacio de trabajo al mismo tiempo. Espera unos segundos y volve a intentar.'

const DEFAULT_RETRY_DELAYS_MS = [600, 1500]

export function isWorkspaceBusyError(error) {
  return error?.code === '55P03' || String(error?.message ?? '').includes('SOURCE_FILE_WORKSPACE_BUSY')
}

function wait(ms) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, ms))
}

function toBusyError(error) {
  return Object.assign(new Error(WORKSPACE_BUSY_MESSAGE), { code: error?.code ?? '55P03' })
}

// Para llamadas que devuelven { error } (cliente de Supabase).
export async function retryWhenWorkspaceBusy(run, { delaysMs = DEFAULT_RETRY_DELAYS_MS } = {}) {
  let result = await run()
  for (const delay of delaysMs) {
    if (!isWorkspaceBusyError(result?.error)) return result
    await wait(delay)
    result = await run()
  }
  if (!isWorkspaceBusyError(result?.error)) return result
  return { ...result, error: toBusyError(result.error) }
}

// Para pasos que lanzan el error (sincronizaciones de tablas operativas).
export async function retryThrownWorkspaceBusy(run, { delaysMs = DEFAULT_RETRY_DELAYS_MS } = {}) {
  for (const delay of [...delaysMs, null]) {
    try {
      return await run()
    } catch (error) {
      if (!isWorkspaceBusyError(error)) throw error
      if (delay === null) throw toBusyError(error)
      await wait(delay)
    }
  }
  return undefined
}

const pendingWritesByWorkspace = new Map()

export function serializeWorkspaceWrite({ institutionId, workspaceKey } = {}, run) {
  const key = `${institutionId ?? ''}/${workspaceKey ?? ''}`
  const previous = pendingWritesByWorkspace.get(key) ?? Promise.resolve()
  const current = previous.catch(() => undefined).then(run)
  const tail = current.catch(() => undefined)
  pendingWritesByWorkspace.set(key, tail)
  tail.then(() => {
    if (pendingWritesByWorkspace.get(key) === tail) pendingWritesByWorkspace.delete(key)
  })
  return current
}
