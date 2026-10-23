export class HttpError extends Error {
  status: number
  index: number | undefined

  constructor(status: number, index?: number) {
    super(`status=${status}`)
    this.name = 'HttpError'
    this.status = status
    this.index = index
  }
}

// Never include err.message: Node's fs and fetch messages contain paths and URLs.
export function errorLine(err: unknown): string {
  let line = 'error: unknown'
  if (err instanceof HttpError) {
    line = `error: status=${err.status}`
  } else {
    const code = codeOf(err) ?? codeOf(isObject(err) ? err.cause : undefined)
    if (code !== undefined) line = `error: ${code}`
  }
  const index = isObject(err) ? err.index : undefined
  if (typeof index === 'number' && Number.isInteger(index)) line += ` index=${index}`
  return line
}

export const INTERNAL_CODES = [
  'args',
  'crosscheck',
  'env',
  'filetype',
  'index',
  'listing',
  'path',
  'recipients',
  'size',
  'target',
] as const

export type InternalCode = (typeof INTERNAL_CODES)[number]

export class CodedError extends Error {
  code: InternalCode
  index: number | undefined

  constructor(code: InternalCode, index?: number) {
    super(code)
    this.name = 'CodedError'
    this.code = code
    this.index = index
  }
}

function fail(err: unknown): never {
  console.error(errorLine(err))
  process.exit(1)
}

export function runMain(main: () => Promise<void>): void {
  process.on('uncaughtException', fail)
  process.on('unhandledRejection', fail)
  main().catch(fail)
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object'
}

// Only Node/undici code shapes or our own codes; anything else could carry arbitrary text, even a key.
const SYSTEM_CODE = /^(E[A-Z0-9]+|ERR_[A-Z0-9_]+|UND_ERR_[A-Z0-9_]+)$/

function codeOf(value: unknown): string | undefined {
  if (!isObject(value)) return undefined
  const code = value.code
  if (typeof code !== 'string') return undefined
  return SYSTEM_CODE.test(code) || (INTERNAL_CODES as readonly string[]).includes(code) ? code : undefined
}
