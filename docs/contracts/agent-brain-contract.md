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
3. **Target Channel Precision**: Scheduled cron jobs run strictly in ONE specific channel. The agent must never broadcast to all groups. If no channel is specified, it must prompt the user with available channels.
4. **Dynamic Real-Time Temporal Grounding**: The agent must never assume or hallucinate dates. When scheduling deadlines or interpreting relative dates ("tomorrow", "in 3 days", "this Friday"), it calls `getCurrentDateTime` to retrieve the live calendar state.
5. **Completed Task Deletion Boundary**: The agent has the ability to delete tasks via `deleteCompletedTasks`, but **only** for tasks that have reached `status === 'COMPLETED'`. Ongoing/active tasks cannot be deleted.
6. **Structured & Autonomous Tools**: The agent operates through 22 typed Prisma, spreadsheet, time, web, channel, and scheduled routine tools.
7. **Deterministic Entity Resolution**: When linking tasks or updating members, exact WhatsApp JID matches (`phone_jid`) take precedence over fuzzy name searches.
8. **Schema Validation**: All tool inputs are validated via Zod schemas before executing operations.

---

## 3. Tool Registry

### A. Channel & Group Discovery Tools (`src/agent/tools/cron-tools.ts`)
| Tool | Input Schema | Operation | Returns |
| :--- | :--- | :--- | :--- |
| `listAvailableChannels` | `{}` | Query allowed WhatsApp groups & direct chats with subjects | Channel[] with names, IDs, and types |

### B. Autonomous Routines & Cron Tools (`src/agent/tools/cron-tools.ts`)
| Tool | Input Schema | Operation | Returns |
| :--- | :--- | :--- | :--- |
| `createScheduledJob` | `{ name, cronExpression, prompt, channelName?, targetJid?, timezone? }` | `prisma.scheduledJob.create()` + in-process `Cron` registration | Scheduled job info with target channel and next run in IST |
| `listScheduledJobs` | `{ status? }` | `prisma.scheduledJob.findMany()` | Routine[] with next run dates & target channels |
| `updateScheduledJob` | `{ jobId?, nameSearch?, cronExpression?, prompt?, channelName?, status? }` | `prisma.scheduledJob.update()` + scheduler sync | Updated routine info |
| `deleteScheduledJob` | `{ jobId?, nameSearch? }` | `prisma.scheduledJob.delete()` + scheduler unregister | Deletion confirmation |

### C. Real-Time Date & Time Tools (`src/agent/tools/time-tools.ts`)
| Tool | Input Schema | Operation | Returns |
| :--- | :--- | :--- | :--- |
| `getCurrentDateTime` | `{ timezone? }` | Real-time `Intl.DateTimeFormat` live calendar lookup | Current date, time, weekday, ISO timestamp, today & tomorrow calendar dates in IST |

### D. Task & Workflow Tools (`src/agent/tools/task-tools.ts`)
| Tool | Input Schema | Operation | Returns |
| :--- | :--- | :--- | :--- |
| `listTasks` | `{ personName?, domainCode?, status?, priority? }` | `prisma.task.findMany()` | Task[] with assignee & domain |
| `getTask` | `{ taskId?, titleSearch? }` | `prisma.task.findFirst()` | Single task detail |
| `createTask` | `{ task, description?, assigneeName?, domainCode?, workflowType?, priority?, dueDate? }` | `prisma.task.create()` | Created task record |
| `updateTask` | `{ taskId, status?, priority?, feedback?, assigneeName?, description? }` | `prisma.task.update()` | Updated task record |
| `deleteCompletedTasks` | `{ taskId?, titleSearch?, deleteAll?, domainCode? }` | `prisma.task.delete()` / `deleteMany({ where: { status: 'COMPLETED' } })` | Deletion count / detail |

