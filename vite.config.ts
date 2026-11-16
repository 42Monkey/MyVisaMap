import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // The visa dataset (~400 kB) is bundled on purpose so the app needs no network after load.
    chunkSizeWarningLimit: 1000,
  },
})
