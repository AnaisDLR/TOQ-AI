import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from "@tailwindcss/vite"


export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
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
    },
    define: {
      'process.env.VITE_API_KEY': JSON.stringify(env.VITE_REACT_APP_API_KEY)
    }
  }
})