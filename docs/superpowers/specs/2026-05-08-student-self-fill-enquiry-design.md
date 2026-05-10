# Student Self-Fill Enquiry — Design Spec

**Date:** 2026-05-08
**Status:** Design — pending user approval, plan, implementation
**Owner:** Admission Module
**Related:**
- `app/(routes)/learners/enquiries/[id]/edit/_components/enquiry-form.tsx`
- `app/api/admission/bridge/convert/route.ts`
- `lib/services/admission/fee-resolution-service.ts`

---

## Problem statement

Today, when a lead is converted to a learner, the admission desk fills every
field on the 6-tab enquiries edit page themselves — including ~25 fields that
the student is the most authoritative source for (name spelling, parents'
names, marks, address, religion, community). This is slow, error-prone, and
keeps the admission counter blocked while staff transcribes data the student
just told them verbally.

We want the **student to fill their own data on their own phone**, while the
admission team retains exclusive control over the fields they alone are
authoritative for (program/section selection, accommodation type & pricing,
fee resolution).

Students do not have logins. The form must be accessible to anonymous
visitors but bound to a single specific learner row, fillable only at the
counter, lockable after submit.

## Goals

1. Student fills Basic Details + Academic Information + Contact Details on
   their phone via a QR code shown at the admission counter.
2. Admission team retains exclusive write access to Course Selection,
   Accommodation Preferences, and Finance.
3. Admission can fill on the student's behalf as a fallback, with audit trail.
4. Form is bilingual (Tamil + English) consistent with the Gate Entry kiosk.
5. Once a student submits, their form locks permanently — no second submit,
   no edit via the same URL.
6. No new auth model. No new public-form table. Reuse existing infrastructure
   wherever possible.

## Non-goals

- Sending QR/URL via WhatsApp or email. Counter-only delivery in v1.
- Student can re-edit days later. Locked permanently on submit; corrections
  go through admission's desktop override path.
- Document uploads (Aadhaar, mark sheets). Selfie photo only in v1.
- Multi-tenant or multi-language beyond Tamil + English.
- Real-time push notification to admission. Polling-based status check is
  sufficient given the counter context.

## User personas

- **Admission desk operator** — converts leads, shows QR to student at counter,
  completes course/accommodation/finance after student submits.
- **Student / prospective learner** — physically present at admission counter,
  uses their own phone to scan QR and fill 3 sections.
- **Admission super-admin** — same as desk operator plus authority to
  override locked rows or revoke active tokens.

## Confirmed decisions (from brainstorming session 2026-05-08)

| # | Decision |
|---|---|
| 1 | QR delivered at counter/kiosk on-site (admission shows; student scans) |
| 2 | Student fills: Basic + Academic + Contact. Admission fills: Course + Accommodation + Finance |
| 3 | Token: 30-min lifetime, single-use, regeneration invalidates prior |
| 4 | Admission can fill student-section as fallback (audit-flagged) |
| 5 | Bilingual labels (Tamil + English) like Gate Entry |
| 6 | Selfie via phone camera, client-side compress to <500KB, write to `student_photo_url` |
| 7 | Auto-save per section (4-step wizard: Continue / Continue / Continue / Confirm & Submit) |
| 8 | Architecture: Service-role + HMAC token (Approach A) |
| 9 | Pre-submit preview step shows all entered data with per-section Edit links |
| 10 | Post-submit form returns 410 Gone — cannot reopen; admission edits via desktop override |

---

## Data model

### New table: `learner_self_fill_tokens`

