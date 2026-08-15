# Contract: WhatsApp & Baileys Integration

This contract defines the invariants, socket lifecycle, event handling, and privacy boundary requirements for the **`@whiskeysockets/baileys`** WhatsApp integration in **LC_Agent**.

---

## 1. Installed Dependencies & Libraries

- **`@whiskeysockets/baileys`**: Direct WebSocket client for WhatsApp Web multi-device protocol.
- **`@hapi/boom`**: HTTP-friendly error objects for parsing `DisconnectReason` status codes.
- **`pino`**: High-performance structured logger for Baileys internal socket logging.
- **`qrcode-terminal`**: Terminal QR-code renderer for local authentication pairing.
- **`ai`**: Vercel AI SDK core — `generateText()` with multi-step tool calling.
- **`@openrouter/ai-sdk-provider`**: OpenRouter provider — routes to 300+ LLMs via single API key.
- **`zod`**: Schema validation for agent tool parameters and outputs.

---

## 2. Primary Invariants

1. **Sender & Channel Permission Matrix**:
   - **Groups (`@g.us`)**: Responds to commands from both the user (`fromMe: true`) and other participants (`fromMe: false`).
   - **Direct Messages (1:1 DMs)**: Responds **exclusively** to messages sent by the user (`fromMe: true`). Incoming DMs from external contacts are discarded at the gateway.
2. **Credentials Isolation**:
   - Baileys multi-file authentication state (`auth_info_baileys/`) contains private cryptographic Signal keys and session tokens.
   - It is strictly ignored via `.gitignore` and must **never** be committed to Git.
3. **Reconnection Loop with Exponential Backoff**:
   - When the socket disconnects due to transient network drops, the service must inspect `lastDisconnect.error` (via Boom) and gracefully attempt reconnection unless `statusCode === DisconnectReason.loggedOut`.
4. **Batched Event Processing (`sock.ev.process`)**:
   - Event listeners must use `sock.ev.process(async (events) => { ... })` to handle atomic batches during sync and burst arrivals.
5. **Group Whitelist Gate**:
   - If `ALLOWED_GROUP_JIDS` is configured, group messages outside that list are ignored.
6. **Idempotency Gate**:
   - The listener must check `message_id` against `message_audit_logs` before dispatching to the Agent Brain. Duplicate WhatsApp socket pushes must not produce duplicate tasks or database rows.

---

## 3. Implementation Map

- **Socket Client Manager**: `src/services/whatsapp/client.ts` — Manages `makeWASocket`, `useMultiFileAuthState`, `makeCacheableSignalKeyStore`, QR terminal rendering, and connection lifecycle.
- **Event Dispatcher**: `src/services/whatsapp/listener.ts` — Subscribes to `messages.upsert` (filtered by `type === 'notify'`), performs channel & sender verification, trigger checking, and dispatches to agent brain.
- **Message Normalizer**: `src/gateway/message-normalizer.ts` — Extracts text content, sender JIDs, self-message flags, and mentions.
- **Trigger Gate**: `src/gateway/trigger-filter.ts` — Enforces channel eligibility (`isAllowedMessage`) and `lc ` prefix filter.
- **Responder**: `src/services/whatsapp/responder.ts` — Sends reactions (⏳, ✅, ❌), typing presence, and quoted replies.

---

## 4. Validation & Testing

- **Non-Fatal Disconnect**: Verify that transient socket drops reconnect cleanly without crashing the Node.js process.
- **DM Self-Sent Acceptance**: Messages sent by the user in any 1:1 DM starting with `lc ` are processed and replied to.
- **DM Contact Rejection**: Messages sent by external contacts in 1:1 DMs are ignored and never trigger the LLM or DB.
- **Group Acceptance**: Messages sent by any member in an authorized group starting with `lc ` are processed.
- **Deduplication Test**: Receiving the same message payload twice results in exactly one database insert in `message_audit_logs` and `tasks`.
