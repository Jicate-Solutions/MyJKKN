# Adoption loop — rehearsal (spec `specs/2026-09-16-adoption-loop.md`)

Runs the three adoption migrations on a throwaway Postgres with the minimum of
MyJKKN stubbed (profiles, roles, notifications, loop_registry, the feedback
gate's migration B) and asserts every "done means" line, including the access
DENIALS: a learner and a principal of the wrong college are refused names, a
non-super-admin cannot label or ask, a super admin who is not the loop owner
cannot decide a card, the why-not question is never sent twice per feature nor
twice in 7 days, and a 0-day feature is refused.

```bash
bash supabase/tests/adoption/run.sh            # local Postgres on 127.0.0.1:5432
```

Logic rehearses here; row shapes only prove on production inside
`BEGIN … ROLLBACK` (owner_email on loop_registry is NOT NULL there and was
caught that way on 2026-09-16).
