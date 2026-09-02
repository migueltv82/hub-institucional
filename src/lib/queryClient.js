import { QueryClient } from '@tanstack/react-query'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Backoffice y dashboards navegan mejor si reutilizan datos recientes en lugar
      // de pedir la misma lista completa cada vez que el usuario cambia de pantalla.
      staleTime: 60 * 1000,
      gcTime: 5 * 60 * 1000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})
