import { tool } from 'ai'
import { z } from 'zod'
import { prisma } from '../../db/prisma.js'

export const executeDatabaseQuery = tool({
  description:
    'Execute a raw SQL query on the PostgreSQL database. Used ONLY for necessary schema changes (ALTER TABLE, CREATE TABLE, ADD COLUMN) or custom aggregation queries after explicit user confirmation.',
  inputSchema: z.object({
    sql: z
      .string()
      .describe('The raw SQL statement to execute (e.g. "ALTER TABLE people ADD COLUMN bio TEXT;").'),
    reason: z
      .string()
      .describe('The rationale explaining why this database query or schema modification is necessary.'),
    confirmationToken: z
      .string()
      .describe(
        'The confirmation token confirming that the human user explicitly authorized this SQL execution in a prior step.',
      ),
  }),
  execute: async ({ sql, reason, confirmationToken }) => {
    try {
      console.log(`\n⚠️  [Schema Tool] Executing authorized raw SQL:`)
      console.log(`   Reason: ${reason}`)
      console.log(`   Token:  ${confirmationToken}`)
      console.log(`   SQL:    ${sql}`)

      const isSelectOrRead = sql.trim().toLowerCase().startsWith('select')

      if (isSelectOrRead) {
        const rows = await prisma.$queryRawUnsafe(sql)
        return {
          status: 'SUCCESS',
          type: 'QUERY',
          rowCount: Array.isArray(rows) ? rows.length : 1,
          data: rows,
        }
      } else {
        const affectedRows = await prisma.$executeRawUnsafe(sql)
        return {
          status: 'SUCCESS',
          type: 'EXECUTE',
          affectedRows,
          message: `SQL executed successfully. Affected rows: ${affectedRows}`,
        }
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error'
      console.error(`❌ [Schema Tool Error] ${msg}`)
      return {
        status: 'ERROR',
        error: msg,
        message: `Failed to execute SQL: ${msg}`,
      }
    }
  },
})
