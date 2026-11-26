// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs'

const TEMPLATES = {
  invite: {
    subject: 'Te invitaron a Little Baseball Club',
    title: 'Te dieron acceso a Little Baseball Club',
    body: 'Un administrador te invitó a la app de Little Baseball Club con el correo {{ .Email }}. Para entrar, abre este enlace:',
    button: 'Aceptar invitación',
    note: 'El enlace es válido por 1 hora y solo se puede usar una vez. Después, para entrar, pide un enlace nuevo en la pantalla de inicio de sesión.',
  },
  magic_link: {
    subject: 'Tu enlace para entrar a Little Baseball Club',
    title: 'Tu enlace de acceso',
    body: 'Pediste entrar a Little Baseball Club con {{ .Email }}.',
    button: 'Entrar',
    note: 'El enlace es válido por 1 hora y solo se puede usar una vez. Si ya no sirve, pide otro desde la pantalla de inicio de sesión.',
  },
  confirmation: {
    subject: 'Confirma tu correo en Little Baseball Club',
    title: 'Confirma tu correo',
    body: 'Para activar tu acceso a Little Baseball Club con {{ .Email }}, abre este enlace:',
    button: 'Confirmar y entrar',
    note: 'El enlace es válido por 1 hora y solo se puede usar una vez.',
  },
} as const
const NAMES = Object.keys(TEMPLATES) as (keyof typeof TEMPLATES)[]
const ALLOWED_VARIABLES = ['.ConfirmationURL', '.Email']

function tomlTable(toml: string, header: string): Record<string, string> {
  const lines = toml.split('\n').filter((line) => !line.trimStart().startsWith('#'))
  const start = lines.findIndex((line) => line.trim() === `[${header}]`)
  if (start === -1) return {}
  const table: Record<string, string> = {}
  for (const line of lines.slice(start + 1)) {
    if (line.trimStart().startsWith('[')) break
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*?)\s*$/)
    if (match) table[match[1]] = match[2].replace(/^"(.*)"$/, '$1')
  }
  return table
}

function flat(html: string): string {
  return html.replace(/\s+/g, ' ')
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

const readConfig = () => readFileSync(new URL('../config.toml', import.meta.url), 'utf8')
const readTemplate = (name: string) => readFileSync(new URL(`./${name}.html`, import.meta.url), 'utf8')

test.each(NAMES)('config.toml declares the %s template with a branded subject', (name) => {
  const table = tomlTable(readConfig(), `auth.email.template.${name}`)
  expect(table.subject).toBe(TEMPLATES[name].subject)
  expect(table.subject).toContain('Little Baseball Club')
  expect(table.content_path).toBe(`./supabase/templates/${name}.html`)
  expect(existsSync(new URL(`../../${table.content_path.slice(2)}`, import.meta.url))).toBe(true)
})

test('config.toml keeps otp_expiry at 3600', () => {
  expect(tomlTable(readConfig(), 'auth.email').otp_expiry).toBe('3600')
})

test.each(NAMES)('%s.html is a Spanish full HTML document', (name) => {
  const html = readTemplate(name)
  expect(html.trimStart()).toMatch(/^<!doctype html>/i)
  expect(html).toMatch(/<html lang="es">/i)
  expect(html).toMatch(/<meta charset="utf-8">/i)
})

test.each(NAMES)('%s.html links {{ .ConfirmationURL }} as a button and as plain text', (name) => {
  const html = readTemplate(name)
  const button = new RegExp(
    `<a\\b[^>]*href="\\{\\{ \\.ConfirmationURL \\}\\}"[^>]*>\\s*${escapeRegExp(TEMPLATES[name].button)}\\s*</a>`,
  )
  expect(flat(html)).toMatch(button)
  expect(html.replace(/href="\{\{ \.ConfirmationURL \}\}"/g, '')).toContain('{{ .ConfirmationURL }}')
})

test.each(NAMES)('%s.html uses only allowed template variables', (name) => {
  const variables = [...readTemplate(name).matchAll(/\{\{\s*([\s\S]*?)\s*\}\}/g)].map((match) => match[1])
  expect(variables.length).toBeGreaterThan(0)
  for (const variable of variables) expect(ALLOWED_VARIABLES).toContain(variable)
})

test.each(NAMES)('%s.html has no scripts, remote images, external stylesheets or http:// links', (name) => {
  const html = readTemplate(name)
  expect(html).not.toMatch(/<script/i)
  expect(html).not.toMatch(/<img\b[^>]*\bsrc=["']?(https?:)?\/\//i)
  expect(html).not.toMatch(/<link\b[^>]*stylesheet/i)
  expect(html).not.toMatch(/http:\/\//i)
})

test.each(NAMES)('%s.html contains its required copy', (name) => {
  const html = flat(readTemplate(name))
  const { title, body, note } = TEMPLATES[name]
  for (const text of [title, body, note, 'Little Baseball Club', '1 hora']) expect(html).toContain(text)
})

test.each(NAMES)('%s.html keeps both footer lines in one paragraph', (name) => {
  expect(flat(readTemplate(name))).toMatch(
    /<p\b[^>]*>(?:(?!<\/p>).)*Si no esperabas este correo, puedes ignorarlo\.(?:(?!<\/p>).)*Este buzón no recibe respuestas\.(?:(?!<\/p>).)*<\/p>/,
  )
})

test.each(NAMES)('%s.html does not mention Liga MTY AC', (name) => {
  expect(readTemplate(name)).not.toContain('Liga MTY AC')
})
