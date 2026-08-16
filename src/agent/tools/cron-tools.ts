import { tool } from 'ai'
import { z } from 'zod'
import { Cron } from 'croner'
import { prisma } from '../../db/prisma.js'
import {
  registerJobInScheduler,
  unregisterJobFromScheduler,
} from '../../services/scheduler/scheduler.js'

/**
 * Tool: createScheduledJob
 * Schedules a recurring automated workflow or reminder.
 */
export const createScheduledJob = tool({
  description:
    'Create and schedule a recurring automated task, daily greeting, routine reminder, or autonomous workflow using cron syntax (e.g. "0 8 * * *" for daily at 8 AM). Automatically registers in the database and runs continuously in Indian Standard Time (IST).',
  inputSchema: z.object({
    name: z
      .string()
      .describe(
        'Descriptive name for the scheduled routine (e.g. "Daily Good Morning", "Sunday Weekly Review", "Task Deadline Checker").',
      ),
    cronExpression: z
      .string()
      .describe(
        'Standard 5-part cron expression (Minute Hour Day-of-Month Month Day-of-Week). Examples: "0 8 * * *" = 8:00 AM daily, "30 9 * * 1-5" = 9:30 AM Mon-Fri, "0 20 * * 0" = 8:00 PM every Sunday.',
      ),
    prompt: z
      .string()
      .describe(
        'The prompt/instructions to execute automatically when the cron triggers (e.g. "Wish the group good morning with an inspiring 2-line quote from classic literature.").',
      ),
    targetJid: z
      .string()
      .optional()
      .describe(
        'WhatsApp group JID or chat JID where the result should be sent. If omitted, defaults to the active group chat.',
      ),
    timezone: z
      .string()
      .default('Asia/Kolkata')
      .describe('Timezone for execution. Defaults to "Asia/Kolkata" (IST).'),
  }),
  execute: async ({
    name,
    cronExpression,
    prompt,
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

      const finalTargetJid = targetJid || '120363407152492445@g.us'

      // 2. Save in database
      const created = await prisma.scheduledJob.create({
        data: {
          name,
          cronExpression,
          prompt,
          targetJid: finalTargetJid,
          timezone,
          status: 'ACTIVE',
        },
      })

      // 3. Register in scheduler
      registerJobInScheduler(created)

      const testCron = new Cron(cronExpression, { timezone })
      const nextRun = testCron.nextRun()

      return {
        id: created.id,
        name: created.name,
        cronExpression: created.cronExpression,
        prompt: created.prompt,
        targetJid: created.targetJid,
        timezone: created.timezone,
        status: created.status,
        nextRunIST: nextRun
          ? nextRun.toLocaleString('en-IN', { timeZone: timezone })
          : 'Unknown',
        message: `Successfully created and scheduled routine "${created.name}" (${created.cronExpression}) in ${created.timezone}.`,
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
