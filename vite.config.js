import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from "@tailwindcss/vite"


export default defineConfig(async () => ({
  plugins: [
    react(),
    tailwindcss(),
  ],
  base: '/TOQ-AI/',
  build: {
    rollupOptions: {
      output: {
        manualChunks: undefined
      }
    }
  }
}))