import { describe, expect, it, vi } from 'vitest'
import { deleteSourceFile, downloadSourceFiles, saveSourceFile } from './sourceFiles.js'

describe('sourceFiles service', () => {
  it('no lee el archivo cuando el guardado queda en modo local explicito', async () => {
    const file = {
      name: 'horarios.xlsx',
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      arrayBuffer: vi.fn(),
    }

    const result = await saveSourceFile({
      institutionId: null,
      workspaceKey: 'main',
      datasetKey: 'horarios',
      file,
      useRemote: false,
    })

    expect(result).toEqual({ source: 'local' })
    expect(file.arrayBuffer).not.toHaveBeenCalled()
  })

  it('devuelve local al eliminar en modo local explicito', async () => {
    const result = await deleteSourceFile({
      institutionId: '',
      workspaceKey: 'main',
      datasetKey: 'horarios',
      useRemote: false,
    })

    expect(result).toEqual({ source: 'local' })
  })

  it('falla si se solicita guardado remoto sin institucion activa', async () => {
    const file = {
      name: 'horarios.xlsx',
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      arrayBuffer: vi.fn(),
    }

    await expect(saveSourceFile({
      institutionId: null,
      workspaceKey: 'main',
      datasetKey: 'horarios',
      file,
      useRemote: true,
    })).rejects.toThrow('No hay una institucion activa')

    expect(file.arrayBuffer).not.toHaveBeenCalled()
  })

  it('explica que los originales no existen en el modo local', async () => {
    await expect(downloadSourceFiles({
      institutionId: 'inst-1',
      workspaceKey: 'main',
      useRemote: false,
    })).rejects.toThrow('solo estan disponibles')
  })
})
