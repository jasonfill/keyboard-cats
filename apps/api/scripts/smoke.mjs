// End-to-end smoke test for the API.
//
// Exercises the thing that is easy to get wrong and impossible to eyeball: that
// Row Level Security still enforces *through* the gateway. The API connects to
// Postgres with a role that could read everything, and only stays honest
// because every request-scoped query runs as `authenticated` with the caller's
// claim set. These assertions are what prove that is still true.
//
// Prerequisites: a scratch database with all three migrations plus
// supabase/tests/0003_learners_test.sql applied (that file creates the
// fixtures), and the API running against it.
//
//   node scripts/smoke.mjs
//
// Env: API_URL (default http://127.0.0.1:8099), SUPABASE_URL, SUPABASE_JWT_SECRET.

import { SignJWT } from 'jose'

const API = process.env.API_URL ?? 'http://127.0.0.1:8099'
const ISSUER = `${process.env.SUPABASE_URL ?? 'https://testproject.supabase.co'}/auth/v1`
const SECRET = new TextEncoder().encode(
  process.env.SUPABASE_JWT_SECRET ?? 'test-secret-that-is-long-enough-for-hs256-signing',
)

// Fixtures created by supabase/tests/0003_learners_test.sql.
const MUM = 'aaaaaaaa-0000-0000-0000-000000000001'
const DAD = 'aaaaaaaa-0000-0000-0000-000000000002'
const STRANGER = 'aaaaaaaa-0000-0000-0000-000000000003'
const SMALL_CHILD = 'cccccccc-0000-0000-0000-00000000000a'

let failures = 0

function check(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) {
    failures += 1
    console.error(`  FAIL ${label}\n       expected ${JSON.stringify(want)}\n       got      ${JSON.stringify(got)}`)
  } else {
    console.log(`  pass ${label}`)
  }
}

