# System Architecture

This document describes the high-level architecture, subsystem boundaries, data flow, and trust zones of **LC_Agent**.

---

## 1. System Topology — 5-Layer Architecture

```text
┌──────────────────────────────────────────────────────────────────┐
│                   WhatsApp Groups (Monitored)                    │
└────────────────────────────────┬─────────────────────────────────┘
                                 │ Baileys WebSocket
                                 ▼
┌──────────────────────────────────────────────────────────────────┐
│  LAYER 1 — WhatsApp Gateway                                     │
│  src/services/whatsapp/client.ts                                 │
│  • makeWASocket + useMultiFileAuthState + auto-reconnect         │
│  • ev.process() batched event handling                           │
│  Output: Raw WAMessage from messages.upsert (type === 'notify') │
└────────────────────────────────┬─────────────────────────────────┘
                                 │ all messages
                                 ▼
┌──────────────────────────────────────────────────────────────────┐
│  LAYER 2 — Message Gateway & Trigger Filter                     │
│  src/gateway/trigger-filter.ts + message-normalizer.ts           │
│  • Group whitelist check (ALLOWED_GROUP_JIDS)                    │
│  • Text extraction & normalization                               │
│  • Trigger keyword gate: only "lc ..." messages pass             │
│  • Deduplication via message_audit_logs                           │
│  Output: cleaned command text + sender + context metadata        │
└────────────────────────────────┬─────────────────────────────────┘
                                 │ only triggered messages
                                 ▼
┌──────────────────────────────────────────────────────────────────┐
│  LAYER 3 — Conversation Context Manager                         │
│  src/agent/context.ts                                            │
│  • In-memory Map<groupJid, ConversationEntry[]>                  │
│  • Sliding window: last 15 messages per group                    │
│  • TTL: 30-minute inactivity expiry                              │
│  • Enables follow-up questions without re-stating context        │
│  Output: message + recent conversation history array             │
└────────────────────────────────┬─────────────────────────────────┘
                                 │ message + history
                                 ▼
┌──────────────────────────────────────────────────────────────────┐
│  LAYER 4 — Agent Brain (LLM + Tool Calling)                     │
│  src/agent/brain.ts + tools/*.ts + prompts.ts                    │
│  • Vercel AI SDK generateText() with OpenRouter provider         │
│  • 21 Specialized Tools:                                         │
│    - Autonomous Cron: createScheduledJob, listScheduledJobs,     │
│      updateScheduledJob, deleteScheduledJob                      │
│    - Time & Calendar: getCurrentDateTime (real-time live lookups)│
│    - Tasks: listTasks, getTask, createTask, updateTask,          │
│      deleteCompletedTasks                                        │
│    - Members: listPeople, getPerson, createPerson, updatePerson │
│    - Domains: listDomains, createDomain, updateDomain            │
│    - Spreadsheets: saveSpreadsheet, listSpreadsheets,            │
│      readSpreadsheet                                             │
│    - Live Web: webSearch, fetchWebPage ($0 free search)          │
│  • Multi-step reasoning (stopWhen: isStepCount(5))               │
│  Output: responseText + tool execution results                   │
└────────────────────────────────┬─────────────────────────────────┘
                                 │ response
                                 ▼
┌──────────────────────────────────────────────────────────────────┐
│  LAYER 5 — WhatsApp Responder                                   │
│  src/services/whatsapp/responder.ts                              │
│  • React ⏳ before processing, ✅ after success, ❌ on error       │
│  • Send quoted reply with @mentions                              │
│  • Mark audit log as processed                                   │
│  • Append assistant response to conversation context             │
│  Output: WhatsApp message delivered to group                     │
└──────────────────────────────────────────────────────────────────┘

          ┌──────────────────────┐   ┌────────────────────────┐
          │   PostgreSQL DB      │   │   Hono HTTP Server     │
          │   (Supabase)         │   │   /health, /api/*      │
          │   Accessed by L4     │   │   Monitoring & Admin   │
          │   tools via Prisma   │   │   endpoints            │
          └──────────────────────┘   └────────────────────────┘
```

---

## 2. Component Ownership & Responsibilities

| Component | Technology | Primary Responsibilities |
| :--- | :--- | :--- |
| **WhatsApp Gateway** | `@whiskeysockets/baileys`, `pino`, `qrcode-terminal` | Socket lifecycle, auth persistence, QR pairing, reconnection, event batching. |
| **Message Gateway** | TypeScript Modules | Group whitelist, trigger keyword filtering (`lc` prefix), text normalization, deduplication gate. |
| **Context Manager** | In-memory `Map` | Short-term sliding-window conversation history per group. TTL-based expiry. No persistence. |
| **Agent Brain** | Vercel AI SDK (`ai`), OpenRouter (`@openrouter/ai-sdk-provider`), `zod` | LLM reasoning via `generateText()` with Zod-typed tools. Multi-step tool calling against Prisma. |
| **WhatsApp Responder** | `@whiskeysockets/baileys` | Reactions, presence updates, quoted replies with mentions, audit log finalization. |
| **HTTP API** | Hono v4 | Health checks, CRUD endpoints for admin/dashboard, agent status monitoring. |
| **Persistence** | Supabase (PostgreSQL) + Prisma 7 | Type-safe storage for people, domains, tasks, and message audit logs. |

---

## 3. Data Flow

1. **Ingestion**: A user sends a message in a monitored WhatsApp group. Baileys fires `messages.upsert` via `ev.process()`.
2. **Filtering**: The gateway checks group whitelist, extracts text, and checks for the `lc` trigger prefix. Non-triggered messages are logged and ignored.
3. **Context**: The triggered message is appended to the group's short-term conversation history (sliding window of 15 messages, 30-min TTL).
4. **Reasoning**: The AI Agent Brain receives the message and conversation history, reasons over the request, and calls database tools (create/update/query tasks, look up people and domains) via multi-step tool calling.
5. **Response**: The agent's text response is sent back as a quoted reply in WhatsApp with appropriate reactions and mentions.

---

## 4. Trust Boundaries & Security

- **WhatsApp Socket**: Auth credentials (`auth_info_baileys/`) represent full account access. Never committed to version control.
- **LLM Provider**: `OPENROUTER_API_KEY` must be stored in `.env`, never hardcoded. The agent has no access to this key at runtime.
- **Agent Authority Boundary**: The agent can INSERT and UPDATE records but cannot DELETE entities or ALTER schema. This is enforced at the tool level — no destructive tools exist.
- **Database Access**: PostgreSQL credentials from `DATABASE_URL`. Connection pooling with sane timeouts.
- **API Boundary**: Hono endpoints must be protected via authentication headers or restricted network access in production.

---

## 5. Configuration

| Variable | Purpose |
| :--- | :--- |
| `DATABASE_URL` | Supabase connection pooler URL |
| `DIRECT_URL` | Supabase direct connection for migrations |
| `OPENROUTER_API_KEY` | OpenRouter API key (routes to any LLM) |
| `OPENROUTER_MODEL` | Model identifier (e.g. `google/gemini-2.5-flash`) |
| `TRIGGER_KEYWORD` | Prefix that activates the agent (default: `lc`) |
| `ALLOWED_GROUP_JIDS` | Comma-separated monitored WhatsApp group JIDs |
| `CONTEXT_MAX_MESSAGES` | Sliding window size (default: `15`) |
| `CONTEXT_TTL_MINUTES` | Inactivity timeout for context (default: `30`) |
