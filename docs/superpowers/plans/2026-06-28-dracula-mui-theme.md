# Dracula Theme (MUI) Foundation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adopt Material UI with a dark Dracula theme and retire Tailwind, delivering the design-system foundation plus a verification screen.

**Architecture:** Swap Tailwind for MUI v7 (+ Emotion engine). A single theme module (`src/theme/dracula.ts`) maps the Dracula palette to Material color roles. The app root wraps everything in `ThemeProvider` + `CssBaseline`; `App.tsx` becomes a temporary showcase that Plan 2 will replace.

**Tech Stack:** React 19, Vite 8, TypeScript, MUI v7, Emotion, Vitest + Testing Library.

## Global Constraints

- **MUI v7**, React 19 — install without `--legacy-peer-deps` (MUI v7 supports React 19).
- **Dark only**: `palette.mode: 'dark'`. No light variant, no toggle.
- **No external CDN**: Roboto served locally via `@fontsource/roboto`.
- **No Tailwind** anywhere after Task 1.
- Vitest globals are enabled (`vite.config.ts` → `test.globals: true`); tests use global `test`/`expect` with **no** `vitest` import, matching existing tests.
- Run tests one-shot with `npx vitest run <path>` (`npm run test` is watch mode).
- All commits use English messages, end with the `Claude-Session:` trailer, and land on `feature/dracula-mui-theme` — never `main`/`develop`.

---

### Task 1: Swap Tailwind → MUI dependencies and config

**Files:**
- Modify: `package.json` (via npm)
- Delete: `tailwind.config.js`, `postcss.config.js`, `src/index.css`
- Modify: `src/main.tsx:3` (remove `import './index.css'`)

**Interfaces:**
- Consumes: nothing.
- Produces: a clean MUI baseline — `@mui/material`, `@emotion/react`, `@emotion/styled`, `@mui/icons-material`, `@fontsource/roboto` installed; no Tailwind. The app still builds and renders the plain `<h1>`.

- [ ] **Step 1: Remove Tailwind dependencies**

Run:
```bash
npm uninstall tailwindcss postcss autoprefixer
```

- [ ] **Step 2: Install MUI + Emotion + Roboto**

Run:
```bash
npm install @mui/material @emotion/react @emotion/styled @mui/icons-material @fontsource/roboto
```
Expected: installs without peer-dependency errors.

- [ ] **Step 3: Delete Tailwind config and the Tailwind CSS entry**

Run:
```bash
rm tailwind.config.js postcss.config.js src/index.css
```

(`src/index.css` only held the three `@tailwind` directives; `CssBaseline` replaces its reset in Task 3.)

- [ ] **Step 4: Remove the deleted CSS import from main.tsx**

Edit `src/main.tsx` — delete this line:
```tsx
import './index.css'
```

Resulting `src/main.tsx`:
```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

- [ ] **Step 5: Verify the build passes and no Tailwind remains**

Run:
```bash
npm run build
grep -rin "tailwind" src package.json postcss.config.js tailwind.config.js 2>/dev/null
```
Expected: `npm run build` succeeds (`tsc -b && vite build`). The `grep` prints nothing (exit non-zero / no matches).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Replace Tailwind with MUI + Emotion dependencies"
```

---

### Task 2: Dracula theme module

**Files:**
- Create: `src/theme/dracula.ts`
- Test: `src/theme/dracula.test.ts`

**Interfaces:**
- Consumes: `createTheme` from `@mui/material/styles` (Task 1).
- Produces: `export const draculaTheme` — an MUI `Theme`. Later tasks import it as `import { draculaTheme } from './theme/dracula'` (from `src/`) and use `draculaTheme.palette.*`.

- [ ] **Step 1: Write the failing test**

Create `src/theme/dracula.test.ts`:
```ts
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run:
```bash
npx vitest run src/theme/dracula.test.ts
```
Expected: FAIL — cannot resolve `./dracula` (module does not exist yet).

- [ ] **Step 3: Write the theme module**

Create `src/theme/dracula.ts`:
```ts
import { createTheme } from '@mui/material/styles'

export const draculaTheme = createTheme({
  palette: {
    mode: 'dark',
    primary: { main: '#BD93F9', contrastText: '#282A36' },
    secondary: { main: '#FF79C6', contrastText: '#282A36' },
    error: { main: '#FF5555', contrastText: '#282A36' },
    warning: { main: '#FFB86C', contrastText: '#282A36' },
    info: { main: '#8BE9FD', contrastText: '#282A36' },
    success: { main: '#50FA7B', contrastText: '#282A36' },
    background: { default: '#282A36', paper: '#44475A' },
    text: { primary: '#F8F8F2', secondary: '#6272A4' },
    divider: 'rgba(98, 114, 164, 0.3)',
  },
})
```

- [ ] **Step 4: Run the test to verify it passes**

Run:
```bash
npx vitest run src/theme/dracula.test.ts
```
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/theme/dracula.ts src/theme/dracula.test.ts
git commit -m "Add Dracula MUI theme module"
```

---

### Task 3: Wire ThemeProvider, build the verification showcase

**Files:**
- Modify: `src/App.tsx` (replace the `<h1>` with the showcase)
- Modify: `src/App.test.tsx` (render under `ThemeProvider`, assert showcase)
- Modify: `src/main.tsx` (add `ThemeProvider` + `CssBaseline` + Roboto)

