# BYOW WhatsApp Integration for Admission Module — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add personal WhatsApp (BYOW — Bring Your Own WhatsApp) messaging to the admission module, enabling institution-level personal WhatsApp connection via QR scan alongside the existing Meta Business API integration.

**Architecture:** A separate Express/whatsapp-web.js service deployed on Railway handles the WhatsApp Web protocol and session persistence. The Next.js app communicates with it via authenticated HTTP API calls. A new `wa_personal_connections` table tracks per-institution BYOW connections. The existing chat inbox gains a "Personal WhatsApp" tab for dual-channel messaging.

**Tech Stack:** whatsapp-web.js, Puppeteer, Express (Railway service), Next.js 14 App Router, Supabase (Postgres + RLS), React Query, shadcn/ui, TypeScript

---

## File Structure

### New Files

| File | Responsibility |
|------|----------------|
| `whatsapp-service/` (root-level, separate deploy) | Railway-deployed Express service for whatsapp-web.js |
| `types/whatsapp-personal.ts` | BYOW-specific TypeScript types |
| `lib/whatsapp/personal-api-client.ts` | HTTP client for Railway service |
| `app/actions/whatsapp-personal.ts` | Server actions (thin wrappers for direct component use) |
| `lib/services/whatsapp/whatsapp-personal-connection-service.ts` | Supabase CRUD for `wa_personal_connections` |
| `lib/services/whatsapp/whatsapp-personal-message-service.ts` | Supabase CRUD for `wa_personal_message_logs` |
| `hooks/admission/use-whatsapp-personal.ts` | React Query hooks for BYOW |
| `components/whatsapp/personal-connect.tsx` | QR code connection UI component |
| `components/whatsapp/send-personal-message-dialog.tsx` | Send message dialog with channel selector |
| `app/(routes)/admission/settings/whatsapp-numbers/_components/personal-connection-tab.tsx` | Settings tab for BYOW connection |
| `app/api/admission/whatsapp-personal/status/route.ts` | API route: connection status |
| `app/api/admission/whatsapp-personal/connect/route.ts` | API route: initiate connection |
| `app/api/admission/whatsapp-personal/disconnect/route.ts` | API route: disconnect |
| `app/api/admission/whatsapp-personal/send/route.ts` | API route: send message |
| `app/api/admission/whatsapp-personal/send-bulk/route.ts` | API route: bulk send |

### Modified Files

| File | Change |
|------|--------|
| `supabase/setup/01_tables.sql` | Add `wa_personal_connections` + `wa_personal_message_logs` tables |
| `supabase/setup/03_policies.sql` | Add RLS policies for new tables |
| `supabase/setup/04_triggers.sql` | Add `updated_at` triggers |
| `supabase/SQL_FILE_INDEX.md` | Update index with new tables |
| `types/whatsapp.ts` | Add BYOW connection state types |
| `app/(routes)/admission/settings/whatsapp-numbers/page.tsx` | Add "Personal WhatsApp" tab |
| `app/(routes)/admission/marketing/chat/page.tsx` | Add channel filter (Business / Personal) |
| `app/(routes)/admission/counselors/daily-view/_components/followup-card.tsx` | Add personal WhatsApp message button |
| `app/(routes)/admission/leads/[id]/page.tsx` | Add "Send via Personal WhatsApp" action |
| `.env` | Add `WHATSAPP_PERSONAL_SERVICE_URL`, `WHATSAPP_PERSONAL_API_KEY` |

---

## Chunk 1: Railway Service + Database Foundation

### Task 1: Deploy Basic WhatsApp Service to Railway

**Files:**
- Create: `whatsapp-service/src/index.ts` (TypeScript entry point)
- Create: `whatsapp-service/src/routes/` (route handlers)
- Create: `whatsapp-service/src/whatsapp.ts` (whatsapp-web.js client wrapper)
- Create: `whatsapp-service/package.json`
- Create: `whatsapp-service/tsconfig.json`
- Create: `whatsapp-service/Dockerfile`
- Reference: `.claude/skills/byow-whatsapp/templates/whatsapp-service/` (copy and adapt)

- [ ] **Step 1: Copy the basic service template**

```bash
cp -r .claude/skills/byow-whatsapp/templates/whatsapp-service ./whatsapp-service
```

- [ ] **Step 2: Verify the service files exist**

```bash
ls whatsapp-service/
# Expected: Dockerfile, package.json, tsconfig.json, src/
ls whatsapp-service/src/
# Expected: index.ts, whatsapp.ts, routes/
```

- [ ] **Step 3: Review and adapt `whatsapp-service/src/index.ts`**

The service template is **TypeScript** and provides 6 endpoints. Verify these are present:

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/health` | GET | Health check (no auth) |
| `/connect` | POST | Initialize client, get QR |
| `/status` | GET | Connection status + QR code |
| `/send` | POST | Send single message |
| `/send-bulk` | POST | Send to multiple recipients |
| `/disconnect` | POST | Logout and cleanup |

Key configuration to verify/update in `src/index.ts`:
- `API_KEY` env var check on all routes except `/health`
- `ALLOWED_ORIGINS` for CORS (must include your Next.js app URL)
- `PUPPETEER_EXECUTABLE_PATH` for Railway's Chromium
- Session path at `.wwebjs_auth/` for Railway volume mount
- Phone number format: `91XXXXXXXXXX@c.us` (India country code)

- [ ] **Step 4: Verify the Dockerfile compiles TypeScript and has Railway-compatible Chromium**

Expected Dockerfile structure (note the `RUN npm run build` step for TypeScript):
```dockerfile
FROM node:18-slim
RUN apt-get update && apt-get install -y chromium fonts-liberation \
    libasound2 libatk-bridge2.0-0 libatk1.0-0 libcups2 libdbus-1-3 \
    libdrm2 libgbm1 libgtk-3-0 libnspr4 libnss3 libx11-xcb1 \
    libxcomposite1 libxdamage1 libxrandr2 xdg-utils --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
EXPOSE 3001
CMD ["npm", "start"]
```

Verify `package.json` has:
```json
{
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js"
  }
}
```

- [ ] **Step 5: Test the service locally (optional, requires Chrome)**

```bash
cd whatsapp-service && npm install && npm run build && npm start
# Expected: Server listening on port 3001
# Test: curl http://localhost:3001/health
# Expected: { "status": "ok" }
```

- [ ] **Step 6: Commit the service directory**

```bash
git add whatsapp-service/
git commit -m "feat(admission): add BYOW WhatsApp service for Railway deployment"
```

> **Deployment Note:** Railway deployment is done separately via Railway CLI or GitHub integration. Requirements:
> - Railway project with volume at `/app/.wwebjs_auth` (1GB)
> - Env vars: `API_KEY`, `ALLOWED_ORIGINS`, `PORT=3001`, `PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium`
> - Generate API key: `openssl rand -base64 32`

---

### Task 2: Add Database Tables for BYOW

**Files:**
- Modify: `supabase/setup/01_tables.sql`
- Modify: `supabase/setup/03_policies.sql`
- Modify: `supabase/setup/04_triggers.sql`
- Modify: `supabase/SQL_FILE_INDEX.md`

- [ ] **Step 1: Add `wa_personal_connections` table to `01_tables.sql`**

Append to the end of `supabase/setup/01_tables.sql`:

```sql
-- =============================================================================
-- BYOW WhatsApp Personal Connections
-- Tracks institution-level personal WhatsApp connections (via QR scan)
-- Added: 2026-03-16
-- =============================================================================

