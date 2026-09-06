# OneMark — Director decisions of record (2026-09-02)

**Status:** Decisions locked by interview. Nothing built yet.
**Applies to:** `OneMark_Master_PRD_English_v2` and `OneMark_Master_PRD_Physics_v2` (Downloads, 2026-08-21) — Part-I one-mark MCQ section of the Tamil Nadu State Board Class 12 papers.
**How decided:** 20 questions, plain-English, `AskUserQuestion`, five rounds, 2026-09-02 15:56–16:20 IST.
**Read with:** `specs/jkkn-advanced-blooms-taxonomy-2026-07-30.md` (JABT) and the Foundation module (`fp_*`).

---

## 0. What is already true on `jicate/main` — verified 2026-09-02

Nothing OneMark-specific exists. Zero files match. The PRD was written as a standalone offline SQLite/Android product and mentions this platform once.

What exists and is reused, not rebuilt:

| PRD needs | On main today |
|---|---|
| Users, Cohorts, Attempts, Responses | `profiles`, `fp_cohorts`, `fp_attempts`, `fp_responses` (with `time_ms` per item) |
| Subject rows for Class 12 | `exam_definitions.tn_hsc` live since 2026-08-15 (PR #3090 still open, rows applied) |
| Tamil-capable PDF | `lib/utils/bos/pdf-fonts.ts` loads Noto Sans Tamil; `public/fonts/pdf/noto-sans-tamil-*`; `@react-pdf/renderer` + puppeteer present |
| AI drafting | `ai_job_types` on the `max` lane — 9,158 jobs / 60 days, 99.6% success; a new capability is a config row |
| JABT tagging on the bank | ✅ **Applied to production 2026-09-02 22:20 IST** (migration `20260908034127`, ledger row written, read back: 2 columns · 2 CHECKs · 1 index · 125 rows untouched). It had sat merged-but-unapplied since 2026-08-15. Decision 6 is now honourable. |

What does not exist: bilingual item text, `option_layout`, provenance (year / sitting / series / question number), Class 12 chapter rows in `cdc_exam_syllabus_topics` (18 rows, 0 for Class 12), the test wizard, board-format paper rendering, the Mistake Vault, the ingestion pipeline, `QuestionAssets`, `CategoryWeights`.

> ⚠️ **`fp_student_weakness` is NOT the Mistake Vault and must not be reused as one.** It is a per-topic `mastery_score` counter. PRD §6.3 says a counter-derived mastery "cannot enforce [session separation] and MUST NOT be used". The vault is per-question with `consecutive_correct_count`, `last_correct_session_id`, `status`, `mastered_at`. New table.

---

## 1. The decisions

### Round 1 — gates

| # | Decision | Ruling | Consequence |
|---|---|---|---|
| 1 | Where it lives | **Inside MyJKKN first; offline Android app later only if the no-signal problem proves real** | Build as a Foundation-module extension. PRD C.1 #1 (offline SQLite) is DEFERRED, not adopted. Every `sync_state` column in PRD §7 is out of scope for v1. |
| 2 | Copyright on board questions | **Use past board papers as they are** | ⚠️ The PRD marks this *"Unresolved — escalate"* because the source scans carry a third-party watermark. The Director has ruled; this file records that the PRD's caveat was seen. Ingest from the government papers, not the watermarked scans, wherever a clean source exists. |
| 3 | Who writes the first 300 per subject | **AI drafts, one subject Senior Learner checks every one** | A new `ai_job_types` row (`onemark.item_draft`) on the `max` lane. Nothing reaches a learner without a human approval row. |
| 4 | Which subject first | **Both together** | Two banks, two chapter maps, two blueprints from day one. Physics carries the diagram + maths-notation PDF risk (PRD C.3); English carries the grouped-directive rendering (PRD §4.2). Neither is deferred. |

### Round 2 — PRD open decisions (C.1)

| # | Decision | Ruling | Consequence |
|---|---|---|---|
| 5 | Menu / chrome language | **Let each person choose** (English or Tamil, per user) | Every UI string exists in both languages. Tamil strings need native review before ship (CLAUDE.md #24). PRD assumption of "English chrome" is overridden. |
| 6 | Difficulty | **JABT only. Drop Easy / Medium / Hard.** | `fp_items.difficulty` is not used for OneMark. The wizard's "Difficulty Mix 40/40/20" slider becomes a **JABT level mix** (e.g. K1 10 · K3 3 · K4 2). PRD §3.3 `Difficulty Level` and `Difficulty Mix` rows are replaced. Requires migration `20260908034127` applied. Our own 2026-08-05 measurement: difficulty explained ~10% of Bloom level (r² = 0.10) — they were never the same axis. |
| 7 | Sign-off before a learner sees an item | **One subject Senior Learner is enough** | `fp_items.is_active` flips on approval; the approver is `updated_by`. No second reviewer, no HOD batch gate. |
| 8 | Launch bar | **300 approved items per subject** | Per the PRD. Learners are not enrolled until both banks reach 300. |

### Rounds 3–5 — edge cases

| # | Situation | Ruling | Consequence |
|---|---|---|---|
| 9 | Vault: correct twice in the SAME sitting | **Counts once. Second correct must be a separate session ≥ 2 days later** | PRD §6.3 session-separation rule adopted verbatim. Enforced by comparing `session_id` to `last_correct_session_id`. |
| 10 | Vault: mastered, then wrong months later | **Back into the vault, streak resets to 0** | Revocable mastery, per PRD. |
| 11 | Chapter has fewer items than requested | **Show the real number; Senior Learner chooses fewer or widens** | PRD §3.4. Never pad from other chapters, never pad with unapproved drafts. |
| 12 | Locked item no longer matches a changed filter | **Keep it, show a non-blocking warning** | PRD §3.2 lock invariant. Never silently dropped. |
| 13 | Vault review composition | **Keep the 60% single-chapter cap** | Session is shorter rather than lopsided. |
| 14 | Senior Learner edits wording while building a paper | **Only that paper. Master bank untouched** | Copy-on-write into `TestConfigurations.question_overrides`, per PRD. |
| 15 | English fixed board shape (Q1–3 synonyms, Q4–6 antonyms, Q7–20 pool) | **Forced by default, Senior Learner may switch it off** | Reserved-slot blueprint is the default template; a "free shape" toggle exists for practice sheets. |
| 16 | Series variants for hall exams | **Up to 4 (A/B/C/D), Senior Learner picks, default 1** | Per PRD §3.3. Answer key prints per series. |
| 17 | Absent learner takes the hall paper digitally later | **Same test, same score list, flagged "taken digitally"** | One `fp_assessments` instance; `fp_attempts` carries a `mode` so the report can show paper vs device. |
| 18 | Timed test clock runs out | **Auto-submit what is answered; unanswered = skipped, NOT wrong; skipped items do NOT enter the vault** | Skipping is not a mistake. Consistent with PR #2736 ("practice must not punish a skipped question"). |
| 19 | Learner tries a one-attempt live test a second time | **Blocked server-side; sees their result; no retake** | PRD §6.2 single-submission. Wrong answers still feed the vault. |
| 20 | (from round 1) Platform sequencing | MyJKKN web first | Restated: PRD's offline checklist in §9 is not part of v1 acceptance. |

---

## 2. Three flags the Director has seen

1. **Decision 2 overrides the PRD's own escalation.** Recorded, not re-litigated. Prefer clean government sources over watermarked scans.
2. ~~Decision 6 depends on an unapplied migration.~~ **Resolved 2026-09-02 22:20 IST** — `20260908034127` applied and ledgered at the chain gate; JABT columns are live before any item is authored.
3. **Decision 4 ("both together") doubles Phase 1.** 600 approved items, two chapter maps, two renderers. PRD C.2 suggested proving one subject's PDF fidelity first.

---

## 3. Schema mapping the build must follow

| PRD §7 table | Use | Notes |
|---|---|---|
| Users | `profiles` | no new table |
| Subjects | `exam_definitions` (`tn_hsc`) + a `subject` dimension | Physics and English are subjects under one Class 12 exam; needs a subject column or a second exam row per subject — **decide at build, not here** |
| Chapters | `cdc_exam_syllabus_topics` | seed Physics Units 1–11 and English text-anchors; 0 Class 12 rows today |
| Questions | `fp_items` + new columns | add `stem_ta`, `options_ta`, `option_layout`, `tags text[]`, `source_year`, `source_sitting`, `source_series`, `source_qno`, `times_served`, `times_correct`; JABT columns via `20260908034127` |
| QuestionAssets | new table | Physics diagrams |
| CategoryWeights | new table | English Q7–20 tag frequencies (PRD §4.3) |
| TestConfigurations | `fp_assessments.config` + `question_overrides` | wizard state; currently `{}` |
| Cohorts | `fp_cohorts` | exists; resource person must be set (see PR #3088) |
| StudentAttempts | `fp_attempts` + `fp_responses` | exists; add `mode` and `session_id` |
| MistakeVault | **new table** | per-question; never `fp_student_weakness` |

---

## 4. Not decided here

- Whether Physics and English are two `exam_definitions` rows or one row with a subject column.
- The `onemark.item_draft` prompt and its monthly spend cap (`monthly_spend_cap_inr` is NULL on every lesson-spine job type today — set one before 44 Senior Learners can trigger drafts).
- Android API floor (PRD C.1 #6) — moot until the offline app is revisited.
