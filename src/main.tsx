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
