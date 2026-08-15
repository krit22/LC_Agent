import type { WASocket, WAMessage } from '@whiskeysockets/baileys'
import { normalizeMessage } from '../../gateway/message-normalizer.js'
import { isAllowedGroup, checkTrigger } from '../../gateway/trigger-filter.js'
import { processCommand } from '../../agent/brain.js'
import { reactToMessage, sendReply, setTyping, clearTyping } from './responder.js'
import { prisma } from '../../db/prisma.js'

/**
 * Register all event listeners on the Baileys socket.
 * This is the central dispatcher that wires:
 *   messages.upsert → gateway → agent brain → responder
 */
export function registerListeners(sock: WASocket): void {
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    // Only process real-time messages, not history backfills
    if (type !== 'notify') return

    for (const msg of messages) {
      try {
        await handleMessage(sock, msg)
      } catch (error) {
        console.error('[Listener] Unhandled error processing message:', error)
      }
    }
  })

  console.log('[Listener] WhatsApp event listeners registered')
}

/**
 * Process a single incoming WhatsApp message through the full pipeline.
 */
async function handleMessage(sock: WASocket, msg: WAMessage): Promise<void> {
  // Skip messages sent by us
  if (msg.key.fromMe) return

  // Step 1: Normalize the raw message
  const normalized = normalizeMessage(msg)
  if (!normalized) return

  // Step 2: Check group whitelist
  if (!isAllowedGroup(normalized.groupJid)) return

  // Step 3: Check trigger keyword
  const trigger = checkTrigger(normalized)

  if (!trigger.triggered) {
    // Not triggered — log silently and return
    // We do a non-blocking audit log insert for non-triggered messages
    // but don't await it to avoid slowing down the socket
    prisma.messageAuditLog
      .upsert({
        where: { messageId: normalized.messageId },
        create: {
          messageId: normalized.messageId,
          senderJid: normalized.senderJid,
          groupJid: normalized.groupJid,
          messageText: normalized.text,
          intentDetected: 'IGNORED',
          processed: true,
        },
        update: {},
      })
      .catch((e) => console.error('[Listener] Audit log error:', e))
    return
  }

  // Step 4: Deduplication check
  const existing = await prisma.messageAuditLog.findUnique({
    where: { messageId: normalized.messageId },
  })
  if (existing) {
    console.log(`[Listener] Duplicate message ${normalized.messageId}, skipping`)
    return
  }

  // Step 5: Create audit log entry (processed = false)
  await prisma.messageAuditLog.create({
    data: {
      messageId: normalized.messageId,
      senderJid: normalized.senderJid,
      groupJid: normalized.groupJid,
      messageText: normalized.text,
      intentDetected: null,
      processed: false,
    },
  })

  console.log(
    `[Listener] Triggered: "${trigger.commandText}" from ${normalized.senderName} in ${normalized.groupJid}`,
  )

  // Step 6: Visual feedback — react ⏳ and show typing
  await reactToMessage(sock, normalized.groupJid, msg.key, '⏳')
  await setTyping(sock, normalized.groupJid)

  try {
    // Step 7: Process through agent brain
    const result = await processCommand(
      normalized.groupJid,
      trigger.commandText!,
      normalized.senderName,
    )

    // Step 8: Send reply and update reaction
    await clearTyping(sock, normalized.groupJid)
    await sendReply(
      sock,
      normalized.groupJid,
      result.responseText,
      msg,
      normalized.mentions,
    )
    await reactToMessage(
      sock,
      normalized.groupJid,
      msg.key,
      result.success ? '✅' : '❌',
    )

    // Step 9: Mark audit log as processed
    await prisma.messageAuditLog.update({
      where: { messageId: normalized.messageId },
      data: {
        processed: true,
        intentDetected: result.success ? 'PROCESSED' : 'ERROR',
      },
    })
  } catch (error) {
    console.error('[Listener] Error in agent pipeline:', error)

    // Send error response
    await clearTyping(sock, normalized.groupJid)
    await sendReply(
      sock,
      normalized.groupJid,
      '❌ Something went wrong. Please try again.',
      msg,
    )
    await reactToMessage(sock, normalized.groupJid, msg.key, '❌')

    // Mark audit log as error
    await prisma.messageAuditLog
      .update({
        where: { messageId: normalized.messageId },
        data: { processed: true, intentDetected: 'ERROR' },
      })
      .catch(() => {})
  }
}