CREATE TABLE IF NOT EXISTS wa_personal_connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,

    -- Connection status: disconnected → connecting → qr_ready → authenticated → ready
    status TEXT NOT NULL DEFAULT 'disconnected'
        CHECK (status IN ('disconnected', 'connecting', 'qr_ready', 'authenticated', 'ready')),

    -- Connected WhatsApp account info
    phone_number TEXT,
    push_name TEXT,

    -- Who connected this account
    connected_by UUID REFERENCES auth.users(id),
    connected_at TIMESTAMPTZ,
    disconnected_at TIMESTAMPTZ,

    -- Service configuration (points to Railway instance)
    service_url TEXT,

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- One personal connection per institution
    UNIQUE(institution_id)
);

-- Index for quick lookups
CREATE INDEX IF NOT EXISTS idx_wa_personal_connections_institution
    ON wa_personal_connections(institution_id);
CREATE INDEX IF NOT EXISTS idx_wa_personal_connections_status
    ON wa_personal_connections(status);
```

- [ ] **Step 2: Add `wa_personal_message_logs` table to `01_tables.sql`**

Append after the connections table:

```sql
-- =============================================================================
-- BYOW WhatsApp Personal Message Logs
-- Audit trail for messages sent via personal WhatsApp
-- Added: 2026-03-16
-- =============================================================================

CREATE TABLE IF NOT EXISTS wa_personal_message_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
    connection_id UUID NOT NULL REFERENCES wa_personal_connections(id) ON DELETE CASCADE,

    -- Recipient
    recipient_type TEXT NOT NULL CHECK (recipient_type IN ('individual', 'group', 'bulk')),
    recipient_phone TEXT NOT NULL,
    recipient_name TEXT,

    -- Message
    message_content TEXT NOT NULL,
    message_preview TEXT,  -- First 100 chars for display

    -- Status tracking
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'sent', 'delivered', 'read', 'failed')),
    whatsapp_message_id TEXT,
    error_message TEXT,

    -- Lead association (optional — links message to a lead)
    lead_id UUID REFERENCES admission_leads(id) ON DELETE SET NULL,

    -- Who sent it
    sent_by UUID NOT NULL REFERENCES auth.users(id),
    sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_wa_personal_msg_logs_institution
    ON wa_personal_message_logs(institution_id);
CREATE INDEX IF NOT EXISTS idx_wa_personal_msg_logs_connection
    ON wa_personal_message_logs(connection_id);
CREATE INDEX IF NOT EXISTS idx_wa_personal_msg_logs_lead
    ON wa_personal_message_logs(lead_id);
CREATE INDEX IF NOT EXISTS idx_wa_personal_msg_logs_sent_at
    ON wa_personal_message_logs(sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_wa_personal_msg_logs_status
    ON wa_personal_message_logs(status);
```

- [ ] **Step 3: Add RLS policies to `03_policies.sql`**

Append to `supabase/setup/03_policies.sql`:

```sql
-- =============================================================================
-- BYOW WhatsApp Personal Connections — RLS
-- Added: 2026-03-16
-- Pattern: auth_institution_id() + super_admin bypass + admission custom role
-- (matches existing admission RLS pattern from 03_policies.sql:2529+)
-- =============================================================================

ALTER TABLE wa_personal_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wa_personal_conn_select" ON wa_personal_connections FOR SELECT USING (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  OR EXISTS (
    SELECT 1 FROM user_roles ur
    JOIN custom_roles cr ON ur.role_id = cr.id
    WHERE ur.user_id = auth.uid()
    AND cr.role_key = 'admission'
  )
);
CREATE POLICY "wa_personal_conn_insert" ON wa_personal_connections FOR INSERT WITH CHECK (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  OR EXISTS (
    SELECT 1 FROM user_roles ur
    JOIN custom_roles cr ON ur.role_id = cr.id
    WHERE ur.user_id = auth.uid()
    AND cr.role_key = 'admission'
  )
);
CREATE POLICY "wa_personal_conn_update" ON wa_personal_connections FOR UPDATE USING (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  OR EXISTS (
    SELECT 1 FROM user_roles ur
    JOIN custom_roles cr ON ur.role_id = cr.id
    WHERE ur.user_id = auth.uid()
    AND cr.role_key = 'admission'
  )
);
CREATE POLICY "wa_personal_conn_delete" ON wa_personal_connections FOR DELETE USING (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  OR EXISTS (
    SELECT 1 FROM user_roles ur
    JOIN custom_roles cr ON ur.role_id = cr.id
    WHERE ur.user_id = auth.uid()
    AND cr.role_key = 'admission'
  )
);

-- =============================================================================
-- BYOW WhatsApp Personal Message Logs — RLS
-- Added: 2026-03-16
-- =============================================================================

ALTER TABLE wa_personal_message_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wa_personal_msg_select" ON wa_personal_message_logs FOR SELECT USING (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  OR EXISTS (
    SELECT 1 FROM user_roles ur
    JOIN custom_roles cr ON ur.role_id = cr.id
    WHERE ur.user_id = auth.uid()
    AND cr.role_key = 'admission'
  )
);
CREATE POLICY "wa_personal_msg_insert" ON wa_personal_message_logs FOR INSERT WITH CHECK (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  OR EXISTS (
    SELECT 1 FROM user_roles ur
    JOIN custom_roles cr ON ur.role_id = cr.id
    WHERE ur.user_id = auth.uid()
    AND cr.role_key = 'admission'
  )
);
CREATE POLICY "wa_personal_msg_update" ON wa_personal_message_logs FOR UPDATE USING (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  OR EXISTS (
    SELECT 1 FROM user_roles ur
    JOIN custom_roles cr ON ur.role_id = cr.id
    WHERE ur.user_id = auth.uid()
    AND cr.role_key = 'admission'
  )
);
```

- [ ] **Step 4: Add triggers to `04_triggers.sql`**

Append to `supabase/setup/04_triggers.sql`:

```sql
-- BYOW WhatsApp Personal Connections updated_at trigger (Added: 2026-03-16)
CREATE TRIGGER wa_personal_connections_updated_at
    BEFORE UPDATE ON wa_personal_connections
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- BYOW WhatsApp Personal Message Logs updated_at trigger (Added: 2026-03-16)
CREATE TRIGGER wa_personal_message_logs_updated_at
    BEFORE UPDATE ON wa_personal_message_logs
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
```

- [ ] **Step 5: Run the SQL in Supabase**

Execute the new table definitions, policies, and triggers via Supabase Dashboard SQL Editor or MCP:

```sql
-- Run the CREATE TABLE statements from Step 1 & 2
-- Run the RLS policies from Step 3
-- Run the trigger from Step 4
```

Verify:
```sql
SELECT table_name FROM information_schema.tables
WHERE table_name IN ('wa_personal_connections', 'wa_personal_message_logs');
-- Expected: 2 rows
```

- [ ] **Step 6: Update `supabase/SQL_FILE_INDEX.md`**

Add entries for the new tables:

```markdown
### BYOW WhatsApp Personal (Added: 2026-03-16)
- `wa_personal_connections` — Institution-level personal WhatsApp connections via QR scan
  - Tables: `01_tables.sql`
  - Policies: `03_policies.sql`
  - Triggers: `04_triggers.sql`
