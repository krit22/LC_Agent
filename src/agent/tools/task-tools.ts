import { tool } from 'ai'
import { z } from 'zod'
import { prisma } from '../../db/prisma.js'

export const listTasks = tool({
  description: 'Query tasks with optional filters.',
  inputSchema: z.object({
    personName: z
      .string()
      .optional()
      .describe('Case-insensitive contains match on assignee name.'),
    domainCode: z.string().optional().describe('Filter by domain code.'),
    status: z.string().optional().describe('Filter by task status.'),
    priority: z.string().optional().describe('Filter by task priority.'),
  }),
  execute: async ({ personName, domainCode, status, priority }) => {
    const where: any = {}
    if (personName) {
      where.assignee = { name: { contains: personName, mode: 'insensitive' } }
    }
    if (domainCode) {
      where.domain = { code: domainCode }
    }
    if (status) {
      where.status = status
    }
    if (priority) {
      where.priority = priority
    }

    const tasks = await prisma.task.findMany({
      where,
      include: { assignee: true, domain: true },
      orderBy: { createdAt: 'desc' },
      take: 20,
    })

    return tasks.map((t) => ({
      id: t.id,
      task: t.task,
      description: t.description,
      assigneeName: t.assignee?.name || 'Unassigned',
      domainName: t.domain?.name || 'None',
      workflowType: t.workflowType,
      status: t.status,
      priority: t.priority,
      dueDate: t.dueDate?.toISOString() || null,
      feedback: t.feedback,
      createdAt: t.createdAt.toISOString(),
    }))
  },
})

export const getTask = tool({
  description: 'Get a single task detail.',
  inputSchema: z.object({
    taskId: z.string().uuid().optional().describe('The UUID of the task.'),
    titleSearch: z
      .string()
      .optional()
      .describe('Case-insensitive contains match on task title.'),
  }),
  execute: async ({ taskId, titleSearch }) => {
    if (!taskId && !titleSearch) {
      return { message: 'Either taskId or titleSearch must be provided.' }
    }
    const where: any = {}
    if (taskId) {
      where.id = taskId
    }
    if (titleSearch) {
      where.task = { contains: titleSearch, mode: 'insensitive' }
    }
    const task = await prisma.task.findFirst({
      where,
      include: { assignee: true, domain: true },
    })
    if (!task) return { message: 'Task not found' }

    return {
      id: task.id,
      task: task.task,
      description: task.description,
      assignee: task.assignee
        ? { id: task.assignee.id, name: task.assignee.name }
        : null,
      domain: task.domain
        ? { id: task.domain.id, name: task.domain.name, code: task.domain.code }
        : null,
      workflowType: task.workflowType,
      status: task.status,
      priority: task.priority,
      dueDate: task.dueDate?.toISOString() || null,
      feedback: task.feedback,
      metadata: task.metadata,
      createdAt: task.createdAt.toISOString(),
      updatedAt: task.updatedAt.toISOString(),
    }
  },
})

export const createTask = tool({
  description: 'Create a new task.',
  inputSchema: z.object({
    task: z.string().describe('The title of the task.'),
    description: z
      .string()
      .optional()
      .describe('A detailed description of the task.'),
    assigneeName: z
      .string()
      .optional()
      .describe(
        'Case-insensitive contains match to look up assignee person by name.',
      ),
    domainCode: z.string().optional().describe('Look up domain by its code.'),
    workflowType: z
      .string()
      .default('GENERAL')
      .describe('The type of workflow. Default is GENERAL.'),
    priority: z
      .string()
      .default('medium')
      .describe('The priority of the task. Default is medium.'),
    dueDate: z.string().optional().describe('ISO date string for the due date.'),
  }),
  execute: async ({
    task,
    description,
    assigneeName,
    domainCode,
    workflowType,
    priority,
    dueDate,
  }) => {
    let assignedToId: string | undefined = undefined
    if (assigneeName) {
      const person = await prisma.person.findFirst({
        where: { name: { contains: assigneeName, mode: 'insensitive' } },
      })
      if (person) assignedToId = person.id
    }

    let domainId: string | undefined = undefined
    if (domainCode) {
      const domain = await prisma.domain.findFirst({
        where: { code: domainCode },
      })
      if (domain) domainId = domain.id
    }

    const initialStatus =
      workflowType === 'POSTER' ? 'SEARCHING_TEMPLATES' : 'ASSIGNED'

    const created = await prisma.task.create({
      data: {
        task,
        description,
        assignedToId,
        domainId,
        workflowType,
        priority,
        status: initialStatus,
        dueDate: dueDate ? new Date(dueDate) : undefined,
      },
      include: { assignee: true, domain: true },
    })

    return {
      id: created.id,
      task: created.task,
      description: created.description,
      assigneeName: created.assignee?.name || 'Unassigned',
      domainName: created.domain?.name || 'None',
      workflowType: created.workflowType,
      status: created.status,
      priority: created.priority,
      dueDate: created.dueDate?.toISOString() || null,
      createdAt: created.createdAt.toISOString(),
    }
  },
})

export const updateTask = tool({
  description: 'Update an existing task.',
  inputSchema: z.object({
    taskId: z.string().uuid().describe('The UUID of the task to update.'),
    status: z.string().optional().describe('New status for the task.'),
    priority: z.string().optional().describe('New priority for the task.'),
    feedback: z.string().optional().describe('Feedback on the task.'),
    assigneeName: z
      .string()
      .optional()
      .describe('Case-insensitive name match to reassign.'),
    description: z.string().optional().describe('New description.'),
  }),
  execute: async ({
    taskId,
    status,
    priority,
    feedback,
    assigneeName,
    description,
  }) => {
    const existing = await prisma.task.findUnique({
      where: { id: taskId },
    })
    if (!existing) return { message: 'Task not found' }

    let assignedToId: string | undefined = undefined
    if (assigneeName) {
      const person = await prisma.person.findFirst({
        where: { name: { contains: assigneeName, mode: 'insensitive' } },
      })
      if (person) assignedToId = person.id
    }

    const dataToUpdate: any = {}
    if (status !== undefined) dataToUpdate.status = status
    if (priority !== undefined) dataToUpdate.priority = priority
    if (feedback !== undefined) dataToUpdate.feedback = feedback
    if (assignedToId !== undefined) dataToUpdate.assignedToId = assignedToId
    if (description !== undefined) dataToUpdate.description = description

    if (feedback && status === 'CHANGES_REQUESTED') {
      const currentMetadata: any = existing.metadata || {}
      const changeHistory = currentMetadata.change_history || []
      changeHistory.push({ feedback, timestamp: new Date().toISOString() })
      dataToUpdate.metadata = {
        ...currentMetadata,
        change_history: changeHistory,
      }
    }

    const updated = await prisma.task.update({
      where: { id: taskId },
      data: dataToUpdate,
      include: { assignee: true, domain: true },
    })

    return {
      id: updated.id,
      task: updated.task,
      description: updated.description,
      assigneeName: updated.assignee?.name || 'Unassigned',
      domainName: updated.domain?.name || 'None',
      workflowType: updated.workflowType,
      status: updated.status,
      priority: updated.priority,
      dueDate: updated.dueDate?.toISOString() || null,
      feedback: updated.feedback,
      updatedAt: updated.updatedAt.toISOString(),
    }
  },
})
