import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  // host: true so the dev server is reachable from a phone on the same wifi
  server: { host: true, port: 3000 },
})