**Interfaces:**
- Consumes: `draculaTheme` from `./theme/dracula` (Task 2); MUI components from `@mui/material/*`.
- Produces: a themed app rendering the Dracula showcase. Terminal deliverable — nothing downstream depends on the showcase (Plan 2 replaces it).

- [ ] **Step 1: Update the App test (one assertion will fail)**

Replace `src/App.test.tsx` with:
```tsx
import { render, screen } from '@testing-library/react'
import { ThemeProvider } from '@mui/material/styles'
import App from './App'
import { draculaTheme } from './theme/dracula'

const renderApp = () =>
  render(
    <ThemeProvider theme={draculaTheme}>
      <App />
    </ThemeProvider>,
  )

test('renders the league name', () => {
  renderApp()
  expect(screen.getByText('Liga MTY AC')).toBeInTheDocument()
})

test('renders themed Material components', () => {
  renderApp()
  expect(screen.getByRole('button', { name: 'Primary' })).toBeInTheDocument()
})
```

- [ ] **Step 2: Run the test to verify the new assertion fails**

Run:
```bash
npx vitest run src/App.test.tsx
```
Expected: `renders themed Material components` FAILS (current `App` has no button); `renders the league name` still PASSES.

- [ ] **Step 3: Replace App.tsx with the showcase**

Replace `src/App.tsx` with:
```tsx
import AppBar from '@mui/material/AppBar'
import Toolbar from '@mui/material/Toolbar'
import Typography from '@mui/material/Typography'
import Container from '@mui/material/Container'
import Stack from '@mui/material/Stack'
import Button from '@mui/material/Button'
import TextField from '@mui/material/TextField'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Chip from '@mui/material/Chip'
import Switch from '@mui/material/Switch'
import FormControlLabel from '@mui/material/FormControlLabel'
import Alert from '@mui/material/Alert'

export default function App() {
  return (
    <>
      <AppBar position="static">
        <Toolbar>
          <Typography variant="h6">Liga MTY AC</Typography>
        </Toolbar>
      </AppBar>
      <Container sx={{ py: 4 }}>
        <Stack spacing={3}>
          <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
            <Button variant="contained" color="primary">Primary</Button>
            <Button variant="contained" color="secondary">Secondary</Button>
            <Button variant="outlined" color="primary">Outlined</Button>
            <Button variant="text" color="secondary">Text</Button>
            <Button variant="contained" color="error">Error</Button>
          </Stack>
          <TextField label="Nombre" placeholder="Escribe aquí" />
          <Card>
            <CardContent>
              <Typography variant="h6">Card (paper)</Typography>
              <Typography color="text.secondary">
                Superficie con background.paper de Dracula.
              </Typography>
            </CardContent>
          </Card>
          <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap" useFlexGap>
            <Chip label="Primary" color="primary" />
            <Chip label="Secondary" color="secondary" />
            <FormControlLabel control={<Switch defaultChecked />} label="Switch" />
          </Stack>
          <Stack spacing={1}>
            <Alert severity="error">Error message</Alert>
            <Alert severity="warning">Warning message</Alert>
            <Alert severity="info">Info message</Alert>
            <Alert severity="success">Success message</Alert>
          </Stack>
        </Stack>
      </Container>
    </>
  )
}
```

- [ ] **Step 4: Run the App test to verify it passes**

Run:
```bash
npx vitest run src/App.test.tsx
```
Expected: PASS (2 tests).

- [ ] **Step 5: Wire the theme at the app root**

Replace `src/main.tsx` with:
```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ThemeProvider } from '@mui/material/styles'
import CssBaseline from '@mui/material/CssBaseline'
import '@fontsource/roboto/300.css'
import '@fontsource/roboto/400.css'
import '@fontsource/roboto/500.css'
import '@fontsource/roboto/700.css'
import App from './App.tsx'
import { draculaTheme } from './theme/dracula'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider theme={draculaTheme}>
      <CssBaseline />
      <App />
    </ThemeProvider>
  </StrictMode>,
)
```

- [ ] **Step 6: Verify build, full test run, and lint**

Run:
```bash
npm run build
npx vitest run
npm run lint
```
Expected: build succeeds; all tests pass; lint clean.

- [ ] **Step 7: Manual browser verification**

Run `npm run dev`, open `http://localhost:5173`. Confirm by eye:
- Page background is Dracula `#282A36`.
- AppBar is purple `#BD93F9`; "Liga MTY AC" legible on it.
- Primary button purple, Secondary button pink, Error button red.
- Card uses the lighter `#44475A` surface.
- The four Alerts show red / orange / cyan / green.

(Report the result; do not close the task on this step alone — wait for user confirmation since it is not automatable.)

- [ ] **Step 8: Commit**

```bash
git add src/main.tsx src/App.tsx src/App.test.tsx
git commit -m "Wire Dracula theme and add MUI verification showcase"
```

---

## Done criteria

- Tailwind fully removed; MUI + Emotion + Roboto installed.
- `src/theme/dracula.ts` exports `draculaTheme` with the verified Dracula→Material mapping.
- App root wrapped in `ThemeProvider` + `CssBaseline`; showcase renders the palette.
- `npm run build`, `npx vitest run`, and `npm run lint` all pass.
- User has visually confirmed the theme in the browser.
