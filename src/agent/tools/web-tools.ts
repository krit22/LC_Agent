import { tool } from 'ai'
import { z } from 'zod'

/**
 * Clean up HTML text into structured, readable plain text / Markdown.
 * Removes scripts, styles, navigation, ads, and excessive whitespace.
 */
export function htmlToCleanText(html: string, maxLength: number = 4000): string {
  let text = html

  // 1. Remove script, style, nav, footer, header, svg, noscript tags
  text = text.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
  text = text.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
  text = text.replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, '')
  text = text.replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, '')
  text = text.replace(/<header\b[^<]*(?:(?!<\/header>)<[^<]*)*<\/header>/gi, '')
  text = text.replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, '')
  text = text.replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, '')

  // 2. Format common HTML tags to markdown
  text = text.replace(/<h[1-6][^>]*>(.*?)<\/h[1-6]>/gi, '\n\n### $1\n')
  text = text.replace(/<p[^>]*>(.*?)<\/p>/gi, '\n\n$1')
  text = text.replace(/<br\s*[\/]?>/gi, '\n')
  text = text.replace(/<li[^>]*>(.*?)<\/li>/gi, '\n• $1')

  // 3. Strip remaining HTML tags
  text = text.replace(/<[^>]+>/g, ' ')

  // 4. Decode common HTML entities
  text = text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')

  // 5. Clean up multiple whitespaces and newlines
  text = text
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n\s*\n+/g, '\n\n')
    .trim()

  if (text.length > maxLength) {
    text = text.slice(0, maxLength) + '\n\n...[Content truncated for brevity]'
  }

  return text
}

/**
 * Unwraps DuckDuckGo redirect URLs (e.g. //duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com)
 */
function unwrapDuckDuckGoUrl(rawUrl: string): string {
  try {
    let clean = rawUrl
    if (clean.startsWith('//')) {
      clean = 'https:' + clean
    }
    const parsed = new URL(clean, 'https://duckduckgo.com')
    const uddg = parsed.searchParams.get('uddg')
    if (uddg) {
      return decodeURIComponent(uddg)
    }
    return clean
  } catch {
    return rawUrl
  }
}

/**
 * Executes a DuckDuckGo HTML search and parses top organic results.
 */
async function searchDuckDuckGo(
  query: string,
  limit: number = 5,
): Promise<Array<{ title: string; snippet: string; url: string }>> {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Accept:
        'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
    },
  })

  if (!response.ok) {
    throw new Error(`DuckDuckGo search failed (HTTP ${response.status})`)
  }

  const html = await response.text()
  const results: Array<{ title: string; snippet: string; url: string }> = []

  // Extract result blocks
  const resultRegex =
    /<div[^>]*class="[^"]*result\s+results_links[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/gi
  let match: RegExpExecArray | null

  while ((match = resultRegex.exec(html)) !== null && results.length < limit) {
    const block = match[1]

    // Extract title & link
    const linkMatch = block.match(
      /<a[^>]*class="[^"]*result__snippet[^"]*"[^>]*href="([^"]+)"[^>]*>|<a[^>]*class="[^"]*result__url[^"]*"[^>]*href="([^"]+)"[^>]*>|<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i,
    )
    const titleMatch = block.match(
      /<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i,
    )
    const snippetMatch = block.match(
      /<a[^>]*class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/i,
    )

    if (titleMatch) {
      const rawUrl = titleMatch[1]
      const title = htmlToCleanText(titleMatch[2])
      const snippet = snippetMatch ? htmlToCleanText(snippetMatch[1]) : ''
      const cleanUrl = unwrapDuckDuckGoUrl(rawUrl)

      if (cleanUrl.startsWith('http') && title) {
        results.push({
          title,
          snippet,
          url: cleanUrl,
        })
      }
    }
  }

  // Fallback if specific classes changed: Generic anchor and snippet extraction
  if (results.length === 0) {
    const fallbackRegex =
      /<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?(?:<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>|<td[^>]*>([\s\S]*?)<\/td>)/gi
    while (
      (match = fallbackRegex.exec(html)) !== null &&
      results.length < limit
    ) {
      const rawUrl = match[1]
      const title = htmlToCleanText(match[2])
      const snippet = match[3] ? htmlToCleanText(match[3]) : ''
      const cleanUrl = unwrapDuckDuckGoUrl(rawUrl)
      if (cleanUrl.startsWith('http') && title) {
        results.push({ title, snippet, url: cleanUrl })
      }
    }
  }

  return results
}

