import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { MANIFEST_FILE, SUMS_FILE, buildManifest } from './lib/manifest.ts'
import { CodedError, runMain } from './lib/safe-error.ts'

runMain(async () => {
  const root = process.argv[2]
  if (!root) throw new CodedError('args')
  const { manifest, sha256sums } = await buildManifest(root, {
    createdAt: new Date().toISOString(),
    commit: process.env.GITHUB_SHA || null,
  })
  await writeFile(join(root, MANIFEST_FILE), JSON.stringify(manifest, null, 2) + '\n')
  await writeFile(join(root, SUMS_FILE), sha256sums)
  console.log(`files=${manifest.files.length}`)
})