```sql
CREATE TABLE learner_self_fill_tokens (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    learner_profile_id uuid NOT NULL REFERENCES learners_profiles(id) ON DELETE CASCADE,
    token_hash         text NOT NULL UNIQUE,
    status             text NOT NULL DEFAULT 'active'
                       CHECK (status IN ('active', 'consumed', 'expired', 'superseded')),
    expires_at         timestamptz NOT NULL,
    generated_by       uuid REFERENCES profiles(id),
    generated_at       timestamptz NOT NULL DEFAULT now(),
    consumed_at        timestamptz,
    superseded_by      uuid REFERENCES learner_self_fill_tokens(id),
    section_progress   jsonb NOT NULL DEFAULT '{
        "basic_done": false,
        "academic_done": false,
        "contact_done": false
    }'::jsonb
    -- 3 keys, one per persisted section. The preview step (Step 4 of the
    -- wizard) is purely a frontend read-only review and does not need a
    -- persisted "preview_done" flag — its only side effect is the final
    -- PATCH with final=true, which transitions token.status='consumed'.
);

CREATE INDEX ix_lsft_active ON learner_self_fill_tokens (learner_profile_id)
    WHERE status = 'active';
CREATE INDEX ix_lsft_expiry ON learner_self_fill_tokens (expires_at)
    WHERE status = 'active';

-- Defense in depth: only one active token per learner
CREATE UNIQUE INDEX ux_lsft_one_active_per_learner
    ON learner_self_fill_tokens (learner_profile_id)
    WHERE status = 'active';
```

### Token state machine

```
                   admission clicks "Show QR"
                              │
                              ▼
                          ┌────────┐
                          │ active │
                          └────┬───┘
                               │
              ┌────────────────┼─────────────────┐
              │                │                 │
              ▼                ▼                 ▼
    student submits    admission re-generates   30 min elapse
       ┌────────┐         ┌────────────┐     ┌─────────┐
       │consumed│         │ superseded │     │ expired │
       └────────┘         └────────────┘     └─────────┘
       (terminal)         (terminal —          (terminal)
                          new token is
                          now active)
```

### Reuse of existing fields

| Concern | Field | Status |
|---|---|---|
| "Has student finished?" | `learners_profiles.is_profile_complete` | **Existing** — flip to `true` on final submit |
| "Where is this row in the funnel?" | `learners_profiles.lifecycle_status` | **Existing** — set to `'enquiry'` on conversion. The bridge endpoint (`app/api/admission/bridge/convert/route.ts:147`) currently writes `'admitted'`; we change that line to `'enquiry'`. The flip to `'admitted'` then becomes the responsibility of the desktop save once admission completes their sections. |
| "Who filled which section?" | `admission_lead_activities` | **Existing** — log 3 entries on submit: `student_section_filled` for basic/academic/contact |

### Lifecycle state matrix

| State | `lifecycle_status` | `is_profile_complete` |
|---|---|---|
| Lead just converted, awaiting student | `enquiry` | `false` |
| Student submitted, awaiting admission | `enquiry` | `true` |
| Admission completed everything | `admitted` | `true` |
| Admission overrode student section, then completed | `admitted` | `true` |

### Existing flow change

In `app/api/admission/bridge/convert/route.ts:147`, change
`lifecycle_status: 'admitted'` to `lifecycle_status: 'enquiry'`. Downstream
code that filters "admitted leads" needs review for this transition.

---

## End-to-end user flow

```
ADMISSION DESK (DESKTOP)
────────────────────────
  Lead captured (any source)
       │
       │ admission opens lead detail page
       ▼
  /admission/leads/[id]
  [Convert to Admitted]
       │ POST /api/admission/bridge/convert
       ▼
  learners_profiles row created:
    lifecycle_status='enquiry', is_profile_complete=false

  After conversion, button reveals:
  [Show Student QR]
       │ POST /api/admission/student-form-tokens
       ▼
  learner_self_fill_tokens row inserted (status='active', exp +30min)
  Modal: QR canvas + 30-min countdown

  ╔═════════════════════╗
  ║ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ ║
  ║ ▓▓ Scan with phone ║
  ║ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ ║
  ╚═════════════════════╝
   Expires in: 29:47
   [Regenerate]  [Close]

STUDENT (PHONE)
───────────────
  Scans QR with phone camera
       │
       ▼
  /student-form/[token]
  GET /api/student-form/[token]
    → HMAC validation
    → token row check (status, expiry)
    → learners_profiles.is_profile_complete must be false
       │
       ▼
  STEP 1 of 4 — Basic Details
    Bilingual labels, photo capture, [Continue / தொடரவும்]
       │ PATCH section=basic
       ▼
  STEP 2 of 4 — Academic Information
    Marks, scholarship, NEET, [Continue]
       │ PATCH section=academic
       ▼
  STEP 3 of 4 — Contact Details
    Mobile, email, address cascade, [Continue]
       │ PATCH section=contact
       ▼
  STEP 4 of 4 — Preview & Confirm
    All entered data shown read-only
    [Edit] links per section
    [Confirm & Submit / உறுதிசெய்க]
       │ PATCH final=true
       ▼
  → token.status='consumed'
  → token.consumed_at=now()
  → learners_profiles.is_profile_complete=TRUE
  → 3× admission_lead_activities (filled_by=student)
  → Browser shows success page
  → URL now permanently returns 410 Gone

ADMISSION DESK (DESKTOP) — second pass
──────────────────────────────────────
  Admission opens /learners/enquiries/[id]/edit

  Student-section tabs:
    ✔ Basic       Filled 11:51 by student
    ✔ Academic    Filled 11:53 by student
    ✔ Contact     Filled 11:55 by student
    [Edit override] (audit-flagged, optional)

  Admission-section tabs (editable):
    ▢ Course Selection
    ▢ Accommodation Preferences
    ▢ Finance (auto-resolved on save)

  [Save & Mark Admitted]
       │
       ▼
  → resolve_fee_items_for_lead(id)
  → lifecycle_status flips to 'admitted'
  → row leaves the "enquiry" inbox
```

