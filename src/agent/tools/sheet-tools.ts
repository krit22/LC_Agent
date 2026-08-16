import { tool } from 'ai'
import { z } from 'zod'
import { prisma } from '../../db/prisma.js'

/**
 * Extracts Google Sheets spreadsheet ID and optional GID from various Google Sheet URL formats.
 */
export function extractGoogleSheetInfo(rawUrl: string): {
  isGoogleSheet: boolean
  sheetId?: string
  gid?: string
  csvUrl: string
} {
  const url = rawUrl.trim()
  const sheetIdMatch = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)
  const gidMatch = url.match(/[?&#]gid=([0-9]+)/)

  if (sheetIdMatch && sheetIdMatch[1]) {
    const sheetId = sheetIdMatch[1]
    const gid = gidMatch ? gidMatch[1] : undefined
    const csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv${gid ? `&gid=${gid}` : ''}`
    return {
      isGoogleSheet: true,
      sheetId,
      gid,
      csvUrl,
    }
  }

  // Fallback for direct CSV or other URLs
  return {
    isGoogleSheet: false,
    csvUrl: url,
  }
}

/**
 * Robust RFC 4180 compliant CSV parser.
 * Handles commas inside quotes, escaped quotes, and multiline cells.
 */
export function parseCSV(csvText: string): {
  headers: string[]
  rows: Record<string, string>[]
} {
  const lines: string[][] = []
  let currentRow: string[] = []
  let currentCell = ''
  let insideQuotes = false

  for (let i = 0; i < csvText.length; i++) {
    const char = csvText[i]
    const nextChar = csvText[i + 1]

    if (char === '"') {
      if (insideQuotes && nextChar === '"') {
        currentCell += '"'
        i++ // Skip next quote
      } else {
        insideQuotes = !insideQuotes
      }
    } else if (char === ',' && !insideQuotes) {
      currentRow.push(currentCell.trim())
      currentCell = ''
    } else if ((char === '\r' || char === '\n') && !insideQuotes) {
      if (char === '\r' && nextChar === '\n') {
        i++ // Skip LF
      }
      currentRow.push(currentCell.trim())
      if (currentRow.some((cell) => cell.length > 0)) {
        lines.push(currentRow)
      }
      currentRow = []
      currentCell = ''
    } else {
      currentCell += char
    }
  }

  if (currentCell.length > 0 || currentRow.length > 0) {
    currentRow.push(currentCell.trim())
    if (currentRow.some((cell) => cell.length > 0)) {
      lines.push(currentRow)
    }
  }

  if (lines.length === 0) {
    return { headers: [], rows: [] }
  }

  const rawHeaders = lines[0]
  const headers = rawHeaders.map(
    (h, idx) => (h ? h.trim() : `Column_${idx + 1}`),
  )

  const rows: Record<string, string>[] = []
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]
    const rowObj: Record<string, string> = {}
    let hasData = false

    headers.forEach((header, idx) => {
      const val = line[idx] !== undefined ? line[idx] : ''
      rowObj[header] = val
      if (val.length > 0) hasData = true
    })

    if (hasData) {
      rows.push(rowObj)
    }
  }

  return { headers, rows }
}

/**
 * Fetches and parses a spreadsheet via URL (supports Google Sheets & CSVs).
 */
export async function fetchAndParseSpreadsheet(url: string): Promise<{
  headers: string[]
  rows: Record<string, string>[]
  rowCount: number
  isGoogleSheet: boolean
}> {
  const info = extractGoogleSheetInfo(url)

  const response = await fetch(info.csvUrl, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
  })

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new Error(
        'Access denied. Please ensure the Google Sheet is shared with "Anyone with the link can view".',
      )
    }
    throw new Error(
      `Failed to fetch spreadsheet (HTTP status: ${response.status} ${response.statusText})`,
    )
  }

  const text = await response.text()
  if (text.includes('<!DOCTYPE html>') && text.includes('accounts.google.com')) {
    throw new Error(
      'Google Sheet requires login. Please change link sharing to "Anyone with the link can view".',
    )
  }

  const parsed = parseCSV(text)
  return {
    headers: parsed.headers,
    rows: parsed.rows,
    rowCount: parsed.rows.length,
    isGoogleSheet: info.isGoogleSheet,
  }
}

/**
 * Tool: saveSpreadsheet
 * Saves a Google Sheet or Excel/CSV link in the database and remembers it forever.
 */
export const saveSpreadsheet = tool({
  description:
    'Save and remember a Google Sheet or Excel/CSV link in the database with title, description, and purpose. Automatically tests access and saves column headers in metadata.',
  inputSchema: z.object({
    title: z
      .string()
      .describe(
        'Descriptive title for this sheet (e.g. "Club Membership 2026", "Freshers Recruitment Responses", "Annual Budget").',
      ),
    url: z
      .string()
      .url()
      .describe(
        'The full Google Sheets share link or CSV URL (must be set to "Anyone with the link can view").',
      ),
    description: z
      .string()
      .optional()
      .describe('Description of what data is stored in this spreadsheet.'),
    purpose: z
      .string()
      .optional()
      .describe(
        'Target audience, domain, or purpose (e.g. "Core Team", "Web Dev Domain", "Event Registrations").',
      ),
  }),
  execute: async ({ title, url, description, purpose }) => {
    try {
      // 1. Validate and fetch live headers to ensure URL is accessible
      const sheetData = await fetchAndParseSpreadsheet(url)

      // 2. Save or update in database
      const existing = await prisma.spreadsheet.findFirst({
        where: {
          OR: [{ url: url.trim() }, { title: { equals: title, mode: 'insensitive' } }],
        },
      })

      const metadata = {
        headers: sheetData.headers,
        initialRowCount: sheetData.rowCount,
        isGoogleSheet: sheetData.isGoogleSheet,
        sampleRow: sheetData.rows[0] || null,
        lastVerifiedAt: new Date().toISOString(),
      }

      let saved
      if (existing) {
        saved = await prisma.spreadsheet.update({
          where: { id: existing.id },
          data: {
            title,
            url: url.trim(),
            description: description || existing.description,
            purpose: purpose || existing.purpose,
            metadata,
          },
        })
      } else {
        saved = await prisma.spreadsheet.create({
          data: {
            title,
            url: url.trim(),
            description,
            purpose,
            metadata,
          },
        })
      }

      return {
        id: saved.id,
        title: saved.title,
        url: saved.url,
        description: saved.description,
        purpose: saved.purpose,
        detectedColumns: sheetData.headers,
        totalRows: sheetData.rowCount,
        message: `Successfully saved and indexed spreadsheet "${saved.title}" with ${sheetData.rowCount} row(s) and ${sheetData.headers.length} column(s).`,
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error'
      return {
        error: `Could not save spreadsheet: ${msg}`,
      }
    }
  },
})

/**
 * Tool: listSpreadsheets
 * Lists all registered spreadsheets in the database.
 */
export const listSpreadsheets = tool({
  description:
    'List all registered Google Sheets and spreadsheets stored in the database.',
  inputSchema: z.object({
    query: z
      .string()
      .optional()
      .describe('Optional search term to filter sheets by title or description.'),
  }),
  execute: async ({ query }) => {
    const where: any = {}
    if (query) {
      where.OR = [
        { title: { contains: query, mode: 'insensitive' } },
        { description: { contains: query, mode: 'insensitive' } },
        { purpose: { contains: query, mode: 'insensitive' } },
      ]
    }

    const sheets = await prisma.spreadsheet.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 20,
    })

    return sheets.map((s) => {
      const meta = (s.metadata as any) || {}
      return {
        id: s.id,
        title: s.title,
        url: s.url,
        description: s.description || 'No description',
        purpose: s.purpose || 'General',
        columns: meta.headers || [],
        initialRows: meta.initialRowCount || 0,
        createdAt: s.createdAt.toISOString(),
      }
    })
  },
})

/**
 * Tool: readSpreadsheet
 * Reads and inspects live data from a Google Sheet URL or saved spreadsheet.
 */
export const readSpreadsheet = tool({
  description:
    'Read live data from a Google Sheet or Excel/CSV spreadsheet. Can inspect by saved title/ID or direct URL. Supports column summarization, searching, filtering, and row limits.',
  inputSchema: z.object({
    url: z
      .string()
      .url()
      .optional()
      .describe('Direct Google Sheets URL or CSV link to read.'),
    titleSearch: z
      .string()
      .optional()
      .describe('Search saved spreadsheet in the database by title.'),
    spreadsheetId: z
      .string()
      .uuid()
      .optional()
      .describe('UUID of a saved spreadsheet in the database.'),
    query: z
      .string()
      .optional()
      .describe(
        'Search term to filter rows containing specific text (e.g. name, email, domain, phone).',
      ),
    limit: z
      .number()
      .default(20)
      .describe('Maximum number of rows to return (default 20, max 100).'),
    offset: z.number().default(0).describe('Row offset for pagination.'),
    summaryOnly: z
      .boolean()
      .default(false)
      .describe(
        'If true, returns only column headers, total row count, and first 2 sample rows without full dataset.',
      ),
  }),
  execute: async ({
    url,
    titleSearch,
    spreadsheetId,
    query,
    limit,
    offset,
    summaryOnly,
  }) => {
    try {
      let targetUrl = url
      let sheetTitle = 'Direct Spreadsheet'

      // If no direct URL, resolve from database
      if (!targetUrl) {
        if (!titleSearch && !spreadsheetId) {
          return {
            error:
              'Please provide either a spreadsheet url, titleSearch, or spreadsheetId.',
          }
        }

        const where: any = {}
        if (spreadsheetId) where.id = spreadsheetId
        if (titleSearch) {
          where.title = { contains: titleSearch, mode: 'insensitive' }
        }

        const saved = await prisma.spreadsheet.findFirst({ where })
        if (!saved) {
          return {
            error: `Spreadsheet "${titleSearch || spreadsheetId}" not found in database. You can save it first using saveSpreadsheet.`,
          }
        }
        targetUrl = saved.url
        sheetTitle = saved.title
      }

      // Fetch and parse live data
      const data = await fetchAndParseSpreadsheet(targetUrl)

      if (summaryOnly) {
        return {
          title: sheetTitle,
          url: targetUrl,
          totalRows: data.rowCount,
          columns: data.headers,
          sampleRows: data.rows.slice(0, 2),
        }
      }

      let filteredRows = data.rows
      if (query && query.trim()) {
        const q = query.toLowerCase().trim()
        filteredRows = filteredRows.filter((row) =>
          Object.values(row).some((val) =>
            String(val).toLowerCase().includes(q),
          ),
        )
      }

      const safeLimit = Math.min(Math.max(1, limit), 100)
      const slicedRows = filteredRows.slice(offset, offset + safeLimit)

      return {
        title: sheetTitle,
        totalRowsInSheet: data.rowCount,
        matchingRowsCount: filteredRows.length,
        returnedRowsCount: slicedRows.length,
        columns: data.headers,
        rows: slicedRows,
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error'
      return {
        error: `Failed to read spreadsheet: ${msg}`,
      }
    }
  },
})
