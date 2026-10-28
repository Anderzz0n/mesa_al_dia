import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// El backend corre en otro puerto (3000) que el frontend (5173). Un navegador
// no deja que una página de un puerto llame a otro sin permisos especiales
// (CORS). Para evitarlo, en desarrollo Vite actúa de "proxy": reenvía al
// backend todo lo que empiece por /api o /socket.io. Así el frontend siempre
// llama a su propia dirección y no hay que configurar CORS en el backend.
const BACKEND = process.env.BACKEND_URL ?? 'http://localhost:3000'

export default defineConfig({
  plugins: [react()],
  server: {
    hmr: false,
    proxy: {
      '/api': BACKEND,
      '/socket.io': { target: BACKEND, ws: true }, // ws: también reenvía WebSocket
    },
  },
})
