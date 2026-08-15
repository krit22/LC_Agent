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
 * Check if a message comes from an allowed group.
 *
 * Invariants:
 * 1. Direct Messages (DMs) / 1-on-1 chats are STRICTLY BLOCKED to protect privacy.
 * 2. Only WhatsApp Groups (ending in @g.us) are eligible.
 * 3. If ALLOWED_GROUP_JIDS is configured, the group must also be in that allowlist.
 */
export function isAllowedGroup(groupJid: string): boolean {
  // Strict block for non-group chats (DMs, broadcasts, etc.)
  if (!isGroupChat(groupJid)) {
    return false
  }

  // If no specific group JIDs are restricted in config, all group chats are allowed
  if (config.allowedGroupJids.length === 0) {
    return true
  }

  return config.allowedGroupJids.includes(groupJid)
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
