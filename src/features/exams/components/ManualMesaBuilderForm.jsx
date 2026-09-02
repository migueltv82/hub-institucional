import { useMemo, useState } from 'react'
import { PlusCircle, Send, Trash2 } from 'lucide-react'
import { getSubjectCareer, getSubjectCode, getSubjectName } from '../../../utils/examEngine/normalize/subjects.js'
import {
  buildTribunalDocenteMap,
  findTribunalDocente,
} from '../../../utils/examEngine/planning/tribunals/buildTribunalCandidatePool.js'
import { buildManualMesa } from '../../../utils/examEngine/planning/manual/buildManualMesa.js'

const ESTADO_BADGES = {
  TRIBUNAL_COMPLETE: { label: 'Completo', className: 'bg-emerald-100 text-emerald-800' },
  TRIBUNAL_MINIMUM: { label: 'Mínimo (1 vocal)', className: 'bg-amber-100 text-amber-900' },
  TRIBUNAL_INCOMPLETE: { label: 'Sin vocales', className: 'bg-rose-100 text-rose-800' },
}

const EMPTY_DRAFT = {
  materiaCodigo: '',
  materiaNombre: '',
  carrera: '',
  anio: '',
  titularInput: '',
  vocal1Input: '',
  vocal2Input: '',
  fecha: '',
  turno: '',
}

function clean(value) {
  return String(value ?? '').trim()
}

function isTechnicalTeacherLabel(value) {
  const text = clean(value)
  if (!text) return true

  return (
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text) ||
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text) ||
    /^(doc|teacher|profesor|docente)[-_][a-z0-9][a-z0-9_-]*$/i.test(text)
  )
}

function getTeacherDisplayLabel(docente = {}) {
  if (!docente) return ''

  if (typeof docente === 'string') {
    return isTechnicalTeacherLabel(docente) ? '' : clean(docente)
  }

  return [
    docente.display_name,
    docente.displayName,
    docente.full_name,
    docente.fullName,
    docente.nombreCompleto,
    docente.apellidoNombre,
    docente.profesor,
    docente.docente,
    docente.teacherName,
    docente.teacher_name,
    docente.nombre,
  ].map(clean).find((value) => value && !isTechnicalTeacherLabel(value)) ?? ''
}

function getMateriaAnio(materia = {}) {
  const raw = materia.anio ?? materia.año ?? materia.year ?? materia.nivel
  const numeric = Number(raw)
  return Number.isFinite(numeric) ? numeric : clean(raw)
}

function getMateriaTitularId(materia = {}) {
  return clean(
    materia.titularId ??
    materia.titular_id ??
    materia.docenteTitularId ??
    materia.profesorTitularId ??
    materia.titular?.id,
  )
}

function getMateriaTitularLabel(materia = {}) {
  return [
    materia.titularNombre,
    materia.profesorTitular,
    materia.docenteTitular,
    materia.titular?.nombre,
    materia.titular,
  ].map(clean).find((value) => value && !isTechnicalTeacherLabel(value)) ?? ''
}

function buildMateriaOptions(materias = []) {
  return materias.map((materia) => {
    const codigo = getSubjectCode(materia)
    const nombre = getSubjectName(materia)
    const carrera = getSubjectCareer(materia)
    const anio = getMateriaAnio(materia)
    const titularId = getMateriaTitularId(materia)
    return {
      codigo,
      nombre,
      carrera,
      anio,
      titularId,
      titularLabel: getMateriaTitularLabel(materia),
      label: [codigo, nombre].filter(Boolean).join(' - ') + (carrera ? ` (${carrera}${anio !== '' ? `, ${anio}° año` : ''})` : ''),
    }
  }).filter((option) => option.codigo || option.nombre)
}

function resolveTitularInput(option = {}, docenteMap = new Map()) {
  const docente = option.titularId ? findTribunalDocente(docenteMap, option.titularId) : null
  return getTeacherDisplayLabel(docente) || option.titularLabel || ''
}

