# QR Platform + Institution-Level Applications — Spec

**Date:** 2026-08-17
**Status:** Draft / for review (no code written)
**Scope:** (A) audit of every existing QR touchpoint in MyJKKN, (B) a shared QR
substrate to replace the five competing conventions, (C) four institution-level
applications built on it — **Gate Pass, Library, Fee Collection, Events** — and
(D) a **universal page QR** mechanism that makes any of the app's 1,474 pages
scannable on demand.

---

## 0. Why this document exists

Three questions were asked:

1. *Which pages/forms in MyJKKN implement a QR code to access data?*
2. *Plan the institution-level applications that should ride on QR* —
   gate pass, library, fee collection, events.
3. *Can a QR be generated for any page at all?* — an arbitrary / ad-hoc code
   for any route in the platform.

Part A answers (1) from the code as it stands today. Parts B–D answer (2),
Part E answers (3), and Parts F–G phase and risk the whole thing.

---

# PART A — Current QR footprint (audit)

MyJKKN ships **four QR npm dependencies** (`package.json`):

| Package | Purpose | Used by |
|---|---|---|
| `qrcode` ^1.5.4 | server/client PNG + SVG generation | resource-mgmt, ID cards, certificates, admission, marathon |
| `html5-qrcode` ^2.3.8 | camera scanning | `/resource-management/scan`, `bib-scanner.tsx` |
| `react-qr-scanner` ^1.0.0-alpha.11 | camera scanning (alt) | legacy / unused paths |
| `@types/qrcode` | types | — |

> Two scanner libraries for one job is itself a consolidation target (see B-4).

## A.1 Every QR surface, by module

### 1. Resource Management — **the canonical implementation**

| Concern | Location |
|---|---|
| Token column + trigger | `supabase/migrations/20260515000010_resources_add_assignee_and_qr.sql` |
| Service | `lib/services/resource-management/qr-code-service.ts` |
| Generator UI | `components/resource-management/qr-code-generator.tsx` |
| Printable labels | `components/resource-management/qr-label-sheet.tsx` (24-up A4) |
| Scanner UI | `components/resource-management/qr-code-scanner.tsx` |
| Scan console page | `app/(routes)/resource-management/scan/page.tsx` |
| Detail-page print | `app/(routes)/resource-management/resources/[id]/page.tsx:143` |
| Type | `types/resource-management.ts:195` — `qr_code_token?: string \| null` |

**Payload:** opaque token `res_<32 hex>`, minted by
`public.tg_resources_set_qr_token()` on `BEFORE INSERT`, `UNIQUE`-constrained.
**Loop:** closed — print sticker, scan, assign/return.
**Modes:** camera (`html5-qrcode`) **and** manual token paste — the manual
fallback is essential and should be mandatory in every new scanner.

### 2. ID Cards — generate-only, and it leaks a primary key

| Concern | Location |
|---|---|
| Payload resolution | `lib/id-cards/render-data.ts:635, 685, 727` |
| Render | `lib/id-cards/render-card.tsx` |
| Tests | `__tests__/lib/id-cards/render-helpers.test.ts`, `back-render.test.ts` |

**Payload:** `render-data.ts:94-95` — *"QR payload: `learners_profiles.id` for
learners, `profiles.id` for employees."* A **raw database UUID**, unsigned,
non-expiring, printed on a plastic card.
**Loop:** open — **no page in the repo scans an ID card.** Every learner and
staff member carries a QR that no MyJKKN screen consumes.
This is the single biggest unlocked asset in the platform and the natural
identity carrier for all four applications in Part D.

### 3. Campus Living — Gate Pass — **dead-end QR**

| Concern | Location |
|---|---|
| Service | `lib/services/campus-living/gate-pass-service.ts:68, 118, 352` |
| Table | `hostel_gate_passes` (`types/supabase.ts:33580`) |
| Pages | `app/(routes)/campus-living/gate-passes/{page,new,[id]}` |

**Payload:** `QR-<uuid>` written to `hostel_gate_passes.qr_code`.
**Loop:** **broken.** `GatePassService.getGatePassByQR()` (line 68) is
referenced by **no page, hook, component or route**. There is no scanner, and
`gate_security_in` / `gate_security_out` / `out_time` / `actual_return` are
filled manually if at all.
**Scope:** hostel residents only (`learner_id`, `leave_request_id`) — not an
institution gate.

### 4. Campus Living — Mess meals

| Concern | Location |
|---|---|
| Scan page | `app/(routes)/campus-living/mess/meals/scan/page.tsx` |
| Hook | `useScanMeal` (`hooks/campus-living/use-mess-meals`) |

**Loop:** closed for consumption. Same dual-mode (`qr` / `manual`) UX as the
resource scanner — confirming the two-mode pattern is already house style.
Note: `campus-living/mess/library` is a **mess menu-item catalogue**, *not* a
book library. There is no library module in MyJKKN today.

