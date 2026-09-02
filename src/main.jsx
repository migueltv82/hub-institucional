import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
import '@fontsource/plus-jakarta-sans/400.css'
import '@fontsource/plus-jakarta-sans/500.css'
import '@fontsource/plus-jakarta-sans/600.css'
import '@fontsource/plus-jakarta-sans/700.css'
import '@fontsource/plus-jakarta-sans/800.css'
// Portal alumno: tipografia propia (Baloo 2 para titulos, Nunito para texto).
import '@fontsource/baloo-2/500.css'
import '@fontsource/baloo-2/600.css'
import '@fontsource/baloo-2/700.css'
import '@fontsource/nunito/400.css'
import '@fontsource/nunito/700.css'
import '@fontsource/nunito/700-italic.css'
import '@fontsource/nunito/800.css'
import './styles/globals.css'
import App from './App.jsx'
import { AuthProvider } from './auth/AuthContext.jsx'
import AppErrorBoundary from './components/AppErrorBoundary.jsx'
import { validatePublicRuntimeEnvironment } from './lib/envGuards.js'
import { queryClient } from './lib/queryClient.js'
import { registerServiceWorker } from './lib/registerServiceWorker.js'
import { initializeAppTheme } from './theme/appTheme.js'

registerServiceWorker()

validatePublicRuntimeEnvironment()
initializeAppTheme()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <AppErrorBoundary>
            <App />
          </AppErrorBoundary>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
)
