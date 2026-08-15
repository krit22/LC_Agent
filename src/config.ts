import 'dotenv/config'

export const config = {
  // Server
  port: parseInt(process.env.PORT || '3000', 10),
  host: process.env.HOST || '127.0.0.1',

  // OpenRouter LLM
  openrouterApiKey: process.env.OPENROUTER_API_KEY || '',
  openrouterModel: process.env.OPENROUTER_MODEL || 'google/gemini-2.5-flash',

  // Agent
  triggerKeyword: (process.env.TRIGGER_KEYWORD || 'lc').toLowerCase(),
  allowedGroupJids: (process.env.ALLOWED_GROUP_JIDS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),

  // Conversation context
  contextMaxMessages: parseInt(process.env.CONTEXT_MAX_MESSAGES || '15', 10),
  contextTtlMinutes: parseInt(process.env.CONTEXT_TTL_MINUTES || '30', 10),
} as const
