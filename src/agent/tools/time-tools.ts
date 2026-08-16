import { tool } from 'ai'
import { z } from 'zod'

/**
 * Tool: getCurrentDateTime
 * Fetches real-time live date, time, weekday, timezone, and calendar references.
 */
export const getCurrentDateTime = tool({
  description:
    'Get the real-time live current date, time, weekday, timezone, and calendar references (today, tomorrow). Call this tool whenever scheduling task deadlines, interpreting relative dates ("today", "tomorrow", "this weekend"), or answering time-sensitive queries.',
  inputSchema: z.object({
    timezone: z
      .string()
      .optional()
      .describe(
        'Optional IANA timezone name (e.g. "Asia/Kolkata", "UTC"). Defaults to local/configured timezone.',
      ),
  }),
  execute: async ({ timezone }) => {
    const tz =
      timezone ||
      process.env.TIMEZONE ||
      Intl.DateTimeFormat().resolvedOptions().timeZone ||
      'Asia/Kolkata'

    const now = new Date()

    const formattedDate = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }).format(now)

    const formattedTime = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
      timeZoneName: 'short',
    }).format(now)

    const dayOfWeek = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      weekday: 'long',
    }).format(now)

    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000)
    const formattedTomorrow = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }).format(tomorrow)

    return {
      currentDate: formattedDate,
      currentTime: formattedTime,
      dayOfWeek,
      timezone: tz,
      isoTimestamp: now.toISOString(),
      calendarReferences: {
        today: formattedDate,
        tomorrow: formattedTomorrow,
      },
    }
  },
})
