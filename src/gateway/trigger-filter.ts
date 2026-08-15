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
 * Checks if a message is from the user's "Chat with self" / "Message yourself" conversation.
 */
export function isSelfChat(
  remoteJid: string,
  fromMe: boolean,
  myUserJid?: string,
): boolean {
  if (!fromMe) return false
  if (!myUserJid) return false

  const cleanMyJid = myUserJid.split('@')[0].split(':')[0]
  const cleanRemoteJid = remoteJid.split('@')[0].split(':')[0]

  return cleanMyJid === cleanRemoteJid
}

/**
 * Check if a message comes from an eligible channel.
 *
 * Allowed channels:
 * 1. Any WhatsApp Group (ending in @g.us) that matches ALLOWED_GROUP_JIDS (if configured).
 * 2. Personal "Chat with self" (Message yourself) for bot administration & private commands.
 *
 * Blocked channels:
 * 1. 1-on-1 Direct Messages (DMs) with other contacts (to protect personal privacy).
 * 2. Broadcasts (status@broadcast).
 */
export function isAllowedChannel(
  remoteJid: string,
  fromMe: boolean,
  myUserJid?: string,
): boolean {
  // Allow "Chat with self"
  if (isSelfChat(remoteJid, fromMe, myUserJid)) {
    return true
  }

  // If not self-chat, it MUST be a group chat
  if (!isGroupChat(remoteJid)) {
    return false
  }

  // If specific group JIDs are allowlisted, verify membership
  if (config.allowedGroupJids.length === 0) {
    return true
  }

  return config.allowedGroupJids.includes(remoteJid)
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
