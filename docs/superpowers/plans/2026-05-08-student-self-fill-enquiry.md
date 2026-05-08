# Student Self-Fill Enquiry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let prospective students fill their own Basic + Academic + Contact sections via a counter-issued QR code on their phone, then admission completes Course/Accommodation/Finance via the existing enquiries edit page. Form locks permanently on submit.

**Architecture:** New table `learner_self_fill_tokens` holds 30-min HMAC-signed tokens. Public Next.js route at `/student-form/[token]` validates the token, then a service-role API endpoint writes only whitelisted columns to `learners_profiles`. Admission UI gets a `ShowStudentQRButton` reused from the lead detail page and the enquiries edit page. The bridge endpoint switches to `lifecycle_status='enquiry'`; the row flips to `'admitted'` only when admission saves the desktop edit.

**Tech Stack:** Next.js 14 App Router · TypeScript · Supabase (Postgres + Storage) · service-role for student-form writes · `qrcode` npm package (admission UI) · `browser-image-compression` (selfie compression) · HMAC-SHA256 for token signing · SHA-256 + pepper for token storage hashing.

**Spec reference:** `docs/superpowers/specs/2026-05-08-student-self-fill-enquiry-design.md` (commit `d76cf9e2d`).

---

## File map

### New files (in order of creation)

| Path | Responsibility |
|---|---|
| `supabase/migrations/<ts>_create_learner_self_fill_tokens.sql` | Table + indexes + RLS deny-all + comments |
| `supabase/migrations/<ts>_seed_student_form_permissions.sql` | Add 3 permission keys to listed roles |
| `lib/services/admission/student-form-write-whitelist.ts` | Per-section column whitelist constant |
| `lib/services/admission/student-form-hmac.ts` | sign/verify HMAC helpers + raw-token-to-hash |
| `lib/services/admission/student-form-service.ts` | Token CRUD + section save + final submit |
| `app/api/admission/student-form-tokens/route.ts` | POST generate token (admission) |
| `app/api/admission/student-form-tokens/[learner_id]/status/route.ts` | GET poll status |
| `app/api/admission/student-form-tokens/[token_id]/revoke/route.ts` | POST revoke |
| `app/api/student-form/[token]/route.ts` | GET current state + PATCH section / final |
| `app/api/student-form/[token]/photo/route.ts` | POST selfie upload to Storage |
| `app/student-form/[token]/page.tsx` | Public server component (validates, renders shell) |
| `app/student-form/[token]/_components/wizard-shell.tsx` | 4-step orchestrator + lang toggle |
| `app/student-form/[token]/_components/step-basic-details.tsx` | Step 1 |
| `app/student-form/[token]/_components/step-academic-information.tsx` | Step 2 |
| `app/student-form/[token]/_components/step-contact-details.tsx` | Step 3 |
| `app/student-form/[token]/_components/step-preview-confirm.tsx` | Step 4 (preview) |
| `app/student-form/[token]/_components/selfie-capture.tsx` | Camera + crop + compress |
| `app/student-form/[token]/_components/language-toggle.tsx` | Tamil / English flip |
| `app/student-form/[token]/submitted/page.tsx` | Success page after submit |
| `app/student-form/[token]/expired/page.tsx` | 410 Gone landing for expired/consumed/etc. |
| `components/admission/show-student-qr-button.tsx` | Button + dialog (used in 2 places) |
| `components/admission/student-form-qr-dialog.tsx` | QR canvas + countdown + polling |
| `app/(routes)/learners/enquiries/[id]/edit/_components/student-section-status-chip.tsx` | "Filled by student" / "Empty — Edit override" chip |
| `scripts/verify-student-form-hmac.ts` | tsx-runnable HMAC roundtrip verifier |
| `scripts/verify-student-form-whitelist.ts` | tsx-runnable whitelist enforcement verifier |

### Modified files

| Path | Change |
|---|---|
| `app/api/admission/bridge/convert/route.ts:147` | `lifecycle_status: 'admitted'` → `'enquiry'` |
| `app/(routes)/admission/leads/[id]/page.tsx` | Reveal `<ShowStudentQRButton/>` when `lead.learner_profile_id && !is_profile_complete` |
| `app/(routes)/learners/enquiries/[id]/edit/_components/enquiry-form.tsx` | Header button + per-tab status chips + override-edit confirm dialog |
| `lib/constants/permissions.ts` | Add 3 keys (`admission.leads.student_form.generate`, `.revoke`, `learners.profile.student_section.override`) |

### Reference files (read-only, used as patterns)

| Path | Why |
|---|---|
| `app/(routes)/admission/gate-entry/page.tsx` | Bilingual labels, mobile form patterns |
| `lib/services/admission/lead-service.ts` | Service-class shape, error patterns |
| `app/apply/[slug]/_components/public-form-client.tsx` | Existing public-form auth model (rate limit, honeypot) |
| `lib/utils/marathon-qr-generator.ts` | QR generation reference |
| `app/api/admission/bridge/convert/route.ts` | Service-role client pattern |

---

## Phase 1 — Database foundation

### Task 1: Create `learner_self_fill_tokens` table migration

**Files:**
- Create: `supabase/migrations/20260508120001_create_learner_self_fill_tokens.sql`

- [ ] **Step 1: Write the migration**

```sql
-- ============================================================================
-- 20260508120001 — Create learner_self_fill_tokens
-- ============================================================================
-- Per-learner HMAC-signed tokens that grant a single student a 30-minute
-- window to fill their Basic / Academic / Contact sections via the public
-- /student-form/[token] route. See design doc:
-- docs/superpowers/specs/2026-05-08-student-self-fill-enquiry-design.md
--
-- The token's raw value is signed (HMAC-SHA256) and shipped to the student's
-- phone via QR. The DB stores only a SHA-256 hash of the raw value (peppered
-- with a server-side secret). Lookup is by hash; the HMAC validates the
-- payload's authenticity.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.learner_self_fill_tokens (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    learner_profile_id uuid NOT NULL
                       REFERENCES public.learners_profiles(id) ON DELETE CASCADE,
    token_hash         text NOT NULL UNIQUE,
    status             text NOT NULL DEFAULT 'active'
                       CHECK (status IN ('active', 'consumed', 'expired', 'superseded')),
    expires_at         timestamptz NOT NULL,
    generated_by       uuid REFERENCES public.profiles(id),
    generated_at       timestamptz NOT NULL DEFAULT now(),
    consumed_at        timestamptz,
    superseded_by      uuid REFERENCES public.learner_self_fill_tokens(id),
    section_progress   jsonb NOT NULL DEFAULT '{
        "basic_done": false,
        "academic_done": false,
        "contact_done": false
    }'::jsonb
);

CREATE INDEX IF NOT EXISTS ix_lsft_active
    ON public.learner_self_fill_tokens (learner_profile_id)
    WHERE status = 'active';

CREATE INDEX IF NOT EXISTS ix_lsft_expiry
    ON public.learner_self_fill_tokens (expires_at)
    WHERE status = 'active';

-- One active token per learner; second concurrent insert fails 23505.
-- Application code catches that and supersedes the prior token.
CREATE UNIQUE INDEX IF NOT EXISTS ux_lsft_one_active_per_learner
    ON public.learner_self_fill_tokens (learner_profile_id)
    WHERE status = 'active';

-- All writes go through service-role (admission API + student-form API).
-- RLS is deny-all for the anon role; only service-role bypasses it.
ALTER TABLE public.learner_self_fill_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lsft_admin_read ON public.learner_self_fill_tokens;
CREATE POLICY lsft_admin_read
    ON public.learner_self_fill_tokens FOR SELECT
    USING (
      public.is_super_admin()
      OR public.user_has_permission('admission.leads.student_form.generate')
    );

-- No INSERT/UPDATE/DELETE policies — service-role bypasses RLS entirely.
```

- [ ] **Step 2: Apply via Supabase MCP**

Use the MCP `apply_migration` tool with `name='create_learner_self_fill_tokens'` and the SQL above as `query`.

- [ ] **Step 3: Verify the table and indexes were created**

Run via Supabase MCP `execute_sql`:
```sql
SELECT column_name, data_type, is_nullable
  FROM information_schema.columns
 WHERE table_schema = 'public'
   AND table_name = 'learner_self_fill_tokens'
 ORDER BY ordinal_position;
```
Expected: 10 rows including `id`, `learner_profile_id`, `token_hash`, `status`, `expires_at`, `generated_by`, `generated_at`, `consumed_at`, `superseded_by`, `section_progress`.

```sql
SELECT indexname FROM pg_indexes
 WHERE tablename = 'learner_self_fill_tokens'
 ORDER BY indexname;
```
Expected: `ix_lsft_active`, `ix_lsft_expiry`, `learner_self_fill_tokens_pkey`, `learner_self_fill_tokens_token_hash_key`, `ux_lsft_one_active_per_learner`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260508120001_create_learner_self_fill_tokens.sql
git commit -m "feat(student-form): create learner_self_fill_tokens table"
```

---

### Task 2: Change conversion bridge to set `lifecycle_status='enquiry'`

**Files:**
- Modify: `app/api/admission/bridge/convert/route.ts:147`

- [ ] **Step 1: Read the current value at line 147**

```bash
sed -n '145,150p' app/api/admission/bridge/convert/route.ts
```
Expected: `lifecycle_status: 'admitted',` on line 147.

- [ ] **Step 2: Make the change**

Replace `lifecycle_status: 'admitted',` with `lifecycle_status: 'enquiry',` in `app/api/admission/bridge/convert/route.ts`.

- [ ] **Step 3: Search the codebase for downstream consumers**

```bash
grep -rn "lifecycle_status.*admitted\|'admitted'.*lifecycle_status" app/ lib/ --include='*.ts' --include='*.tsx' | grep -v node_modules
```
Open each result and confirm whether it expects "freshly converted" leads to be `'admitted'`. If so, that consumer needs updating. The likely candidates are funnel reports, dashboard tiles, and analytics queries. **Do NOT silently change those — list them in step 5 for follow-up.**

- [ ] **Step 4: Verify the change in isolation**

```bash
git diff app/api/admission/bridge/convert/route.ts
```
Expected output: exactly one line changed (`'admitted'` → `'enquiry'`).

- [ ] **Step 5: Commit with a follow-up list in the message**

```bash
git add app/api/admission/bridge/convert/route.ts
git commit -m "$(cat <<'EOF'
refactor(admission/convert): land newly-converted leads in 'enquiry' state

The bridge endpoint previously flipped lifecycle_status straight to
'admitted' on conversion. Per the student-self-fill design, the row should
sit in 'enquiry' until BOTH the student fills their portion AND admission
completes course/accommodation/finance. The flip to 'admitted' is now the
responsibility of the desktop save (a later task in this plan wires that).

Downstream consumers that filter on lifecycle_status='admitted' for
"freshly converted leads" need a separate review — list to follow.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Add 3 permission keys to the catalog

**Files:**
- Modify: `lib/constants/permissions.ts`

- [ ] **Step 1: Find the admission permission group**

```bash
grep -n "admission.leads.delete\|admission.leads.edit" lib/constants/permissions.ts | head -5
```
Note the line number where admission keys are listed. New keys go right after `admission.leads.delete`.

- [ ] **Step 2: Add the three new keys**

In `lib/constants/permissions.ts`, locate the admission keys array and add (after the existing `admission.leads.delete` line):

```ts
      { key: 'admission.leads.student_form.generate', label: 'Generate Student Self-Fill QR' },
      { key: 'admission.leads.student_form.revoke',   label: 'Revoke Active Student Form Token' },
      { key: 'learners.profile.student_section.override', label: 'Override Student-Filled Sections' },
```

- [ ] **Step 3: Verify nothing else moved**

```bash
git diff lib/constants/permissions.ts
```
Expected: only 3 lines added, no other changes.

- [ ] **Step 4: Commit**

```bash
git add lib/constants/permissions.ts
git commit -m "feat(permissions): add 3 keys for student self-fill enquiry"
```

---

### Task 4: Migration to grant new permissions to existing roles

**Files:**
- Create: `supabase/migrations/20260508120002_grant_student_form_permissions.sql`

- [ ] **Step 1: Write the migration**

