import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useInteractiveTribunalSession } from '../hooks/useInteractiveTribunalSession.js'
import InteractiveVocalSelectionPanel from './InteractiveVocalSelectionPanel.jsx'

function tribunalDocente(overrides = {}) {
  return {
    id: 'doc-vocal-a',
    nombre: 'Bruno Vocal',
    activo: true,
    carrera: 'Profesorado de Historia',
    nombreMateria: 'Didactica General',
    diasAsistencia: ['jueves', 'viernes'],
    horasCatedra: 6,
    ...overrides,
  }
}

function readyReviewedMesa(overrides = {}) {
  return {
    id: 'draft:prof-historia::MAT1:PRIMER_LLAMADO',
    draftMesaId: 'draft:prof-historia::MAT1:PRIMER_LLAMADO',
    fecha: '2026-07-30',
    fechaSugerida: '2026-07-30',
    llamado: 'PRIMER_LLAMADO',
    carreraId: 'prof-historia',
    carrera: 'Profesorado de Historia',
    anio: 1,
    materiaId: 'MAT1',
    materiaMesa: 'Didactica General',
    materia: 'Didactica General',
    titularId: 'doc-titular',
    titular: 'Ana Titular',
    estado: 'READY_FOR_TRIBUNAL',
    lockedForTribunalGeneration: true,
    reviewSource: 'TEACHER_REVIEW_IMPORT',
    alertas: [],
    ...overrides,
  }
}

const examCallConfig = {
  fechaInicio: '2026-07-30',
  fechaFin: '2026-08-12',
  usarDiasHabiles: true,
  carrerasIncluidas: 'ALL',
  estadoSalida: 'TEACHER_REVIEW',
}

function Harness({ docentes, reviewedSchedule }) {
  const session = useInteractiveTribunalSession({ reviewedSchedule, docentes, examCallConfig })
  return <InteractiveVocalSelectionPanel session={session} onConfirm={() => {}} />
}