### 5. Events (Marathon / Tournament) — the most complete loop

| Concern | Location |
|---|---|
| Per-BIB QR route | `app/api/events/marathon/[eventId]/qr/[bib]` |
| Tournament equivalent | `app/api/events/tournament/[eventId]/qr` |
| Bulk ZIP download | `app/api/events/marathon/[eventId]/qr/bulk` |
| Manager board | `components/events/shared/qr-board.tsx` |
| Generator util | `lib/utils/marathon-qr-generator.ts` |
| Scanner | `components/marathon/bib-scanner.tsx` |
| Ops service | `lib/services/events/shared/event-ops-service.ts` |
| Registration share | `components/events/registration/registration-form-share-dialog.tsx` |

**Payload:** `BIB:T1234`, parsed by `BIB_REGEX = /(?:BIB:)?([TFK]\d{3,4})/i`.
**Notable good practices worth generalising:** screen **Wake Lock** during
scanning (`bib-scanner.tsx`), a 3000 ms **scan debounce**, bulk pass generation
with `force` regeneration, and ZIP export for printing.
**Weakness:** the payload is guessable — anyone can write `BIB:T0001`.

### 6. IMS / Payments — UPI + Razorpay QR

| Concern | Location |
|---|---|
| UPI QR component | `components/ims/upi-qr-payment.tsx` |
| Razorpay QR | `lib/services/payments/razorpay/qr-code.ts` (+ tests) |
| API | `app/api/ims/payment/upi-qr` |
| Webhook routing | `lib/services/payments/razorpay/webhook-handlers.ts`, `webhook-module-registry.ts` |
| Migrations | `20260221_create_ims_upi_qr_payments.sql`, `20260226_add_upi_qr_to_ims_sales.sql` |

**Loop:** closed via **payment-gateway webhook** rather than a camera — the
payer's own banking app is the scanner. This is the correct model for money
and must be reused verbatim by Fee Collection (D.3).

### 7. Admission — Student form QR — **the best security model in the repo**

| Concern | Location |
|---|---|
| Dialog | `components/admission/student-form-qr-dialog.tsx` |

**Payload:** `{ token_url, expires_at, token_id }` — a **short-lived tokenised
URL**, rendered to canvas, with a live countdown and polling for completion.
**Loop:** closed — learner scans on their own phone, fills the form, the
dialog detects submission.
**This is the pattern to generalise** for any QR that grants data access.

### 8. Certificates — public verification QR

`lib/utils/certificate-pdf.ts:171-184` embeds a QR of `verificationUrl`
bottom-right with a "Scan to verify" caption. Fails soft to a text `QR`
placeholder if generation throws.

### 9. WhatsApp Personal (BYOW) — vendor QR

`components/whatsapp/personal-connect.tsx`, `app/api/whatsapp-personal/status`,
`whatsapp-service/src/routes/connect.ts`. Session-pairing QR owned by
WhatsApp Web — **out of scope**, listed only for completeness.

## A.2 Summary matrix

| # | Module | Generates | Scans | Payload convention | Loop |
|---|---|---|---|---|---|
| 1 | Resource Mgmt | yes | yes | opaque DB token `res_…` | **closed** |
| 2 | ID Cards | yes | **no** | **raw UUID** | open |
| 3 | Gate Pass (hostel) | yes | **no** | random `QR-<uuid>` | **broken** |
| 4 | Mess meals | yes | yes | meal / resident | closed |
| 5 | Events / Marathon | yes | yes | prefixed text `BIB:` | closed |
| 6 | IMS / Razorpay | yes | webhook | UPI intent | closed |
| 7 | Admission form | yes | learner phone | **signed expiring URL** | closed |
| 8 | Certificates | yes | public URL | URL | closed |
| 9 | WhatsApp | vendor | vendor | vendor | n/a |

---

# PART B — Structural gaps

**B-1. No shared QR primitive.** Four independent generator call-sites import
`qrcode` directly. There is no `lib/qr/`. Size, margin, and error-correction
level are re-chosen per module (`errorCorrectionLevel: 'M'` in resource-mgmt;
different in certificates). A scratched sticker or a low-light camera fails
differently in each module.

**B-2. Five incompatible payload conventions** (A.2). A single scanner cannot
be written that understands a resource sticker, an ID card, and a BIB. Every
new feature therefore ships its own scanner — which is exactly how we arrived
at two scanner libraries.

**B-3. Identity QRs are unsigned and non-expiring.** The ID card encodes a bare
`learners_profiles.id`. Anyone who photographs a card can reproduce a perfect
clone; there is no revocation path short of reissuing plastic. Before ID-card
QR is wired to *anything* that grants access or money, it needs the
Part-C token model.

