import { defineConfig } from 'vite'
import { loadEnv } from 'vite'
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
    define: {
      'import.meta.env.VITE_REACT_APP_API_KEY': JSON.stringify(process.env.VITE_REACT_APP_API_KEY || env.VITE_REACT_APP_API_KEY)
    }
  }
})