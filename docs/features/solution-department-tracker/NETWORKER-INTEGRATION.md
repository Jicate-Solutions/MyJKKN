# Networker Integration Specification

## Overview

The Solution Department Tracker connects to **Networker** (JKKN's contact/relationship management system) so that:
1. When creating a solution, departments pick the **client** from Networker's contact database (115+ contacts)
2. When a solution receives a **payment**, Networker is notified — the contact's temperature auto-upgrades and an interaction is logged
3. When a solution is **created or completed**, Networker is also notified

This eliminates duplicate data entry. Contacts captured via visiting cards at conferences flow directly into the solution pipeline.

---

## Architecture

```
MyJKKN (Solution Tracker)              Networker
─────────────────────────               ─────────

[Create Solution form]  ──GET──────▶  /api/contacts/search
  "Select client"         ◀──JSON───  {contacts with pagination}

[Solution detail page]  ──GET──────▶  /api/contacts/[id]
  "View client info"      ◀──JSON───  {full contact + interactions}

[Payment recorded]      ──POST─────▶  /api/webhooks/solution-event
[Solution created]        ◀──JSON───  {interaction_created, temperature_updated}
[Solution completed]
```

All calls are **server-to-server** (from MyJKKN API routes, NOT from the browser). The API key must never be exposed to the client.

---

## Authentication

Every request to Networker requires an `x-api-key` header.

```
x-api-key: nk_db164f38c3b57d5015f0a9d55a737df9ad3f5f9e603f73242748ded0b3fad513
```

### Environment Variable

Add to MyJKKN's `.env.local` and Vercel environment variables:

```
NETWORKER_API_KEY=nk_db164f38c3b57d5015f0a9d55a737df9ad3f5f9e603f73242748ded0b3fad513
NETWORKER_API_URL=https://networker-theta.vercel.app
```

For local development against Networker running locally:
```
NETWORKER_API_URL=http://localhost:3000
```

### Error Responses (Auth)

| Status | Body | Meaning |
|--------|------|---------|
| 401 | `{"error":"Missing x-api-key header"}` | Header not sent |
| 403 | `{"error":"Invalid API key"}` | Wrong key |
| 503 | `{"error":"API key not configured on server"}` | Networker's env var missing |

---

## Endpoint 1: Search Contacts

### `GET /api/contacts/search`

Search and filter Networker contacts. Use this to build the "Select client" picker in the solution creation form.

### Query Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `q` | string | `""` | Search by name, organization, or email (case-insensitive) |
| `sector` | string | — | Filter by sector (e.g., "Healthcare", "Education") |
| `temperature` | string | — | Filter: `hot`, `warm`, `cold` |
| `status` | string | — | Filter: `new`, `active`, `nurturing`, `dormant`, `converted` |
| `department_id` | UUID | — | Filter by Networker department (contacts shared to that dept) |
| `limit` | number | 20 | Max results per page (capped at 100) |
| `offset` | number | 0 | Pagination offset |

### Example Request

```bash
curl -H "x-api-key: $NETWORKER_API_KEY" \
  "$NETWORKER_API_URL/api/contacts/search?q=Vivek&limit=10"
```

### Response (200)

```json
{
  "success": true,
  "data": [
    {
      "id": "7fd664c5-c7e6-4e9e-80ea-b94c1ce9390e",
      "name": "Viveka Kalidasan",
      "organization": "River Ventures",
      "role": "Founder & CEO",
      "email": null,
      "phone": null,
      "whatsapp": false,
      "sector": "Startups & Tech",
      "temperature": "hot",
      "lead_score": 5,
      "status": "new",
      "location": "India",
      "linkedin": "Search: \"Viveka Kalidasan\" \"River Ventures\"",
      "website": null,
      "notes": "...",
      "next_action": "Share JKKN's NIF vision...",
      "next_action_due": "2026-02-09",
      "last_interaction": "2026-02-09",
      "created_at": "2026-02-08T14:09:49.608299+00:00",
      "updated_at": "2026-02-08T14:09:49.49+00:00",
      "departments": [
        { "id": "uuid", "name": "Department Name" }
      ],
      "tags": [
        { "id": "uuid", "name": "Tag Name", "color": "#3b82f6" }
      ]
    }
  ],
  "pagination": {
    "total": 115,
    "limit": 10,
    "offset": 0,
    "has_more": true
  }
}
```

### Key Fields for Solution Tracker

| Field | Use In Solution Tracker |
|-------|------------------------|
| `id` | Store as `networker_contact_id` on the solution |
| `name` | Display as client name |
| `organization` | Display as client organization |
| `role` | Show on solution detail page |
| `email` | Contact info |
| `phone` | Contact info |
| `sector` | May correlate with department expertise |
| `temperature` | Show client warmth (visual indicator) |

---

## Endpoint 2: Get Contact Detail

### `GET /api/contacts/[id]`

Fetch a single contact with all related data. Use this on the solution detail page to show client information.

### Example Request

```bash
curl -H "x-api-key: $NETWORKER_API_KEY" \
  "$NETWORKER_API_URL/api/contacts/7fd664c5-c7e6-4e9e-80ea-b94c1ce9390e"
```

### Response (200)

```json
{
  "success": true,
  "data": {
    "id": "7fd664c5-c7e6-4e9e-80ea-b94c1ce9390e",
    "name": "Viveka Kalidasan",
    "organization": "River Ventures",
    "role": "Founder & CEO",
    "location": "India",
    "sector": "Startups & Tech",
    "phone": null,
    "email": null,
    "linkedin": "...",
    "website": null,
    "whatsapp": false,
    "temperature": "hot",
    "lead_score": 5,
    "status": "new",
    "date_met": "2026-02-06",
    "introduced_by": "NED 2026 delegate list",
    "next_action": "...",
    "next_action_due": "2026-02-09",
    "last_interaction": "2026-02-09",
    "notes": "...",
    "events": [
      { "id": "uuid", "name": "NED-2026", "start_date": null }
    ],
    "tags": [],
    "departments": [],
    "interactions": [
      {
        "id": "uuid",
        "channel": "other",
        "summary": "[Solution Tracker] Solution created: \"AI Workshop\" by CSE",
        "interaction_date": "2026-02-09T00:00:00.000Z"
      }
    ]
  }
}
```

### Error Responses

| Status | Body | When |
|--------|------|------|
| 400 | `{"error":"Invalid contact ID format"}` | ID is not a valid UUID |
| 404 | `{"error":"Contact not found"}` | UUID valid but contact doesn't exist |

---

## Endpoint 3: Solution Event Webhook

### `POST /api/webhooks/solution-event`

Notify Networker when something happens to a solution. This creates an interaction record on the contact's timeline and optionally upgrades their temperature.

### Request Body

```json
{
  "type": "solution.created | solution.payment | solution.completed",
  "contact_id": "UUID (from Networker)",
  "solution_name": "Name of the solution",
  "department_name": "Department that owns the solution",
  "amount": 250000,
  "currency": "INR",
  "notes": "Optional additional context",
  "timestamp": "2026-02-09T10:30:00.000Z"
}
```

| Field | Required | Type | Notes |
|-------|----------|------|-------|
| `type` | Yes | string | One of: `solution.created`, `solution.payment`, `solution.completed` |
| `contact_id` | Yes | UUID | The Networker contact ID (stored as `networker_contact_id` on solution) |
| `solution_name` | Yes | string | Human-readable solution name |
| `department_name` | Yes | string | Department name (human-readable, not ID) |
| `amount` | No | number | Payment amount in INR (only for `solution.payment`) |
| `currency` | No | string | Defaults to INR |
| `notes` | No | string | Extra context appended to interaction summary |
| `timestamp` | No | ISO string | Defaults to now if omitted |

### What Each Event Type Does

| Event Type | Interaction Created | Temperature Effect |
|------------|--------------------|--------------------|
| `solution.created` | `[Solution Tracker] Solution created: "X" by Dept` | `cold` → `warm` (no change if already warm/hot) |
| `solution.payment` | `[Solution Tracker] Payment received for "X" by Dept — INR 2,50,000` | Always → `hot` |
| `solution.completed` | `[Solution Tracker] Solution completed: "X" by Dept` | No change |

### Response (200)

```json
{
  "success": true,
  "data": {
    "interaction_created": true,
    "temperature_updated": true,
    "new_temperature": "hot",
    "contact_name": "Viveka Kalidasan"
  }
}
```

### Error Responses

| Status | Body | When |
|--------|------|------|
| 400 | `{"error":"Missing required fields: type, contact_id, solution_name, department_name"}` | Required fields missing |
| 400 | `{"error":"Invalid event type. Must be one of: ..."}` | Bad event type |
| 400 | `{"error":"Invalid contact_id format"}` | Not a valid UUID |
| 404 | `{"error":"Contact not found"}` | Contact doesn't exist in Networker |

---

## Database Changes in MyJKKN

### Add to `sh_solutions` table

```sql
-- Add Networker contact reference to solutions
ALTER TABLE sh_solutions
  ADD COLUMN networker_contact_id UUID,
  ADD COLUMN client_name TEXT,
  ADD COLUMN client_organization TEXT;

-- Index for lookups
CREATE INDEX idx_sh_solutions_networker_contact ON sh_solutions (networker_contact_id)
  WHERE networker_contact_id IS NOT NULL;
```

**Why store `client_name` and `client_organization` locally?**
- Avoids API calls on every page load (Networker might be down)
- Cached display values — updated when solution is edited
- `networker_contact_id` is the canonical link for fetching live data

### Migration Note

If building SDT-1 (Database Schema & Migration), include this column in the initial migration rather than adding it after.

---

## Implementation Guide

### 1. Networker API Client (create once, use everywhere)

Create `lib/networker/client.ts` in MyJKKN:

```typescript
const NETWORKER_URL = process.env.NETWORKER_API_URL
const NETWORKER_KEY = process.env.NETWORKER_API_KEY

interface NetworkerContact {
  id: string
  name: string
  organization: string | null
  role: string | null
  email: string | null
  phone: string | null
  sector: string | null
  temperature: string | null
  location: string | null
}

interface SearchResult {
  success: boolean
  data: NetworkerContact[]
  pagination: {
    total: number
    limit: number
    offset: number
    has_more: boolean
  }
}

export async function searchContacts(query: string, limit = 20): Promise<SearchResult> {
  const url = `${NETWORKER_URL}/api/contacts/search?q=${encodeURIComponent(query)}&limit=${limit}`
  const res = await fetch(url, {
    headers: { 'x-api-key': NETWORKER_KEY! },
    next: { revalidate: 0 }, // No caching — always fresh
  })
  if (!res.ok) throw new Error(`Networker search failed: ${res.status}`)
  return res.json()
}

export async function getContact(id: string): Promise<NetworkerContact> {
  const url = `${NETWORKER_URL}/api/contacts/${id}`
  const res = await fetch(url, {
    headers: { 'x-api-key': NETWORKER_KEY! },
    next: { revalidate: 60 }, // Cache for 60s
  })
  if (!res.ok) throw new Error(`Networker contact fetch failed: ${res.status}`)
  const data = await res.json()
  return data.data
}

export async function notifySolutionEvent(event: {
  type: 'solution.created' | 'solution.payment' | 'solution.completed'
  contact_id: string
  solution_name: string
  department_name: string
  amount?: number
  notes?: string
}) {
  const url = `${NETWORKER_URL}/api/webhooks/solution-event`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'x-api-key': NETWORKER_KEY!,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(event),
  })
  if (!res.ok) {
    // Log but don't fail — webhook is best-effort
    console.error('Networker webhook failed:', res.status, await res.text())
  }
  return res.ok
}
```

### 2. Server Action for Contact Search

Create `app/(app)/solutions/actions.ts` (or add to existing):

```typescript
'use server'

import { searchContacts } from '@/lib/networker/client'

export async function searchNetworkerContacts(query: string) {
  if (!query || query.length < 2) return { data: [], pagination: { total: 0 } }
  return searchContacts(query, 10)
}
```

### 3. Client Picker Component

Build a combobox/search input that:
1. User types 2+ characters
2. Debounced server action calls Networker search
3. Dropdown shows: **Name** — Organization (temperature badge)
4. Selecting a contact sets `networker_contact_id`, `client_name`, `client_organization` on the form
5. Show selected contact as a card (name, org, role, sector)

### 4. When to Call the Webhook

| MyJKKN Event | Webhook Call |
|-------------|-------------|
| Solution created with a `networker_contact_id` | `solution.created` |
| Payment recorded on a solution with `networker_contact_id` | `solution.payment` (include `amount`) |
| Solution status changed to "completed"/"delivered" | `solution.completed` |

**Important:** Only call the webhook if `networker_contact_id` is not null. Solutions without a Networker contact (manual entry) should skip the webhook.

### 5. Where to Show Client Info

| Page | What to Show |
|------|-------------|
| Solution creation form | Contact picker (search Networker) |
| Solution detail page | Client card (name, org, role, temperature badge, link to Networker) |
| Department detail page | Client list derived from solutions with `networker_contact_id` |
| Solution list/table | Client name column (from cached `client_name`) |

---

## Webhook Fire-and-Forget Pattern

The webhook should be called **after** the primary database operation succeeds, and should **not block** the user response. If Networker is down, the solution still gets created — the webhook is best-effort.

```typescript
// In your solution creation logic:
const solution = await createSolution(data) // Primary operation

// Fire and forget — don't await in the user's request path
if (solution.networker_contact_id) {
  notifySolutionEvent({
    type: 'solution.created',
    contact_id: solution.networker_contact_id,
    solution_name: solution.title,
    department_name: departmentName,
  }).catch(err => console.error('Webhook failed:', err))
}
```

---

## Testing the Integration

### Quick Smoke Test (from terminal)

```bash
# Set vars
export NETWORKER_API_URL=https://networker-theta.vercel.app
export NETWORKER_API_KEY=nk_db164f38c3b57d5015f0a9d55a737df9ad3f5f9e603f73242748ded0b3fad513

# Search
curl -s -H "x-api-key: $NETWORKER_API_KEY" "$NETWORKER_API_URL/api/contacts/search?q=Vivek&limit=3"

# Get contact
curl -s -H "x-api-key: $NETWORKER_API_KEY" "$NETWORKER_API_URL/api/contacts/7fd664c5-c7e6-4e9e-80ea-b94c1ce9390e"

# Webhook test
curl -s -X POST -H "x-api-key: $NETWORKER_API_KEY" -H "Content-Type: application/json" \
  -d '{"type":"solution.created","contact_id":"7fd664c5-c7e6-4e9e-80ea-b94c1ce9390e","solution_name":"Test Solution","department_name":"Test Dept"}' \
  "$NETWORKER_API_URL/api/webhooks/solution-event"
```

### Vercel Environment Variables Needed

| Variable | Value |
|----------|-------|
| `NETWORKER_API_URL` | `https://networker-theta.vercel.app` |
| `NETWORKER_API_KEY` | `nk_db164f38c3b57d5015f0a9d55a737df9ad3f5f9e603f73242748ded0b3fad513` |

---

## Edge Cases to Handle

| Scenario | How to Handle |
|----------|--------------|
| Networker is down | Show error toast, let user save solution without client link |
| Contact deleted in Networker | `client_name`/`client_organization` cached locally — show stale data with "contact no longer available" badge |
| Solution created without Networker contact | Allow — `networker_contact_id` is nullable. Manual client entry is fine. |
| Same contact linked to multiple solutions | Expected — one client can have many solutions across departments |
| Search returns 0 results | Show "No contacts found in Networker. You can enter client details manually." |

---

*Created: 2026-02-09*
*Networker API built and tested: all endpoints verified with real data (115 contacts)*
*Networker project: /Users/omm/PROJECTS/Networker*