**B-4. Two scanner libraries.** `html5-qrcode` and `react-qr-scanner` both
present. Consolidate on `html5-qrcode` (the one the working scanners use).

**B-5. No scan audit trail.** Nothing records *who scanned what, where, when,
and whether it was allowed*. For a gate, a library issue desk, or a fee
counter this is not optional — it is the primary evidentiary record.

**B-6. No offline behaviour.** Campus gates and library desks have unreliable
Wi-Fi. Every current scanner assumes a live round-trip. The Wake Lock in
`bib-scanner.tsx` shows the field-use problem was noticed, but not the
connectivity half of it.

---

# PART C — Proposed shared substrate

Everything in Part D depends on this. Build it first.

## C.1 `lib/qr/` — one primitive, four exports

```
lib/qr/
  index.ts          // public surface
  encode.ts         // mintToken(), buildPayload() — v1 payload format
  decode.ts         // parsePayload() — accepts v1 + all 5 legacy conventions
  render.ts         // toPng() / toSvg() / toLabelSheet() — one option set
  verify.ts         // HMAC sign + verify, expiry, revocation check
```

**Canonical payload (v1)** — deliberately short, alphanumeric, high-density-safe:

```
JK1:<kind>:<token>:<sig>
```

- `JK1` — format version, so v2 can coexist on cards already printed.
- `kind` — `idc` (ID card), `gpx` (gate pass), `lib` (library item),
  `bil` (bill/fee), `evt` (event pass), `res` (resource).
- `token` — 22-char base62 of a random 128-bit value. **Never a primary key.**
- `sig` — first 10 chars of `HMAC-SHA256(secret, kind + token)`. Makes the code
  unguessable and cheaply verifiable offline.

`decode.ts` must also accept today's live formats (`res_…`, `BIB:…`, bare UUID,
`QR-<uuid>`, https URLs) so one scanner handles every sticker already in the
field. **Nothing already printed gets invalidated.**

## C.2 `qr_tokens` — central registry

```sql
CREATE TABLE public.qr_tokens (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token           TEXT NOT NULL UNIQUE,          -- the 22-char base62
  kind            TEXT NOT NULL,                 -- idc|gpx|lib|bil|evt|res
  subject_table   TEXT NOT NULL,                 -- e.g. 'learners_profiles'
  subject_id      UUID NOT NULL,
  institution_id  UUID NOT NULL REFERENCES public.institutions(id),
  issued_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at      TIMESTAMPTZ NULL,              -- NULL = non-expiring (ID card)
  revoked_at      TIMESTAMPTZ NULL,
  issued_by       UUID NULL REFERENCES public.profiles(id),
  metadata        JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX idx_qr_tokens_subject      ON public.qr_tokens(subject_table, subject_id);
CREATE INDEX idx_qr_tokens_kind_active  ON public.qr_tokens(kind) WHERE revoked_at IS NULL;
```

Follows the `resources` precedent: **mint in Postgres via trigger**, so no row
can exist without a scannable identity. Revocation becomes a single `UPDATE` —
a lost ID card is killed without reprinting anyone else's.

## C.3 `qr_scan_events` — the audit trail (fixes B-5)

```sql
CREATE TABLE public.qr_scan_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token           TEXT NULL,            -- NULL when payload was unparseable
  raw_payload     TEXT NULL,
  kind            TEXT NULL,
  scanner_id      UUID NULL REFERENCES public.profiles(id),
  station         TEXT NULL,            -- 'main-gate', 'library-desk-1', 'fee-counter-2'
  institution_id  UUID NOT NULL,
  action          TEXT NOT NULL,        -- entry|exit|issue|return|pay|checkin
  outcome         TEXT NOT NULL,        -- allowed|denied|unknown|expired|revoked|duplicate
  reason          TEXT NULL,
  scanned_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  synced_at       TIMESTAMPTZ NULL,     -- NULL until an offline scan is flushed
  device_id       TEXT NULL
);
```

Append-only. **Denied scans are recorded, not discarded** — an attempted entry
on a revoked card is the event you most need later.

## C.4 One scanner component (fixes B-2, B-4, B-6)

`components/qr/universal-scanner.tsx`, generalised from
`app/(routes)/resource-management/scan/page.tsx` + `bib-scanner.tsx`:

- `html5-qrcode` camera **plus mandatory manual-entry fallback** (house style)
- Screen **Wake Lock** while active (lifted from `bib-scanner.tsx`)
- 3000 ms debounce against repeat reads of the same code
- **Offline queue** in IndexedDB; flush to `qr_scan_events` on reconnect
- Local HMAC verification, so a valid/invalid decision is possible **without
  network** — the reason `sig` is in the payload at all
- Emits a typed `ScanResult`; each application supplies the action handler

Delete `react-qr-scanner` from `package.json` once nothing imports it.

