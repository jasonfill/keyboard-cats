# Setting up the database

Cat Academy stores accounts and learning progress in [Supabase](https://supabase.com)
(hosted Postgres + auth). The app runs fine without it — everything falls back
to `localStorage` guest mode — so this is only needed when you want real
accounts and progress that follows a learner between devices.

Budget about ten minutes.

## 1. Create a project

1. Sign in at <https://supabase.com/dashboard> and create a new project.
2. Pick a region near your users and set a database password (you will not need
   it for the app, only for direct psql access).
3. Wait for the project to finish provisioning.

## 2. Run the migrations

Open **SQL Editor → New query** in the dashboard, paste the whole contents of
[`migrations/0001_init.sql`](./migrations/0001_init.sql), and run it. Then do
the same with [`migrations/0002_quiz_decks.sql`](./migrations/0002_quiz_decks.sql),
which adds the study-deck table behind Quiz Cats.

The first script creates every core table, the Row Level Security policies, the
signup trigger that creates a profile row, and two helper functions. Both are
idempotent — re-running them is safe, and running them in order matters only
because the second assumes `auth.users` policies already exist.

If you prefer the CLI:

```bash
npm install -g supabase
supabase link --project-ref <your-project-ref>
supabase db push
```

### What it creates

| Table | Holds |
| --- | --- |
| `profiles` | One row per learner: display name, avatar, plan |
| `skill_states` | The adaptive engine's per-subject state (ability, level, streak) |
| `attempts` | Every single word attempted — the record everything else derives from |
| `item_mastery` | Per-word mastery and the spaced-repetition schedule |
| `sessions` | One row per completed round of practice |
| `list_progress` | Per-unit stars and best scores |
| `daily_activity` | Daily rollup powering streaks and the progress strip |
| `achievements` | Unlocked badges |
| `high_scores` | Arcade leaderboard rows |
| `word_lists` | Custom word lists a parent or teacher pastes in |

Every table has Row Level Security on with a `user_id = auth.uid()` policy, so
a learner can only ever read and write their own rows. The app never uses the
service-role key — only the public anon key, which is safe to ship in a browser
build precisely because RLS is doing the work.

One policy is worth calling out: `profiles_update_own` lets a learner change
their name and avatar but **not** their `plan`. Billing state is only writable
by something holding the service role, so nobody can promote themselves to Pro
from the browser console.

## 3. Turn on Google sign-in

1. In Google Cloud Console, create an **OAuth 2.0 Client ID** (type: Web
   application).
2. Add this authorised redirect URI, using your project ref:
   `https://<your-project-ref>.supabase.co/auth/v1/callback`
3. In Supabase, go to **Authentication → Providers → Google**, enable it, and
   paste the client ID and secret.
4. In **Authentication → URL Configuration**, set the **Site URL** to where the
   app is served, and add every URL you use to **Redirect URLs**:
   - `http://localhost:5173/` for local development
   - `https://<user>.github.io/keyboard-cats/` for the GitHub Pages build

Email and password sign-in works with no extra configuration. If you would
rather skip the confirmation email while testing, turn off **Confirm email**
under **Authentication → Providers → Email**.

## 4. Point the app at the project

Copy the two public values from **Project Settings → API**:

```bash
cp .env.example .env.local
```

```
VITE_SUPABASE_URL=https://<your-project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<your anon public key>
```

Restart `npm run dev`. The account chip in the top right should now read
"Sign in" instead of "Guest".

## 5. Deploy

The GitHub Pages workflow reads the same two values from repository secrets.
In **Settings → Secrets and variables → Actions**, add:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Without them the deployed build simply runs in guest mode rather than failing.

## Notes

- **Guest progress is merged on first sign-in.** A learner who practised before
  registering keeps everything: counters add, bests win, and the local copy is
  only cleared once the merge has been written. See `mergeSnapshots` in
  `src/lib/progress/repo.ts`.
- **`rebuild_item_mastery(subject)`** re-derives every mastery number straight
  from the `attempts` log. If the cached values are ever doubted, that function
  is the answer — the attempt log is the source of truth, everything else is a
  cache.
- **Plans are modelled but not billed.** `profiles.plan` is `free` or `pro` and
  the app gates features on it, but no payment processor is wired up. Adding
  Stripe means a webhook (an Edge Function is the natural home) that updates
  `plan`, `plan_source`, and `plan_renews_at` with the service role.