describe('InteractiveVocalSelectionPanel (UI real montada con el hook)', () => {
  it('al elegir un vocal en una mesa, deja de aparecer como opcion disponible en otra mesa por cupo agotado, y "Quitar" lo restaura', () => {
    const mesa1 = readyReviewedMesa()
    const mesa2 = readyReviewedMesa({
      id: 'draft:prof-historia::MAT2:PRIMER_LLAMADO',
      draftMesaId: 'draft:prof-historia::MAT2:PRIMER_LLAMADO',
      materiaId: 'MAT2',
      materiaMesa: 'Historia Antigua',
      materia: 'Historia Antigua',
      fecha: '2026-07-31',
      fechaSugerida: '2026-07-31',
      titularId: 'doc-titular-2',
      titular: 'Diana Titular',
    })
    const docentes = [
      tribunalDocente({ id: 'doc-titular', nombre: 'Ana Titular' }),
      tribunalDocente({ id: 'doc-titular-2', nombre: 'Diana Titular' }),
      // horasCatedra 1 -> limite mitad-mas-uno = 1 vocalia en el llamado.
      tribunalDocente({ id: 'doc-vocal-limitado', nombre: 'Bruno Limitado', horasCatedra: 1 }),
    ]

    function clickMesaListItem(materiaMesa) {
      const match = screen.getAllByText(materiaMesa).find((node) => node.closest('button'))
      fireEvent.click(match.closest('button'))
    }

    render(<Harness docentes={docentes} reviewedSchedule={[mesa1, mesa2]} />)

    // Mesa 1 (Didactica General) esta activa por defecto: Bruno aparece como
    // unica opcion disponible para Vocal 1, con cupo "1 disponible".
    expect(screen.getByText('Mesa activa')).toBeInTheDocument()
    expect(screen.getAllByText('Didactica General').length).toBeGreaterThan(0)
    // Bruno aparece dos veces: como opcion disponible tanto para Vocal 1 como Vocal 2.
    expect(screen.getAllByText(/Bruno Limitado/).length).toBe(2)
    expect(screen.getAllByText(/1 disponible/).length).toBeGreaterThan(0)

    const elegirButtons = screen.getAllByRole('button', { name: 'Elegir' })
    fireEvent.click(elegirButtons[0])

    // Bruno queda asignado como Vocal 1 de la mesa activa.
    expect(screen.getByRole('button', { name: /Quitar/ })).toBeInTheDocument()

    // Navego a la mesa 2 (Historia Antigua): Bruno ya no debe figurar como
    // opcion elegible (aunque si queda listado como descartado, con el
    // motivo SUPERA_MITAD_MAS_UNO, y en la tabla de carga docente con 0
    // disponible). Ana, que no es titular de esta mesa, sigue disponible.
    clickMesaListItem('Historia Antigua')
    const pickableForMesa2 = screen.getAllByRole('button', { name: 'Elegir' })
      .map((button) => button.closest('li').textContent)
    expect(pickableForMesa2.some((text) => text.includes('Bruno Limitado'))).toBe(false)
    expect(screen.getAllByText(/SUPERA_MITAD_MAS_UNO/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Ana Titular/).length).toBeGreaterThan(0)

    // Vuelvo a la mesa 1 y quito la seleccion: el cupo de Bruno se restaura.
    clickMesaListItem('Didactica General')
    fireEvent.click(screen.getByRole('button', { name: /Quitar/ }))

    clickMesaListItem('Historia Antigua')
    expect(screen.getAllByText(/Bruno Limitado/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/1 disponible/).length).toBeGreaterThan(0)
  })

  describe('combinar mesas', () => {
    // The combination gate checks academic compatibility; vocales can be
    // selected afterwards or prefilled from cross titulares.
    function docentesConVocales() {
      return [
        tribunalDocente({ id: 'doc-titular', nombre: 'Ana Titular' }),
        tribunalDocente({ id: 'doc-titular-2', nombre: 'Diana Titular' }),
        tribunalDocente({ id: 'doc-vocal-a', nombre: 'Bruno Vocal' }),
        tribunalDocente({ id: 'doc-vocal-b', nombre: 'Carla Vocal' }),
      ]
    }

    function buildMesas() {
      const mesa1 = readyReviewedMesa({ vocal1Id: 'doc-vocal-a', vocal2Id: 'doc-vocal-b' })
      const mesa2 = readyReviewedMesa({
        id: 'draft:prof-historia::MAT2:PRIMER_LLAMADO',
        draftMesaId: 'draft:prof-historia::MAT2:PRIMER_LLAMADO',
        materiaId: 'MAT2',
        materiaMesa: 'Historia Antigua',
        materia: 'Historia Antigua',
        fecha: '2026-07-31',
        fechaSugerida: '2026-07-31',
        titularId: 'doc-titular-2',
        titular: 'Diana Titular',
      })
      return [mesa1, mesa2]
    }

    it('combina la mesa activa con una mesa sugerida de la lista de sugerencias', () => {
      render(<Harness docentes={docentesConVocales()} reviewedSchedule={buildMesas()} />)

      const mesasPanel = screen.getByText('Mesas').closest('div')
      expect(mesasPanel.querySelectorAll('li')).toHaveLength(2)
      expect(screen.getByText('Mesas sugeridas para combinar')).toBeInTheDocument()

      const suggestionsSection = screen.getByText('Mesas sugeridas para combinar').closest('div')
      const suggestionRow = within(suggestionsSection).getByText('Historia Antigua').closest('li')
      expect(within(suggestionRow).getByText('Misma carrera')).toBeInTheDocument()
      fireEvent.click(within(suggestionRow).getByRole('button', { name: 'Combinar' }))

      expect(mesasPanel.querySelectorAll('li')).toHaveLength(1)
      expect(screen.getByText('Mesa combinada')).toBeInTheDocument()
      expect(screen.getAllByText('Didactica General').length).toBeGreaterThan(0)
      expect(screen.getAllByText('Historia Antigua').length).toBeGreaterThan(0)
    })

    it('deshace una combinacion y restaura las dos mesas originales', () => {
      render(<Harness docentes={docentesConVocales()} reviewedSchedule={buildMesas()} />)

      const suggestionsSection = screen.getByText('Mesas sugeridas para combinar').closest('div')
      const suggestionRow = within(suggestionsSection).getByText('Historia Antigua').closest('li')
      fireEvent.click(within(suggestionRow).getByRole('button', { name: 'Combinar' }))

      const mesasPanel = screen.getByText('Mesas').closest('div')
      expect(mesasPanel.querySelectorAll('li')).toHaveLength(1)

      fireEvent.click(screen.getByRole('button', { name: /Deshacer combinacion/ }))

      expect(mesasPanel.querySelectorAll('li')).toHaveLength(2)
      expect(screen.getByText('Mesas sugeridas para combinar')).toBeInTheDocument()
    })

    it('ofrece combinar mesas compatibles aunque ambas tengan el tribunal vacio', () => {
      const mesa1 = readyReviewedMesa()
      const mesa2 = readyReviewedMesa({
        id: 'draft:prof-historia::MAT2:PRIMER_LLAMADO',
        draftMesaId: 'draft:prof-historia::MAT2:PRIMER_LLAMADO',
        materiaId: 'MAT2',
        materiaMesa: 'Historia Antigua',
        materia: 'Historia Antigua',
        titularId: 'doc-titular-2',
        titular: 'Diana Titular',
      })

      render(<Harness docentes={docentesConVocales()} reviewedSchedule={[mesa1, mesa2]} />)

      const suggestionsSection = screen.getByText('Mesas sugeridas para combinar').closest('div')
      const suggestionRow = within(suggestionsSection).getByText('Historia Antigua').closest('li')
      expect(within(suggestionRow).getByRole('button', { name: 'Combinar' })).toBeInTheDocument()
    })
  })

  describe('filtro por carrera', () => {
    function docentesDeDosCarreras() {
      return [
        tribunalDocente({ id: 'doc-titular', nombre: 'Ana Titular' }),
        tribunalDocente({
          id: 'doc-titular-ingles',
          nombre: 'Ivan Titular',
          carrera: 'Profesorado de Ingles',
          nombreMateria: 'Lengua Inglesa I',
        }),
      ]
    }

    function mesasDeDosCarreras() {
      const mesaHistoria = readyReviewedMesa()
      const mesaIngles = readyReviewedMesa({
        id: 'draft:prof-ingles::ING1:PRIMER_LLAMADO',
        draftMesaId: 'draft:prof-ingles::ING1:PRIMER_LLAMADO',
        carreraId: 'prof-ingles',
        carrera: 'Profesorado de Ingles',
        materiaId: 'ING1',
        materiaMesa: 'Lengua Inglesa I',
        materia: 'Lengua Inglesa I',
        titularId: 'doc-titular-ingles',
        titular: 'Ivan Titular',
      })
      return [mesaHistoria, mesaIngles]
    }

    it('no muestra tabs de carrera cuando todas las mesas son de la misma carrera', () => {
      render(<Harness docentes={[tribunalDocente()]} reviewedSchedule={[readyReviewedMesa()]} />)

      expect(screen.queryByLabelText('Carreras de las mesas')).not.toBeInTheDocument()
      expect(screen.getByText('Mesas')).toBeInTheDocument()
    })

    it('muestra tabs de carrera y filtra la lista de mesas cuando hay mas de una carrera', () => {
      render(<Harness docentes={docentesDeDosCarreras()} reviewedSchedule={mesasDeDosCarreras()} />)

      const tabs = screen.getByLabelText('Carreras de las mesas')
      expect(within(tabs).getByRole('button', { name: /Profesorado de Historia/ })).toBeInTheDocument()
      expect(within(tabs).getByRole('button', { name: /Profesorado de Ingles/ })).toBeInTheDocument()

      const mesasPanel = screen.getByText('Mesas · Profesorado de Historia').closest('div')
      expect(mesasPanel.querySelectorAll('li')).toHaveLength(1)
      expect(within(mesasPanel).getByText('Didactica General')).toBeInTheDocument()

      fireEvent.click(within(tabs).getByRole('button', { name: /Profesorado de Ingles/ }))

      const mesasPanelIngles = screen.getByText('Mesas · Profesorado de Ingles').closest('div')
      expect(mesasPanelIngles.querySelectorAll('li')).toHaveLength(1)
      expect(within(mesasPanelIngles).getByText('Lengua Inglesa I')).toBeInTheDocument()
      expect(screen.getAllByText('Mesa activa').length).toBeGreaterThan(0)
      expect(screen.getAllByText('Lengua Inglesa I').length).toBeGreaterThan(0)
    })
  })
})