## C.5 Platform wiring (non-negotiable in this repo)

- **Permissions:** add keys to `lib/constants/permissions.ts` in the existing
  `module.entity.action` form (`billing.receipts.view` is the model).
- **Nav gating:** every new route needs a `MENU_PERMISSIONS` entry in
  `lib/sidebarMenuLink.ts` — it is the single gate for both sidebar and search.
  A page guard alone leaves the chip invisible.
- **Route manifest:** regenerate `lib/navigation/route-manifest.generated.ts`;
  scan pages reached by button (not a chip) must export
  `navMeta = { invokedFrom: '…' }` for `scripts/assert-nav-coverage.mjs`.
- **CAS institutions:** resolve access with `.includes()` against
  `myjkkn_institution_ids`, never `i.id === x`. `role_has_institution_access`
  is already CAS-aware — reuse it in RLS rather than writing new predicates.
- **Migrations:** `supabase db push` does not work in this repo (no
  `config.toml`; the CLI sees 0 local migrations). Apply SQL out-of-band via the
  Management API and commit the file. Never run
  `migration repair --status reverted`.

---

# PART D — Institution-level applications

All four are **institution-scoped** (`institution_id` + RLS), work for every
institution type (college / school / CAS siblings), and share Part C.

## D.1 Gate Pass — `/gate-pass`

Today's gate pass is hostel-only and its QR is unscannable (A.3). Promote it to
an institution gate covering **learners, staff, visitors, and vehicles**.

**New tables** (do not extend `hostel_gate_passes` — different lifecycle):

| Table | Purpose |
|---|---|
| `gate_passes` | pass header: subject (polymorphic), type, reason, validity window, approver, status |
| `gate_stations` | physical gates per institution; each has a `station_code` |
| `gate_movements` | one row per IN/OUT, FK to `qr_scan_events` |
| `gate_visitors` | walk-in visitor register; issues a **time-boxed** `gpx` token |

**Pages / forms**

| Route | Form / purpose | QR role |
|---|---|---|
| `/gate-pass` | pass register + filters | — |
| `/gate-pass/new` | request form (subject, type, from/to, reason) | mints `gpx` token on approval |
| `/gate-pass/[id]` | detail + movement timeline + printable pass | renders QR |
| `/gate-pass/scan` | **security console** — dual-mode scanner | **consumes** `idc` + `gpx` |
| `/gate-pass/visitors` | visitor check-in form | mints expiring visitor token |
| `/gate-pass/stations` | station master (super-admin) | — |
| `/gate-pass/reports` | who is on/off campus now; overdue returns | — |

**Scan behaviour.** A learner presents their **ID card** (`idc`) — no separate
pass needed. The console resolves the subject, checks for an active `gate_pass`
in its validity window, and writes a `gate_movements` row alternating IN/OUT.
Outcomes: `allowed`, `denied` (no active pass / revoked / outside window),
`duplicate` (inside the debounce). Denials are logged, never silently dropped.

**Deliberate integrations:** on OUT for a minor, fire the existing parent
notification path (`notifyParentsOfLearners`); an overdue return raises a
`gate_movements` alert. Keep `hostel_gate_passes` as-is and add a nullable
`gate_pass_id` link — hostel leave keeps its own approval chain.

## D.2 Library — `/library` (greenfield)

There is **no library module** in MyJKKN. `campus-living/mess/library` is a
mess menu catalogue. Everything here is new.

**Tables**

| Table | Purpose |
|---|---|
| `library_titles` | bibliographic record (ISBN, title, author, publisher, subject, edition) |
| `library_copies` | physical copy; **`qr_code_token` minted by trigger**, `accession_number`, shelf, status |
| `library_members` | learner/staff membership; borrowing limits and privileges |
| `library_loans` | issue/return; due date, renewals, fine accrual |
| `library_reservations` | holds queue |
| `library_fines` | fine ledger — **its own table**, see the billing constraint in D.3 |

**Pages / forms**

| Route | Form / purpose | QR role |
|---|---|---|
| `/library` | dashboard: on loan, overdue, today's circulation | — |
| `/library/catalog` | title search / browse | — |
| `/library/catalog/new` | title + copies form (bulk accession) | mints `lib` per copy |
| `/library/catalog/[id]` | title detail, copy list | **prints 24-up label sheet** |
| `/library/circulation` | **issue / return desk — the core scanner** | scans `lib` **then** `idc` |
| `/library/loans` | loan register, renew, mark lost | — |
| `/library/members` | membership + limits | — |
| `/library/fines` | fine ledger, waivers | — |
| `/library/reports` | circulation stats, overdue list, popular titles | — |
| `/library/my-library` | learner self-service: my loans, due dates, renew | shows own `idc` QR |

