export class RecipientsError extends Error {
  code = 'recipients'

  constructor() {
    super('recipients')
    this.name = 'RecipientsError'
  }
}

// X25519 recipients from age-keygen: "age1" + 58 bech32 characters.
const RECIPIENT = /^age1[02-9ac-hj-np-z]{58}$/

export const REQUIRED_RECIPIENTS = 2

export function parseRecipients(text: string): string[] {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('#'))
  if (lines.length !== REQUIRED_RECIPIENTS) throw new RecipientsError()
  if (!lines.every((line) => RECIPIENT.test(line))) throw new RecipientsError()
  if (new Set(lines).size !== lines.length) throw new RecipientsError()
  return lines
}