---

## Component architecture

### Frontend

```
app/
├── admission/leads/[id]/
│   └── page.tsx                          [MODIFY]
│       After conversion success →
│       reveals <ShowStudentQRButton learnerProfileId={...}/>
│
├── learners/enquiries/[id]/edit/
│   └── _components/
│       ├── enquiry-form.tsx              [MODIFY]
│       │   - Add <ShowStudentQRButton/> in header
│       │     (only when !is_profile_complete)
│       │   - Add read-only chip on student-section tabs
│       │   - Edit-override flow uses existing canEdit
│       │     logic + new audit log entry
│       └── student-section-status-chip.tsx     [NEW]
│
├── _components/admission/
│   ├── show-student-qr-button.tsx        [NEW]
│   └── student-form-qr-dialog.tsx        [NEW]
│       (QR canvas via 'qrcode' npm pkg, countdown,
│       polling for status='consumed' to auto-close)
│
└── student-form/[token]/                 [NEW — public, no auth]
    ├── page.tsx                          Server component, validates token
    ├── _components/
    │   ├── wizard-shell.tsx              4-step orchestrator + lang toggle
    │   ├── step-basic-details.tsx        Basic fields + photo
    │   ├── step-academic-information.tsx Marks + entry
    │   ├── step-contact-details.tsx      Mobile + address cascade
    │   ├── step-preview-confirm.tsx      Read-only review + Edit links
    │   ├── selfie-capture.tsx            Camera + crop + compress
    │   └── language-toggle.tsx           Tamil/English flip
    └── submitted/page.tsx                Success page after submit
```

### Backend service

```
lib/services/admission/
├── student-form-service.ts               [NEW]
│   Methods:
│     generateToken(learnerProfileId, byUserId): TokenResult
│     validateAndLoadToken(rawToken): TokenContext
│     saveSection(token, section, fields): void
│     submitFinal(token): void
│     revokeToken(tokenId, byUserId): void
│
└── student-form-write-whitelist.ts       [NEW]
    Exports the column whitelist per section.
    Imported only by the API route that performs writes.
```

### API endpoints

```
ADMISSION-SIDE (authenticated, requires admission.leads.edit)

POST   /api/admission/student-form-tokens
       body: { learner_profile_id }
       response: { token_url, expires_at }

GET    /api/admission/student-form-tokens/[learner_id]/status
       — for polling; returns { status, consumed_at, expires_at }

POST   /api/admission/student-form-tokens/[token_id]/revoke


STUDENT-SIDE (public, no auth, HMAC-validated token)

GET    /api/student-form/[token]
       — returns { learner: {...}, section_progress, expires_in_seconds }
       — errors: 401 (bad token), 410 Gone (expired/consumed/superseded
         /is_profile_complete=true)

PATCH  /api/student-form/[token]
       body: { section: 'basic'|'academic'|'contact', fields: {...}, final: boolean }
       — service-role write with column whitelist
       — final=true: flips is_profile_complete, consumes token, writes audit logs

POST   /api/student-form/[token]/photo
       multipart, field name 'photo'
       — uploads to storage.objects: avatars/{learner_id}/{token_id}.jpg
       — returns { photo_url }
```