**Circulation flow — the two-scan pattern.** Scan the **book** (`lib`), then
scan the **borrower's ID card** (`idc`); the desk resolves both and issues in
one action. Return needs only the book scan. This is the same shape as the
resource assign/return console — reuse it directly rather than inventing a
third scanner.

Copy labels reuse `components/resource-management/qr-label-sheet.tsx`
(24-up A4), lifted to `components/qr/label-sheet.tsx` in Part C.

## D.3 Fee Collection — `/billing/collect` (**additive only**)

> **Standing constraint — do not disturb college fee / billing.**
> New fee functionality gets its **own tables**. Shared billing tables
> (`billing_student_bills`, receipts, schedules) may only take **additive
> nullable columns**. No behavioural change to existing college billing.

The billing module already has receipts, student bills, payment accounts,
refunds, and a working Razorpay/UPI QR path (A.6). What is missing is a
**QR-present counter collection** flow.

**Two distinct QR directions — do not conflate them:**

1. **Learner-presented** (`idc`) — the cashier scans the ID card to pull up
   outstanding dues instantly. Replaces typing a roll number.
2. **App-presented** (UPI/Razorpay) — the *learner* scans a dynamic payment QR
   with their banking app; settlement arrives by **webhook**, exactly as
   `lib/services/payments/razorpay/webhook-handlers.ts` already does.
   **Never** mark a bill paid from a camera scan — only from the webhook.

**New tables**

| Table | Purpose |
|---|---|
| `fee_collection_sessions` | a cashier's counter session: open/close, station, opening & closing float |
| `fee_collection_scans` | ID-card scans at the counter, resolved learner + dues snapshot |
| `fee_payment_qr` | dynamic per-bill payment QR: amount, expiry, gateway ref, status |

**Additive columns** on existing tables: `collection_session_id UUID NULL` and
`qr_token TEXT NULL` on the receipt row — nullable, defaulted, invisible to
every current code path.

**Pages / forms**

| Route | Form / purpose | QR role |
|---|---|---|
| `/billing/collect` | **counter console** — scan ID, show dues, collect | scans `idc`, shows payment QR |
| `/billing/collect/session` | open/close session, cash reconciliation | — |
| `/billing/collect/[receiptId]` | receipt view / reprint | receipt QR to public verify |
| `/billing/collect/reports` | day book, per-cashier collection, mode split | — |
| `/learner/fees` | learner self-service dues + **pay by QR** | renders UPI QR |

Printed receipts carry a verification QR resolving to a public verify route —
the same trick `lib/utils/certificate-pdf.ts` already uses for certificates.

## D.4 Events — `/events` QR unification

Events already has the most complete QR loop (A.5), but it is **marathon /
tournament-specific**: `BIB:` payloads, a bespoke `bib-scanner.tsx`, and
per-event-type API routes. Generalise it to **any institution event** —
seminar, guest lecture, workshop, convocation, parents' meeting, cultural fest.

**Tables**

| Table | Purpose |
|---|---|
| `event_passes` | one per registration; `evt` token, holder, category, validity |
| `event_checkins` | scan record: session, gate, in/out, FK to `qr_scan_events` |
| `event_sessions` | multi-session events (per-session attendance) |

**Pages / forms**

| Route | Form / purpose | QR role |
|---|---|---|
| `/events/[id]/passes` | generalised QR board (from `qr-board.tsx`) | bulk mint + ZIP |
| `/events/[id]/checkin` | **gate console** for the event | scans `evt` **or** `idc` |
| `/events/[id]/attendance` | live headcount, per-session | — |
| `/events/[id]/register` | public registration form | share-by-QR (exists) |
| `/events/[id]/certificates` | attendance-gated certificate issue | verification QR (exists) |

**Key generalisation:** accept **either** an event pass (`evt`, for external
attendees) **or** an ID card (`idc`, for internal learners/staff who should
never need a second QR). Migrate `BIB:` to `evt` tokens for new events while
`decode.ts` keeps reading old BIBs — no printed bib is invalidated.

## D.5 What the four share

```
                      ┌─────────────────────────┐
                      │   ID CARD  (idc token)  │   one card, four doors
                      └────────────┬────────────┘
        ┌──────────────┬───────────┼───────────┬──────────────┐
   /gate-pass/scan  /library/   /billing/   /events/[id]/
                    circulation   collect      checkin
        └──────────────┴───────────┼───────────┴──────────────┘
                          qr_scan_events  (one audit trail)
```

One card. One scanner component. One token registry. One audit log.
That is the whole argument for building Part C before Part D.

---

# PART E — Universal page QR ("QR any page")

Parts A–D cover QR bound to a *thing* (a book, a pass, a bill). This part
covers QR bound to a *page* — the ability to turn **any** of MyJKKN's routes
into a scannable code on demand.

