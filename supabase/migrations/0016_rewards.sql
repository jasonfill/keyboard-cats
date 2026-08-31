-- ---------------------------------------------------------------------------
-- Rewards: promises, evidence, and getting paid
-- ---------------------------------------------------------------------------
-- A grown-up promises something real — ice cream, screen time, the car on
-- Saturday — and needs to know when it was genuinely earned and whether they
-- have actually handed it over.
--
-- The idea the whole design rests on: **there are two parties and each can only
-- be trusted about their own side.**
--
--   * The child's side is *verified*. Whether the work was done is derived from
--     attempts the app checked. Nobody taps "earned".
--   * The grown-up's side is *asserted*. Whether the ice cream was bought is
--     not something software can check, ever. So fulfilment is a claim —
--     recorded, attributed and dated as one, exactly the way a flashcard
--     self-grade is.
--
-- See docs/billing-spec.md and the rewards section of the activities spec.

create table if not exists public.rewards (
  id             uuid        primary key default gen_random_uuid(),
  learner_id     uuid        not null references public.learners (id) on delete cascade,
  created_by     uuid        references auth.users (id) on delete set null,

  title          text        not null,
  note           text,
  kind           text        not null default 'direct',
  cost_points    int,

  -- { type, targetId, threshold }. Every type is computable from evidence the
  -- app checked; none can be satisfied by self-graded work.
  criterion      jsonb       not null,
  max_awards     int         not null default 1,
  period         text,
  -- On the row, not derived from sessions. Erasing progress and redoing the
  -- work must not mint a second payout: erasing is a right, not a mint.
  awards_made    int         not null default 0,
  offered_at     timestamptz not null default now(),
  expires_on     date,

  status         text        not null default 'offered',
  earned_at      timestamptz,
  -- A snapshot, not a pointer. It has to outlive the session it came from.
  evidence       jsonb,
  session_id     uuid        references public.sessions (id) on delete set null,

  fulfilled_at   timestamptz,
  fulfilled_by   uuid        references auth.users (id) on delete set null,
  fulfilled_note text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  constraint rewards_status_check check (status in
    ('offered', 'earned', 'claimed', 'fulfilled', 'cancelled', 'expired')),
  constraint rewards_kind_check check (kind in ('direct', 'store')),
  constraint rewards_period_check check (period is null or period in ('week', 'month')),

  -- Earned means evidence exists.
  constraint rewards_earned_has_evidence check (
    status in ('offered', 'cancelled', 'expired')
    or (earned_at is not null and evidence is not null)
  ),
  -- Fulfilled means somebody said so, and we record who. The adult's assertion
  -- is attributed exactly like a learner's self-grade.
  constraint rewards_fulfilled_is_attributed check (
    status <> 'fulfilled' or (fulfilled_at is not null and fulfilled_by is not null)
  )
);

create index if not exists rewards_learner_idx
  on public.rewards (learner_id, status, offered_at desc);
create index if not exists rewards_unpaid_idx
  on public.rewards (created_by, earned_at) where status = 'earned';

drop trigger if exists rewards_touch on public.rewards;
create trigger rewards_touch
  before update on public.rewards
  for each row execute function public.touch_updated_at();

comment on table public.rewards is
  'Earning is derived and latches. Fulfilment is asserted and attributed. Never the same thing.';

-- ---------------------------------------------------------------------------
-- Who may do what
-- ---------------------------------------------------------------------------
-- Offering uses the same gate as setting work, deliberately: a learner who
-- could set their own rewards would make them meaningless.
--
-- **Only the author may mark one fulfilled.** A tutor cannot know whether a
-- parent bought the ice cream, and a parent cannot settle a tutor's promise.
-- The payer settles their own debt.
--
-- **The learner's owner may cancel anything**, including a reward a tutor set.
-- A parent has to be able to veto what somebody else is promising their child —
-- and to see it in order to veto it, which is why reading is open to everyone
-- linked to the learner.

alter table public.rewards enable row level security;

drop policy if exists rewards_select on public.rewards;
create policy rewards_select on public.rewards
  for select to authenticated
  using (public.can_access_learner(learner_id));

drop policy if exists rewards_insert on public.rewards;
create policy rewards_insert on public.rewards
  for insert to authenticated
  with check (public.can_assign_to_learner(learner_id) and created_by = (select auth.uid()));

drop policy if exists rewards_update on public.rewards;
create policy rewards_update on public.rewards
  for update to authenticated
  using (created_by = (select auth.uid()) or public.owns_learner(learner_id))
  with check (created_by = (select auth.uid()) or public.owns_learner(learner_id));

