import process from 'node:process'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
// dev เท่านั้น: ให้ /api/admin-login ทำงานใน `npm run dev` (บน Vercel ใช้ไฟล์ใน api/ โดยตรง)
const devApi = (env) => ({
  name: 'dev-admin-api',
  configureServer(server) {
    server.middlewares.use('/api/admin-login', async (req, res) => {
      process.env.ADMIN_PIN = env.ADMIN_PIN
      let raw = ''
      for await (const chunk of req) raw += chunk
      let body = {}
      try { body = JSON.parse(raw || '{}') } catch { /* body ว่าง/ไม่ใช่ JSON */ }
      const { default: handler } = await import('./api/admin-login.js')
      const out = {
        status(code) { res.statusCode = code; return out },
        json(data) { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(data)) },
      }
      handler({ method: req.method, body }, out)
    })
  },
})

export default defineConfig(({ mode }) => ({
  plugins: [react(), devApi(loadEnv(mode, process.cwd(), ''))],
}))
