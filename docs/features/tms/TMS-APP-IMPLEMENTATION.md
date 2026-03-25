# TMS Application — Module-by-Module Build Plan

> **Document Type**: Implementation Plan
> **Date**: 2026-03-15
> **Status**: READY FOR DEVELOPMENT
> **Parent Spec**: [TMS-SPEC.md](./TMS-SPEC.md) (architecture decisions, all locked)
> **PRD Analysis**: [TMS-PRD-ANALYSIS.md](./TMS-PRD-ANALYSIS.md) (existing system reverse-engineering)
> **MyJKKN Tasks**: [TMS-MYJKKN-TASKS.md](./TMS-MYJKKN-TASKS.md) (B2A endpoints, webhooks, billing)
> **Audience**: Engineer with zero TMS context

---

## Table of Contents

1. [Context & Prerequisites](#1-context--prerequisites)
2. [Phase 0: Project Setup & Infrastructure (Week 1)](#2-phase-0-project-setup--infrastructure-week-1)
3. [Phase 1: Core Transport Data (Week 2)](#3-phase-1-core-transport-data-week-2)
4. [Phase 2: Scheduling & Enrollment (Week 3)](#4-phase-2-scheduling--enrollment-week-3)
5. [Phase 3: Live Tracking & Attendance (Week 4)](#5-phase-3-live-tracking--attendance-week-4)
6. [Phase 4: Grievances & Notifications (Week 5)](#6-phase-4-grievances--notifications-week-5)
7. [Phase 5: PWA & Polish (Week 6)](#7-phase-5-pwa--polish-week-6)
8. [Appendix A: Complete SQL Reference](#appendix-a-complete-sql-reference)
9. [Appendix B: All TypeScript Type Interfaces](#appendix-b-all-typescript-type-interfaces)
10. [Appendix C: Testing Strategy](#appendix-c-testing-strategy)

---

## 1. Context & Prerequisites

### What is TMS?

TMS (Transport Management System) is a **separate Next.js 16 application** deployed at `tms.jkkn.ai` that manages college bus transport for JKKN institutions. It is NOT a module inside MyJKKN. It has its own Supabase project, its own codebase, and its own deployment.

### How TMS Relates to MyJKKN

```
MyJKKN (app.jkkn.ai)                    TMS (tms.jkkn.ai)
========================                 ========================
- Owns user auth (Google OAuth)    <-->  Reads JWT with shared secret
- Owns billing (HDFC SmartGateway) <-->  Checks bill status via B2A
- Owns notifications               <-->  Sends via B2A outbox pattern
- Owns custom_roles/permissions     <-->  Fetches via B2A, caches locally
- Owns service_requests             <-->  Enrollment triggered by approval
```

### Key Architectural Decisions (Locked)

| Decision | Choice | Reference |
|----------|--------|-----------|
| App type | Separate Next.js 16 app | TMS-SPEC Section 1 |
| Database | Separate Supabase project | TMS-SPEC Section 1 |
| Auth | Shared JWT secret (no own auth) | TMS-SPEC Section 4 |
| User data | Mirror table `tms_users` | TMS-SPEC Section 6 |
| Billing | MyJKKN owns all financial data | TMS-SPEC Section 5 |
| Access gate | Paid transport bill = access | TMS-SPEC Section 5 |
| Multi-tenant | `institution_id` on every table | TMS-SPEC Section 20 |
| Realtime | Supabase Broadcast for live tracking | TMS-SPEC Section 14 |
| QR codes | Time-rotating HMAC (30s rotation) | TMS-SPEC Section 15 |
| Scheduling | Template -> auto-generated instances | TMS-SPEC Section 12 |
| Notifications | Outbox table -> cron -> B2A delivery | TMS-SPEC Section 17 |
| Offline | PWA with IndexedDB for QR + attendance | TMS-SPEC Section 19 |

### Pre-Flight Checklist

Before writing any code, ensure:

- [ ] New Supabase project created for TMS
- [ ] JWT secret copied from MyJKKN Supabase project settings
- [ ] B2A API key created in MyJKKN with `tms` module scope (see TMS-MYJKKN-TASKS.md Task 7)
- [ ] Domain `tms.jkkn.ai` DNS configured
- [ ] All MyJKKN-side B2A endpoints implemented (see TMS-MYJKKN-TASKS.md Tasks 1-6)

---

## 2. Phase 0: Project Setup & Infrastructure (Week 1)

### 0.1 Create Next.js 16 Project

```bash
npx create-next-app@latest tms-app --typescript --tailwind --app --src-dir
cd tms-app
```

### 0.2 Install Dependencies

```bash
# Core
npm install @supabase/supabase-js @supabase/ssr

# UI
npm install @radix-ui/react-dialog @radix-ui/react-dropdown-menu \
  @radix-ui/react-label @radix-ui/react-select @radix-ui/react-separator \
  @radix-ui/react-slot @radix-ui/react-tabs @radix-ui/react-toast \
  @radix-ui/react-tooltip @radix-ui/react-avatar @radix-ui/react-checkbox \
  @radix-ui/react-switch @radix-ui/react-scroll-area \
  class-variance-authority clsx tailwind-merge lucide-react

# Forms & Validation
npm install react-hook-form @hookform/resolvers zod

# Data Fetching
npm install @tanstack/react-query

# Maps
npm install leaflet react-leaflet
npm install -D @types/leaflet

# QR Codes
npm install qrcode.react html5-qrcode

# Animation
npm install framer-motion

# Charts (for admin dashboard, lazy-loaded)
npm install recharts

# Date utilities
npm install date-fns

# PWA
npm install @ducanh2912/next-pwa

# Dev dependencies
npm install -D @types/node @types/react @types/react-dom
```

### 0.3 TypeScript Configuration

**File**: `tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

### 0.4 Next.js Configuration

**File**: `next.config.ts`

```typescript
import type { NextConfig } from 'next';
import withPWA from '@ducanh2912/next-pwa';

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
      },
    ],
  },
};

export default withPWA({
  dest: 'public',
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === 'development',
})(nextConfig);
```

### 0.5 Environment Variables

**File**: `.env.local` (never committed)

```bash
# TMS Supabase (own project)
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_TMS_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJI...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJI...

# MyJKKN B2A Integration
MYJKKN_URL=https://app.jkkn.ai
MYJKKN_B2A_API_KEY=jkkn_tms_xxxxxxxxxxxx

# QR Code HMAC Secret (min 32 chars)
QR_HMAC_SECRET=your-secret-min-32-characters-here

# Webhook Secret (shared with MyJKKN for signature verification)
WEBHOOK_SECRET=your-webhook-secret-here

# App
NEXT_PUBLIC_APP_URL=https://tms.jkkn.ai
NEXT_PUBLIC_MYJKKN_URL=https://app.jkkn.ai
```

**File**: `src/lib/env.ts` (runtime validation)

```typescript
import { z } from 'zod';

const envSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  MYJKKN_URL: z.string().url(),
  MYJKKN_B2A_API_KEY: z.string().startsWith('jkkn_'),
  QR_HMAC_SECRET: z.string().min(32),
  WEBHOOK_SECRET: z.string().min(16),
  NEXT_PUBLIC_APP_URL: z.string().url(),
  NEXT_PUBLIC_MYJKKN_URL: z.string().url(),
});

export const env = envSchema.parse(process.env);
```

### 0.6 Project Structure

```
tms-app/src/
├── app/
│   ├── (auth)/
│   │   ├── login/page.tsx
│   │   └── callback/page.tsx
│   ├── (app)/
│   │   ├── layout.tsx
│   │   ├── dashboard/
│   │   │   ├── page.tsx
│   │   │   ├── live-track/page.tsx
│   │   │   ├── schedule/page.tsx
│   │   │   ├── my-qr/page.tsx
│   │   │   └── grievances/
│   │   │       ├── page.tsx
│   │   │       └── [id]/page.tsx
│   │   ├── driver/
│   │   │   ├── page.tsx
│   │   │   ├── scan/page.tsx
│   │   │   ├── passengers/page.tsx
│   │   │   ├── routes/page.tsx
│   │   │   └── location/page.tsx
│   │   ├── staff/
│   │   │   ├── page.tsx
│   │   │   ├── attendance/page.tsx
│   │   │   ├── students/page.tsx
│   │   │   └── routes/page.tsx
│   │   └── admin/
│   │       ├── page.tsx
│   │       ├── routes/
│   │       │   ├── page.tsx
│   │       │   └── [id]/page.tsx
│   │       ├── vehicles/page.tsx
│   │       ├── drivers/page.tsx
│   │       ├── schedules/
│   │       │   ├── page.tsx
│   │       │   └── templates/page.tsx
│   │       ├── enrollments/page.tsx
│   │       ├── attendance/page.tsx
│   │       ├── grievances/page.tsx
│   │       └── settings/page.tsx
│   ├── api/
│   │   ├── webhooks/
│   │   │   └── payment-confirmed/route.ts
│   │   ├── health/route.ts
│   │   ├── driver/
│   │   │   └── location/route.ts
│   │   └── cron/
│   │       ├── generate-schedules/route.ts
│   │       ├── sync-users/route.ts
│   │       ├── process-notifications/route.ts
│   │       └── check-grace-periods/route.ts
│   ├── layout.tsx
│   └── not-found.tsx
├── components/
│   ├── ui/                  # shadcn/ui primitives
│   ├── auth/
│   │   ├── access-gate.tsx
│   │   ├── auth-provider.tsx
│   │   └── role-guard.tsx
│   ├── maps/
│   │   ├── route-map.tsx
│   │   ├── live-tracking-map.tsx
│   │   └── stop-marker.tsx
│   ├── qr/
│   │   ├── qr-display.tsx
│   │   └── qr-scanner.tsx
│   ├── navigation/
│   │   ├── student-nav.tsx
│   │   ├── driver-nav.tsx
│   │   ├── staff-nav.tsx
│   │   └── admin-sidebar.tsx
│   └── shared/
│       ├── data-table.tsx
│       ├── loading-skeleton.tsx
│       ├── empty-state.tsx
│       ├── error-boundary.tsx
│       └── confirm-dialog.tsx
├── lib/
│   ├── supabase/
│   │   ├── client.ts        # Browser client
│   │   ├── server.ts        # Server client (cookies)
│   │   └── admin.ts         # Service role client
│   ├── auth/
│   │   ├── jwt.ts           # JWT decode, health check
│   │   ├── access.ts        # Access gate logic
│   │   └── permissions.ts   # Permission check helpers
│   ├── b2a/
│   │   ├── client.ts        # B2A HTTP client
│   │   ├── verify-access.ts
│   │   ├── users-batch.ts
│   │   ├── permissions.ts
│   │   └── notifications.ts
│   ├── qr/
│   │   ├── hmac.ts          # HMAC-SHA256 generation/verification
│   │   └── payload.ts       # QR payload encode/decode
│   ├── services/
│   │   ├── route-service.ts
│   │   ├── vehicle-service.ts
│   │   ├── driver-service.ts
│   │   ├── schedule-template-service.ts
│   │   ├── schedule-service.ts
│   │   ├── enrollment-service.ts
│   │   ├── booking-service.ts
│   │   ├── attendance-service.ts
│   │   ├── grievance-service.ts
│   │   ├── notification-service.ts
│   │   ├── user-service.ts
│   │   └── settings-service.ts
│   ├── utils/
│   │   ├── cn.ts            # clsx + tailwind-merge
│   │   ├── date.ts          # date-fns helpers
│   │   └── logger.ts        # Structured logging
│   └── env.ts
├── hooks/
│   ├── use-auth.ts
│   ├── use-routes.ts
│   ├── use-vehicles.ts
│   ├── use-drivers.ts
│   ├── use-schedules.ts
│   ├── use-enrollments.ts
│   ├── use-bookings.ts
│   ├── use-attendance.ts
│   ├── use-grievances.ts
│   ├── use-live-tracking.ts
│   └── use-notifications.ts
├── types/
│   ├── database.ts          # Matches Supabase schema
│   ├── auth.ts
│   ├── routes.ts
│   ├── vehicles.ts
│   ├── drivers.ts
│   ├── schedules.ts
│   ├── enrollments.ts
│   ├── bookings.ts
│   ├── attendance.ts
│   ├── grievances.ts
│   ├── notifications.ts
│   └── b2a.ts               # B2A request/response types
└── public/
    ├── manifest.json
    ├── icons/
    │   ├── icon-192x192.png
    │   └── icon-512x512.png
    └── sw.js
```

### 0.7 Supabase Client Setup

**File**: `src/lib/supabase/client.ts`

```typescript
import { createBrowserClient } from '@supabase/ssr';

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
```

**File**: `src/lib/supabase/server.ts`

```typescript
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function createServerSupabaseClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Called from Server Component — ignore
          }
        },
      },
    }
  );
}
```

**File**: `src/lib/supabase/admin.ts`

```typescript
import { createClient } from '@supabase/supabase-js';

