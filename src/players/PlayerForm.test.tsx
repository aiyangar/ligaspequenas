import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, vi } from 'vitest'
import { PlayerForm } from './PlayerForm'
import { emptyPlayer } from './players'

test('renders the player, tutor and affiliation fields', () => {
  render(<PlayerForm values={emptyPlayer()} onChange={() => {}} categoryText="Infantil Mayor (1ro)" />)
  expect(screen.getByLabelText(/Nombre completo/)).toBeInTheDocument()
  expect(screen.getByLabelText(/Fecha de nacimiento/)).toBeInTheDocument()
  expect(screen.getByLabelText(/Nombre del tutor/)).toBeInTheDocument()
  expect(screen.getByLabelText(/WhatsApp del tutor/)).toBeInTheDocument()
  expect(screen.getByLabelText('Estatus de afiliación')).toBeInTheDocument()
  expect(screen.getByText(/Infantil Mayor \(1ro\)/)).toBeInTheDocument()
})

test('typing a name emits the updated values via onChange', async () => {
  const user = userEvent.setup()
  const onChange = vi.fn()
  render(<PlayerForm values={emptyPlayer()} onChange={onChange} />)
  await user.type(screen.getByLabelText(/Nombre completo/), 'A')
  expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ full_name: 'A' }))
})

test('disabled hides editing by disabling every input', () => {
  render(<PlayerForm values={emptyPlayer()} onChange={() => {}} disabled />)
  expect(screen.getByLabelText(/Nombre completo/)).toBeDisabled()
  expect(screen.getByLabelText('Estatus de afiliación')).toBeDisabled()
})
