import type { WASocket, WAMessage, proto } from '@whiskeysockets/baileys'

export async function reactToMessage(
  sock: WASocket,
  jid: string,
  messageKey: proto.IMessageKey,
  emoji: string
) {
  return sock.sendMessage(jid, {
    react: {
      text: emoji,
      key: messageKey
    }
  })
}

export async function sendReply(
  sock: WASocket,
  jid: string,
  text: string,
  quotedMessage: WAMessage,
  mentionJids?: string[]
) {
  return sock.sendMessage(jid, {
    text,
    mentions: mentionJids || []
  }, {
    quoted: quotedMessage
  })
}

export async function setTyping(sock: WASocket, jid: string) {
  await sock.presenceSubscribe(jid)
  return sock.sendPresenceUpdate('composing', jid)
}

export async function clearTyping(sock: WASocket, jid: string) {
  return sock.sendPresenceUpdate('paused', jid)
}
