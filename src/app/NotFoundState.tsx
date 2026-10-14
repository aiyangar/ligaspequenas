import { Link as RouterLink } from 'react-router-dom'
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'

export interface NotFoundStateProps {
  title: string
  backTo: string
  backLabel: string
}

export function NotFoundState({ title, backTo, backLabel }: NotFoundStateProps) {
  return (
    <Alert
      severity="warning"
      sx={{ mt: 2 }}
      action={
        <Button color="inherit" size="small" component={RouterLink} to={backTo}>
          {backLabel}
        </Button>
      }
    >
      {title}
    </Alert>
  )
}