- `wa_personal_message_logs` — Audit trail for messages sent via personal WhatsApp
  - Tables: `01_tables.sql`
  - Policies: `03_policies.sql`
```

- [ ] **Step 7: Commit database changes**

```bash
git add supabase/setup/01_tables.sql supabase/setup/03_policies.sql supabase/setup/04_triggers.sql supabase/SQL_FILE_INDEX.md
git commit -m "feat(admission): add database tables for BYOW WhatsApp personal connections"
```

---

### Task 3: Add Environment Variables

**Files:**
- Modify: `.env` (local)
- Reference: `whatsapp-service/` env configuration

- [ ] **Step 1: Add BYOW env vars to `.env`**

```env
# BYOW WhatsApp Personal Service (Railway)
WHATSAPP_PERSONAL_SERVICE_URL=https://your-service.railway.app
WHATSAPP_PERSONAL_API_KEY=your-railway-api-key
```

> **Note:** These values will be set after Railway deployment. For local development, point to `http://localhost:3001` if running the service locally.

- [ ] **Step 2: Do NOT commit `.env` — verify it's in `.gitignore`**

```bash
grep ".env" .gitignore
# Expected: .env or .env.local listed
```

---

## Chunk 2: Types + API Client + Server Actions

### Task 4: Add BYOW TypeScript Types

**Files:**
- Create: `types/whatsapp-personal.ts`

- [ ] **Step 1: Create the BYOW types file**

```typescript
// types/whatsapp-personal.ts
// Types for BYOW (Bring Your Own WhatsApp) personal connections
// Separate from types/whatsapp.ts which covers the Meta Business API integration

// ---------------------------------------------------------------------------
// Connection states
// ---------------------------------------------------------------------------

export type PersonalConnectionState =
  | 'disconnected'
  | 'connecting'
  | 'qr_ready'
  | 'authenticated'
  | 'ready';

// ---------------------------------------------------------------------------
// Railway service API responses
// ---------------------------------------------------------------------------

export interface PersonalWhatsAppStatus {
  success: boolean;
  status: PersonalConnectionState;
  qrCode?: string | null;
  clientInfo?: {
    phoneNumber?: string;
    pushName?: string;
  } | null;
  timestamp: string;
}

export interface PersonalConnectResponse {
  success: boolean;
  status: PersonalConnectionState;
  qrCode?: string;
  message: string;
}

export interface PersonalSendResponse {
  success: boolean;
  messageId?: string;
  timestamp?: number;
  error?: string;
}

export interface PersonalBulkSendResult {
  phone: string;
  success: boolean;
  error?: string;
}

export interface PersonalBulkSendResponse {
  success: boolean;
  totalSent: number;
  successCount: number;
  failCount: number;
  results: PersonalBulkSendResult[];
  error?: string;
}

export interface PersonalRecipient {
  phone: string;
  message: string;
}

// ---------------------------------------------------------------------------
// Database models (wa_personal_connections)
// ---------------------------------------------------------------------------

export interface PersonalWhatsAppConnection {
  id: string;
  institution_id: string;
  status: PersonalConnectionState;
  phone_number: string | null;
  push_name: string | null;
  connected_by: string | null;
  connected_at: string | null;
  disconnected_at: string | null;
  service_url: string | null;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Database models (wa_personal_message_logs)
// ---------------------------------------------------------------------------

export interface PersonalMessageLog {
  id: string;
  institution_id: string;
  connection_id: string;
  recipient_type: 'individual' | 'group' | 'bulk';
  recipient_phone: string;
  recipient_name: string | null;
  message_content: string;
  message_preview: string | null;
  status: 'pending' | 'sent' | 'delivered' | 'read' | 'failed';
  whatsapp_message_id: string | null;
  error_message: string | null;
  lead_id: string | null;
  sent_by: string;
  sent_at: string;
  created_at: string;
  updated_at: string;
}

export interface PersonalMessageLogFilters {
  institution_id: string;
  connection_id?: string;
  recipient_type?: 'individual' | 'group' | 'bulk';
  status?: 'pending' | 'sent' | 'delivered' | 'read' | 'failed';
  lead_id?: string;
  sent_by?: string;
  date_from?: string;
  date_to?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export interface PersonalMessageLogListResponse {
  data: PersonalMessageLog[];
  metadata: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}
```

- [ ] **Step 2: Commit types**

```bash
git add types/whatsapp-personal.ts
git commit -m "feat(admission): add TypeScript types for BYOW WhatsApp personal connections"
```

---

### Task 5: Create BYOW API Client

**Files:**
- Create: `lib/whatsapp/personal-api-client.ts`
- Reference: `.claude/skills/byow-whatsapp/templates/nextjs-integration/lib/whatsapp/api-client.ts`

- [ ] **Step 1: Create the API client**

Adapt the template to use institution-specific service URLs (from `wa_personal_connections` table) instead of global env vars:

```typescript
// lib/whatsapp/personal-api-client.ts
// HTTP client for the BYOW WhatsApp Railway service
// Communicates with the Express service running whatsapp-web.js

import type {
  PersonalWhatsAppStatus,
  PersonalConnectResponse,
  PersonalSendResponse,
  PersonalBulkSendResponse,
  PersonalRecipient,
} from '@/types/whatsapp-personal';

// ---------------------------------------------------------------------------
// Core HTTP client
// ---------------------------------------------------------------------------

/**
 * Make an authenticated request to the Railway WhatsApp service.
 * Falls back to env vars if no explicit URL/key provided (single-institution mode).
 */
async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {},
  serviceConfig?: { serviceUrl: string; apiKey: string }
): Promise<T> {
  const serviceUrl = serviceConfig?.serviceUrl || process.env.WHATSAPP_PERSONAL_SERVICE_URL;
  const apiKey = serviceConfig?.apiKey || process.env.WHATSAPP_PERSONAL_API_KEY;

  if (!serviceUrl) {
    throw new Error('BYOW WhatsApp service URL not configured');
  }
  if (!apiKey) {
    throw new Error('BYOW WhatsApp API key not configured');
  }

  const url = `${serviceUrl}${endpoint}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': apiKey,
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `BYOW API error: ${response.status}`);
  }

  return response.json();
}

// ---------------------------------------------------------------------------
// Public API functions
// ---------------------------------------------------------------------------

/** Initialize WhatsApp connection and get QR code */
export async function personalConnectAPI(
  config?: { serviceUrl: string; apiKey: string }
): Promise<PersonalConnectResponse> {
  return apiRequest<PersonalConnectResponse>('/connect', { method: 'POST' }, config);
}

/** Get current connection status (includes QR code if in qr_ready state) */
export async function personalGetStatusAPI(
  config?: { serviceUrl: string; apiKey: string }
): Promise<PersonalWhatsAppStatus> {
  return apiRequest<PersonalWhatsAppStatus>('/status', { method: 'GET' }, config);
}

