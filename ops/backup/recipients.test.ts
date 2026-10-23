// @vitest-environment node
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { RecipientsError, parseRecipients } from './lib/recipients.ts'

const KEY_A = 'age1' + 'q'.repeat(58)
const KEY_B = 'age1' + 'p'.repeat(58)
const KEY_C = 'age1' + 'z'.repeat(58)
const SECRET = 'AGE-SECRET-KEY-1' + 'Q'.repeat(58)
const HEADER = '# Destinatarios\n# Exactamente dos\n'

const script = fileURLToPath(new URL('./check-recipients.ts', import.meta.url))
const template = fileURLToPath(new URL('./recipients.txt', import.meta.url))

function rejects(text: string) {
  expect(() => parseRecipients(text)).toThrow(RecipientsError)
}

test('two distinct recipients with comments and blank lines are accepted', () => {
  expect(parseRecipients(`${HEADER}\n${KEY_A}\n\n  ${KEY_B}  \n# trailing\n`)).toEqual([KEY_A, KEY_B])
})

test('CRLF line endings are accepted', () => {
  expect(parseRecipients(`${KEY_A}\r\n${KEY_B}\r\n`)).toEqual([KEY_A, KEY_B])
})

test('the committed template has no recipients and is rejected', () => {
  const text = readFileSync(template, 'utf8')
  expect(text).not.toMatch(/^\s*age1/m)
  rejects(text)
})

test('zero, one or three recipients are rejected', () => {
  rejects(HEADER)
  rejects(`${HEADER}${KEY_A}\n`)
  rejects(`${KEY_A}\n${KEY_B}\n${KEY_C}\n`)
})

test('a duplicated recipient is rejected', () => {
  rejects(`${KEY_A}\n${KEY_A}\n`)
})

test('a recipient with trailing garbage is rejected', () => {
  rejects(`${KEY_A} garbage\n${KEY_B}\n`)
  rejects(`age1 ${'q'.repeat(58)}\n${KEY_B}\n`)
})

test('a line that is not an age1 recipient is rejected', () => {
  rejects(`${KEY_A}\nssh-ed25519 AAAA\n`)
  rejects(`${KEY_A}\nage1${'q'.repeat(57)}\n`)
  rejects(`${KEY_A}\nage1${'b'.repeat(58)}\n`)
})

test('a pasted private key is rejected and does not appear in the error', () => {
  let caught: unknown
  try {
    parseRecipients(`${KEY_A}\n${SECRET}\n`)
  } catch (err) {
    caught = err
  }
  expect(caught).toBeInstanceOf(RecipientsError)
  const err = caught as Error
  expect(err.message).not.toContain('AGE-SECRET-KEY')
  expect(String(err.stack)).not.toContain('AGE-SECRET-KEY')
})

describe('check-recipients entry point', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'recipients-'))
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  function run(content: string | null) {
    const file = join(dir, 'recipients.txt')
    if (content !== null) writeFileSync(file, content)
    const res = spawnSync(process.execPath, [script, file], { encoding: 'utf8' })
    return { status: res.status, out: res.stdout + res.stderr }
  }

  test('prints only the count on success', () => {
    const res = run(`${HEADER}${KEY_A}\n${KEY_B}\n`)
    expect(res).toEqual({ status: 0, out: 'recipients=2\n' })
  })

  test('fails closed on the template without printing its content', () => {
    const res = run(readFileSync(template, 'utf8'))
    expect(res).toEqual({ status: 1, out: 'error: recipients\n' })
  })

  test('fails on a private key without printing it', () => {
    const res = run(`${KEY_A}\n${SECRET}\n`)
    expect(res).toEqual({ status: 1, out: 'error: recipients\n' })
  })

  test('fails on a missing file without printing the path', () => {
    const res = run(null)
    expect(res).toEqual({ status: 1, out: 'error: recipients\n' })
  })
})
