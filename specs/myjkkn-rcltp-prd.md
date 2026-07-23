# MyJKKN RCLTP — Product Requirements Document (PRD)

**Date:** 2026-06-14 · **Status:** ready for `/myjkkn-api` · **Companion:** `myjkkn-rcltp-assumption-thrash.md` (23 thrash decisions + corrections + grounding ledger)

---

## 1. In one paragraph

RCLTP is a **reading-assessment + adaptive-learning module for young learners (grades 1–10)**, built inside MyJKKN first and designed to be lifted out later as a standalone Jicate product for other schools. Young learners read passages **aloud** (voice-scored) and answer **comprehension** questions; the system scores them, places them in bands (**Emergent → Transitional → Proficient → Super Proficient**), assigns **adaptive weekly practice**, builds **vocabulary (VBB)**, and reports to **learners, parents, Senior Learners, and school heads**. **v1 is English end-to-end.** Language is **per-tenant pluggable** — English is the base; local languages (Tamil for JKKN, Telugu/Hindi for MyJKKN's region) are added later (content + speech engine) when a school's medium of instruction requires them, with no rebuild.

---

## 2. Personas & how they're gated

| Persona | MyJKKN role | RCLTP can… | Gated by |
|---------|-------------|------------|----------|
| Admin | `super_admin` / `administrator` | Everything; configure bands, languages, seed competencies, onboard schools | `is_super_admin()` / `is_admin()` |
| School Head / Principal | `principal` custom_role | View all reports + dashboards for their institution; see rankings | `rcltp.report.view_all` + `role_has_institution_access` |
| Teacher | `faculty` custom_role | Open assessments for their class, review low-confidence recordings, override, authorize re-takes, see class reports | `rcltp.assessment.manage` + `rcltp.review` (own classes via `class_incharges`/`staff_plans`) |
| Student | `student` (`profiles.role`) | Take assessments, do practice, see own report | `rcltp.assessment.take` + `rcltp.report.view_own` (RLS: `learner_id = get_my_learner_id()`) |
| Parent | **new `parent_guardian` custom_role** | View their child's reports + progress; manage voice consent | `rcltp.report.view_child` (RLS via `parent_learner_links`, reuses existing phone-OTP login) |

School students live in `learners_profiles` under the **virtual "K-12 Program" degree** (`entityType='school'`); grade 1–10 is read from the existing program/section layer (exact field confirmed at build).

---

## 3. The 13 features

> Format — **What you can do** · Who · What they see · Reuses (existing MyJKKN) · Success.

**F1 · RCA Part A — Read & Record (voice).** Child reads an unseen passage aloud; recorded and scored (pronunciation, speed, expression, modulation, chunking, punctuation). · Student (proctored pre-primary–Gr2, self-serve Gr3+), Teacher. · Live recording UI; teacher review queue. · Reuses Supabase Storage (`rcltp-audio` bucket, signed URLs), audio precedent from `call-memos`. **English only in v1** (engine: Speechace recommended for child ORF, or Azure en-IN). Other languages added later when a school's medium needs them. · Success: a recording yields trustworthy accuracy/fluency scores; low-confidence ones are held for teacher sign-off.

**F2 · RCA Part B — Comprehension.** Child reads + answers questions, each tagged to a reading competency; auto-graded. · Student. · Question screen + tagged result. · Reuses `pde_assessments`/`pde_assessment_questions` pattern; reading skills seeded into `competency_catalog`. · Success: answers auto-graded and rolled into the competency-tagged report (the Asheeka-style Part-B card).

**F3 · VBB — Vocabulary Building Blocks.** Progressive 5,000+ word practice + assessment. · Student. · Stage progress, week-wise vocab score. · Reuses report/chart components. · Success: stage average + improvement-rate report (the brochure's VBB teacher view).

**F4 · Passage Bank & AI Generation.** Curated + AI-generated passages, per grade/language, **no-repeat per student**. · Admin/Teacher/System. · Passage library + approval. · New content tables + LLM pipeline with age-appropriateness guardrails. · Success: every assessment serves a grade-calibrated, never-before-seen passage.

**F5 · Scoring & Bands (SLJ).** Composite scoring; band placement **mastery-gated**; **regression shown + teacher alerted**; per-tenant cutoffs. · System. · Band indicators, prev-vs-current score. · New `rcltp_band_config` (CRUDable per tenant) + scoring RPCs. · Success: bands always reflect real ability; dips surface to teachers.

**F6 · Assessment Scheduling.** 6 cycles/year; **system proposes windows + practice, teacher confirms/releases**. · Teacher/System. · Schedule calendar. · New schedule table + a `rcltp-due-reminders` cron (mirrors `prospect-reminders`). · Success: the 6-cycle cadence runs reliably without manual chasing.

**F7 · Adaptive Practice Pathways.** Weekly practice auto-assigned by band (5/3/1). · Student/System. · Practice list + completion. · New practice-assignment logic. · Success: each student gets the right volume of practice for their band.

**F8 · Teacher Review & Override.** Low-confidence recordings held in a queue; teacher confirms/overrides; authorizes re-takes (the only re-take path — one official attempt otherwise). · Teacher. · Review queue + audio playback + override. · Reuses notifications + audit (`createAuditLog`/`computeDiff`). · Success: no shaky score reaches a parent without teacher sign-off.

**F9 · Parent Engagement & Consent.** Parents view child reports/progress; give/withdraw voice consent. **No consent → Part B text-only, Part A skipped.** · Parent. · Parent report screens on the existing phone-OTP login. · Reuses `parent_profiles` + `parent_learner_links.can_view_grades`. · Success: a parent logs in and sees their child's reading journey; consent gates voice.

**F10 · Notifications.** Assessment-due, report-ready, review-needed, regression alerts. · All. · In-app bell + WhatsApp + email. · Reuses `notifications`+`user_notifications`/`createNotification`, WhatsApp Meta Cloud API, **Resend (`lib/resend.ts`)**. · Success: the right person is alerted on the right channel (see §6).

**F11 · Reports & Dashboards (24).** Student/Parent score report (per-word heatmap, prev-vs-current), Teacher analytics (VBB + class), School-Head dashboard (rankings, averages). · All personas. · Reuses Recharts, `@react-pdf/renderer`/jsPDF/xlsx, score-card (`/learn/assess/[id]/results`), `capability-heatmap`, `finks-radar`, leaderboard, `data-table`. Per-word heatmap + band widget + school-head cross-class view = custom. · Success: all 24 reports render correctly per persona (eyeball-verified; non-Latin glyphs checked when a local language is added — rule #25).

**F12 · Admin & Configuration.** Band cutoffs, languages, competency seeding, school onboarding. · Admin. · Config screens. · Reuses `platform_policies` (tunable values), school-defaults pattern. · Success: a new school can be configured end-to-end without code.

**F13 · Compliance & Framework Mapping.** NEP/NIPUN/APAAR/SAFAL/SQAAF — **alignment metadata only, not live integrations** (v1). NIPUN wpm baked into band logic. · Admin/School-Head. · Framework-tagged reports. · Success: reports speak the frameworks' language; no false claim of live govt integration.

---

## 4. Cross-cutting must-haves (all v1)

- **Notifications (3 channels):** in-app (reuse), WhatsApp (reuse Meta Cloud API), email (reuse Resend). See §6 map.
- **Audit trail:** every score/override/re-take logged via `audit_logs` + `computeDiff` (who/when/before-after).
- **Bulk teacher ops:** open an assessment for a whole class at once; review queue across many recordings. Pattern from `bulk-learner-edit-service`; class roster via `class_incharges`/sections.
- **Offline recording:** capture audio locally with no internet → queue → upload + score on reconnect. **Purge clock starts at scoring/sync, not recording.**

---

## 5. Roles × permissions (new `rcltp.*` namespace, seeded)

`rcltp.assessment.take` · `rcltp.assessment.manage` · `rcltp.review` · `rcltp.report.view_own` · `rcltp.report.view_child` · `rcltp.report.view_class` · `rcltp.report.view_all` · `rcltp.config.manage`. RLS = canonical 3-branch (super-admin / permission+institution-scope / own-via-`get_my_learner_id` or parent-link). Permission denied → explicit `/unauthorized` (rule #27).

---

## 6. Notification map

| Event | Recipient | Channels |
|-------|-----------|----------|
| Assessment due | Student + Teacher | in-app (+ WhatsApp optional) |
| Recording needs review | Teacher | in-app |
| Low-confidence score held | Teacher | in-app |
| Band regression | Teacher (+ Principal optional) | in-app |
| Report ready | Parent | in-app + WhatsApp + email |
| Progress milestone | Parent | in-app + WhatsApp |

---

## 7. Reports

**Defined now (from brochure):** (1) Student/Parent score report — per-word pronunciation heatmap, Reading/Comprehension/Overall bands, prev-vs-current, Part-B competency tags. (2) Teacher VBB report — stage avg, completion rate, week-wise trend, improvement rate. (3) School-Head dashboard — avg reading/comprehension, comprehension indicators, student rankings.
**Open:** the full **24-report catalog must come from MyJKKN** — we'll build the 3 above + a report framework (per-persona shells reusing existing components) and slot the remaining 21 once MyJKKN supplies the list. *Flagged so "24 reports" isn't silently invented.*

---

## 8. Build sequence (engineer's call — ships together as v1, built in this order)

A. **Foundation** — `rcltp.*` permissions + RLS; reuse `learners_profiles` (read grade from K-12 program/section); seed reading competencies into `competency_catalog`; `rcltp_band_config`; `rcltp-audio` bucket; audit wiring. *(audit + offline-capable schema are foundational.)*
B. **Core loop** — Passage bank + Part B + Scoring/Bands + Student/Parent score report. *(thinnest end-to-end: a child gets a real band.)*
C. **Voice (English)** — Part A EN engine + offline capture/sync + teacher review queue + low-confidence hold + consent + audio storage.
D. **Learning** — VBB + adaptive practice (5/3/1) + SLJ journey.
E. **Orchestration** — Scheduling (6 cycles, propose/confirm) + bulk teacher ops + notifications (in-app + WhatsApp + email).
F. **Reporting** — full report/dashboard suite, per-word heatmap, rankings, trends, PDF/Excel.
G. **Parent** — parent report screens on existing parent login.
H. **Admin/Compliance** — config (cutoffs, languages, competencies, onboarding) + framework mapping.
I. **Future (not v1) — local-language plug-in.** When a school's medium requires it: add content (passages/questions/VBB) + a local-language speech engine. Dravidian languages (Tamil/Telugu) gated on a validation spike (Azure `ta-IN`/`te-IN` + custom expression/chunking layers; fallback AI4Bharat); Hindi is low-risk (Azure `hi-IN`).

---

## 9. Technical implementation

**Reuse:** `learners_profiles` (students), `competency_catalog` (reading skills), `academic_years`/`institutions`/`sections`/`programs`/`degrees` (incl. virtual K-12), `parent_profiles`+`parent_learner_links` (parent), `class_incharges`/`staff_plans`/`timetables` (teacher↔class), `notifications`+`user_notifications`, WhatsApp Meta Cloud API, `lib/resend.ts`, `audit_logs`, Supabase Storage, `platform_policies`, `/unauthorized`.

**New tables (all `institution_id`-scoped):** `rcltp_passages`, `rcltp_passage_exposure` (no-repeat), `rcltp_assessments`, `rcltp_part_a_recordings` (expression/modulation nullable until phase 2; `purge_after`), `rcltp_part_b_questions`, `rcltp_part_b_responses`, `rcltp_assessment_results`, `rcltp_band_config` (CRUDable), `rcltp_student_journey`, `rcltp_practice_assignments`, `rcltp_vbb_words`, `rcltp_vbb_progress`, `rcltp_assessment_schedule`. Consent: reuse parent infra or `rcltp_consent`.

**Engine:** Azure Pronunciation Assessment, **Central India region** (DPDP). English Part-A engine choice (Speechace vs Azure en-IN) finalized at build — Speechace recommended for child ORF + wpm, pending acceptance of US audio-processing for English. Local-language engines added later, per-tenant, when needed (Central India region for DPDP).

**Crons:** `rcltp-due-reminders` (assessment reminders), `rcltp-audio-purge` (1-yr retention via `platform_policies` + Storage `.remove()`).

---

## 10. Extraction-risk register (standalone Jicate product)

- **R1 (learner identity)** — JKKN build reuses `learners_profiles`; standalone needs its own learner+grade store. *Accepted rework.*
- **R2 (competencies)** — reading skills live in MyJKKN `competency_catalog`; standalone must carry/re-seed.
- **R3 (platform services)** — auth, notifications, RLS, reports reused; standalone rebuilds.

---

## 11. Open items

1. **MyJKKN to supply:** full 24-report catalog, validated band cutoffs/rubric, the 5,000-word VBB list (EN + Tamil), seed passages, the composite-score formula (Reading + Comprehension → Overall, the 67→85 example).
2. **Verify at build:** exact field holding grade 1–10 under the K-12 degree (program vs section), against live data.
3. **English Part-A engine** final pick (Speechace vs Azure en-IN) + DPDP sign-off on audio processing location.
4. **Local-language validation spike** — *only when a Dravidian local language (Tamil/Telugu) is added* (NOT a v1 task): record real children, measure the engine's score↔human correlation; if < ~0.7 → AI4Bharat custom build.
5. **Product context (non-blocking):** are the school clients JKKN's own schools, or external Jicate clients — affects go-to-market, not schema.

---

## 12. Verification plan (rule #2 / #14 / #25)

Every feature browser-tested as **each role** (admin/teacher/student/parent/principal) — not just "page loads." Visual artifacts (reports, PDFs, per-word heatmaps) eyeball-verified before phase-complete. API routes tested × method × auth. Any non-Latin local-language text (when a language is added) flagged for native review (rule #24).
