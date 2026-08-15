import { serve } from '@hono/node-server'
import { createApp } from './app.js'
import { config } from './config.js'
import { createWhatsAppClient } from './services/whatsapp/client.js'
import { registerListeners } from './services/whatsapp/listener.js'

const app = createApp()

// Start HTTP server
serve(
  {
    fetch: app.fetch,
    port: config.port,
    hostname: config.host,
  },
  (info) => {
    console.log(
      `🚀 LC_Agent backend is running on http://${info.address}:${info.port}`,
    )
  },
)

// Start WhatsApp client
async function bootWhatsApp() {
  try {
    console.log('[Boot] Starting WhatsApp client...')
    const sock = await createWhatsAppClient()
    registerListeners(sock)
    console.log('[Boot] WhatsApp client initialized. Waiting for connection...')
  } catch (error) {
    console.error('[Boot] Failed to start WhatsApp client:', error)
    // Don't crash the HTTP server if WhatsApp fails to connect
  }
}

bootWhatsApp()

export default app
