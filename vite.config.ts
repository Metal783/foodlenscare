import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

export default defineConfig({
  // Public resources stay in one place; the Python service serves them directly.
  build: { copyPublicDir: false },
  plugins: [
    react(),
    tailwindcss(),
    { name: 'local-robots', generateBundle() { this.emitFile({ type: 'asset', fileName: 'robots.txt', source: 'User-agent: *\nDisallow: /\n' }) } },
  ],
  resolve: { alias: { '@': path.resolve(import.meta.dirname, './src') } },
  server: {
    host: '127.0.0.1',
    port: parseInt(process.env.PORT || '8443'),
    strictPort: true,
    proxy: { '/api': { target: process.env.FLC_API_URL || 'http://127.0.0.1:5184', changeOrigin: false } },
  },
})
