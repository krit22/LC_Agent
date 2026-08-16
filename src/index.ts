import { serve } from '@hono/node-server'
import { createApp } from './app.js'
import { config } from './config.js'
import { createWhatsAppClient } from './services/whatsapp/client.js'
import { registerListeners } from './services/whatsapp/listener.js'
import {
  initScheduler,
  setSchedulerMessageSender,
} from './services/scheduler/scheduler.js'
import { setGroupMetadataFetcher } from './services/whatsapp/channels.js'

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

// Start WhatsApp client & autonomous scheduler
async function bootServices() {
  try {
    // 1. Initialize cron scheduler and load active jobs from PostgreSQL
    await initScheduler()

    // 2. Start WhatsApp client
    console.log('[Boot] Starting WhatsApp client...')
    const sock = await createWhatsAppClient()
    registerListeners(sock)

    // 3. Connect scheduler delivery to WhatsApp socket
    setSchedulerMessageSender(async (targetJid, text) => {
      await sock.sendMessage(targetJid, { text })
    })

    // 4. Connect group metadata discovery to WhatsApp socket
    setGroupMetadataFetcher(async (jid) => {
      try {
        return await sock.groupMetadata(jid)
      } catch {
        return null
      }
    })

    console.log('[Boot] WhatsApp client initialized. Waiting for connection...')
  } catch (error) {
    console.error('[Boot] Failed to start services:', error)
  }
}

bootServices()

export default app
