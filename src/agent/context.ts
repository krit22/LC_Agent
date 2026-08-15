import { config } from '../config.js'
import type { ModelMessage } from 'ai'

interface ConversationEntry {
  messages: ModelMessage[]
  lastActivity: Date
}

/**
 * In-memory sliding-window conversation context manager.
 * Maintains short-term chat history per group for follow-up questions.
 *
 * - Max messages: configurable (default 15)
 * - TTL: configurable (default 30 minutes of inactivity)
 * - Not persisted — resets on server restart
 */
class ConversationContext {
  private store = new Map<string, ConversationEntry>()
  private maxMessages: number
  private ttlMs: number

  constructor() {
    this.maxMessages = config.contextMaxMessages
    this.ttlMs = config.contextTtlMinutes * 60 * 1000
  }

  /**
   * Get conversation history for a group, pruning expired entries.
   */
  getHistory(groupJid: string): ModelMessage[] {
    const entry = this.store.get(groupJid)
    if (!entry) return []

    // Check TTL expiry
    if (Date.now() - entry.lastActivity.getTime() > this.ttlMs) {
      this.store.delete(groupJid)
      return []
    }

    return entry.messages
  }

  /**
   * Add a user message to the group's conversation history.
   */
  addUserMessage(groupJid: string, content: string): void {
    this.ensureEntry(groupJid)
    const entry = this.store.get(groupJid)!
    entry.messages.push({ role: 'user', content })
    entry.lastActivity = new Date()
    this.trim(entry)
  }

  /**
   * Add the assistant's response to the group's conversation history.
   */
  addAssistantMessage(groupJid: string, content: string): void {
    this.ensureEntry(groupJid)
    const entry = this.store.get(groupJid)!
    entry.messages.push({ role: 'assistant', content })
    entry.lastActivity = new Date()
    this.trim(entry)
  }

  /**
   * Clear conversation history for a specific group.
   */
  clear(groupJid: string): void {
    this.store.delete(groupJid)
  }

  private ensureEntry(groupJid: string): void {
    if (!this.store.has(groupJid)) {
      this.store.set(groupJid, {
        messages: [],
        lastActivity: new Date(),
      })
    }

    // Also prune stale entry on access
    const entry = this.store.get(groupJid)!
    if (Date.now() - entry.lastActivity.getTime() > this.ttlMs) {
      this.store.set(groupJid, {
        messages: [],
        lastActivity: new Date(),
      })
    }
  }

  private trim(entry: ConversationEntry): void {
    // Keep only the last N messages (sliding window)
    if (entry.messages.length > this.maxMessages) {
      entry.messages = entry.messages.slice(-this.maxMessages)
    }
  }
}

/** Singleton conversation context instance */
export const conversationContext = new ConversationContext()