Scale of the surface: **1,474 `page.tsx` files** under `app/(routes)`, of which
**1,150 routes** are enumerated in `lib/navigation/route-manifest.generated.ts`.
Hand-building a QR per page is not an option; this must be one generic
mechanism that works everywhere.

## E.0 The rule that governs all five tiers

> **A page QR is a shortcut, never a grant.**
> Scanning navigates the phone to a URL. The destination page still runs its
> own `MENU_PERMISSIONS` gate and its own RLS. A QR must never widen what the
> scanner is allowed to see. Tier 3 is the single exception and is explicitly
> scoped below.

## E.1 Tier 1 — Ephemeral "QR this page" (zero DB, works on all 1,474 pages)

The cheapest possible win. A global affordance — command-palette entry
`QR this page`, a keyboard shortcut, and a header icon — opens a dialog
rendering `window.location.href` as a QR.

- **Component:** `components/qr/page-qr-dialog.tsx`
- **Storage:** none. Nothing persisted, nothing to revoke.
- **Use case:** desk-to-phone handoff. A warden on a desktop pulls up a
  resident record, scans it with their phone, and walks the block with it open.
- **Cost:** one dialog + one palette entry. No migration, no API, no RLS.
- **Caveat:** the phone must sign in if it has no session — correct behaviour,
  not a defect.

Ship this in P0. It is a few hours of work and it makes every page in the
platform QR-addressable immediately.

## E.2 Tier 2 — Persistent short link (`/q/[slug]`)

For anything **printed**: notice boards, circulars, department posters, event
standees, letters home. A long deep link is unusable on paper; a short,
stable, revocable slug is not.

```sql
CREATE TABLE public.qr_page_links (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug            TEXT NOT NULL UNIQUE,   -- 8-char base62; matches the existing
                                          -- TOKEN_RE = /^[A-Za-z0-9_-]{8,64}$/
  target_path     TEXT NOT NULL,          -- internal route, manifest-validated
  target_external TEXT NULL,              -- external URL (needs approval, E.6)
  title           TEXT NOT NULL,
  institution_id  UUID NOT NULL REFERENCES public.institutions(id),
  created_by      UUID NOT NULL REFERENCES public.profiles(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at      TIMESTAMPTZ NULL,
  revoked_at      TIMESTAMPTZ NULL,
  scan_count      INTEGER NOT NULL DEFAULT 0,
  last_scanned_at TIMESTAMPTZ NULL,
  CONSTRAINT qr_page_links_one_target
    CHECK (num_nonnulls(target_path, target_external) = 1)
);
```