export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
```

### 0.8 B2A Client

**File**: `src/lib/b2a/client.ts`

```typescript
const MYJKKN_URL = process.env.MYJKKN_URL!;
const B2A_API_KEY = process.env.MYJKKN_B2A_API_KEY!;

interface B2ARequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  body?: Record<string, unknown>;
  params?: Record<string, string>;
}

interface B2AResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export async function b2aRequest<T>(options: B2ARequestOptions): Promise<B2AResponse<T>> {
  const { method = 'GET', path, body, params } = options;

  const url = new URL(`${MYJKKN_URL}${path}`);
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  }

  const res = await fetch(url.toString(), {
    method,
    headers: {
      'Authorization': `Bearer ${B2A_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
    next: { revalidate: 0 },
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => 'Unknown error');
    return { success: false, error: `B2A ${res.status}: ${errorText}` };
  }

  const data = await res.json();
  return { success: true, data };
}
```

### 0.9 Auth Infrastructure

**File**: `src/lib/auth/jwt.ts`

```typescript
/**
 * JWT health check. TMS cannot refresh tokens — if expired, redirect to MyJKKN.
 *
 * Flow:
 * 1. Decode JWT from Supabase session
 * 2. Check exp > now + 5min buffer
 * 3. If expiring soon: show banner
 * 4. If expired: redirect to MyJKKN login
 */

export function isTokenExpiringSoon(exp: number, bufferSeconds = 300): boolean {
  return exp - Math.floor(Date.now() / 1000) < bufferSeconds;
}

export function isTokenExpired(exp: number): boolean {
  return exp < Math.floor(Date.now() / 1000);
}

export function getMyJKKNLoginUrl(redirectPath?: string): string {
  const base = process.env.NEXT_PUBLIC_MYJKKN_URL!;
  const redirect = redirectPath
    ? `${process.env.NEXT_PUBLIC_APP_URL}${redirectPath}`
    : process.env.NEXT_PUBLIC_APP_URL!;
  return `${base}/login?redirect=${encodeURIComponent(redirect)}`;
}
```

**File**: `src/lib/auth/access.ts`

```typescript
/**
 * Access gate logic. Single rule: paid transport bill = access.
 *
 * Check order:
 * 1. Look up tms_users.access_status (cached value)
 * 2. If "active" -> allow
 * 3. If "grace" -> allow + show banner
 * 4. If "expired" -> block
 * 5. If "none" or stale -> call B2A /verify-access, update cache
 */

import { b2aRequest } from '@/lib/b2a/client';

export type AccessStatus = 'active' | 'grace' | 'expired' | 'none';

export interface AccessCheckResult {
  allowed: boolean;
  status: AccessStatus;
  graceExpiresAt: string | null;
  reason: string | null;
}

export async function checkAccessViaB2A(
  userId: string,
  institutionId: string
): Promise<AccessCheckResult> {
  const res = await b2aRequest<{
    access_decision: 'grant' | 'grace' | 'deny';
    grace_expires_at?: string;
    reason?: string;
  }>({
    path: '/api/b2a/tms/verify-access',
    params: { user_id: userId, institution_id: institutionId },
  });

  if (!res.success || !res.data) {
    return { allowed: false, status: 'none', graceExpiresAt: null, reason: 'b2a_unavailable' };
  }

  const { access_decision, grace_expires_at, reason } = res.data;

  switch (access_decision) {
    case 'grant':
      return { allowed: true, status: 'active', graceExpiresAt: null, reason: null };
    case 'grace':
      return { allowed: true, status: 'grace', graceExpiresAt: grace_expires_at ?? null, reason: null };
    case 'deny':
      return { allowed: false, status: 'expired', graceExpiresAt: null, reason: reason ?? 'access_denied' };
    default:
      return { allowed: false, status: 'none', graceExpiresAt: null, reason: 'unknown_decision' };
  }
}
```

**File**: `src/lib/auth/permissions.ts`

```typescript
/**
 * Permission helpers. Permissions are fetched from MyJKKN B2A at login
 * and cached in tms_users.permissions (JSONB array).
 */

export const TMS_PERMISSIONS = {
  ROUTES_MANAGE: 'tms.routes.manage',
  VEHICLES_MANAGE: 'tms.vehicles.manage',
  DRIVERS_MANAGE: 'tms.drivers.manage',
  SCHEDULES_MANAGE: 'tms.schedules.manage',
  BOOKINGS_VIEW_ALL: 'tms.bookings.view_all',
  ATTENDANCE_MANAGE: 'tms.attendance.manage',
  REPORTS_VIEW: 'tms.reports.view',
} as const;

export type TMSPermission = (typeof TMS_PERMISSIONS)[keyof typeof TMS_PERMISSIONS];

export function hasPermission(
  userPermissions: string[],
  required: TMSPermission
): boolean {
  return userPermissions.includes(required);
}

export function hasAnyPermission(
  userPermissions: string[],
  required: TMSPermission[]
): boolean {
  return required.some((p) => userPermissions.includes(p));
}
```

### 0.10 Supabase Database Setup

Run all SQL from TMS-SPEC.md Section 20 in the TMS Supabase SQL editor. The complete SQL is reproduced in [Appendix A](#appendix-a-complete-sql-reference) of this document for convenience.

**Execution order**:

1. `01_functions.sql` — `tms_user_institution_id()`, `tms_set_updated_at()`, `tms_notify_driver_location()`
2. `01_tables.sql` — All 17 CREATE TABLE statements
3. `02_indexes.sql` — All CREATE INDEX statements
4. `03_rls.sql` — ALTER TABLE ENABLE ROW LEVEL SECURITY + all policies
5. `04_triggers.sql` — All triggers (updated_at, driver location notify)

Enable Realtime on `tms_driver_locations`:

```sql
ALTER PUBLICATION supabase_realtime ADD TABLE tms_driver_locations;
```

### 0.11 Health Check Endpoint

**File**: `src/app/api/health/route.ts`

```typescript
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET() {
  const checks: Record<string, boolean> = {};

  // Check Supabase connectivity
  try {
    const supabase = createAdminClient();
    const { error } = await supabase.from('tms_settings').select('id').limit(1);
    checks.supabase = !error;
  } catch {
    checks.supabase = false;
  }

  // Check B2A reachability
  try {
    const res = await fetch(`${process.env.MYJKKN_URL}/api/health`, {
      signal: AbortSignal.timeout(5000),
    });
    checks.b2a = res.ok;
  } catch {
    checks.b2a = false;
  }

  const healthy = Object.values(checks).every(Boolean);
  return NextResponse.json({ healthy, checks }, { status: healthy ? 200 : 503 });
}
```

### 0.12 Root Layout

**File**: `src/app/layout.tsx`

```typescript
import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { QueryProvider } from '@/components/providers/query-provider';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'TMS - JKKN Transport',
  description: 'JKKN College Transport Management System',
  manifest: '/manifest.json',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#1e40af',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <QueryProvider>{children}</QueryProvider>
      </body>
    </html>
  );
}
```

### 0.13 TanStack Query Provider

**File**: `src/components/providers/query-provider.tsx`

```typescript
'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60_000,         // 1 minute
            gcTime: 5 * 60_000,        // 5 minutes
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      })
  );

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
```

### Phase 0 Deliverables Checklist

- [ ] Next.js 16 project initialized with all dependencies
- [ ] TypeScript strict mode configured
- [ ] Supabase clients (browser, server, admin) working
- [ ] B2A client utility tested with MyJKKN
- [ ] Environment validation passing
- [ ] Health check endpoint returning 200
- [ ] All 17 database tables created with indexes
- [ ] RLS enabled on all tables with policies
- [ ] Triggers installed (updated_at, driver location notify)
- [ ] Realtime enabled on `tms_driver_locations`
- [ ] PWA manifest and service worker scaffolded
- [ ] Auth infrastructure (JWT health, access gate, permissions) coded

---

## 3. Phase 1: Core Transport Data (Week 2)

### 1.1 Routes Module

#### Table SQL

Already defined in TMS-SPEC Section 20. Two tables:

```sql
-- tms_routes: Route definitions
-- tms_route_stops: Ordered stops per route
-- (See Appendix A for full SQL)
```

#### TypeScript Types

**File**: `src/types/routes.ts`

```typescript
export interface Route {
  id: string;
  institution_id: string;
  route_name: string;
  route_code: string;
  direction: 'to_campus' | 'from_campus' | 'both';
  description: string | null;
  status: 'active' | 'inactive' | 'archived';
  created_at: string;
  updated_at: string;
}

export interface RouteStop {
  id: string;
  institution_id: string;
  route_id: string;
  stop_name: string;
  stop_order: number;
  lat: number | null;
  lng: number | null;
  estimated_time: string | null; // TIME as string "HH:MM:SS"
  is_campus: boolean;
  created_at: string;
  updated_at: string;
}

export interface RouteWithStops extends Route {
  stops: RouteStop[];
}

export interface CreateRouteInput {
  route_name: string;
  route_code: string;
  direction: Route['direction'];
  description?: string;
  stops: CreateRouteStopInput[];
}

export interface CreateRouteStopInput {
  stop_name: string;
  stop_order: number;
  lat?: number;
  lng?: number;
  estimated_time?: string;
  is_campus?: boolean;
}

export interface UpdateRouteInput {
  route_name?: string;
  route_code?: string;
  direction?: Route['direction'];
  description?: string;
  status?: Route['status'];
}
```

#### Service Layer

**File**: `src/lib/services/route-service.ts`

Method signatures:

```typescript
export class RouteService {
  // Queries
  static async getRoutes(institutionId: string): Promise<RouteWithStops[]>;
  static async getRoute(routeId: string): Promise<RouteWithStops | null>;
  static async getActiveRoutes(institutionId: string): Promise<Route[]>;

  // Mutations
  static async createRoute(input: CreateRouteInput, institutionId: string): Promise<Route>;
  static async updateRoute(routeId: string, input: UpdateRouteInput): Promise<Route>;
  static async deleteRoute(routeId: string): Promise<void>;

  // Stop management
  static async addStop(routeId: string, input: CreateRouteStopInput, institutionId: string): Promise<RouteStop>;
  static async updateStop(stopId: string, input: Partial<CreateRouteStopInput>): Promise<RouteStop>;
  static async deleteStop(stopId: string): Promise<void>;
  static async reorderStops(routeId: string, stopIds: string[]): Promise<void>;
}
```

**Implementation notes**:
- `createRoute` uses a transaction: insert route, then bulk-insert stops with `stop_order` auto-assigned
- `getRoutes` joins stops: `.select('*, stops:tms_route_stops(*)')` with `.order('stop_order', { foreignTable: 'tms_route_stops' })`
- `reorderStops` takes an ordered array of stop IDs and updates `stop_order` sequentially
- All methods use the browser Supabase client (RLS handles institution scoping)

#### React Query Hooks

**File**: `src/hooks/use-routes.ts`

```typescript
// Queries
export function useRoutes(): UseQueryResult<RouteWithStops[]>;
export function useRoute(routeId: string): UseQueryResult<RouteWithStops | null>;
export function useActiveRoutes(): UseQueryResult<Route[]>;

// Mutations
export function useCreateRoute(): UseMutationResult<Route, Error, CreateRouteInput>;
export function useUpdateRoute(): UseMutationResult<Route, Error, { id: string; input: UpdateRouteInput }>;
export function useDeleteRoute(): UseMutationResult<void, Error, string>;

// Stop mutations
export function useAddStop(): UseMutationResult<RouteStop, Error, { routeId: string; input: CreateRouteStopInput }>;
export function useUpdateStop(): UseMutationResult<RouteStop, Error, { stopId: string; input: Partial<CreateRouteStopInput> }>;
export function useDeleteStop(): UseMutationResult<void, Error, string>;
export function useReorderStops(): UseMutationResult<void, Error, { routeId: string; stopIds: string[] }>;
```

All mutations invalidate `['routes']` query key on success.

#### UI Components

**Admin pages**:

| Component | File | Purpose |
|-----------|------|---------|
| RoutesPage | `app/(app)/admin/routes/page.tsx` | Data table listing all routes |
| RouteDetailPage | `app/(app)/admin/routes/[id]/page.tsx` | Route detail with stop management |
| CreateRouteDialog | `components/admin/routes/create-route-dialog.tsx` | Modal form for new route |
| EditRouteDialog | `components/admin/routes/edit-route-dialog.tsx` | Modal form for editing route |
| StopEditor | `components/admin/routes/stop-editor.tsx` | Drag-reorder stop list |
| RouteMapPreview | `components/maps/route-map.tsx` | Leaflet map showing route polyline + stop markers |

**Route map component**:
- Draw polyline connecting stops in order
- Place numbered markers at each stop
- Campus stops get a distinct marker (school icon)
- Click stop marker to see name + estimated time
- Lazy-loaded with `dynamic(() => import(...)`, { ssr: false })` to avoid Leaflet SSR issues

#### Testing Plan

| Test | Type | What to Verify |
|------|------|----------------|
| Create route with stops | Integration | Route + stops inserted, stops ordered correctly |
| Get routes returns joined stops | Integration | Query returns `RouteWithStops` shape |
| Route code uniqueness | Integration | Duplicate code within same institution fails |
| Delete route cascades stops | Integration | Stops deleted when route deleted |
| Reorder stops | Integration | `stop_order` values updated correctly |
| RLS: institution isolation | Integration | User A cannot see User B's routes |
| Route form validation | Unit | Required fields, code format, stop count >= 2 |
| Route map renders | Component | Leaflet map mounts, markers visible |

---

### 1.2 Vehicles Module

#### TypeScript Types

**File**: `src/types/vehicles.ts`

```typescript
export interface Vehicle {
  id: string;
  institution_id: string;
  registration_number: string;
  make: string | null;
  model: string | null;
  year: number | null;
  capacity: number;
  vehicle_type: 'bus' | 'minibus' | 'van';
  status: 'active' | 'maintenance' | 'retired';
  insurance_expiry: string | null; // DATE as string
  fitness_expiry: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateVehicleInput {
  registration_number: string;
  make?: string;
  model?: string;
  year?: number;
  capacity: number;
  vehicle_type?: Vehicle['vehicle_type'];
  insurance_expiry?: string;
  fitness_expiry?: string;
}

export interface UpdateVehicleInput extends Partial<CreateVehicleInput> {
  status?: Vehicle['status'];
}
```

#### Service Layer

**File**: `src/lib/services/vehicle-service.ts`

```typescript
export class VehicleService {
  static async getVehicles(institutionId: string): Promise<Vehicle[]>;
  static async getVehicle(vehicleId: string): Promise<Vehicle | null>;
  static async getActiveVehicles(institutionId: string): Promise<Vehicle[]>;
  static async createVehicle(input: CreateVehicleInput, institutionId: string): Promise<Vehicle>;
  static async updateVehicle(vehicleId: string, input: UpdateVehicleInput): Promise<Vehicle>;
  static async deleteVehicle(vehicleId: string): Promise<void>;
}
```

#### React Query Hooks

**File**: `src/hooks/use-vehicles.ts`

```typescript
export function useVehicles(): UseQueryResult<Vehicle[]>;
export function useVehicle(id: string): UseQueryResult<Vehicle | null>;
export function useActiveVehicles(): UseQueryResult<Vehicle[]>;
export function useCreateVehicle(): UseMutationResult<Vehicle, Error, CreateVehicleInput>;
export function useUpdateVehicle(): UseMutationResult<Vehicle, Error, { id: string; input: UpdateVehicleInput }>;
export function useDeleteVehicle(): UseMutationResult<void, Error, string>;
```

#### UI Components

| Component | File | Purpose |
|-----------|------|---------|
| VehiclesPage | `app/(app)/admin/vehicles/page.tsx` | Data table with status badges |
| CreateVehicleDialog | `components/admin/vehicles/create-vehicle-dialog.tsx` | Modal form |
| EditVehicleDialog | `components/admin/vehicles/edit-vehicle-dialog.tsx` | Modal form |
| VehicleStatusBadge | `components/admin/vehicles/vehicle-status-badge.tsx` | Color-coded status |
| ExpiryWarning | `components/admin/vehicles/expiry-warning.tsx` | Alert for insurance/fitness expiring within 30 days |

**Data table columns**: Registration, Make/Model, Capacity, Type, Status, Insurance Expiry, Fitness Expiry, Actions (edit/delete).

#### Testing Plan

| Test | Type | What to Verify |
|------|------|----------------|
| CRUD lifecycle | Integration | Create, read, update, delete vehicle |
| Registration uniqueness | Integration | Duplicate registration within institution fails |
| Capacity validation | Unit | Must be > 0 |
| Expiry warning logic | Unit | Shows warning when < 30 days from today |
| Status transition | Integration | Can change active -> maintenance -> retired |

---

### 1.3 Drivers Module

#### TypeScript Types

**File**: `src/types/drivers.ts`

```typescript
export interface Driver {
  id: string;
  institution_id: string;
  myjkkn_user_id: string;
  tms_user_id: string | null;
  license_number: string;
  license_expiry: string; // DATE
  current_vehicle_id: string | null;
  status: 'active' | 'on_leave' | 'inactive';
  emergency_contact: string | null;
  created_at: string;
  updated_at: string;
}

export interface DriverWithDetails extends Driver {
  user: {
    full_name: string;
    email: string | null;
    phone: string | null;
    avatar_url: string | null;
  } | null;
  vehicle: {
    registration_number: string;
    make: string | null;
    model: string | null;
  } | null;
}

export interface CreateDriverInput {
  myjkkn_user_id: string;
  license_number: string;
  license_expiry: string;
  current_vehicle_id?: string;
  emergency_contact?: string;
}

export interface UpdateDriverInput {
  license_number?: string;
  license_expiry?: string;
  current_vehicle_id?: string | null;
  status?: Driver['status'];
  emergency_contact?: string;
}
```

#### Service Layer

**File**: `src/lib/services/driver-service.ts`

```typescript
export class DriverService {
  static async getDrivers(institutionId: string): Promise<DriverWithDetails[]>;
  static async getDriver(driverId: string): Promise<DriverWithDetails | null>;
  static async getActiveDrivers(institutionId: string): Promise<DriverWithDetails[]>;
  static async createDriver(input: CreateDriverInput, institutionId: string): Promise<Driver>;
  static async updateDriver(driverId: string, input: UpdateDriverInput): Promise<Driver>;
  static async deleteDriver(driverId: string): Promise<void>;
  static async assignVehicle(driverId: string, vehicleId: string | null): Promise<Driver>;
}
```

**Implementation notes**:
- `getDrivers` joins `tms_users` for name/email/phone and `tms_vehicles` for vehicle info:
  ```
  .select('*, user:tms_users!tms_drivers_tms_user_id_fkey(full_name, email, phone, avatar_url), vehicle:tms_vehicles(registration_number, make, model)')
  ```
- `createDriver` first checks that a `tms_users` record exists for the given `myjkkn_user_id`. If not, triggers a B2A sync to create it.

#### React Query Hooks

**File**: `src/hooks/use-drivers.ts`

```typescript
export function useDrivers(): UseQueryResult<DriverWithDetails[]>;
export function useDriver(id: string): UseQueryResult<DriverWithDetails | null>;
export function useActiveDrivers(): UseQueryResult<DriverWithDetails[]>;
export function useCreateDriver(): UseMutationResult<Driver, Error, CreateDriverInput>;
export function useUpdateDriver(): UseMutationResult<Driver, Error, { id: string; input: UpdateDriverInput }>;
export function useDeleteDriver(): UseMutationResult<void, Error, string>;
export function useAssignVehicle(): UseMutationResult<Driver, Error, { driverId: string; vehicleId: string | null }>;
```

#### UI Components

| Component | File | Purpose |
|-----------|------|---------|
| DriversPage | `app/(app)/admin/drivers/page.tsx` | Data table with driver info |
| CreateDriverDialog | `components/admin/drivers/create-driver-dialog.tsx` | Select MyJKKN user + license info |
| EditDriverDialog | `components/admin/drivers/edit-driver-dialog.tsx` | Edit license, vehicle, status |
| DriverCard | `components/admin/drivers/driver-card.tsx` | Card view with avatar, name, vehicle |
| VehicleAssignSelect | `components/admin/drivers/vehicle-assign-select.tsx` | Dropdown of active vehicles |

#### Testing Plan

| Test | Type | What to Verify |
|------|------|----------------|
| Create driver | Integration | Driver record created, linked to tms_users |
| Assign vehicle | Integration | `current_vehicle_id` updated |
| License expiry warning | Unit | Flag when license expires within 60 days |
| Unique myjkkn_user_id | Integration | Cannot register same MyJKKN user twice |
| Join query returns user + vehicle | Integration | DriverWithDetails shape returned |

### Phase 1 Deliverables Checklist

- [ ] Routes CRUD working with stop management and map preview
- [ ] Vehicles CRUD working with expiry tracking
- [ ] Drivers CRUD working with vehicle assignment
- [ ] All admin data tables functional with pagination, search, sort
- [ ] All React Query hooks wired to services
- [ ] Integration tests passing for all three modules

---

## 4. Phase 2: Scheduling & Enrollment (Week 3)

### 2.1 Schedule Templates

#### TypeScript Types

**File**: `src/types/schedules.ts`

```typescript
export interface ScheduleTemplate {
  id: string;
  institution_id: string;
  route_id: string;
  vehicle_id: string | null;
  driver_id: string | null;
  days_of_week: number[]; // 0=Sun, 1=Mon, ..., 6=Sat
  departure_time: string; // TIME "HH:MM:SS"
  arrival_time: string | null;
  direction: 'to_campus' | 'from_campus';
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ScheduleTemplateWithRelations extends ScheduleTemplate {
  route: { route_name: string; route_code: string } | null;
  vehicle: { registration_number: string; capacity: number } | null;
  driver: { id: string; tms_user_id: string } | null;
}

export interface CreateScheduleTemplateInput {
  route_id: string;
  vehicle_id?: string;
  driver_id?: string;
  days_of_week: number[];
  departure_time: string;
  arrival_time?: string;
  direction: 'to_campus' | 'from_campus';
}

export interface Schedule {
  id: string;
  institution_id: string;
  template_id: string | null;
  route_id: string;
  vehicle_id: string | null;
  driver_id: string | null;
  schedule_date: string; // DATE
  departure_time: string;
  arrival_time: string | null;
  direction: 'to_campus' | 'from_campus';
  status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
  cancellation_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface ScheduleWithRelations extends Schedule {
  route: { route_name: string; route_code: string } | null;
  vehicle: { registration_number: string; capacity: number } | null;
  driver: DriverWithDetails | null;
  seat_count: number; // computed: COUNT of seat assignments
}

export interface Holiday {
  id: string;
  institution_id: string;
  holiday_date: string;
  name: string;
  created_at: string;
}
```

#### Service Layer

**File**: `src/lib/services/schedule-template-service.ts`

```typescript
export class ScheduleTemplateService {
  static async getTemplates(institutionId: string): Promise<ScheduleTemplateWithRelations[]>;
  static async getTemplate(templateId: string): Promise<ScheduleTemplateWithRelations | null>;
  static async createTemplate(input: CreateScheduleTemplateInput, institutionId: string): Promise<ScheduleTemplate>;
  static async updateTemplate(templateId: string, input: Partial<CreateScheduleTemplateInput & { is_active: boolean }>): Promise<ScheduleTemplate>;
  static async deleteTemplate(templateId: string): Promise<void>;
}
```

**File**: `src/lib/services/schedule-service.ts`

```typescript
export class ScheduleService {
  // Queries
  static async getSchedules(filters: {
    institutionId: string;
    dateFrom?: string;
    dateTo?: string;
    routeId?: string;
    status?: Schedule['status'];
  }): Promise<ScheduleWithRelations[]>;
  static async getSchedule(scheduleId: string): Promise<ScheduleWithRelations | null>;
  static async getSchedulesForDate(institutionId: string, date: string): Promise<ScheduleWithRelations[]>;
  static async getSchedulesForRoute(routeId: string, dateFrom: string, dateTo: string): Promise<Schedule[]>;

  // Mutations
  static async createSchedule(input: Omit<Schedule, 'id' | 'created_at' | 'updated_at' | 'status' | 'cancellation_reason'>): Promise<Schedule>;
  static async updateScheduleStatus(scheduleId: string, status: Schedule['status'], reason?: string): Promise<Schedule>;
  static async cancelSchedule(scheduleId: string, reason: string): Promise<Schedule>;

  // Generation
  static async generateSchedulesFromTemplates(institutionId: string, daysAhead?: number): Promise<{ created: number; skipped: number; errors: string[] }>;
  static async getCompletenessReport(institutionId: string, daysAhead?: number): Promise<{ route_id: string; route_name: string; missing_dates: string[] }[]>;
}
```

**Schedule generation logic** (for `generateSchedulesFromTemplates`):

```
1. Fetch all active templates for the institution
2. Fetch all holidays for institution within the date range
3. For each template:
   a. For each day in next {daysAhead} days (default 7):
      - Is day_of_week in template.days_of_week? No -> skip
      - Is date in holidays? Yes -> skip
      - Does schedule already exist for (template_id, date, direction)? Yes -> skip (idempotent)
      - INSERT new schedule with status='scheduled'
4. Return counts: created, skipped, errors
```

#### Cron Endpoint

**File**: `src/app/api/cron/generate-schedules/route.ts`

```typescript
/**
 * Called daily by external cron (Vercel Cron, pg_cron, etc.)
 * Generates schedule instances from active templates for next 7 days.
 *
 * Auth: Verify cron secret header to prevent unauthorized calls.
 *
 * Steps:
 * 1. Get all institutions that have tms_settings
 * 2. For each institution, call ScheduleService.generateSchedulesFromTemplates
 * 3. Run completeness check — alert admin if any route missing schedules for next 3 days
 * 4. Return summary
 */
```

#### React Query Hooks

**File**: `src/hooks/use-schedules.ts`

```typescript
// Templates
export function useScheduleTemplates(): UseQueryResult<ScheduleTemplateWithRelations[]>;
export function useCreateTemplate(): UseMutationResult<ScheduleTemplate, Error, CreateScheduleTemplateInput>;
export function useUpdateTemplate(): UseMutationResult<ScheduleTemplate, Error, { id: string; input: Partial<CreateScheduleTemplateInput> }>;
export function useDeleteTemplate(): UseMutationResult<void, Error, string>;

// Schedules
export function useSchedules(filters: { dateFrom?: string; dateTo?: string; routeId?: string }): UseQueryResult<ScheduleWithRelations[]>;
export function useSchedule(id: string): UseQueryResult<ScheduleWithRelations | null>;
export function useTodaySchedules(): UseQueryResult<ScheduleWithRelations[]>;
export function useCancelSchedule(): UseMutationResult<Schedule, Error, { id: string; reason: string }>;
export function useGenerateSchedules(): UseMutationResult<{ created: number; skipped: number }, Error, void>;
```

#### UI Components

| Component | File | Purpose |
|-----------|------|---------|
| TemplatesPage | `app/(app)/admin/schedules/templates/page.tsx` | Data table of templates |
| CreateTemplateDialog | `components/admin/schedules/create-template-dialog.tsx` | Form with day picker |
| DayOfWeekPicker | `components/admin/schedules/day-of-week-picker.tsx` | Toggle buttons for M-T-W-T-F-S-S |
| SchedulesPage | `app/(app)/admin/schedules/page.tsx` | Calendar/list view of schedules |
| ScheduleCalendar | `components/admin/schedules/schedule-calendar.tsx` | Monthly calendar with schedule dots |
| CancelScheduleDialog | `components/admin/schedules/cancel-schedule-dialog.tsx` | Cancel with reason |
| GenerateButton | `components/admin/schedules/generate-button.tsx` | "Generate Now" trigger |
| HolidayManager | `components/admin/schedules/holiday-manager.tsx` | Add/remove holidays |

#### Testing Plan

| Test | Type | What to Verify |
|------|------|----------------|
| Template CRUD | Integration | Create, read, update, deactivate template |
| Schedule generation | Integration | Generates correct dates, skips holidays, idempotent |
| Holiday skip | Integration | No schedule generated on holiday dates |
| Duplicate prevention | Integration | Re-running generation does not create duplicates |
| Cancel schedule | Integration | Status changes, reason recorded |
| Completeness report | Integration | Identifies routes missing schedules |
| Day picker UI | Component | Correct days_of_week array produced |

---

### 2.2 Enrollment System

#### TypeScript Types

**File**: `src/types/enrollments.ts`

```typescript
export interface Enrollment {
  id: string;
  institution_id: string;
  student_id: string;
  route_id: string;
  boarding_stop_id: string | null;
  semester: string;
  academic_year: string;
  status: 'pending' | 'active' | 'expired' | 'cancelled';
  auto_renew: boolean;
  service_request_id: string | null;
  enrolled_at: string;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface EnrollmentWithRelations extends Enrollment {
  student: { full_name: string; email: string | null; phone: string | null } | null;
  route: { route_name: string; route_code: string } | null;
  boarding_stop: { stop_name: string; estimated_time: string | null } | null;
}

export interface CreateEnrollmentInput {
  student_id: string;
  route_id: string;
  boarding_stop_id?: string;
  semester: string;
  academic_year: string;
  service_request_id?: string;
  expires_at?: string;
}
```

#### Service Layer

**File**: `src/lib/services/enrollment-service.ts`

```typescript
export class EnrollmentService {
  // Queries
  static async getEnrollments(filters: {
    institutionId: string;
    status?: Enrollment['status'];
    routeId?: string;
    semester?: string;
  }): Promise<EnrollmentWithRelations[]>;
  static async getStudentEnrollment(studentId: string): Promise<EnrollmentWithRelations | null>;
  static async getRouteEnrollments(routeId: string, semester: string): Promise<EnrollmentWithRelations[]>;
  static async getEnrollmentCount(routeId: string, semester: string): Promise<number>;

  // Mutations
  static async createEnrollment(input: CreateEnrollmentInput, institutionId: string): Promise<Enrollment>;
  static async cancelEnrollment(enrollmentId: string): Promise<Enrollment>;
  static async expireEnrollment(enrollmentId: string): Promise<Enrollment>;
  static async toggleAutoRenew(enrollmentId: string, autoRenew: boolean): Promise<Enrollment>;
}
```

**Implementation notes**:
- `createEnrollment` should also auto-assign seat assignments for existing schedules in the enrollment's date range. This happens via: query all upcoming schedules for the route, then bulk-insert into `tms_trip_seat_assignments` with `assignment_type = 'enrolled'`.
- Unique constraint `(student_id, route_id, semester, academic_year)` prevents duplicate enrollments.

#### React Query Hooks

**File**: `src/hooks/use-enrollments.ts`

```typescript
export function useEnrollments(filters?: { routeId?: string; status?: string }): UseQueryResult<EnrollmentWithRelations[]>;
export function useMyEnrollment(): UseQueryResult<EnrollmentWithRelations | null>; // For student dashboard
export function useCreateEnrollment(): UseMutationResult<Enrollment, Error, CreateEnrollmentInput>;
export function useCancelEnrollment(): UseMutationResult<Enrollment, Error, string>;
export function useToggleAutoRenew(): UseMutationResult<Enrollment, Error, { id: string; autoRenew: boolean }>;
```

#### UI Components

| Component | File | Purpose |
|-----------|------|---------|
| EnrollmentsPage | `app/(app)/admin/enrollments/page.tsx` | Data table of all enrollments |
| CreateEnrollmentDialog | `components/admin/enrollments/create-enrollment-dialog.tsx` | Student + route + stop picker |
| EnrollmentStatusBadge | `components/shared/enrollment-status-badge.tsx` | Color-coded status |
| StudentRouteCard | `components/dashboard/student-route-card.tsx` | Student sees their assigned route |

---

### 2.3 Ad-hoc Booking

#### TypeScript Types

**File**: `src/types/bookings.ts`

```typescript
export interface Booking {
  id: string;
  institution_id: string;
  student_id: string;
  schedule_id: string;
  boarding_stop_id: string | null;
  status: 'confirmed' | 'cancelled' | 'completed' | 'no_show';
  billing_reference: string | null;
  booked_at: string;
  created_at: string;
  updated_at: string;
}

export interface BookingWithRelations extends Booking {
  schedule: {
    schedule_date: string;
    departure_time: string;
    route: { route_name: string; route_code: string } | null;
  } | null;
  boarding_stop: { stop_name: string } | null;
}

export interface CreateBookingInput {
  schedule_id: string;
  boarding_stop_id?: string;
}

export interface SeatAvailability {
  schedule_id: string;
  total_seats: number;
  assigned_seats: number;
  available_seats: number;
}
```

#### Service Layer

**File**: `src/lib/services/booking-service.ts`

```typescript
export class BookingService {
  // Queries
  static async getBookings(filters: {
    institutionId: string;
    scheduleId?: string;
    studentId?: string;
  }): Promise<BookingWithRelations[]>;
  static async getMyBookings(studentId: string): Promise<BookingWithRelations[]>;
  static async getSeatAvailability(scheduleId: string): Promise<SeatAvailability>;

  // Mutations
  static async createBooking(input: CreateBookingInput, studentId: string, institutionId: string): Promise<Booking>;
  static async cancelBooking(bookingId: string): Promise<Booking>;
}
```

**Implementation notes for `createBooking`**:
1. Check seat availability: count existing `tms_trip_seat_assignments` for the schedule
2. If `available_seats <= 0`, throw "No seats available"
3. Insert into `tms_bookings`
4. Insert into `tms_trip_seat_assignments` with next available `seat_number` and `assignment_type = 'adhoc'`
5. Both inserts should be atomic (use service role client with a single transaction)

#### React Query Hooks

**File**: `src/hooks/use-bookings.ts`

```typescript
export function useMyBookings(): UseQueryResult<BookingWithRelations[]>;
export function useSeatAvailability(scheduleId: string): UseQueryResult<SeatAvailability>;
export function useCreateBooking(): UseMutationResult<Booking, Error, CreateBookingInput>;
export function useCancelBooking(): UseMutationResult<Booking, Error, string>;
```

#### UI Components

| Component | File | Purpose |
|-----------|------|---------|
| BookButton | `components/dashboard/book-button.tsx` | "Book a Ride" on schedule cards |
| BookingConfirmDialog | `components/dashboard/booking-confirm-dialog.tsx` | Confirm booking with stop selection |
| SeatAvailabilityBadge | `components/shared/seat-availability-badge.tsx` | "12/40 seats available" |
| MyBookingsList | `components/dashboard/my-bookings-list.tsx` | Student's booking history |

### 2.4 Unified Seat Management

The `tms_trip_seat_assignments` table is the central capacity authority. No separate module needed — it is written to by:

1. **Schedule generation cron**: When a schedule is generated, auto-assign seats for all active enrollments on that route
2. **Ad-hoc booking service**: When a student books, assign next available seat
3. **Enrollment service**: When a new enrollment is created, assign seats for existing upcoming schedules

**Seat assignment logic** (utility function in `src/lib/services/seat-service.ts`):

```typescript
export class SeatService {
  /**
   * Auto-assign enrolled students to a newly generated schedule.
   * Called by schedule generation cron after inserting a new schedule.
   */
  static async assignEnrolledStudents(
    scheduleId: string,
    routeId: string,
    institutionId: string
  ): Promise<number>;

  /**
   * Assign a single ad-hoc booking to next available seat.
   * Returns the assigned seat number, or throws if full.
   */
  static async assignAdHocSeat(
    scheduleId: string,
    userId: string,
    bookingId: string,
    institutionId: string
  ): Promise<number>;

  /**
   * Get seat availability for a schedule.
   */
  static async getAvailability(scheduleId: string): Promise<SeatAvailability>;
}
```

#### Testing Plan (Phase 2)

| Test | Type | What to Verify |
|------|------|----------------|
| Template -> schedule generation | Integration | Correct schedules created, holidays skipped |
| Enrollment CRUD | Integration | Create, cancel, auto-renew toggle |
| Enrollment creates seat assignments | Integration | Seats assigned for existing schedules |
| Ad-hoc booking creates seat assignment | Integration | Seat number assigned, capacity enforced |
| Overbooking prevention | Integration | Booking fails when vehicle at capacity |
| Seat count query | Integration | Correct count of assigned vs total |
| Duplicate enrollment prevention | Integration | Unique constraint enforced |

### Phase 2 Deliverables Checklist

- [ ] Schedule templates CRUD with day-of-week picker
- [ ] Holiday management (add/remove dates)
- [ ] Schedule auto-generation from templates (cron endpoint working)
- [ ] Completeness report identifying gaps
- [ ] Enrollment management (admin creates, views, cancels)
- [ ] Ad-hoc booking with real-time seat availability check
- [ ] Unified seat assignment working for both enrollment and booking
- [ ] All admin pages functional

---

## 5. Phase 3: Live Tracking & Attendance (Week 4)

### 3.1 Driver Location Sharing

#### API Endpoint

**File**: `src/app/api/driver/location/route.ts`

```typescript
/**
 * POST /api/driver/location
 * Upserts the driver's current GPS position.
 * Called every 30 seconds by the driver's browser.
 *
 * Auth: JWT (auth.uid() must match a tms_drivers.myjkkn_user_id)
 *
 * Body: { lat: number, lng: number, heading?: number, speed?: number, accuracy?: number, schedule_id?: string }
 *
 * Implementation:
 * 1. Verify JWT -> get auth.uid()
 * 2. Find tms_drivers WHERE myjkkn_user_id = auth.uid()
 * 3. Upsert tms_driver_locations ON CONFLICT (driver_id)
 * 4. The DB trigger tms_notify_driver_location() fires pg_notify
 * 5. Return 200
 */
```

#### TypeScript Types

**File**: `src/types/tracking.ts` (add to existing)

```typescript
export interface DriverLocation {
  id: string;
  institution_id: string;
  driver_id: string;
  schedule_id: string | null;
  lat: number;
  lng: number;
  heading: number | null;
  speed: number | null;
  accuracy: number | null;
  updated_at: string;
}

export interface LocationUpdate {
  lat: number;
  lng: number;
  heading?: number;
  speed?: number;
  accuracy?: number;
  schedule_id?: string;
}
```

#### Driver UI

**File**: `src/app/(app)/driver/page.tsx`

The driver dashboard has a prominent location sharing toggle as the primary CTA.

| Component | File | Purpose |
|-----------|------|---------|
| DriverDashboard | `app/(app)/driver/page.tsx` | Main driver page |
| LocationToggle | `components/driver/location-toggle.tsx` | Large slide-to-activate toggle |
| LocationTracker | `components/driver/location-tracker.tsx` | Headless component that calls `navigator.geolocation.watchPosition` |
| TripInfoCard | `components/driver/trip-info-card.tsx` | Current route + schedule info |

**LocationTracker implementation**:

```typescript
/**
 * Headless component mounted when driver activates location sharing.
 *
 * 1. Call navigator.geolocation.watchPosition with highAccuracy: true
 * 2. Every 30 seconds (or on significant position change), POST to /api/driver/location
 * 3. Show GPS status indicator (online/recent/offline based on last successful update)
 * 4. On error: show toast, retry automatically
 * 5. On component unmount (toggle off): clearWatch, optionally mark driver offline
 */
```

### 3.2 Student Live Tracking

#### Realtime Subscription

**File**: `src/hooks/use-live-tracking.ts`

```typescript
/**
 * Subscribes to Supabase Realtime for driver location updates on the student's route.
 *
 * Two approaches (pick one during implementation):
 *
 * Option A: Postgres Changes (simpler)
 *   supabase.channel('driver-location')
 *     .on('postgres_changes', {
 *       event: 'UPDATE',
 *       schema: 'public',
 *       table: 'tms_driver_locations',
 *       filter: `driver_id=eq.${driverId}`,
 *     }, callback)
 *     .subscribe()
 *
 * Option B: Broadcast (lower latency, more control)
 *   Driver client broadcasts to channel `route:{routeId}` after DB write.
 *   Student subscribes to same channel.
 *
 * Recommendation: Start with Option A (simpler). Switch to B if latency is an issue.
 */

export function useLiveTracking(routeId: string, driverId: string): {
  location: DriverLocation | null;
  status: 'online' | 'recent' | 'offline';
  lastUpdated: Date | null;
};
```

**GPS status logic**:
- **Online**: `updated_at` within last 60 seconds
- **Recent**: `updated_at` within last 5 minutes
- **Offline**: `updated_at` older than 5 minutes

#### Student UI Components

| Component | File | Purpose |
|-----------|------|---------|
| ETACard | `components/dashboard/eta-card.tsx` | Dashboard card: "Bus 7 is 3 stops away, ETA ~8 min" |
| LiveTrackingPage | `app/(app)/dashboard/live-track/page.tsx` | Full-page Leaflet map |
| LiveTrackingMap | `components/maps/live-tracking-map.tsx` | Map with route, stops, live bus marker |
| BusMarker | `components/maps/bus-marker.tsx` | Animated marker with heading arrow |
| StopMarker | `components/maps/stop-marker.tsx` | Numbered stop markers |

**LiveTrackingMap features**:
- Route polyline drawn from stop coordinates
- Stop markers numbered by `stop_order`
- Student's boarding stop highlighted (green)
- Live bus marker (animated, rotates with heading)
- ETA text overlay (calculated from stop distances + current speed)
- Auto-center on bus location
- "Low data mode" setting: hide map, show text-only ETA
- Lazy-loaded: `dynamic(() => import(...), { ssr: false })`

### 3.3 QR Code System

#### HMAC Generation

**File**: `src/lib/qr/hmac.ts`

```typescript
import { createHmac } from 'crypto';

const QR_SECRET = process.env.QR_HMAC_SECRET!;

/**
 * Generate HMAC for QR payload.
 * Data string: studentId + routeId + enrollmentId + floor(timestamp / 30)
 */
export function generateQRHmac(
  studentId: string,
  routeId: string,
  enrollmentId: string,
  timestamp: number
): string {
  const timeSlot = Math.floor(timestamp / 30);
  const data = `${studentId}${routeId}${enrollmentId}${timeSlot}`;
  return createHmac('sha256', QR_SECRET).update(data).digest('hex');
}

/**
 * Verify HMAC from scanned QR payload.
 * Accepts current time slot and previous time slot (60s window).
 */
export function verifyQRHmac(
  studentId: string,
  routeId: string,
  enrollmentId: string,
  timestamp: number,
  hmac: string
): boolean {
  const now = Math.floor(Date.now() / 1000);

  // Reject if older than 60 seconds
  if (now - timestamp > 60) return false;

  // Check current and previous time slots
  const currentSlot = Math.floor(timestamp / 30);
  const prevSlot = currentSlot - 1;

  const hmac1 = createHmac('sha256', QR_SECRET)
    .update(`${studentId}${routeId}${enrollmentId}${currentSlot}`)
    .digest('hex');
  const hmac2 = createHmac('sha256', QR_SECRET)
    .update(`${studentId}${routeId}${enrollmentId}${prevSlot}`)
    .digest('hex');

  return hmac === hmac1 || hmac === hmac2;
}
```

#### QR Payload

**File**: `src/lib/qr/payload.ts`

```typescript
export interface QRPayload {
  sid: string; // student_id
  rid: string; // route_id
  eid: string; // enrollment_id
  ts: number;  // Unix timestamp
  hmac: string;
}

export function encodeQRPayload(payload: QRPayload): string {
  return JSON.stringify(payload);
}

export function decodeQRPayload(raw: string): QRPayload | null {
  try {
    const parsed = JSON.parse(raw);
    if (parsed.sid && parsed.rid && parsed.eid && parsed.ts && parsed.hmac) {
      return parsed as QRPayload;
    }
    return null;
  } catch {
    return null;
  }
}
```

#### QR Display Component (Student)

**File**: `src/components/qr/qr-display.tsx`

```typescript
/**
 * Student QR code display with time-rotating HMAC.
 *
 * Features:
 * - Regenerates QR every 30 seconds
 * - Countdown ring showing time until next rotation
 * - Forces max screen brightness (Screen Wake Lock API)
 * - High-contrast QR (no logo overlay)
 * - Works offline (uses cached enrollment data + client-side HMAC)
 *
 * Props:
 * - studentId: string
 * - routeId: string
 * - enrollmentId: string
 *
 * Uses: qrcode.react for rendering
 *
 * Implementation:
 * 1. Call /api/qr/generate endpoint to get HMAC (server-side secret)
 *    OR embed HMAC secret client-side for offline support (encrypted in IndexedDB)
 * 2. Set interval at 30s to regenerate
 * 3. Show countdown ring (SVG circle with dashoffset animation)
 * 4. Request wakeLock to prevent screen sleep
 */
```

#### QR Scanner Component (Driver/Staff)

**File**: `src/components/qr/qr-scanner.tsx`

```typescript
/**
 * Camera-based QR code scanner using html5-qrcode.
 *
 * Flow:
 * 1. Open camera via html5-qrcode
 * 2. On successful scan, decode QR payload
 * 3. POST to /api/attendance/scan to verify HMAC + record attendance
 * 4. Show success/error toast with student name
 * 5. Ready for next scan immediately
 *
 * Offline mode:
 * - Verify HMAC locally (secret stored in IndexedDB)
 * - Store attendance record in IndexedDB queue
 * - Show "Offline" badge + scanned count
 * - Sync when back online
 *
 * Props:
 * - scheduleId: string (current trip)
 * - onScanSuccess: (studentName: string) => void
 * - onScanError: (error: string) => void
 */
```

### 3.4 Attendance Management

#### TypeScript Types

**File**: `src/types/attendance.ts`

```typescript
export interface AttendanceRecord {
  id: string;
  institution_id: string;
  student_id: string;
  schedule_id: string;
  scan_date: string;
  scan_type: 'boarding' | 'alighting';
  scan_method: 'qr' | 'manual';
  scanned_by: string;
  scanned_at: string;
  lat: number | null;
  lng: number | null;
  created_at: string;
}

export interface AttendanceWithStudent extends AttendanceRecord {
  student: { full_name: string; email: string | null } | null;
}

export interface AttendanceSummary {
  schedule_id: string;
  total_assigned: number;
  boarded: number;
  not_boarded: number;
}
```

#### Service Layer

**File**: `src/lib/services/attendance-service.ts`

```typescript
export class AttendanceService {
  // Queries
  static async getAttendanceForSchedule(scheduleId: string): Promise<AttendanceWithStudent[]>;
  static async getAttendanceForDate(institutionId: string, date: string): Promise<AttendanceWithStudent[]>;
  static async getAttendanceSummary(scheduleId: string): Promise<AttendanceSummary>;
  static async getStudentAttendanceHistory(studentId: string, limit?: number): Promise<AttendanceRecord[]>;

  // Mutations
  static async recordScan(input: {
    studentId: string;
    scheduleId: string;
    scanType: 'boarding' | 'alighting';
    scanMethod: 'qr' | 'manual';
    scannedBy: string;
    lat?: number;
    lng?: number;
    institutionId: string;
  }): Promise<AttendanceRecord>;

  static async recordManualAttendance(input: {
    studentId: string;
    scheduleId: string;
    scannedBy: string;
    institutionId: string;
  }): Promise<AttendanceRecord>;

  // Bulk sync (for offline scans)
  static async syncOfflineScans(scans: Array<{
    studentId: string;
    scheduleId: string;
    scanType: 'boarding' | 'alighting';
    scannedBy: string;
    scannedAt: string;
    lat?: number;
    lng?: number;
    institutionId: string;
  }>): Promise<{ synced: number; duplicates: number; errors: number }>;
}
```

**Implementation notes**:
- `recordScan` uses `ON CONFLICT (student_id, schedule_id, scan_date, scan_type) DO NOTHING` to prevent duplicate scans
- `syncOfflineScans` bulk-inserts with the same conflict handling, counting duplicates

#### React Query Hooks

**File**: `src/hooks/use-attendance.ts`

```typescript
export function useScheduleAttendance(scheduleId: string): UseQueryResult<AttendanceWithStudent[]>;
export function useAttendanceSummary(scheduleId: string): UseQueryResult<AttendanceSummary>;
export function useRecordScan(): UseMutationResult<AttendanceRecord, Error, { /* scan params */ }>;
export function useManualAttendance(): UseMutationResult<AttendanceRecord, Error, { studentId: string; scheduleId: string }>;
export function useSyncOfflineScans(): UseMutationResult<{ synced: number }, Error, void>;
```

#### UI Components

| Component | File | Purpose |
|-----------|------|---------|
| QRCodePage (Student) | `app/(app)/dashboard/my-qr/page.tsx` | Full-page QR display |
| ScanPage (Driver) | `app/(app)/driver/scan/page.tsx` | Camera scanner + scan history |
| AttendancePage (Staff) | `app/(app)/staff/attendance/page.tsx` | View/manage attendance |
| PassengerList (Driver) | `app/(app)/driver/passengers/page.tsx` | Passenger list with check-in status |
| ManualCheckIn | `components/shared/manual-checkin.tsx` | Fallback: select student from list |
| AttendanceReport (Admin) | `app/(app)/admin/attendance/page.tsx` | Reports by route, date, student |
| OfflineSyncBanner | `components/shared/offline-sync-banner.tsx` | Shows pending offline scans count |

#### Testing Plan (Phase 3)

| Test | Type | What to Verify |
|------|------|----------------|
| Driver location upsert | Integration | Single row per driver, updated_at changes |
| Realtime subscription | Integration | Student receives location update within 2s |
| GPS status indicators | Unit | Correct status based on updated_at age |
| QR HMAC generation | Unit | Same inputs produce same HMAC |
| QR HMAC verification | Unit | Valid within 60s, rejected after |
| QR rotation | Component | QR code changes every 30s |
| Attendance dedup | Integration | Duplicate scan returns success but no new record |
| Offline scan sync | Integration | Queued scans sync on reconnect, duplicates handled |
| Manual check-in | Integration | Attendance recorded with scan_method='manual' |
| Seat availability after attendance | Integration | Counts match expected |

### Phase 3 Deliverables Checklist

- [ ] Driver location sharing with 30s GPS updates
- [ ] Supabase Realtime subscription working for live tracking
- [ ] Student live tracking page with Leaflet map
- [ ] ETA card on student dashboard
- [ ] QR code display with 30s rotation + countdown ring
- [ ] QR scanner with HMAC verification
- [ ] Attendance recording with deduplication
- [ ] Manual check-in fallback
- [ ] Offline scan queue (IndexedDB) with sync
- [ ] Admin attendance reports

---

## 6. Phase 4: Grievances & Notifications (Week 5)

### 4.1 Grievance System

#### TypeScript Types

**File**: `src/types/grievances.ts`

```typescript
export type GrievanceCategory =
  | 'bus_late'
  | 'overcrowding'
  | 'driver_behavior'
  | 'vehicle_condition'
  | 'route_issue'
  | 'other';

export type StudentGrievanceStatus = 'submitted' | 'in_progress' | 'resolved';
export type AdminGrievanceStatus =
  | 'submitted'
  | 'triaged'
  | 'assigned'
  | 'investigating'
  | 'resolved'
  | 'closed';

export interface Grievance {
  id: string;
  institution_id: string;
  student_id: string;
  route_id: string | null;
  schedule_id: string | null;
  category: GrievanceCategory;
  description: string;
  student_status: StudentGrievanceStatus;
  admin_status: AdminGrievanceStatus;
  assigned_to: string | null;
  resolution_text: string | null;
  created_at: string;
  resolved_at: string | null;
  updated_at: string;
}

export interface GrievanceWithRelations extends Grievance {
  student: { full_name: string; email: string | null } | null;
  route: { route_name: string; route_code: string } | null;
  assigned_user: { full_name: string } | null;
  comment_count: number;
}

export interface GrievanceComment {
  id: string;
  institution_id: string;
  grievance_id: string;
  author_id: string;
  body: string;
  is_internal: boolean;
  created_at: string;
}

export interface GrievanceCommentWithAuthor extends GrievanceComment {
  author: { full_name: string; role: string } | null;
}

export interface CreateGrievanceInput {
  category: GrievanceCategory;
  description: string;
  route_id?: string;
  schedule_id?: string;
}
```

#### Service Layer

**File**: `src/lib/services/grievance-service.ts`

```typescript
export class GrievanceService {
  // Queries
  static async getGrievances(filters: {
    institutionId: string;
    adminStatus?: AdminGrievanceStatus;
    category?: GrievanceCategory;
    assignedTo?: string;
  }): Promise<GrievanceWithRelations[]>;
  static async getGrievance(grievanceId: string): Promise<GrievanceWithRelations | null>;
  static async getMyGrievances(studentId: string): Promise<GrievanceWithRelations[]>;
  static async getComments(grievanceId: string, includeInternal: boolean): Promise<GrievanceCommentWithAuthor[]>;

  // Student mutations
  static async createGrievance(input: CreateGrievanceInput, studentId: string, institutionId: string): Promise<Grievance>;

  // Admin mutations
  static async updateAdminStatus(grievanceId: string, status: AdminGrievanceStatus): Promise<Grievance>;
  static async assignGrievance(grievanceId: string, assignedTo: string): Promise<Grievance>;
  static async resolveGrievance(grievanceId: string, resolutionText: string): Promise<Grievance>;
  static async addComment(grievanceId: string, authorId: string, body: string, isInternal: boolean, institutionId: string): Promise<GrievanceComment>;
}
```

**Status mapping (student_status auto-updated based on admin_status)**:

```
admin_status -> student_status mapping:
  submitted   -> submitted
  triaged     -> submitted (student doesn't see this distinction)
  assigned    -> in_progress
  investigating -> in_progress
  resolved    -> resolved
  closed      -> resolved
```

This mapping is enforced in `updateAdminStatus` — it writes both columns atomically.

#### React Query Hooks

**File**: `src/hooks/use-grievances.ts`

```typescript
// Student
export function useMyGrievances(): UseQueryResult<GrievanceWithRelations[]>;
export function useCreateGrievance(): UseMutationResult<Grievance, Error, CreateGrievanceInput>;

// Admin/Staff
export function useGrievances(filters?: { adminStatus?: string; category?: string }): UseQueryResult<GrievanceWithRelations[]>;
export function useGrievance(id: string): UseQueryResult<GrievanceWithRelations | null>;
export function useGrievanceComments(grievanceId: string, includeInternal: boolean): UseQueryResult<GrievanceCommentWithAuthor[]>;
export function useAssignGrievance(): UseMutationResult<Grievance, Error, { id: string; assignedTo: string }>;
export function useResolveGrievance(): UseMutationResult<Grievance, Error, { id: string; resolutionText: string }>;
export function useAddComment(): UseMutationResult<GrievanceComment, Error, { grievanceId: string; body: string; isInternal: boolean }>;
```

#### UI Components

**Student side**:

| Component | File | Purpose |
|-----------|------|---------|
| GrievancesPage | `app/(app)/dashboard/grievances/page.tsx` | List of student's grievances |
| GrievanceDetailPage | `app/(app)/dashboard/grievances/[id]/page.tsx` | Single grievance with comments |
| SubmitGrievanceDialog | `components/dashboard/grievances/submit-dialog.tsx` | Quick category + description form |
| CategoryPicker | `components/dashboard/grievances/category-picker.tsx` | Icon grid for quick selection |
| GrievanceTimeline | `components/shared/grievance-timeline.tsx` | Status timeline: Submitted -> In Progress -> Resolved |

**Admin side**:

| Component | File | Purpose |
|-----------|------|---------|
| AdminGrievancesPage | `app/(app)/admin/grievances/page.tsx` | Data table with filters |
| GrievanceDetailPanel | `components/admin/grievances/detail-panel.tsx` | Side panel with full details |
| AssignDialog | `components/admin/grievances/assign-dialog.tsx` | Assign to staff member |
| ResolveDialog | `components/admin/grievances/resolve-dialog.tsx` | Resolution text form |
| CommentThread | `components/shared/comment-thread.tsx` | Threaded comments (internal/external toggle) |

---

### 4.2 Notification System

#### TypeScript Types

**File**: `src/types/notifications.ts`

```typescript
export interface NotificationOutbox {
  id: string;
  institution_id: string;
  user_ids: string[];
  title: string;
  message: string;
  category: string;
  priority: 'low' | 'normal' | 'urgent';
  status: 'pending' | 'sent' | 'failed';
  attempts: number;
  max_attempts: number;
  last_attempt_at: string | null;
  retry_after: string | null;
  error_message: string | null;
  created_at: string;
  sent_at: string | null;
}
```

#### Service Layer

**File**: `src/lib/services/notification-service.ts`

```typescript
export class NotificationService {
  /**
   * Queue a notification for delivery via B2A.
   * Inserts into tms_notification_outbox with status='pending'.
   * The cron job picks it up and delivers via B2A.
   */
  static async queueNotification(input: {
    userIds: string[];
    title: string;
    message: string;
    category?: string;
    priority?: 'low' | 'normal' | 'urgent';
    institutionId: string;
  }): Promise<NotificationOutbox>;

  /**
   * Process pending notifications (called by cron).
   * For each pending notification:
   * 1. Call B2A POST /api/b2a/notifications/send
   * 2. On success: mark as 'sent'
   * 3. On failure: increment attempts, set retry_after with exponential backoff
   * 4. On max attempts exceeded: mark as 'failed'
   */
  static async processOutbox(limit?: number): Promise<{ sent: number; failed: number; retried: number }>;

  /**
   * Also broadcast via Supabase Realtime for urgent notifications.
   * Connected PWA users receive these instantly.
   */
  static async broadcastUrgent(
    channel: string,
    payload: { title: string; message: string; category: string }
  ): Promise<void>;
}
```

#### Cron Endpoint

**File**: `src/app/api/cron/process-notifications/route.ts`

```typescript
/**
 * Called every 30 seconds by external cron.
 * Auth: Verify cron secret header.
 *
 * 1. SELECT pending notifications WHERE retry_after IS NULL OR retry_after < NOW()
 * 2. LIMIT 10 per run (avoid timeout)
 * 3. For each: attempt B2A delivery
 * 4. Return summary: { sent, failed, retried }
 */
```

**Exponential backoff**: `retry_after = NOW() + (2^attempts * 30 seconds)`. Max 5 attempts.

#### Notification Triggers

These events queue notifications:

| Event | Recipients | Priority | Category |
|-------|-----------|----------|----------|
| Schedule cancelled | All enrolled students on route | urgent | transport |
| Driver changed | All enrolled students on route | normal | transport |
| New grievance comment | Grievance student | normal | grievance |
| Grievance resolved | Grievance student | normal | grievance |
| Grace period expiring (2 days left) | Student | urgent | billing |
| Access expired | Student | normal | billing |
| Auto-renewal notice | Students with expiring enrollments | normal | enrollment |

#### Testing Plan (Phase 4)

| Test | Type | What to Verify |
|------|------|----------------|
| Create grievance | Integration | Record created, student_status = 'submitted' |
| Admin status change updates student status | Integration | Mapping works correctly |
| Assign grievance | Integration | assigned_to set, admin_status = 'assigned' |
| Resolve grievance | Integration | resolution_text set, resolved_at set |
| Internal vs external comments | Integration | Students only see external comments |
| Queue notification | Integration | Record in outbox with status='pending' |
| Process outbox | Integration | Calls B2A, updates status |
| Retry with backoff | Integration | Attempts incremented, retry_after calculated |
| Max attempts -> failed | Integration | Status changes to 'failed' after 5 attempts |
| Urgent broadcast | Integration | Realtime message received by subscribed client |

### Phase 4 Deliverables Checklist

- [ ] Student grievance submission with category picker
- [ ] Student grievance list with simplified 3-status view
- [ ] Admin grievance management (triage, assign, investigate, resolve, close)
- [ ] Comment thread with internal/external toggle
- [ ] Notification outbox with B2A delivery
- [ ] Cron endpoint processing pending notifications
- [ ] Exponential backoff for failed deliveries
- [ ] Urgent notifications via Supabase Realtime broadcast

---

## 7. Phase 5: PWA & Polish (Week 6)

### 5.1 PWA Configuration

**File**: `public/manifest.json`

```json
{
  "name": "JKKN Transport",
  "short_name": "TMS",
  "description": "JKKN College Transport Management System",
  "start_url": "/dashboard",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#1e40af",
  "orientation": "portrait-primary",
  "icons": [
    { "src": "/icons/icon-192x192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512x512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

**Service worker caching strategy**:

| Content | Strategy | Rationale |
|---------|----------|-----------|
| Static assets (JS, CSS, images) | Cache-first | Rarely change, fast load |
| Route/stop data | Stale-while-revalidate | Changes infrequently, must be available offline |
| Schedule data | Network-first | Changes daily, needs freshness |
| Attendance records | Network-first | Must sync to server |
| Live tracking | Network-only | Real-time data, no caching |
| QR HMAC secret | Encrypted IndexedDB | Must work offline for QR generation |

**Offline capabilities**:

| Feature | Offline Behavior |
|---------|-----------------|
| QR code display | Works (HMAC generated locally from cached data) |
| QR code scan | Works (HMAC verified locally, record queued in IndexedDB) |
| Dashboard | Shows cached data with "Offline" banner |
| Live tracking | Paused, shows "Last known location" |
| Grievance submit | Queued in IndexedDB, synced when online |
| Schedule view | Shows cached schedules |

### 5.2 Role-Based Navigation

#### Student Navigation (Bottom Tab Bar)

```
[ Home ]  [ Track ]  [ QR ]  [ Schedule ]  [ More ]
   |         |         |         |            |
   v         v         v         v            v
 /dashboard  /live    /my-qr   /schedule   Drawer:
             -track                        - Grievances
                                           - Profile
                                           - Settings
```

**File**: `src/components/navigation/student-nav.tsx`

#### Driver Navigation (Bottom Tab Bar)

```
[ Trip ]  [ Scan ]  [ Passengers ]  [ Route ]  [ Profile ]
   |         |           |             |           |
   v         v           v             v           v
 /driver   /driver/    /driver/      /driver/    Drawer
           scan        passengers    routes
```

**File**: `src/components/navigation/driver-nav.tsx`

#### Staff Navigation (Bottom Tab Bar)

```
[ Attendance ]  [ Students ]  [ Routes ]  [ Grievances ]  [ Profile ]
      |              |           |              |              |
      v              v           v              v              v
 /staff/         /staff/      /staff/       /staff/        Drawer
 attendance      students     routes        grievances
```

**File**: `src/components/navigation/staff-nav.tsx`

#### Admin Navigation (Sidebar)

```
Sidebar:
  Dashboard        /admin
  Routes           /admin/routes
  Vehicles         /admin/vehicles
  Drivers          /admin/drivers
  Schedules        /admin/schedules
    Templates      /admin/schedules/templates
  Enrollments      /admin/enrollments
  Attendance       /admin/attendance
  Grievances       /admin/grievances
  Settings         /admin/settings
```

**File**: `src/components/navigation/admin-sidebar.tsx`

### 5.3 Auth Provider & Access Gate

**File**: `src/components/auth/auth-provider.tsx`

```typescript
/**
 * Wraps the (app) layout. On mount:
 * 1. Get Supabase session
 * 2. If no session -> redirect to MyJKKN login
 * 3. Decode JWT -> get user_id
 * 4. Fetch tms_users record (or create via B2A sync if first visit)
 * 5. Check access_status (access gate)
 * 6. Start JWT health check interval (60s)
 * 7. Provide user context to children
 *
 * Context value:
 * {
 *   user: TMSUser | null;
 *   isLoading: boolean;
 *   accessStatus: AccessStatus;
 *   permissions: string[];
 *   role: 'student' | 'driver' | 'staff' | 'admin';
 * }
 */
```

**File**: `src/components/auth/access-gate.tsx`

```typescript
/**
 * Renders children only if user has TMS access.
 * Otherwise shows appropriate blocked state:
 *
 * - "none": "Request transport via MyJKKN" + link
 * - "grace": Children + yellow banner "Payment due by [date]"
 * - "expired": Full-page block: "Pay transport bill to access" + link to MyJKKN billing
 * - "active": Children (no banner)
 */
```

**File**: `src/components/auth/role-guard.tsx`

```typescript
/**
 * Redirects user to their role-appropriate dashboard if they land on wrong route.
 *
 * Props:
 * - allowedRoles: ('student' | 'driver' | 'staff' | 'admin')[]
 * - children: React.ReactNode
 *
 * If user.role not in allowedRoles, redirect:
 * - student -> /dashboard
 * - driver -> /driver
 * - staff -> /staff
 * - admin -> /admin
 */
```

### 5.4 Webhook Endpoint

**File**: `src/app/api/webhooks/payment-confirmed/route.ts`

```typescript
/**
 * POST /api/webhooks/payment-confirmed
 * Called by MyJKKN when a transport bill is paid.
 *
 * 1. Verify HMAC signature: X-Webhook-Signature header
 *    signature = HMAC-SHA256(webhook_secret, raw_body)
 * 2. Parse body: { event, bill_id, student_id, institution_id, amount_paid, ... }
 * 3. Find tms_users WHERE myjkkn_user_id = student_id
 * 4. Update: billing_status = 'paid', access_status = 'active', hard_cache_refreshed_at = NOW()
 * 5. Return 200 { status: 'processed' }
 *
 * Idempotent: If already 'active', still return 200.
 * On invalid signature: Return 400 { status: 'rejected', reason: 'invalid_signature' }
 */
```

### 5.5 Cron Endpoints

**File**: `src/app/api/cron/check-grace-periods/route.ts`

```typescript
/**
 * Called daily. Checks for expired grace periods.
 * 1. SELECT tms_users WHERE access_status = 'grace' AND access_expires_at < NOW()
 * 2. UPDATE access_status = 'expired'
 * 3. Queue notification: "Your transport access has expired. Pay to restore."
 */
```

**File**: `src/app/api/cron/sync-users/route.ts`

```typescript
/**
 * Called daily. Refreshes soft cache for active users.
 * 1. SELECT myjkkn_user_id FROM tms_users WHERE access_status IN ('active', 'grace')
 * 2. Batch into groups of 100
 * 3. For each batch: POST B2A /users/batch
 * 4. Update tms_users with fresh profile data
 * 5. Update last_synced_at
 */
```

### 5.6 Responsive Design

| Role | Primary Device | Design Approach |
|------|---------------|----------------|
| Student | Mobile | Mobile-first, bottom tab nav, large touch targets |
| Driver | Mobile | Mobile-first, minimal UI, large buttons |
| Staff | Mobile/Tablet | Mobile-first with tablet breakpoint |
| Admin | Desktop | Desktop-first sidebar layout, responsive to tablet |

**Breakpoints**:
- `sm` (640px): Mobile landscape
- `md` (768px): Tablet
- `lg` (1024px): Desktop
- `xl` (1280px): Wide desktop

**Common patterns**:
- All forms use `react-hook-form` with `zod` validation
- Data tables: horizontal scroll on mobile, column hiding on small screens
- Dialogs: full-screen on mobile (`className="sm:max-w-md"`)
- Loading states: skeleton components matching final layout
- Empty states: illustration + message + CTA
- Error boundaries: per-page with retry button

### 5.7 Dark Mode Support

```typescript
// In root layout, wrap with ThemeProvider
// Use CSS variables for theme colors
// Support: light, dark, system
// Storage: localStorage key 'tms-theme'
```

### Phase 5 Deliverables Checklist

- [ ] PWA installable on Android and iOS
- [ ] Service worker caching all static assets
- [ ] Offline QR display working
- [ ] Offline scan + sync working
- [ ] Role-based navigation for all 4 roles
- [ ] Auth provider with JWT health check
- [ ] Access gate blocking unpaid users
- [ ] Grace period banner for grace users
- [ ] Payment webhook processing correctly
- [ ] All cron endpoints functional (schedules, notifications, grace periods, user sync)
- [ ] Responsive design tested on mobile, tablet, desktop
- [ ] Dark mode toggle working
- [ ] Loading, empty, and error states on all pages

---

## Appendix A: Complete SQL Reference

All SQL is defined in TMS-SPEC.md Section 20-21 and the Appendix (Section 26). The tables, in creation order:

### Tables (17 total)

Execute in this order due to foreign key dependencies:

```sql
-- 1. tms_users (no FK dependencies)
-- 2. tms_routes (no FK dependencies)
-- 3. tms_route_stops (FK: tms_routes)
-- 4. tms_vehicles (no FK dependencies)
-- 5. tms_drivers (FK: tms_users, tms_vehicles)
-- 6. tms_schedule_templates (FK: tms_routes, tms_vehicles, tms_drivers)
-- 7. tms_holidays (no FK dependencies)
-- 8. tms_schedules (FK: tms_schedule_templates, tms_routes, tms_vehicles, tms_drivers)
-- 9. tms_enrollments (FK: tms_users, tms_routes, tms_route_stops)
-- 10. tms_bookings (FK: tms_users, tms_schedules, tms_route_stops)
-- 11. tms_trip_seat_assignments (FK: tms_schedules, tms_users, tms_enrollments, tms_bookings)
-- 12. tms_attendance (FK: tms_users, tms_schedules)
-- 13. tms_driver_locations (FK: tms_drivers, tms_schedules)
-- 14. tms_driver_location_history (FK: tms_drivers, tms_schedules)
-- 15. tms_grievances (FK: tms_users, tms_routes, tms_schedules)
-- 16. tms_grievance_comments (FK: tms_grievances, tms_users)
-- 17. tms_notification_outbox (no FK dependencies)
-- 18. tms_settings (no FK dependencies)
```

The complete CREATE TABLE, CREATE INDEX, RLS, and trigger SQL is in TMS-SPEC.md Sections 20, 21, and 26. Copy verbatim — do not modify column names, types, or constraints.

### Functions (3)

```sql
-- tms_user_institution_id() — RLS helper, returns institution_id for current JWT user
-- tms_set_updated_at() — Trigger function for auto-updating updated_at
-- tms_notify_driver_location() — Trigger function for pg_notify on location update
```

### Indexes (34 total)

All defined inline with tables in TMS-SPEC Section 20. Key indexes:

| Table | Index | Purpose |
|-------|-------|---------|
| tms_users | `idx_tms_users_myjkkn_id` (UNIQUE) | JWT -> user lookup |
| tms_schedules | `idx_tms_schedules_route_date` | Today's schedules by route |
| tms_attendance | UNIQUE constraint | Deduplication |
| tms_driver_locations | `driver_id` (UNIQUE via table constraint) | One row per driver |
| tms_notification_outbox | `idx_tms_outbox_status` (partial) | Pending notifications only |

### RLS Policies

All tables have RLS enabled. Pattern:
- **Institution isolation**: Every table has `USING (institution_id = tms_user_institution_id())`
- **Student self-access**: Enrollments, bookings, grievances have additional `student_id IN (SELECT id FROM tms_users WHERE myjkkn_user_id = auth.uid())`
- **Driver self-access**: Driver locations have `driver_id IN (SELECT id FROM tms_drivers WHERE myjkkn_user_id = auth.uid())`

Full policy SQL is in TMS-SPEC Section 21.

---

## Appendix B: All TypeScript Type Interfaces

All types are defined in their respective module sections above. Summary of type files:

| File | Types |
|------|-------|
| `types/auth.ts` | TMSUser, AccessStatus, AccessCheckResult |
| `types/routes.ts` | Route, RouteStop, RouteWithStops, CreateRouteInput, UpdateRouteInput |
| `types/vehicles.ts` | Vehicle, CreateVehicleInput, UpdateVehicleInput |
| `types/drivers.ts` | Driver, DriverWithDetails, CreateDriverInput, UpdateDriverInput |
| `types/schedules.ts` | ScheduleTemplate, Schedule, ScheduleWithRelations, Holiday |
| `types/enrollments.ts` | Enrollment, EnrollmentWithRelations, CreateEnrollmentInput |
| `types/bookings.ts` | Booking, BookingWithRelations, CreateBookingInput, SeatAvailability |
| `types/attendance.ts` | AttendanceRecord, AttendanceWithStudent, AttendanceSummary |
| `types/grievances.ts` | Grievance, GrievanceComment, all status types |
| `types/notifications.ts` | NotificationOutbox |
| `types/tracking.ts` | DriverLocation, LocationUpdate |
| `types/b2a.ts` | B2A request/response types for all endpoints |

**File**: `src/types/auth.ts`

```typescript
export interface TMSUser {
  id: string;
  myjkkn_user_id: string;
  institution_id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  avatar_url: string | null;
  role: 'student' | 'driver' | 'staff' | 'admin';
  permissions: string[];
  billing_status: string;
  access_status: 'active' | 'grace' | 'expired' | 'none';
  grace_period_start: string | null;
  access_expires_at: string | null;
  last_synced_at: string;
  hard_cache_refreshed_at: string;
  created_at: string;
  updated_at: string;
}
```

**File**: `src/types/b2a.ts`

```typescript
// Verify Access
export interface B2AVerifyAccessResponse {
  user_id: string;
  institution_id: string;
  has_transport_bill: boolean;
  bill_status: 'paid' | 'unpaid' | 'overdue';
  bill_amount: number;
  paid_amount: number;
  enrollment_approved: boolean;
  access_decision: 'grant' | 'grace' | 'deny';
  grace_expires_at?: string;
  reason: string;
}

// Users Batch
export interface B2AUsersBatchRequest {
  user_ids: string[];
  fields: ('profile' | 'billing' | 'permissions')[];
}

export interface B2AUsersBatchResponse {
  users: Array<{
    user_id: string;
    full_name: string;
    email: string;
    phone: string | null;
    avatar_url: string | null;
    role: string;
    institution_id: string;
    billing_status?: string;
    permissions?: string[];
  }>;
  not_found: string[];
  fetched_at: string;
}

// Permissions
export interface B2APermissionsResponse {
  user_id: string;
  role: string;
  permissions: string[];
  custom_role_id: string | null;
  custom_role_name: string | null;
}

// Send Notification
export interface B2ASendNotificationRequest {
  user_ids: string[];
  title: string;
  message: string;
  category: string;
  priority?: 'low' | 'normal' | 'urgent';
  action_url?: string;
  metadata?: Record<string, unknown>;
}

export interface B2ASendNotificationResponse {
  sent_count: number;
  failed_count: number;
  notification_ids: string[];
}

// Payment Webhook
export interface PaymentWebhookPayload {
  event: 'payment.confirmed';
  bill_id: string;
  student_id: string;
  institution_id: string;
  amount_paid: number;
  payment_method: string;
  transaction_id: string;
  paid_at: string;
  semester: string;
}
```

---

## Appendix C: Testing Strategy

### Test Pyramid

```
        /  E2E  \        Playwright: 5 critical user flows
       /----------\
      / Integration \    Supabase + service layer: all CRUD + RLS
     /----------------\
    /    Unit Tests     \  HMAC, date utils, permission checks, status mappings
   /----------------------\
```

### E2E Tests (Playwright)

| # | Flow | Steps |
|---|------|-------|
| 1 | Student login + access gate | Navigate to TMS -> JWT check -> access gate -> dashboard |
| 2 | Admin creates route with stops | Login as admin -> Routes -> Create -> Add stops -> Verify on map |
| 3 | Student books ad-hoc trip | Login -> Schedule -> Book -> Confirm -> Verify seat count decreased |
| 4 | Driver shares location | Login as driver -> Toggle location -> Verify DB updated |
| 5 | QR scan attendance | Student opens QR -> Driver scans -> Attendance recorded |

### Integration Tests

| Module | Tests |
|--------|-------|
| Routes | CRUD, stop ordering, RLS isolation |
| Vehicles | CRUD, uniqueness, status transitions |
| Drivers | CRUD, vehicle assignment, user link |
| Schedules | Template CRUD, generation, holiday skip, idempotency |
| Enrollments | CRUD, seat assignment, uniqueness |
| Bookings | Create with capacity check, cancel |
| Attendance | QR scan, dedup, offline sync, manual fallback |
| Grievances | CRUD, status mapping, comments |
| Notifications | Queue, process, retry, max attempts |
| Access gate | Active/grace/expired/none states |
| Webhook | Valid signature, invalid signature, idempotent |

### Unit Tests

| Function | Tests |
|----------|-------|
| `generateQRHmac` | Deterministic output, different inputs = different HMAC |
| `verifyQRHmac` | Valid within 60s, rejected after, handles slot boundary |
| `isTokenExpiringSoon` | Buffer logic correct |
| `hasPermission` | Single and multi-permission checks |
| Admin status -> student status mapping | All 6 transitions correct |
| Exponential backoff calculation | Correct retry_after for attempts 1-5 |
| Seat availability calculation | Enrolled + adhoc counted correctly |

### RLS Tests

For every table, verify:
1. User from Institution A cannot read Institution B's data
2. Student can only read own enrollments/bookings/grievances
3. Driver can only update own location
4. Admin can read/write all data within their institution
5. Service role bypasses all RLS (for cron jobs)

### Test Environment Setup

```bash
# Use a separate Supabase project for testing, or use Supabase CLI local
npx supabase start   # Local Supabase instance
npx supabase db reset # Apply migrations

# Seed test data
npx supabase db seed  # Runs supabase/seed.sql
```

Seed data should include:
- 2 institutions
- 5 users per institution (1 admin, 1 staff, 1 driver, 2 students)
- 3 routes per institution with stops
- 2 vehicles per institution
- 1 driver per institution with vehicle assigned
- Schedule templates + generated schedules
- 1 enrollment per student
- Test attendance records

---

## Document History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-03-15 | Implementation Team | Initial build plan |

---

*This document is the build plan for TMS. For architecture decisions, refer to [TMS-SPEC.md](./TMS-SPEC.md). For MyJKKN integration tasks, refer to [TMS-MYJKKN-TASKS.md](./TMS-MYJKKN-TASKS.md). For existing system analysis, refer to [TMS-PRD-ANALYSIS.md](./TMS-PRD-ANALYSIS.md).*
