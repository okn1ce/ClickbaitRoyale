import { defineConfig, type UserConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    // This allows the app to work if you accidentally use process.env
    'process.env': {}
  }
} as UserConfig)