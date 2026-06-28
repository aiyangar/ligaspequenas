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
          <Stack direction="row" spacing={2} useFlexGap sx={{ flexWrap: 'wrap' }}>
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
          <Stack direction="row" spacing={2} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
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