/** Send a single message */
export async function personalSendMessageAPI(
  to: string,
  message: string,
  config?: { serviceUrl: string; apiKey: string }
): Promise<PersonalSendResponse> {
  return apiRequest<PersonalSendResponse>(
    '/send',
    { method: 'POST', body: JSON.stringify({ to, message }) },
    config
  );
}

/** Send messages to multiple recipients with delay between each */
export async function personalSendBulkAPI(
  recipients: PersonalRecipient[],
  delayMs: number = 1500,
  config?: { serviceUrl: string; apiKey: string }
): Promise<PersonalBulkSendResponse> {
  return apiRequest<PersonalBulkSendResponse>(
    '/send-bulk',
    { method: 'POST', body: JSON.stringify({ recipients, delayMs }) },
    config
  );
}

/** Disconnect from WhatsApp (logs out, clears session) */
export async function personalDisconnectAPI(
  config?: { serviceUrl: string; apiKey: string }
): Promise<{ success: boolean; message: string }> {
  return apiRequest('/disconnect', { method: 'POST' }, config);
}
```

- [ ] **Step 2: Commit API client**

```bash
git add lib/whatsapp/personal-api-client.ts
git commit -m "feat(admission): add BYOW WhatsApp API client for Railway service"
```

---

### Task 6: Create Server Actions

**Files:**
- Create: `app/actions/whatsapp-personal.ts`
- Reference: `.claude/skills/byow-whatsapp/templates/nextjs-integration/app/actions/whatsapp.ts`

- [ ] **Step 1: Create server actions**

```typescript
// app/actions/whatsapp-personal.ts
'use server';

// Server actions for BYOW WhatsApp personal connections.
// Wraps the API client with error handling and validation.

import {
  personalConnectAPI,
  personalGetStatusAPI,
  personalSendMessageAPI,
  personalSendBulkAPI,
  personalDisconnectAPI,
} from '@/lib/whatsapp/personal-api-client';
import type { PersonalRecipient } from '@/types/whatsapp-personal';

// NOTE: Server actions resolve service config from env vars internally.
// The `config` parameter is NOT exposed — API routes handle per-institution
// config lookup from the database before calling these actions.

/** Initiate WhatsApp connection — returns QR code for scanning */
export async function connectPersonalWhatsApp() {
  try {
    return await personalConnectAPI();
  } catch (error) {
    console.error('[whatsapp-personal] Connect error:', error);
    return {
      success: false,
      status: 'disconnected' as const,
      message: error instanceof Error ? error.message : 'Failed to connect',
    };
  }
}

/** Get connection status (poll this to check QR scan progress) */
export async function getPersonalWhatsAppStatus() {
  try {
    return await personalGetStatusAPI();
  } catch (error) {
    console.error('[whatsapp-personal] Status error:', error);
    return {
      success: false,
      status: 'disconnected' as const,
      qrCode: null,
      clientInfo: null,
      timestamp: new Date().toISOString(),
    };
  }
}

/** Send a single message via personal WhatsApp */
export async function sendPersonalWhatsAppMessage(to: string, message: string) {
  try {
    if (!to || !message) {
      return { success: false, error: 'Phone number and message are required' };
    }
    if (message.length > 4096) {
      return { success: false, error: 'Message too long (max 4096 characters)' };
    }
    return await personalSendMessageAPI(to, message);
  } catch (error) {
    console.error('[whatsapp-personal] Send error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to send message',
    };
  }
}

/** Send messages to multiple recipients via personal WhatsApp */
export async function sendBulkPersonalWhatsAppMessages(
  recipients: PersonalRecipient[],
  delayMs: number = 1500
) {
  try {
    if (!recipients || recipients.length === 0) {
      return { success: false, error: 'At least one recipient is required' };
    }
    for (const r of recipients) {
      if (!r.phone || !r.message) {
        return { success: false, error: 'Each recipient must have phone and message' };
      }
    }
    return await personalSendBulkAPI(recipients, delayMs);
  } catch (error) {
    console.error('[whatsapp-personal] Bulk send error:', error);
    return {
      success: false,
      totalSent: 0,
      successCount: 0,
      failCount: 0,
      results: [],
      error: error instanceof Error ? error.message : 'Failed to send bulk messages',
    };
  }
}

/** Disconnect personal WhatsApp (logs out, clears session) */
export async function disconnectPersonalWhatsApp() {
  try {
    return await personalDisconnectAPI();
  } catch (error) {
    console.error('[whatsapp-personal] Disconnect error:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Failed to disconnect',
    };
  }
}
```

- [ ] **Step 2: Commit server actions**

```bash
git add app/actions/whatsapp-personal.ts
git commit -m "feat(admission): add server actions for BYOW WhatsApp personal messaging"
```

---

### Task 7: Create Supabase Services

**Files:**
- Create: `lib/services/whatsapp/whatsapp-personal-connection-service.ts`
- Create: `lib/services/whatsapp/whatsapp-personal-message-service.ts`
- Reference: `lib/services/whatsapp/whatsapp-settings-service.ts` (pattern)

- [ ] **Step 1: Create the personal connection service**

```typescript
// lib/services/whatsapp/whatsapp-personal-connection-service.ts
// Manages wa_personal_connections table — one row per institution

import { createClient } from '@supabase/supabase-js';
import type {
  PersonalWhatsAppConnection,
  PersonalConnectionState,
} from '@/types/whatsapp-personal';

// Service role client (bypasses RLS)
function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase service role credentials');
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export class WhatsAppPersonalConnectionService {
  /** Get the personal connection for an institution */
  static async getConnection(
    institutionId: string
  ): Promise<PersonalWhatsAppConnection | null> {
    const supabase = getServiceClient();

    const { data, error } = await supabase
      .from('wa_personal_connections')
      .select('*')
      .eq('institution_id', institutionId)
      .maybeSingle();

    if (error) {
      console.error('[whatsapp-personal] getConnection error:', error.message);
      return null;
    }

    return data as PersonalWhatsAppConnection | null;
  }

  /** Create or update the personal connection for an institution */
  static async upsertConnection(
    institutionId: string,
    updates: Partial<PersonalWhatsAppConnection>
  ): Promise<PersonalWhatsAppConnection | null> {
    const supabase = getServiceClient();

    const { id: _id, institution_id: _inst, created_at: _ca, updated_at: _ua, ...payload } =
      updates as any;

    const { data, error } = await supabase
      .from('wa_personal_connections')
      .upsert(
        {
          institution_id: institutionId,
          ...payload,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'institution_id' }
      )
      .select('*')
      .single();

    if (error) {
      console.error('[whatsapp-personal] upsertConnection error:', error.message);
      return null;
    }

    return data as PersonalWhatsAppConnection;
  }

  /** Update just the connection status */
  static async updateStatus(
    institutionId: string,
    status: PersonalConnectionState,
    extra?: { phone_number?: string; push_name?: string; connected_by?: string }
  ): Promise<void> {
    const supabase = getServiceClient();

    const updateData: Record<string, unknown> = {
      status,
      updated_at: new Date().toISOString(),
    };

    if (status === 'ready') {
      updateData.connected_at = new Date().toISOString();
      if (extra?.phone_number) updateData.phone_number = extra.phone_number;
      if (extra?.push_name) updateData.push_name = extra.push_name;
      if (extra?.connected_by) updateData.connected_by = extra.connected_by;
    }

    if (status === 'disconnected') {
      updateData.disconnected_at = new Date().toISOString();
    }

    const { error } = await supabase
      .from('wa_personal_connections')
      .update(updateData)
      .eq('institution_id', institutionId);

    if (error) {
      console.error('[whatsapp-personal] updateStatus error:', error.message);
    }
  }

  /** Delete the personal connection for an institution */
  static async deleteConnection(institutionId: string): Promise<boolean> {
    const supabase = getServiceClient();

    const { error } = await supabase
      .from('wa_personal_connections')
      .delete()
      .eq('institution_id', institutionId);

    if (error) {
      console.error('[whatsapp-personal] deleteConnection error:', error.message);
      return false;
    }

    return true;
  }

  /** Check if institution has an active personal WhatsApp connection */
  static async isConnected(institutionId: string): Promise<boolean> {
    const conn = await this.getConnection(institutionId);
    return conn?.status === 'ready';
  }
}
```

- [ ] **Step 2: Create the personal message log service**

```typescript
// lib/services/whatsapp/whatsapp-personal-message-service.ts
// Manages wa_personal_message_logs table — audit trail for personal WA messages

