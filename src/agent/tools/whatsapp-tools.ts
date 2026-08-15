import { tool } from 'ai'
import { z } from 'zod'
import { getSocket } from '../../services/whatsapp/client.js'
import { prisma } from '../../db/prisma.js'

export const listWhatsAppGroups = tool({
  description:
    'List all WhatsApp groups that this bot/account is currently a member of, along with participant counts.',
  inputSchema: z.object({
    searchName: z
      .string()
      .optional()
      .describe('Optional search query to filter groups by name/subject.'),
  }),
  execute: async ({ searchName }) => {
    try {
      const sock = getSocket()
      const participating = await sock.groupFetchAllParticipating()

      let groups = Object.values(participating).map((g) => ({
        groupJid: g.id,
        name: g.subject,
        participantCount: g.participants?.length || 0,
        description: g.desc || '',
        creationTime: g.creation ? new Date(g.creation * 1000).toISOString() : null,
      }))

      if (searchName) {
        const query = searchName.toLowerCase()
        groups = groups.filter((g) => g.name.toLowerCase().includes(query))
      }

      return {
        totalGroups: groups.length,
        groups,
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error'
      return { error: `Failed to fetch WhatsApp groups: ${msg}` }
    }
  },
})

export const getWhatsAppGroupMembers = tool({
  description:
    'Fetch the participant roster (phone numbers, WhatsApp JIDs, admin status) of a specific group.',
  inputSchema: z.object({
    groupJid: z
      .string()
      .optional()
      .describe(
        'The WhatsApp group JID (e.g. 120363...@g.us). If omitted and groupName is given, searches by name.',
      ),
    groupName: z
      .string()
      .optional()
      .describe(
        'Case-insensitive name of the WhatsApp group if groupJid is not known.',
      ),
  }),
  execute: async ({ groupJid, groupName }) => {
    try {
      const sock = getSocket()
      let targetJid = groupJid

      if (!targetJid && groupName) {
        const participating = await sock.groupFetchAllParticipating()
        const found = Object.values(participating).find((g) =>
          g.subject.toLowerCase().includes(groupName.toLowerCase()),
        )
        if (!found) {
          return {
            error: `Could not find a group matching "${groupName}". Use listWhatsAppGroups to see available groups.`,
          }
        }
        targetJid = found.id
      }

      if (!targetJid) {
        return { error: 'Please provide either a groupJid or groupName.' }
      }

      const metadata = await sock.groupMetadata(targetJid)
      const participants = metadata.participants.map((p) => {
        // Extract phone number from JID (e.g. 919876543210@s.whatsapp.net -> +91 9876543210)
        const phone = p.id.split('@')[0].split(':')[0]
        return {
          phoneJid: p.id.split(':')[0] + '@s.whatsapp.net',
          phoneNumber: phone,
          isAdmin: Boolean(p.admin),
          adminRole: p.admin || 'member',
        }
      })

      return {
        groupJid: metadata.id,
        groupName: metadata.subject,
        description: metadata.desc || '',
        totalMembers: participants.length,
        members: participants,
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error'
      return { error: `Failed to fetch group members: ${msg}` }
    }
  },
})

export const syncGroupMembersToDb = tool({
  description:
    'Automatically extract all participants from a WhatsApp group and upsert them into the club database (people table), linking them to default domains if provided.',
  inputSchema: z.object({
    groupJid: z
      .string()
      .optional()
      .describe('The WhatsApp group JID to sync members from.'),
    groupName: z
      .string()
      .optional()
      .describe('The name of the WhatsApp group to search and sync members from.'),
    defaultYear: z
      .number()
      .min(1)
      .max(4)
      .default(1)
      .describe('Default academic year (1-4) to assign to newly added members. Defaults to 1.'),
    domainCodes: z
      .array(z.string())
      .optional()
      .describe(
        'Optional array of domain codes (e.g. ["web_dev", "graphic_design"]) to assign to all synced members.',
      ),
  }),
  execute: async ({ groupJid, groupName, defaultYear, domainCodes }) => {
    try {
      const sock = getSocket()
      let targetJid = groupJid

      if (!targetJid && groupName) {
        const participating = await sock.groupFetchAllParticipating()
        const found = Object.values(participating).find((g) =>
          g.subject.toLowerCase().includes(groupName.toLowerCase()),
        )
        if (!found) {
          return { error: `Could not find a group matching "${groupName}".` }
        }
        targetJid = found.id
      }

      if (!targetJid) {
        return { error: 'Please provide either a groupJid or groupName.' }
      }

      const metadata = await sock.groupMetadata(targetJid)
      const domainRecords = domainCodes && domainCodes.length > 0
        ? await prisma.domain.findMany({ where: { code: { in: domainCodes } } })
        : []

      const results = []
      let newlyCreated = 0
      let updated = 0

      for (const p of metadata.participants) {
        const cleanJid = p.id.split(':')[0] + '@s.whatsapp.net'
        const phone = p.id.split('@')[0].split(':')[0]
        const role = p.admin ? 'Coordinator' : 'member'

        // Check if person exists by phoneJid
        const existing = await prisma.person.findUnique({
          where: { phoneJid: cleanJid },
        })

        let personRecord
        if (existing) {
          personRecord = await prisma.person.update({
            where: { id: existing.id },
            data: {
              role: p.admin && existing.role === 'member' ? 'Coordinator' : existing.role,
            },
          })
          updated++
        } else {
          personRecord = await prisma.person.create({
            data: {
              name: `+${phone}`,
              year: defaultYear,
              phoneJid: cleanJid,
              role,
            },
          })
          newlyCreated++
        }

        // Link domains if provided
        for (const dom of domainRecords) {
          await prisma.personDomain.upsert({
            where: {
              personId_domainId: {
                personId: personRecord.id,
                domainId: dom.id,
              },
            },
            create: {
              personId: personRecord.id,
              domainId: dom.id,
            },
            update: {},
          })
        }

        results.push({
          id: personRecord.id,
          name: personRecord.name,
          phoneJid: cleanJid,
          role: personRecord.role,
        })
      }

      return {
        groupName: metadata.subject,
        groupJid: metadata.id,
        totalProcessed: metadata.participants.length,
        newlyCreated,
        updated,
        assignedDomains: domainRecords.map((d) => d.name),
        members: results,
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error'
      return { error: `Failed to sync group members: ${msg}` }
    }
  },
})
