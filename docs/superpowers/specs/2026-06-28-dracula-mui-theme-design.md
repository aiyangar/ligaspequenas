# Design Spec — Dracula theme (Material/MUI) foundation

**Date:** 2026-06-28
**Branch:** `feature/dracula-mui-theme`
**Status:** Approved (design)

## Goal

Establish the project's design-system foundation: adopt Material UI (MUI) with a
dark Dracula theme, and retire Tailwind. This task delivers only the theme
foundation plus a minimal verification screen. The Plan 2 app shell (AppBar,
navigation, auth screens) is out of scope and will consume this theme later.

## Decisions (locked)

- **Component strategy:** MUI v7 with a custom Dracula theme. Real Material
  components, themed via `createTheme`.
- **Tailwind:** removed entirely. MUI is the only styling/layout system
  (`sx`, `Box`, `Stack`, `Grid`, theme).
- **Scope:** theme foundation + verification screen only.
- **Color mode:** dark only (`palette.mode: 'dark'`). No light variant, no toggle.
- **Secondary accent:** Dracula pink. Iconic purple + pink pairing.

## Non-goals

- No app shell, routing, auth, or Plan 2 work.
- No light theme / mode toggle.
- No custom Material component restyling beyond palette + sensible defaults.

## Dependencies

**Add:**

- `@mui/material`
- `@emotion/react`, `@emotion/styled` (MUI's styling engine)
- `@mui/icons-material`
- `@fontsource/roboto` (Material's Roboto font, served locally — no external CDN)

**Remove:**

- `tailwindcss`, `postcss`, `autoprefixer`
- Delete `tailwind.config.js` and `postcss.config.js`

## Theme module — `src/theme/dracula.ts`

Exports a single MUI theme built with `createTheme`. Dracula palette mapped to
Material color roles:

| Material role        | Dracula name | Hex                      |
| -------------------- | ------------ | ------------------------ |
| `primary.main`       | Purple       | `#BD93F9`                |
| `secondary.main`     | Pink         | `#FF79C6`                |
| `error.main`         | Red          | `#FF5555`                |
| `warning.main`       | Orange       | `#FFB86C`                |
| `info.main`          | Cyan         | `#8BE9FD`                |
| `success.main`       | Green        | `#50FA7B`                |
| `background.default` | Background   | `#282A36`                |
| `background.paper`   | Current Line | `#44475A`                |
| `text.primary`       | Foreground   | `#F8F8F2`                |
| `text.secondary`     | Comment      | `#6272A4`                |
| `divider`            | Comment (α)  | `rgba(98, 114, 164, 0.3)` |

Additional theme config:

- `palette.mode: 'dark'`.
- Explicit `contrastText: '#282A36'` on the bright accents (`primary`,
  `secondary`, `info`, `warning`, `success`) so button labels stay legible
  (dark text on a light accent).
- Typography: Roboto (Material default). Default type scale.
- `shape.borderRadius`: Material default (4px).

## App wiring — `src/main.tsx`

- Wrap `<App />` in `<ThemeProvider theme={draculaTheme}>` with `<CssBaseline />`.
- `CssBaseline` applies `background.default` to `body`, the foreground text
  color, and the Material reset (replaces Tailwind's preflight).
- Import the required Roboto weights from `@fontsource/roboto`.
- `src/index.css`: drop the `@tailwind` directives (keep only minimal global
  styles if needed, otherwise remove the import).

## Verification screen — `src/App.tsx`

Replace the `<h1>` with a minimal showcase that renders Material components to
confirm the Dracula colors visually:

- `AppBar` + `Toolbar`
- `Typography` keeping the text **"Liga MTY AC"** (so the existing test still
  passes)
- `Button` across variants (`contained`, `outlined`, `text`) and colors
  (`primary`, `secondary`, `error`)
- `TextField`
- `Card` / `Paper`
- `Chip`
- `Switch`
- `Alert` in each severity (`error`, `warning`, `info`, `success`)

This screen is temporary; Plan 2 replaces it with the real shell.

## Testing (vitest + testing-library, already configured)

- **Theme test** (`src/theme/dracula.test.ts`): asserts the mapping —
  `mode === 'dark'`, `primary.main === '#BD93F9'`, `secondary.main === '#FF79C6'`,
  `error/warning/info/success` mains, and the backgrounds. Locks color
  regressions.
- **App smoke test** (`src/App.test.tsx`): render inside `ThemeProvider`, still
  finds `"Liga MTY AC"`. Update the existing test to wrap with the provider.

## Manual verification (not automatable)

Run `localhost:5173` and confirm by eye: background `#282A36`, purple/pink
buttons, alerts in their colors, purple AppBar. User validates in the browser
before the task is closed.

## Risks / notes

- `text.secondary` uses Dracula comment `#6272A4`; contrast on `#282A36` is
  acceptable for secondary/caption text but not for body copy — body text uses
  `text.primary`.
- MUI v7 supports React 19; no peer-dependency conflict expected.