import { createClient } from '@supabase/supabase-js';
import type {
  PersonalMessageLog,
  PersonalMessageLogFilters,
  PersonalMessageLogListResponse,
} from '@/types/whatsapp-personal';

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase service role credentials');
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export class WhatsAppPersonalMessageService {
  /** Log a sent message */
  static async logMessage(params: {
    institution_id: string;
    connection_id: string;
    recipient_type: 'individual' | 'group' | 'bulk';
    recipient_phone: string;
    recipient_name?: string;
    message_content: string;
    lead_id?: string;
    sent_by: string;
    status?: 'pending' | 'sent' | 'failed';
    whatsapp_message_id?: string;
    error_message?: string;
  }): Promise<PersonalMessageLog | null> {
    const supabase = getServiceClient();

    const { data, error } = await supabase
      .from('wa_personal_message_logs')
      .insert({
        institution_id: params.institution_id,
        connection_id: params.connection_id,
        recipient_type: params.recipient_type,
        recipient_phone: params.recipient_phone,
        recipient_name: params.recipient_name || null,
        message_content: params.message_content,
        message_preview: params.message_content.substring(0, 100),
        lead_id: params.lead_id || null,
        sent_by: params.sent_by,
        status: params.status || 'pending',
        whatsapp_message_id: params.whatsapp_message_id || null,
        error_message: params.error_message || null,
      })
      .select()
      .single();

    if (error) {
      console.error('[whatsapp-personal] logMessage error:', error.message);
      return null;
    }

    return data as PersonalMessageLog;
  }

  /** Batch-log multiple messages (single insert for bulk sends) */
  static async logMessageBatch(messages: {
    institution_id: string;
    connection_id: string;
    recipient_type: 'individual' | 'group' | 'bulk';
    recipient_phone: string;
    recipient_name?: string;
    message_content: string;
    lead_id?: string;
    sent_by: string;
    status?: 'pending' | 'sent' | 'failed';
    whatsapp_message_id?: string;
    error_message?: string;
  }[]): Promise<void> {
    if (messages.length === 0) return;
    const supabase = getServiceClient();

    const rows = messages.map((m) => ({
      institution_id: m.institution_id,
      connection_id: m.connection_id,
      recipient_type: m.recipient_type,
      recipient_phone: m.recipient_phone,
      recipient_name: m.recipient_name || null,
      message_content: m.message_content,
      message_preview: m.message_content.substring(0, 100),
      lead_id: m.lead_id || null,
      sent_by: m.sent_by,
      status: m.status || 'pending',
      whatsapp_message_id: m.whatsapp_message_id || null,
      error_message: m.error_message || null,
    }));

    const { error } = await supabase
      .from('wa_personal_message_logs')
      .insert(rows);

    if (error) {
      console.error('[whatsapp-personal] logMessageBatch error:', error.message);
    }
  }

  /** Update message status (e.g., pending → sent → delivered) */
  static async updateStatus(
    messageId: string,
    status: 'sent' | 'delivered' | 'read' | 'failed',
    extra?: { whatsapp_message_id?: string; error_message?: string }
  ): Promise<void> {
    const supabase = getServiceClient();

    const updateData: Record<string, unknown> = { status };
    if (extra?.whatsapp_message_id) updateData.whatsapp_message_id = extra.whatsapp_message_id;
    if (extra?.error_message) updateData.error_message = extra.error_message;

    const { error } = await supabase
      .from('wa_personal_message_logs')
      .update(updateData)
      .eq('id', messageId);

    if (error) {
      console.error('[whatsapp-personal] updateStatus error:', error.message);
    }
  }

  /** List messages with filters and pagination */
  static async listMessages(
    filters: PersonalMessageLogFilters
  ): Promise<PersonalMessageLogListResponse> {
    const supabase = getServiceClient();
    const page = filters.page || 1;
    const limit = filters.limit || 25;
    const offset = (page - 1) * limit;

    let query = supabase
      .from('wa_personal_message_logs')
      .select('*', { count: 'exact' })
      .eq('institution_id', filters.institution_id)
      .order('sent_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (filters.connection_id) query = query.eq('connection_id', filters.connection_id);
    if (filters.recipient_type) query = query.eq('recipient_type', filters.recipient_type);
    if (filters.status) query = query.eq('status', filters.status);
    if (filters.lead_id) query = query.eq('lead_id', filters.lead_id);
    if (filters.sent_by) query = query.eq('sent_by', filters.sent_by);
    if (filters.date_from) query = query.gte('sent_at', filters.date_from);
    if (filters.date_to) query = query.lte('sent_at', filters.date_to);
    if (filters.search) {
      query = query.or(
        `recipient_phone.ilike.%${filters.search}%,recipient_name.ilike.%${filters.search}%,message_preview.ilike.%${filters.search}%`
      );
    }

    const { data, error, count } = await query;

    if (error) {
      console.error('[whatsapp-personal] listMessages error:', error.message);
      return { data: [], metadata: { total: 0, page, limit, totalPages: 0 } };
    }

    const total = count || 0;
    return {
      data: (data || []) as PersonalMessageLog[],
      metadata: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /** Get messages for a specific lead */
  static async getLeadMessages(
    institutionId: string,
    leadId: string
  ): Promise<PersonalMessageLog[]> {
    const supabase = getServiceClient();

    const { data, error } = await supabase
      .from('wa_personal_message_logs')
      .select('*')
      .eq('institution_id', institutionId)
      .eq('lead_id', leadId)
      .order('sent_at', { ascending: false });

    if (error) {
      console.error('[whatsapp-personal] getLeadMessages error:', error.message);
      return [];
    }

    return (data || []) as PersonalMessageLog[];
  }
}
```

- [ ] **Step 3: Commit services**

```bash
git add lib/services/whatsapp/whatsapp-personal-connection-service.ts lib/services/whatsapp/whatsapp-personal-message-service.ts
git commit -m "feat(admission): add Supabase services for BYOW WhatsApp connections and message logs"
```

---

## Chunk 3: API Routes + React Query Hooks

### Task 8: Create API Routes

**Files:**
- Create: `app/api/admission/whatsapp-personal/status/route.ts`
- Create: `app/api/admission/whatsapp-personal/connect/route.ts`
- Create: `app/api/admission/whatsapp-personal/disconnect/route.ts`
- Create: `app/api/admission/whatsapp-personal/send/route.ts`
- Create: `app/api/admission/whatsapp-personal/send-bulk/route.ts`

- [ ] **Step 1: Create status route**

```typescript
// app/api/admission/whatsapp-personal/status/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { WhatsAppPersonalConnectionService } from '@/lib/services/whatsapp/whatsapp-personal-connection-service';
import { personalGetStatusAPI } from '@/lib/whatsapp/personal-api-client';

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const institutionId = request.nextUrl.searchParams.get('institution_id');
  if (!institutionId) return NextResponse.json({ error: 'institution_id required' }, { status: 400 });

  // Get DB connection record
  const connection = await WhatsAppPersonalConnectionService.getConnection(institutionId);

  if (!connection) {
    return NextResponse.json({
      status: 'disconnected',
      phone_number: null,
      connected: false,
    });
  }

  // If connection has service_url, also poll the live Railway service
  if (connection.service_url && connection.status !== 'disconnected') {
    try {
      const liveStatus = await personalGetStatusAPI({
        serviceUrl: connection.service_url,
        apiKey: process.env.WHATSAPP_PERSONAL_API_KEY || '',
      });

      // Sync live status back to DB if changed
      if (liveStatus.status !== connection.status) {
        await WhatsAppPersonalConnectionService.updateStatus(
          institutionId,
          liveStatus.status,
          {
            phone_number: liveStatus.clientInfo?.phoneNumber,
            push_name: liveStatus.clientInfo?.pushName,
          }
        );
      }

      return NextResponse.json({
        ...connection,
        status: liveStatus.status,
        qr_code: liveStatus.qrCode || null,
        phone_number: liveStatus.clientInfo?.phoneNumber || connection.phone_number,
        connected: liveStatus.status === 'ready',
      });
    } catch {
      // Railway service unreachable — mark as disconnected
      await WhatsAppPersonalConnectionService.updateStatus(institutionId, 'disconnected');
      return NextResponse.json({
        ...connection,
        status: 'disconnected',
        connected: false,
        error: 'Service unreachable',
      });
    }
  }

  return NextResponse.json({
    ...connection,
    connected: connection.status === 'ready',
  });
}
```

- [ ] **Step 2: Create connect route**

```typescript
// app/api/admission/whatsapp-personal/connect/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { WhatsAppPersonalConnectionService } from '@/lib/services/whatsapp/whatsapp-personal-connection-service';
import { personalConnectAPI } from '@/lib/whatsapp/personal-api-client';

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const institutionId = body.institution_id;
  if (!institutionId) return NextResponse.json({ error: 'institution_id required' }, { status: 400 });

  // Ensure connection record exists with service URL from env
  const serviceUrl = process.env.WHATSAPP_PERSONAL_SERVICE_URL || '';

  await WhatsAppPersonalConnectionService.upsertConnection(institutionId, {
    status: 'connecting',
    service_url: serviceUrl,
    connected_by: user.id,
  });

  // Call Railway service directly via API client (config from env)
  const result = await personalConnectAPI();

  // Update status in DB
  if (result.success) {
    await WhatsAppPersonalConnectionService.updateStatus(institutionId, result.status, {
      connected_by: user.id,
    });
  }

  return NextResponse.json(result);
}
```

- [ ] **Step 3: Create disconnect route**

```typescript
// app/api/admission/whatsapp-personal/disconnect/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { WhatsAppPersonalConnectionService } from '@/lib/services/whatsapp/whatsapp-personal-connection-service';
import { personalDisconnectAPI } from '@/lib/whatsapp/personal-api-client';

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const institutionId = body.institution_id;
  if (!institutionId) return NextResponse.json({ error: 'institution_id required' }, { status: 400 });

  try {
    await personalDisconnectAPI();
  } catch {
    // Service may already be down — proceed with DB cleanup
  }

  await WhatsAppPersonalConnectionService.updateStatus(institutionId, 'disconnected');

  return NextResponse.json({ success: true, message: 'Disconnected' });
}
```

- [ ] **Step 4: Create send route**

```typescript
// app/api/admission/whatsapp-personal/send/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { WhatsAppPersonalConnectionService } from '@/lib/services/whatsapp/whatsapp-personal-connection-service';
import { WhatsAppPersonalMessageService } from '@/lib/services/whatsapp/whatsapp-personal-message-service';
import { personalSendMessageAPI } from '@/lib/whatsapp/personal-api-client';

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const { institution_id, to, message, lead_id, recipient_name } = body;

  if (!institution_id || !to || !message) {
    return NextResponse.json({ error: 'institution_id, to, and message required' }, { status: 400 });
  }

  // Verify connection is active
  const connection = await WhatsAppPersonalConnectionService.getConnection(institution_id);
  if (!connection || connection.status !== 'ready') {
    return NextResponse.json({ error: 'Personal WhatsApp not connected' }, { status: 503 });
  }

  // Log the message as pending
  const logEntry = await WhatsAppPersonalMessageService.logMessage({
    institution_id,
    connection_id: connection.id,
    recipient_type: 'individual',
    recipient_phone: to,
    recipient_name: recipient_name || null,
    message_content: message,
    lead_id: lead_id || undefined,
    sent_by: user.id,
    status: 'pending',
  });

  // Send via Railway service (API client reads config from env)
  let result: { success: boolean; messageId?: string; error?: string };
  try {
    result = await personalSendMessageAPI(to, message);
  } catch (error) {
    result = { success: false, error: error instanceof Error ? error.message : 'Send failed' };
  }

  // Update log with result
  if (logEntry) {
    await WhatsAppPersonalMessageService.updateStatus(
      logEntry.id,
      result.success ? 'sent' : 'failed',
      {
        whatsapp_message_id: result.messageId,
        error_message: result.error,
      }
    );
  }

  return NextResponse.json(result);
}
```

- [ ] **Step 5: Create send-bulk route**

```typescript
// app/api/admission/whatsapp-personal/send-bulk/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { WhatsAppPersonalConnectionService } from '@/lib/services/whatsapp/whatsapp-personal-connection-service';
import { WhatsAppPersonalMessageService } from '@/lib/services/whatsapp/whatsapp-personal-message-service';
import { personalSendBulkAPI } from '@/lib/whatsapp/personal-api-client';

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const { institution_id, recipients, delay_ms } = body;

  if (!institution_id || !recipients?.length) {
    return NextResponse.json({ error: 'institution_id and recipients required' }, { status: 400 });
  }

  const connection = await WhatsAppPersonalConnectionService.getConnection(institution_id);
  if (!connection || connection.status !== 'ready') {
    return NextResponse.json({ error: 'Personal WhatsApp not connected' }, { status: 503 });
  }

  // Send via Railway service (API client reads config from env)
  let result: { success: boolean; results?: { phone: string; success: boolean; error?: string }[]; totalSent?: number; successCount?: number; failCount?: number };
  try {
    result = await personalSendBulkAPI(recipients, delay_ms || 1500);
  } catch (error) {
    result = { success: false, results: [] };
  }

  // Batch-log all messages (single insert instead of N sequential inserts)
  if (result.results && result.results.length > 0) {
    await WhatsAppPersonalMessageService.logMessageBatch(
      result.results.map((r) => {
        const matchingRecipient = recipients.find(
          (rec: { phone: string; message: string }) => rec.phone === r.phone
        );
        return {
          institution_id,
          connection_id: connection.id,
          recipient_type: 'bulk' as const,
          recipient_phone: r.phone,
          message_content: matchingRecipient?.message || '',
          sent_by: user.id,
          status: r.success ? ('sent' as const) : ('failed' as const),
          error_message: r.error,
        };
      })
    );
  }

  return NextResponse.json(result);
}
```

- [ ] **Step 6: Commit API routes**

```bash
git add app/api/admission/whatsapp-personal/
git commit -m "feat(admission): add API routes for BYOW WhatsApp personal messaging"
```

---

### Task 9: Create React Query Hooks

**Files:**
- Create: `hooks/admission/use-whatsapp-personal.ts`
- Reference: `hooks/admission/use-whatsapp-campaign.ts` (pattern)

- [ ] **Step 1: Create the hooks file**

```typescript
// hooks/admission/use-whatsapp-personal.ts
// React Query hooks for BYOW WhatsApp personal connections

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------

