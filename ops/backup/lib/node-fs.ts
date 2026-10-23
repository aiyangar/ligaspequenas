import { mkdir, readFile, writeFile } from 'node:fs/promises'
import type { FsLike } from './storage.ts'

export const nodeFs: FsLike = {
  async mkdir(path) {
    await mkdir(path, { recursive: true })
  },
  async writeFile(path, data) {
    await writeFile(path, data)
  },
  async readFile(path) {
    return readFile(path)
  },
}
