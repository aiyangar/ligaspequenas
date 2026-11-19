export function flashOf(state: unknown): string | null {
  return (state as { flash?: string } | null)?.flash ?? null
}
