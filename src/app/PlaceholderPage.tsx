import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'

export function PlaceholderPage({ title }: { title: string }) {
  return (
    <Box>
      <Typography variant="h4" component="h1" gutterBottom>{title}</Typography>
      <Typography color="text.secondary">Próximamente</Typography>
    </Box>
  )
}
