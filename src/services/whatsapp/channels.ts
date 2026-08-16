import { config } from '../../config.js'
import { prisma } from '../../db/prisma.js'

export interface ChannelInfo {
  id: string
  name: string
  type: 'group' | 'direct'
}

// In-memory cache of resolved group & contact names
const groupNameCache = new Map<string, string>()
const contactNameCache = new Map<string, string>()

// Delegate for fetching live group metadata from WhatsApp socket
let groupMetadataFetcher:
  | ((jid: string) => Promise<{ subject?: string } | null>)
  | null = null

export function setGroupMetadataFetcher(
  fetcher: (jid: string) => Promise<{ subject?: string } | null>,
) {
  groupMetadataFetcher = fetcher
}

/**
 * Records a contact's push name or sender name when a message is received.
 */
export function recordContactName(jid: string, name: string) {
  if (name && name !== 'Unknown' && name !== 'WhatsApp User') {
    contactNameCache.set(jid, name)
  }
}

/**
 * Fetches all available monitored WhatsApp groups and direct chats with human-readable names.
 */
export async function fetchAvailableChannels(): Promise<ChannelInfo[]> {
  const allowedJids = config.allowedGroupJids
  const channels: ChannelInfo[] = []

  for (const jid of allowedJids) {
    if (jid.endsWith('@g.us')) {
      let groupName = groupNameCache.get(jid)

      if (!groupName && groupMetadataFetcher) {
        try {
          const meta = await groupMetadataFetcher(jid)
          if (meta && meta.subject) {
            groupName = meta.subject
            groupNameCache.set(jid, groupName)
          }
        } catch {
          // Socket metadata call fallback
        }
      }

      channels.push({
        id: jid,
        name: groupName || `WhatsApp Group (${jid.split('@')[0].slice(-6)})`,
        type: 'group',
      })
    } else {
      // 1:1 Direct Chat or LID
      let contactName = contactNameCache.get(jid)

      // Try database lookup in people table
      if (!contactName) {
        try {
          const person = await prisma.person.findFirst({
            where: { phoneJid: jid },
          })
          if (person) {
            contactName = `${person.name} (${person.role})`
            contactNameCache.set(jid, contactName)
          }
        } catch {}
      }

      channels.push({
        id: jid,
        name: contactName
          ? `Personal DM: ${contactName}`
          : `Direct Chat (${jid.split('@')[0]})`,
        type: 'direct',
      })
    }
  }

  return channels
}

/**
 * Resolves a channel name or JID search query to a specific channel record.
 */
export async function resolveChannel(searchQuery: string): Promise<ChannelInfo | null> {
  const channels = await fetchAvailableChannels()
  const q = searchQuery.toLowerCase().trim()

  // 1. Exact JID match
  const exactJid = channels.find((c) => c.id.toLowerCase() === q)
  if (exactJid) return exactJid

  // 2. Exact or substring name match
  const nameMatch = channels.find((c) => c.name.toLowerCase().includes(q))
  if (nameMatch) return nameMatch

  return null
}
