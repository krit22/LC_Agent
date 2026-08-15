import { tool } from 'ai'
import { z } from 'zod'
import { prisma } from '../../db/prisma.js'

export const listPeople = tool({
  description: 'Query people with optional filters.',
  inputSchema: z.object({
    name: z
      .string()
      .optional()
      .describe('Case-insensitive contains match on person name.'),
    year: z.number().optional().describe('Filter by year (e.g. 1, 2, 3, 4).'),
    domainCode: z
      .string()
      .optional()
      .describe('Filter by domain membership code.'),
  }),
  execute: async ({ name, year, domainCode }) => {
    const where: any = {}
    if (name) {
      where.name = { contains: name, mode: 'insensitive' }
    }
    if (year !== undefined) {
      where.year = year
    }
    if (domainCode) {
      where.domains = { some: { domain: { code: domainCode } } }
    }

    const people = await prisma.person.findMany({
      where,
      include: { domains: { include: { domain: true } } },
      orderBy: { name: 'asc' },
      take: 30,
    })

    return people.map((p) => ({
      id: p.id,
      name: p.name,
      year: p.year,
      role: p.role,
      phoneJid: p.phoneJid,
      domains: p.domains.map((d: any) => d.domain.name),
    }))
  },
})

export const getPerson = tool({
  description: 'Get a single person with their tasks and domains.',
  inputSchema: z.object({
    name: z
      .string()
      .optional()
      .describe('Case-insensitive contains match on person name.'),
    phoneJid: z.string().optional().describe('Exact match on phone JID.'),
  }),
  execute: async ({ name, phoneJid }) => {
    if (!name && !phoneJid) {
      return { message: 'Either name or phoneJid must be provided.' }
    }

    const where: any = {}
    if (name) {
      where.name = { contains: name, mode: 'insensitive' }
    }
    if (phoneJid) {
      where.phoneJid = phoneJid
    }

    const person = await prisma.person.findFirst({
      where,
      include: {
        domains: { include: { domain: true } },
        tasks: {
          include: { domain: true },
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
      },
    })

    if (!person) return { message: 'Person not found' }

    return {
      id: person.id,
      name: person.name,
      year: person.year,
      phoneJid: person.phoneJid,
      role: person.role,
      metadata: person.metadata,
      createdAt: person.createdAt.toISOString(),
      updatedAt: person.updatedAt.toISOString(),
      domains: person.domains.map((d: any) => d.domain.name),
      tasks: person.tasks.map((t: any) => ({
        id: t.id,
        task: t.task,
        status: t.status,
        domainName: t.domain?.name || 'None',
        dueDate: t.dueDate?.toISOString() || null,
      })),
    }
  },
})

export const createPerson = tool({
  description:
    'Add a new club member to the database and link them to their academic year and domains.',
  inputSchema: z.object({
    name: z.string().describe('Full name of the club member.'),
    year: z
      .number()
      .min(1)
      .max(4)
      .describe('Academic year of the member (1, 2, 3, or 4).'),
    phoneJid: z
      .string()
      .optional()
      .describe('Optional WhatsApp JID (e.g. 919876543210@s.whatsapp.net).'),
    role: z
      .string()
      .default('member')
      .describe('Club role (e.g. Lead, Coordinator, Core Member, member). Default is "member".'),
    domainCodes: z
      .array(z.string())
      .optional()
      .describe(
        'Array of domain codes this member belongs to (e.g. ["web_dev", "graphic_design"]).',
      ),
  }),
  execute: async ({ name, year, phoneJid, role, domainCodes }) => {
    try {
      const created = await prisma.person.create({
        data: {
          name,
          year,
          phoneJid: phoneJid || null,
          role: role || 'member',
        },
      })

      const linkedDomains = []
      if (domainCodes && domainCodes.length > 0) {
        const matchingDomains = await prisma.domain.findMany({
          where: { code: { in: domainCodes } },
        })
        for (const dom of matchingDomains) {
          await prisma.personDomain.create({
            data: {
              personId: created.id,
              domainId: dom.id,
            },
          })
          linkedDomains.push(dom.name)
        }
      }

      return {
        id: created.id,
        name: created.name,
        year: created.year,
        role: created.role,
        phoneJid: created.phoneJid,
        domains: linkedDomains,
        message: `Member ${created.name} successfully created and assigned to ${linkedDomains.join(', ') || 'no domains'}.`,
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error'
      return { error: `Failed to create member: ${msg}` }
    }
  },
})

export const updatePerson = tool({
  description:
    'Update an existing member details, academic year, role, or reassign their domains.',
  inputSchema: z.object({
    personId: z.string().uuid().optional().describe('UUID of the person to update.'),
    nameSearch: z
      .string()
      .optional()
      .describe('Case-insensitive search to identify the person by name if personId is not provided.'),
    name: z.string().optional().describe('New updated full name.'),
    year: z
      .number()
      .min(1)
      .max(4)
      .optional()
      .describe('New academic year (1, 2, 3, 4).'),
    role: z.string().optional().describe('New club role.'),
    phoneJid: z.string().optional().describe('New phone JID.'),
    domainCodes: z
      .array(z.string())
      .optional()
      .describe(
        'Replaces the member domains with this new list of domain codes (e.g. ["web_dev", "video_editing"]).',
      ),
  }),
  execute: async ({
    personId,
    nameSearch,
    name,
    year,
    role,
    phoneJid,
    domainCodes,
  }) => {
    try {
      let targetPerson
      if (personId) {
        targetPerson = await prisma.person.findUnique({ where: { id: personId } })
      } else if (nameSearch) {
        targetPerson = await prisma.person.findFirst({
          where: { name: { contains: nameSearch, mode: 'insensitive' } },
        })
      }

      if (!targetPerson) {
        return { error: 'Member not found with the provided identifier.' }
      }

      const dataToUpdate: any = {}
      if (name !== undefined) dataToUpdate.name = name
      if (year !== undefined) dataToUpdate.year = year
      if (role !== undefined) dataToUpdate.role = role
      if (phoneJid !== undefined) dataToUpdate.phoneJid = phoneJid

      const updated = await prisma.person.update({
        where: { id: targetPerson.id },
        data: dataToUpdate,
      })

      if (domainCodes !== undefined) {
        // Reset existing domains and link new ones
        await prisma.personDomain.deleteMany({
          where: { personId: targetPerson.id },
        })
        if (domainCodes.length > 0) {
          const matchingDomains = await prisma.domain.findMany({
            where: { code: { in: domainCodes } },
          })
          for (const dom of matchingDomains) {
            await prisma.personDomain.create({
              data: {
                personId: targetPerson.id,
                domainId: dom.id,
              },
            })
          }
        }
      }

      const finalPerson = await prisma.person.findUnique({
        where: { id: targetPerson.id },
        include: { domains: { include: { domain: true } } },
      })

      return {
        id: finalPerson!.id,
        name: finalPerson!.name,
        year: finalPerson!.year,
        role: finalPerson!.role,
        phoneJid: finalPerson!.phoneJid,
        domains: finalPerson!.domains.map((d: any) => d.domain.name),
        message: `Member ${finalPerson!.name} successfully updated.`,
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error'
      return { error: `Failed to update member: ${msg}` }
    }
  },
})

export const listDomains = tool({
  description: 'List all domains with member counts.',
  inputSchema: z.object({}),
  execute: async () => {
    const domains = await prisma.domain.findMany({
      include: {
        _count: {
          select: { members: true },
        },
      },
    })

    return domains.map((d) => ({
      id: d.id,
      name: d.name,
      code: d.code,
      description: d.description,
      memberCount: d._count.members,
    }))
  },
})

export const createDomain = tool({
  description: 'Add a new club domain to the database.',
  inputSchema: z.object({
    name: z.string().describe('Full human-readable domain name (e.g. "Photography & Media").'),
    code: z.string().describe('Short programmatic domain code (e.g. "photography").'),
    description: z.string().optional().describe('Description of the domain scope.'),
  }),
  execute: async ({ name, code, description }) => {
    try {
      const created = await prisma.domain.create({
        data: {
          name,
          code: code.toLowerCase().trim(),
          description: description || null,
        },
      })
      return {
        id: created.id,
        name: created.name,
        code: created.code,
        description: created.description,
        message: `Domain "${created.name}" (${created.code}) created successfully.`,
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error'
      return { error: `Failed to create domain: ${msg}` }
    }
  },
})

export const updateDomain = tool({
  description: 'Update an existing domain name or description.',
  inputSchema: z.object({
    domainCode: z.string().describe('The code of the domain to update (e.g. "web_dev").'),
    name: z.string().optional().describe('New domain name.'),
    description: z.string().optional().describe('New domain description.'),
  }),
  execute: async ({ domainCode, name, description }) => {
    try {
      const existing = await prisma.domain.findUnique({
        where: { code: domainCode },
      })
      if (!existing) return { error: `Domain with code "${domainCode}" not found.` }

      const dataToUpdate: any = {}
      if (name !== undefined) dataToUpdate.name = name
      if (description !== undefined) dataToUpdate.description = description

      const updated = await prisma.domain.update({
        where: { code: domainCode },
        data: dataToUpdate,
      })

      return {
        id: updated.id,
        name: updated.name,
        code: updated.code,
        description: updated.description,
        message: `Domain "${updated.name}" updated successfully.`,
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error'
      return { error: `Failed to update domain: ${msg}` }
    }
  },
})
