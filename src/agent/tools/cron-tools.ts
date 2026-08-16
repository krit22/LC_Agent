import { tool } from 'ai'
import { z } from 'zod'
import { Cron } from 'croner'
import { prisma } from '../../db/prisma.js'
import {
  registerJobInScheduler,
  unregisterJobFromScheduler,
  executeScheduledJob,
} from '../../services/scheduler/scheduler.js'
import {
  fetchAvailableChannels,
  resolveChannel,
} from '../../services/whatsapp/channels.js'

/**
 * Tool: listAvailableChannels
 * Lists all WhatsApp groups and direct chats the agent has access to.
 */
export const listAvailableChannels = tool({
  description:
    'List all WhatsApp group channels and direct chats the agent has access to, including their human-readable names and IDs. Use this to see which groups are available or to help the user pick a target channel.',
  inputSchema: z.object({}),
  execute: async () => {
    try {
      const channels = await fetchAvailableChannels()
      return {
        totalChannels: channels.length,
        channels: channels.map((c, idx) => ({
          number: idx + 1,
          name: c.name,
          id: c.id,
          type: c.type,
        })),
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      return { error: `Failed to list channels: ${msg}` }
    }
  },
})

/**
 * Tool: createScheduledJob
 * Schedules a recurring automated workflow or reminder targeting a specific channel.
 */
export const createScheduledJob = tool({
  description:
    'Create and schedule a recurring automated task, daily greeting, routine reminder, or autonomous workflow for a SPECIFIC channel. The prompt must be crafted with high precision as a direct self-contained instruction for the agent.',
  inputSchema: z.object({
    name: z
      .string()
      .describe(
        'Descriptive name for the scheduled routine (e.g. "Daily Spreadsheet Tracker", "Morning Briefing", "Sunday Task Review").',
      ),
    cronExpression: z
      .string()
      .describe(
        'Standard 5-part cron expression (Minute Hour Day-of-Month Month Day-of-Week). Examples: "0 8 * * *" = 8:00 AM daily, "30 9 * * 1-5" = 9:30 AM Mon-Fri, "0 20 * * 0" = 8:00 PM every Sunday.',
      ),
    prompt: z
      .string()
      .describe(
        'Precise, self-contained prompt/instructions to execute automatically when the cron triggers (e.g. "Query the Club Members spreadsheet, check for pending tasks, and post a concise 3-bullet team briefing.").',
      ),
    channelName: z
      .string()
      .optional()
      .describe(
        'The human-readable name of the target group or channel (e.g. "Core Team", "Graphic Design", "Ritu Vishwakarma").',
      ),
    targetJid: z
      .string()
      .optional()
      .describe('Direct WhatsApp group JID (e.g. "120363407152492445@g.us").'),
    timezone: z
      .string()
      .default('Asia/Kolkata')
      .describe('Timezone for execution. Defaults to "Asia/Kolkata" (IST).'),
  }),
  execute: async ({
    name,
    cronExpression,
    prompt,
    channelName,
    targetJid,
    timezone = 'Asia/Kolkata',
  }) => {
    try {
      // 1. Validate cron expression
      try {
        const testCron = new Cron(cronExpression, { timezone })
        testCron.nextRun()
      } catch (cronErr) {
        return {
          error: `Invalid cron expression "${cronExpression}". Standard format is "minute hour day month day-of-week" (e.g. "0 8 * * *" for 8 AM daily).`,
        }
      }

      // 2. Resolve target channel
      let resolvedJid = targetJid
      let resolvedName = channelName || 'Selected Channel'

      if (!resolvedJid && channelName) {
        const found = await resolveChannel(channelName)
        if (found) {
          resolvedJid = found.id
          resolvedName = found.name
        }
      }

      if (!resolvedJid) {
        const available = await fetchAvailableChannels()
        return {
          error:
            'Target channel not specified or could not be found. Please specify which channel/group to send this routine in.',
          availableChannels: available.map((c, idx) => ({
            number: idx + 1,
            name: c.name,
            id: c.id,
          })),
        }
      }

      // 3. Save in database
      const created = await prisma.scheduledJob.create({
        data: {
          name,
          cronExpression,
          prompt,
          targetJid: resolvedJid,
          timezone,
          status: 'ACTIVE',
        },
      })

      // 4. Register in in-process scheduler
      registerJobInScheduler(created)

      const testCron = new Cron(cronExpression, { timezone })
      const nextRun = testCron.nextRun()

      return {
        id: created.id,
        name: created.name,
        cronExpression: created.cronExpression,
        prompt: created.prompt,
        targetChannel: resolvedName,
        targetJid: created.targetJid,
        timezone: created.timezone,
        status: created.status,
        nextRunIST: nextRun
          ? nextRun.toLocaleString('en-IN', { timeZone: timezone })
          : 'Unknown',
        message: `Successfully scheduled routine "${created.name}" for channel "${resolvedName}" (${created.cronExpression}) in ${created.timezone}.`,
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      return {
        error: `Failed to create scheduled job: ${msg}`,
      }
    }
  },
})

/**
 * Tool: triggerScheduledJob
 * Manually executes and tests a scheduled routine immediately on demand.
 */
export const triggerScheduledJob = tool({
  description:
    'Manually trigger and test a scheduled routine immediately on demand without waiting for its scheduled cron time. Runs the full autonomous workflow and delivers the message to the target channel.',
  inputSchema: z.object({
    jobId: z.string().uuid().optional().describe('UUID of the scheduled job to test.'),
    nameSearch: z
      .string()
      .optional()
      .describe('Name search to find the scheduled job to test (e.g. "Good Morning", "Spreadsheet Tracker").'),
  }),
  execute: async ({ jobId, nameSearch }) => {
    try {
      if (!jobId && !nameSearch) {
        return { error: 'Please provide either a jobId or nameSearch.' }
      }

      const where: any = {}
      if (jobId) where.id = jobId
      if (nameSearch) {
        where.name = { contains: nameSearch, mode: 'insensitive' }
      }

      const job = await prisma.scheduledJob.findFirst({ where })
      if (!job) {
        return { error: `Scheduled routine "${nameSearch || jobId}" not found.` }
      }

      const channels = await fetchAvailableChannels()
      const channel = channels.find((c) => c.id === job.targetJid)
      const channelName = channel ? channel.name : job.targetJid

      // Execute routine immediately
      const execResult = await executeScheduledJob(job.id)

      if (!execResult.success) {
        return {
          error: `Failed to execute routine "${job.name}": ${execResult.error}`,
        }
      }

      return {
        jobId: job.id,
        jobName: job.name,
        targetChannel: channelName,
        targetJid: job.targetJid,
        promptExecuted: job.prompt,
        outputDelivered: execResult.output,
        message: `Successfully triggered and executed routine "${job.name}" on demand for "${channelName}".`,
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      return { error: `Failed to trigger routine: ${msg}` }
    }
  },
})

/**
 * Tool: listScheduledJobs
 * Lists all registered automated cron routines.
 */
export const listScheduledJobs = tool({
  description:
    'List all scheduled routines, cron jobs, automated reminders, and their next execution times.',
  inputSchema: z.object({
    status: z
      .enum(['ACTIVE', 'PAUSED'])
      .optional()
      .describe('Filter jobs by status (ACTIVE or PAUSED).'),
  }),
  execute: async ({ status }) => {
    const where: any = {}
    if (status) where.status = status

    const jobs = await prisma.scheduledJob.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    })

    const channels = await fetchAvailableChannels()
    const channelMap = new Map(channels.map((c) => [c.id, c.name]))

    return jobs.map((j) => {
      let nextRunStr = 'N/A'
      if (j.status === 'ACTIVE') {
        try {
          const testCron = new Cron(j.cronExpression, {
            timezone: j.timezone || 'Asia/Kolkata',
          })
          const next = testCron.nextRun()
          if (next) {
            nextRunStr = next.toLocaleString('en-IN', {
              timeZone: j.timezone || 'Asia/Kolkata',
            })
          }
        } catch {}
      }

      return {
        id: j.id,
        name: j.name,
        cron: j.cronExpression,
        status: j.status,
        prompt: j.prompt,
        targetChannel: channelMap.get(j.targetJid) || j.targetJid,
        targetJid: j.targetJid,
        nextRun: nextRunStr,
        lastRunAt: j.lastRunAt ? j.lastRunAt.toISOString() : 'Never',
      }
    })
  },
})

/**
 * Tool: updateScheduledJob
 * Modifies an existing automated routine.
 */
export const updateScheduledJob = tool({
  description:
    'Update, edit, pause, or resume an existing scheduled routine or cron job.',
  inputSchema: z.object({
    jobId: z.string().uuid().optional().describe('UUID of the scheduled job.'),
    nameSearch: z
      .string()
      .optional()
      .describe('Name search to find the scheduled job.'),
    cronExpression: z
      .string()
      .optional()
      .describe('New cron expression (e.g. "0 9 * * *").'),
    prompt: z.string().optional().describe('Updated prompt/instructions.'),
    channelName: z
      .string()
      .optional()
      .describe('New target group or channel name.'),
    status: z
      .enum(['ACTIVE', 'PAUSED'])
      .optional()
      .describe('Change status to ACTIVE or PAUSED.'),
  }),
  execute: async ({
    jobId,
    nameSearch,
    cronExpression,
    prompt,
    channelName,
    status,
  }) => {
    try {
      if (!jobId && !nameSearch) {
        return { error: 'Please provide either a jobId or nameSearch.' }
      }

      const where: any = {}
      if (jobId) where.id = jobId
      if (nameSearch) {
        where.name = { contains: nameSearch, mode: 'insensitive' }
      }

      const job = await prisma.scheduledJob.findFirst({ where })
      if (!job) {
        return { error: `Scheduled job "${nameSearch || jobId}" not found.` }
      }

      const dataToUpdate: any = {}
      if (cronExpression) {
        try {
          new Cron(cronExpression, { timezone: job.timezone }).nextRun()
          dataToUpdate.cronExpression = cronExpression
        } catch {
          return { error: `Invalid cron expression "${cronExpression}".` }
        }
      }
      if (prompt) dataToUpdate.prompt = prompt
      if (status) dataToUpdate.status = status
      if (channelName) {
        const found = await resolveChannel(channelName)
        if (found) {
          dataToUpdate.targetJid = found.id
        }
      }

      const updated = await prisma.scheduledJob.update({
        where: { id: job.id },
        data: dataToUpdate,
      })

      if (updated.status === 'ACTIVE') {
        registerJobInScheduler(updated)
      } else {
        unregisterJobFromScheduler(updated.id)
      }

      return {
        id: updated.id,
        name: updated.name,
        cronExpression: updated.cronExpression,
        status: updated.status,
        prompt: updated.prompt,
        targetJid: updated.targetJid,
        message: `Successfully updated routine "${updated.name}". Status: ${updated.status}.`,
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      return { error: `Failed to update job: ${msg}` }
    }
  },
})

/**
 * Tool: deleteScheduledJob
 * Permanently removes a scheduled routine.
 */
export const deleteScheduledJob = tool({
  description: 'Permanently delete and remove a scheduled routine.',
  inputSchema: z.object({
    jobId: z.string().uuid().optional().describe('UUID of the scheduled job.'),
    nameSearch: z
      .string()
      .optional()
      .describe('Name search to find the scheduled job.'),
  }),
  execute: async ({ jobId, nameSearch }) => {
    try {
      if (!jobId && !nameSearch) {
        return { error: 'Please provide either a jobId or nameSearch.' }
      }

      const where: any = {}
      if (jobId) where.id = jobId
      if (nameSearch) {
        where.name = { contains: nameSearch, mode: 'insensitive' }
      }

      const job = await prisma.scheduledJob.findFirst({ where })
      if (!job) {
        return { error: `Scheduled job "${nameSearch || jobId}" not found.` }
      }

      // 1. Unregister from in-memory scheduler
      unregisterJobFromScheduler(job.id)

      // 2. Delete from database
      await prisma.scheduledJob.delete({
        where: { id: job.id },
      })

      return {
        message: `Successfully deleted scheduled routine "${job.name}".`,
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      return { error: `Failed to delete scheduled job: ${msg}` }
    }
  },
})