```sql
-- ============================================================================
-- 20260508120002 — Grant student-form permissions to admission-flavor roles
-- ============================================================================
-- Mirrors the per-key + per-role rationale from the design doc:
--   * student_form.generate → super_admin, admission, admission_staff,
--                              admission_counselor (anyone who can manage
--                              leads should be able to generate the QR)
--   * student_form.revoke   → super_admin, admission, admission_staff
--                              (counselors don't get revoke — admin-only)
--   * student_section.override → super_admin, admission only
--                              (audit-flagged write to student-owned cols)
-- ============================================================================

UPDATE public.custom_roles
   SET permissions = permissions || '{"admission.leads.student_form.generate": true}'::jsonb,
       updated_at  = now()
 WHERE role_key IN ('super_admin', 'admission', 'admission_staff', 'admission_counselor')
   AND COALESCE(permissions->>'admission.leads.student_form.generate', 'false') <> 'true';

UPDATE public.custom_roles
   SET permissions = permissions || '{"admission.leads.student_form.revoke": true}'::jsonb,
       updated_at  = now()
 WHERE role_key IN ('super_admin', 'admission', 'admission_staff')
   AND COALESCE(permissions->>'admission.leads.student_form.revoke', 'false') <> 'true';

UPDATE public.custom_roles
   SET permissions = permissions || '{"learners.profile.student_section.override": true}'::jsonb,
       updated_at  = now()
 WHERE role_key IN ('super_admin', 'admission')
   AND COALESCE(permissions->>'learners.profile.student_section.override', 'false') <> 'true';
```

- [ ] **Step 2: Apply via Supabase MCP**

Use `apply_migration` with `name='grant_student_form_permissions'`.

- [ ] **Step 3: Verify**

```sql
SELECT role_key,
       (permissions ? 'admission.leads.student_form.generate') AS gen,
       (permissions ? 'admission.leads.student_form.revoke')   AS rev,
       (permissions ? 'learners.profile.student_section.override') AS override
  FROM public.custom_roles
 WHERE role_key IN ('super_admin','admission','admission_staff','admission_counselor','expo_counselor');
```
Expected:
- super_admin: gen=t, rev=t, override=t
- admission: gen=t, rev=t, override=t
- admission_staff: gen=t, rev=t, override=f
- admission_counselor: gen=t, rev=f, override=f
- expo_counselor: all false

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260508120002_grant_student_form_permissions.sql
git commit -m "feat(permissions): grant student-form keys to admission roles"
```

---

## Phase 2 — Service-layer foundation (TDD via tsx scripts)

### Task 5: Implement column whitelist + verifier

**Files:**
- Create: `lib/services/admission/student-form-write-whitelist.ts`
- Create: `scripts/verify-student-form-whitelist.ts`

- [ ] **Step 1: Write the whitelist module**

```ts
// lib/services/admission/student-form-write-whitelist.ts
//
// The single security boundary for the student-form write path. The PATCH
// handler iterates only these column names; any field name in the request
// body that is NOT in this list is silently ignored. Columns explicitly
// excluded: lifecycle_status, institution_id, is_profile_complete,
// created_by, created_at, application_id — even a valid token cannot
// flip these via the student form.

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

export type StudentSection = keyof typeof STUDENT_WRITABLE_COLUMNS;

/**
 * Drop any keys in `payload` that aren't in the section's whitelist.
 * Returns a brand-new object — does not mutate input.
 */
export function filterToWhitelist(
  section: StudentSection,
  payload: Record<string, unknown>,
): Record<string, unknown> {
  const allowed = STUDENT_WRITABLE_COLUMNS[section] as readonly string[];
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(payload)) {
    if (allowed.includes(key)) out[key] = payload[key];
  }
  return out;
}

/**
 * Throw if any of these forbidden keys appear anywhere across all sections —
 * defense in depth against the function being called with the wrong section
 * and a forbidden key slipping through. Never callable with the response.
 */
export const FORBIDDEN_COLUMNS = [
  'lifecycle_status', 'institution_id', 'is_profile_complete',
  'created_by', 'created_at', 'application_id', 'id',
] as const;

export function assertNoForbidden(payload: Record<string, unknown>): void {
  for (const key of Object.keys(payload)) {
    if (FORBIDDEN_COLUMNS.includes(key as (typeof FORBIDDEN_COLUMNS)[number])) {
      throw new Error(`Forbidden column in student-form payload: ${key}`);
    }
  }
}
```

- [ ] **Step 2: Write the verifier (TDD harness)**

```ts
// scripts/verify-student-form-whitelist.ts
//
// Run via: npx tsx scripts/verify-student-form-whitelist.ts
// Exits 0 on pass, 1 on fail. CI-runnable.

import {
  STUDENT_WRITABLE_COLUMNS,
  filterToWhitelist,
  FORBIDDEN_COLUMNS,
  assertNoForbidden,
} from '../lib/services/admission/student-form-write-whitelist';

let failures = 0;
const assert = (cond: boolean, msg: string) => {
  if (!cond) { console.error('FAIL:', msg); failures++; }
  else      { console.log('OK:  ', msg); }
};

// 1. Each section has its expected canonical fields
assert(STUDENT_WRITABLE_COLUMNS.basic.includes('first_name'), 'basic includes first_name');
assert(STUDENT_WRITABLE_COLUMNS.basic.includes('father_mobile'), 'basic includes father_mobile');
assert(STUDENT_WRITABLE_COLUMNS.academic.includes('tenth_marks'), 'academic includes tenth_marks');
assert(STUDENT_WRITABLE_COLUMNS.contact.includes('student_mobile'), 'contact includes student_mobile');
assert(STUDENT_WRITABLE_COLUMNS.contact.includes('permanent_address_pin_code'), 'contact includes pin');

// 2. Forbidden columns are NEVER in any whitelist
for (const forbidden of FORBIDDEN_COLUMNS) {
  for (const section of ['basic', 'academic', 'contact'] as const) {
    assert(
      !(STUDENT_WRITABLE_COLUMNS[section] as readonly string[]).includes(forbidden),
      `${forbidden} NOT in ${section} whitelist`,
    );
  }
}

// 3. filterToWhitelist drops unknown keys
const filtered = filterToWhitelist('basic', {
  first_name: 'Boobalan',
  lifecycle_status: 'admitted',  // forbidden — must be dropped
  institution_id: 'evil-uuid',   // forbidden — must be dropped
  random_field: 'xyz',           // unknown — must be dropped
});
assert(filtered.first_name === 'Boobalan', 'first_name retained');
assert(!('lifecycle_status' in filtered), 'lifecycle_status dropped');
assert(!('institution_id' in filtered), 'institution_id dropped');
assert(!('random_field' in filtered), 'random_field dropped');
assert(Object.keys(filtered).length === 1, 'only first_name remains');

// 4. assertNoForbidden throws on forbidden keys
let threw = false;
try { assertNoForbidden({ lifecycle_status: 'admitted' }); }
catch { threw = true; }
assert(threw, 'assertNoForbidden throws on lifecycle_status');

threw = false;
try { assertNoForbidden({ first_name: 'Boobalan' }); }
catch { threw = true; }
assert(!threw, 'assertNoForbidden does NOT throw on first_name');

if (failures > 0) { console.error(`\n${failures} failure(s)`); process.exit(1); }
console.log('\nAll whitelist checks passed.');
```

- [ ] **Step 3: Run the verifier — must pass**

```bash
npx tsx scripts/verify-student-form-whitelist.ts
```
Expected: every line prints `OK:`, exit code 0, "All whitelist checks passed."

- [ ] **Step 4: Commit**

```bash
git add lib/services/admission/student-form-write-whitelist.ts scripts/verify-student-form-whitelist.ts
git commit -m "feat(student-form): column whitelist + tsx verifier"
```

---

### Task 6: Implement HMAC sign/verify helpers + verifier

**Files:**
- Create: `lib/services/admission/student-form-hmac.ts`
- Create: `scripts/verify-student-form-hmac.ts`

- [ ] **Step 1: Add the env vars to `.env.example`**

Open `.env.example` and append (or create if missing):

```
# Student self-fill enquiry — server-side secrets (never bundled to client)
STUDENT_FORM_HMAC_SECRET=replace-with-32-byte-random-string
STUDENT_FORM_PEPPER=replace-with-different-32-byte-random-string
```

- [ ] **Step 2: Write the HMAC module**

```ts
// lib/services/admission/student-form-hmac.ts
//
// Token signing: HMAC-SHA256 over a JSON payload {tid, exp, iat}.
// The signed value is what goes in the URL — the student's QR encodes
// `<base64url payload>.<base64url signature>`.
// The DB stores SHA-256 hash of the FULL signed value, peppered with a
// server secret. Lookup is by hash; HMAC validates authenticity.

import crypto from 'node:crypto';

interface TokenPayload {
  tid: string;   // token UUID (matches learner_self_fill_tokens.id)
  exp: number;   // unix seconds — must be > now
  iat: number;   // unix seconds — issued-at
}

const HMAC_ALG = 'sha256';
const HASH_ALG = 'sha256';

function getSecret(): string {
  const s = process.env.STUDENT_FORM_HMAC_SECRET;
  if (!s || s.length < 32) {
    throw new Error('STUDENT_FORM_HMAC_SECRET missing or too short (need >=32 chars)');
  }
  return s;
}

function getPepper(): string {
  const p = process.env.STUDENT_FORM_PEPPER;
  if (!p || p.length < 32) {
    throw new Error('STUDENT_FORM_PEPPER missing or too short (need >=32 chars)');
  }
  return p;
}

function b64urlEncode(buf: Buffer): string {
  return buf.toString('base64url');
}

function b64urlDecode(str: string): Buffer {
  return Buffer.from(str, 'base64url');
}

/**
 * Sign a payload. Returns the URL-safe token string.
 */
export function signToken(payload: TokenPayload): string {
  const json = JSON.stringify(payload);
  const payloadB64 = b64urlEncode(Buffer.from(json, 'utf8'));
  const sig = crypto.createHmac(HMAC_ALG, getSecret()).update(payloadB64).digest();
  const sigB64 = b64urlEncode(sig);
  return `${payloadB64}.${sigB64}`;
}

/**
 * Verify HMAC and return the payload. Throws on tamper / malformed / expired.
 */
export function verifyToken(token: string): TokenPayload {
  const parts = token.split('.');
  if (parts.length !== 2) throw new Error('malformed_token');
  const [payloadB64, sigB64] = parts;

  const expectedSig = crypto
    .createHmac(HMAC_ALG, getSecret())
    .update(payloadB64)
    .digest();
  const givenSig = b64urlDecode(sigB64);

  if (
    expectedSig.length !== givenSig.length ||
    !crypto.timingSafeEqual(expectedSig, givenSig)
  ) {
    throw new Error('bad_signature');
  }

  let payload: TokenPayload;
  try {
    payload = JSON.parse(b64urlDecode(payloadB64).toString('utf8'));
  } catch {
    throw new Error('bad_payload');
  }
  if (typeof payload.tid !== 'string' || typeof payload.exp !== 'number') {
    throw new Error('bad_payload');
  }

  const now = Math.floor(Date.now() / 1000);
  if (now >= payload.exp) throw new Error('expired');

  return payload;
}

/**
 * Hash a raw token (the full signed string) with the server pepper.
 * The DB stores this hash; lookup is by hash.
 */
export function hashRawToken(rawToken: string): string {
  const pepper = getPepper();
  return crypto.createHash(HASH_ALG).update(rawToken + pepper).digest('hex');
}
```

- [ ] **Step 3: Write the HMAC verifier**

```ts
// scripts/verify-student-form-hmac.ts
// Run via: npx tsx scripts/verify-student-form-hmac.ts

// Set fake env so the script runs without the real .env.local.
process.env.STUDENT_FORM_HMAC_SECRET = 'a'.repeat(48);
process.env.STUDENT_FORM_PEPPER = 'b'.repeat(48);

import {
  signToken,
  verifyToken,
  hashRawToken,
} from '../lib/services/admission/student-form-hmac';

let failures = 0;
const assert = (cond: boolean, msg: string) => {
  if (!cond) { console.error('FAIL:', msg); failures++; }
  else      { console.log('OK:  ', msg); }
};
const expectThrow = (fn: () => void, msg: string, contains?: string) => {
  try { fn(); console.error('FAIL:', msg, '(did not throw)'); failures++; }
  catch (e: any) {
    if (contains && !String(e.message).includes(contains)) {
      console.error('FAIL:', msg, '— wrong message:', e.message); failures++;
    } else { console.log('OK:  ', msg); }
  }
};