async function token(sub) {
  return new SignJWT({ role: 'authenticated' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(sub)
    .setIssuer(ISSUER)
    .setAudience('authenticated')
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(SECRET)
}

async function call(path, { as, method = 'GET', body } = {}) {
  const headers = {}
  if (body !== undefined) headers['content-type'] = 'application/json'
  if (as) headers.authorization = `Bearer ${await token(as)}`
  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await res.text()
  return { status: res.status, body: text ? JSON.parse(text) : null }
}

console.log('API smoke test')

const health = await call('/api/health')
check('health is ok', health.body?.status, 'ok')

// --- authentication ---------------------------------------------------------
check('no token is rejected', (await call('/api/learners')).status, 401)
const junk = await fetch(`${API}/api/learners`, { headers: { authorization: 'Bearer nope' } })
check('a junk token is rejected', junk.status, 401)

// --- RLS still enforces through the gateway ---------------------------------
const mine = await call('/api/learners', { as: MUM })
check('the owner sees her learners', mine.body.learners.length >= 2, true)

const stranger = await call('/api/learners', { as: STRANGER })
check('a stranger sees nothing', stranger.body.learners, [])

const peek = await call(`/api/learners/${SMALL_CHILD}`, { as: STRANGER, method: 'PATCH', body: { displayName: 'Pwned' } })
check('a stranger cannot rename a child', peek.status, 404)

const mint = await call(`/api/learners/${SMALL_CHILD}/invites`, { as: STRANGER, method: 'POST', body: {} })
check('a stranger cannot mint an invite', mint.status, 403)

// --- pairing ----------------------------------------------------------------
const invite = await call(`/api/learners/${SMALL_CHILD}/invites`, { as: MUM, method: 'POST', body: {} })
check('the owner can mint an invite', invite.status, 201)

const redeem = await call('/api/invites/redeem', { as: DAD, method: 'POST', body: { code: invite.body.invite.code } })
check('another adult can redeem it', redeem.body.learnerId, SMALL_CHILD)

const replay = await call('/api/invites/redeem', { as: DAD, method: 'POST', body: { code: invite.body.invite.code } })
check('a code cannot be redeemed twice', replay.status, 400)

const dadSees = await call('/api/learners', { as: DAD })
check('the new guardian now sees the child', dadSees.body.learners.some((l) => l.id === SMALL_CHILD), true)

// --- the age gate reaches HTTP intact ---------------------------------------
const selfInvite = await call(`/api/learners/${SMALL_CHILD}/invites`, {
  as: MUM,
  method: 'POST',
  body: { purpose: 'self_login' },
})
const gated = await call('/api/invites/redeem', {
  as: STRANGER,
  method: 'POST',
  body: { code: selfInvite.body.invite.code },
})
check('an under-13 cannot attach their own account', gated.status, 400)
check('and the reason survives the trip', /13 or older/.test(gated.body.error.message), true)

// --- validation -------------------------------------------------------------
check('a bad uuid is a 400', (await call('/api/learners/not-a-uuid/guardians', { as: MUM })).status, 400)
check('an empty name is a 400', (await call('/api/learners', { as: MUM, method: 'POST', body: { displayName: '' } })).status, 400)

// --- progress: read, write, read back ---------------------------------------
const before = await call(`/api/learners/${SMALL_CHILD}/progress`, { as: MUM })
check('the owner can read a child\'s progress', before.status, 200)

const sessionId = crypto.randomUUID()
const now = Date.now()
const write = await call(`/api/learners/${SMALL_CHILD}/progress`, {
  as: MUM,
  method: 'POST',
  body: {
    skill: {
      subject: 'spelling', ability: 3.1, abilitySd: 1.0, levelIndex: 2, placed: true,
      totalAttempts: 10, totalCorrect: 8, streakDays: 2, bestStreakDays: 3,
      lastActiveOn: new Date().toISOString().slice(0, 10), settings: {},
    },
    session: {
      id: sessionId, subject: 'spelling', activity: 'listen-spell', listId: 'g2-1',
      isTest: true, itemsTotal: 3, itemsCorrect: 2, accuracy: 66.67, score: 20,
      wpm: null, durationMs: 45000, abilityBefore: 3.0, abilityAfter: 3.1,
      meta: {}, startedAt: now - 45000, endedAt: now,
    },
    attempts: [
      { subject: 'spelling', itemKey: 'because', activity: 'listen-spell', isTest: true, correct: true, responseMs: 3000, hintsUsed: 0, difficulty: 3, given: 'because', at: now - 30000 },
      { subject: 'spelling', itemKey: 'friend', activity: 'listen-spell', isTest: true, correct: false, responseMs: 5000, hintsUsed: 1, difficulty: 3, given: 'freind', at: now - 15000 },
    ],
    mastery: [
      { subject: 'spelling', itemKey: 'because', listId: 'g2-1', difficulty: 3, mastery: 0.9, reps: 4, lapses: 0, correctStreak: 3, totalAttempts: 4, totalCorrect: 4, intervalDays: 3, dueOn: null, firstSeenAt: now - 90000, lastSeenAt: now },
    ],
    daily: { subject: 'spelling', seconds: 45, items: 3, correct: 2 },
    achievements: [{ achievementId: 'first-test', subject: 'spelling', unlockedAt: now }],
  },
})
check('a round of practice is accepted', write.status, 204)

const after = await call(`/api/learners/${SMALL_CHILD}/progress`, { as: MUM })
check('the skill state came back', after.body.snapshot.skills.spelling?.ability, 3.1)
check('the session came back', after.body.snapshot.sessions.some((s) => s.id === sessionId), true)
check('mastery came back', after.body.snapshot.mastery['spelling:because']?.mastery, 0.9)
check('the achievement came back', after.body.snapshot.achievements.some((a) => a.achievementId === 'first-test'), true)
check('daily activity was rolled up', after.body.snapshot.daily.length > 0, true)

// A repeat write must not double-count the audit trail's session row.
const rewrite = await call(`/api/learners/${SMALL_CHILD}/progress`, {
  as: MUM, method: 'POST',
  body: { session: { id: sessionId, subject: 'spelling', activity: 'listen-spell', listId: 'g2-1', isTest: true, itemsTotal: 3, itemsCorrect: 3, accuracy: 100, score: 30, wpm: null, durationMs: 45000, abilityBefore: 3.0, abilityAfter: 3.2, meta: {}, startedAt: now - 45000, endedAt: now } },
})
check('re-sending a session updates rather than duplicates', rewrite.status, 204)
const afterRewrite = await call(`/api/learners/${SMALL_CHILD}/progress`, { as: MUM })
check('still one session row', afterRewrite.body.snapshot.sessions.filter((s) => s.id === sessionId).length, 1)

// --- progress is not readable or writable by outsiders ----------------------
check('a stranger cannot read progress', (await call(`/api/learners/${SMALL_CHILD}/progress`, { as: STRANGER })).status, 404)
check('a stranger cannot write progress', (await call(`/api/learners/${SMALL_CHILD}/progress`, { as: STRANGER, method: 'POST', body: { daily: { subject: 'spelling', seconds: 1, items: 1, correct: 1 } } })).status, 404)
check('a malformed change is a 400', (await call(`/api/learners/${SMALL_CHILD}/progress`, { as: MUM, method: 'POST', body: { skill: { subject: 'nonsense' } } })).status, 400)
check('an empty change is a 400', (await call(`/api/learners/${SMALL_CHILD}/progress`, { as: MUM, method: 'POST', body: {} })).status, 400)

// --- decks -------------------------------------------------------------------
const deckId = crypto.randomUUID()
const deck = {
  id: deckId, title: 'Planets', description: '', tags: [],
  cards: [{ id: 'c1', term: 'Mars', definition: 'The red one', hint: null, difficulty: 2 }],
  source: 'user', termLabel: 'Planet', definitionLabel: 'Clue',
}
const saveDeck = await call(`/api/learners/${SMALL_CHILD}/decks`, { as: MUM, method: 'POST', body: { decks: [deck] } })
check('the owner can add a deck', saveDeck.body.decks?.[0]?.title, 'Planets')

const withDeck = await call(`/api/learners/${SMALL_CHILD}/progress`, { as: MUM })
check('the deck shows up in the snapshot', withDeck.body.snapshot.decks.some((d) => d.id === deckId), true)

// DAD is a guardian of SMALL_CHILD by now (redeemed above) with content rights.
check('a guardian with content rights can add a deck', (await call(`/api/learners/${SMALL_CHILD}/decks`, {
  as: DAD, method: 'POST',
  body: { decks: [{ ...deck, id: crypto.randomUUID(), title: 'From Dad' }] },
})).status, 200)

check('a stranger cannot add a deck', (await call(`/api/learners/${SMALL_CHILD}/decks`, {
  as: STRANGER, method: 'POST', body: { decks: [{ ...deck, id: crypto.randomUUID() }] },
})).status, 404)

check('the owner can delete a deck', (await call(`/api/learners/${SMALL_CHILD}/decks/${deckId}`, { as: MUM, method: 'DELETE' })).status, 204)
check('deleting it again is a 404', (await call(`/api/learners/${SMALL_CHILD}/decks/${deckId}`, { as: MUM, method: 'DELETE' })).status, 404)

// --- word lists ---------------------------------------------------------------
const listId = crypto.randomUUID()
const saveList = await call(`/api/learners/${SMALL_CHILD}/word-lists`, {
  as: MUM, method: 'POST',
  body: { customLists: [{ id: listId, title: 'Week 3', subject: 'spelling', grade: 2, words: [{ w: 'cat', s: 'The cat sat.' }] }] },
})
check('the owner can add a word list', saveList.body.customLists?.[0]?.title, 'Week 3')
check('the owner can delete a word list', (await call(`/api/learners/${SMALL_CHILD}/word-lists/${listId}`, { as: MUM, method: 'DELETE' })).status, 204)

// --- child login ---------------------------------------------------------------
// Needs the admin API and CHILD_LOGIN_SECRET, so it is skipped unless the
// environment is configured for it. The route is still checked for the correct
// refusal when it is not.
if (process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.CHILD_LOGIN_SECRET) {
  const setup = await call(`/api/learners/${SMALL_CHILD}/child-login`, { as: MUM, method: 'POST', body: { pin: '4821' } })
  check('a parent can provision a child sign-in', setup.status, 201)
  const login = await call('/api/child-login', { method: 'POST', body: { loginCode: setup.body.loginCode, pin: '4821' } })
  check('the child can sign in with code and PIN', Boolean(login.body?.session?.accessToken), true)
  const wrongPin = await call('/api/child-login', { method: 'POST', body: { loginCode: setup.body.loginCode, pin: '0000' } })
  check('a wrong PIN is refused', wrongPin.status, 401)
} else {
  const unconfigured = await call(`/api/learners/${SMALL_CHILD}/child-login`, { as: MUM, method: 'POST', body: { pin: '4821' } })
  check('child sign-in reports itself unconfigured rather than crashing', unconfigured.status, 503)
  console.log('  skip child sign-in round trip (no SUPABASE_SERVICE_ROLE_KEY / CHILD_LOGIN_SECRET)')
}

console.log(failures ? `\n${failures} check(s) failed` : '\nall API smoke checks passed')
process.exit(failures ? 1 : 0)
