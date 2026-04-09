# KBM Marathon 2.0 — Critical Fixes & Blockers

## Blocker #1: Public Site Table Name Mismatch (REGISTRATION BROKEN)

**Impact:** Public site registration is completely non-functional.

**Root Cause:** The public site (`kbm-marathon-public`) queries tables that DON'T EXIST:

| Public Site Queries | Exists? | Internal Module Uses |
|--------------------|---------|---------------------|
| `marathon_events` | NO | `events` |
| `marathon_categories` | NO | `event_categories` |
| `marathon_registrations` | NO | `events_registrations` |

The internal module (MyJKKN) uses shared tables which all exist. The public site uses marathon-prefixed tables which don't.

**Fix Options:**

**Option A (Recommended — fastest, no code changes):** Create the 3 missing tables as VIEWS pointing to the shared tables:
```sql
CREATE VIEW marathon_events AS SELECT * FROM events WHERE event_type = 'marathon';
CREATE VIEW marathon_categories AS SELECT * FROM event_categories;
-- marathon_registrations needs column mapping since schema differs
CREATE VIEW marathon_registrations AS 
  SELECT id, event_id, category_id, participant_name, participant_phone,
         participant_email, participant_age, participant_gender,
         institution_name, bib_number, status, payment_status,
         payment_amount, custom_data, created_at, updated_at
  FROM events_registrations;
```
**Pros:** Zero code changes. Works immediately. **Cons:** View may not support INSERT (depends on complexity). May need INSTEAD OF triggers for writes.

**Option B (Cleaner — requires code changes):** Update `kbm-marathon-public/lib/services/public-service.ts` to use the correct table names:
- `.from('marathon_events')` → `.from('events').eq('event_type', 'marathon')`
- `.from('marathon_categories')` → `.from('event_categories')`
- `.from('marathon_registrations')` → `.from('events_registrations')`

**Pros:** Clean, no database hacks. **Cons:** Requires code changes + redeployment of public site.

**Option C (Hybrid):** Create `marathon_events` and `marathon_categories` as views (read-only is fine for public display). Create `marathon_registrations` as a real table (public site needs INSERT), and add a trigger to sync inserts into `events_registrations`.

---

## Blocker #2: Mobile-First Responsive (95% MOBILE USAGE)

**Impact:** All 14 pages use desktop DataTable pattern. Unusable on phone screens.

**See:** [02-MOBILE-FIRST-SPECS.md](02-MOBILE-FIRST-SPECS.md) for detailed per-page specs.

**Summary:** Replace DataTable with card layouts on 5 critical pages (events list, registrations, committees, budget, Live Ops). Dashboard already mostly responsive. Rest need minor tweaks.

---

## Blocker #3: Payment Integration (NO ONLINE PAYMENT)

**Current state:** Public site has Razorpay placeholder key (`rzp_test_placeholder`). No real payment flow.

**Workaround:** "Pay at venue" — registration desk collects cash and manually updates `payment_status` to 'paid' and `payment_amount`.

**To fix:**
1. Get Razorpay key pair from JKKN account
2. Set Vercel env vars: `NEXT_PUBLIC_RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`
3. Update public site's payment flow to:
   - Create Razorpay order on server
   - Open Razorpay checkout on client
   - Verify payment signature on server
   - Update `events_registrations.payment_status` to 'paid'
4. The internal module already has `event-payment-service.ts` with HDFC SmartGateway adapter — adapt for Razorpay if needed

---

## Blocker #4: DNS Configuration

**Current:** Public site only accessible at `kbm-marathon-public.vercel.app`

**Target:** `marathon.jkkn.ac.in`

**Fix:**
1. Add CNAME record in JKKN DNS: `marathon` → `cname.vercel-dns.com`
2. In Vercel dashboard: Settings > Domains > Add `marathon.jkkn.ac.in`
3. SSL auto-provisions (5-10 min)
4. Update `NEXT_PUBLIC_SITE_URL` env var to `https://marathon.jkkn.ac.in`

---

## Non-Blockers (Nice to Have)

### Bulk Registration Import
Allow importing registrations from Google Forms/Excel spreadsheets. The `events_registrations` table can accept bulk inserts. Service method `MarathonRegistrationService.register()` handles one-at-a-time — add a `bulkRegister()` method.

### WhatsApp Notifications
MyJKKN already has comprehensive WhatsApp integration (24 service files under `lib/services/whatsapp/`). Wire up templates for:
- "Your BIB number is KUM-2026-5K-0001. Collect at venue April 11, 3-6 PM."
- "Race day tomorrow! Assembly at 5:30 AM, JKKN College Ground."
- "Your results are ready! View at marathon.jkkn.ac.in/results"

### SMS Campaigns
MyJKKN has MSG91/Exotel SMS integration. Use for participants without WhatsApp.

### BIB Sticker Printing
Generate PDF labels from registration data. Use a library like `pdf-lib` or `jspdf`.

### Checkpoint QR Code Generation
Generate QR codes for each checkpoint that encode the checkpoint ID. Runners scan during race → logged to `marathon_checkpoint_scans`.

---

## Known Pre-Existing Build Issues

1. **Exotel client exports** — `inbound-call-sync-service.ts` imports `getExotelClient` and `isExotelConfigured` which don't exist as standalone functions in `exotel-client.ts`. Add convenience wrapper exports.
2. **Node.js heap** — Build requires `NODE_OPTIONS="--max-old-space-size=8192"` due to project size (~400 pages).
3. **Google Fonts** — Transient network failures during build. Retry fixes it.
4. **`cookies()` warnings** — Normal for Next.js 16 API routes with dynamic rendering.
