import { expect, vi } from 'vitest'
import { PAGE_SIZE, fetchAllRows } from './fetchAllRows'
import type { PageResult } from './fetchAllRows'

function seq(start: number, count: number): number[] {
  return Array.from({ length: count }, (_, i) => start + i)
}

function ok(data: number[]): PageResult<number> {
  return { data, error: null }
}

function pages(...results: PageResult<number>[]) {
  const page = vi.fn<(from: number, to: number) => Promise<PageResult<number>>>()
  for (const result of results) page.mockResolvedValueOnce(result)
  page.mockResolvedValue(ok([]))
  return page
}

const byValue = (n: number) => String(n)

test('blocks are 1000 rows, the PostgREST max-rows default', () => {
  expect(PAGE_SIZE).toBe(1000)
})

test('an empty table takes one request', async () => {
  const page = pages(ok([]))
  expect(await fetchAllRows(page, byValue)).toEqual([])
  expect(page.mock.calls).toEqual([[0, 999]])
})

test('a short block is not the end: it reads until an empty block', async () => {
  const page = pages(ok(seq(0, 3)), ok([]))
  expect(await fetchAllRows(page, byValue)).toEqual([0, 1, 2])
  expect(page.mock.calls).toEqual([[0, 999], [3, 1002]])
})

test('1001 rows take three requests and keep their order', async () => {
  const page = pages(ok(seq(0, 1000)), ok([1000]), ok([]))
  expect(await fetchAllRows(page, byValue)).toEqual(seq(0, 1001))
  expect(page.mock.calls).toEqual([[0, 999], [1000, 1999], [1001, 2000]])
})

test('a server capped at 500 rows still reads everything, advancing by the rows received', async () => {
  const page = pages(ok(seq(0, 500)), ok(seq(500, 500)), ok(seq(1000, 200)), ok([]))
  expect(await fetchAllRows(page, byValue)).toEqual(seq(0, 1200))
  expect(page.mock.calls).toEqual([[0, 999], [500, 1499], [1000, 1999], [1200, 2199]])
})

test('an error in a later block throws instead of returning a partial list', async () => {
  const page = pages(ok(seq(0, 1000)), { data: null, error: { message: 'boom' } })
  await expect(fetchAllRows(page, byValue)).rejects.toThrow('boom')
  expect(page).toHaveBeenCalledTimes(2)
})

test('null data without an error ends the read', async () => {
  const page = pages(ok(seq(0, 3)), { data: null, error: null })
  expect(await fetchAllRows(page, byValue)).toEqual([0, 1, 2])
  expect(page).toHaveBeenCalledTimes(2)
})

test('a row repeated across blocks appears once and the offset still advances by the rows received', async () => {
  const page = pages(ok([0, 1, 2]), ok([2, 3]), ok([]))
  expect(await fetchAllRows(page, byValue)).toEqual([0, 1, 2, 3])
  expect(page.mock.calls).toEqual([[0, 999], [3, 1002], [5, 1004]])
})

test('the first occurrence of a repeated key wins', async () => {
  const page = vi.fn<(from: number, to: number) => Promise<PageResult<{ id: string; v: number }>>>()
  page.mockResolvedValueOnce({ data: [{ id: 'a', v: 1 }], error: null })
  page.mockResolvedValueOnce({ data: [{ id: 'a', v: 2 }, { id: 'b', v: 3 }], error: null })
  page.mockResolvedValue({ data: [], error: null })
  expect(await fetchAllRows(page, (r) => r.id)).toEqual([{ id: 'a', v: 1 }, { id: 'b', v: 3 }])
})

test('one block made only of rows already read is tolerated, as a concurrent insert can shift rows', async () => {
  const page = pages(ok([0]), ok([0]), ok([1]), ok([]))
  expect(await fetchAllRows(page, byValue)).toEqual([0, 1])
  expect(page.mock.calls.map(([from]) => from)).toEqual([0, 1, 2, 3])
})

test('a response that ignores the range throws instead of paging forever', async () => {
  const page = vi.fn(async (from: number): Promise<PageResult<number>> =>
    from > 100 ? { data: null, error: { message: 'runaway paging' } } : ok([0, 1]),
  )
  await expect(fetchAllRows(page, byValue)).rejects.toThrow('the server ignored the requested range')
  expect(page.mock.calls.map(([from]) => from)).toEqual([0, 2, 4])
})