### Column write whitelist

```ts
// lib/services/admission/student-form-write-whitelist.ts
export const STUDENT_WRITABLE_COLUMNS = {
  basic: [
    'first_name', 'last_name', 'date_of_birth', 'gender',
    'religion', 'community', 'caste', 'student_photo_url',
    'father_name', 'father_occupation', 'father_mobile',
    'mother_name', 'mother_occupation', 'mother_mobile',
    'annual_income',
  ],
  academic: [
    'tenth_marks', 'twelfth_marks', 'twelfth_group',
    'last_school', 'board_of_study',
    'neet_roll_number', 'neet_score',
    'counseling_applied', 'counseling_number',
    'scholarship_type', 'quota', 'entry_type',
  ],
  contact: [
    'student_mobile', 'student_email',
    'permanent_address_street', 'permanent_address_state',
    'permanent_address_district', 'permanent_address_taluk',
    'permanent_address_pin_code',
  ],
} as const;
```

The PATCH handler iterates only these column names. Any field name in the
request body that is NOT in this list is silently ignored. `lifecycle_status`,
`institution_id`, `created_by`, `created_at`, `application_id`, `is_profile_complete`,
and any FK to course-selection/accommodation/finance are NOT writable through
the student endpoint — even with a valid token.

---

## Security model

### Token signing

```
Raw token (URL):
  base64url( payload_json ).base64url( hmac_signature )

  where:
    payload_json = { tid: <token_id>, exp: <unix_timestamp>, iat: <unix_timestamp> }
    hmac_signature = HMAC_SHA256(payload_json, env.STUDENT_FORM_HMAC_SECRET)

DB storage:
  token_hash = SHA256( raw_token + env.STUDENT_FORM_PEPPER )

Lookup:
  Receive raw token from URL
  → recompute hash with pepper
  → SELECT * FROM learner_self_fill_tokens WHERE token_hash = $1
  → verify HMAC over payload using secret
  → check status, expiry, learners_profiles.is_profile_complete
```

### Rate limits

| Endpoint | Limit | Reason |
|---|---|---|
| Token generation (admission) | 10 regenerations per learner per hour | Defense against accidental key-mash. Each regeneration supersedes the prior token; only one is `status='active'` at any time (enforced by unique partial index `ux_lsft_one_active_per_learner`). The rate limit caps how many superseded rows a single learner can accumulate per hour. |
| `GET /api/student-form/[token]` | 60 per IP per minute | Defense against scraping leaked tokens |
| `PATCH /api/student-form/[token]` | 20 per token | Auto-save loop limit |
| Photo upload | 5 per token | One per attempt, plus margin for retake |

### Defense layers (depth)

1. **Network**: rate limits (above)
2. **HMAC signature**: forged tokens fail signature check
3. **Token row check**: status/expiry validated
4. **Learner state check**: `is_profile_complete=true` returns 410 regardless of token state
5. **Column whitelist**: even valid token + valid request can only write specific columns
6. **No service-role exposure**: HMAC secret and service-role key live server-side; never bundled to client
7. **Storage path scoping**: photos written to `avatars/{learner_id}/{token_id}.jpg` — admission can audit per-token attempts

---

## Error handling matrix

