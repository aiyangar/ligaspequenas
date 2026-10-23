import { readFileSync } from 'node:fs'
import { parseRecipients } from './lib/recipients.ts'

// Any failure, including a missing file, prints the same line: no file content or path reaches the log.
try {
  const file = process.argv[2]
  if (file === undefined) throw new Error('usage')
  const recipients = parseRecipients(readFileSync(file, 'utf8'))
  console.log(`recipients=${recipients.length}`)
} catch {
  console.error('error: recipients')
  process.exit(1)
}
