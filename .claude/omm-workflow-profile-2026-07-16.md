# Workflow Profile — Omm (Director, JKKN) as of 2026-07-16

Built from hard evidence: **1,997 merged production PRs** (GitHub-authoritative; repo born Apr 1 2026), 2,674 branches analyzed, 475 codified lessons in memory, session logs. No estimates unless flagged.

> Correction note: an earlier draft said 685 PRs — that counted only merge-commits and missed 1,402 squash-merges. All figures below use the full population.

## 1. The operating model: a one-person AI software organization

You are a **non-coder Director running what is structurally a mid-size software company** — with AI as the entire engineering staff:

- **You** set direction, judge outcomes, approve risk (vetoes, rollouts, money, deletions).
- **Two coordinated Claude sessions** (this Mac "Director" session + a web/CFT session) do all building. They merge each other's PRs and hand work across via continuation briefs.
- **A fleet below them**: parallel worktree-isolated agents (513 agent branches — roughly one isolated agent spawn per 4 shipped PRs), an overnight bug-fix bot (17 PRs merged while you slept), 18 Mac "brains" + a Windows box draining AI job queues at ₹0 marginal cost.
- **Shipping bureaucracy replaced by pattern**: the Translator Pattern (clean worktree from prod main → copy files → PR) because your local checkout diverged 720+ commits from production and direct push is impossible.

## 2. Velocity — the numbers

| Metric | Value |
|---|---|
| PRs merged to production | **1,997 in 106 days ≈ 18.8/day average** |
| Merge rate | 1,997 of 2,116 opened = **94%** — almost nothing gets abandoned |
| Monthly | Apr 587 → May 537 → Jun 504 → **Jul 369 in 16 days (~23/day pace, the fastest yet)** |
| Days with ≥1 production merge | **99 of 106 = 93% of all calendar days**, weekends included |
| Peak day | **70 PRs (April 23)** |
| Branches per shipped PR | ~1.3 (plus fan-out/round exhaust) |

## 3. Rhythm — an 18-hour, 7-day shipping clock

- **PRs land around the clock.** Dawn block 06:00–09:00 is the single heaviest window (577 landings, peak 09:00), late-night 22:00–00:00 second (355). Even 01:00–05:00 has 131 (the overnight bot). This is a ~20-hour shipping day.
- **Weekends are workdays**: Sun 270 landings — more than Monday (256).
- **Thursday + Saturday are the light days** (220/216 vs the Wed peak of 322 — about 30% lighter). Real, but no full rest day exists anywhere in the data.

## 4. Where the energy goes (PR distribution)

From all 1,997 landings (top scopes): admission 140, HR 112, Campus Living 111, CDC/placements 93, PDE 62, navigation 52, admin 37, notifications 35, SCF 34, audit 33, AI-pulse 33, meetings 31, telephony 29, induction 28, Instagram 27, accreditation 27, guides 23, AI infra 23, health 22, broadcast 22, events 21 — then a long tail of 40+ more scopes. **Nothing is outsourced to a niche — the entire ERP surface is under active build simultaneously.**

## 5. The quality machinery (what makes this survivable)

1. **Verification culture over trust**: persona impersonation on production, live probes, screenshot eyeballs, BEGIN…ROLLBACK migration tests on prod, "bash proves truth". The standing rule: nothing is "done" without proof output.
2. **Review rounds as branches**: deep-reviews spawn round-2/3/4 fix branches (76 of them) — adversarial review is built into shipping, not bolted on.
3. **A 475-entry lesson ledger**: every 3+-attempt failure becomes a `feedback_*` memory with what-failed/what-worked/why. This is the single strongest pattern in the whole system — the org literally cannot make the same mistake silently twice, because session startup loads the index.
4. **Policy-as-config**: every policy decision becomes a config row, every permission a Role-Management key — decisions stay reversible without code changes.
5. **₹0 cost discipline**: AI workloads routed through owned Max-lane runners instead of metered APIs; the loop-flip to ₹0 was verified live this week.

## 6. Signature moves (what's distinctive, not generic)

- **Fan-out by default**: "build these" → parallel isolated agents, each on its own branch/worktree. The 2,674-branch pile was the exhaust of this engine.
- **Continuation briefs**: sessions end by writing a self-contained brief for the *next* session (task, verify-current-state commands, stop conditions). Today's cleanup executed a 2-day-old brief and correctly detected its staleness because the brief itself demanded live re-verification.
- **Loops/moats framing**: features are judged by whether they self-improve from their own outcomes (capgap loop, audit Gate ④, SCF). "Is it a verified loop" is a standing acceptance test.
- **Sovereignty bias**: institution-owned data/infrastructure over vendor pipes (IQAC runs for the institution, NAAC points are exhaust; owned WhatsApp boxes; owned AI runners).

## 7. Honest risks (RXBAR label)

1. **Bus factor = 1**: the entire org is you + AI state (memory dir, briefs, CLAUDE.md). Those files ARE the company. They're backed up, but the *judgment* layer isn't transferable yet.
2. **Exhaust accumulates faster than janitors run**: 2,674 branches / 177 worktrees needed a dedicated cleanup day; 55 unproven branches still hold possibly-unshipped work (referral-pr1, housekeeping-booking look genuinely unshipped — worth a decision, not just deletion).
3. **Verification debt at the edges**: repeated memory themes are silent failures — vacuous CI passes, RLS gaps, confused-deputy authz, false-green checks. The lesson ledger catches them *after* first occurrence; the systemic `is_admin()` RLS leak (442 policies) is still open.
4. **No visible recovery time**: 93% of calendar days ship to production; Thursday and Saturday run ~30% lighter but no true off-day exists in 106 days. That's a choice, but it's the kind the data says you haven't consciously made.
5. **Memory sprawl**: 475 feedback files is a moat AND a haystack — recall depends on the MEMORY.md index staying curated (it is, today).

## 8. What would compound best next (one recommendation, not a menu)

**Institutionalize the janitor + the unshipped-work registry.** The cleanup proved ~90% of exhaust is provably-safe to remove automatically; the remaining 10% (unproven branches) is where real unshipped work hides (referral services, housekeeping booking). A weekly sweep + a standing "possibly unshipped work" list turns today's one-off archaeology into a permanent inventory of forgotten assets — which for this operation is found money.