function ManualMesaBuilderForm({
  docentes = [],
  isBusy = false,
  materias = [],
  onConfirm,
}) {
  const [draft, setDraft] = useState(EMPTY_DRAFT)
  const [mesas, setMesas] = useState([])

  const docenteMap = useMemo(() => buildTribunalDocenteMap(docentes), [docentes])
  const docenteOptions = useMemo(() => (
    [...new Set(docentes.map(getTeacherDisplayLabel).filter(Boolean))].sort()
  ), [docentes])
  const materiaOptions = useMemo(() => buildMateriaOptions(materias), [materias])
  const materiaByLabel = useMemo(() => new Map(materiaOptions.map((option) => [option.label, option])), [materiaOptions])

  function updateDraft(field, value) {
    setDraft((current) => ({ ...current, [field]: value }))
  }

  function selectMateria(label) {
    const match = materiaByLabel.get(label)
    if (match) {
      const titularInput = resolveTitularInput(match, docenteMap)
      setDraft((current) => ({
        ...current,
        materiaCodigo: match.codigo,
        materiaNombre: match.nombre,
        carrera: match.carrera || current.carrera,
        anio: match.anio !== '' ? match.anio : current.anio,
        titularInput,
      }))
      return
    }

    setDraft((current) => ({ ...current, materiaNombre: label }))
  }

  const canAdd = Boolean(clean(draft.materiaCodigo) || clean(draft.materiaNombre))

  function buildCurrentDraftMesa(index = mesas.length) {
    return buildManualMesa({
      ...draft,
      docenteMap,
      index,
    })
  }

  function addMesa() {
    if (!canAdd) return

    const mesa = buildCurrentDraftMesa()
    setMesas((current) => [...current, mesa])
    setDraft(EMPTY_DRAFT)
  }

  function removeMesa(draftMesaId) {
    setMesas((current) => current.filter((mesa) => mesa.draftMesaId !== draftMesaId))
  }

  function confirmMesas() {
    if (mesas.length) {
      onConfirm?.(mesas)
      return
    }

    if (canAdd) onConfirm?.([buildCurrentDraftMesa(0)])
  }

  const canContinue = Boolean(mesas.length || canAdd)

  return (
    <section className="soft-card" aria-label="Armado manual de mesas especiales">
      <p className="soft-title">Llamado especial</p>
      <h3 className="mt-2 text-2xl font-extrabold text-slate-950">Cargá cada mesa a mano</h3>
      <p className="mt-2 max-w-2xl text-sm font-bold text-slate-600">
        Sin generador automático: agregá una mesa por vez con su titular y vocales, y seguí a envío a docentes cuando termines.
      </p>

      <div className="mt-5 grid gap-4 lg:grid-cols-3">
        <label className="block text-sm font-bold text-slate-700 lg:col-span-2">
          Materia
          <input
            className="input-base mt-2"
            disabled={isBusy}
            list="manual-mesa-materia-options"
            placeholder="Código - nombre de la materia"
            value={draft.materiaNombre || draft.materiaCodigo}
            onChange={(event) => selectMateria(event.target.value)}
          />
          <datalist id="manual-mesa-materia-options">
            {materiaOptions.map((option) => <option key={option.label} value={option.label} />)}
          </datalist>
        </label>

        <label className="block text-sm font-bold text-slate-700">
          Código
          <input
            className="input-base mt-2"
            disabled={isBusy}
            value={draft.materiaCodigo}
            onChange={(event) => updateDraft('materiaCodigo', event.target.value)}
          />
        </label>

        <label className="block text-sm font-bold text-slate-700">
          Carrera
          <input
            className="input-base mt-2"
            disabled={isBusy}
            value={draft.carrera}
            onChange={(event) => updateDraft('carrera', event.target.value)}
          />
        </label>

        <label className="block text-sm font-bold text-slate-700">
          Año
          <input
            className="input-base mt-2"
            disabled={isBusy}
            value={draft.anio}
            onChange={(event) => updateDraft('anio', event.target.value)}
          />
        </label>

        <label className="block text-sm font-bold text-slate-700">
          Fecha
          <input
            className="input-base mt-2"
            disabled={isBusy}
            type="date"
            value={draft.fecha}
            onChange={(event) => updateDraft('fecha', event.target.value)}
          />
        </label>

        <label className="block text-sm font-bold text-slate-700">
          Turno
          <input
            className="input-base mt-2"
            disabled={isBusy}
            placeholder="Mañana, tarde..."
            value={draft.turno}
            onChange={(event) => updateDraft('turno', event.target.value)}
          />
        </label>

        <label className="block text-sm font-bold text-slate-700">
          Titular
          <input
            className="input-base mt-2"
            disabled={isBusy}
            list="manual-mesa-docente-options"
            value={draft.titularInput}
            onChange={(event) => updateDraft('titularInput', event.target.value)}
          />
        </label>

        <label className="block text-sm font-bold text-slate-700">
          Vocal 1
          <input
            className="input-base mt-2"
            disabled={isBusy}
            list="manual-mesa-docente-options"
            value={draft.vocal1Input}
            onChange={(event) => updateDraft('vocal1Input', event.target.value)}
          />
        </label>

        <label className="block text-sm font-bold text-slate-700">
          Vocal 2
          <input
            className="input-base mt-2"
            disabled={isBusy}
            list="manual-mesa-docente-options"
            value={draft.vocal2Input}
            onChange={(event) => updateDraft('vocal2Input', event.target.value)}
          />
        </label>
      </div>

      <datalist id="manual-mesa-docente-options">
        {docenteOptions.map((nombre) => <option key={nombre} value={nombre} />)}
      </datalist>

      <button className="btn-secondary mt-4" disabled={isBusy || !canAdd} type="button" onClick={addMesa}>
        <PlusCircle className="h-4 w-4" />
        Agregar mesa
      </button>

      {mesas.length > 0 && (
        <div className="mt-5 overflow-x-auto rounded-md border border-slate-200">
          <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
            <thead className="bg-slate-50 text-xs font-extrabold uppercase tracking-[0.12em] text-slate-500">
              <tr>
                <th className="px-3 py-2">Materia</th>
                <th className="px-3 py-2">Carrera</th>
                <th className="px-3 py-2">Fecha</th>
                <th className="px-3 py-2">Titular</th>
                <th className="px-3 py-2">Vocal 1</th>
                <th className="px-3 py-2">Vocal 2</th>
                <th className="px-3 py-2">Estado</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {mesas.map((mesa) => {
                const badge = ESTADO_BADGES[mesa.estado] ?? ESTADO_BADGES.TRIBUNAL_INCOMPLETE
                return (
                  <tr key={mesa.draftMesaId}>
                    <td className="px-3 py-2 font-extrabold text-slate-950">{mesa.materiaMesa}</td>
                    <td className="px-3 py-2 text-slate-700">{mesa.carrera}</td>
                    <td className="px-3 py-2 text-slate-700">{mesa.fecha}</td>
                    <td className="px-3 py-2 text-slate-700">{mesa.titular || '—'}</td>
                    <td className="px-3 py-2 text-slate-700">{mesa.vocal1 || '—'}</td>
                    <td className="px-3 py-2 text-slate-700">{mesa.vocal2 || '—'}</td>
                    <td className="px-3 py-2">
                      <span className={`rounded-full px-2 py-1 text-[10px] font-extrabold uppercase tracking-wide ${badge.className}`}>
                        {badge.label}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        aria-label={`Quitar ${mesa.materiaMesa}`}
                        className="text-rose-700 hover:text-rose-900"
                        disabled={isBusy}
                        type="button"
                        onClick={() => removeMesa(mesa.draftMesaId)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <button
        className="btn-primary mt-5"
        disabled={isBusy || !canContinue}
        type="button"
        onClick={confirmMesas}
      >
        <Send className="h-4 w-4" />
        Continuar a envío a docentes
      </button>
    </section>
  )
}

export default ManualMesaBuilderForm
