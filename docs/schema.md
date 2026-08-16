# Database Schema & Entity Models

This document defines the relational PostgreSQL schema for **LC_Agent** managed via **Prisma ORM** and hosted on **Supabase**. All database migrations and query builders must conform to these models.

---

## 1. Entity Relationship Overview

```text
┌──────────────────────────┐             ┌──────────────────────────┐
│         domains          │             │          people          │
├──────────────────────────┤             ├──────────────────────────┤
│ id (UUID, PK)            │             │ id (UUID, PK)            │
│ name (VarChar, Unique)   │             │ name (VarChar)           │
│ code (VarChar, Unique)   │             │ year (SmallInt: 1,2,3,4) │
│ description (Text, Null) │             │ phone_jid (VarChar, UQ)  │
│ created_at (Timestamp)   │             │ role (VarChar)           │
└────────────┬─────────────┘             │ metadata (JSONB)         │
             │                           │ created_at / updated_at  │
             │ 1                         └────────────┬─────────────┘
             │                                        │ 1
             │ n                                      │ n
     ┌───────▼────────────────────────────────────────▼───────┐
     │                     person_domains                     │
     ├────────────────────────────────────────────────────────┤
     │ person_id (UUID, FK -> people.id, Cascade Delete)      │
     │ domain_id (UUID, FK -> domains.id, Cascade Delete)     │
     │ created_at (Timestamp)                                 │
     │ Primary Key: (person_id, domain_id)                    │
     └────────────────────────────────────────────────────────┘

                                         ┌──────────────────────────┐
                                         │          tasks           │
                                         ├──────────────────────────┤
                                         │ id (UUID, PK)            │
                                         │ task (Text)              │
                                         │ description (Text, Null) │
                                         │ assigned_to (UUID, Null) │──> FK to people.id
                                         │ domain_id (UUID, Null)   │──> FK to domains.id
                                         │ workflow_type (VarChar)  │ (GENERAL, POSTER)
                                         │ status (VarChar)         │ (ASSIGNED, SEARCHING_TEMPLATES, etc.)
                                         │ feedback (Text, Null)    │ (Detail for changes requested)
                                         │ priority (VarChar)       │ (low, medium, high, urgent)
                                         │ due_date (Timestamp)     │
                                         │ metadata (JSONB)         │
                                         │ source_message_id (Text) │
                                         │ created_at / updated_at  │
                                         └──────────────────────────┘

                                         ┌──────────────────────────┐
                                         │       spreadsheets       │
                                         ├──────────────────────────┤
                                         │ id (UUID, PK)            │
                                         │ title (VarChar)          │
                                         │ url (Text)               │
                                         │ description (Text, Null) │
                                         │ purpose (VarChar, Null)  │
                                         │ metadata (JSONB)         │
                                         │ created_at / updated_at  │
                                         └──────────────────────────┘

                                         ┌──────────────────────────┐
                                         │      scheduled_jobs      │
                                         ├──────────────────────────┤
                                         │ id (UUID, PK)            │
                                         │ name (VarChar)           │
                                         │ cron_expression (VarChar)│ (e.g. "0 8 * * *")
                                         │ timezone (VarChar)       │ (Asia/Kolkata)
                                         │ target_jid (VarChar)     │ (Target WhatsApp Group)
                                         │ prompt (Text)            │ (Autonomous instructions)
                                         │ status (VarChar)         │ ("ACTIVE" | "PAUSED")
                                         │ last_run_at (Timestamp)  │
                                         │ metadata (JSONB)         │
                                         │ created_at / updated_at  │
                                         └──────────────────────────┘
```

---

## 2. Table Definitions

### Table: `domains`
The 4 core domains (plus any future domains) of The Literary Circle Club.

| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` | `PRIMARY KEY, @default(uuid())` | Unique domain identifier |
| `name` | `VARCHAR(100)` | `UNIQUE, NOT NULL` | Human-readable name (e.g. "Web Development", "Video Editing", "Content Writing", "Graphic Designing") |
| `code` | `VARCHAR(50)` | `UNIQUE, NOT NULL` | Programmatic identifier (`web_dev`, `video_editing`, `content_writing`, `graphic_design`) |
| `description` | `TEXT` | `NULLABLE` | Domain scope and responsibilities |
| `created_at` | `TIMESTAMPTZ` | `DEFAULT NOW()` | Record creation timestamp |

---

### Table: `people`
Club members, their academic year (1, 2, 3, or 4), contact handles, and roles.

| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` | `PRIMARY KEY, @default(uuid())` | Unique member identifier |
| `name` | `VARCHAR(255)` | `NOT NULL` | Full name or known display name |
| `year` | `SMALLINT` | `NOT NULL` | College academic year: `1`, `2`, `3`, or `4` |
| `phone_jid` | `VARCHAR(100)` | `UNIQUE, NULLABLE` | WhatsApp JID (e.g. `123456789@s.whatsapp.net`) |
| `role` | `VARCHAR(100)` | `DEFAULT 'member'` | Club role (e.g. Lead, Coordinator, Member) |
| `metadata` | `JSONB` | `DEFAULT '{}'` | Additional custom fields / contact handles |
| `created_at` | `TIMESTAMPTZ` | `DEFAULT NOW()` | Record creation timestamp |
| `updated_at` | `TIMESTAMPTZ` | `@updatedAt, DEFAULT NOW()` | Record update timestamp |

