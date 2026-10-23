import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { countCopyRows, crosscheckPasses } from './lib/copy-block.ts'
import { CodedError, runMain } from './lib/safe-error.ts'
import { BUCKET, indexFile, parseIndex } from './lib/storage.ts'

runMain(async () => {
  const root = process.argv[2]
  if (!root) throw new CodedError('args')
  const db = countCopyRows(await readFile(join(root, 'db', 'data.sql'), 'utf8'), '"storage"."objects"', 'bucket_id', BUCKET)
  const storageObjects = parseIndex(await readFile(indexFile(root), 'utf8')).length
  if (db.found) console.log(`db_objects=${db.count} storage_objects=${storageObjects}`)
  if (!crosscheckPasses(db, storageObjects)) throw new CodedError('crosscheck')
})
