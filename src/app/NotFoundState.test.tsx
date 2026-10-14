import { render, screen } from '@testing-library/react'
import { expect } from 'vitest'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { NotFoundState } from './NotFoundState'

test('renders the title and a link back to the list', async () => {
  const router = createMemoryRouter(
    [{ path: '/x', element: <NotFoundState title="Equipo no encontrado" backTo="/equipos" backLabel="Volver a Equipos" /> }],
    { initialEntries: ['/x'] },
  )
  render(<RouterProvider router={router} />)
  expect(await screen.findByText('Equipo no encontrado')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Volver a Equipos' })).toHaveAttribute('href', '/equipos')
})
