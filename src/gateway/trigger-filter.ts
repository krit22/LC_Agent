import { config } from '../config.js'
import type { NormalizedMessage } from './message-normalizer.js'

/**
 * Result of the trigger filter check.
 */
export interface TriggerResult {
  /** Whether the message passed the trigger gate */
  triggered: boolean
  /** The command text with trigger prefix stripped (only set if triggered) */
  commandText?: string
}

/**
 * Checks if a JID represents a WhatsApp Group chat.
 * Group JIDs always end with '@g.us'.
 */
export function isGroupChat(jid: string): boolean {
  return jid.endsWith('@g.us')
}

/**
 * Check if an incoming message is eligible for processing based on chat type & sender permissions.
 *
 * Permission Invariants:
 * 1. Groups (@g.us): Responds to BOTH messages from the user (fromMe = true)
 *    and other group participants (fromMe = false), subject to ALLOWED_GROUP_JIDS.
 * 2. Direct Messages (DMs / 1:1 chats): Responds ONLY to messages sent by the user (fromMe = true).
 *    Incoming DMs from other people (fromMe = false) are strictly ignored to prevent unauthorized access.
 */
export function isAllowedMessage(
  remoteJid: string,
  fromMe: boolean,
): boolean {
  const isGroup = isGroupChat(remoteJid)

  if (isGroup) {
    // In groups, allow both self and other members (subject to allowlist if set)
    if (config.allowedGroupJids.length === 0) {
      return true
    }
    return config.allowedGroupJids.includes(remoteJid)
  }

  // In DMs (1:1 chats), ONLY process messages sent by the user (fromMe: true)
  return fromMe
}

/**
 * Check if a message starts with the trigger keyword and extract the command.
 * The trigger match is case-insensitive.
 *
 * Examples (keyword = "lc"):
 *   "lc list all tasks"       → { triggered: true, commandText: "list all tasks" }
 *   "LC create a poster task" → { triggered: true, commandText: "create a poster task" }
 *   "hello everyone"          → { triggered: false }
 *   "lc"                      → { triggered: false } (no command after keyword)
 */
export function checkTrigger(message: NormalizedMessage): TriggerResult {
  const keyword = config.triggerKeyword
  const textLower = message.text.toLowerCase()

  // Must start with keyword followed by a space
  if (!textLower.startsWith(keyword + ' ')) {
    return { triggered: false }
  }

  const commandText = message.text.slice(keyword.length + 1).trim()
  if (!commandText) {
    return { triggered: false }
  }

  return { triggered: true, commandText }
}
