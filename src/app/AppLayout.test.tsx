import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, vi } from 'vitest'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { ThemeProvider } from '@mui/material/styles'
import { AppLayout } from './AppLayout'
import { draculaTheme } from '../theme/dracula'

const mocks = vi.hoisted(() => ({ useTenant: vi.fn(), signOut: vi.fn() }))
vi.mock('../tenant/TenantContext', () => ({ useTenant: mocks.useTenant }))
vi.mock('../lib/supabase', () => ({ supabase: { auth: { signOut: mocks.signOut } } }))

beforeEach(() => {
  vi.clearAllMocks()
  mocks.signOut.mockResolvedValue({ error: null })
})

function renderLayout(entry = '/') {
  const router = createMemoryRouter(
    [
      {
        element: <AppLayout />,
        children: [
          { index: true, element: <p>contenido</p> },
          { path: 'jugadores/:id', element: <p>ficha</p> },
          { path: 'equipos', element: <p>equipos</p> },
        ],
      },
      { path: '/login', element: <h1>Login</h1> },
    ],
    { initialEntries: [entry] },
  )
  return render(
    <ThemeProvider theme={draculaTheme}>
      <RouterProvider router={router} />
    </ThemeProvider>,
  )
}

test('hides the Usuarios link for readonly users', () => {
  mocks.useTenant.mockReturnValue({ status: 'ready', role: 'readonly', fullName: 'Beto' })
  renderLayout()
  expect(screen.queryByRole('link', { name: 'Usuarios' })).not.toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Jugadores' })).toBeInTheDocument()
})

test('shows the Usuarios link for admins', () => {
  mocks.useTenant.mockReturnValue({ status: 'ready', role: 'admin', fullName: 'Ana' })
  renderLayout()
  expect(screen.getByRole('link', { name: 'Usuarios' })).toBeInTheDocument()
})

test('shows the Equipos nav link', () => {
  mocks.useTenant.mockReturnValue({ status: 'ready', role: 'readonly', fullName: 'Beto' })
  renderLayout()
  expect(screen.getByRole('link', { name: 'Equipos' })).toHaveAttribute('href', '/equipos')
})

test('shows the no-access screen when the user has no profile', () => {
  mocks.useTenant.mockReturnValue({ status: 'no-profile', role: null, fullName: null })
  renderLayout()
  expect(screen.getByText(/no tiene acceso/i)).toBeInTheDocument()
})

test('shows an error screen when profile loading fails', () => {
  mocks.useTenant.mockReturnValue({ status: 'error', role: null, fullName: null })
  renderLayout()
  expect(screen.getByRole('alert')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Salir' })).toBeInTheDocument()
})

test('logging out signs out and redirects to /login', async () => {
  mocks.useTenant.mockReturnValue({ status: 'ready', role: 'admin', fullName: 'Ana' })
  const user = userEvent.setup()
  renderLayout()
  await user.click(screen.getByRole('button', { name: 'Salir' }))
  expect(mocks.signOut).toHaveBeenCalledTimes(1)
  expect(await screen.findByText('Login')).toBeInTheDocument()
})

const ACTIVE_UNDERLINE = `inset 0 -2px 0 ${draculaTheme.palette.primary.main.toLowerCase()}`

test('the section links live in the Principal navigation landmark, without Salir', () => {
  mocks.useTenant.mockReturnValue({ status: 'ready', role: 'admin', fullName: 'Ana' })
  renderLayout()
  const nav = screen.getByRole('navigation', { name: 'Principal' })
  expect(within(nav).getAllByRole('link').map((a) => a.textContent)).toEqual([
    'Jugadores',
    'Equipos',
    'Quién debe',
    'Usuarios',
  ])
  expect(within(nav).queryByRole('button', { name: 'Salir' })).not.toBeInTheDocument()
})

test('the current section is marked with aria-current, a primary underline and bold text', () => {
  mocks.useTenant.mockReturnValue({ status: 'ready', role: 'readonly', fullName: 'Beto' })
  renderLayout('/equipos')
  const current = screen.getByRole('link', { name: 'Equipos' })
  expect(current).toHaveAttribute('aria-current', 'page')
  expect(current).toHaveStyle({ boxShadow: ACTIVE_UNDERLINE, fontWeight: '700' })
  const other = screen.getByRole('link', { name: 'Jugadores' })
  expect(other).not.toHaveAttribute('aria-current')
  expect(other).not.toHaveStyle({ boxShadow: ACTIVE_UNDERLINE })
})

test.each(['/', '/jugadores/p1'])('Jugadores is the current section on %s', (entry) => {
  mocks.useTenant.mockReturnValue({ status: 'ready', role: 'readonly', fullName: 'Beto' })
  renderLayout(entry)
  const players = screen.getByRole('link', { name: 'Jugadores' })
  expect(players).toHaveAttribute('aria-current', 'page')
  expect(players).toHaveStyle({ boxShadow: ACTIVE_UNDERLINE, fontWeight: '700' })
  expect(screen.getByRole('link', { name: 'Equipos' })).not.toHaveAttribute('aria-current')
})

test('the Principal nav does not box its links, so they wrap together with Salir', () => {
  mocks.useTenant.mockReturnValue({ status: 'ready', role: 'admin', fullName: 'Ana' })
  renderLayout()
  expect(screen.getByRole('navigation', { name: 'Principal' })).toHaveStyle({ display: 'contents' })
})
