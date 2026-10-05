import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // During development, send /api requests to the backend server
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
})
