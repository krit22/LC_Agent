import { serve } from '@hono/node-server'
import { createApp } from './app.js'

const app = createApp()

const port = Number(process.env.PORT) || 3000
const hostname = process.env.HOST || '127.0.0.1'

serve(
  {
    fetch: app.fetch,
    port,
    hostname,
  },
  (info) => {
    console.log(`🚀 LC_Agent backend is running on http://${info.address}:${info.port}`)
  }
)

export default app