| Layer | Error condition | User-facing behavior |
|---|---|---|
| Token GET | Bad HMAC signature | 401 page: "This QR link is invalid. / இந்த QR செல்லாது." |
| Token GET | Token row not found | Same as above (don't leak existence) |
| Token GET | Token status=`expired` | 410 page: "This QR has expired. / இந்த QR காலாவதியாகிவிட்டது." |
| Token GET | Token status=`superseded` | 410 page: "A newer QR was generated. / புதிய QR உருவாக்கப்பட்டுள்ளது." |
| Token GET | Token status=`consumed` OR `is_profile_complete=true` | 410 page: "Form already submitted. / படிவம் சமர்ப்பிக்கப்பட்டது." |
| PATCH section | Network/server error | Inline banner: "Couldn't save — please try again." Form state preserved. |
| PATCH final | DB rejects (validation/constraint) | Banner, stay on Preview, scroll to first invalid field |
| Photo upload | File >5 MB pre-compression | Client-side reject: "Photo too large — try again." Hard limit. The 500 KB target is post-compression; if compression cannot reach 500 KB, accept up to 1 MB upload. Reject > 5 MB pre-compression to avoid eating the user's data plan. |
| Photo upload | Camera permission denied | Fallback to file picker, then skip-photo path |
| Camera unavailable | Older Android browser | `accept=image/*` falls back to gallery silently |
| Admission "Show QR" | learner.is_profile_complete=true | Button disabled, tooltip: "Form already submitted on <date>" |
| Admission "Show QR" | Rate limit hit | Toast: "Too many regenerations. Please wait or contact super-admin." |
| Concurrent regeneration | Two admins both click | Unique partial index → second insert fails 23505 → API supersedes the first, retries insert → eventually consistent |

---

## Edge cases

| Case | Resolution |
|---|---|
| Student loses internet mid-fill | Sections 1+2 already saved; reload resumes at last unsaved section. Token still valid until 30 min. |
| Phone runs out of battery | Same as above. Walk back to counter; admission re-shows QR (likely a new token if expired). |
| Student types but doesn't tap Continue, walks away | Nothing saved. Section blank on next reload. Acceptable — section auto-save is per-section, not per-keystroke. |
| Two students share one QR by mistake | DB enforces one-active-token-per-learner. Second scanner fills the FIRST student's form. Mitigation: train team to not regenerate while another student is active. |
| Student submits, admission later realizes typo | Admission edits via desktop "Edit override" path; row gets `filled_by_audit='admission_override'`; activity log records the edit. |
| Admission deletes/reverts the lead after token issued | FK ON DELETE CASCADE on `learner_self_fill_tokens.learner_profile_id` → tokens vanish with the learner row → student's next fetch returns 401 generic error. |
| Power outage mid-session | Per-section data saved. When power returns, admission opens enquiries/edit, sees section progress, regenerates QR if needed. |
| Student submits in Tamil, admin reads in English | Field values are language-agnostic (literal names, numbers). Labels are UI-only. No issue. |

---

## Permission additions

| Permission key | Purpose | Granted to |
|---|---|---|
| `admission.leads.student_form.generate` | Click "Show Student QR" button | super_admin, admission, admission_staff, admission_counselor |
| `admission.leads.student_form.revoke` | Manually kill an active token | super_admin, admission, admission_staff |
| `learners.profile.student_section.override` | Edit student-owned fields on desktop (audit-flagged) | super_admin, admission |

Add three rows to `lib/constants/permissions.ts` and grant via migration to
the listed roles.

---

## Test plan

### Unit tests (Jest)

- `student-form-write-whitelist.test.ts` — every column in each section is in
  the whitelist; columns NOT in the whitelist are stripped by the filter
  helper; `lifecycle_status`, `institution_id`, `is_profile_complete` are
  explicitly NOT writable
- HMAC sign/verify helper: 6 cases (valid, tampered payload, tampered
  signature, expired exp, missing exp, malformed base64)

### Integration tests (Vitest + Supabase test container)

- **Happy path**: convert lead → generate token → GET form → PATCH each
  section → PATCH final → assert `is_profile_complete=true`,
  `token.status='consumed'`, 3× `admission_lead_activities` rows
- **Token lockdown**: submit → second PATCH returns 410 → second GET returns 410
- **Regeneration race**: two parallel POSTs → exactly one ends up
  `status='active'`, other `superseded`
- **Whitelist enforcement**: PATCH with `lifecycle_status: 'admitted'` in body
  → field silently stripped, lifecycle unchanged
- **Expiry**: insert token with `expires_at` in past → GET returns 410, PATCH
  returns 410
- **Photo upload**: upload 4 MB JPEG → server compresses → URL written →
  PATCH section=basic carries URL → row updated
- **Override audit**: admission edits student-section field on desktop →
  `admission_lead_activities` row written with override actor

### Manual smoke (per environment promotion)

- 30-min countdown ticks correctly on QR dialog
- Tamil labels render with proper font on iOS Safari + Chrome Android
- Camera permission flow works on Android Chrome + iOS Safari
- Reload mid-section preserves prior sections, resumes at last unsaved step
- Admin polling auto-closes the QR dialog when student submits
- 410 page renders correctly in both languages
- Bilingual toggle persists across step navigations

### Security review checklist (one-time, pre-deploy)

- No `lifecycle_status`, `institution_id`, `created_by`, `created_at`,
  `application_id`, `is_profile_complete` in any whitelist
- HMAC secret loaded from server env, never client-bundled
- Service-role key never exposed to `/student-form/[token]` (only the API route)
- Rate limit on token generation AND on form GET
- All 3 student-form endpoints export `runtime = 'nodejs'`
- The 410 Gone page does NOT include any data from the learner row

---

## Migration plan

### New migrations

1. `supabase/migrations/<ts>_create_learner_self_fill_tokens.sql`
   - Table, indexes (including unique partial on active rows)
   - RLS: deny all (writes always go through service-role)
2. `supabase/migrations/<ts>_seed_student_form_permissions.sql`
   - Inserts 3 permission keys
   - Grants to listed roles via `custom_roles.permissions` JSONB merge

### Code changes to existing files

1. `app/api/admission/bridge/convert/route.ts:147`
   - `lifecycle_status: 'admitted'` → `'enquiry'`
   - **Downstream impact review**: any code that filters
     `lifecycle_status='admitted'` to identify converted leads needs to be
     updated. Suspected sites:
     - Any analytics/funnel report that counts "admitted today"
     - Any role-based dashboard tile
     - Any export filter
   - Plan task should explicitly list these as discovery work.
2. `lib/constants/permissions.ts`
   - Add 3 new permission keys
3. `app/(routes)/admission/leads/[id]/page.tsx`
   - Reveal `<ShowStudentQRButton/>` after Convert success
4. `app/(routes)/learners/enquiries/[id]/edit/_components/enquiry-form.tsx`
   - Header: `<ShowStudentQRButton/>` if `!is_profile_complete`
   - Per-tab status chips for student sections
   - Override flow on student-section edits (audit log)

---

## Rollout

### Phase 1 (Week 1) — Backend foundation
- Create `learner_self_fill_tokens` table + RLS
- Implement `StudentFormService` (generate/validate/save/submit/revoke)
- Implement HMAC sign/verify helpers
- Implement column whitelist helper
- Unit tests for whitelist and HMAC
- Change conversion bridge to `lifecycle_status='enquiry'` (gated behind a
  feature flag if a hard cutover is risky)

### Phase 2 (Week 1-2) — Public form route
- `/student-form/[token]` page + 4-step wizard
- API endpoints (GET, PATCH, photo upload)
- Integration tests for happy path + lockdown + race
- Bilingual labels (reuse Gate Entry conventions)
- Selfie capture component

### Phase 3 (Week 2) — Admission UI
- `<ShowStudentQRButton/>` + dialog with QR + countdown + polling
- Status chips on enquiry-form tabs
- Override flow with audit log

### Phase 4 (Week 3) — Permissions + smoke + ship
- Permission seed migration
- Manual smoke on real devices
- Security review checklist
- Deploy to staging → smoke → production

---

## Open questions / future work

These are intentionally out of scope for v1 but worth tracking:

1. **WhatsApp delivery as a secondary channel** — would need long-lived
   tokens, abuse rate limits, and a "did this token already submit?"
   pre-check on every load.
2. **Student correction window** — let student fix typos within 7 days via
   email link with elevated review by admission.
3. **Document upload phase 2** — Aadhaar, mark sheets via a separate flow
   that fires a verification step.
4. **Multi-tenant student form** — for institutions that want their own
   branded subdomain.
5. **Auto-conversion from gate-entry** — gate entries currently land in
   `admission_leads`; we may want a streamlined "Gate Entry → student form
   in 3 minutes" flow that combines both today.
6. **Accessibility audit** — WCAG 2.1 AA for the public form (screen reader,
   keyboard navigation, contrast). Not blocking v1 but should be on the
   roadmap.

---

## Appendix: Files touched (summary)

| Type | New | Modified |
|---|---|---|
| Migrations | 2 | 0 |
| API routes | 5 | 0 |
| Components | ~10 | 2 |
| Service modules | 2 | 0 |
| Bridge endpoint | 0 | 1 (`convert/route.ts`) |
| Permissions catalog | 0 | 1 |

Estimated implementation: ~3 weeks for one engineer at the existing project's
pace, including security review and manual smoke on devices.
