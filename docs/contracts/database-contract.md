# Contract: Database & Supabase Integration (Prisma ORM)

This contract defines the invariants, connection lifecycle, and safety boundaries for database interactions using **Prisma ORM** connecting to **Supabase PostgreSQL** in **LC_Agent**.

---

## 1. Primary Invariants

1. **Strict Type-Safety & Parameterization**:
   - All database reads and writes must use the generated Prisma Client (`src/db/prisma.ts`).
   - If raw SQL is ever necessary, `prisma.$queryRaw` with tagged template literals (parameterized) must be used. Never use string concatenation.
2. **Supabase Dual-Connection Topology**:
   - **Runtime Queries (`DATABASE_URL`)**: Connects via Supabase connection pooler (Supavisor / pgbouncer, port 6543) using transaction pooling mode to manage connection concurrency.
   - **Migration Operations (`DIRECT_URL`)**: Connects directly to the PostgreSQL database (port 5432) to support schema alterations, DDL locks, and migrations.
3. **Singleton Client Pattern**:
   - The Prisma Client must be instantiated via a global singleton in [`src/db/prisma.ts`](../../src/db/prisma.ts) to prevent connection leaks during development hot-reloads (`tsx watch`).
4. **Atomic Multi-Entity Transactions**:
   - Multi-step entity mutations (e.g. creating a task and marking a message log as processed) must execute inside `prisma.$transaction([ ... ])` or interactive transactions `prisma.$transaction(async (tx) => { ... })`.
5. **No Committed Secrets**:
   - Database credentials (`DATABASE_URL`, `DIRECT_URL`, `SUPABASE_SERVICE_ROLE_KEY`) must only be supplied via `.env` / environment variables.

---

## 2. Implementation Map

- **Prisma Schema**: [`prisma/schema.prisma`](../../prisma/schema.prisma)
- **Prisma 7 Configuration**: [`prisma.config.ts`](../../prisma.config.ts)
- **Prisma Client Singleton**: [`src/db/prisma.ts`](../../src/db/prisma.ts)
- **Supabase CLI Configuration**: [`supabase/config.toml`](../../supabase/config.toml)
- **Environment Template**: [`.env.example`](../../.env.example)

---

## 3. CLI Commands & Tooling

| Task | Command | Description |
| :--- | :--- | :--- |
| Generate Prisma Client | `npm run db:generate` | Generates `@prisma/client` from schema |
| Push Schema to DB | `npm run db:push` | Syncs schema directly without creating migration files |
| Create Migration | `npm run db:migrate` | Generates and runs versioned SQL migrations |
| Open Prisma Studio | `npm run db:studio` | Opens visual database browser |
| Start Local Supabase | `npm run supabase:start` | Boots local Supabase Docker stack |
| Check Supabase Status | `npm run supabase:status` | Displays local API/DB ports and keys |
| Stop Local Supabase | `npm run supabase:stop` | Tears down local Supabase Docker stack |

---

## 4. Validation & Testing

- **Compilation Check**: `npm run build` must verify that Prisma Client types compile cleanly against all services.
- **Connection Health**: Verify database connectivity using `$queryRaw` or lightweight query on server startup.
