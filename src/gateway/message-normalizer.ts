import type { WAMessage } from '@whiskeysockets/baileys'

/**
 * Normalized message payload extracted from a raw WAMessage.
 */
export interface NormalizedMessage {
  /** Raw WhatsApp message ID */
  messageId: string
  /** Group JID the message came from */
  groupJid: string
  /** Sender JID (participant in group, or remoteJid for 1:1) */
  senderJid: string
  /** Sender push name (display name) */
  senderName: string
  /** Extracted plain text content */
  text: string
  /** JIDs mentioned in the message */
  mentions: string[]
  /** The original WAMessage for quoting replies */
  rawMessage: WAMessage
}

/**
 * Extract a clean text body and metadata from a raw Baileys WAMessage.
 * Returns null if no usable text content is found.
 */
export function normalizeMessage(msg: WAMessage): NormalizedMessage | null {
  const messageId = msg.key.id
  const groupJid = msg.key.remoteJid
  const senderJid = msg.key.participant || msg.key.remoteJid
  const senderName = msg.pushName || 'Unknown'

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
    rawMessage: msg,
  }
}
