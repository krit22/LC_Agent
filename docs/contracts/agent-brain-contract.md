# Contract: AI Agent Brain Engine

This contract defines the LLM integration, tool definitions, system prompt rules, reasoning boundaries, and output formatting of the AI Agent Brain.

---

## 1. Framework & Provider

- **AI SDK**: Vercel AI SDK (`ai` package) — provides `generateText()` with multi-step tool calling (`stopWhen: isStepCount(5)`).
- **LLM Provider**: OpenRouter (`@openrouter/ai-sdk-provider`) — routes to 300+ models via single API key.
- **Default Model**: Configurable via `OPENROUTER_MODEL` env var (e.g. `deepseek/deepseek-v4-flash`).
- **Schema Validation**: `zod` — all tool parameters and outputs are Zod-typed with `inputSchema`.

---

## 2. Primary Invariants

1. **Zero Technical/SQL Jargon in Outputs**: The agent must NEVER output raw SQL, table definitions, or database queries in user-facing WhatsApp messages. Responses must be concise, natural, and human-friendly.
2. **Extreme Brevity**: All WhatsApp replies must be short, clear, and direct (1 to 4 lines maximum).
3. **Structured High-Level Tools Only**: The agent operates exclusively through 10 typed Prisma tools. No raw SQL or DDL execution tools exist.
4. **Deterministic Entity Resolution**: When linking tasks or updating members, exact WhatsApp JID matches (`phone_jid`) take precedence over fuzzy name searches.
5. **Schema Validation**: All tool inputs are validated via Zod schemas before executing Prisma operations.

---

## 3. Tool Registry

### A. Task & Workflow Tools (`src/agent/tools/task-tools.ts`)
| Tool | Input Schema | Operation | Returns |
| :--- | :--- | :--- | :--- |
| `listTasks` | `{ personName?, domainCode?, status?, priority? }` | `prisma.task.findMany()` | Task[] with assignee & domain |
| `getTask` | `{ taskId?, titleSearch? }` | `prisma.task.findFirst()` | Single task detail |
| `createTask` | `{ task, description?, assigneeName?, domainCode?, workflowType?, priority?, dueDate? }` | `prisma.task.create()` | Created task record |
| `updateTask` | `{ taskId, status?, priority?, feedback?, assigneeName?, description? }` | `prisma.task.update()` | Updated task record |

### B. Member & Domain Directory Tools (`src/agent/tools/people-tools.ts`)
| Tool | Input Schema | Operation | Returns |
| :--- | :--- | :--- | :--- |
| `listPeople` | `{ name?, year?, domainCode? }` | `prisma.person.findMany()` | Person[] with domains |
| `getPerson` | `{ name?, phoneJid? }` | `prisma.person.findFirst()` | Full person profile + tasks |
| `createPerson` | `{ name, year, phoneJid?, role?, domainCodes? }` | `prisma.person.create()` + join table | Created member record |
| `updatePerson` | `{ personId?, nameSearch?, year?, role?, phoneJid?, domainCodes? }` | `prisma.person.update()` | Updated member record |
| `listDomains` | `{}` | `prisma.domain.findMany()` | Domain[] with member counts |
| `createDomain` | `{ name, code, description? }` | `prisma.domain.create()` | Created domain record |
| `updateDomain` | `{ domainCode, name?, description? }` | `prisma.domain.update()` | Updated domain record |

---

## 4. System Prompt Contract

The system prompt (`src/agent/prompts.ts`) defines:
1. **Identity**: The LC Agent, operational assistant and task brain for The Literary Circle Club.
2. **Response Style**: Ultra-short, compact bullet points, no pleasantries, zero technical/SQL jargon.
3. **Domain & Workflow Invariants**: 4 core domains (`web_dev`, `video_editing`, `content_writing`, `graphic_design`) and workflow state machines (`GENERAL`, `POSTER`).

---

## 5. Conversation Context Rules

- Short-term memory via in-memory sliding window (15 messages, 30-min TTL).
- Context is per-group, including message metadata (`[Chat: <groupJid>] [SenderName]: <command>`).
- Context is reset on server restart (no persistent leakage).

---

## 6. Implementation Map

| File | Responsibility |
| :--- | :--- |
| `src/agent/brain.ts` | Core orchestrator: `generateText()` with database tools and real-time step logging |
| `src/agent/tools/index.ts` | Tool registry exporting all 10 structured tools |
| `src/agent/tools/task-tools.ts` | Task CRUD & workflow transitions |
| `src/agent/tools/people-tools.ts` | Member & domain management |
| `src/agent/context.ts` | Sliding-window conversation context manager |
| `src/agent/prompts.ts` | System prompt enforcing extreme brevity and zero SQL outputs |