---

### Table: `person_domains`
Join table supporting many-to-many relationships between members and domains (members typically have 2 to 4 domains).

| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `person_id` | `UUID` | `REFERENCES people(id) ON DELETE CASCADE` | Member reference |
| `domain_id` | `UUID` | `REFERENCES domains(id) ON DELETE CASCADE` | Domain reference |
| `created_at` | `TIMESTAMPTZ` | `DEFAULT NOW()` | Association timestamp |
| **PK** | `Composite` | `PRIMARY KEY (person_id, domain_id)` | Unique pair constraint |

---

### Table: `tasks`
Tracks both generic tasks and structured workflow tasks (e.g. Poster Making).

| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` | `PRIMARY KEY, @default(uuid())` | Unique task identifier |
| `task` | `TEXT` | `NOT NULL` | Title / summary of the task |
| `description` | `TEXT` | `NULLABLE` | Detailed instructions or context |
| `assigned_to` | `UUID` | `REFERENCES people(id) ON DELETE SET NULL` | Assigned member (nullable) |
| `domain_id` | `UUID` | `REFERENCES domains(id) ON DELETE SET NULL` | Associated domain (optional / nullable) |
| `workflow_type` | `VARCHAR(50)` | `DEFAULT 'GENERAL'` | Workflow model: `'GENERAL'`, `'POSTER'`, etc. |
| `status` | `VARCHAR(50)` | `DEFAULT 'ASSIGNED'` | Current stage or status |
| `feedback` | `TEXT` | `NULLABLE` | Detail/notes for requested changes during review |
| `priority` | `VARCHAR(20)` | `DEFAULT 'medium'` | Priority: `low`, `medium`, `high`, `urgent` |
| `due_date` | `TIMESTAMPTZ` | `NULLABLE` | Deadline |
| `metadata` | `JSONB` | `DEFAULT '{}'` | Structured history, links, and revision logs |
| `source_message_id` | `VARCHAR(255)` | `NULLABLE` | Originating WhatsApp message ID |
| `created_at` | `TIMESTAMPTZ` | `DEFAULT NOW()` | Creation timestamp |
| `updated_at` | `TIMESTAMPTZ` | `@updatedAt, DEFAULT NOW()` | Update timestamp |

---

### Table: `spreadsheets`
Registers external Google Sheets and Excel/CSV URLs with metadata, headers, and descriptions for agent querying and knowledge retrieval.

| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` | `PRIMARY KEY, @default(uuid())` | Unique spreadsheet reference ID |
| `title` | `VARCHAR(255)` | `NOT NULL` | Sheet title (e.g. "Club Membership 2026", "Freshers Recruitment Data") |
| `url` | `TEXT` | `NOT NULL` | Full Google Sheets link or CSV URL |
| `description` | `TEXT` | `NULLABLE` | Description of data contents |
| `purpose` | `VARCHAR(255)` | `NULLABLE` | Target audience, domain, or club function |
| `metadata` | `JSONB` | `DEFAULT '{}'` | Extracted headers, initial row counts, sample data |
| `created_at` | `TIMESTAMPTZ` | `DEFAULT NOW()` | Record creation timestamp |
| `updated_at` | `TIMESTAMPTZ` | `@updatedAt, DEFAULT NOW()` | Record update timestamp |

---

### Table: `scheduled_jobs`
Stores autonomous cron routines and scheduled workflows with targets and execution prompts.

| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` | `PRIMARY KEY, @default(uuid())` | Scheduled job ID |
| `name` | `VARCHAR(255)` | `NOT NULL` | Job title (e.g. "Daily Good Morning", "Sunday Task Review") |
| `cron_expression` | `VARCHAR(100)` | `NOT NULL` | Standard 5-part cron syntax (e.g. `0 8 * * *`) |
| `timezone` | `VARCHAR(50)` | `DEFAULT 'Asia/Kolkata'` | Timezone of execution |
| `target_jid` | `VARCHAR(100)` | `NOT NULL` | Target WhatsApp group or DM chat JID |
| `prompt` | `TEXT` | `NOT NULL` | Autonomous prompt given to agent brain on trigger |
| `status` | `VARCHAR(50)` | `DEFAULT 'ACTIVE'` | `ACTIVE` or `PAUSED` |
| `last_run_at` | `TIMESTAMPTZ` | `NULLABLE` | Timestamp of most recent execution |
| `metadata` | `JSONB` | `DEFAULT '{}'` | Additional settings |
| `created_at` | `TIMESTAMPTZ` | `DEFAULT NOW()` | Creation timestamp |
| `updated_at` | `TIMESTAMPTZ` | `@updatedAt, DEFAULT NOW()` | Update timestamp |

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
| `intent_detected` | `VARCHAR(100)` | `NULLABLE` | Extracted intent |
| `processed` | `BOOLEAN` | `DEFAULT FALSE` | Processing completion flag |
| `created_at` | `TIMESTAMPTZ` | `DEFAULT NOW()` | Ingestion timestamp |

---

## 3. Seed & Initialization

The initial 4 domains are pre-populated via the seed script in [`prisma/seed.ts`](../prisma/seed.ts):
```bash
npm run db:seed
```
- **Web Development** (`web_dev`)
- **Video Editing** (`video_editing`)
- **Content Writing** (`content_writing`)
- **Graphic Designing** (`graphic_design`)
