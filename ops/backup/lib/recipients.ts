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
  // Same rules as `age -R`: no trimming, comments only at column 0, only a trailing CR is tolerated.
  const lines = text
    .split('\n')
    .map((line) => line.replace(/\r$/, ''))
    .filter((line) => line !== '' && !line.startsWith('#'))
  if (lines.length !== REQUIRED_RECIPIENTS) throw new RecipientsError()
  if (!lines.every((line) => RECIPIENT.test(line))) throw new RecipientsError()
  if (new Set(lines).size !== lines.length) throw new RecipientsError()
  return lines
}
