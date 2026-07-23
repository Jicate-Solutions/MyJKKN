# MyJKKN RCLTP — Assumption-Thrash Spec

> Source materials: `MyJKKN RCA Brochure.pdf` (20pp) + `MyJKKN Leadership Profile.pdf`.
> Produced via `/assumption-thrash` on 2026-06-13. 23 decisions locked across 5 interview rounds + edge-case walkthrough + an L2 parallel speech-engine verification.
> Status: **pre-build.** Ready to feed `/myjkkn-module` (deep business interview) then `/myjkkn-api` (build).

---

## 1. What we're building

**RCLTP** (Reading Comprehension Learning *and* Teaching Proficiency) — MyJKKN's AI-driven reading-assessment + learning platform for pre-primary → K10.

Three engines:
- **RCA Part A — Read & Record**: child reads an *unseen* passage aloud; system scores pronunciation accuracy, reading speed (wpm), expression, voice modulation, chunking, punctuation.
- **RCA Part B — Comprehension**: child reads + answers questions; each question tagged to a reading competency (central idea, synonyms/antonyms, sequence, spelling, extrapolatory, open-ended).
- **VBB — Vocabulary Building Blocks**: 5,000+ word progressive, contextual vocabulary engine.

Spine: **SLJ** (Student Learning Journey) — bands Emergent → Transitional → Proficient (→ Super Proficient); practice cadence 5/3/1 per week by band; assessments 6×/year for 5 years; NIPUN-aligned wpm targets (Gr1 30–40 … Gr10 130–140). **24 reports** across Student/Parent, Teacher, School-Head.

---

## 2. Build frame (Round 1)

| # | Decision | Note |
|---|----------|------|
| 1 | **Build for real** | Not evaluation/spec-only. |
| 2 | **MyJKKN first → extract as standalone Jicate product later** | Hard constraint: design for multi-tenant + portability. `institution_id` is both the tenant key and the future extraction seam. |
| 3 | **Full brochure scope in v1** | RCA A+B, VBB, SLJ, 24 reports, 4 personas, compliance. |
| 4 | **3rd-party speech engine** | Resolved by verification (§7) to **Azure Pronunciation Assessment, Central India region**. |

---

## 3. Preflight findings (live MyJKKN survey, 2026-06-13)

Repo: `/Users/omm/PROJECTS/MyJKKN` · 936 migrations · schema truth from `types/supabase.ts`.