// 1. Sign + verify roundtrip
const now = Math.floor(Date.now() / 1000);
const payload = { tid: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', iat: now, exp: now + 1800 };
const token = signToken(payload);
const verified = verifyToken(token);
assert(verified.tid === payload.tid, 'roundtrip preserves tid');
assert(verified.exp === payload.exp, 'roundtrip preserves exp');

// 2. Tampered signature fails
expectThrow(() => verifyToken(token + 'X'), 'tampered signature throws', 'bad_signature');

// 3. Tampered payload fails
const [payloadB64, sigB64] = token.split('.');
const tamperedPayload = Buffer.from('{"tid":"forged","exp":99999999999}').toString('base64url');
expectThrow(
  () => verifyToken(`${tamperedPayload}.${sigB64}`),
  'tampered payload throws',
  'bad_signature',
);

// 4. Expired token fails
const expiredToken = signToken({ tid: payload.tid, iat: now - 3600, exp: now - 1800 });
expectThrow(() => verifyToken(expiredToken), 'expired token throws', 'expired');

// 5. Malformed (no dot) fails
expectThrow(() => verifyToken('not-a-token'), 'malformed token throws', 'malformed_token');

// 6. Hash is deterministic + 64 hex chars
const h1 = hashRawToken(token);
const h2 = hashRawToken(token);
assert(h1 === h2, 'hash deterministic');
assert(h1.length === 64 && /^[0-9a-f]+$/.test(h1), 'hash is 64-char hex');

// 7. Different tokens hash differently
const otherToken = signToken({ tid: 'different-uuid', iat: now, exp: now + 1800 });
assert(hashRawToken(otherToken) !== h1, 'different tokens hash differently');

if (failures > 0) { console.error(`\n${failures} failure(s)`); process.exit(1); }
console.log('\nAll HMAC checks passed.');
```

- [ ] **Step 4: Run the verifier — must pass**

```bash
npx tsx scripts/verify-student-form-hmac.ts
```
Expected: 7 cases all `OK:`, exit 0.

- [ ] **Step 5: Commit**

```bash
git add lib/services/admission/student-form-hmac.ts scripts/verify-student-form-hmac.ts .env.example
git commit -m "feat(student-form): HMAC sign/verify + tsx verifier"
```

---

### Task 7: Build `StudentFormService`

**Files:**
- Create: `lib/services/admission/student-form-service.ts`

- [ ] **Step 1: Write the service module**

```ts
// lib/services/admission/student-form-service.ts
//
// Server-only service: token CRUD + section save + final submit + revoke.
// Always uses the service-role Supabase client (never user-context) because
// the student-form write path bypasses RLS by design — the column whitelist
// is the security boundary.

import 'server-only';
import { createServiceRoleClient } from '@/lib/supabase/server';
import {
  STUDENT_WRITABLE_COLUMNS,
  filterToWhitelist,
  type StudentSection,
} from './student-form-write-whitelist';
import { signToken, hashRawToken } from './student-form-hmac';

const TOKEN_TTL_SECONDS = 30 * 60;

interface GenerateResult {
  token: string;        // raw signed token; goes in URL
  token_id: string;     // UUID; matches learner_self_fill_tokens.id
  expires_at: string;   // ISO
}

interface TokenContext {
  token_id: string;
  learner_profile_id: string;
  status: 'active' | 'consumed' | 'expired' | 'superseded';
  expires_at: string;
  consumed_at: string | null;
  section_progress: { basic_done: boolean; academic_done: boolean; contact_done: boolean };
  is_profile_complete: boolean;
}

export class StudentFormService {
  /**
   * Generate a fresh token for a learner. Marks any prior active token as
   * 'superseded'. Caller must have already checked the learner's
   * is_profile_complete is false.
   */
  static async generateToken(
    learnerProfileId: string,
    byUserId: string,
  ): Promise<GenerateResult> {
    const svc = createServiceRoleClient();

    // 1. Verify learner exists and is not yet complete
    const { data: learner, error: leadErr } = await (svc as any)
      .from('learners_profiles')
      .select('id, is_profile_complete')
      .eq('id', learnerProfileId)
      .single();
    if (leadErr || !learner) throw new Error('learner_not_found');
    if (learner.is_profile_complete) throw new Error('already_submitted');

    // 2. Supersede prior active token (if any)
    await (svc as any)
      .from('learner_self_fill_tokens')
      .update({ status: 'superseded' })
      .eq('learner_profile_id', learnerProfileId)
      .eq('status', 'active');

    // 3. Insert new token row (DB generates id)
    const expiresAt = new Date(Date.now() + TOKEN_TTL_SECONDS * 1000);
    const { data: row, error: insErr } = await (svc as any)
      .from('learner_self_fill_tokens')
      .insert({
        learner_profile_id: learnerProfileId,
        token_hash: 'placeholder',  // updated below; needed for unique constraint
        status: 'active',
        expires_at: expiresAt.toISOString(),
        generated_by: byUserId,
      })
      .select('id')
      .single();
    if (insErr || !row) throw new Error('token_insert_failed: ' + (insErr?.message ?? ''));

    // 4. Sign token + write hash back
    const now = Math.floor(Date.now() / 1000);
    const rawToken = signToken({ tid: row.id, iat: now, exp: now + TOKEN_TTL_SECONDS });
    const tokenHash = hashRawToken(rawToken);
    const { error: updErr } = await (svc as any)
      .from('learner_self_fill_tokens')
      .update({ token_hash: tokenHash })
      .eq('id', row.id);
    if (updErr) throw new Error('token_hash_write_failed: ' + updErr.message);

    return { token: rawToken, token_id: row.id, expires_at: expiresAt.toISOString() };
  }

  /**
   * Validate a raw token (HMAC + DB row + expiry + learner state).
   * Throws on any failure. Returns the rich context the API endpoints need.
   */
  static async validateToken(rawToken: string): Promise<TokenContext> {
    const { verifyToken } = await import('./student-form-hmac');
    const payload = verifyToken(rawToken);  // throws on bad sig / expired / malformed

    const tokenHash = hashRawToken(rawToken);
    const svc = createServiceRoleClient();

    const { data: row, error: rowErr } = await (svc as any)
      .from('learner_self_fill_tokens')
      .select('id, learner_profile_id, status, expires_at, consumed_at, section_progress')
      .eq('token_hash', tokenHash)
      .maybeSingle();
    if (rowErr) throw new Error('db_error');
    if (!row) throw new Error('token_not_found');
    if (row.id !== payload.tid) throw new Error('token_id_mismatch');
    if (row.status !== 'active') throw new Error(row.status);  // 'consumed' | 'superseded' | 'expired'

    // Lazy expiry check on read
    if (new Date(row.expires_at).getTime() < Date.now()) {
      await (svc as any)
        .from('learner_self_fill_tokens')
        .update({ status: 'expired' })
        .eq('id', row.id)
        .eq('status', 'active');
      throw new Error('expired');
    }

    // Learner-level lockdown — even active tokens fail if learner already submitted
    const { data: learner, error: lErr } = await (svc as any)
      .from('learners_profiles')
      .select('is_profile_complete')
      .eq('id', row.learner_profile_id)
      .single();
    if (lErr || !learner) throw new Error('learner_not_found');
    if (learner.is_profile_complete) throw new Error('consumed');

    return {
      token_id: row.id,
      learner_profile_id: row.learner_profile_id,
      status: row.status,
      expires_at: row.expires_at,
      consumed_at: row.consumed_at,
      section_progress: row.section_progress,
      is_profile_complete: learner.is_profile_complete,
    };
  }

  /**
   * Save one section's fields (auto-save during wizard navigation).
   * `final=false` means "continue" tap; `final=true` means final submit
   * (flips is_profile_complete=true, consumes the token, writes audit).
   */
  static async saveSection(
    rawToken: string,
    section: StudentSection,
    fields: Record<string, unknown>,
    final: boolean,
  ): Promise<void> {
    const ctx = await this.validateToken(rawToken);
    const svc = createServiceRoleClient();

    const allowedFields = filterToWhitelist(section, fields);
    if (Object.keys(allowedFields).length > 0) {
      const { error } = await (svc as any)
        .from('learners_profiles')
        .update(allowedFields)
        .eq('id', ctx.learner_profile_id);
      if (error) throw new Error('learner_update_failed: ' + error.message);
    }

    // Mark section_progress[<section>_done] = true on the token row
    const progressKey = `${section}_done`;
    const newProgress = { ...ctx.section_progress, [progressKey]: true };

    if (!final) {
      const { error } = await (svc as any)
        .from('learner_self_fill_tokens')
        .update({ section_progress: newProgress })
        .eq('id', ctx.token_id);
      if (error) throw new Error('progress_update_failed: ' + error.message);
      return;
    }

    // Final submit: consume token + flip is_profile_complete + audit log
    const { error: tokenErr } = await (svc as any)
      .from('learner_self_fill_tokens')
      .update({
        status: 'consumed',
        consumed_at: new Date().toISOString(),
        section_progress: newProgress,
      })
      .eq('id', ctx.token_id)
      .eq('status', 'active');
    if (tokenErr) throw new Error('token_consume_failed: ' + tokenErr.message);

    const { error: completeErr } = await (svc as any)
      .from('learners_profiles')
      .update({ is_profile_complete: true, updated_at: new Date().toISOString() })
      .eq('id', ctx.learner_profile_id);
    if (completeErr) throw new Error('complete_flag_failed: ' + completeErr.message);

    // 3 activity rows — one per section — for audit
    const activityRows = (['basic', 'academic', 'contact'] as const).map((s) => ({
      lead_id: null,  // student-form is post-conversion; no admission_lead context
      profile_id: ctx.learner_profile_id,
      activity_type: 'student_section_filled',
      description: `Filled ${s} section via student form`,
      metadata: { section: s, filled_via: 'qr_self_fill' },
    }));
    const { error: actErr } = await (svc as any)
      .from('admission_lead_activities')
      .insert(activityRows);
    if (actErr) console.warn('[StudentFormService] activity log failed:', actErr.message);
  }

  /**
   * Manually revoke an active token (admission action).
   */
  static async revokeToken(tokenId: string, byUserId: string): Promise<void> {
    const svc = createServiceRoleClient();
    const { error } = await (svc as any)
      .from('learner_self_fill_tokens')
      .update({ status: 'superseded' })
      .eq('id', tokenId)
      .eq('status', 'active');
    if (error) throw new Error('revoke_failed: ' + error.message);
    // (audit logging via admission_lead_activities is optional; admins
    // already see the token row in DB for forensics.)
  }
}
```

- [ ] **Step 2: TypeScript-check the file**

```bash
npx tsc --noEmit lib/services/admission/student-form-service.ts
```
Expected: no errors. If errors mention `createServiceRoleClient`, ensure that helper exists in `lib/supabase/server.ts` (it does — confirmed in the bridge endpoint at `app/api/admission/bridge/convert/route.ts:8`).

- [ ] **Step 3: Commit**

```bash
git add lib/services/admission/student-form-service.ts
git commit -m "feat(student-form): StudentFormService — generate/validate/save/submit/revoke"
```

---

## Phase 3 — API endpoints

### Task 8: `POST /api/admission/student-form-tokens` (admission generates QR token)

**Files:**
- Create: `app/api/admission/student-form-tokens/route.ts`

- [ ] **Step 1: Write the endpoint**

```ts
// app/api/admission/student-form-tokens/route.ts
//
// Admission-side: generate a fresh student-form token for a converted
// learner. Returns the URL the QR component encodes plus the expiry
// timestamp for the countdown UI.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';   // need crypto (HMAC) — not Edge

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { StudentFormService } from '@/lib/services/admission/student-form-service';

export async function POST(request: NextRequest): Promise<NextResponse> {
  // 1. Auth
  const supabase = await createClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (!user || authErr) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 2. Permission check (DB-side gate exists; this is the front-line)
  const { data: hasPerm } = await (supabase as any)
    .rpc('user_has_permission', { p_permission: 'admission.leads.student_form.generate' });
  if (!hasPerm) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // 3. Parse body
  let learnerProfileId: string;
  try {
    const body = await request.json();
    if (typeof body.learner_profile_id !== 'string' || !body.learner_profile_id) {
      return NextResponse.json({ error: 'learner_profile_id required' }, { status: 400 });
    }
    learnerProfileId = body.learner_profile_id;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // 4. Generate token
  try {
    const result = await StudentFormService.generateToken(learnerProfileId, user.id);
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? request.nextUrl.origin;
    return NextResponse.json({
      token_id: result.token_id,
      token_url: `${baseUrl}/student-form/${encodeURIComponent(result.token)}`,
      expires_at: result.expires_at,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown';
    if (msg === 'learner_not_found') {
      return NextResponse.json({ error: 'Learner not found' }, { status: 404 });
    }
    if (msg === 'already_submitted') {
      return NextResponse.json(
        { error: 'Form already submitted by this student' },
        { status: 409 },
      );
    }
    console.error('[student-form-tokens POST]', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
```

- [ ] **Step 2: Smoke via curl**

```bash
# (with dev server running at http://localhost:3000 and a logged-in cookie)
curl -X POST http://localhost:3000/api/admission/student-form-tokens \
  -H 'Content-Type: application/json' \
  -H "Cookie: <copy from browser>" \
  -d '{"learner_profile_id":"<a real learner uuid>"}' | jq
```
Expected: `{"token_id":"...","token_url":"http://localhost:3000/student-form/...","expires_at":"2026-05-08T..."}`.

- [ ] **Step 3: Commit**

```bash
git add app/api/admission/student-form-tokens/route.ts
git commit -m "feat(api): POST /api/admission/student-form-tokens"
```

---

### Task 9: `GET /api/admission/student-form-tokens/[learner_id]/status` (polling)

**Files:**
- Create: `app/api/admission/student-form-tokens/[learner_id]/status/route.ts`

- [ ] **Step 1: Write the endpoint**

```ts
// Polling endpoint for the QR dialog — returns the latest token status
// for a learner so the dialog can auto-close when student submits.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ learner_id: string }> },
): Promise<NextResponse> {
  const { learner_id } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const svc = createServiceRoleClient();
  const { data: token } = await (svc as any)
    .from('learner_self_fill_tokens')
    .select('id, status, expires_at, consumed_at, section_progress')
    .eq('learner_profile_id', learner_id)
    .order('generated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  // also report learner is_profile_complete for completeness
  const { data: learner } = await (svc as any)
    .from('learners_profiles')
    .select('is_profile_complete')
    .eq('id', learner_id)
    .maybeSingle();

  return NextResponse.json({
    token: token ?? null,
    is_profile_complete: learner?.is_profile_complete ?? false,
  });
}
```

- [ ] **Step 2: Smoke**

```bash
curl http://localhost:3000/api/admission/student-form-tokens/<learner-uuid>/status \
  -H "Cookie: <copy from browser>" | jq
```
Expected: `{"token":{"status":"active",...},"is_profile_complete":false}`.

- [ ] **Step 3: Commit**

```bash
git add app/api/admission/student-form-tokens/\[learner_id\]/status/route.ts
git commit -m "feat(api): GET .../tokens/[learner_id]/status (polling)"
```

---

### Task 10: `POST /api/admission/student-form-tokens/[token_id]/revoke`

**Files:**
- Create: `app/api/admission/student-form-tokens/[token_id]/revoke/route.ts`

- [ ] **Step 1: Write the endpoint**

```ts
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { StudentFormService } from '@/lib/services/admission/student-form-service';

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ token_id: string }> },
): Promise<NextResponse> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: hasPerm } = await (supabase as any)
    .rpc('user_has_permission', { p_permission: 'admission.leads.student_form.revoke' });
  if (!hasPerm) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { token_id } = await params;
  try {
    await StudentFormService.revokeToken(token_id, user.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[token revoke]', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
```

- [ ] **Step 2: Smoke**

```bash
# generate a token first, then revoke it
TOKEN_ID="<from previous generate response>"
curl -X POST http://localhost:3000/api/admission/student-form-tokens/$TOKEN_ID/revoke \
  -H "Cookie: <browser cookie>" | jq
# Then verify status flipped:
psql -c "SELECT status FROM learner_self_fill_tokens WHERE id='$TOKEN_ID';"
```
Expected: `status='superseded'`.

- [ ] **Step 3: Commit**

```bash
git add app/api/admission/student-form-tokens/\[token_id\]/revoke/route.ts
git commit -m "feat(api): POST .../tokens/[token_id]/revoke"
```

---

### Task 11: `GET / PATCH /api/student-form/[token]` (public, student-side)

**Files:**
- Create: `app/api/student-form/[token]/route.ts`

- [ ] **Step 1: Write the endpoint**

```ts
// app/api/student-form/[token]/route.ts
// Public — no auth. HMAC validates the token. Service-role writes; the
// column whitelist is the security boundary.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { StudentFormService } from '@/lib/services/admission/student-form-service';
import {
  STUDENT_WRITABLE_COLUMNS,
  type StudentSection,
} from '@/lib/services/admission/student-form-write-whitelist';

const READABLE_COLUMNS = [
  ...STUDENT_WRITABLE_COLUMNS.basic,
  ...STUDENT_WRITABLE_COLUMNS.academic,
  ...STUDENT_WRITABLE_COLUMNS.contact,
  // Pre-filled fields from conversion bridge — student sees but doesn't edit:
  'institution_id',  // for display ("You are admitting to <institution>")
];

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
): Promise<NextResponse> {
  const { token } = await params;
  let ctx;
  try {
    ctx = await StudentFormService.validateToken(decodeURIComponent(token));
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'invalid';
    return mapErrorToResponse(msg);
  }

  const svc = createServiceRoleClient();
  const { data: learner, error } = await (svc as any)
    .from('learners_profiles')
    .select(READABLE_COLUMNS.join(','))
    .eq('id', ctx.learner_profile_id)
    .single();
  if (error || !learner) {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }

  return NextResponse.json({
    learner,
    section_progress: ctx.section_progress,
    expires_at: ctx.expires_at,
  });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
): Promise<NextResponse> {
  const { token } = await params;
  let body: { section: StudentSection; fields: Record<string, unknown>; final: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (!['basic', 'academic', 'contact'].includes(body.section)) {
    return NextResponse.json({ error: 'Invalid section' }, { status: 400 });
  }

  try {
    await StudentFormService.saveSection(
      decodeURIComponent(token),
      body.section,
      body.fields ?? {},
      body.final === true,
    );
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'invalid';
    return mapErrorToResponse(msg);
  }
}

function mapErrorToResponse(msg: string): NextResponse {
  if (['malformed_token', 'bad_signature', 'bad_payload', 'token_not_found', 'token_id_mismatch'].includes(msg)) {
    return NextResponse.json({ error: 'invalid_token' }, { status: 401 });
  }
  if (['expired', 'consumed', 'superseded'].includes(msg)) {
    return NextResponse.json({ error: msg }, { status: 410 });
  }
  console.error('[student-form]', msg);
  return NextResponse.json({ error: 'server_error' }, { status: 500 });
}
```

- [ ] **Step 2: Smoke — GET**

```bash
TOKEN_URL="<paste from generate response>"
TOKEN="${TOKEN_URL##*/}"
curl "http://localhost:3000/api/student-form/$TOKEN" | jq
```
Expected: `{"learner":{"first_name":"...","last_name":"...",...},"section_progress":{"basic_done":false,...},"expires_at":"..."}`.

- [ ] **Step 3: Smoke — PATCH section=basic, final=false**

```bash
curl -X PATCH "http://localhost:3000/api/student-form/$TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"section":"basic","fields":{"first_name":"Verified","date_of_birth":"2008-01-15"},"final":false}'
```
Expected: `{"ok":true}`. Then:

```sql
SELECT first_name, date_of_birth FROM learners_profiles WHERE id='<learner_id>';
SELECT section_progress FROM learner_self_fill_tokens WHERE id='<token_id>';
```
Expected: name updated; `section_progress.basic_done = true`.

- [ ] **Step 4: Smoke — Whitelist enforcement**

```bash
curl -X PATCH "http://localhost:3000/api/student-form/$TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"section":"basic","fields":{"lifecycle_status":"admitted","institution_id":"evil-uuid","first_name":"Hacker"},"final":false}'
```
Expected: `{"ok":true}` — but verify:
```sql
SELECT first_name, lifecycle_status, institution_id FROM learners_profiles WHERE id='<learner_id>';
```
`first_name` should now be `'Hacker'`; `lifecycle_status` should still be `'enquiry'` (NOT `'admitted'`); `institution_id` unchanged.

- [ ] **Step 5: Commit**

```bash
git add app/api/student-form/\[token\]/route.ts
git commit -m "feat(api): GET/PATCH /api/student-form/[token] (public)"
```

---

### Task 12: `POST /api/student-form/[token]/photo` (selfie upload)

**Files:**
- Create: `app/api/student-form/[token]/photo/route.ts`

- [ ] **Step 1: Ensure the avatars bucket exists**

Apply this migration via Supabase MCP (`apply_migration` with name `create_student_avatars_bucket`):

```sql
-- Create a public-read bucket for student selfies; writes via service-role only.
INSERT INTO storage.buckets (id, name, public)
VALUES ('student-avatars', 'student-avatars', true)
ON CONFLICT (id) DO NOTHING;
```

Verify:
```sql
SELECT id, public FROM storage.buckets WHERE id='student-avatars';
```

- [ ] **Step 2: Write the endpoint**

```ts
// app/api/student-form/[token]/photo/route.ts

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { StudentFormService } from '@/lib/services/admission/student-form-service';

const MAX_PRE_COMPRESS_BYTES = 5 * 1024 * 1024;  // 5 MB hard limit

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
): Promise<NextResponse> {
  const { token } = await params;

  let ctx;
  try {
    ctx = await StudentFormService.validateToken(decodeURIComponent(token));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 410 });
  }

  const formData = await request.formData();
  const file = formData.get('photo');
  if (!(file instanceof Blob)) {
    return NextResponse.json({ error: 'photo field missing' }, { status: 400 });
  }
  if (file.size > MAX_PRE_COMPRESS_BYTES) {
    return NextResponse.json({ error: 'Photo too large' }, { status: 413 });
  }

  const svc = createServiceRoleClient();
  const path = `${ctx.learner_profile_id}/${ctx.token_id}.jpg`;
  const { error: upErr } = await (svc as any).storage
    .from('student-avatars')
    .upload(path, file, { upsert: true, contentType: 'image/jpeg' });
  if (upErr) {
    return NextResponse.json({ error: 'upload_failed: ' + upErr.message }, { status: 500 });
  }
  const { data: urlData } = await (svc as any).storage
    .from('student-avatars')
    .getPublicUrl(path);

  return NextResponse.json({ photo_url: urlData.publicUrl });
}
```

- [ ] **Step 3: Smoke**

```bash
curl -X POST "http://localhost:3000/api/student-form/$TOKEN/photo" \
  -F "photo=@/path/to/test.jpg"
```
Expected: `{"photo_url":"https://<project>.supabase.co/storage/v1/object/public/student-avatars/<learner-id>/<token-id>.jpg"}`.

- [ ] **Step 4: Commit**

```bash
git add app/api/student-form/\[token\]/photo/route.ts
git add supabase/migrations/*_create_student_avatars_bucket.sql
git commit -m "feat(api): POST /api/student-form/[token]/photo + storage bucket"
```

---

## Phase 4 — Admission UI

### Task 13: `ShowStudentQRButton` + `StudentFormQRDialog`

**Files:**
- Create: `components/admission/show-student-qr-button.tsx`
- Create: `components/admission/student-form-qr-dialog.tsx`

- [ ] **Step 1: Install qrcode**

```bash
npm install qrcode
npm install --save-dev @types/qrcode
```

- [ ] **Step 2: Write the dialog**

```tsx
// components/admission/student-form-qr-dialog.tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  learnerProfileId: string;
}

interface TokenData {
  token_url: string;
  expires_at: string;
  token_id: string;
}

export function StudentFormQRDialog({ open, onOpenChange, learnerProfileId }: Props) {
  const [token, setToken] = useState<TokenData | null>(null);
  const [generating, setGenerating] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Generate on open
  useEffect(() => {
    if (!open || token) return;
    void generate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Render QR + countdown when token available
  useEffect(() => {
    if (!token || !canvasRef.current) return;
    QRCode.toCanvas(canvasRef.current, token.token_url, { width: 280, margin: 1 });
    const expiry = new Date(token.expires_at).getTime();
    const tick = setInterval(() => {
      const left = Math.max(0, Math.floor((expiry - Date.now()) / 1000));
      setSecondsLeft(left);
      if (left === 0) clearInterval(tick);
    }, 1000);
    return () => clearInterval(tick);
  }, [token]);

  // Poll for student submission
  useEffect(() => {
    if (!token) return;
    pollRef.current = setInterval(async () => {
      const res = await fetch(`/api/admission/student-form-tokens/${learnerProfileId}/status`);
      const data = await res.json();
      if (data.is_profile_complete || data.token?.status === 'consumed') {
        toast.success('Student submitted the form');
        onOpenChange(false);
      }
    }, 5000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [token, learnerProfileId, onOpenChange]);

  async function generate() {
    setGenerating(true);
    try {
      const res = await fetch('/api/admission/student-form-tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ learner_profile_id: learnerProfileId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'failed');
      setToken(data);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to generate QR');
    } finally {
      setGenerating(false);
    }
  }

  const mm = Math.floor(secondsLeft / 60);
  const ss = String(secondsLeft % 60).padStart(2, '0');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Student Self-Fill QR</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col items-center gap-3 py-4">
          {generating || !token ? (
            <div className="flex h-[280px] w-[280px] items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : (
            <>
              <canvas ref={canvasRef} />
              <div className="text-sm text-muted-foreground">
                Expires in <span className="tabular-nums font-medium">{mm}:{ss}</span>
              </div>
              <p className="text-xs text-muted-foreground text-center max-w-[280px]">
                Ask the student to scan with their phone camera. The form will
                close automatically when they submit.
              </p>
            </>
          )}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm" onClick={generate} disabled={generating}>
            <RefreshCw className="h-4 w-4 mr-1" /> Regenerate
          </Button>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 3: Write the button**

```tsx
// components/admission/show-student-qr-button.tsx
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ScanLine } from 'lucide-react';
import { StudentFormQRDialog } from './student-form-qr-dialog';

interface Props {
  learnerProfileId: string;
  /** When true, the button is disabled with a tooltip */
  alreadySubmitted?: boolean;
  size?: 'sm' | 'default';
}

export function ShowStudentQRButton({ learnerProfileId, alreadySubmitted, size = 'sm' }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        size={size}
        onClick={() => setOpen(true)}
        disabled={alreadySubmitted}
        title={alreadySubmitted ? 'Student form already submitted' : 'Show QR for student to scan'}
        className="gap-1"
      >
        <ScanLine className="h-4 w-4" />
        Show Student QR
      </Button>
      <StudentFormQRDialog
        open={open}
        onOpenChange={setOpen}
        learnerProfileId={learnerProfileId}
      />
    </>
  );
}
```

- [ ] **Step 4: TypeScript-check**

```bash
npx tsc --noEmit
```
Expected: no new errors related to these files.

- [ ] **Step 5: Commit**

```bash
git add components/admission/show-student-qr-button.tsx components/admission/student-form-qr-dialog.tsx package.json package-lock.json
git commit -m "feat(admission): ShowStudentQRButton + QR dialog with countdown + polling"
```

---

### Task 14: Wire `ShowStudentQRButton` into the lead detail page

**Files:**
- Modify: `app/(routes)/admission/leads/[id]/page.tsx`

- [ ] **Step 1: Find the existing "Convert to Admitted" button block**

```bash
grep -n 'Convert to Admitted' app/\(routes\)/admission/leads/\[id\]/page.tsx
```
Note the line range. The button appears around lines 1492–1502 (after `lead.learner_profile_id` check).

- [ ] **Step 2: Add the import at the top of the file**

In `app/(routes)/admission/leads/[id]/page.tsx`, add to the import block:

```tsx
import { ShowStudentQRButton } from '@/components/admission/show-student-qr-button';
```

- [ ] **Step 3: Add the button next to "View Learner Profile"**

Find the conditional that renders `View Learner Profile` (existing code). Replace its block with:

```tsx
{lead.learner_profile_id ? (
  <>
    <Button variant="outline" size="sm" asChild>
      <a href={`/learners/profiles/${lead.learner_profile_id}`}>
        <ExternalLink className="h-4 w-4 mr-2" />
        View Learner Profile
      </a>
    </Button>
    <ShowStudentQRButton
      learnerProfileId={lead.learner_profile_id}
      alreadySubmitted={(lead as any).is_profile_complete === true}
      size="sm"
    />
  </>
) : (
  <Button
    variant="default"
    size="sm"
    onClick={handleConvertToLearner}
    disabled={isConverting}
    className="bg-purple-600 hover:bg-purple-700"
  >
    <UserPlus className={`h-4 w-4 mr-2 ${isConverting ? 'animate-pulse' : ''}`} />
    {isConverting ? 'Converting...' : 'Convert to Admitted'}
  </Button>
)}
```

(The `is_profile_complete` cast is because the lead query may not yet pull this column from the joined learner row; if your existing lead query joins `learners_profiles`, expose `is_profile_complete` on the returned shape. Otherwise, after step 4 of this task, query it directly via the GET status endpoint or join in the lead service.)

- [ ] **Step 4: Smoke in the browser**

Open a converted lead's detail page. The "Show Student QR" button should appear next to "View Learner Profile". Clicking it opens the dialog with a generating spinner → QR + countdown.

- [ ] **Step 5: Commit**

```bash
git add app/\(routes\)/admission/leads/\[id\]/page.tsx
git commit -m "feat(admission/leads): wire ShowStudentQRButton on lead detail page"
```

---

### Task 15: Wire `ShowStudentQRButton` + status chips into enquiry-form

**Files:**
- Modify: `app/(routes)/learners/enquiries/[id]/edit/_components/enquiry-form.tsx`
- Create: `app/(routes)/learners/enquiries/[id]/edit/_components/student-section-status-chip.tsx`

- [ ] **Step 1: Write the status chip component**

```tsx
// app/(routes)/learners/enquiries/[id]/edit/_components/student-section-status-chip.tsx
'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Check, X } from 'lucide-react';