**Resolver:** `app/(public)/q/[slug]/page.tsx` — follows the house pattern set
by `app/(public)/m/[token]/page.tsx`: `force-dynamic`, service-role read of a
narrow column set, `robots: noindex`, records the open in the same request, and
renders an **explicit "link not active" panel** for unknown / expired / revoked
slugs rather than a silent redirect (house rule #27). The resolver only
redirects; it never renders protected content itself.

**Manager UI:** `/tools/qr/links` — create, print, download, revoke, and see
scan counts per link.

## E.3 Tier 3 — Authenticated handoff QR (the admission pattern, generalised)

Scan on a shared desktop, and the page opens on your phone **already signed
in**. This is `components/admission/student-form-qr-dialog.tsx` lifted out of
admission and made generic.

- One-time token, **bound to the issuing user's `profiles.id`**, TTL **60 s**,
  **single use**, invalidated on first redemption.
- Redemption route `app/api/qr/handoff/[token]` establishes a session **for
  that same user only** and redirects to `target_path`.
- Consumed via `qr_tokens` (kind `hnd`) so revocation and audit come free.

**This is the only tier that transfers authority**, so it carries the tightest
constraints: never issuable *for* another user, never re-usable, never longer
than a minute, and every redemption written to `qr_scan_events`.

## E.4 Tier 4 — Record permalink QR (printed documents)

Any record detail page can stamp a QR onto its own printed output — a receipt,
a bonafide certificate, a gate pass, an ID card, a lab requisition — so the
paper resolves back to the live record.

Reuses Tier 2 slugs with `target_path = '/billing/receipts/<id>'` etc. The
verification-QR trick already in `lib/utils/certificate-pdf.ts:171` is exactly
this, just hard-wired to one module; Tier 4 makes it available to any page that
prints.

## E.5 Tier 5 — QR Studio (`/tools/qr`) — the free-form generator

The literal "random QR for anything" tool. One page, five payload types:

| Type | Input | Output |
|---|---|---|
| URL / page | pick a route from `ROUTE_MANIFEST`, or paste a URL | QR + optional Tier-2 short link |
| Free text | any string | QR |
| Wi-Fi | SSID, auth type, password | `WIFI:` join code for guest networks |
| Contact | name, phone, email, org | vCard QR for staff directories / visiting cards |
| UPI | VPA, amount, note | payment QR — **display only**, never marks anything paid |

Plus **batch mode**: paste a list or upload an Excel column, generate N codes,
and export as a **24-up A4 label sheet** — reusing
`components/resource-management/qr-label-sheet.tsx` (lifted to
`components/qr/label-sheet.tsx` in Part C) and the ZIP-export approach already
proven by `app/api/events/marathon/[eventId]/qr/bulk`.

**Pages**

| Route | Purpose |
|---|---|
| `/tools/qr` | studio: generate single or batch |
| `/tools/qr/links` | short-link manager: list, revoke, scan counts |
| `/tools/qr/analytics` | scans by link, by day, by institution |
| `/q/[slug]` *(public)* | the resolver |

**Permission keys:** `tools.qr.view`, `tools.qr.create`, `tools.qr.revoke`,
`tools.qr.external` (Tier-2 external targets — see E.6), each needing a
`MENU_PERMISSIONS` entry in `lib/sidebarMenuLink.ts`.

## E.6 Security — why "QR to any URL" is the risky part

A generic QR generator is, by construction, an **open-redirect factory**. A QR
printed on institution letterhead carries institutional trust, and a scanner
cannot read the destination before arriving. Four mitigations:

1. **Manifest allowlist.** Internal targets are validated against
   `ROUTE_MANIFEST` (1,150 known paths) at creation time. An arbitrary internal
   path cannot be typed in — it must exist. This is the one control the repo
   gives away for free, and it should be mandatory.
2. **External targets are a separate, gated capability.** `target_external`
   requires `tools.qr.external`, and the resolver shows an **interstitial
   naming the destination host** before leaving. No silent hop off-domain.
3. **Attribution.** `created_by` on every link, and every scan lands in
   `qr_scan_events` (kind `pag`). A QR on a noticeboard is always traceable to
   the person who made it.
4. **Scanning is not authorisation** (E.0). The redirect target enforces its own
   permissions; a leaked slug exposes a login screen, not data. Tier 3 is the
   sole exception and is bound to one user for 60 seconds.

Additionally: `noindex` on `/q/[slug]`, rate-limit slug resolution to blunt
enumeration, and — like the proof-record page — make invalid, expired, and
revoked slugs **indistinguishable** so the resolver never confirms that a slug
once existed.

## E.7 Recommendation

| Tier | Effort | Value | Verdict |
|---|---|---|---|
| **T1** ephemeral page QR | hours | high | **Build in P0.** No DB, works on all 1,474 pages |
| **T2** short link `/q/[slug]` | ~1 PR | high | **Build in P0.5.** Unlocks every printed artefact |
| **T4** record permalink | small, on T2 | medium | Follows free once T2 exists |
| **T5** QR Studio | ~1 PR | medium | Nice-to-have; batch/label mode is the real draw |
| **T3** auth handoff | ~1 PR | high | **Defer to P7.** Only tier that moves authority — do it last, deliberately |

---

# PART F — Phasing

| Phase | Deliverable | Depends on | Notes |
|---|---|---|---|
| **P0** | `lib/qr/` primitive + `qr_tokens` + `qr_scan_events` + `universal-scanner.tsx` + **E.1 Tier-1 "QR this page" dialog** | — | Legacy decoders included; nothing printed is invalidated. Tier 1 is hours of work and QR-enables all 1,474 pages at once |
| **P0.5** | **E.2 Tier-2 short links** — `qr_page_links` + `/q/[slug]` resolver + `/tools/qr` studio (E.5) | P0 | Manifest allowlist mandatory; unlocks every printed poster/circular/receipt |
| **P1** | ID-card token migration: mint `idc` per learner/staff, back-compat decode of raw UUIDs | P0 | **Closes B-3.** Reissue is lazy — old cards keep working via the legacy decoder |
| **P2** | **Gate Pass** — fixes the broken loop (A.3), highest-visibility win | P0, P1 | Reuses resource-scan console shape |
| **P3** | **Events** unification — generalise `qr-board` + `bib-scanner` | P0, P1 | Lowest risk: existing loop, just widened |
| **P4** | **Library** — greenfield, largest surface (10 routes, 6 tables) | P0, P1 | Two-scan circulation is the only novel UX |
| **P5** | **Fee Collection** — additive counter console | P0, P1 | Strictly additive; the webhook is the only source of payment truth |
| **P6** | Retire `react-qr-scanner`; migrate resource-mgmt JSON payloads to v1 | P0–P5 | Cleanup |
| **P7** | **E.3 Tier-3 authenticated handoff QR** | P0–P1 | Deliberately last: the only tier that transfers authority |

Ordering rationale: P0/P0.5 first because the page-QR tiers are cheap and
benefit every module immediately; P2 next because it converts an existing
*defect* (a QR nobody can scan) into a working feature; P5 and P7 last because
money and authority carry the most regression risk.

---

# PART G — Risks & open questions

**Risks**

1. **ID-card reissue cost.** P1 signs card tokens, but roughly every card in
   circulation carries a raw UUID. Mitigation: `decode.ts` accepts bare UUIDs
   and resolves them, logging `outcome='allowed', reason='legacy-payload'`, so
   the migration is measurable and reissue can be phased by batch.
2. **Billing regression.** Any non-additive touch to `billing_*` breaks live
   college fee collection. Mitigation: new tables only; nullable additive
   columns only; existing code paths unmodified.
3. **Offline divergence.** Two gates scanning the same pass while offline can
   both allow entry. Mitigation: `qr_scan_events` is append-only and reconciles
   on flush; alternating IN/OUT is derived at read time, not asserted at write
   time.
4. **CAS sibling scoping.** Wrong institution resolution silently hides or
   over-exposes rows. Mitigation: reuse `role_has_institution_access` and
   `.includes()` on `myjkkn_institution_ids` — never `===`.
5. **Camera permission on field devices.** `html5-qrcode` needs HTTPS and a
   granted camera permission; the manual-entry fallback is what keeps a gate or
   desk operating when it is refused.
6. **Open redirect / QR phishing (Part E).** A generic "QR to any URL" tool
   printed on institution letterhead is an abuse vector by construction —
   the scanner cannot read the destination before arriving. Mitigation:
   `ROUTE_MANIFEST` allowlist for internal targets, a separate
   `tools.qr.external` permission plus a host-naming interstitial for external
   ones, and `created_by` attribution on every link (E.6).
7. **Session hijack via handoff QR (E.3).** A Tier-3 token that outlives its
   scan, or is issuable *for* another user, is a login bypass. Mitigation:
   60 s TTL, single use, bound to the issuing `profiles.id`, every redemption
   written to `qr_scan_events`. This is why Tier 3 is phased last (P7).

**Open questions for the reviewer**

1. **Gate Pass scope** — learners only first, or learners + staff + visitors +
   vehicles in P2?
2. **Library** — is there an existing library system (Koha / SOUL / Excel) with
   an accession catalogue to import? That changes P4's first PR from
   "catalogue form" to "bulk import".
3. **Fee counter hardware** — phone cameras, or USB/handheld barcode scanners?
   Handhelds emulate a keyboard, which the manual-entry input already supports
   for free.
4. **ID-card reissue appetite** — reprint all cards at once, or run the legacy
   decoder indefinitely?
5. **Offline requirement** — is it real for the main gate, or is campus Wi-Fi
   dependable enough to defer the IndexedDB queue past P2?
6. **School vs college labelling** — should these routes run through
   `lib/utils/school-label-adapter.ts` (Learner / Class / Term) for K-12
   institutions?
7. **Who may mint a page QR (Part E)?** Every logged-in user for Tier 1
   (ephemeral, zero risk), but Tier-2 printable short links are institutional
   artefacts — restrict to staff with `tools.qr.create`, or open to all?
8. **External QR targets** — are they needed at all? Refusing them outright
   removes the entire open-redirect class (risk 6). If they are needed, whose
   approval gates `tools.qr.external`?

---

## Appendix — files an implementer will touch first

| Purpose | Path |
|---|---|
| Canonical token migration to copy | `supabase/migrations/20260515000010_resources_add_assignee_and_qr.sql` |
| Canonical scanner page to generalise | `app/(routes)/resource-management/scan/page.tsx` |
| Wake Lock + debounce reference | `components/marathon/bib-scanner.tsx` |
| Label sheet to lift | `components/resource-management/qr-label-sheet.tsx` |
| Signed-token model to generalise | `components/admission/student-form-qr-dialog.tsx` |
| Payment webhook truth-source | `lib/services/payments/razorpay/webhook-handlers.ts` |
| ID-card payload to secure | `lib/id-cards/render-data.ts:94, 635, 685, 727` |
| Dead lookup to revive | `lib/services/campus-living/gate-pass-service.ts:68` |
| Permission keys | `lib/constants/permissions.ts` |
| Nav gate (required) | `lib/sidebarMenuLink.ts` — `MENU_PERMISSIONS` |
| Nav coverage assertion | `scripts/assert-nav-coverage.mjs` |
| Route allowlist for page QR (E.6) | `lib/navigation/route-manifest.generated.ts` (1,150 paths) |
| Page catalogue / search enrichment | `lib/navigation/page-registry.ts` |
| Public token-page pattern to copy | `app/(public)/m/[token]/page.tsx`, `app/(public)/proof/[token]/page.tsx` |
| Public slug-page pattern to copy | `app/(public)/r/[slug]/page.tsx`, `app/(public)/book/[slug]/page.tsx` |
| Bulk QR + ZIP export precedent | `app/api/events/marathon/[eventId]/qr/bulk` |
