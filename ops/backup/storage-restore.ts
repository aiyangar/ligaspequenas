import { readFile } from 'node:fs/promises'
import { CodedError, runMain } from './lib/safe-error.ts'
import { createApi, indexFile, parseIndex, restoreAll } from './lib/storage.ts'
import { nodeFs } from './lib/node-fs.ts'

runMain(async () => {
  const [backupRoot, targetUrl] = process.argv.slice(2)
  if (!backupRoot || !targetUrl) throw new CodedError('args')
  // The key comes from env only, so it never lands in shell history or the process list.
  const key = process.env.SUPABASE_RESTORE_SECRET_KEY
  if (!key) throw new CodedError('env')
  const index = parseIndex(await readFile(indexFile(backupRoot), 'utf8'))
  const restored = await restoreAll(createApi(targetUrl, key, fetch), backupRoot, index, nodeFs)
  console.log(`restored=${restored}`)
})
