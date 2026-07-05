import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, vi } from 'vitest'
import { TeamForm } from './TeamForm'
import type { CategoryRow, TeamFormValues } from './teams'

const cats: CategoryRow[] = [
  { id: 'cat1', name: 'Infantil Mayor', division: 'Infantil', sort_order: 5 },
  { id: 'cat2', name: 'Infantil Menor', division: 'Infantil', sort_order: 4 },
]
const base: TeamFormValues = { name: '', category_id: 'cat1', coach: '', color: '' }

test('edits the name field', async () => {
  const onChange = vi.fn()
  const user = userEvent.setup()
  render(<TeamForm values={base} categories={cats} onChange={onChange} />)
  await user.type(screen.getByLabelText(/Nombre/), 'R')
  expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ name: 'R' }))
})

test('locks the category select when categoryLocked is set', () => {
  render(<TeamForm values={base} categories={cats} onChange={vi.fn()} categoryLocked />)
  expect(screen.getByLabelText(/Categoría/)).toBeDisabled()
})