### E. Member & Domain Directory Tools (`src/agent/tools/people-tools.ts`)
| Tool | Input Schema | Operation | Returns |
| :--- | :--- | :--- | :--- |
| `listPeople` | `{ name?, year?, domainCode? }` | `prisma.person.findMany()` | Person[] with domains |
| `getPerson` | `{ name?, phoneJid? }` | `prisma.person.findFirst()` | Full person profile + tasks |
| `createPerson` | `{ name, year, phoneJid?, role?, domainCodes? }` | `prisma.person.create()` + join table | Created member record |
| `updatePerson` | `{ personId?, nameSearch?, year?, role?, phoneJid?, domainCodes? }` | `prisma.person.update()` | Updated member record |
| `listDomains` | `{}` | `prisma.domain.findMany()` | Domain[] with member counts |
| `createDomain` | `{ name, code, description? }` | `prisma.domain.create()` | Created domain record |
| `updateDomain` | `{ domainCode, name?, description? }` | `prisma.domain.update()` | Updated domain record |

### F. Google Sheets & External Knowledge Tools (`src/agent/tools/sheet-tools.ts`)
| Tool | Input Schema | Operation | Returns |
| :--- | :--- | :--- | :--- |
| `saveSpreadsheet` | `{ title, url, description?, purpose? }` | `prisma.spreadsheet.upsert()` + live header extraction | Saved sheet record with metadata |
| `listSpreadsheets` | `{ query? }` | `prisma.spreadsheet.findMany()` | Registered sheet[] with columns & rows |
| `readSpreadsheet` | `{ url?, titleSearch?, spreadsheetId?, query?, limit?, offset?, summaryOnly? }` | Live fetch & CSV parse + cell search/slice | Sheet title, headers, matching rows |

### G. Free Live Internet & Web Tools (`src/agent/tools/web-tools.ts`)
| Tool | Input Schema | Operation | Returns |
| :--- | :--- | :--- | :--- |
| `webSearch` | `{ query, limit? }` | Free DuckDuckGo HTML scraper + Wikipedia fallback | Ranked search results (title, snippet, URL) |
| `fetchWebPage` | `{ url, maxLength? }` | HTTP fetch + HTML-to-Markdown cleaner | Clean readable markdown text |

---

## 4. System Prompt Contract

The system prompt (`src/agent/prompts.ts`) defines:
1. **Identity**: The LC Agent, operational assistant and task brain for The Literary Circle Club.
2. **Response Style**: Ultra-short, compact bullet points, no pleasantries, zero technical/SQL jargon.
3. **Autonomous Routines**: Translates natural language schedules into standard 5-part cron syntax in IST, targeted to specific channels.
4. **Channel Selection**: Queries `listAvailableChannels` to resolve group names and asks the user when no channel is specified.
5. **Temporal Awareness**: Calls `getCurrentDateTime` whenever calculating relative deadlines or checking the current day.
6. **Deletion Rules**: Only tasks with `status === 'COMPLETED'` can be deleted.
7. **Knowledge Retrieval**: Able to search live web data ($0 cost) and inspect Google Sheets via link.

---

## 5. Implementation Map

| File | Responsibility |
| :--- | :--- |
| `src/agent/brain.ts` | Core orchestrator: `generateText()` with database, sheet, web, time, channel, and cron tools |
| `src/agent/tools/index.ts` | Tool registry exporting all 22 tools |
| `src/agent/tools/cron-tools.ts` | Autonomous routines & cron management, channel listing |
| `src/services/whatsapp/channels.ts` | WhatsApp group & direct chat metadata discovery and name resolution |
| `src/services/scheduler/scheduler.ts` | In-process Cron scheduler engine with PostgreSQL persistence |
| `src/agent/tools/time-tools.ts` | Real-time live date, time, and relative calendar lookups in IST |
| `src/agent/tools/task-tools.ts` | Task CRUD, workflow transitions, and completed task deletion |
| `src/agent/tools/people-tools.ts` | Member & domain management |
| `src/agent/tools/sheet-tools.ts` | Google Sheets ingestion, storage, and live querying |
| `src/agent/tools/web-tools.ts` | Free DuckDuckGo search & webpage content extraction |
| `src/agent/context.ts` | Sliding-window conversation context manager |
| `src/agent/prompts.ts` | System prompt enforcing extreme brevity, zero SQL outputs, and deletion safety |
