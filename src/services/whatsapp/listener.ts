import type { WASocket, WAMessage } from '@whiskeysockets/baileys'
import { normalizeMessage } from '../../gateway/message-normalizer.js'
import { isAllowedGroup, isGroupChat, checkTrigger } from '../../gateway/trigger-filter.js'
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
  // Step 1: Normalize the raw message (passes sock to resolve self JID/name)
  const normalized = normalizeMessage(msg, sock)
  if (!normalized) return

  const isGroup = isGroupChat(normalized.groupJid)
  const chatType = isGroup ? 'Group' : 'Direct Chat (DM)'
  const senderTag = normalized.fromMe ? `${normalized.senderName} [Self / Admin]` : normalized.senderName

  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
  console.log(`📨 [WhatsApp Ingested]`)
  console.log(`   From:    ${senderTag} (${normalized.senderJid})`)
  console.log(`   Chat:    ${normalized.groupJid} [${chatType}]`)
  console.log(`   Content: "${normalized.text}"`)

  // Step 2: Strict Block for Direct Messages (DMs)
  if (!isGroup) {
    console.log(`   Action:  ⏭️ Ignored (Direct Messages / DMs are strictly blocked. Group chats only.)`)
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
    return
  }

  // Step 3: Check group whitelist
  if (!isAllowedGroup(normalized.groupJid)) {
    console.log(`   Action:  ⏭️ Ignored (Group not in ALLOWED_GROUP_JIDS)`)
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
    return
  }

  // Step 4: Check trigger keyword
  const trigger = checkTrigger(normalized)

  if (!trigger.triggered) {
    console.log(`   Action:  ⏭️ Ignored (No '${process.env.TRIGGER_KEYWORD || 'lc'} ' trigger prefix)`)
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)

    // Save non-blocking audit log
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

  console.log(`   Action:  🟢 TRIGGER ACTIVATED! Command: "${trigger.commandText}"`)

  // Step 5: Deduplication check
  const existing = await prisma.messageAuditLog.findUnique({
    where: { messageId: normalized.messageId },
  })
  if (existing) {
    console.log(`   Status:  ⚠️ Duplicate message ID (${normalized.messageId}), skipping`)
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
    return
  }

  // Step 6: Create audit log entry (processed = false)
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

  // Step 7: Visual feedback — react ⏳ and show typing
  console.log(`   Feedback: Reacting with ⏳ & setting presence to 'composing'...`)
  await reactToMessage(sock, normalized.groupJid, msg.key, '⏳')
  await setTyping(sock, normalized.groupJid)

  try {
    // Step 8: Process through agent brain
    const result = await processCommand(
      normalized.groupJid,
      trigger.commandText!,
      normalized.senderName,
    )

    // Step 9: Send reply and update reaction
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

    console.log(`\n📤 [WhatsApp Outgoing] Quoted reply sent back to ${normalized.groupJid} with reaction ${result.success ? '✅' : '❌'}`)
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)

    // Step 10: Mark audit log as processed
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
