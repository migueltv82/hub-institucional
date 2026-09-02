import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import DevAuditSnapshotExport from './DevAuditSnapshotExport.jsx'
import { isDevAuditSnapshotRoleAuthorized } from './devAuditSnapshotAccess.js'

const mocks = vi.hoisted(() => ({
  copyFull: vi.fn(),
  downloadFull: vi.fn(),
  downloadPartial: vi.fn(),
  downloadText: vi.fn(),
  saveFull: vi.fn(),
}))

vi.mock('./workspaceSnapshotAuditExport.js', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    copyFullAnonymizedWorkspaceSnapshotAuditPayload: mocks.copyFull,
    downloadFullAnonymizedWorkspaceSnapshotAuditPayload: mocks.downloadFull,
    downloadFullAnonymizedWorkspaceSnapshotAuditText: mocks.downloadText,
    downloadWorkspaceSnapshotAuditPayload: mocks.downloadPartial,
    saveFullAnonymizedWorkspaceSnapshotAuditPayload: mocks.saveFull,
  }
})

function props(overrides = {}) {
  return {
    isSuperAdmin: true,
    snapshotPayload: {
      docentes: [{ id: 'teacher-1', nombre: 'Nombre Sensible', email: 'persona@example.edu' }],
      disponibilidadDocente: [],
      cargaHorariaDocente: [],
      fechasBloqueadasDocente: [],
      horariosDocentes: [],
      planesEstudio: [],
      correlatividades: [],
      alumnos: [],
      cronograma: [],
    },
    alumnos: [],
    correlatividades: [],
    docenteMateria: [],
    docentes: [],
    examType: 'regular',
    fechaFin: '',
    fechaInicio: '',
    generationScope: {},
    horariosDocentes: [],
    planesEstudio: [],
    regularCallRanges: {},
    selectedSpecialSubjectKeys: [],
    ...overrides,
  }
}