| Concern | Status | Action |
|---------|--------|--------|
| `public.students`, `academic_years`, `institutions`, `programs`, `sections`, `departments` | ✅ exist | Reuse academic + tenancy spine. |
| Assessment+questions engine | ✅ pattern (`pde_assessments`, `pde_assessment_questions`) | Follow shape for RCA. |
| Rubrics | ✅ pattern (`internship_evaluation_rubrics`) | Follow for scoring rubric. |
| **`competency_catalog`** | ⚠️ exists, institution-scoped, skills/vocational-oriented (`finks_dimensions`, `industry_tags`, `competency_type` enum, `proficiency_levels` jsonb) | **Reuse** (decision #5) — add reading competencies as rows. |
| Reading passages, voice/Read-&-Record, VBB, RCA scoring/bands | ❌ none | Net-new domain — no collision. |

---

## 4. Locked decisions

### Round 2 — structural
| # | Question | Decision | Rationale |
|---|----------|----------|-----------|
| 5 | Where do reading skills live? | **Reuse `competency_catalog`** | Less code now; accepts coupling (see R2). |
| 6 | Learner identity | **Reuse `public.students` directly** | Fastest; accepts coupling (see R1). |
| 7 | Reuse vs portability conflict | **Reuse directly, accept productisation rework** | *Conscious* trade — speed now, re-plumbing later. Surfaced and confirmed. |
| 8 | Passage source | **Hybrid: curated bank + AI-gen + per-student no-repeat tracking** | Matches "AI+LLM" claim; guarantees freshness. |
| 9 | Band cutoffs | **Per-tenant configurable defaults (CRUDable band-config)** | Supports JKKN + future Jicate clients (rule #15). |

### Round 3 — operational
| # | Question | Decision |
|---|----------|----------|
| 10 | Scheduling (6/yr + 5/3/1 practice) | **Hybrid — system proposes windows + practice, teacher confirms/releases** |
| 11 | Who runs Part A voice | **By grade — proctored pre-primary–Gr2, self-serve Gr3+** |
| 12 | Offline / weak network | **Record offline → queue → score on reconnect.** ⚠️ Purge clock starts at *scoring/sync*, not recording. |
| 13 | Audio retention | **Keep audio 1 academic year then purge; parental consent at onboarding** |

### Edge-case walkthrough
| # | Scenario | Decision |
|---|----------|----------|
| — | Network drop / no internet / empty audio / wrong text read | Auto-handled by #12 + transcript-vs-passage mismatch check |
| 14 | Low-confidence ASR | **Hold for teacher review/override before parent sees** |
| 15 | Band regression (Transitional→Emergent) | **Show the dip + alert teacher** (honest data drives intervention) |
| 16 | Progression logic | **Mastery-gated** — band changes only when score crosses cutoff; "3 months" = expectation, not guarantee |
| 17 | Re-attempts | **One official attempt; re-takes only by teacher override** |

> **Guiding principle (emergent):** automate, but the **teacher is the trust backstop at every edge** (low-confidence → teacher; regression → alert; re-take → override). Makes scores defensible to parents.

### Round 4 — compliance, privacy, scope
| # | Question | Decision |
|---|----------|----------|
| 18 | APAAR / SAFAL / SQAAF / NIPUN / NEP | **Alignment + design-ready, NOT live integrations in v1.** NIPUN wpm baked into band logic. |
| 19 | Parent refuses voice consent | **Part B text-only, skip Part A**; report notes "voice not assessed — no consent" |
| 20 | Languages | **English + Tamil** (Tamil replaces Hindi — JKKN is Tamil Nadu) |
| 21 | Report scope | **All 24 up front** (read layer — views/queries) |

---

## 5. Speech-engine resolution (verification §7) + phased Tamil plan

| # | Decision |
|---|----------|
| 22 | **Engine = Azure Pronunciation Assessment, Central India region** (only Tamil-capable scoring vendor; DPDP-clean in-region). |
| 23 | **English voice first; Tamil voice = phase 2.** Tamil v1 = Part B + reading-speed + accuracy (no Tamil expression/modulation). Full Tamil voice scoring after a mandatory 2-week Tamil-children validation spike + custom layers on Azure timestamps/pitch. Fallback if spike fails: AI4Bharat build (9–12 mo). |

---

## 6. Schema implications (derived — for `/myjkkn-api`)

### Reuse (no new table; **extraction-risk flagged**)
- `public.students` ← all RCA results FK here directly. **[R1]**
- `competency_catalog` ← reading skills seeded as rows; needs a reading `competency_type` value (⚠️ enum expansion DDL). **[R2]**
- `academic_years`, `institutions`, `programs`, `sections` ← tenancy/academic FKs.

### New tables (all `institution_id`-scoped for tenancy + future extraction)
1. `rcltp_passages` — bank: language(en/ta), grade_level, body, source(curated/ai/teacher), word_count, status(draft/approved), ai_meta jsonb, is_active.
2. `rcltp_passage_exposure` — no-repeat tracking: student_id, passage_id, assessment_id, seen_at.
3. `rcltp_assessments` — instance (pattern: `pde_assessments`): student_id, academic_year_id, cycle_no(1–6), language, status state-machine (scheduled/in_progress/recorded/queued/scored/needs_review/published/not_attempted), proctored, administered_by, windows, attempt_no, is_official.
4. `rcltp_part_a_recordings` — audio_path, sync_status, scoring_status, engine, engine_response jsonb, accuracy/fluency/completeness/pron scores, wpm(computed), expression_score+modulation_score (**nullable — phase 2**), chunking_flags jsonb, confidence, reviewed_by, review_status, **purge_after (= scored_at + 1yr)**.
5. `rcltp_part_b_questions` — passage_id, question_text, type, **competency_id → competency_catalog**, options jsonb, correct_answer, max_score.
6. `rcltp_part_b_responses` — assessment_id, question_id, response, is_correct, competency_id, auto_graded.
7. `rcltp_assessment_results` — composite: reading_band, comprehension_band, overall_band, reading/comprehension/overall scores, previous_score, current_score.
8. `rcltp_band_config` — **per-tenant cutoffs (CRUDable)**: band_name, dimension(reading/comprehension/overall), min/max_score, is_system, is_active.
9. `rcltp_student_journey` (SLJ) — current_band per dimension, since, exercises_completed, progression_log jsonb.
10. `rcltp_practice_assignments` — week_of, exercises_assigned (5/3/1 by band), completed, status.
11. `rcltp_vbb_words` — language, word, stage, difficulty_rank, definition, context_example.
12. `rcltp_vbb_progress` — student_id, stage, score, completion_rate (week-wise).
13. `rcltp_consent` — voice_consent, consented_by/at, scope (**DPDP**; check if existing consent infra can host this).
14. `rcltp_assessment_schedule` — per institution+year: 6 windows, status(proposed/confirmed/open/closed), proposed_by_system, confirmed_by.

### Triggers / logic
- **Band update** on new scored result → mastery-gate recompute (#16); allow regression + emit teacher alert (#15).
- **Practice auto-assign** 5/3/1 from current band (#10).
- **Audio purge job** where `purge_after < today` (clock from scored_at, #12).
- **No-repeat passage selection** excludes seen passages per student (#8).
- **Low-confidence routing**: confidence < threshold → `low_confidence_review`, hidden from parent until teacher signs off (#14).

### Enums vs CRUDable (rule #15)
- Band names → **CRUDable table** (#8 band_config), NOT enum.
- Assessment status → state-machine enum OK.
- Language en/ta → enum acceptable (slow-changing); note future hi/other.
- `competency_type` reading value → enum expansion on existing catalog. **[R2]**

---

## 7. Speech-engine verification (L2 parallel research, 2026-06-13)

Four parallel helpers (Azure · Speechace+SpeechSuper · Google+ELSA · Indian/open) converged:

- **Only Azure Pronunciation Assessment scores Tamil** (`ta-IN` in official 33-locale list, phoneme-level). Central India region available (DPDP-clean).
- Speechace/SpeechSuper: **no Tamil** (6/8 langs). Speechace = best *child* track (86% on 350+ kids, ORF, word-correct-per-min) but English/Spanish/French only. SpeechSuper has explicit Indian-*English* dialect mode; China-hosted.
- Google: **transcription only, no scoring API**; "Read Along" pronunciation tech is app-only. ELSA: English-only, American-English-calibrated.
- Indian vendors (Sarvam/Gnani/Reverie) + govt (Wadhwani/IIT-B TARA/NIPUN): transcription + word-level WCPM only, **Tamil pronunciation scoring not deployed anywhere**.
- **Build path** (fallback): AI4Bharat IndicConformer (Tamil ASR, MIT) + IndicMFA (forced alignment) + custom GoP layer → 9–12 months *including collecting a Tamil-children dataset that does not exist publicly*.

### ⚠️ Azure rubric gap for Tamil (and en-IN)
`ProsodyScore` + `ContentAssessment` are **`en-US` only**. For `ta-IN`/`en-IN` you get Accuracy/Fluency/Completeness/Pron + per-word error flags (Monotone, MissingBreak/UnexpectedBreak) + timestamps — **but NO graded expression/voice-modulation score, and wpm must be computed from timestamps.** Even the English path needs custom expression layers or a different engine.

### Mandatory gate
**2-week validation spike** recording real Tamil children, measuring Azure `ta-IN` score↔human-rater correlation, BEFORE committing Tamil voice architecture. If correlation < ~0.7 → custom build path.

---

## 8. Extraction-risk register (the accepted rework, decision #7)
- **R1** — RCA results FK directly to `public.students.id` → standalone product must re-map learner identity.
- **R2** — reading skills live in MyJKKN-specific `competency_catalog` (with `finks_dimensions` etc.) → standalone must carry/re-seed competencies + enum.
- **R3** — reuse of MyJKKN auth / notifications / RLS → standalone needs its own.
- *Accepted consciously; mitigations deferred to productisation project.*

---

## 9. Open decisions for `/myjkkn-module` + `/myjkkn-api`
1. **English Part-A engine**: Speechace (child-proven, ORF, wpm, intonation; US-hosted → DPDP check) vs Azure en-IN (India-hosted, but no ProsodyScore → custom expression). *Recommend Speechace for English if US audio-processing of minors is acceptable; else Azure en-IN + custom.* A two-engine architecture (Speechace=EN, Azure=TA) is viable since both are cloud-deferred.
2. Passage **AI-generation guardrails** (age-appropriateness, safety) — content pipeline design.
3. **VBB 5,000-word list** source — MyJKKN-supplied vs build (per language).
4. Exact **composite formula**: overall band from reading + comprehension (the 67→85 example).
5. Whether `rcltp_consent` rides existing MyJKKN consent infra.
6. The 24 report definitions (read-layer views).

---

## Sources (speech-engine verification)
- [Azure Pronunciation Assessment locales (ta-IN confirmed)](https://raw.githubusercontent.com/MicrosoftDocs/azure-ai-docs/main/articles/ai-services/speech-service/includes/language-support/pronunciation-assessment.md)
- [Azure how-to pronunciation assessment (en-US-only prosody)](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/how-to-pronunciation-assessment)
- [Azure Speech regions (Central India)](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/regions)
- [Speechace supported languages](https://api-docs.speechace.com/getting-started/supported-languages) · [Speechace for kids](https://www.speechace.com/using-the-speechace-api-as-voice-ai-for-kids/)
- [SpeechSuper Indian-English dialect](https://medium.com/@speechsuper1024/enhanced-indian-english-pronunciation-assessment-available-on-speechsuper-api-66294da92686)
- [Google STT word confidence ≠ pronunciation](https://cloud.google.com/speech-to-text/docs/word-confidence)
- [AI4Bharat IndicMFA forced aligner](https://github.com/AI4Bharat/IndicMFA) · [Sarvam API (India-hosted ASR)](https://docs.sarvam.ai/api-reference-docs/introduction)
- [Tamil children's fluency, Interspeech 2025](https://arxiv.org/abs/2505.19671)

---

## Corrections (2026-06-14, from /myjkkn-module grounding + live verification)

1. **Canonical student table is `learners_profiles`**, not `public.students` (legacy). `profiles.learner_id` is the login bridge; `get_my_learner_id()` is the RLS helper.
2. **JKKN DOES model K-12** — earlier "no school grades" conclusion was WRONG (schema-shape ≠ data-usage). A school is an `institutions` row with `entityType='school'`, auto-assigned a **virtual "K-12 Program" degree** (`degree_code='K12'`) + "Academic" dept via `lib/services/school-defaults-service.ts`. School students live in `learners_profiles` under that degree. Real schools: Nattraja Vidhyalaya (`jkkn_NV`), JKKN Matriculation School. Admin UI: `app/(routes)/organizations/school-defaults/`.
3. **Decision #6 stands (reuse students directly) — confirmed correct.** RCLTP reuses `learners_profiles` for JKKN school students; the "RCLTP owns the learner" detour is WITHDRAWN. Grade 1–10 sits in the program/section layer under the K-12 degree — **confirm exact field against live data at build.** Standalone Jicate product still needs its own learner+grade store (accepted extraction rework, R1).
4. **Email is NOT a gap.** Resend works: `lib/resend.ts` (live `new Resend(...)`) + real `resend.emails.send()` in PDE briefings, bug-report emails, 2 HR/WhatsApp crons. RCLTP reuses it. (Earlier recon read the stale `email-service.ts` stub and missed `lib/resend.ts`.)
5. **Parent access = build report screens on the EXISTING parent login** (`parent_profiles` + `parent_learner_links.can_view_grades` + phone-OTP). New `parent_guardian` custom_role + `rcltp.report.view_child` permission. RLS via parent→learner link.

### Grounding reuse ledger (MyJKKN infra RCLTP plugs into)
- Notifications: `notifications`+`user_notifications`, `createNotification`, bell UI, free-text category, `/api/learn/notify` pattern. WhatsApp: Meta Cloud API (`sendTextMessage`/templates). Email: `lib/resend.ts`.
- Roles/RLS: 3-branch policy (`is_super_admin()` / `user_has_permission()`+`role_has_institution_access()` / own via `get_my_learner_id()`); explicit `/unauthorized` 403 (rule #27 satisfied). New `rcltp.*` permission namespace.
- People graph: `learners_profiles` (student) · `class_incharges`/`staff_plans`/`timetables`→sections (teacher↔class) · `parent_profiles`+`parent_learner_links` (parent↔child).
- Reports: Recharts + jsPDF + `@react-pdf/renderer` + xlsx; reuse score-card (`/learn/assess/[id]/results`), `capability-heatmap`, `finks-radar`, leaderboard, `data-table`, `calendar-date-picker`. Per-word heatmap + band widget + RCLTP RPCs = custom.
- Audit: `audit_logs` + `createAuditLog` + `computeDiff`. Bulk: `bulk-learner-edit-service` pattern. Storage: Supabase Storage, new `rcltp-audio` private bucket (model on `call-memos`), signed URLs, store path-not-URL. Purge: `duty-log-retention` cron + `platform_policies` tunable days + `delete_old_audit_logs()` precedent.

### Module decisions locked (2026-06-14)
- Scope: all 13 features + 4 cross-cutting must-haves (WhatsApp/email notifications, audit trail, bulk teacher ops, offline recording) shipped together as v1; **internally sequenced** (build order is engineer's call).
- **Language (FINAL): English-only v1, per-tenant pluggable.** English is the v1 base (mature, low-risk voice scoring). Local languages (Tamil for JKKN, Telugu/Hindi for MyJKKN's region, etc.) are added later — content + speech engine — only when a school's medium of instruction requires them; architecture treats language as per-tenant config so this is an add-on, never a rebuild. JKKN's schools (Nattraja Vidhyalaya CBSE, JKKN Matriculation) are English-medium, so English is also the correct assessment language for them. **Supersedes earlier "English + Tamil" (decision #20) and "Tamil voice phase 2."** The Dravidian voice-scoring spike (§7) runs only if/when such a language is added — it is NOT a v1 task.
