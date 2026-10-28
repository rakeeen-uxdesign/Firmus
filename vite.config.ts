/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  base: '/Firmus/',
  resolve: {
    alias: {
      "@": path.resolve(process.cwd(), "./src"),
    },
  },
  test: {
    // Pure logic in src/domain/** runs in plain node — no DOM needed yet. The Discord bot's own
    // pure modules (backend/src/**) are plain JS and test the same way.
    include: ['src/**/*.{test,spec}.{ts,tsx}', 'backend/src/**/*.test.js'],
    environment: 'node',
  },
})