/**
 * Fallback search using Wikipedia public API (100% free, no key).
 */
async function searchWikipedia(
  query: string,
  limit: number = 3,
): Promise<Array<{ title: string; snippet: string; url: string }>> {
  try {
    const wikiUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&utf8=1&srlimit=${limit}`
    const res = await fetch(wikiUrl, {
      headers: {
        'User-Agent': 'LC_Agent_Bot/1.0 (https://github.com/krit22/LC_Agent)',
      },
    })
    if (!res.ok) return []
    const data: any = await res.json()
    const searchResults = data?.query?.search || []

    return searchResults.map((item: any) => ({
      title: item.title,
      snippet: htmlToCleanText(item.snippet),
      url: `https://en.wikipedia.org/wiki/${encodeURIComponent(item.title.replace(/ /g, '_'))}`,
    }))
  } catch {
    return []
  }
}

/**
 * Tool: webSearch
 * Free web search via DuckDuckGo + Wikipedia fallback ($0 API cost).
 */
export const webSearch = tool({
  description:
    'Search the live internet for current information, news, book recommendations, definitions, facts, or websites ($0 free search).',
  inputSchema: z.object({
    query: z.string().describe('The search query or question to look up online.'),
    limit: z
      .number()
      .default(5)
      .describe('Maximum number of search results to return (default 5, max 10).'),
  }),
  execute: async ({ query, limit }) => {
    try {
      const safeLimit = Math.min(Math.max(1, limit), 10)
      let results = await searchDuckDuckGo(query, safeLimit)

      // If DuckDuckGo yields 0 results, augment with Wikipedia
      if (results.length === 0) {
        results = await searchWikipedia(query, safeLimit)
      }

      if (results.length === 0) {
        return {
          query,
          resultsCount: 0,
          message: `No search results found for query: "${query}". Try refining your keywords.`,
          results: [],
        }
      }

      return {
        query,
        resultsCount: results.length,
        results: results.slice(0, safeLimit),
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error'
      // Try Wikipedia fallback on error
      const wikiResults = await searchWikipedia(query, 3)
      if (wikiResults.length > 0) {
        return {
          query,
          resultsCount: wikiResults.length,
          results: wikiResults,
        }
      }
      return {
        query,
        error: `Web search failed: ${msg}`,
      }
    }
  },
})

/**
 * Tool: fetchWebPage
 * Reads and extracts clean readable text/markdown from any public web page URL ($0 cost).
 */
export const fetchWebPage = tool({
  description:
    'Fetch and read the main text/content of any public webpage, article, blog, documentation, or news link ($0 free scraper).',
  inputSchema: z.object({
    url: z.string().url().describe('The full URL of the webpage to read.'),
    maxLength: z
      .number()
      .default(4000)
      .describe('Maximum character length of the extracted text (default 4000).'),
  }),
  execute: async ({ url, maxLength }) => {
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Accept:
            'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
      })

      if (!response.ok) {
        return {
          url,
          error: `Failed to fetch webpage (HTTP status: ${response.status} ${response.statusText})`,
        }
      }

      const contentType = response.headers.get('content-type') || ''
      const rawText = await response.text()

      // Extract title if HTML
      let title = 'Web Page'
      const titleMatch = rawText.match(/<title[^>]*>(.*?)<\/title>/i)
      if (titleMatch && titleMatch[1]) {
        title = htmlToCleanText(titleMatch[1], 150)
      }

      const cleanContent = contentType.includes('text/plain')
        ? rawText.slice(0, maxLength)
        : htmlToCleanText(rawText, maxLength)

      return {
        url,
        title,
        contentLength: cleanContent.length,
        content: cleanContent,
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error'
      return {
        url,
        error: `Could not read webpage: ${msg}`,
      }
    }
  },
})
