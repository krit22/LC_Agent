import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  useMultiFileAuthState,
} from '@whiskeysockets/baileys'
import { Boom } from '@hapi/boom'
import pino from 'pino'

const logger = pino({ level: process.env.NODE_ENV === 'development' ? 'debug' : 'silent' })

export let activeSock: ReturnType<typeof makeWASocket> | null = null

export const getSocket = () => {
  if (!activeSock) {
    throw new Error('Socket not connected')
  }
  return activeSock
}

export async function createWhatsAppClient() {
  const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys')
  const { version } = await fetchLatestBaileysVersion()

  const sock = makeWASocket({
    version,
    logger,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger)
    },
    printQRInTerminal: true
  })

  activeSock = sock

  sock.ev.process(async (events) => {
    if (events['creds.update']) {
      await saveCreds()
    }
    
    if (events['connection.update']) {
      const update = events['connection.update']
      const { connection, lastDisconnect } = update

      if (connection === 'close') {
        const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut
        
        if (shouldReconnect) {
          console.log('[WhatsApp] Connection lost. Reconnecting...')
          createWhatsAppClient()
        } else {
          console.log('[WhatsApp] Connection closed. Logged out.')
        }
      } else if (connection === 'open') {
        console.log('[WhatsApp] ✅ Connected to WhatsApp')
      }
    }
  })

  return sock
}
