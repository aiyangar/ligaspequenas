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
