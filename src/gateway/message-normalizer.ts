import type { WAMessage, WASocket } from '@whiskeysockets/baileys'

/**
 * Normalized message payload extracted from a raw WAMessage.
 */
export interface NormalizedMessage {
  /** Raw WhatsApp message ID */
  messageId: string
  /** Group or chat JID the message came from */
  groupJid: string
  /** Sender JID (participant in group, or remoteJid for 1:1) */
  senderJid: string
  /** Sender push name (display name) */
  senderName: string
  /** Extracted plain text content */
  text: string
  /** JIDs mentioned in the message */
  mentions: string[]
  /** Whether the message was sent by the authenticated user */
  fromMe: boolean
  /** The original WAMessage for quoting replies */
  rawMessage: WAMessage
}

/**
 * Extract a clean text body and metadata from a raw Baileys WAMessage.
 * Returns null if no usable text content is found.
 */
export function normalizeMessage(
  msg: WAMessage,
  sock?: WASocket,
): NormalizedMessage | null {
  const messageId = msg.key.id
  const groupJid = msg.key.remoteJid
  const fromMe = Boolean(msg.key.fromMe)

  // Determine sender JID
  let senderJid = msg.key.participant || msg.key.remoteJid || ''
  if (fromMe && sock?.user?.id) {
    // Format user JID cleanly (strip device suffix like :1)
    senderJid = sock.user.id.replace(/:\d+@/, '@')
  }

  // Determine sender display name
  let senderName = msg.pushName
  if (!senderName) {
    senderName = fromMe ? 'You' : 'Unknown'
  }

  if (!messageId || !groupJid || !senderJid) return null

  // Extract text from the various message content shapes
  const messageContent = msg.message
  if (!messageContent) return null

  const text =
    messageContent.conversation ||
    messageContent.extendedTextMessage?.text ||
    messageContent.imageMessage?.caption ||
    messageContent.videoMessage?.caption ||
    messageContent.documentWithCaptionMessage?.message?.documentMessage
      ?.caption ||
    ''

  if (!text.trim()) return null

  // Extract mentions
  const mentions =
    messageContent.extendedTextMessage?.contextInfo?.mentionedJid || []

  return {
    messageId,
    groupJid,
    senderJid,
    senderName,
    text: text.trim(),
    mentions: [...mentions],
    fromMe,
    rawMessage: msg,
  }
}
