# The Loop Constitution

*Adopted 2026-07-26 (Director). One page. Every article names the steel that enforces it — an article that lives only in prose is a wish, not a law.*

JKKN runs improvement loops (AI suggests → human acts → outcome re-measured). Six days of receipts showed that what keeps them honest is not the graph of loops — it is **grounded governance**: separated powers, owners of record, an arbiter, frozen clauses, and a human sovereign who defines "better". This page is that governance, written down.

| # | Article | Enforced by (the steel) |
|---|---------|------------------------|
| 1 | **Powers are separated.** The optimizer never grades itself; the watcher is a different process; anchors (raw-SQL morning checks, real ₹, ground-truth samples) live *outside* the graph. | Separate crons/RPCs per role; morning-check protocol (`.claude/loop-morning-check.sql`) |
| 2 | **Every loop has an owner of record, from birth.** An owner-less loop is unbossed optimization pressure. *Receipt: `carre-audit` was born owner-less on 07-25 and sat that way for a day — convention alone objected to nothing.* | `loop_registry.owner_email NOT NULL` + non-empty CHECK — an owner-less birth **fails at INSERT** (migration 20260726012000) |
| 3 | **The charter rule (config, not code).** A row may be called a *loop* only when all five legs are on the row: **outcome metric · own-baseline window · intervention · verdict owner · re-measure window**. **Receipts rule:** a leg is written only when it demonstrably runs in prod data. Any NULL leg → the row is relabelled a **meter** on the Tower — honestly. *Receipt: `mess` self-reported all gates on while its measure leg had produced literally nothing ("generated 16, measured 0"; its rating dialog was mounted nowhere).* | Five charter columns on `loop_registry`; Tower derives Meter / Loop·chartered / Loop·verified from the data, never from a hand-typed flag |
| 4 | **Conflicts have an arbiter.** Two loops pulling on the same wire is a governance case, not a debug ticket. *Live case: C1 — appraisal grades careers on the same `session_feedback` wire four SCF loops trust.* | `loop_conflicts` table (governance-only writes); arbiter of record on the row |
| 5 | **Frozen clauses.** A loop cannot amend its own metric, counter-metric, or charter. Registry writes are governance-only; charter changes travel as Director-merged migrations. | RLS on `loop_registry` + Director-only merge gate |
| 6 | **The human sovereign defines "better".** No loop graduates, widens, or auto-promotes on its own verdict; `verdict_owner` is a named human. 14 clean days prove *machinery* health, never loop goodness. | `verdict_owner` charter leg; gate flips only via Director go |
| 7 | **A watcher is an unvalidated witness** until its verdicts are sampled against raw reality. *Receipt: the note-safety judge's day-1 "0/319 clean" was largely false alarms — only an anchor caught the watcher.* | Ground-truth sampling before any watcher's verdicts drive action |
| 8 | **Measurement must re-prove itself.** A broken measurer turns a loop into a confident liar, and build/type gates cannot catch it — only a known-delta assert can. Weekly silence is meaningful **only where coverage exists**. *Coverage 2026-07-26: 3 of 22 (scf, feeder, + mess in flight) — extend, loop by loop.* | `loops-regress` cron (Sundays 07:53 IST) → `loop_audits` sim verdicts; non-verified verdicts page every super admin |

**How a loop is born, under this constitution:** a migration inserts the registry row (owner required by the database), its charter legs stay NULL until each one runs with a receipt, the Tower calls it a meter without apology, and it earns the word *loop* — then *verified* — one leg at a time.

*Related: `docs/architecture/config-table-pattern.md` (charters are config rows) · `.claude/loop-manifests/` (per-loop engineering spec behind each charter) · the Wiring & Welding audit artifact (live map).*
