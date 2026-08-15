# Workflow: WhatsApp Ingestion

This document details the observable end-to-end flow for connecting to WhatsApp, receiving messages via Baileys, filtering target conversations, and dispatching events to the Agent Brain.

---

## 1. Flow Overview

```text
[ WhatsApp Cloud / Group ]
           │
           │ (Baileys WebSocket)
           ▼
[ Connection Handler ] ──── QR Code / Credentials Restore
           │
           │ `messages.upsert`
           ▼
[ Channel Filter ] ──────── Discard non-monitored groups & statuses
           │
           │ Authorized Message
           ▼
[ Deduplication Check ] ─── Reject if message_id exists in message_audit_logs
           │
           │ New Unprocessed Message
           ▼
[ Audit Log Save ] ──────── Insert into message_audit_logs (processed = false)
           │
           ▼
[ Dispatch to Brain ] ───── Trigger entity extraction and reasoning
```

---

## 2. Step-by-Step Lifecycle

### Step 1: Authentication & Socket Initialization
- Baileys uses `useMultiFileAuthState` to save credentials locally in a non-committed directory (e.g. `./auth_info_baileys/`).
- On first start, the terminal prints a QR code (or pairing code) for the admin device to link.
- On subsequent boots, the session resumes silently without requiring re-authentication.

### Step 2: Channel Whitelisting
- Not all messages should be processed. The system checks `msg.key.remoteJid` against a configured allow-list of group JIDs (`ALLOWED_GROUP_JIDS`).
- Broadcast status updates (`status@broadcast`) and direct 1-to-1 spam are filtered out unless explicitly permitted.

### Step 3: Message Parsing & Extraction
- Plain text, extended text (`extendedTextMessage`), and captioned media messages are extracted and normalized to standard text.
- Metadata (sender JID, sender push name, timestamp, message ID) is structured.

### Step 4: Event Forwarding & Brain Dispatch
- The normalized event payload is handed off to the Agent Brain processing pipeline.
- If processing succeeds, the audit log record is marked `processed = true`.
