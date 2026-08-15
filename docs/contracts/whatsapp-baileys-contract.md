# Contract: WhatsApp & Baileys Integration

This contract defines the invariants, socket lifecycle, and event handling requirements for the **`@whiskeysockets/baileys`** WhatsApp integration in **LC_Agent**.

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

1. **Credentials Isolation**:
   - Baileys multi-file authentication state (`auth_info_baileys/`) contains private cryptographic Signal keys and session tokens.
   - It is strictly ignored via `.gitignore` and must **never** be committed to Git.
2. **Reconnection Loop with Exponential Backoff**:
   - When the socket disconnects due to transient network drops, the service must inspect `lastDisconnect.error` (via Boom) and gracefully attempt reconnection unless `statusCode === DisconnectReason.loggedOut`.
3. **Batched Event Processing (`sock.ev.process`)**:
   - Event listeners should prefer `sock.ev.process(async (events) => { ... })` over individual `.on()` listeners to handle atomic batches during sync and burst arrivals.
4. **Strict Channel Whitelist**:
   - The listener must drop messages from unrecognized JIDs or private chats before invoking the extraction engine (`ALLOWED_GROUP_JIDS`).
5. **Idempotency Gate**:
   - The listener must check `message_id` against `message_audit_logs` before dispatching to the Agent Brain. Duplicate WhatsApp socket pushes must not produce duplicate tasks or database rows.

---

## 3. Implementation Map

- **Socket Client Manager**: `src/services/whatsapp/client.ts` — Manages `makeWASocket`, `useMultiFileAuthState`, `makeCacheableSignalKeyStore`, and connection status updates.
- **Event Dispatcher**: `src/services/whatsapp/listener.ts` — Subscribes to `messages.upsert` (filtered by `type === 'notify'`) and group updates.
- **Message Normalizer**: `src/services/whatsapp/parser.ts` — Extracts text content from conversation, extended text, and image captions; resolves mentions and sender JIDs.

---

## 4. Validation & Testing

- **Non-Fatal Disconnect**: Verify that transient socket drops reconnect cleanly without crashing the Node.js process.
- **Deduplication Test**: Receiving the same message payload twice results in exactly one database insert in `message_audit_logs` and `tasks`.