export const personalWhatsAppKeys = {
  all: ['whatsapp-personal'] as const,
  connection: (institutionId: string) =>
    ['whatsapp-personal', 'connection', institutionId] as const,
  messages: (institutionId: string) =>
    ['whatsapp-personal', 'messages', institutionId] as const,
  leadMessages: (institutionId: string, leadId: string) =>
    ['whatsapp-personal', 'messages', institutionId, leadId] as const,
};

// ---------------------------------------------------------------------------
// API helpers (client-side fetch)
// ---------------------------------------------------------------------------

async function fetchPersonalStatus(institutionId: string) {
  const res = await fetch(
    `/api/admission/whatsapp-personal/status?institution_id=${institutionId}`
  );
  if (!res.ok) throw new Error('Failed to fetch status');
  return res.json();
}

async function postPersonalConnect(institutionId: string) {
  const res = await fetch('/api/admission/whatsapp-personal/connect', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ institution_id: institutionId }),
  });
  if (!res.ok) throw new Error('Failed to connect');
  return res.json();
}

async function postPersonalDisconnect(institutionId: string) {
  const res = await fetch('/api/admission/whatsapp-personal/disconnect', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ institution_id: institutionId }),
  });
  if (!res.ok) throw new Error('Failed to disconnect');
  return res.json();
}

