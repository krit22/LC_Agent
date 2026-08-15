# LC_Agent

Welcome to the AI Agent Brain repository for The Literary Circle Club.

## Tech Stack
- **Framework**: [Hono](https://hono.dev/) v4
- **Runtime**: Node.js v24 (`@hono/node-server`)
- **Language**: TypeScript (ESM)
- **Database & Storage**: [Supabase](https://supabase.com/) (PostgreSQL)
- **ORM**: [Prisma](https://www.prisma.io/) v7
- **Messaging Integration**: [@whiskeysockets/baileys](https://github.com/whiskeysockets/Baileys)

---

## Project Structure
```
├── AGENTS.md             # Agent maintenance contract & routing table
├── docs/                 # Single source of truth documentation
│   ├── overview.md       # Product vision & goals
│   ├── principles.md     # Engineering principles & rules
│   ├── architecture.md   # System topology & component flow
│   ├── schema.md         # Database schema & entity models
│   ├── workflows/        # Ingestion & task workflows
│   └── contracts/        # Engineering review contracts
├── prisma/
│   └── schema.prisma     # Prisma data models (Domain, Person, Task, MessageAuditLog)
├── prisma.config.ts      # Prisma 7 connection configuration
├── supabase/             # Local Supabase configuration
│   └── config.toml
├── src/
│   ├── app.ts            # Hono app configuration, middlewares, error handlers
│   ├── index.ts          # Server entry point and port listener
│   ├── db/
│   │   └── prisma.ts     # Global PrismaClient singleton instance
│   └── routes/
│       ├── api.ts        # Core API endpoints
│       └── health.ts     # Health check endpoint (/health)
├── .env.example          # Environment variables template
├── package.json          # Dependencies & npm scripts
├── tsconfig.json         # TypeScript compiler options
└── README.md
```

---

## Getting Started

### 1. Install Dependencies
```bash
npm install
```

### 2. Environment Setup
Copy `.env.example` to `.env` and fill in your Supabase connection strings:
```bash
cp .env.example .env
```

### 3. Database Operations (Prisma & Supabase)
```bash
# Generate Prisma Client
npm run db:generate

# Push schema directly to Supabase
npm run db:push

# Run migrations
npm run db:migrate

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

## Available Endpoints
- `GET /` — Root status info
- `GET /health` — Service health and uptime check
- `GET /api` — API metadata and available endpoints