interface Props {
  filled: boolean;
  filledAt: string | null;
  filledBy: 'student' | 'admission_override' | null;
  canOverride: boolean;
  onOverrideClick?: () => void;
}

export function StudentSectionStatusChip({
  filled, filledAt, filledBy, canOverride, onOverrideClick,
}: Props) {
  if (filled) {
    const timestamp = filledAt
      ? new Date(filledAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
      : '—';
    const label = filledBy === 'admission_override'
      ? `Filled by admission (override) on ${timestamp}`
      : `Filled by student via QR on ${timestamp}`;
    return (
      <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">
        <Check className="h-3 w-3 mr-1" /> {label}
      </Badge>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
        <X className="h-3 w-3 mr-1" /> Empty
      </Badge>
      {canOverride && onOverrideClick && (
        <Button size="sm" variant="outline" onClick={onOverrideClick}>
          Edit override
        </Button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Add the QR button to the enquiry-form header**

In `app/(routes)/learners/enquiries/[id]/edit/_components/enquiry-form.tsx`, locate the form header (around the title or breadcrumb). Add the import:

```tsx
import { ShowStudentQRButton } from '@/components/admission/show-student-qr-button';
import { StudentSectionStatusChip } from './student-section-status-chip';
```

Then in the JSX, near the form header (above the tabs):

```tsx
<div className="flex items-center justify-end gap-2 pb-2">
  <ShowStudentQRButton
    learnerProfileId={learnerId}  // existing prop on this form
    alreadySubmitted={learner?.is_profile_complete === true}
  />
</div>
```

- [ ] **Step 3: Add status chips on student-section tabs**

For each of the three student-fillable tab headers (Basic, Academic, Contact), append a `<StudentSectionStatusChip/>` next to the tab label or in the tab content header. Example for the Basic Details tab content:

```tsx
<TabsContent value="basic-details">
  <div className="flex justify-between items-center mb-2">
    <h3 className="text-base font-semibold">Basic Details / அடிப்படை விவரங்கள்</h3>
    <StudentSectionStatusChip
      filled={basicSectionFilled /* derive from activity log or section_progress */}
      filledAt={basicSectionFilledAt}
      filledBy={basicSectionFilledBy}
      canOverride={canEditBasicOverride}
      onOverrideClick={() => setOverrideDialogOpen('basic')}
    />
  </div>
  {/* existing BasicDetailsSection... */}
</TabsContent>
```

The "filled / filledAt / filledBy" data comes from a small new query: read the most recent `admission_lead_activities` row with `activity_type='student_section_filled'` and `metadata->>'section'='basic'`. Add this as a `useQuery` near the other queries in `enquiry-form.tsx`.

- [ ] **Step 4: Smoke in the browser**

Open `/learners/enquiries/<learner-id>/edit`. Verify:
- The "Show Student QR" button appears at the top of the form (only when `is_profile_complete=false`).
- Each student-section tab has either a green "Filled by student" badge or an amber "Empty" badge with an "Edit override" button.

- [ ] **Step 5: Commit**

```bash
git add app/\(routes\)/learners/enquiries/\[id\]/edit/_components/enquiry-form.tsx
git add app/\(routes\)/learners/enquiries/\[id\]/edit/_components/student-section-status-chip.tsx
git commit -m "feat(enquiries/edit): student-form QR button + per-section status chips"
```

---

### Task 16: Override-edit confirm dialog + audit logging

**Files:**
- Modify: `app/(routes)/learners/enquiries/[id]/edit/_components/enquiry-form.tsx`

- [ ] **Step 1: Add the confirm dialog**

When the user clicks "Edit override" on a student section, show a confirm dialog before letting them edit fields. Add to the form's JSX:

```tsx
<AlertDialog open={!!overrideDialog} onOpenChange={(o) => !o && setOverrideDialog(null)}>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>Override student-filled section?</AlertDialogTitle>
      <AlertDialogDescription>
        You're editing fields the student should fill themselves. This action
        will be recorded in the audit log.
      </AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel>Cancel</AlertDialogCancel>
      <AlertDialogAction
        onClick={() => {
          setSectionOverrideMode((prev) => ({ ...prev, [overrideDialog!]: true }));
          setOverrideDialog(null);
        }}
      >
        Yes, fill on behalf
      </AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

Where `sectionOverrideMode` is a new `useState<{basic:boolean,academic:boolean,contact:boolean}>` controlling whether each student section is editable on this load.

- [ ] **Step 2: On save with override, write the audit log**

In the form's `onSubmit` handler, after successful save, for each section where `sectionOverrideMode[section]===true`, insert one `admission_lead_activities` row:

```tsx
for (const section of Object.keys(sectionOverrideMode) as Array<keyof typeof sectionOverrideMode>) {
  if (sectionOverrideMode[section]) {
    await supabase.from('admission_lead_activities').insert({
      profile_id: learnerId,
      activity_type: 'student_section_filled',
      description: `Filled ${section} section as admission override`,
      metadata: { section, filled_via: 'admission_override' },
    });
  }
}
```

- [ ] **Step 3: Smoke**

On a learner row where student hasn't filled, click "Edit override" → confirm → fill a Basic Details field → Save. Then check:
```sql
SELECT activity_type, metadata FROM admission_lead_activities
 WHERE profile_id='<learner-id>' ORDER BY created_at DESC LIMIT 5;
```
Expected: row with `metadata.filled_via='admission_override'`.

- [ ] **Step 4: Commit**

```bash
git add app/\(routes\)/learners/enquiries/\[id\]/edit/_components/enquiry-form.tsx
git commit -m "feat(enquiries/edit): override-edit confirm dialog + audit log"
```

---

## Phase 5 — Public student form

### Task 17: `/student-form/[token]/page.tsx` server component

**Files:**
- Create: `app/student-form/[token]/page.tsx`
- Create: `app/student-form/[token]/expired/page.tsx`

- [ ] **Step 1: Write the expired/already-submitted page**

```tsx
// app/student-form/[token]/expired/page.tsx
export const dynamic = 'force-static';

export default function ExpiredPage({ searchParams }: { searchParams: Promise<{ reason?: string }> }) {
  // The reason is one of: expired | consumed | superseded | invalid_token
  // Render a friendly bilingual message; deliberately leak no learner data.
  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-muted/30">
      <div className="max-w-md text-center space-y-3">
        <div className="text-3xl">⚠️</div>
        <h1 className="text-xl font-semibold">
          This QR is no longer valid
        </h1>
        <p className="text-base text-muted-foreground">
          இந்த QR செல்லாது
        </p>
        <p className="text-sm text-muted-foreground">
          Please ask the admission desk to scan a new QR for you.<br/>
          மீண்டும் ஒரு புதிய QR கேட்கவும்.
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Write the main page**

```tsx
// app/student-form/[token]/page.tsx
//
// Public, no auth. Validates the token server-side before rendering the
// wizard. If validation fails, redirect to the /expired page (deliberately
// leaks no learner data).

import { redirect } from 'next/navigation';
import { StudentFormService } from '@/lib/services/admission/student-form-service';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { WizardShell } from './_components/wizard-shell';
import {
  STUDENT_WRITABLE_COLUMNS,
} from '@/lib/services/admission/student-form-write-whitelist';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const READABLE_COLUMNS = [
  ...STUDENT_WRITABLE_COLUMNS.basic,
  ...STUDENT_WRITABLE_COLUMNS.academic,
  ...STUDENT_WRITABLE_COLUMNS.contact,
];

export default async function StudentFormPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  let ctx;
  try {
    ctx = await StudentFormService.validateToken(decodeURIComponent(token));
  } catch (e) {
    const reason = e instanceof Error ? e.message : 'invalid';
    redirect(`/student-form/${encodeURIComponent(token)}/expired?reason=${reason}`);
  }

  const svc = createServiceRoleClient();
  const { data: learner } = await (svc as any)
    .from('learners_profiles')
    .select(READABLE_COLUMNS.join(','))
    .eq('id', ctx.learner_profile_id)
    .single();

  return (
    <WizardShell
      token={decodeURIComponent(token)}
      learner={learner ?? {}}
      sectionProgress={ctx.section_progress}
      expiresAt={ctx.expires_at}
    />
  );
}
```

- [ ] **Step 3: Smoke**

After all components are built (later tasks), open `/student-form/<a-real-token>` in a browser. Without a valid token, you should be redirected to `/expired?reason=invalid_token` showing the bilingual error.

- [ ] **Step 4: Commit**

```bash
git add app/student-form/\[token\]/page.tsx app/student-form/\[token\]/expired/page.tsx
git commit -m "feat(student-form): public route + expired-token landing"
```

---

### Task 18: `WizardShell` — 4-step orchestrator

**Files:**
- Create: `app/student-form/[token]/_components/wizard-shell.tsx`
- Create: `app/student-form/[token]/_components/language-toggle.tsx`

- [ ] **Step 1: Write the language toggle**

```tsx
// app/student-form/[token]/_components/language-toggle.tsx
'use client';

import { Button } from '@/components/ui/button';

export type Language = 'en' | 'ta';

interface Props {
  value: Language;
  onChange: (l: Language) => void;
}

export function LanguageToggle({ value, onChange }: Props) {
  return (
    <div className="flex border rounded-md overflow-hidden text-xs">
      <button
        type="button"
        className={`px-3 py-1 ${value === 'en' ? 'bg-primary text-primary-foreground' : 'bg-background'}`}
        onClick={() => onChange('en')}
      >
        English
      </button>
      <button
        type="button"
        className={`px-3 py-1 ${value === 'ta' ? 'bg-primary text-primary-foreground' : 'bg-background'}`}
        onClick={() => onChange('ta')}
      >
        தமிழ்
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Write the wizard shell**

```tsx
// app/student-form/[token]/_components/wizard-shell.tsx
'use client';

import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { LanguageToggle, type Language } from './language-toggle';
import { StepBasicDetails } from './step-basic-details';
import { StepAcademicInformation } from './step-academic-information';
import { StepContactDetails } from './step-contact-details';
import { StepPreviewConfirm } from './step-preview-confirm';

type Step = 1 | 2 | 3 | 4;

interface Props {
  token: string;
  learner: Record<string, any>;
  sectionProgress: { basic_done: boolean; academic_done: boolean; contact_done: boolean };
  expiresAt: string;
}

export function WizardShell({ token, learner, sectionProgress, expiresAt }: Props) {
  const [lang, setLang] = useState<Language>('en');
  const [data, setData] = useState<Record<string, any>>(learner);
  const [step, setStep] = useState<Step>(
    !sectionProgress.basic_done ? 1
    : !sectionProgress.academic_done ? 2
    : !sectionProgress.contact_done ? 3
    : 4
  );
  const [submitting, setSubmitting] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);

  useEffect(() => {
    const expiry = new Date(expiresAt).getTime();
    const tick = setInterval(() => {
      const left = Math.max(0, Math.floor((expiry - Date.now()) / 1000));
      setSecondsLeft(left);
      if (left === 0) {
        clearInterval(tick);
        toast.error('Your QR has expired. Please ask admission for a new one.');
        window.location.href = `/student-form/${encodeURIComponent(token)}/expired?reason=expired`;
      }
    }, 1000);
    return () => clearInterval(tick);
  }, [expiresAt, token]);

  async function saveSection(section: 'basic' | 'academic' | 'contact', fields: Record<string, any>, final = false) {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/student-form/${encodeURIComponent(token)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ section, fields, final }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? 'save failed');
      }
      setData((prev) => ({ ...prev, ...fields }));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleStepContinue(section: 'basic' | 'academic' | 'contact', fields: Record<string, any>) {
    try {
      await saveSection(section, fields, false);
      setStep((s) => (s + 1) as Step);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save');
    }
  }

  async function handleFinalSubmit() {
    try {
      // The PATCH with final=true also performs the final write of section=contact
      // (or any), but we already auto-saved on each Continue tap, so this is
      // just the lock. We'll send section='contact' with empty fields to cover
      // the constraint; backend's filterToWhitelist drops nothing because empty.
      await saveSection('contact', {}, true);
      window.location.href = `/student-form/${encodeURIComponent(token)}/submitted`;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Submit failed');
    }
  }

  const mm = Math.floor(secondsLeft / 60);
  const ss = String(secondsLeft % 60).padStart(2, '0');

  return (
    <div className="min-h-screen bg-background pb-12">
      <header className="sticky top-0 bg-background border-b px-4 py-3 flex items-center justify-between">
        <div className="text-sm font-medium">
          Step {step} of 4
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs tabular-nums text-muted-foreground">
            {mm}:{ss}
          </span>
          <LanguageToggle value={lang} onChange={setLang} />
        </div>
      </header>

      <main className="max-w-md mx-auto p-4 space-y-4">
        {step === 1 && (
          <StepBasicDetails
            lang={lang}
            data={data}
            token={token}
            onContinue={(fields) => handleStepContinue('basic', fields)}
            submitting={submitting}
          />
        )}
        {step === 2 && (
          <StepAcademicInformation
            lang={lang}
            data={data}
            onContinue={(fields) => handleStepContinue('academic', fields)}
            onBack={() => setStep(1)}
            submitting={submitting}
          />
        )}
        {step === 3 && (
          <StepContactDetails
            lang={lang}
            data={data}
            onContinue={(fields) => handleStepContinue('contact', fields)}
            onBack={() => setStep(2)}
            submitting={submitting}
          />
        )}
        {step === 4 && (
          <StepPreviewConfirm
            lang={lang}
            data={data}
            onSubmit={handleFinalSubmit}
            onEditBasic={() => setStep(1)}
            onEditAcademic={() => setStep(2)}
            onEditContact={() => setStep(3)}
            submitting={submitting}
          />
        )}
      </main>
    </div>
  );
}
```

- [ ] **Step 3: Commit (the steps are stubbed for now; subsequent tasks fill them)**

```bash
git add app/student-form/\[token\]/_components/wizard-shell.tsx
git add app/student-form/\[token\]/_components/language-toggle.tsx
git commit -m "feat(student-form): WizardShell + language toggle"
```

---

### Task 19: `StepBasicDetails`

**Files:**
- Create: `app/student-form/[token]/_components/step-basic-details.tsx`
- Create: `app/student-form/[token]/_components/selfie-capture.tsx`

- [ ] **Step 1: Install image compression library**

```bash
npm install browser-image-compression
```

- [ ] **Step 2: Write the selfie capture component**

```tsx
// app/student-form/[token]/_components/selfie-capture.tsx
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Camera, Loader2 } from 'lucide-react';
import imageCompression from 'browser-image-compression';
import toast from 'react-hot-toast';

interface Props {
  token: string;
  initialUrl?: string;
  onUploaded: (url: string) => void;
}

export function SelfieCapture({ token, initialUrl, onUploaded }: Props) {
  const [url, setUrl] = useState(initialUrl ?? '');
  const [busy, setBusy] = useState(false);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Photo too large — try again. / படம் மிகப் பெரியது');
      return;
    }
    setBusy(true);
    try {
      const compressed = await imageCompression(file, {
        maxSizeMB: 0.5, maxWidthOrHeight: 720, useWebWorker: true,
      });
      const fd = new FormData();
      fd.append('photo', compressed);
      const res = await fetch(`/api/student-form/${encodeURIComponent(token)}/photo`, {
        method: 'POST',
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'upload failed');
      setUrl(data.photo_url);
      onUploaded(data.photo_url);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      {url && (
        <div className="flex justify-center">
          <img src={url} alt="" className="h-32 w-32 rounded-full object-cover border" />
        </div>
      )}
      <label className="block">
        <input
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleFileChange}
          className="hidden"
          disabled={busy}
        />
        <Button asChild type="button" variant="outline" className="w-full h-12" disabled={busy}>
          <span>
            {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Camera className="h-4 w-4 mr-2" />}
            {url ? 'Change photo / படம் மாற்று' : 'Add photo / படம் சேர்'}
          </span>
        </Button>
      </label>
    </div>
  );
}
```

- [ ] **Step 3: Write StepBasicDetails**

```tsx
// app/student-form/[token]/_components/step-basic-details.tsx
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { SelfieCapture } from './selfie-capture';
import type { Language } from './language-toggle';

interface Props {
  lang: Language;
  data: Record<string, any>;
  token: string;
  onContinue: (fields: Record<string, any>) => void;
  submitting: boolean;
}

const T = {
  title:        { en: 'Basic Details',  ta: 'அடிப்படை விவரங்கள்' },
  first_name:   { en: 'First name',     ta: 'முதல் பெயர்' },
  last_name:    { en: 'Last name',      ta: 'கடைசி பெயர்' },
  dob:          { en: 'Date of birth',  ta: 'பிறந்த தேதி' },
  gender:       { en: 'Gender',         ta: 'பாலினம்' },
  religion:     { en: 'Religion',       ta: 'மதம்' },
  community:    { en: 'Community',      ta: 'சமூகம்' },
  caste:        { en: 'Caste',          ta: 'ஜாதி' },
  father_name:  { en: 'Father name',    ta: 'தந்தை பெயர்' },
  father_phone: { en: 'Father phone',   ta: 'தந்தை கைபேசி' },
  mother_name:  { en: 'Mother name',    ta: 'தாய் பெயர்' },
  mother_phone: { en: 'Mother phone',   ta: 'தாய் கைபேசி' },
  income:       { en: 'Annual income',  ta: 'ஆண்டு வருமானம்' },
  cont:         { en: 'Continue',       ta: 'தொடரவும்' },
};
const lbl = (k: keyof typeof T, lang: Language) => `${T[k].en} / ${T[k].ta}`;

export function StepBasicDetails({ lang, data, token, onContinue, submitting }: Props) {
  const [v, setV] = useState({
    first_name: data.first_name ?? '',
    last_name: data.last_name ?? '',
    date_of_birth: data.date_of_birth ?? '',
    gender: data.gender ?? '',
    religion: data.religion ?? '',
    community: data.community ?? '',
    caste: data.caste ?? '',
    student_photo_url: data.student_photo_url ?? '',
    father_name: data.father_name ?? '',
    father_mobile: data.father_mobile ?? '',
    mother_name: data.mother_name ?? '',
    mother_mobile: data.mother_mobile ?? '',
    annual_income: data.annual_income ?? '',
  });
  const set = <K extends keyof typeof v>(k: K, val: typeof v[K]) => setV((p) => ({ ...p, [k]: val }));

  return (
    <form onSubmit={(e) => { e.preventDefault(); onContinue(v); }} className="space-y-3">
      <h2 className="text-lg font-semibold">{T.title.en} / {T.title.ta}</h2>

      <SelfieCapture
        token={token}
        initialUrl={v.student_photo_url}
        onUploaded={(url) => set('student_photo_url', url)}
      />

      <Label>{lbl('first_name', lang)}</Label>
      <Input value={v.first_name} onChange={(e) => set('first_name', e.target.value)} required className="h-12" />
      <Label>{lbl('last_name', lang)}</Label>
      <Input value={v.last_name} onChange={(e) => set('last_name', e.target.value)} className="h-12" />
      <Label>{lbl('dob', lang)}</Label>
      <Input type="date" value={v.date_of_birth} onChange={(e) => set('date_of_birth', e.target.value)} className="h-12" />
      <Label>{lbl('gender', lang)}</Label>
      <Select value={v.gender} onValueChange={(s) => set('gender', s)}>
        <SelectTrigger className="h-12"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="male">Male / ஆண்</SelectItem>
          <SelectItem value="female">Female / பெண்</SelectItem>
          <SelectItem value="other">Other / பிற</SelectItem>
        </SelectContent>
      </Select>
      <Label>{lbl('religion', lang)}</Label>
      <Input value={v.religion} onChange={(e) => set('religion', e.target.value)} className="h-12" />
      <Label>{lbl('community', lang)}</Label>
      <Input value={v.community} onChange={(e) => set('community', e.target.value)} className="h-12" />
      <Label>{lbl('caste', lang)}</Label>
      <Input value={v.caste} onChange={(e) => set('caste', e.target.value)} className="h-12" />

      <div className="border-t my-2 pt-2">
        <h3 className="text-sm font-medium">Parents / பெற்றோர்</h3>
      </div>
      <Label>{lbl('father_name', lang)}</Label>
      <Input value={v.father_name} onChange={(e) => set('father_name', e.target.value)} className="h-12" />
      <Label>{lbl('father_phone', lang)}</Label>
      <Input value={v.father_mobile} onChange={(e) => set('father_mobile', e.target.value)} inputMode="numeric" className="h-12" />
      <Label>{lbl('mother_name', lang)}</Label>
      <Input value={v.mother_name} onChange={(e) => set('mother_name', e.target.value)} className="h-12" />
      <Label>{lbl('mother_phone', lang)}</Label>
      <Input value={v.mother_mobile} onChange={(e) => set('mother_mobile', e.target.value)} inputMode="numeric" className="h-12" />
      <Label>{lbl('income', lang)}</Label>
      <Input value={v.annual_income} onChange={(e) => set('annual_income', e.target.value)} inputMode="numeric" className="h-12" />

      <Button type="submit" className="w-full h-12" disabled={submitting}>
        {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
        {T.cont.en} / {T.cont.ta}
      </Button>
    </form>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add app/student-form/\[token\]/_components/step-basic-details.tsx app/student-form/\[token\]/_components/selfie-capture.tsx package.json package-lock.json
git commit -m "feat(student-form): Step 1 — Basic Details + selfie capture"
```

---

### Task 20: `StepAcademicInformation`

**Files:**
- Create: `app/student-form/[token]/_components/step-academic-information.tsx`

- [ ] **Step 1: Write the step**

```tsx
// app/student-form/[token]/_components/step-academic-information.tsx
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import type { Language } from './language-toggle';

interface Props {
  lang: Language;
  data: Record<string, any>;
  onContinue: (fields: Record<string, any>) => void;
  onBack: () => void;
  submitting: boolean;
}

const SCHOLARSHIP_OPTIONS = [
  { value: 'none', label: 'None / ஏதுமில்லை' },
  { value: 'first_graduate', label: 'First Graduate / முதல் பட்டதாரி' },
  { value: 'minority', label: 'Minority / சிறுபான்மையினர்' },
  { value: 'sc_st', label: 'SC/ST' },
  { value: 'other', label: 'Other / பிற' },
];

const ENTRY_TYPE_OPTIONS = [
  { value: 'FIRST YEAR',  label: 'First Year / முதலாமாண்டு' },
  { value: 'LATERAL',     label: 'Lateral / பக்கவழி' },
  { value: 'TRANSFER',    label: 'Transfer / பரிமாற்றம்' },
];

export function StepAcademicInformation({ lang, data, onContinue, onBack, submitting }: Props) {
  const [v, setV] = useState({
    tenth_marks: data.tenth_marks ?? {},
    twelfth_marks: data.twelfth_marks ?? {},
    twelfth_group: data.twelfth_group ?? '',
    last_school: data.last_school ?? '',
    board_of_study: data.board_of_study ?? '',
    neet_roll_number: data.neet_roll_number ?? '',
    neet_score: data.neet_score ?? '',
    counseling_applied: data.counseling_applied ?? false,
    counseling_number: data.counseling_number ?? '',
    scholarship_type: data.scholarship_type ?? '',
    quota: data.quota ?? '',
    entry_type: data.entry_type ?? '',
  });
  const set = <K extends keyof typeof v>(k: K, val: typeof v[K]) => setV((p) => ({ ...p, [k]: val }));

  // 10th/12th marks: minimal (max+obtained → percentage auto-calc)
  const set10 = (key: string, value: string) => set('tenth_marks', { ...v.tenth_marks, [key]: value });
  const set12 = (key: string, value: string) => set('twelfth_marks', { ...v.twelfth_marks, [key]: value });

  return (
    <form onSubmit={(e) => { e.preventDefault(); onContinue(v); }} className="space-y-3">
      <h2 className="text-lg font-semibold">Academic Information / கல்வி விவரங்கள்</h2>

      <Label>10th Marks (Max / Obtained) / 10ஆம் வகுப்பு மதிப்பெண்</Label>
      <div className="grid grid-cols-2 gap-2">
        <Input placeholder="Max" inputMode="numeric"
          value={v.tenth_marks.max ?? ''} onChange={(e) => set10('max', e.target.value)} className="h-12" />
        <Input placeholder="Obtained" inputMode="numeric"
          value={v.tenth_marks.obtained ?? ''} onChange={(e) => set10('obtained', e.target.value)} className="h-12" />
      </div>

      <Label>Last School / கடந்த பள்ளி</Label>
      <Input value={v.last_school} onChange={(e) => set('last_school', e.target.value)} className="h-12" />

      <Label>Board of Study / வாரியம்</Label>
      <Input value={v.board_of_study} onChange={(e) => set('board_of_study', e.target.value)} className="h-12" />

      <Label>12th Marks (Max / Obtained) / 12ஆம் வகுப்பு மதிப்பெண்</Label>
      <div className="grid grid-cols-2 gap-2">
        <Input placeholder="Max" inputMode="numeric"
          value={v.twelfth_marks.max ?? ''} onChange={(e) => set12('max', e.target.value)} className="h-12" />
        <Input placeholder="Obtained" inputMode="numeric"
          value={v.twelfth_marks.obtained ?? ''} onChange={(e) => set12('obtained', e.target.value)} className="h-12" />
      </div>

      <Label>12th Group / 12ஆம் வகுப்பு பிரிவு</Label>
      <Input value={v.twelfth_group} onChange={(e) => set('twelfth_group', e.target.value)} className="h-12" />

      <Label>NEET Roll Number / NEET எண்</Label>
      <Input value={v.neet_roll_number} onChange={(e) => set('neet_roll_number', e.target.value)} className="h-12" />

      <Label>NEET Score</Label>
      <Input value={v.neet_score} onChange={(e) => set('neet_score', e.target.value)} inputMode="numeric" className="h-12" />

      <Label>Scholarship Type / உதவித்தொகை வகை</Label>
      <Select value={v.scholarship_type} onValueChange={(s) => set('scholarship_type', s)}>
        <SelectTrigger className="h-12"><SelectValue /></SelectTrigger>
        <SelectContent>
          {SCHOLARSHIP_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
        </SelectContent>
      </Select>

      <Label>Quota / ஒதுக்கீடு</Label>
      <Input value={v.quota} onChange={(e) => set('quota', e.target.value)} className="h-12" />

      <Label>Entry Type / சேர்க்கை வகை</Label>
      <Select value={v.entry_type} onValueChange={(s) => set('entry_type', s)}>
        <SelectTrigger className="h-12"><SelectValue /></SelectTrigger>
        <SelectContent>
          {ENTRY_TYPE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
        </SelectContent>
      </Select>

      <div className="flex gap-2 pt-2">
        <Button type="button" variant="outline" className="flex-1 h-12" onClick={onBack}>Back / பின் செல்</Button>
        <Button type="submit" className="flex-1 h-12" disabled={submitting}>
          {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Continue / தொடரவும்
        </Button>
      </div>
    </form>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add app/student-form/\[token\]/_components/step-academic-information.tsx
git commit -m "feat(student-form): Step 2 — Academic Information"
```

---

### Task 21: `StepContactDetails`

**Files:**
- Create: `app/student-form/[token]/_components/step-contact-details.tsx`

- [ ] **Step 1: Write the step**

```tsx
// app/student-form/[token]/_components/step-contact-details.tsx
'use client';

import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { indianStates, getDistrictsByState, getTaluksByDistrict } from '@/lib/data/locations';
import type { Language } from './language-toggle';

interface Props {
  lang: Language;
  data: Record<string, any>;
  onContinue: (fields: Record<string, any>) => void;
  onBack: () => void;
  submitting: boolean;
}

export function StepContactDetails({ lang, data, onContinue, onBack, submitting }: Props) {
  const [v, setV] = useState({
    student_mobile: data.student_mobile ?? '',
    student_email: data.student_email ?? '',
    permanent_address_street: data.permanent_address_street ?? '',
    permanent_address_state: data.permanent_address_state ?? 'tamil_nadu',
    permanent_address_district: data.permanent_address_district ?? '',
    permanent_address_taluk: data.permanent_address_taluk ?? '',
    permanent_address_pin_code: data.permanent_address_pin_code ?? '',
  });
  const set = <K extends keyof typeof v>(k: K, val: typeof v[K]) => setV((p) => ({ ...p, [k]: val }));

  const districts = useMemo(
    () => getDistrictsByState(v.permanent_address_state),
    [v.permanent_address_state],
  );
  const taluks = useMemo(
    () => getTaluksByDistrict(v.permanent_address_state, v.permanent_address_district),
    [v.permanent_address_state, v.permanent_address_district],
  );

  return (
    <form onSubmit={(e) => { e.preventDefault(); onContinue(v); }} className="space-y-3">
      <h2 className="text-lg font-semibold">Contact Details / தொடர்பு விவரங்கள்</h2>

      <Label>Student Mobile / கைபேசி எண்</Label>
      <Input value={v.student_mobile} onChange={(e) => set('student_mobile', e.target.value)}
             inputMode="numeric" required className="h-12" />

      <Label>Email (optional) / மின்னஞ்சல்</Label>
      <Input type="email" value={v.student_email} onChange={(e) => set('student_email', e.target.value)} className="h-12" />

      <Label>Address / முகவரி</Label>
      <Input value={v.permanent_address_street} onChange={(e) => set('permanent_address_street', e.target.value)} className="h-12" />

      <Label>State / மாநிலம்</Label>
      <Select value={v.permanent_address_state} onValueChange={(s) => {
        set('permanent_address_state', s);
        set('permanent_address_district', '');
        set('permanent_address_taluk', '');
      }}>
        <SelectTrigger className="h-12"><SelectValue /></SelectTrigger>
        <SelectContent>
          {indianStates.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
        </SelectContent>
      </Select>

      <Label>District / மாவட்டம்</Label>
      <Select value={v.permanent_address_district} onValueChange={(s) => {
        set('permanent_address_district', s);
        set('permanent_address_taluk', '');
      }}>
        <SelectTrigger className="h-12"><SelectValue placeholder="Pick state first" /></SelectTrigger>
        <SelectContent>
          {districts.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
        </SelectContent>
      </Select>

      <Label>Taluk / வட்டம்</Label>
      <Select value={v.permanent_address_taluk} onValueChange={(s) => set('permanent_address_taluk', s)}>
        <SelectTrigger className="h-12"><SelectValue placeholder="Pick district first" /></SelectTrigger>
        <SelectContent>
          {taluks.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
        </SelectContent>
      </Select>

      <Label>Pincode / அஞ்சல் குறியீடு</Label>
      <Input value={v.permanent_address_pin_code} onChange={(e) => set('permanent_address_pin_code', e.target.value)}
             inputMode="numeric" className="h-12" />

      <div className="flex gap-2 pt-2">
        <Button type="button" variant="outline" className="flex-1 h-12" onClick={onBack}>Back / பின் செல்</Button>
        <Button type="submit" className="flex-1 h-12" disabled={submitting}>
          {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Continue / தொடரவும்
        </Button>
      </div>
    </form>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add app/student-form/\[token\]/_components/step-contact-details.tsx
git commit -m "feat(student-form): Step 3 — Contact Details with address cascade"
```

---

### Task 22: `StepPreviewConfirm`

**Files:**
- Create: `app/student-form/[token]/_components/step-preview-confirm.tsx`

- [ ] **Step 1: Write the preview step**

```tsx
// app/student-form/[token]/_components/step-preview-confirm.tsx
'use client';

import { Button } from '@/components/ui/button';
import { Loader2, Pencil } from 'lucide-react';
import type { Language } from './language-toggle';

interface Props {
  lang: Language;
  data: Record<string, any>;
  onSubmit: () => void;
  onEditBasic: () => void;
  onEditAcademic: () => void;
  onEditContact: () => void;
  submitting: boolean;
}

export function StepPreviewConfirm({ data, onSubmit, onEditBasic, onEditAcademic, onEditContact, submitting }: Props) {
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Review your details / உங்கள் விவரங்களை சரிபார்க்கவும்</h2>
      <p className="text-sm text-muted-foreground">
        Tap Edit to fix anything before final submit. Once submitted, you cannot change it.
      </p>

      <Section title="Basic Details / அடிப்படை" onEdit={onEditBasic}>
        {data.student_photo_url && (
          <div><img src={data.student_photo_url} alt="" className="h-20 w-20 rounded-full object-cover" /></div>
        )}
        <Row label="Name" value={`${data.first_name ?? ''} ${data.last_name ?? ''}`} />
        <Row label="DOB" value={data.date_of_birth} />
        <Row label="Gender" value={data.gender} />
        <Row label="Religion / Community / Caste" value={[data.religion, data.community, data.caste].filter(Boolean).join(' · ')} />
        <Row label="Father" value={`${data.father_name ?? ''} (${data.father_mobile ?? ''})`} />
        <Row label="Mother" value={`${data.mother_name ?? ''} (${data.mother_mobile ?? ''})`} />
        <Row label="Annual income" value={data.annual_income} />
      </Section>

      <Section title="Academic / கல்வி" onEdit={onEditAcademic}>
        <Row label="10th Max / Obtained" value={`${data.tenth_marks?.max ?? ''} / ${data.tenth_marks?.obtained ?? ''}`} />
        <Row label="12th Max / Obtained" value={`${data.twelfth_marks?.max ?? ''} / ${data.twelfth_marks?.obtained ?? ''}`} />
        <Row label="12th Group" value={data.twelfth_group} />
        <Row label="Last School" value={data.last_school} />
        <Row label="Board" value={data.board_of_study} />
        <Row label="NEET Roll / Score" value={`${data.neet_roll_number ?? ''} / ${data.neet_score ?? ''}`} />
        <Row label="Scholarship" value={data.scholarship_type} />
        <Row label="Quota / Entry" value={`${data.quota ?? ''} · ${data.entry_type ?? ''}`} />
      </Section>

      <Section title="Contact / தொடர்பு" onEdit={onEditContact}>
        <Row label="Mobile" value={data.student_mobile} />
        <Row label="Email" value={data.student_email} />
        <Row label="Address" value={data.permanent_address_street} />
        <Row label="State / District / Taluk" value={[data.permanent_address_state, data.permanent_address_district, data.permanent_address_taluk].filter(Boolean).join(' · ')} />
        <Row label="Pincode" value={data.permanent_address_pin_code} />
      </Section>

      <Button onClick={onSubmit} disabled={submitting} className="w-full h-12 bg-emerald-600 hover:bg-emerald-700">
        {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
        Confirm & Submit / உறுதிசெய்க
      </Button>
      <p className="text-xs text-center text-muted-foreground">
        After submit, this form cannot be reopened. / சமர்ப்பித்த பிறகு திருத்த முடியாது.
      </p>
    </div>
  );
}

function Section({ title, onEdit, children }: { title: string; onEdit: () => void; children: React.ReactNode }) {
  return (
    <div className="rounded-md border bg-card">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <h3 className="text-sm font-medium">{title}</h3>
        <Button variant="ghost" size="sm" onClick={onEdit} className="h-7 gap-1">
          <Pencil className="h-3 w-3" /> Edit
        </Button>
      </div>
      <div className="px-3 py-2 space-y-1.5 text-sm">{children}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value?: any }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right">{value || '—'}</span>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add app/student-form/\[token\]/_components/step-preview-confirm.tsx
git commit -m "feat(student-form): Step 4 — Preview & Confirm"
```

---

### Task 23: Submitted success page

**Files:**
- Create: `app/student-form/[token]/submitted/page.tsx`

- [ ] **Step 1: Write the page**

```tsx
// app/student-form/[token]/submitted/page.tsx
export const dynamic = 'force-static';

export default function SubmittedPage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-emerald-50">
      <div className="max-w-md text-center space-y-4">
        <div className="text-5xl">✔️</div>
        <h1 className="text-2xl font-semibold text-emerald-700">
          Form submitted!
        </h1>
        <p className="text-base text-emerald-700">
          படிவம் சமர்ப்பிக்கப்பட்டது!
        </p>
        <p className="text-sm text-muted-foreground">
          Please return your phone to the admission desk.<br/>
          உங்கள் கைபேசியை அலுவலகத்தில் ஒப்படைக்கவும்.
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add app/student-form/\[token\]/submitted/page.tsx
git commit -m "feat(student-form): submitted success page"
```

---

## Phase 6 — End-to-end smoke + security review

### Task 24: End-to-end smoke (manual)

- [ ] **Step 1: Convert a fresh test lead**

In a browser logged in as `admission_staff`:
1. Open `/admission/leads/<id>` for a lead in `funnel_stage='new'`
2. Click "Convert to Admitted"
3. Verify the row in DB:
```sql
SELECT lifecycle_status, is_profile_complete FROM learners_profiles
 WHERE id = (SELECT learner_profile_id FROM admission_leads WHERE id='<lead-id>');
```
Expected: `lifecycle_status='enquiry'`, `is_profile_complete=false`.

- [ ] **Step 2: Show QR + scan with phone**

1. Click "Show Student QR"
2. Modal opens, QR appears, countdown ticks
3. On a separate phone, scan the QR with the camera
4. Form opens at Step 1

- [ ] **Step 3: Fill all 4 steps and submit**

1. Fill Basic Details + add a selfie (verify camera launches)
2. Continue → Step 2 (Academic) → fill, Continue
3. Step 3 (Contact) → fill, Continue
4. Step 4 (Preview) → review → Confirm & Submit
5. Browser shows success page in both languages

- [ ] **Step 4: Verify all writes landed**

```sql
SELECT first_name, last_name, student_photo_url, is_profile_complete, lifecycle_status
  FROM learners_profiles WHERE id='<learner-id>';
SELECT status, consumed_at, section_progress FROM learner_self_fill_tokens
 WHERE learner_profile_id='<learner-id>' ORDER BY generated_at DESC LIMIT 1;
SELECT activity_type, metadata FROM admission_lead_activities
 WHERE profile_id='<learner-id>' AND activity_type='student_section_filled';
```
Expected:
- learner has all student fields populated, `is_profile_complete=true`, `lifecycle_status='enquiry'` (admission hasn't saved yet)
- token: `status='consumed'`, `consumed_at` set, all 3 `section_progress` keys true
- 3 activity rows for basic/academic/contact, all `metadata.filled_via='qr_self_fill'`

- [ ] **Step 5: Try to reopen the same QR — verify lockdown**

Reopen the QR URL in a fresh browser tab. Expected: redirect to `/expired?reason=consumed` with bilingual lockdown message.

- [ ] **Step 6: Admission completes the row**

1. As admission, open `/learners/enquiries/<learner-id>/edit`
2. Verify: 3 student-section tabs show green "Filled by student" chips with timestamps
3. Fill Course Selection + Accommodation tabs
4. Click Save
5. Verify in DB:
```sql
SELECT lifecycle_status, fee_items FROM learners_profiles WHERE id='<learner-id>';
```
Expected: `lifecycle_status='admitted'`, `fee_items` populated (auto-resolved).

- [ ] **Step 7: Document smoke results in a PR comment or commit message**

If everything passed, no commit needed. If something failed, fix in a new task and re-run from Step 1.

---

### Task 25: Security review checklist

- [ ] **Step 1: Whitelist hardness — verify forbidden columns are NEVER writable via student endpoint**

```bash
TOKEN_URL="<generate a fresh token>"
TOKEN="${TOKEN_URL##*/}"

curl -X PATCH "http://localhost:3000/api/student-form/$TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"section":"basic","fields":{"lifecycle_status":"admitted","institution_id":"00000000-0000-0000-0000-000000000000","is_profile_complete":true,"first_name":"Hacker"},"final":false}'
```

Then:
```sql
SELECT first_name, lifecycle_status, institution_id, is_profile_complete
  FROM learners_profiles WHERE id='<learner-id>';
```

Expected: `first_name='Hacker'`, all three forbidden fields UNCHANGED. If any forbidden field changed, the whitelist is broken — STOP and fix before proceeding.

- [ ] **Step 2: HMAC secret never leaks to client bundle**

```bash
npm run build
grep -r "STUDENT_FORM_HMAC_SECRET\|STUDENT_FORM_PEPPER" .next/static/ 2>&1 | head
```
Expected: NO matches. If matches found, the secret is bundled — fix the import (likely a client component imported the HMAC module).

- [ ] **Step 3: Service-role key never leaks**

```bash
grep -r "SUPABASE_SERVICE_ROLE_KEY" .next/static/ 2>&1 | head
```
Expected: NO matches.

- [ ] **Step 4: All endpoints export `runtime='nodejs'`**

```bash
grep -L "runtime = 'nodejs'" \
  app/api/admission/student-form-tokens/route.ts \
  app/api/admission/student-form-tokens/\[learner_id\]/status/route.ts \
  app/api/admission/student-form-tokens/\[token_id\]/revoke/route.ts \
  app/api/student-form/\[token\]/route.ts \
  app/api/student-form/\[token\]/photo/route.ts
```
Expected: empty output. If any file is listed, add `export const runtime = 'nodejs';` to it.

- [ ] **Step 5: Expired-token page leaks no data**

Open `/student-form/<expired-token>/expired?reason=consumed` and view source. Confirm: no learner name, email, phone, or other PII appears anywhere.

- [ ] **Step 6: Document the security review pass**

Commit a small changelog note:

```bash
echo "## Security review — 2026-05-08

- Whitelist hardness: verified forbidden columns immutable via student endpoint
- HMAC secret + service-role key: confirmed not in client bundle
- All 5 student-form routes: runtime='nodejs'
- Expired-token landing: no data leak in HTML source
" >> docs/superpowers/specs/student-self-fill-security-log.md
git add docs/superpowers/specs/student-self-fill-security-log.md
git commit -m "docs(student-form): security review pass log 2026-05-08"
```

---

## Self-review

Spec coverage check (against `docs/superpowers/specs/2026-05-08-student-self-fill-enquiry-design.md`):

- ✅ Data model — `learner_self_fill_tokens` table (Task 1), permissions seed (Task 4), reuse of `is_profile_complete`/`lifecycle_status`/`admission_lead_activities`
- ✅ Lifecycle flip from 'admitted' → 'enquiry' on bridge convert (Task 2)
- ✅ Token state machine — active/consumed/expired/superseded (Task 1 + Task 7 — `superseded_by` is set when generateToken supersedes a prior active row)
- ✅ End-to-end user flow — covered by component tasks 13–23 + smoke task 24
- ✅ Component architecture — every file in the spec's File map has a task
- ✅ API surface — 5 endpoints, all have a task (8, 9, 10, 11, 12)
- ✅ Security model — HMAC + hash + whitelist all in tasks 5/6/7
- ✅ Error handling matrix — endpoint tasks all map errors to status codes (Task 11 has `mapErrorToResponse`)
- ✅ Bilingual labels — gate-entry pattern reused in step components
- ✅ Selfie upload — Task 12 (endpoint) + Task 19 (client component)
- ✅ 30-min expiry + countdown — Task 7 (TTL) + Task 13 (admission countdown) + Task 18 (student wizard countdown)
- ✅ Auto-save per section — Task 18 (`saveSection` with `final=false`)
- ✅ Pre-submit preview — Task 22
- ✅ Post-submit lockdown — Task 7 validateToken checks `is_profile_complete`; Task 11 GET/PATCH return 410; Task 17 redirects to expired page; Task 25 verifies
- ✅ Override fallback — Task 16 (admission desktop override + audit)
- ✅ Permissions — Task 3 (catalog) + Task 4 (grant migration); endpoints check via RPC in Tasks 8/10/etc.
- ✅ Test plan — Task 24 (end-to-end smoke), Task 25 (security checklist)

Placeholder scan: no "TBD"/"TODO"/"add appropriate" found. The two `<ts>` placeholders in the file map are filenames where the engineer fills in the real timestamp — explicitly noted as intentional.

Type consistency: `StudentSection` type (Task 5) used by `saveSection` (Task 7) and the API route (Task 11) — matches. `signToken/verifyToken/hashRawToken` signatures (Task 6) match call sites in Task 7. `WizardShell` props (Task 18) match the parent page (Task 17) and child step components (Tasks 19–22).

Scope check: this is one cohesive feature focused on a single user flow. No decomposition needed. Estimated 25 tasks × ~30–60 min each ≈ 12–25 hours of focused engineering work plus smoke + security review.

---

**Plan complete and saved to `docs/superpowers/plans/2026-05-08-student-self-fill-enquiry.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