async function postPersonalSend(params: {
  institution_id: string;
  to: string;
  message: string;
  lead_id?: string;
  recipient_name?: string;
}) {
  const res = await fetch('/api/admission/whatsapp-personal/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!res.ok) throw new Error('Failed to send');
  return res.json();
}

async function postPersonalSendBulk(params: {
  institution_id: string;
  recipients: { phone: string; message: string }[];
  delay_ms?: number;
}) {
  const res = await fetch('/api/admission/whatsapp-personal/send-bulk', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!res.ok) throw new Error('Failed to send bulk');
  return res.json();
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/** Get personal WhatsApp connection status — auto-polls when connecting */
export function usePersonalWhatsAppStatus(
  institutionId: string | undefined,
  options?: { pollWhileConnecting?: boolean }
) {
  const pollWhileConnecting = options?.pollWhileConnecting ?? true;

  return useQuery({
    queryKey: personalWhatsAppKeys.connection(institutionId || ''),
    queryFn: () => fetchPersonalStatus(institutionId!),
    enabled: !!institutionId,
    staleTime: 5_000,
    refetchInterval: (query) => {
      if (!pollWhileConnecting) return false;
      const status = query.state.data?.status;
      // Poll every 2s while connecting/qr_ready/authenticated
      if (status === 'connecting' || status === 'qr_ready' || status === 'authenticated') {
        return 2_000;
      }
      return false;
    },
  });
}

/** Mutations for personal WhatsApp operations */
export function usePersonalWhatsAppMutations(institutionId: string) {
  const queryClient = useQueryClient();
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: personalWhatsAppKeys.connection(institutionId) });
  };

  const connect = useMutation({
    mutationFn: () => postPersonalConnect(institutionId),
    onSuccess: (data) => {
      if (data.success) {
        toast.success('WhatsApp connection initiated — scan the QR code');
      } else {
        toast.error(data.message || 'Failed to connect');
      }
      invalidate();
    },
    onError: () => toast.error('Failed to connect personal WhatsApp'),
  });

  const disconnect = useMutation({
    mutationFn: () => postPersonalDisconnect(institutionId),
    onSuccess: () => {
      toast.success('Personal WhatsApp disconnected');
      invalidate();
    },
    onError: () => toast.error('Failed to disconnect'),
  });

  const sendMessage = useMutation({
    mutationFn: (params: { to: string; message: string; lead_id?: string; recipient_name?: string }) =>
      postPersonalSend({ institution_id: institutionId, ...params }),
    onSuccess: (data) => {
      if (data.success) {
        toast.success('Message sent via personal WhatsApp');
      } else {
        toast.error(data.error || 'Failed to send');
      }
    },
    onError: () => toast.error('Failed to send message'),
  });

  const sendBulk = useMutation({
    mutationFn: (params: { recipients: { phone: string; message: string }[]; delay_ms?: number }) =>
      postPersonalSendBulk({ institution_id: institutionId, ...params }),
    onSuccess: (data) => {
      if (data.success) {
        toast.success(`Sent ${data.successCount}/${data.totalSent} messages`);
      } else {
        toast.error(data.error || 'Bulk send failed');
      }
    },
    onError: () => toast.error('Failed to send bulk messages'),
  });

  return { connect, disconnect, sendMessage, sendBulk };
}
```

- [ ] **Step 2: Commit hooks**

```bash
git add hooks/admission/use-whatsapp-personal.ts
git commit -m "feat(admission): add React Query hooks for BYOW WhatsApp personal connections"
```

---

## Chunk 4: UI Components

### Task 10: Create Personal WhatsApp Connect Component

**Files:**
- Create: `components/whatsapp/personal-connect.tsx`
- Reference: `.claude/skills/byow-whatsapp/templates/nextjs-integration/components/whatsapp-connect.tsx`

- [ ] **Step 1: Create the connect component using shadcn/ui**

Build a production-ready component that replaces the template's raw HTML with shadcn/ui components (`Card`, `Button`, `Badge`, `Alert`). The component should:

1. Use `usePersonalWhatsAppStatus()` hook (from Task 9) for status polling
2. Use `usePersonalWhatsAppMutations()` for connect/disconnect actions
3. Display 5 connection states: disconnected → connecting → qr_ready → authenticated → ready
4. Show QR code as `<img>` with data URL (base64 from Railway service)
5. Show connected phone number + push name when ready
6. Use WhatsApp green (#25D366) for the connect button
7. Include error display with `Alert` component
8. Accept props: `institutionId: string`, `onConnected?: (phone: string) => void`, `onDisconnected?: () => void`

The component structure should follow the template at `.claude/skills/byow-whatsapp/templates/nextjs-integration/components/whatsapp-connect.tsx` but use:
- `<Card>` wrapper instead of raw `<div>`
- `<Button>` instead of `<button>`
- `<Badge>` for status indicators
- `<Loader2>` spinner from lucide-react instead of CSS spinner
- `cn()` utility for class merging

- [ ] **Step 2: Commit component**

```bash
git add components/whatsapp/personal-connect.tsx
git commit -m "feat(admission): add QR code connection component for BYOW WhatsApp"
```

---

### Task 11: Create Send Personal Message Dialog

**Files:**
- Create: `components/whatsapp/send-personal-message-dialog.tsx`

- [ ] **Step 1: Create the dialog component**

Build a `Dialog` component that allows sending a message via personal WhatsApp. Props:

```typescript
interface SendPersonalMessageDialogProps {
  institutionId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultPhone?: string;      // Pre-fill recipient phone
  defaultMessage?: string;    // Pre-fill message
  leadId?: string;            // Associate with a lead
  recipientName?: string;     // Display name
}
```

Features:
- Phone number input with Indian format hint (+91...)
- Message textarea (max 4096 chars, char counter)
- Send button using `usePersonalWhatsAppMutations().sendMessage`
- Loading state during send
- Success/error feedback via toast
- Close dialog on successful send
- Connection status check — disable send if not connected, show warning

- [ ] **Step 2: Commit dialog**

```bash
git add components/whatsapp/send-personal-message-dialog.tsx
git commit -m "feat(admission): add send message dialog for BYOW WhatsApp"
```

---

### Task 12: Add Personal WhatsApp Tab to Settings Page

**Files:**
- Create: `app/(routes)/admission/settings/whatsapp-numbers/_components/personal-connection-tab.tsx`
- Modify: `app/(routes)/admission/settings/whatsapp-numbers/page.tsx`

- [ ] **Step 1: Create the personal connection tab component**

Build a tab content component that:
1. Shows the `PersonalConnect` component (QR flow from Task 10)
2. Displays connection history (connected_at, connected_by, phone_number)
3. Shows message statistics (total sent, success rate) from `wa_personal_message_logs`
4. Includes service configuration fields (service_url, displayed as read-only)
5. Has a "Test Connection" button that calls `/health` on the Railway service

- [ ] **Step 2: Add Tabs to the settings page**

Modify `app/(routes)/admission/settings/whatsapp-numbers/page.tsx` to add a `Tabs` component:
- Tab 1: "Business Numbers" (existing WABA content)
- Tab 2: "Personal WhatsApp" (new `PersonalConnectionTab` component)

The existing page content becomes the first tab. Add import for the new tab component.

- [ ] **Step 3: Commit settings integration**

```bash
git add app/(routes)/admission/settings/whatsapp-numbers/
git commit -m "feat(admission): add Personal WhatsApp tab to WhatsApp settings page"
```

---

### Task 13: Add Personal WhatsApp Button to Counselor Followup Card

**Files:**
- Modify: `app/(routes)/admission/counselors/daily-view/_components/followup-card.tsx`

- [ ] **Step 1: Add personal WhatsApp message button**

In the followup card's action row (next to the existing Phone button), add a MessageCircle button that:
1. Opens the `SendPersonalMessageDialog` with the lead's phone pre-filled
2. Only shows if personal WhatsApp is connected (check via `usePersonalWhatsAppStatus`)
3. Uses green color to distinguish from other action buttons
4. Tooltip: "Send via Personal WhatsApp"

Look for the action buttons section in the card (Phone, Calendar, StickyNote icons) and add after the Phone button:

```tsx
<SendPersonalMessageDialog
  institutionId={institutionId}
  open={personalMsgOpen}
  onOpenChange={setPersonalMsgOpen}
  defaultPhone={lead.phone}
  leadId={lead.id}
  recipientName={lead.full_name}
