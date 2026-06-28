import { draculaTheme } from './dracula'

test('is a dark theme', () => {
  expect(draculaTheme.palette.mode).toBe('dark')
})

test('maps Dracula accents to Material roles', () => {
  expect(draculaTheme.palette.primary.main).toBe('#BD93F9')
  expect(draculaTheme.palette.secondary.main).toBe('#FF79C6')
  expect(draculaTheme.palette.error.main).toBe('#FF5555')
  expect(draculaTheme.palette.warning.main).toBe('#FFB86C')
  expect(draculaTheme.palette.info.main).toBe('#8BE9FD')
  expect(draculaTheme.palette.success.main).toBe('#50FA7B')
})

test('uses Dracula backgrounds and foreground', () => {
  expect(draculaTheme.palette.background.default).toBe('#282A36')
  expect(draculaTheme.palette.background.paper).toBe('#44475A')
  expect(draculaTheme.palette.text.primary).toBe('#F8F8F2')
})

test('sets readable contrast and muted tokens', () => {
  expect(draculaTheme.palette.primary.contrastText).toBe('#282A36')
  expect(draculaTheme.palette.secondary.contrastText).toBe('#282A36')
  expect(draculaTheme.palette.error.contrastText).toBe('#282A36')
  expect(draculaTheme.palette.warning.contrastText).toBe('#282A36')
  expect(draculaTheme.palette.info.contrastText).toBe('#282A36')
  expect(draculaTheme.palette.success.contrastText).toBe('#282A36')
  expect(draculaTheme.palette.text.secondary).toBe('#6272A4')
  expect(draculaTheme.palette.divider).toBe('rgba(98, 114, 164, 0.3)')
})
