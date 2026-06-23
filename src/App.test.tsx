import { render, screen } from '@testing-library/react'
import App from './App'

test('renders the league name', () => {
  render(<App />)
  expect(screen.getByText('Liga MTY AC')).toBeInTheDocument()
})
