export const PAGE_SIZE = 1000

export interface PageResult<T> {
  data: T[] | null
  error: { message: string } | null
}

export async function fetchAllRows<T>(
  page: (from: number, to: number) => PromiseLike<PageResult<T>>,
  key: (row: T) => string,
): Promise<T[]> {
  const seen = new Set<string>()
  const rows: T[] = []
  let offset = 0
  let staleBlocks = 0
  for (;;) {
    const { data, error } = await page(offset, offset + PAGE_SIZE - 1)
    if (error) throw new Error(error.message)
    // stop only on an empty block: a short one may just mean max-rows < PAGE_SIZE
    if (!data || data.length === 0) return rows
    offset += data.length
    const before = rows.length
    for (const row of data) {
      const k = key(row)
      if (seen.has(k)) continue
      seen.add(k)
      rows.push(row)
    }
    // one all-repeated block can be a concurrent insert; two in a row means the range is ignored
    staleBlocks = rows.length === before ? staleBlocks + 1 : 0
    if (staleBlocks === 2) throw new Error('fetchAllRows: the server ignored the requested range')
  }
}
