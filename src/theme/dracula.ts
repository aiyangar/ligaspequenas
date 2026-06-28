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
