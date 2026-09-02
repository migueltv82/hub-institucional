import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    dedupe: ['react', 'react-dom'],
  },
  cacheDir: '.vite-cache',
  build: {
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Separamos vendors grandes para que el cache del navegador sobreviva mejor
          // a cambios de codigo de negocio y para diferir librerias documentales.
          if (id.includes('node_modules/@supabase')) {
            return 'supabase-vendor'
          }

          if (
            id.includes('node_modules/react/') ||
            id.includes('node_modules/react-dom/') ||
            id.includes('node_modules/react-router-dom/') ||
            id.includes('node_modules/@tanstack/react-query/')
          ) {
            return 'react-vendor'
          }

          if (id.includes('node_modules/exceljs')) {
            return 'excel-vendor'
          }

          if (id.includes('node_modules/mammoth')) {
            return 'docx-vendor'
          }
        },
      },
    },
  },
})
