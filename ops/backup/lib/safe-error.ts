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

export class CodedError extends Error {
  code: string
  index: number | undefined

  constructor(code: string, index?: number) {
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

// Codes like ENOENT, UND_ERR_SOCKET or size; anything else could carry arbitrary text.
function codeOf(value: unknown): string | undefined {
  if (!isObject(value)) return undefined
  const code = value.code
  return typeof code === 'string' && /^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(code) ? code : undefined
}
