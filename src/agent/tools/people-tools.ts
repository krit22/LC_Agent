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
