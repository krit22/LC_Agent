import { Cron } from 'croner'
import { prisma } from '../../db/prisma.js'
import { processCommand } from '../../agent/brain.js'

// In-memory registry of active Cron instances keyed by ScheduledJob ID
const activeCronJobs = new Map<string, Cron>()

// Message sender delegate (injected by WhatsApp service on connect)
let messageSender: ((targetJid: string, text: string) => Promise<void>) | null = null

/**
 * Register the outbound message delivery function (e.g. Baileys WhatsApp sendMessage).
 */
export function setSchedulerMessageSender(
  sender: (targetJid: string, text: string) => Promise<void>,
) {
  messageSender = sender
}

/**
 * Execute a scheduled autonomous job.
 */
export async function executeScheduledJob(jobId: string) {
  try {
    const job = await prisma.scheduledJob.findUnique({
      where: { id: jobId },
    })

    if (!job || job.status !== 'ACTIVE') {
      console.log(`⏰ [Scheduler] Skipping inactive or deleted job: ${jobId}`)
      return
    }

    console.log(`\n⏰ [Scheduler Triggered] Routine: "${job.name}"`)
    console.log(`   Target:   ${job.targetJid}`)
    console.log(`   Prompt:   "${job.prompt}"`)
    console.log(`   Timezone: ${job.timezone}`)

    // 1. Dispatch prompt to Agent Brain
    const result = await processCommand(
      job.targetJid,
      job.prompt,
      'Autonomous Routine',
    )

    // 2. Deliver generated message to WhatsApp target
    if (messageSender && result.responseText) {
      try {
        await messageSender(job.targetJid, result.responseText)
        console.log(`📤 [Scheduler Outgoing] Delivered "${job.name}" to ${job.targetJid}`)
      } catch (sendErr) {
        console.error(
          `❌ [Scheduler Delivery Error] Failed to send message for "${job.name}":`,
          sendErr,
        )
      }
    } else if (!messageSender) {
      console.warn(
        `⚠️ [Scheduler Warning] Message sender delegate not registered. Could not deliver message for "${job.name}".`,
      )
    }

    // 3. Update lastRunAt in database
    await prisma.scheduledJob.update({
      where: { id: jobId },
      data: { lastRunAt: new Date() },
    })
  } catch (err) {
    console.error(`❌ [Scheduler Execution Error] Job ID ${jobId}:`, err)
  }
}

/**
 * Register or replace an in-memory cron runner for a job record.
 */
export function registerJobInScheduler(job: {
  id: string
  name: string
  cronExpression: string
  timezone: string
  status: string
}) {
  // Cancel previous runner if already registered
  if (activeCronJobs.has(job.id)) {
    activeCronJobs.get(job.id)?.stop()
    activeCronJobs.delete(job.id)
  }

  if (job.status !== 'ACTIVE') return

  try {
    const runner = new Cron(
      job.cronExpression,
      {
        timezone: job.timezone || 'Asia/Kolkata',
        name: job.name,
      },
      () => {
        executeScheduledJob(job.id).catch((err) =>
          console.error(`[Scheduler Error in ${job.name}]:`, err),
        )
      },
    )

    activeCronJobs.set(job.id, runner)
    const nextRun = runner.nextRun()
    console.log(
      `⏰ [Scheduler Registered] "${job.name}" (${job.cronExpression}) -> Next run: ${nextRun ? nextRun.toISOString() : 'Never'}`,
    )
  } catch (err) {
    console.error(
      `❌ [Scheduler Parse Error] Failed to register cron for "${job.name}" with expression "${job.cronExpression}":`,
      err,
    )
  }
}

/**
 * Unregister a job runner from memory.
 */
export function unregisterJobFromScheduler(jobId: string) {
  if (activeCronJobs.has(jobId)) {
    activeCronJobs.get(jobId)?.stop()
    activeCronJobs.delete(jobId)
    console.log(`⏰ [Scheduler Stopped] Unregistered job ID: ${jobId}`)
  }
}

/**
 * Initialize all active scheduled jobs from PostgreSQL on server startup.
 */
export async function initScheduler() {
  try {
    const activeJobs = await prisma.scheduledJob.findMany({
      where: { status: 'ACTIVE' },
    })

    console.log(`\n⏰ [Scheduler Initializing] Loading active jobs from database...`)

    for (const job of activeJobs) {
      registerJobInScheduler(job)
    }

    console.log(`⏰ [Scheduler Initialized] ${activeJobs.length} active routine(s) running.`)
  } catch (err) {
    console.error(`❌ [Scheduler Init Error] Failed to load jobs from DB:`, err)
  }
}
