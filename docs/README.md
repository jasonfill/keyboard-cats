# Specs

Five documents. This page says which one is authoritative for what, because
they reference each other and the wrong one is easy to follow.

**Start with [build-sequence.md](build-sequence.md).** It is the single
authority on what gets built when, and it supersedes every phase number inside
the other specs.

| Document | Status | Authoritative for |
| --- | --- | --- |
| [build-sequence.md](build-sequence.md) | **plan** | Order. The alignment audit across all three proposals, the stage sequence, and the migration-number registry. |
| [card-formatting.md](card-formatting.md) | **built** | What card text may contain: maths, MathML, figures. The grammar, the renderer, the sanitiser, how a typed answer is graded against an equation. |
| [content-structure-spec.md](content-structure-spec.md) | proposal | Where content *sits*: areas, tracks, units, objectives. Which ability pool work belongs to. How shared content from different authors relates. |
| [content-ingestion-spec.md](content-ingestion-spec.md) | proposal | How content *arrives*: a document in, a working set out. Upload, read, build, review, accept. |
| [learning-activities-spec.md](learning-activities-spec.md) | proposal | What happens to content once it is here: the mastery ladder, the activity catalogue, engagement, rewards, the Mastery Path. |

## Reading order

**Structure → ingestion → activities.** Content structure is scaffolding the
other two assume; ingestion produces what activities consume. Card formatting
is already built and is a reference rather than a plan — read it when you need
to know what a card can hold.

## Dependencies worth knowing

- The **capability matrix** (activities §7) must read `lib/rich/parse`. A card
  whose answer contains maths or a figure cannot play the activities that chop
  answers into characters — Scramble, Starts With, Missing Letters, tiles.
- **Migration numbers** are claimed but not taken: activities §15 assumes 0013
  (`assignments.goal`) and 0014 (rewards); ingestion assumes 0015; content
  structure is additive and can take any of them. Whichever ships first takes
  the lowest number.
- The **track** field (structure §7) should be proposed by the ingestion build
  call, not asked of the author.

## Known drift

`content-ingestion-spec.md` cites section numbers in
`learning-activities-spec.md` that moved when the pedagogy review and choice
sections were inserted. Its `§5` is now `§7`, `§6` is `§8`, `§14` is `§16`,
`§16` is `§18`, `§17` is `§19`. `§3` is still correct. Scheduled for stage 0.

The three proposals each carry their own "Phase 1/2/3". Those are superseded by
the stages in [build-sequence.md](build-sequence.md).
