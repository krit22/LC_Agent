# Workflow: Task Management & Predefined Workflows

This document describes how the AI Agent Brain parses, creates, and transitions tasks across flexible states and predefined workflow pipelines (such as the Poster Making lifecycle), as well as administering members and domains in the database.

---

## 1. Workflow Types & State Machine

LC_Agent distinguishes between **General Tasks** (`workflow_type = 'GENERAL'`) and **Predefined Structured Workflows** (`workflow_type = 'POSTER'`, etc.).

### Generic Workflow (`GENERAL`)
For ad-hoc assignments without a rigid multi-stage review process:
```text
[ ASSIGNED ] ──► [ ONGOING ] ──► [ COMPLETED ]
       │                │
       ▼                ▼
  [ BLOCKED ]      [ CANCELLED ]
```

### Predefined Workflow: Poster Making (`POSTER`)
For creative design deliverables that require review rounds and iterations:
```text
[ SEARCHING_TEMPLATES ]
         │
         ▼
    [ EDITING ] ◄────────────────┐
         │                       │
         ▼                       │
    [ REVIEW ]                   │
         │                       │
         ├───────────────────────┤
         ▼                       │
[ CHANGES_REQUESTED ] ───────────┘
  (Feedback stored in `feedback` & `metadata.change_log`)
         │
         ▼
  [ COMPLETED ]
```

---

## 2. Handling "Changes Requested" Feedback

When a reviewer requests revisions on a poster or task:
1. The status transitions to `CHANGES_REQUESTED`.
2. The specific revision notes (e.g. *"Change the date font to bold and fix the club logo resolution"*) are stored directly in `tasks.feedback`.
3. An entry is appended to `tasks.metadata` in the `change_history` array:
   ```json
   {
     "change_history": [
       {
         "requested_by": "Rohit",
         "feedback": "Change the date font to bold and fix the club logo resolution",
         "timestamp": "2026-08-15T17:30:00Z",
         "round": 1
       }
     ]
   }
   ```
4. Once the designer updates the draft, the task transitions back to `EDITING` or `REVIEW`.

---

## 3. Entity Resolution & Domain Routing

- **Assignee Resolution**:
  - Matched via WhatsApp JID mention (`@919876543210`) or by case-insensitive name against `people`.
- **Domain Association**:
  - If a task explicitly mentions or relates to one of the 4 domains (`Web Development`, `Video Editing`, `Content Writing`, `Graphic Designing`), `domain_id` is linked.
  - If the task is cross-domain or general, `domain_id` remains `NULL`.
- **Member Year Constraints**:
  - Members in `people` belong to academic year `1`, `2`, `3`, or `4`, and can be linked to 2, 3, or 4 domains in `person_domains`.

---

## 4. Agent Conversational Examples

The agent is activated by the `lc ` trigger prefix in authorized WhatsApp chats.

### A. Chat-Driven Member Administration
```text
User:  lc add Rahul Sharma, 3rd year, domains: web_dev, graphic_design, role: Lead
Agent: ✅ Added Rahul Sharma (Year 3, Lead) linked to Web Development & Graphic Designing.

User:  lc change Rahul's role to President
Agent: ✅ Updated Rahul Sharma's role to President.
```

### B. Task Creation & Workflow Progression
```text
User:  lc create a poster task for the Annual Hackathon, assign to Rahul, high priority
Agent: ✅ Task created:
       • Title: Poster for Annual Hackathon
       • Assignee: Rahul Sharma
       • Domain: Graphic Designing
       • Stage: SEARCHING_TEMPLATES | Priority: high

User:  lc update the hackathon poster task to EDITING
Agent: ✅ Updated "Poster for Annual Hackathon" status → EDITING.
```

### C. Querying Tasks & Members
```text
User:  lc what tasks are currently ongoing?
Agent: Active tasks:
       1. Poster for Annual Hackathon (Assignee: Rahul Sharma, Stage: EDITING, Priority: high)

User:  lc list all members in Graphic Designing
Agent: Graphic Designing Members:
       • Rahul Sharma (Year 3, President)
```

### D. Safe Schema Evolution (Two-Step Confirmation)
```text
User:  lc add a new column 'github_handle' to people table
Agent: ⚠️ Database Schema Modification Proposed:
       ```sql
       ALTER TABLE people ADD COLUMN github_handle VARCHAR(100);
       ```
       To execute this change, please reply with: `lc confirm SQL-8192`

User:  lc confirm SQL-8192
Agent: ✅ SQL query executed successfully. Added column 'github_handle' to table 'people'.
```
