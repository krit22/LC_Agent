# Contract: AI Agent Brain Engine

This contract defines the LLM integration, tool definitions, system prompt rules, and reasoning boundaries of the AI Agent Brain.

---

## 1. Framework & Provider

- **AI SDK**: Vercel AI SDK (`ai` package) — provides `generateText()` with multi-step tool calling.
- **LLM Provider**: OpenRouter (`@openrouter/ai-sdk-provider`) — routes to 300+ models via single API key.
- **Default Model**: Configurable via `OPENROUTER_MODEL` env var (e.g. `google/gemini-2.5-flash`).
- **Schema Validation**: `zod` — all tool parameters and outputs are Zod-typed.

---

## 2. Primary Invariants

1. **No Schema Mutations**: The agent has zero ability to ALTER TABLE, add columns, drop tables, or modify the Prisma schema. No tools exist for DDL operations.
2. **No Destructive Deletes**: The agent cannot DELETE people or tasks. Tasks can only be transitioned to `CANCELLED` or `COMPLETED` status.
3. **Schema Validation**: All tool inputs are validated via Zod schemas before executing Prisma operations. Invalid inputs return descriptive errors to the LLM for self-correction.
4. **Graceful Fallbacks**: If the LLM returns unparseable output or tool execution fails, the system logs the error to `message_audit_logs` with `intent_detected = 'PARSE_ERROR'` and replies with a user-friendly error message.
5. **Deterministic Entity Resolution**: When linking a task to a person, exact WhatsApp JID matches (`phone_jid`) take precedence over fuzzy name searches.
6. **Bounded Authority**: The agent must acknowledge when a request is outside its capabilities and explicitly tell the user it cannot do that.

---

## 3. Tool Registry

| Tool | Zod Parameters | Prisma Operation | Returns |
| :--- | :--- | :--- | :--- |
| `listTasks` | `{ personName?, domainCode?, status?, priority? }` | `prisma.task.findMany({ where, include })` | Task[] with assignee & domain |
| `getTask` | `{ taskId?, titleSearch? }` | `prisma.task.findFirst({ where, include })` | Single task detail |
| `createTask` | `{ task, description?, assigneeName?, domainCode?, workflowType?, priority?, dueDate? }` | `prisma.task.create({ data })` | Created task record |
| `updateTask` | `{ taskId, status?, priority?, feedback?, assigneeName?, description? }` | `prisma.task.update({ where, data })` | Updated task record |
| `listPeople` | `{ name?, year?, domainCode? }` | `prisma.person.findMany({ where, include })` | Person[] with domains |
| `getPerson` | `{ name?, phoneJid? }` | `prisma.person.findFirst({ where, include })` | Full person with tasks & domains |
| `listDomains` | `{}` | `prisma.domain.findMany({ include: { _count } })` | Domain[] with member counts |

---

## 4. System Prompt Contract

The system prompt (`src/agent/prompts.ts`) must define:

1. **Identity**: "You are the LC Agent, the task management assistant for The Literary Circle Club."
2. **Capabilities**: Create tasks, update task statuses, query people and assignments, list domains.
3. **Hard boundaries**: Cannot modify schema, cannot delete records, cannot act outside task management.
4. **Response style**: Concise, bullet points for lists, confirm actions with specific details.
5. **Schema awareness**: Injected summary of valid domains, workflow types (`GENERAL`, `POSTER`), statuses, and priority levels.

---

## 5. Conversation Context Rules

- Short-term memory via in-memory sliding window (15 messages, 30-min TTL).
- Context is per-group, not per-user.
- Only triggered messages (prefixed with `lc`) and their agent responses enter the context.
- Context is NOT persisted — resets on server restart.

---

## 6. Implementation Map

| File | Responsibility |
| :--- | :--- |
| `src/agent/brain.ts` | Core orchestrator: `generateText()` with tools, system prompt, and conversation history |
| `src/agent/tools/index.ts` | Tool registry exporting all tools |
| `src/agent/tools/task-tools.ts` | `listTasks`, `getTask`, `createTask`, `updateTask` |
| `src/agent/tools/people-tools.ts` | `listPeople`, `getPerson`, `listDomains` |
| `src/agent/context.ts` | In-memory conversation context manager |
| `src/agent/prompts.ts` | System prompt definition with schema awareness |
| `src/config.ts` | Centralized env config (trigger keyword, group JIDs, model, context settings) |

---

## 7. Validation & Testing

- Unit tests must feed sample WhatsApp messages through the tool pipeline and assert correct Prisma operations.
- Tool parameter validation must reject invalid statuses, unknown domain codes, and malformed UUIDs.
- Fuzz tests with empty strings, emoji-only messages, or oversized inputs must not cause crashes.
- The agent must correctly respond "I can't do that" for schema change requests, delete requests, and out-of-scope queries.