describe('DevAuditSnapshotExport', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.copyFull.mockResolvedValue({ copiedToClipboard: true })
    mocks.saveFull.mockResolvedValue({ savedWithFilePicker: true })
  })

  afterEach(() => {
    delete window.showSaveFilePicker
  })

  it('monta el panel y explica cuando el usuario no tiene permiso', () => {
    render(<DevAuditSnapshotExport {...props({
      detectedRole: 'viewer',
      isSuperAdmin: false,
    })} />)

    expect(screen.getByText('Herramientas DEV de auditoría de snapshot')).toBeInTheDocument()
    expect(screen.getByText('USER_NOT_SUPERADMIN')).toBeInTheDocument()
    expect(screen.getByText(/Rol detectado:/).parentElement).toHaveTextContent('viewer')
    expect(screen.queryByRole('button', {
      name: 'Exportar snapshot completo anonimizado para shadow audit',
    })).not.toBeInTheDocument()
  })

  it('muestra DEV_MODE_FALSE si la app no corre con Vite en desarrollo', () => {
    render(<DevAuditSnapshotExport {...props({ devMode: false })} />)

    expect(screen.getByText('DEV_MODE_FALSE')).toBeInTheDocument()
    expect(screen.getByText(/Modo DEV:/).parentElement).toHaveTextContent('no')
    expect(screen.queryByRole('button', {
      name: 'Exportar snapshot completo anonimizado para shadow audit',
    })).not.toBeInTheDocument()
  })

  it('muestra SNAPSHOT_PAYLOAD_MISSING si no existe snapshot exportable', () => {
    render(<DevAuditSnapshotExport {...props({ snapshotPayload: null })} />)

    expect(screen.getByText('SNAPSHOT_PAYLOAD_MISSING')).toBeInTheDocument()
    expect(screen.getByText(/Snapshot disponible:/).parentElement).toHaveTextContent('no')
    expect(screen.queryByRole('button', {
      name: 'Exportar snapshot completo anonimizado para shadow audit',
    })).not.toBeInTheDocument()
  })

  it('muestra ADVANCED_SECTION_NOT_ACTIVE cuando el panel se monta fuera de su seccion', () => {
    render(<DevAuditSnapshotExport {...props({ isAdvancedSectionActive: false })} />)

    expect(screen.getByText('ADVANCED_SECTION_NOT_ACTIVE')).toBeInTheDocument()
  })

  it('autoriza roles administrativos institucionales sin exigir superadmin global', () => {
    render(<DevAuditSnapshotExport {...props({
      detectedRole: 'admin_instituto',
      isSuperAdmin: false,
    })} />)

    expect(isDevAuditSnapshotRoleAuthorized({ detectedRole: 'admin_instituto' })).toBe(true)
    expect(screen.getByText(/Permiso superadmin:/).parentElement).toHaveTextContent('no')
    expect(screen.getByText(/Permiso de auditoría:/).parentElement).toHaveTextContent('sí')
    expect(screen.getByRole('button', {
      name: 'Exportar snapshot completo anonimizado para shadow audit',
    })).toBeInTheDocument()
  })

  it('descarga el snapshot completo anonimizado desde la vista DEV', () => {
    const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
    render(<DevAuditSnapshotExport {...props()} />)

    fireEvent.click(screen.getByRole('button', {
      name: 'Exportar snapshot completo anonimizado para shadow audit',
    }))

    expect(mocks.downloadFull).toHaveBeenCalledOnce()
    const exported = mocks.downloadFull.mock.calls[0][0]
    expect(exported._auditExport).toMatchObject({
      mode: 'FULL_ANONYMIZED_SHADOW_AUDIT',
      anonymizationApplied: true,
    })
    expect(JSON.stringify(exported)).not.toContain('Nombre Sensible')
    expect(JSON.stringify(exported)).not.toContain('persona@example.edu')
    expect(JSON.stringify(consoleSpy.mock.calls)).not.toContain('Nombre Sensible')
    expect(screen.getByText('Exportación preparada')).toBeInTheDocument()
    expect(screen.getByText('workspaceSnapshot.real.full.anon.local.json')).toBeInTheDocument()
    expect(screen.getByText(/Fuente docente estructurada:/)).toBeInTheDocument()
    consoleSpy.mockRestore()
  })

  it('muestra DOWNLOAD_TRIGGER_FAILED si el navegador rechaza la descarga', () => {
    mocks.downloadFull.mockImplementationOnce(() => {
      throw new Error('DOWNLOAD_TRIGGER_FAILED')
    })
    render(<DevAuditSnapshotExport {...props()} />)

    fireEvent.click(screen.getByRole('button', {
      name: 'Exportar snapshot completo anonimizado para shadow audit',
    }))

    expect(screen.getByRole('alert')).toHaveTextContent('DOWNLOAD_TRIGGER_FAILED')
    expect(screen.queryByText('Exportación preparada')).not.toBeInTheDocument()
  })

  it('copia el mismo snapshot anonimizado al portapapeles', async () => {
    render(<DevAuditSnapshotExport {...props()} />)

    fireEvent.click(screen.getByRole('button', {
      name: 'Copiar snapshot anonimizado al portapapeles',
    }))

    await waitFor(() => expect(mocks.copyFull).toHaveBeenCalledOnce())
    const exported = mocks.copyFull.mock.calls[0][0]
    expect(JSON.stringify(exported)).not.toContain('Nombre Sensible')
    expect(screen.getByText('Copiado al portapapeles. El navegador controla la ubicación final del archivo.')).toBeInTheDocument()
  })

  it('informa CLIPBOARD_EXPORT_FAILED sin exponer el payload', async () => {
    mocks.copyFull.mockRejectedValueOnce(new Error('CLIPBOARD_EXPORT_FAILED'))
    render(<DevAuditSnapshotExport {...props()} />)

    fireEvent.click(screen.getByRole('button', {
      name: 'Copiar snapshot anonimizado al portapapeles',
    }))

    expect(await screen.findByRole('alert')).toHaveTextContent('CLIPBOARD_EXPORT_FAILED')
    expect(screen.getByRole('alert')).not.toHaveTextContent('Nombre Sensible')
  })

  it('ofrece TXT como canal de descarga alternativo', () => {
    render(<DevAuditSnapshotExport {...props()} />)

    fireEvent.click(screen.getByRole('button', {
      name: 'Descargar snapshot anonimizado como TXT',
    }))

    expect(mocks.downloadText).toHaveBeenCalledOnce()
    expect(screen.getByText('workspaceSnapshot.real.full.anon.local.txt')).toBeInTheDocument()
  })

  it('explica el fallback cuando File System Access API no esta disponible', () => {
    render(<DevAuditSnapshotExport {...props()} />)

    expect(screen.getByText(
      'Selector de archivo no disponible en este navegador. Use descarga JSON/TXT.',
    )).toBeInTheDocument()
    expect(screen.getByText('FILE_SYSTEM_API_NOT_AVAILABLE')).toBeInTheDocument()
  })

  it('usa el selector de archivo cuando el navegador lo soporta', async () => {
    Object.defineProperty(window, 'showSaveFilePicker', {
      configurable: true,
      value: vi.fn(),
    })
    render(<DevAuditSnapshotExport {...props()} />)

    fireEvent.click(screen.getByRole('button', {
      name: 'Guardar snapshot anonimizado con selector de archivo',
    }))

    await waitFor(() => expect(mocks.saveFull).toHaveBeenCalledOnce())
    expect(screen.getByText('Guardado con selector de archivo. El navegador controla la ubicación final del archivo.')).toBeInTheDocument()
  })

  it('mantiene diferenciada la exportacion parcial legacy', () => {
    const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
    render(<DevAuditSnapshotExport {...props()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Exportar snapshot parcial legacy' }))

    expect(mocks.downloadPartial).toHaveBeenCalledOnce()
    expect(mocks.downloadFull).not.toHaveBeenCalled()
    consoleSpy.mockRestore()
  })

  it('queda cargado lazy y protegido por la seccion avanzada solo DEV', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/components/GeneradorCronograma.jsx'), 'utf8')

    expect(source).toContain("lazy(() => import('./generadorCronograma/DevAuditSnapshotExport.jsx'))")
    expect(source).toContain('<DevAuditSnapshotExport')
    expect(source).toContain("activeDashboardSection === 'advanced'")
    expect(source).toContain('import.meta.env.DEV && devAuditRoleAuthorized')
  })
})
