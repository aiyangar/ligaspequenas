import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, vi } from 'vitest'
import { LoadError } from './LoadError'

test('shows the default message and retries on click', async () => {
  const onRetry = vi.fn()
  const user = userEvent.setup()
  render(<LoadError onRetry={onRetry} />)
  expect(screen.getByText('No se pudo cargar la información.')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Reintentar' }))
  expect(onRetry).toHaveBeenCalledTimes(1)
})

test('accepts a custom message', () => {
  render(<LoadError onRetry={vi.fn()} message="No se pudieron cargar los equipos." />)
  expect(screen.getByText('No se pudieron cargar los equipos.')).toBeInTheDocument()
})