drop policy if exists rewards_delete on public.rewards;
create policy rewards_delete on public.rewards
  for delete to authenticated
  using (created_by = (select auth.uid()) or public.owns_learner(learner_id));

grant select, insert, update, delete on public.rewards to authenticated;

-- ---------------------------------------------------------------------------
-- Earning
-- ---------------------------------------------------------------------------
-- Runs in the same transaction as the round that triggered it, like every other
-- derived closure in this schema.
--
-- Two rules that must not bend:
--
--   1. **Only checked work counts.** Every criterion reads attempts with
--      `verified` true, or mastery that was built from them. A flashcard round
--      contributes nothing to any reward, ever.
--
--   2. **A learner cannot earn on content they can edit.** `can_manage_learner_content`
--      deliberately counts a learner as able to manage their own decks — so
--      without this, a child types a three-card deck (`cat` / `cat`), masters
--      it in ninety seconds and collects. A criterion may only name content the
--      learner did not author.

create or replace function public.award_matching_rewards(
  p_learner_id uuid,
  p_session_id uuid
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  met boolean;
  target text;
  threshold numeric;
  measured numeric;
  awarded int := 0;
begin
  for r in
    select * from public.rewards
     where learner_id = p_learner_id
       and status = 'offered'
       and (expires_on is null or expires_on >= current_date)
       and awards_made < max_awards
  loop
    met := false;
    target := r.criterion ->> 'targetId';
    threshold := coalesce((r.criterion ->> 'threshold')::numeric, 1);

    if (r.criterion ->> 'type') = 'assignment' then
      select count(*) > 0 into met
        from public.assignments a
       where a.learner_id = p_learner_id
         and a.status = 'done'
         and a.id::text = target;

    elsif (r.criterion ->> 'type') = 'set_mastered' then
      -- The learner may not own the deck this names. A set they wrote
      -- themselves is not evidence of anything.
      if target is not null and not exists (
        select 1 from public.decks d
         where d.id::text = target and d.learner_id = p_learner_id
      ) then
        select coalesce(
                 count(*) filter (where m.mastery >= 0.8 and m.correct_streak >= 2)::numeric
                   / nullif(count(*), 0),
                 0)
          into measured
          from public.item_mastery m
         where m.learner_id = p_learner_id
           and m.subject = 'quiz'
           and m.item_key like target || ':%';
        met := measured >= threshold;
      end if;

    elsif (r.criterion ->> 'type') = 'mastery_count' then
      select count(*) into measured
        from public.item_mastery m
        join public.decks d
          on d.id::text = split_part(m.item_key, ':', 1)
         and d.learner_id is distinct from p_learner_id
       where m.learner_id = p_learner_id
         and m.mastery >= 0.8
         and m.correct_streak >= 2;
      met := measured >= threshold;

    elsif (r.criterion ->> 'type') = 'streak' then
      select coalesce(max(s.streak_days), 0) into measured
        from public.skill_states s
       where s.learner_id = p_learner_id;
      met := measured >= threshold;

    elsif (r.criterion ->> 'type') = 'verified_items' then
      select count(*) into measured
        from public.attempts a
       where a.learner_id = p_learner_id
         and a.verified
         and a.correct;
      met := measured >= threshold;
    end if;

    if met then
      update public.rewards
         set status = 'earned',
             earned_at = now(),
             session_id = p_session_id,
             awards_made = awards_made + 1,
             -- A snapshot, so this survives the session being erased. A promise
             -- kept is not revocable by a database cascade.
             evidence = jsonb_build_object(
               'criterion', criterion,
               'sessionId', p_session_id,
               'at', now()
             ),
             updated_at = now()
       where id = r.id;
      awarded := awarded + 1;
    end if;
  end loop;

  return awarded;
end;
$$;

grant execute on function public.award_matching_rewards(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Earning latches. This is the rule that must not bend.
-- ---------------------------------------------------------------------------
-- There is deliberately NO trigger reopening an earned reward when the session
-- behind it is deleted — the opposite of `reopen_assignments_for_session`.
--
-- That trigger is right for a task, which is a statement about work
-- outstanding. It is wrong for a reward, which is a statement about a promise
-- coming due. A child who watched an ice cream disappear because a grown-up
-- tidied up some sessions has learned something about this app that we do not
-- want them to learn. `session_id` is `on delete set null` and the `evidence`
-- snapshot outlives it.
--
-- Its absence looks like an omission, which is exactly why this is written down.
