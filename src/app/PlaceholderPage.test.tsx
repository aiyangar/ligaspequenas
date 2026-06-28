import { render, screen } from '@testing-library/react'
import { PlaceholderPage } from './PlaceholderPage'

test('renders the title and the coming-soon note', () => {
  render(<PlaceholderPage title="Jugadores" />)
  expect(screen.getByRole('heading', { name: 'Jugadores' })).toBeInTheDocument()
  expect(screen.getByText('Próximamente')).toBeInTheDocument()
})
