# LC_Agent

Welcome to the AI Agent Brain repository for The Literary Circle Club.

## Tech Stack
- **Framework**: [Hono](https://hono.dev/) v4
- **Runtime**: Node.js v24 (`@hono/node-server`)
- **Language**: TypeScript (ESM)
- **Database & Storage**: [Supabase](https://supabase.com/) (PostgreSQL)
- **ORM**: [Prisma](https://www.prisma.io/) v7
- **Messaging**: [@whiskeysockets/baileys](https://github.com/whiskeysockets/Baileys) (with `@hapi/boom`, `pino`, `qrcode-terminal`)
- **AI Agent**: [Vercel AI SDK](https://ai-sdk.dev/) + [OpenRouter](https://openrouter.ai/) (`@openrouter/ai-sdk-provider`)
- **Validation**: [Zod](https://zod.dev/) for tool parameter schemas

---

## Project Structure
```
├── AGENTS.md                  # Agent maintenance contract & routing table
├── docs/                      # Single source of truth documentation
│   ├── overview.md            # Product vision & goals
│   ├── principles.md          # Engineering principles & rules
│   ├── architecture.md        # 5-layer system topology
│   ├── schema.md              # Database schema & entity models
│   ├── workflows/             # Ingestion & task workflows
│   └── contracts/             # Engineering review contracts
├── prisma/
│   ├── schema.prisma          # Prisma data models (Domain, Person, Task, MessageAuditLog)
│   └── seed.ts                # Seed script for initial domains
├── prisma.config.ts           # Prisma 7 connection configuration
├── supabase/
│   └── config.toml            # Local Supabase configuration
├── src/
│   ├── config.ts              # Centralized env config (trigger, groups, model, context)
│   ├── app.ts                 # Hono app configuration, middlewares, error handlers
│   ├── index.ts               # Server entry point + WhatsApp client boot
│   ├── db/
│   │   └── prisma.ts          # Global PrismaClient singleton
│   ├── gateway/
│   │   ├── trigger-filter.ts  # Keyword prefix gate + group whitelist
│   │   └── message-normalizer.ts  # Extract text, sender, mentions from WAMessage
│   ├── agent/
│   │   ├── brain.ts           # LLM reasoning via generateText() + tools
│   │   ├── context.ts         # In-memory sliding-window conversation store
│   │   ├── prompts.ts         # System prompt & agent identity
│   │       ├── index.ts       # Tool registry
│   │       ├── task-tools.ts  # listTasks, getTask, createTask, updateTask, deleteCompletedTasks
│   │       ├── people-tools.ts  # listPeople, getPerson, createPerson, updatePerson, listDomains, createDomain, updateDomain
│   │       ├── sheet-tools.ts # saveSpreadsheet, listSpreadsheets, readSpreadsheet
│   │       ├── web-tools.ts   # webSearch, fetchWebPage ($0 live internet)
│   │       ├── time-tools.ts  # getCurrentDateTime (real-time live lookups)
│   │       └── cron-tools.ts  # createScheduledJob, listScheduledJobs, updateScheduledJob, deleteScheduledJob
│   ├── services/
│   │   ├── scheduler/
│   │   │   └── scheduler.ts   # In-process Cron scheduler engine + PostgreSQL sync
│   │   └── whatsapp/
│   │       ├── client.ts      # Baileys socket lifecycle + reconnection
│   │       ├── listener.ts    # Event dispatcher → gateway → agent → responder
│   │       └── responder.ts   # Send replies, reactions, presence updates
│   └── routes/
│       ├── api.ts             # Core API endpoints
│       └── health.ts          # Health check endpoint (/health)
├── .env.example               # Environment variables template
├── package.json               # Dependencies & npm scripts
├── tsconfig.json              # TypeScript compiler options
└── README.md
```

---

## Getting Started

### 1. Install Dependencies
```bash
npm install
```

### 2. Environment Setup
Copy `.env.example` to `.env` and fill in your credentials:
```bash
cp .env.example .env
```

Required variables:
- `DATABASE_URL` / `DIRECT_URL` — Supabase PostgreSQL connection strings
- `OPENROUTER_API_KEY` — OpenRouter API key ([get one here](https://openrouter.ai/keys))
- `OPENROUTER_MODEL` — Model to use (default: `google/gemini-2.5-flash`)
- `ALLOWED_GROUP_JIDS` — WhatsApp group JIDs to monitor
- `TRIGGER_KEYWORD` — Prefix that activates the agent (default: `lc`)

### 3. Database Operations (Prisma & Supabase)
```bash
# Generate Prisma Client
npm run db:generate

# Push schema directly to Supabase
npm run db:push

# Run migrations
npm run db:migrate

# Seed initial domains
npm run db:seed

# Open Prisma visual database studio
npm run db:studio
```

### 4. Development Mode (with hot-reload)
```bash
npm run dev
```

### 5. Build & Run in Production
```bash
npm run build
npm start
```

---

## How It Works

1. The bot connects to WhatsApp via Baileys and listens to messages in configured groups.
2. When someone types `lc <command>` in a monitored group, the agent activates.
3. The AI brain (powered by OpenRouter) reasons over the request, calls database tools as needed, and replies in-channel.
4. Non-triggered messages are silently received and ignored.

Example:
```
User:  lc create a poster task for the hackathon, assign to Rahul under graphic design
Agent: ✅ Task created: "Poster for hackathon" → Rahul (Graphic Designing), SEARCHING_TEMPLATES, medium priority
```

---

## Available Endpoints
- `GET /` — Root status info
- `GET /health` — Service health and uptime check
- `GET /api` — API metadata and available endpoints
