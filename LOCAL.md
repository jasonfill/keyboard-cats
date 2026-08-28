# Running the whole thing locally

The stack is four things: Postgres, Supabase Auth, the API, and the SPA. The
first two come from the Supabase CLI, which runs them in Docker.

You *can* point local development at your hosted project instead — see
[Against the hosted project](#against-the-hosted-project) at the bottom. That is
what `apps/api/.env` does today, and the API says so at startup.

## One-time setup

**1. Docker.** Start Docker Desktop. `supabase start` needs the daemon running.

**2. The Supabase CLI.**

```bash
brew install supabase/tap/supabase
```

**3. Generate the project config.**

```bash
supabase init
```

This writes `supabase/config.toml`. It leaves `supabase/migrations/` and
`supabase/tests/` alone — say no if it offers to overwrite anything there.

**4. `psql`,** only if you want to run the RLS tests locally. If
`which psql` finds nothing:

```bash
brew install libpq && brew link --force libpq
```

## Every day

```bash
npm run db:start     # Postgres + Auth + Studio in Docker; applies migrations
npm run local:env    # writes the two override env files from the running stack
npm run dev:all      # API and SPA together
```

Then open <http://localhost:5173>.

`local:env` only needs re-running when the stack is recreated (`db:start` after a
`db:stop --no-backup`, or a CLI upgrade), because the keys change.

### The port clears itself

`npm run dev:api` (and `dev:all`, and `start`) runs a preflight that stops a
leftover API still holding the port, so a watch process that died badly does not
cost you an `EADDRINUSE` and a manual `kill`.

It only kills processes running from inside this checkout — identified by their
working directory, since a server started as `node dist/server.js` carries no
path in its command line. Anything else holding the port is reported rather than
killed:

```
Port 8787 is held by something that is not this project:
  pid 9039  node -e require('http')...
Not killing it. Either stop it yourself, change PORT in apps/api/.env,
or re-run with FREE_PORT_FORCE=1 to kill it anyway.
```

That distinction matters on this machine — port 8080 is already taken by another
project, which is why the API sits on 8787.

| What | Where |
| --- | --- |
| SPA | http://localhost:5173 |
| API | http://localhost:8787 (proxied at `/api`, so use the SPA's origin) |
| Supabase API | http://127.0.0.1:54321 |
| Postgres | postgresql://postgres:postgres@127.0.0.1:54322/postgres |
| Studio | http://127.0.0.1:54323 |

The SPA calls `/api` on its own origin and Vite proxies that to 8787, which is
the same shape as production — so there is no CORS in the browser either way.

## How the env files fit together

Nothing you already have gets overwritten. `local:env` writes two *override*
files that win in development only:

| File | Beats | Holds |
| --- | --- | --- |
| `apps/api/.env.local` | `apps/api/.env` | local stack |
| `apps/web/.env.development.local` | `apps/web/.env.local` | local stack |

**To go back to the hosted project**, delete those two files. That is the whole
switch.

If you edit a file and nothing changes, an exported shell variable is probably
winning over both — the API prints exactly which ones and the `unset` to fix it.

## Resetting

```bash
npm run db:reset
```

Drops the local database and replays `0001` → `0003` from scratch. Useful for
proving the migration chain still works end to end, which is not something you
want to discover on a deploy.

Note this exercises a *different* path from a real deploy: a reset applies every
migration, while a deploy against an existing database adopts what is already
there via the `@applied-if` sentinels. Both are worth having work.

## Tests

```bash
npm test                              # typecheck, lint, curriculum, adaptive engine
npm run test:db                       # RLS and audit-trail assertions against the local stack
npm run smoke --workspace @whizzo/api # 37 API checks against a running API
```

`test:db` needs the stack up. `smoke` needs the stack up, the API running, and
the fixtures the RLS suite creates — so run `test:db` first.

With the local stack you also get the one thing the hosted setup cannot test
cheaply: **the child sign-in round trip.** `local:env` writes both
`SUPABASE_SERVICE_ROLE_KEY` and `CHILD_LOGIN_SECRET`, so `smoke` stops skipping
it and actually provisions a child account, exchanges a code and PIN for a
session, and checks that a wrong PIN is refused.

## What this does not cover

Nothing local exercises the DigitalOcean ingress, so `preserve_path_prefix` — the
setting that decides whether `/api/...` reaches the API at all — is only provable
after the first deploy. Check `/api/health` on the `ondigitalocean.app` hostname
before moving DNS.

## Against the hosted project

This is the default: with neither override file present, `apps/api/.env` and
`apps/web/.env.local` both point at the hosted Supabase project. Nothing to set
up — just:

```bash
npm run dev:all
```

The SPA runs on <http://localhost:5173>, signs in against hosted Supabase Auth,
and talks to your local API, which talks to the hosted database over the pooler.
The API prints a `NOTE:` on startup so this is never a surprise.

If you previously ran `npm run local:env`, delete the two override files first:

```bash
rm -f apps/api/.env.local apps/web/.env.development.local
```

### Migrations are not applied automatically here

`apps/api/.env` sets `RUN_MIGRATIONS_ON_START=false`, because a routine dev
restart should not change a real database's schema. The API still *checks*, so
the schema cannot drift without you hearing about it:

```
migrations are disabled at startup; schema is already current
```

and when something is outstanding:

```
RUN_MIGRATIONS_ON_START is false and 1 migration(s) are pending: 0004_x.sql.
Apply them with `npm run migrate --workspace @whizzo/api`.
```

Apply deliberately:

```bash
npm run migrate:status --workspace @whizzo/api   # read-only, shows what would run
npm run migrate --workspace @whizzo/api          # applies pending migrations
```

Production is the opposite and should stay that way: the DO spec leaves
`RUN_MIGRATIONS_ON_START` on, so a deploy that ships a migration and the code
needing it never has a window where only one of them is live.

### What to be careful about

- **Writes are real.** Creating a test learner creates it for everyone.
- **Child sign-in provisions real auth users** with `learner-<uuid>@no-reply.whizzo.app`
  addresses. They are removable from the Family screen, but they are real.
- **You share one database with the deployed app.** Once whizzo.app is live on
  DigitalOcean, a migration you apply from your laptop is live immediately,
  before the code that needs it ships.

For anything beyond a quick check against real data, use the local stack.
