import { useEffect, useMemo, useState } from 'react'

function isStandaloneDisplay() {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    window.navigator.standalone === true
  )
}

export function usePwaInstallPrompt() {
  const [installPromptEvent, setInstallPromptEvent] = useState(null)
  const [isInstalled, setIsInstalled] = useState(() => isStandaloneDisplay())

  useEffect(() => {
    function handleBeforeInstallPrompt(event) {
      event.preventDefault()
      setInstallPromptEvent(event)
    }

    function handleAppInstalled() {
      setInstallPromptEvent(null)
      setIsInstalled(true)
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.addEventListener('appinstalled', handleAppInstalled)

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
      window.removeEventListener('appinstalled', handleAppInstalled)
    }
  }, [])

  return useMemo(() => ({
    canInstall: Boolean(installPromptEvent) && !isInstalled,
    isInstalled,
    async install() {
      if (!installPromptEvent) return 'unavailable'

      installPromptEvent.prompt()
      const choice = await installPromptEvent.userChoice
      setInstallPromptEvent(null)
      return choice?.outcome ?? 'dismissed'
    },
  }), [installPromptEvent, isInstalled])
}
