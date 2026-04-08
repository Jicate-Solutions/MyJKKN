# KBM Marathon External App — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task.

**Goal:** Build a standalone public-facing PWA for the KBM Marathon at `marathon.jkkn.ac.in`. Participants (JKKN students + public) use this app to register, track their race via GPS, scan QR checkpoints, view results, and verify certificates. All data flows through MyJKKN API endpoints — no direct Supabase access.

**Architecture:** Separate Next.js app communicating with MyJKKN via REST API. Dark-themed Ultrahuman-inspired design, Tamil/English bilingual, PWA with GPS, Wake Lock, and Speech APIs.

**Tech Stack:** Next.js 16 (App Router), TypeScript 5, Tailwind v4 (CSS-first), PWA APIs (Geolocation, Wake Lock, Speech Synthesis, Camera), HDFC SmartGateway (payment redirect)

**Reference:** Handoff docs at `MyJKKN/docs/features/marathon-handoff/` — especially `01-ARCHITECTURE.md` for file maps and `04-RACE-DAY-OPERATIONS.md` for race day flow.

---

## Table of Contents

1. [System Architecture](#system-architecture)
2. [API Endpoints (MyJKKN Backend)](#api-endpoints)
3. [Phase 1: Project Setup & Landing Page](#phase-1-project-setup--landing-page)
4. [Phase 2: Registration Flow](#phase-2-registration-flow)
5. [Phase 3: Payment Integration (HDFC)](#phase-3-payment-integration)
6. [Phase 4: My Registration (Post-Registration)](#phase-4-my-registration)
7. [Phase 5: GPS Race Tracker](#phase-5-gps-race-tracker)
8. [Phase 6: Voice Coach (Tamil/English)](#phase-6-voice-coach)
9. [Phase 7: QR Checkpoint Scanner](#phase-7-qr-checkpoint-scanner)
10. [Phase 8: Family Live Tracker](#phase-8-family-live-tracker)
11. [Phase 9: Results & Leaderboard](#phase-9-results--leaderboard)
12. [Phase 10: Certificate Verification](#phase-10-certificate-verification)
13. [Phase 11: Route Map & Info Pages](#phase-11-route-map--info-pages)
14. [Phase 12: i18n (Tamil/English)](#phase-12-i18n-tamilenglish)
15. [Phase 13: PWA Configuration](#phase-13-pwa-configuration)
16. [Phase 14: Deployment](#phase-14-deployment)

---

## System Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                   EXTERNAL MARATHON APP (PWA)                     │
│                   marathon.jkkn.ac.in                              │
│                                                                   │
│   Next.js 16 · Tailwind v4 · Dark Theme · Tamil/English          │
│   PWA: GPS, Wake Lock, Speech, Camera                             │
│                                                                   │
│   Pages:                                                          │
│   / ─────────────── Landing (hero, countdown, categories, FAQ)    │
│   /register ─────── 4-step registration form                      │
│   /register/success  BIB card, confetti, share                    │
│   /my-registration ─ Phone lookup → vital card dashboard          │
│   /race ───────────── GPS tracker + voice coach + QR scanner      │
│   /track/[bib] ───── Family live tracker (no auth, 10s polling)   │
│   /results ────────── Leaderboard, search, college ranking        │
│   /results/[bib] ─── Individual result detail                     │
│   /verify/[certId] ─ Certificate QR verification                  │
│   /route ──────────── Map, checkpoint timeline, elevation         │
│   /sponsors ───────── Tier-based sponsor display                  │
│                                                                   │
│   NO AUTH · NO DATABASE · API-ONLY                                │
└──────────────────────────┬───────────────────────────────────────┘
                           │
                    REST API (JSON)
                    All calls to MyJKKN
                           │
                           ▼
┌──────────────────────────────────────────────────────────────────┐
│              MyJKKN API Layer                                     │
│              {MYJKKN_URL}/api/events/marathon/{eventId}/          │
│                                                                   │
│   GET  /                    → Event details + categories          │
│   GET  /categories          → Race categories                     │
│   GET  /stats               → Registration counts                 │
│   GET  /sponsors            → Committed sponsors                  │
│   POST /register            → Create registration                 │
│   GET  /registrations/{phone} → Lookup by phone                   │
│   GET  /results             → Public leaderboard                  │
│   GET  /results/{bib}       → Individual result                   │
│   GET  /verify/{certId}     → Certificate verification            │
│   POST /race/track          → Batch GPS sync                      │
│   POST /race/checkpoint     → QR checkpoint scan                  │
│   GET  /race/share?bib=X    → Live runner position                │
│   GET  /participant-lookup?phone=X → Pre-fill returning users     │
│   POST /payment/pre-register → Initiate HDFC payment              │
│   GET  /payment/status/{id} → Check payment status                │
└──────────────────────────────────────────────────────────────────┘
```

---

## API Endpoints

All endpoints are prefixed with `{MYJKKN_API_URL}/api/events/marathon/{EVENT_ID}`.

The `EVENT_ID` is configured as an environment variable in the external app.

| Method | Endpoint | Purpose | Auth |
|--------|----------|---------|------|
| GET | `/` | Event details + categories | None |
| GET | `/categories` | Race categories with fees | None |
| GET | `/stats` | Registration counts (total, by category) | None |
| GET | `/sponsors` | Committed sponsors (name, logo, tier) | None |
| POST | `/register` | Create registration | None |
| GET | `/registrations/{phone}` | Lookup registration by phone | None |
| GET | `/participant-lookup?phone=X` | Pre-fill for returning external users | None |
| POST | `/payment/pre-register` | Create HDFC payment session (pay-first flow) | None |
| GET | `/payment/status/{txnId}` | Check payment status | None |
| POST | `/race/track` | Batch GPS position sync | None |
| POST | `/race/checkpoint` | QR checkpoint scan | None |
| GET | `/race/share?bib=X` | Live runner position (family tracker) | None |
| GET | `/results` | Public leaderboard (paginated, searchable) | None |
| GET | `/results/{bib}` | Individual result | None |
| GET | `/verify/{certId}` | Certificate verification | None |

**Environment Variables for External App:**
```env
NEXT_PUBLIC_MYJKKN_API_URL=https://myjkkn.vercel.app
NEXT_PUBLIC_EVENT_ID=<marathon-event-uuid>
NEXT_PUBLIC_SITE_URL=https://marathon.jkkn.ac.in
NEXT_PUBLIC_EVENT_NAME=KBM Marathon 2027
NEXT_PUBLIC_EVENT_DATE=2027-04-12
```

---

## Phase 1: Project Setup & Landing Page

### Task 1.1: Initialize Next.js Project

**Steps:**
1. Create new Next.js project: `npx create-next-app@latest kbm-marathon-public --typescript --tailwind --app --src-dir=false`
2. Configure Tailwind v4 with dark theme (CSS-first approach using `@theme inline`)
3. Set up project structure:

```
kbm-marathon-public/
├── app/
│   ├── layout.tsx              # Root layout: dark theme, fonts, LocaleProvider
│   ├── globals.css             # Dark CSS tokens (#0a0a0a base), animations
│   ├── page.tsx                # Landing page
│   ├── register/
│   │   ├── page.tsx            # Registration form
│   │   └── success/page.tsx    # Success with BIB card
│   ├── my-registration/page.tsx
│   ├── race/page.tsx           # GPS tracker
│   ├── track/[bib]/page.tsx    # Family tracker
│   ├── results/
│   │   ├── page.tsx            # Leaderboard
│   │   └── [bib]/page.tsx      # Individual result
│   ├── verify/[certId]/page.tsx
│   ├── route/page.tsx          # Route map
│   └── sponsors/page.tsx
├── components/
│   ├── layout/
│   │   ├── header.tsx          # Translucent dark header + language toggle
│   │   ├── footer.tsx          # Minimal dark footer
│   │   └── bottom-tabs.tsx     # 5-tab mobile nav
│   └── ui/
│       ├── vital-card.tsx      # Ultrahuman-style data card
│       ├── countdown.tsx       # Dark countdown timer
│       ├── live-count.tsx      # Animated registration counter
│       └── language-toggle.tsx # Tamil/English pill toggle
├── lib/
│   ├── api.ts                  # API client (fetch wrapper)
│   ├── types.ts                # Public-facing types
│   ├── utils.ts                # Formatters (time, pace, currency, BIB)
│   ├── hooks/
│   │   ├── use-gps-tracker.ts  # GPS watchPosition + Haversine
│   │   ├── use-wake-lock.ts    # Screen Wake Lock API
│   │   └── use-voice-coach.ts  # Tamil/English TTS
│   └── i18n/
│       ├── translations.ts     # 200+ keys, English + Tamil
│       └── context.tsx         # React Context, auto-detect, localStorage
└── public/
    ├── manifest.json           # PWA manifest
    └── icons/                  # App icons
```

4. Install fonts: Montserrat (headings), Open Sans (body), Noto Sans Tamil (Tamil text)
5. Create API client at `lib/api.ts`

### Task 1.2: API Client

**File:** `lib/api.ts`

```typescript
const API_BASE = process.env.NEXT_PUBLIC_MYJKKN_API_URL;
const EVENT_ID = process.env.NEXT_PUBLIC_EVENT_ID;

class MarathonAPI {
  private baseUrl: string;

  constructor() {
    this.baseUrl = `${API_BASE}/api/events/marathon/${EVENT_ID}`;
  }

  private async fetch<T>(path: string, options?: RequestInit): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const res = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    });
    if (!res.ok) {
      const error = await res.json().catch(() => ({ message: 'Request failed' }));
      throw new Error(error.message || `API error: ${res.status}`);
    }
    return res.json();
  }

  // Event
  getEvent() { return this.fetch('/'); }
  getCategories() { return this.fetch('/categories'); }
  getStats() { return this.fetch('/stats'); }
  getSponsors() { return this.fetch('/sponsors'); }

  // Registration
  register(data: any) { return this.fetch('/register', { method: 'POST', body: JSON.stringify(data) }); }
  lookupRegistration(phone: string) { return this.fetch(`/registrations/${phone}`); }
  lookupParticipant(phone: string) { return this.fetch(`/participant-lookup?phone=${phone}`); }

  // Payment
  initiatePayment(data: any) { return this.fetch('/payment/pre-register', { method: 'POST', body: JSON.stringify(data) }); }
  checkPaymentStatus(txnId: string) { return this.fetch(`/payment/status/${txnId}`); }

  // Race
  syncGPS(data: any) { return this.fetch('/race/track', { method: 'POST', body: JSON.stringify(data) }); }
  scanCheckpoint(data: any) { return this.fetch('/race/checkpoint', { method: 'POST', body: JSON.stringify(data) }); }
  getRunnerPosition(bib: string) { return this.fetch(`/race/share?bib=${bib}`); }

  // Results
  getResults(params?: { category_id?: string; limit?: number; offset?: number; search?: string }) {
    const qs = new URLSearchParams();
    if (params?.category_id) qs.set('category_id', params.category_id);
    if (params?.limit) qs.set('limit', String(params.limit));
    if (params?.offset) qs.set('offset', String(params.offset));
    if (params?.search) qs.set('search', params.search);
    return this.fetch(`/results?${qs}`);
  }
  getResult(bib: string) { return this.fetch(`/results/${bib}`); }

  // Certificate
  verifyCertificate(certId: string) { return this.fetch(`/verify/${certId}`); }
}

export const api = new MarathonAPI();
```

### Task 1.3: Landing Page

**File:** `app/page.tsx`

**Sections (dark theme, Ultrahuman-inspired):**
1. **Hero** — Full-screen dark hero with event name, date, countdown timer, "Register Now" CTA
2. **Live Registration Count** — Animated counter showing total registrations (polls `/stats`)
3. **Race Categories** — Cards for each category (10km, 5km, 3km) with distance, fee, description
4. **Route Overview** — Mini map preview, total distance, elevation, key landmarks
5. **Past Results** — Link to previous year's results (if available)
6. **Sponsors** — Tier-based logo grid (fetched from `/sponsors`)
7. **FAQ** — Accordion with common questions
8. **Bottom Tab Navigation** — Home, Register, Race, Results, More

**Design tokens (globals.css):**
```css
:root {
  --bg-primary: #0a0a0a;
  --bg-secondary: #141414;
  --bg-card: #1a1a1a;
  --text-primary: #ffffff;
  --text-secondary: #a0a0a0;
  --accent: #00d4aa;      /* Teal/green accent */
  --accent-hover: #00b894;
  --destructive: #ff4757;
  --warning: #ffa502;
}
```

**Commit:** `feat: initialize marathon PWA with landing page and API client`

---

## Phase 2: Registration Flow

### Task 2.1: Registration Form Page

**File:** `app/register/page.tsx`

**4-Step Form:**

```
Step 1: Identity Gate
┌─────────────────────────────────────┐
│  How would you like to register?    │
│                                     │
│  ┌─────────────────────────────┐    │
│  │  I'm from JKKN              │    │  → Phone OTP → auto-fill from
│  │  (Student/Staff login)      │    │    MyJKKN profile via API
│  └─────────────────────────────┘    │
│                                     │
│  ┌─────────────────────────────┐    │
│  │  I'm not from JKKN          │    │  → Manual form entry
│  │  (Public registration)      │    │    Phone OTP for verification
│  └─────────────────────────────┘    │
└─────────────────────────────────────┘

Step 2: Personal Details
┌─────────────────────────────────────┐
│  Full Name *       [____________]   │  ← auto-filled for JKKN
│  Phone *           [____________]   │  ← auto-filled for JKKN
│  Email             [____________]   │  ← auto-filled for JKKN
│  Age               [__]            │
│  Gender            [Male ▼]        │
│  Organization      [____________]   │  ← only for external
│  City              [____________]   │  ← only for external
└─────────────────────────────────────┘

Step 3: Event Details
┌─────────────────────────────────────┐
│  Category *                         │
│  ○ 10 KM Run — ₹100 (JKKN) / ₹500 │
│  ○ 5 KM Run — ₹100 (JKKN) / ₹300  │
│  ○ 3 KM Fun Run — ₹100 / ₹200     │
│                                     │
│  T-Shirt Size      [L ▼]           │
│  Emergency Contact [____________]   │
│  Emergency Phone   [____________]   │
│  Blood Group       [O+ ▼]          │
└─────────────────────────────────────┘

Step 4: Review & Pay
┌─────────────────────────────────────┐
│  Review your details:               │
│  Name: Ravi Kumar                   │
│  Category: 10 KM Run               │
│  Fee: ₹100                         │
│                                     │
│  [Pay ₹100 & Register]             │
│  ← Opens HDFC payment gateway       │
│                                     │
│  □ I agree to terms & conditions    │
└─────────────────────────────────────┘
```

**Key behaviors:**
- JKKN users: call `/participant-lookup?phone=X` to pre-fill
- External users: full manual entry
- JKKN fee: ₹100 fixed | External fee: category-based
- Discount code: only for external users
- On submit: calls `/payment/pre-register` → redirects to HDFC
- HDFC callback returns to `/register/success?txn=X&payment=success`

### Task 2.2: Registration Success Page

**File:** `app/register/success/page.tsx`

- Confetti animation on load
- BIB card display (large, styled like a race bib)
  - BIB number: KBM-2027-10K-0042
  - Name, Category, Event Date
- "Share on WhatsApp" button (pre-formatted text with BIB)
- "Download BIB Card" button (canvas → PNG)
- "Go to My Registration" link

**Commit:** `feat: add registration form with 4-step flow and success page`

---

## Phase 3: Payment Integration

### Task 3.1: Payment Flow

The external app does NOT handle payment directly — it redirects to HDFC via MyJKKN API.

**Flow:**
1. Form submits → `POST /payment/pre-register` with `registration_data` + `amount`
2. API returns `{ payment_url }` → `window.location.href = payment_url`
3. HDFC processes payment
4. HDFC callbacks MyJKKN API → creates registration if success
5. MyJKKN redirects to external app: `{SITE_URL}/register/success?payment=success&txn=X`
6. Or on failure: `{SITE_URL}/register?payment=failed`

**Update MyJKKN callback handler** to redirect to external app URL when `Referer` is from the external app or use a query param to indicate source.

**Commit:** `feat: integrate HDFC payment redirect flow`

---

## Phase 4: My Registration

### Task 4.1: Phone Lookup Page

**File:** `app/my-registration/page.tsx`

- Phone number input → OTP verification (optional — can skip for demo)
- Calls `GET /registrations/{phone}`
- Shows "Vital Card" dashboard (Ultrahuman-inspired):
  - BIB number (large)
  - Category, Registration Status
  - Payment status badge
  - Event date countdown
  - QR code for check-in
  - "Start Race" button (links to `/race`)
  - "Share with Family" button (generates `/track/{bib}` link)

**Commit:** `feat: add my-registration lookup with vital card dashboard`

---

## Phase 5: GPS Race Tracker

### Task 5.1: GPS Tracker Hook

**File:** `lib/hooks/use-gps-tracker.ts`

```typescript
// Core GPS tracking hook using browser Geolocation API
// - watchPosition() every 3 seconds
// - Haversine distance calculation between consecutive points
// - Batch sync to API every 30 seconds
// - Handles permission denied, GPS unavailable, accuracy filtering
// - Stores offline buffer when no network (sync on reconnect)

interface GPSState {
  tracking: boolean;
  lat: number;
  lng: number;
  distance_km: number;
  pace_per_km: number;  // minutes
  elapsed_seconds: number;
  speed: number;        // km/h
  altitude: number | null;
  accuracy: number;
  points: TrackPoint[]; // buffer for batch sync
}
```

### Task 5.2: Race Page

**File:** `app/race/page.tsx`

**UI (dark theme):**
1. BIB number input (or auto-fill from localStorage)
2. "Start Tracking" button
3. Once started:
   - Large distance display: `4.2 km`
   - Pace: `6:30 /km`
   - Elapsed time: `00:27:45`
   - Speed: `9.2 km/h`
   - GPS status indicator (green dot)
   - "Scan Checkpoint" button → opens camera
   - "Stop Tracking" button
4. Voice coach announcements (see Phase 6)
5. Wake Lock keeps screen on

**GPS sync:** Every 30 seconds, POST to `/race/track`:
```json
{
  "bib": "KBM-2027-10K-0042",
  "lat": 11.4523,
  "lng": 77.5834,
  "distance_km": 4.2,
  "pace_per_km": 6.5,
  "elapsed_seconds": 1665,
  "points": [
    { "lat": 11.4523, "lng": 77.5834, "speed": 9.2, "accuracy": 3.5, "timestamp": "..." },
    ...
  ]
}
```

**Commit:** `feat: add GPS race tracker with distance, pace, and batch sync`

---

## Phase 6: Voice Coach

### Task 6.1: Voice Coach Hook

**File:** `lib/hooks/use-voice-coach.ts`

Uses Web Speech API (`speechSynthesis`) for real-time audio feedback:

**Announcements (Tamil + English):**
- Every 1 km: "1 kilometre completed. Pace: 6 minutes 30 seconds per km"
- At checkpoints: "Checkpoint 2 cleared! 3.5 km done, keep going!"
- Halfway: "Halfway done! You're doing great!"
- Last 1 km: "Just 1 km to go! Push through!"
- Finish: "Congratulations! You've completed the race!"

**Tamil example:** "1 கிலோமீட்டர் முடிந்தது. வேகம்: கிலோமீட்டருக்கு 6 நிமிடம் 30 வினாடி"

```typescript
interface VoiceCoachConfig {
  enabled: boolean;
  language: 'en' | 'ta';
  announceEveryKm: boolean;
  announceCheckpoints: boolean;
  announceHalfway: boolean;
}
```

**Commit:** `feat: add Tamil/English voice coach with km and checkpoint announcements`

---

## Phase 7: QR Checkpoint Scanner

### Task 7.1: QR Scanner Component

**File:** `components/ui/qr-scanner.tsx`

- Uses browser Camera API (getUserMedia)
- Scan QR code at checkpoint stations
- QR data format: `CP:{checkpoint_id}:{event_id}`
- On successful scan: POST to `/race/checkpoint`
- Voice confirmation: "Checkpoint 2 cleared!"
- Show scan history (checkpoints passed)

**Library:** Use `html5-qrcode` or `@yudiel/react-qr-scanner`

**Commit:** `feat: add QR checkpoint scanner with camera API`

---

## Phase 8: Family Live Tracker

### Task 8.1: Family Tracker Page

**File:** `app/track/[bib]/page.tsx`

**Key features:**
- No auth required — anyone with the link can view
- Polls `GET /race/share?bib={bib}` every 10 seconds
- Shows: runner name, current position on map, distance, pace, ETA
- Map: use Leaflet with OpenStreetMap tiles
- SEO: server component shell with dynamic OG metadata for WhatsApp sharing

**URL shared via WhatsApp:** `marathon.jkkn.ac.in/track/KBM-2027-10K-0042`

**Commit:** `feat: add family live tracker with 10s polling and map`

---

## Phase 9: Results & Leaderboard

### Task 9.1: Results Page

**File:** `app/results/page.tsx`

- Fetches `GET /results?limit=50`
- Search by name or BIB
- Filter by category (dropdown)
- Leaderboard table: Rank, BIB, Name, Category, Finish Time, Pace
- College performance ranking section
- Pagination (load more)

### Task 9.2: Individual Result

**File:** `app/results/[bib]/page.tsx`

- Fetches `GET /results/{bib}`
- Shows: finish time, ranks (overall, category, gender, institution)
- Certificate download link (if generated)
- Share button for WhatsApp

**Commit:** `feat: add results leaderboard with search, filters, and individual result page`

---

## Phase 10: Certificate Verification

### Task 10.1: Certificate Verification Page

**File:** `app/verify/[certId]/page.tsx`

- Server component with SEO metadata
- Fetches `GET /verify/{certId}`
- If valid: shows certificate details (name, event, category, time, rank)
- If invalid: shows "Certificate not found"
- Green verified badge with checkmark
- Designed to be scanned via QR code on printed certificates

**Commit:** `feat: add certificate QR verification page`

---

## Phase 11: Route Map & Info Pages

### Task 11.1: Route Map Page

**File:** `app/route/page.tsx`

- Checkpoint timeline (vertical list)
- Map with route overlay (if coordinates available from event config)
- Elevation profile
- Distance markers

### Task 11.2: Sponsors Page

**File:** `app/sponsors/page.tsx`

- Fetches `GET /sponsors`
- Tier-based display: Platinum (large), Gold (medium), Silver (small), Bronze (logos)

**Commit:** `feat: add route map and sponsors pages`

---

## Phase 12: i18n (Tamil/English)

### Task 12.1: Translation System

**Files:**
- `lib/i18n/translations.ts` — 200+ translation keys
- `lib/i18n/context.tsx` — React Context with localStorage persistence

**Features:**
- Auto-detect browser language (navigator.language)
- Toggle pill in header (EN | தமிழ்)
- All UI text uses `t('key')` function
- Tamil translations for: UI labels, voice coach, error messages, form labels

**Commit:** `feat: add Tamil/English bilingual system with 200+ translation keys`

---

## Phase 13: PWA Configuration

### Task 13.1: PWA Setup

**Files:**
- `public/manifest.json` — App name, icons, theme color, display: standalone
- `app/layout.tsx` — Meta tags for PWA, theme-color, apple-mobile-web-app

```json
{
  "name": "KBM Marathon",
  "short_name": "KBM Marathon",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#0a0a0a",
  "theme_color": "#0a0a0a",
  "icons": [...]
}
```

**Commit:** `feat: add PWA manifest and mobile optimization`

---

## Phase 14: Deployment

### Task 14.1: Vercel Deployment

1. Push to GitHub: `github.com/JKKN-Institutions/kbm-marathon-public`
2. Connect to Vercel
3. Set environment variables:
   - `NEXT_PUBLIC_MYJKKN_API_URL` = production MyJKKN URL
   - `NEXT_PUBLIC_EVENT_ID` = marathon event UUID
   - `NEXT_PUBLIC_SITE_URL` = `https://marathon.jkkn.ac.in`
   - `NEXT_PUBLIC_EVENT_NAME` = "KBM Marathon 2027"
4. Configure DNS: CNAME `marathon` → `cname.vercel-dns.com`
5. Verify SSL

### Task 14.2: Update MyJKKN Callback

Update the HDFC payment callback in MyJKKN to detect when the request comes from the external app and redirect back to the external app URL instead of MyJKKN:

```typescript
// In /api/events/marathon/[eventId]/payment/callback/route.ts
// Check if source is external app via query param or referer
const isExternalApp = searchParams.get('source') === 'external';
const redirectBase = isExternalApp
  ? process.env.NEXT_PUBLIC_MARATHON_APP_URL  // marathon.jkkn.ac.in
  : appUrl;                                    // myjkkn.vercel.app
```

**Commit:** `feat: deploy to Vercel with DNS and payment callback routing`

---

## Implementation Order & Dependencies

```
Phase 1 (Setup + Landing) ──────────────────────────────┐
    │                                                    │
    ▼                                                    │
Phase 2 (Registration Form)                              │
    │                                                    │
    ▼                                                    │
Phase 3 (Payment) ── Phase 4 (My Registration)           │
    │                                                    │
    ▼                                                    │
Phase 5 (GPS Tracker) ── Phase 6 (Voice Coach)           │
    │                     │                              │
    ▼                     ▼                              │
Phase 7 (QR Scanner)                                     │
    │                                                    │
    ├── Phase 8 (Family Tracker) ← can be built parallel │
    │                                                    │
    ▼                                                    │
Phase 9 (Results) ── Phase 10 (Certificates)             │
                                                         │
Phase 11 (Route/Sponsors) ← can be built parallel ──────┘
Phase 12 (i18n) ← can be applied incrementally
Phase 13 (PWA) ← can be applied anytime
Phase 14 (Deployment) ← final
```

**Estimated total: ~8,000-10,000 lines across ~30 files**

---

## Design Reference

**Theme:** Dark Ultrahuman-inspired (#0a0a0a base)
- Cards: `#1a1a1a` with subtle borders
- Accent: Teal `#00d4aa` for CTAs and highlights
- Typography: Montserrat (headings), Open Sans (body), Noto Sans Tamil (Tamil)
- Animations: Smooth fade-ins, count-up numbers, confetti on success
- Mobile-first: Bottom tab navigation, full-width cards

**Reference:** See `MyJKKN/docs/features/marathon-handoff/01-ARCHITECTURE.md` for the original design decisions and `05-DEPLOYMENT-GUIDE.md` for deployment steps.

---

## Notes for Implementer

1. **NO Supabase client** — All data comes from MyJKKN API endpoints. The external app has zero database access.
2. **Event ID is static** — Configured via env var. One deployment = one marathon event.
3. **CORS** — MyJKKN API routes need CORS headers for the external domain. Check if Next.js API routes handle this automatically or add headers.
4. **Rate limiting** — GPS sync sends data every 30s per runner. With 2000 runners = ~67 requests/second. Consider if the API can handle this.
5. **Offline support** — GPS tracker should buffer data when offline and sync when reconnected.
6. **Camera permissions** — QR scanner needs camera access. Handle denial gracefully.
7. **Wake Lock** — Keeps screen on during race. Only works in secure context (HTTPS).
8. **Speech API** — Tamil voice support varies by device. Test on real Android/iOS devices.
