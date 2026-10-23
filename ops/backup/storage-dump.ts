import { CodedError, runMain } from './lib/safe-error.ts'
import { createApi, dumpAll } from './lib/storage.ts'
import { nodeFs } from './lib/node-fs.ts'

runMain(async () => {
  const outDir = process.argv[2]
  if (outDir === undefined || outDir === '') throw new CodedError('usage')
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_BACKUP_SECRET_KEY
  if (!url || !key) throw new CodedError('env')
  await nodeFs.mkdir(outDir)
  const result = await dumpAll(createApi(url, key, fetch), outDir, nodeFs)
  console.log(`objects=${result.objects} bytes=${result.bytes}`)
})
