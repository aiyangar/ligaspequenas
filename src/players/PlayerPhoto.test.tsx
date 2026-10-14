import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, vi } from 'vitest'
import { PlayerPhoto } from './PlayerPhoto'

const mocks = vi.hoisted(() => ({
  uploadPlayerPhoto: vi.fn(),
  removePlayerPhoto: vi.fn(),
  getSignedFileUrl: vi.fn(),
}))
vi.mock('./players', async (importActual) => {
  const actual = await importActual<typeof import('./players')>()
  return { ...actual, uploadPlayerPhoto: mocks.uploadPlayerPhoto, removePlayerPhoto: mocks.removePlayerPhoto }
})
vi.mock('../documents/documents', async (importActual) => {
  const actual = await importActual<typeof import('../documents/documents')>()
  return { ...actual, getSignedFileUrl: mocks.getSignedFileUrl }
})

const base = { id: 'p1', tenant_id: 't1', full_name: 'Ana Ruiz', photo_path: null as string | null, updated_at: 'u1' }

function renderPhoto(over: Partial<Parameters<typeof PlayerPhoto>[0]> = {}) {
  const onChanged = vi.fn()
  render(<PlayerPhoto player={base} canEdit consentGranted onChanged={onChanged} {...over} />)
  return { onChanged }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.uploadPlayerPhoto.mockResolvedValue({ ok: true })
  mocks.removePlayerPhoto.mockResolvedValue({ ok: true })
  mocks.getSignedFileUrl.mockResolvedValue('https://signed/photo')
})

test('without a photo shows initials and Subir foto', () => {
  renderPhoto()
  expect(screen.getByText('AR')).toBeInTheDocument()
  expect(screen.getByLabelText('Subir foto', { selector: 'input' })).toBeEnabled()
  expect(mocks.getSignedFileUrl).not.toHaveBeenCalled()
})

test('with a photo shows the signed image, Cambiar and Quitar', async () => {
  renderPhoto({ player: { ...base, photo_path: 't1/p1/photo' } })
  const img = await screen.findByRole('img', { name: 'Foto de Ana Ruiz' })
  expect(img).toHaveAttribute('src', 'https://signed/photo')
  expect(screen.getByLabelText('Cambiar', { selector: 'input' })).toBeEnabled()
  expect(screen.getByRole('button', { name: 'Quitar' })).toBeEnabled()
})

test('a failed signed URL falls back to the initials', async () => {
  mocks.getSignedFileUrl.mockRejectedValueOnce(new Error('Object not found'))
  renderPhoto({ player: { ...base, photo_path: 't1/p1/photo' } })
  await waitFor(() => expect(mocks.getSignedFileUrl).toHaveBeenCalled())
  expect(await screen.findByText('AR')).toBeInTheDocument()
  expect(screen.queryByRole('img', { name: 'Foto de Ana Ruiz' })).not.toBeInTheDocument()
})

test('without consent the upload is disabled with the lock hint', () => {
  renderPhoto({ consentGranted: false })
  expect(screen.getByLabelText('Subir foto', { selector: 'input' })).toBeDisabled()
  expect(screen.getByText('Requiere consentimiento de imagen y aviso de privacidad')).toBeInTheDocument()
})

test('readonly sees only the avatar', () => {
  renderPhoto({ canEdit: false, player: { ...base, photo_path: 't1/p1/photo' } })
  expect(screen.queryByLabelText('Cambiar', { selector: 'input' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Quitar' })).not.toBeInTheDocument()
})

test('uploading calls uploadPlayerPhoto and reports success', async () => {
  const user = userEvent.setup()
  const { onChanged } = renderPhoto()
  const f = new File(['x'], 'a.jpg', { type: 'image/jpeg' })
  await user.upload(screen.getByLabelText('Subir foto', { selector: 'input' }), f)
  await waitFor(() => expect(mocks.uploadPlayerPhoto).toHaveBeenCalledWith(base, f, true))
  expect(onChanged).toHaveBeenCalledWith('Foto actualizada')
})

test('a failed upload shows the error', async () => {
  mocks.uploadPlayerPhoto.mockResolvedValueOnce({ ok: false, error: 'La foto supera 5 MB.' })
  const user = userEvent.setup()
  const { onChanged } = renderPhoto()
  await user.upload(screen.getByLabelText('Subir foto', { selector: 'input' }), new File(['x'], 'a.jpg', { type: 'image/jpeg' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('La foto supera 5 MB.')
  expect(onChanged).not.toHaveBeenCalled()
})

test('Quitar asks for confirmation and removes on confirm', async () => {
  const user = userEvent.setup()
  const player = { ...base, photo_path: 't1/p1/photo' }
  const { onChanged } = renderPhoto({ player })
  await user.click(screen.getByRole('button', { name: 'Quitar' }))
  expect(await screen.findByRole('dialog', { name: '¿Quitar la foto?' })).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Quitar foto' }))
  await waitFor(() => expect(mocks.removePlayerPhoto).toHaveBeenCalledWith(player))
  expect(onChanged).toHaveBeenCalledWith('Foto actualizada')
})
