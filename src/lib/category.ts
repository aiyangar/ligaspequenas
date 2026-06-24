const ORDINALS: Record<number, string> = { 1: '1ro', 2: '2do', 3: '3ro', 4: '4to', 5: '5to' }

export function categoryLabel(name: string | null, year: number | null): string {
  if (!name) return 'Fuera de categoría'
  const ordinal = year != null ? ORDINALS[year] ?? `${year}` : ''
  return ordinal ? `${name} (${ordinal})` : name
}
