import { Download, Smartphone, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { usePwaInstallPrompt } from '../hooks/usePwaInstallPrompt.js'

const PWA_INSTALL_PROMPT_SEEN_KEY = 'institutional-hub:pwa-install-prompt-seen'

function hasSeenInstallPrompt() {
  try {
    return localStorage.getItem(PWA_INSTALL_PROMPT_SEEN_KEY) === 'true'
  } catch {
    return false
  }
}

function markInstallPromptSeen() {
  try {
    localStorage.setItem(PWA_INSTALL_PROMPT_SEEN_KEY, 'true')
  } catch {
    // Si localStorage no esta disponible, al menos respetamos el estado de esta sesion.
  }
}

function PwaInstallPrompt({ isAuthenticated }) {
  const { canInstall, isInstalled, install } = usePwaInstallPrompt()
  const [isDismissed, setIsDismissed] = useState(() => hasSeenInstallPrompt())
  const [isInstalling, setIsInstalling] = useState(false)
  const shouldShow = isAuthenticated && !isInstalled && !isDismissed

  useEffect(() => {
    if (!shouldShow) return

    markInstallPromptSeen()
  }, [shouldShow])

  if (!shouldShow) return null

  async function handleInstall() {
    try {
      setIsInstalling(true)
      const outcome = await install()

      if (outcome === 'accepted') {
        toast.success('App instalada correctamente.')
      }
    } catch (error) {
      toast.error(error.message || 'No se pudo iniciar la instalacion.')
    } finally {
      setIsInstalling(false)
    }
  }

  return (
    <div className="pwa-install-modal rise-in" role="dialog" aria-modal="true" aria-labelledby="pwa-install-title">
      <section className="pwa-install-modal__panel">
        <button
          className="pwa-install-modal__close"
          onClick={() => setIsDismissed(true)}
          type="button"
          aria-label="Cerrar instalacion"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="pwa-install-modal__icon">
          <Smartphone className="h-7 w-7" />
        </div>

        <div>
          <p className="soft-title">App instalada en tu dispositivo</p>
          <h2 id="pwa-install-title" className="mt-2 text-2xl font-extrabold text-slate-950">
            Descargar Institutional Hub
          </h2>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            Accede mas rapido, trabaja en ventana independiente y conserva la experiencia lista
            para operar cada vez que entres.
          </p>
        </div>

        {!canInstall && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
            Si el boton no aparece en este navegador, abri el menu de Chrome o Edge y elegi
            <strong> Instalar app</strong>.
          </div>
        )}

        <div className="flex flex-col gap-2 sm:flex-row">
          {canInstall && (
            <button
              className="btn-primary flex-1"
              disabled={isInstalling}
              onClick={handleInstall}
              type="button"
            >
              <Download className="h-4 w-4" />
              Descargar app
            </button>
          )}
          <button
            className="btn-secondary flex-1"
            onClick={() => setIsDismissed(true)}
            type="button"
          >
            Ahora no
          </button>
        </div>
      </section>
    </div>
  )
}

export default PwaInstallPrompt
