// Clear the API port before starting.
//
// A watch-mode server that dies badly, or a second terminal you forgot about,
// leaves the port held and the next `npm run dev:api` fails with EADDRINUSE.
// This kills the leftover.
//
// It only kills processes it can identify as *this* repository's server. A port
// can just as easily be held by an unrelated project, and killing a stranger's
// process to save one error message is a bad trade — for those it reports what
// is holding the port and exits, unless FREE_PORT_FORCE=1 says otherwise.

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const force = process.env.FREE_PORT_FORCE === '1'

/** Same precedence the API itself uses: shell, then .env.local, then .env. */
function resolvePort() {
  const fromArg = process.argv[2]
  if (fromArg) return Number(fromArg)
  if (process.env.PORT) return Number(process.env.PORT)

  for (const file of ['apps/api/.env.local', 'apps/api/.env']) {
    const path = resolve(root, file)
    if (!existsSync(path)) continue
    const match = /^\s*PORT\s*=\s*"?(\d+)"?/m.exec(readFileSync(path, 'utf8'))
    if (match?.[1]) return Number(match[1])
  }
  return 8787
}

const port = resolvePort()
if (!Number.isInteger(port) || port <= 0) {
  console.error(`free-port: "${process.argv[2] ?? port}" is not a port`)
  process.exit(1)
}

function listeners() {
  try {
    return execFileSync('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .split('\n')
      .map((p) => p.trim())
      .filter(Boolean)
      .map(Number)
  } catch {
    // lsof exits non-zero when nothing matches, and may not exist at all.
    return []
  }
}

function commandOf(pid) {
  try {
    return execFileSync('ps', ['-o', 'command=', '-p', String(pid)], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  } catch {
    return ''
  }
}

/**
 * The working directory, which is a far better signal than the command line:
 * a server started as `node dist/server.js` from apps/api carries no path at
 * all in argv, but its cwd is unmistakably inside this checkout.
 */
function cwdOf(pid) {
  try {
    const out = execFileSync('lsof', ['-a', '-p', String(pid), '-d', 'cwd', '-Fn'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    return /^n(.+)$/m.exec(out)?.[1] ?? ''
  } catch {
    return ''
  }
}

/** Ours if it runs from inside this checkout, by cwd or by argv. */
function isOurs(pid, command) {
  const cwd = cwdOf(pid)
  if (cwd && (cwd === root || cwd.startsWith(`${root}/`))) return true
  return command.includes(root)
}

const pids = listeners()
if (!pids.length) process.exit(0)

const foreign = []

for (const pid of pids) {
  if (pid === process.pid) continue
  const command = commandOf(pid)

  if (!isOurs(pid, command) && !force) {
    foreign.push({ pid, command })
    continue
  }

  try {
    process.kill(pid, 'SIGTERM')
    // Give it a moment to close listeners, then insist.
    const deadline = Date.now() + 2000
    while (Date.now() < deadline) {
      try {
        process.kill(pid, 0)
      } catch {
        break
      }
      execFileSync('sleep', ['0.1'])
    }
    try {
      process.kill(pid, 0)
      process.kill(pid, 'SIGKILL')
    } catch {
      /* already gone */
    }
    console.log(`free-port: stopped the previous API on ${port} (pid ${pid})`)
  } catch (err) {
    console.error(`free-port: could not stop pid ${pid}:`, err instanceof Error ? err.message : err)
    process.exit(1)
  }
}

if (foreign.length) {
  console.error(`\nPort ${port} is held by something that is not this project:\n`)
  for (const { pid, command } of foreign) {
    console.error(`  pid ${pid}  ${command.slice(0, 100)}`)
  }
  console.error(
    `\nNot killing it. Either stop it yourself, change PORT in apps/api/.env,\n` +
      `or re-run with FREE_PORT_FORCE=1 to kill it anyway.\n`,
  )
  process.exit(1)
}
