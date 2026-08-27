// Copy the SQL migrations next to the compiled server.
//
// The service runs from apps/api/dist and applies migrations at startup, so the
// files have to travel with the build rather than be looked up through the
// repository layout — which is not guaranteed to exist in a container.

import { cp, mkdir, readdir } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const source = resolve(here, '../../../supabase/migrations')
const target = resolve(here, '../dist/migrations')

await mkdir(target, { recursive: true })
const files = (await readdir(source)).filter((f) => f.endsWith('.sql'))
for (const file of files) {
  await cp(join(source, file), join(target, file))
}
console.log(`copied ${files.length} migration(s) to dist/migrations`)
