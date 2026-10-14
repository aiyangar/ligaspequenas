import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'

export interface LoadErrorProps {
  onRetry: () => void
  message?: string
}

export function LoadError({ onRetry, message = 'No se pudo cargar la información.' }: LoadErrorProps) {
  return (
    <Alert
      severity="error"
      sx={{ mt: 2 }}
      action={
        <Button color="inherit" size="small" onClick={onRetry}>
          Reintentar
        </Button>
      }
    >
      {message}
    </Alert>
  )
}
