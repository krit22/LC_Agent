import { tool } from 'ai'
import { z } from 'zod'

/**
 * Tool: getCurrentDateTime
 * Fetches real-time live date, time, weekday, timezone, and calendar references in Indian Standard Time (IST).
 */
export const getCurrentDateTime = tool({
  description:
    'Get the real-time live current date, time, weekday, and calendar references (today, tomorrow) in Indian Standard Time (IST / Asia/Kolkata). Call this tool whenever scheduling task deadlines, interpreting relative dates ("today", "tomorrow", "this weekend"), or answering time-sensitive queries.',
  inputSchema: z.object({
    timezone: z
      .string()
      .default('Asia/Kolkata')
      .describe(
        'IANA timezone name. Defaults to "Asia/Kolkata" (Indian Standard Time, IST).',
      ),
  }),
  execute: async ({ timezone = 'Asia/Kolkata' }) => {
    const tz = timezone || 'Asia/Kolkata'
    const now = new Date()

    const formattedDate = new Intl.DateTimeFormat('en-IN', {
      timeZone: tz,
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }).format(now)

    const formattedTime = new Intl.DateTimeFormat('en-IN', {
      timeZone: tz,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
      timeZoneName: 'short',
    }).format(now)

    const dayOfWeek = new Intl.DateTimeFormat('en-IN', {
      timeZone: tz,
      weekday: 'long',
    }).format(now)

    // Calculate tomorrow in target timezone
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000)
    const formattedTomorrow = new Intl.DateTimeFormat('en-IN', {
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
      timezone: tz === 'Asia/Kolkata' ? 'Indian Standard Time (IST)' : tz,
      isoTimestamp: now.toISOString(),
      calendarReferences: {
        today: formattedDate,
        tomorrow: formattedTomorrow,
      },
    }
  },
})
