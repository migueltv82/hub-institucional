import { describe, expect, it, vi } from 'vitest'
import {
  ApplicationError,
  ERROR_CODES,
  isRetryable,
  logError,
  normalizeError,
} from './errorHandling.js'

describe('errorHandling', () => {
  it('ApplicationError conserva codigo, mensaje, causa, metadata y stack original', () => {
    const cause = new Error('Fallo de transporte')
    const error = new ApplicationError(ERROR_CODES.LOAD_FAILED, 'No se pudo cargar', {
      cause,
      metadata: { operation: 'hydrate' },
    })

    expect(error).toMatchObject({
      name: 'ApplicationError',
      code: ERROR_CODES.LOAD_FAILED,
      message: 'No se pudo cargar',
      cause,
      metadata: { operation: 'hydrate' },
    })
    expect(error.stack).toContain(cause.stack)
  })

  it('normalizeError clasifica errores conocidos y conserva el original como causa', () => {
    const cause = Object.assign(new Error('Failed to fetch'), { code: 'ECONNRESET' })
    const normalized = normalizeError(cause, { metadata: { operation: 'read' } })

    expect(normalized).toMatchObject({
      code: ERROR_CODES.NETWORK_ERROR,
      cause,
      metadata: { operation: 'read' },
    })
  })

  it('normalizeError conserva la misma instancia de ApplicationError', () => {
    const error = new ApplicationError(ERROR_CODES.SAVE_FAILED, 'No se pudo guardar')

    expect(normalizeError(error)).toBe(error)
  })

  it.each([
    new Error('Failed to fetch'),
    Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' }),
    Object.assign(new Error('service unavailable'), { status: 503 }),
  ])('clasifica errores transitorios como retryable', (error) => {
    expect(isRetryable(error)).toBe(true)
  })

  it.each([
    new ApplicationError(ERROR_CODES.SCHEDULE_CONFLICT, 'Conflicto'),
    new ApplicationError(ERROR_CODES.INVALID_PREREQUISITES, 'Datos invalidos'),
    Object.assign(new Error('Forbidden'), { status: 403 }),
  ])('no reintenta validaciones ni autorizacion', (error) => {
    expect(isRetryable(error)).toBe(false)
  })

  it('redacta secretos de metadata, contexto y mensajes antes de registrar', () => {
    const logger = vi.fn()
    const error = new ApplicationError(ERROR_CODES.SAVE_FAILED, 'Bearer token-super-secreto', {
      cause: new Error('request?api_key=clave-real'),
      metadata: {
        nested: { password: 'password-real' },
        token: 'token-real',
      },
    })

    const entry = logError(error, {
      context: { authorization: 'Bearer credencial-real', workspaceKey: 'main' },
      logger,
    })
    const serialized = JSON.stringify(entry)

    expect(logger).toHaveBeenCalledWith('[application-error]', entry)
    expect(serialized).not.toContain('token-super-secreto')
    expect(serialized).not.toContain('clave-real')
    expect(serialized).not.toContain('password-real')
    expect(serialized).not.toContain('token-real')
    expect(serialized).not.toContain('credencial-real')
    expect(entry.context.workspaceKey).toBe('main')
  })
})