/>
<Button
  variant="ghost"
  size="icon"
  className="h-8 w-8 text-green-600 hover:text-green-700 hover:bg-green-50"
  onClick={() => setPersonalMsgOpen(true)}
  title="Send via Personal WhatsApp"
>
  <MessageCircle className="h-4 w-4" />
</Button>
```

- [ ] **Step 2: Commit followup card changes**

```bash
git add app/(routes)/admission/counselors/daily-view/_components/followup-card.tsx
git commit -m "feat(admission): add personal WhatsApp button to counselor followup cards"
```

---

### Task 14: Add Personal WhatsApp Action to Lead Detail Page

**Files:**
- Modify: `app/(routes)/admission/leads/[id]/page.tsx`

- [ ] **Step 1: Add personal WhatsApp send action**

In the lead detail page's action area (where call, SMS, email actions exist), add:
1. A "Send Personal WhatsApp" button/menu item
2. Opens `SendPersonalMessageDialog` with lead's phone + name pre-filled
3. Only visible when personal WhatsApp is connected
4. Add lead's personal message history to the communication tab (query `wa_personal_message_logs` by `lead_id`)

- [ ] **Step 2: Commit lead detail changes**

```bash
git add app/(routes)/admission/leads/[id]/page.tsx
git commit -m "feat(admission): add personal WhatsApp messaging to lead detail page"
```

---

## Chunk 5: Chat Inbox Integration

### Task 15: Add Channel Filter to Chat Inbox

**Files:**
- Modify: `app/(routes)/admission/marketing/chat/page.tsx`

- [ ] **Step 1: Add channel filter to chat inbox stats bar**

In the existing chat page stats bar (which shows Open, Waiting, Unread, Cost), add a channel toggle:
- "Business" (blue) — shows existing Business API conversations
- "Personal" (green) — shows personal WhatsApp message logs
- Default: "Business" (preserves current behavior)

When "Personal" is selected:
- Replace conversation list with personal message log list (from `wa_personal_message_logs`)
- Show connection status badge in the header
- Show simple message list instead of full conversation threads (personal WA is send-only in basic service)

This is a **lightweight integration** — not a full chat thread rebuild. Personal messages appear as a log view, not a bidirectional chat (since the basic service is send-only).

- [ ] **Step 2: Commit chat inbox changes**

```bash
git add app/(routes)/admission/marketing/chat/page.tsx
git commit -m "feat(admission): add Personal WhatsApp channel filter to chat inbox"
```

---

## Verification Checklist

After completing all tasks, verify:

- [ ] Railway service responds to `/health` endpoint
- [ ] QR code displays in Settings → WhatsApp Numbers → Personal WhatsApp tab
- [ ] QR scan connects successfully (status transitions: disconnected → connecting → qr_ready → authenticated → ready)
- [ ] Disconnect works and clears session
- [ ] Send message from Lead Detail page works
- [ ] Send message from Counselor Followup Card works
- [ ] Messages appear in `wa_personal_message_logs` table
- [ ] Chat inbox channel filter switches between Business and Personal views
- [ ] RLS policies correctly restrict access by institution
- [ ] Connection status badge shows correctly on all pages
- [ ] Error states handled (service unreachable, not connected, send failure)

---

## Post-Implementation Notes

**Future Enhancements (not in this plan):**
- Upgrade to Full Service (54 endpoints) for read capabilities + group management
- Per-counselor connections (multiple Railway instances)
- Bidirectional chat threading for personal WhatsApp (requires Full Service)
- Personal message templates with variable substitution
- Webhook for incoming messages (requires Full Service + webhook endpoint)
- Connection health monitoring with email alerts
