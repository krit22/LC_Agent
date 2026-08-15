# Database Schema & Entity Models

This document defines the relational PostgreSQL schema for **LC_Agent** managed via **Prisma ORM** and hosted on **Supabase**. All database migrations and query builders must conform to these models.

---

## 1. Entity Relationship Overview

```text
┌─────────────────┐             ┌─────────────────┐
│     domains     │             │     people      │
├─────────────────┤             ├─────────────────┤
│ id (PK, UUID)   │ 1 ──────── n│ id (PK, UUID)   │
│ name            │             │ name            │
│ description     │             │ phone_jid (UQ)  │
│ created_at      │             │ domain_id (FK)  │
└─────────────────┘             │ role            │
                                │ created_at      │
                                └────────┬────────┘
                                         │ 1
                                         │
                                         │ n
                                ┌────────▼────────┐
                                │      tasks      │
                                ├─────────────────┤
                                │ id (PK, UUID)   │
                                │ task            │
                                │ description     │
                                │ assigned_to(FK) │
                                │ status          │
                                │ due_date        │
                                │ source_msg_id   │
                                │ created_at      │
                                └─────────────────┘
```

---

## 2. Table Definitions

### Table: `people`
Tracks club members, their contact identifiers, and their primary club domains.

| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` | `PRIMARY KEY, @default(uuid())` | Unique member identifier |
| `name` | `VARCHAR(255)` | `NOT NULL` | Full name or known display name |
| `phone_jid` | `VARCHAR(100)` | `UNIQUE, NULLABLE` | WhatsApp JID (e.g. `123456789@s.whatsapp.net`) |
| `domain_id` | `UUID` | `REFERENCES domains(id) ON DELETE SET NULL` | Club domain/wing association |
| `role` | `VARCHAR(100)` | `DEFAULT 'member'` | Club role (e.g. Lead, Coordinator, Member) |
| `metadata` | `JSONB` | `DEFAULT '{}'` | Additional custom fields / contact handles |
| `created_at` | `TIMESTAMPTZ` | `DEFAULT NOW()` | Record creation timestamp |
| `updated_at` | `TIMESTAMPTZ` | `@updatedAt, DEFAULT NOW()` | Record update timestamp |

---

### Table: `tasks`
Tracks actionable tasks extracted from channel conversations or assigned through the system.

| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` | `PRIMARY KEY, @default(uuid())` | Unique task identifier |
| `task` | `TEXT` | `NOT NULL` | Summary / title of what needs to be done |
| `description` | `TEXT` | `NULLABLE` | Detailed task instructions or context |
| `assigned_to` | `UUID` | `REFERENCES people(id) ON DELETE SET NULL` | Assigned club member |
| `status` | `VARCHAR(50)` | `DEFAULT 'pending'` | Status: `pending`, `in_progress`, `completed`, `cancelled` |
| `priority` | `VARCHAR(20)` | `DEFAULT 'medium'` | Priority: `low`, `medium`, `high`, `urgent` |
| `due_date` | `TIMESTAMPTZ` | `NULLABLE` | Expected deadline |
| `source_message_id` | `VARCHAR(255)` | `NULLABLE` | WhatsApp message ID from which task was sketched |
| `created_at` | `TIMESTAMPTZ` | `DEFAULT NOW()` | Record creation timestamp |
| `updated_at` | `TIMESTAMPTZ` | `@updatedAt, DEFAULT NOW()` | Record update timestamp |

---

### Table: `domains`
Reference table for The Literary Circle Club functional domains (e.g. Editorial, Design, Events, PR, Tech).

| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` | `PRIMARY KEY, @default(uuid())` | Domain ID |
| `name` | `VARCHAR(100)` | `UNIQUE, NOT NULL` | Domain name (e.g. "Editorial") |
| `description` | `TEXT` | `NULLABLE` | Description of domain scope |
| `created_at` | `TIMESTAMPTZ` | `DEFAULT NOW()` | Timestamp |

---

### Table: `message_audit_logs`
Audit trail of ingested WhatsApp messages for idempotency checking and extraction traceability.

| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` | `PRIMARY KEY, @default(uuid())` | Audit log ID |
| `message_id` | `VARCHAR(255)` | `UNIQUE, NOT NULL` | WhatsApp unique message ID |
| `sender_jid` | `VARCHAR(100)` | `NOT NULL` | Sender WhatsApp JID |
| `group_jid` | `VARCHAR(100)` | `NOT NULL` | Group or channel WhatsApp JID |
| `message_text` | `TEXT` | `NULLABLE` | Raw text payload |
| `intent_detected` | `VARCHAR(100)` | `NULLABLE` | Extracted intent (e.g. `TASK_ASSIGN`, `MEMBER_INTRO`, `INFO`) |
| `processed` | `BOOLEAN` | `DEFAULT FALSE` | Processing completion flag |
| `created_at` | `TIMESTAMPTZ` | `DEFAULT NOW()` | Ingestion timestamp |

---

## 3. Prisma Schema Source

The Prisma schema is located at [`prisma/schema.prisma`](../prisma/schema.prisma) with connection configuration in [`prisma.config.ts`](../prisma.config.ts).

```prisma
datasource db {
  provider = "postgresql"
}

generator client {
  provider = "prisma-client-js"
}

model Domain {
  id          String   @id @default(uuid()) @db.Uuid
  name        String   @unique @db.VarChar(100)
  description String?  @db.Text
  createdAt   DateTime @default(now()) @map("created_at") @db.Timestamptz()

  people Person[]

  @@map("domains")
}

model Person {
  id        String   @id @default(uuid()) @db.Uuid
  name      String   @db.VarChar(255)
  phoneJid  String?  @unique @map("phone_jid") @db.VarChar(100)
  domainId  String?  @map("domain_id") @db.Uuid
  role      String   @default("member") @db.VarChar(100)
  metadata  Json     @default("{}")
  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz()
  updatedAt DateTime @updatedAt @map("updated_at") @db.Timestamptz()

  domain Domain? @relation(fields: [domainId], references: [id], onDelete: SetNull)
  tasks  Task[]

  @@map("people")
}

model Task {
  id              String    @id @default(uuid()) @db.Uuid
  task            String    @db.Text
  description     String?   @db.Text
  assignedTo      String?   @map("assigned_to") @db.Uuid
  status          String    @default("pending") @db.VarChar(50)
  priority        String    @default("medium") @db.VarChar(20)
  dueDate         DateTime? @map("due_date") @db.Timestamptz()
  sourceMessageId String?   @map("source_message_id") @db.VarChar(255)
  createdAt       DateTime  @default(now()) @map("created_at") @db.Timestamptz()
  updatedAt       DateTime  @updatedAt @map("updated_at") @db.Timestamptz()

  assignee Person? @relation(fields: [assignedTo], references: [id], onDelete: SetNull)

  @@map("tasks")
}

model MessageAuditLog {
  id             String   @id @default(uuid()) @db.Uuid
  messageId      String   @unique @map("message_id") @db.VarChar(255)
  senderJid      String   @map("sender_jid") @db.VarChar(100)
  groupJid       String   @map("group_jid") @db.VarChar(100)
  messageText    String?  @map("message_text") @db.Text
  intentDetected String?  @map("intent_detected") @db.VarChar(100)
  processed      Boolean  @default(false)
  createdAt      DateTime @default(now()) @map("created_at") @db.Timestamptz()

  @@map("message_audit_logs")
}
```

---

## 4. Schema Migration & Maintenance

1. **Client Generation**: Run `npm run db:generate` (`npx prisma generate`) after any schema changes.
2. **Schema Push**: Run `npm run db:push` (`npx prisma db push`) to synchronize local/Supabase database structure during development.
3. **Formal Migrations**: Run `npm run db:migrate` (`npx prisma migrate dev`) to create versioned SQL migration files.
4. **Prisma Studio**: Run `npm run db:studio` (`npx prisma studio`) to view and edit database rows visually.
