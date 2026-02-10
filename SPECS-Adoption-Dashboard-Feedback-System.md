# MyJKKN Adoption Dashboard & Feedback System — Developer Specification

**Version:** 1.0
**Date:** 2026-02-09
**Author:** Product (via Claude Code FST Analysis)
**For:** MyJKKN Developer
**Branch:** `omm-dev`
**Staging DB:** `hhprjbgknupaplivtoib`

---

## 1. Problem Statement

MyJKKN has **38 modules** but **zero visibility** into which ones are actually used, which are ignored, and what users think of them. There is no low-friction feedback channel — the only existing options (Bug Reporter, Grievance, NPS surveys) are all high-effort.

This spec defines three connected systems:

| System | Purpose |
|--------|---------|
| **Event Tracking** | Automatically records page visits, feature usage, and errors across all modules |
| **Feedback Widget** | Thumbs up/down on every page, anonymous by default, 2-second interaction |
| **Adoption Dashboard** | Two views — Builder (granular) + Leadership (summary) — showing what's working and what's not |

---

## 2. Architecture Decisions (Already Made)

| Decision | Choice | Reasoning |
|----------|--------|-----------|
| Storage | Same Supabase DB (staging `hhprjbgknupaplivtoib`) | Keep simple at current scale |
| Tracking method | Client-side hook + batched writes via `sendBeacon()` | Non-blocking, fire-and-forget |
| Feedback widget position | **Bottom-left** | Bug reporter already occupies bottom-right |
| Anonymous feedback | Default anonymous, optional identity | Indian institutional hierarchy — juniors won't publicly criticize systems endorsed by leadership |
| Dashboard access | `super_admin` + `admin` roles only | Builder view for architect, leadership view for management |
| Aggregation | SQL function + `pg_cron` nightly job | Efficient queries without scanning raw events |
| Raw event retention | 90 days | Aggregated daily summaries kept indefinitely |
| Chart library | **Recharts** (already in `package.json` v2.15.4) | Primary chart library in the project |
| UI components | shadcn/ui (`components/ui/*`) | Already used throughout the app |

---

## 3. Database Schema

### Migration File

**Create:** `supabase/migrations/[TIMESTAMP]_adoption_tracking_system.sql`

Use the project's naming convention: `YYYYMMDDhhmmss_adoption_tracking_system.sql`

### 3.1 Table: `adoption_events`

Raw event log. Every page visit, feature use, error, and workflow completion is a row here.

```sql
CREATE TABLE IF NOT EXISTS adoption_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    session_id TEXT NOT NULL,
    event_type TEXT NOT NULL CHECK (event_type IN ('page_view', 'feature_use', 'error', 'workflow_complete')),
    module TEXT NOT NULL,
    page_path TEXT NOT NULL,
    action TEXT,
    metadata JSONB DEFAULT '{}',
    institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_adoption_events_module_created ON adoption_events(module, created_at DESC);
CREATE INDEX idx_adoption_events_user_created ON adoption_events(user_id, created_at DESC);
CREATE INDEX idx_adoption_events_type_created ON adoption_events(event_type, created_at DESC);
CREATE INDEX idx_adoption_events_institution ON adoption_events(institution_id);
CREATE INDEX idx_adoption_events_created ON adoption_events(created_at DESC);

-- RLS
ALTER TABLE adoption_events ENABLE ROW LEVEL SECURITY;

-- All authenticated users can INSERT their own events
CREATE POLICY "adoption_events_insert_authenticated"
ON adoption_events FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Admins can SELECT events for their institution
CREATE POLICY "adoption_events_select_admin"
ON adoption_events FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM profiles p
        WHERE p.id = auth.uid()
        AND (
            p.is_super_admin = true
            OR (
                p.role IN ('admin', 'principal', 'hod')
                AND p.institution_id = adoption_events.institution_id
            )
        )
    )
);

-- Super admin can SELECT all
CREATE POLICY "adoption_events_select_super_admin"
ON adoption_events FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'
    )
);
```

### 3.2 Table: `adoption_feedback`

Thumbs up/down feedback entries. `user_id` is nullable to support anonymous feedback.

```sql
CREATE TABLE IF NOT EXISTS adoption_feedback (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    page_path TEXT NOT NULL,
    module TEXT NOT NULL,
    feedback_type TEXT NOT NULL CHECK (feedback_type IN ('positive', 'negative')),
    comment TEXT,
    contact_name TEXT,
    role TEXT,
    institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_adoption_feedback_module_type ON adoption_feedback(module, feedback_type, created_at DESC);
CREATE INDEX idx_adoption_feedback_institution ON adoption_feedback(institution_id);
CREATE INDEX idx_adoption_feedback_created ON adoption_feedback(created_at DESC);

-- RLS
ALTER TABLE adoption_feedback ENABLE ROW LEVEL SECURITY;

-- All authenticated users can INSERT feedback (including anonymous — user_id can be null)
CREATE POLICY "adoption_feedback_insert_authenticated"
ON adoption_feedback FOR INSERT
TO authenticated
WITH CHECK (true);

-- Admins can SELECT feedback for their institution
CREATE POLICY "adoption_feedback_select_admin"
ON adoption_feedback FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM profiles p
        WHERE p.id = auth.uid()
        AND (
            p.is_super_admin = true
            OR (
                p.role IN ('admin', 'principal', 'hod')
                AND p.institution_id = adoption_feedback.institution_id
            )
        )
    )
);

-- Super admin can SELECT all
CREATE POLICY "adoption_feedback_select_super_admin"
ON adoption_feedback FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'
    )
);
```

### 3.3 Table: `adoption_metrics_daily`

Pre-aggregated daily summaries per module. Populated nightly by `pg_cron`.

```sql
CREATE TABLE IF NOT EXISTS adoption_metrics_daily (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    date DATE NOT NULL,
    module TEXT NOT NULL,
    institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
    unique_users INTEGER DEFAULT 0,
    total_events INTEGER DEFAULT 0,
    page_views INTEGER DEFAULT 0,
    feature_uses INTEGER DEFAULT 0,
    errors INTEGER DEFAULT 0,
    positive_feedback INTEGER DEFAULT 0,
    negative_feedback INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Prevent duplicate aggregation
CREATE UNIQUE INDEX idx_adoption_metrics_daily_unique
ON adoption_metrics_daily(date, module, institution_id);

-- RLS
ALTER TABLE adoption_metrics_daily ENABLE ROW LEVEL SECURITY;

CREATE POLICY "adoption_metrics_daily_select_admin"
ON adoption_metrics_daily FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM profiles p
        WHERE p.id = auth.uid()
        AND (
            p.is_super_admin = true
            OR (
                p.role IN ('admin', 'principal', 'hod')
                AND p.institution_id = adoption_metrics_daily.institution_id
            )
        )
    )
);

-- System can INSERT (for cron job)
CREATE POLICY "adoption_metrics_daily_insert_system"
ON adoption_metrics_daily FOR INSERT
WITH CHECK (true);

-- System can UPDATE (for upsert during re-aggregation)
CREATE POLICY "adoption_metrics_daily_update_system"
ON adoption_metrics_daily FOR UPDATE
USING (true);
```

### 3.4 SQL Functions

```sql
-- Helper: Extract module name from URL path
CREATE OR REPLACE FUNCTION extract_module_from_path(page_path TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
    -- Remove leading slash, take first segment
    -- e.g., '/academic/attendance/123' → 'academic'
    -- e.g., '/dashboard' → 'dashboard'
    RETURN COALESCE(
        NULLIF(split_part(LTRIM(page_path, '/'), '/', 1), ''),
        'unknown'
    );
END;
$$;

-- Daily aggregation function
CREATE OR REPLACE FUNCTION compute_adoption_metrics_daily(target_date DATE DEFAULT CURRENT_DATE - INTERVAL '1 day')
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    INSERT INTO adoption_metrics_daily (date, module, institution_id, unique_users, total_events, page_views, feature_uses, errors, positive_feedback, negative_feedback)
    SELECT
        target_date,
        e.module,
        e.institution_id,
        COUNT(DISTINCT e.user_id) as unique_users,
        COUNT(*) as total_events,
        COUNT(*) FILTER (WHERE e.event_type = 'page_view') as page_views,
        COUNT(*) FILTER (WHERE e.event_type = 'feature_use') as feature_uses,
        COUNT(*) FILTER (WHERE e.event_type = 'error') as errors,
        COALESCE(f.positive_count, 0) as positive_feedback,
        COALESCE(f.negative_count, 0) as negative_feedback
    FROM adoption_events e
    LEFT JOIN LATERAL (
        SELECT
            COUNT(*) FILTER (WHERE feedback_type = 'positive') as positive_count,
            COUNT(*) FILTER (WHERE feedback_type = 'negative') as negative_count
        FROM adoption_feedback fb
        WHERE fb.module = e.module
          AND fb.institution_id = e.institution_id
          AND fb.created_at >= target_date
          AND fb.created_at < target_date + INTERVAL '1 day'
    ) f ON true
    WHERE e.created_at >= target_date
      AND e.created_at < target_date + INTERVAL '1 day'
    GROUP BY e.module, e.institution_id, f.positive_count, f.negative_count
    ON CONFLICT (date, module, institution_id)
    DO UPDATE SET
        unique_users = EXCLUDED.unique_users,
        total_events = EXCLUDED.total_events,
        page_views = EXCLUDED.page_views,
        feature_uses = EXCLUDED.feature_uses,
        errors = EXCLUDED.errors,
        positive_feedback = EXCLUDED.positive_feedback,
        negative_feedback = EXCLUDED.negative_feedback;
END;
$$;

-- Module health scores function
CREATE OR REPLACE FUNCTION get_module_health_scores(p_institution_id UUID)
RETURNS TABLE (
    module TEXT,
    status TEXT,
    dau INTEGER,
    wau INTEGER,
    mau INTEGER,
    trend TEXT,
    error_count INTEGER,
    feedback_score NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    WITH
    daily_stats AS (
        SELECT
            m.module,
            m.unique_users,
            m.total_events,
            m.errors,
            m.positive_feedback,
            m.negative_feedback,
            m.date
        FROM adoption_metrics_daily m
        WHERE m.institution_id = p_institution_id
          AND m.date >= CURRENT_DATE - INTERVAL '30 days'
    ),
    module_summary AS (
        SELECT
            ds.module,
            -- DAU: average unique users last 7 days
            COALESCE(AVG(ds.unique_users) FILTER (WHERE ds.date >= CURRENT_DATE - INTERVAL '7 days'), 0)::INTEGER as dau,
            -- WAU: unique users last 7 days (sum, not avg)
            COALESCE(SUM(ds.unique_users) FILTER (WHERE ds.date >= CURRENT_DATE - INTERVAL '7 days'), 0)::INTEGER as wau,
            -- MAU: unique users last 30 days
            COALESCE(SUM(ds.unique_users), 0)::INTEGER as mau,
            -- Peak: max daily users in last 30 days
            COALESCE(MAX(ds.unique_users), 0)::INTEGER as peak_users,
            -- Recent avg (last 7 days)
            COALESCE(AVG(ds.unique_users) FILTER (WHERE ds.date >= CURRENT_DATE - INTERVAL '7 days'), 0) as recent_avg,
            -- Previous avg (8-14 days ago)
            COALESCE(AVG(ds.unique_users) FILTER (WHERE ds.date >= CURRENT_DATE - INTERVAL '14 days' AND ds.date < CURRENT_DATE - INTERVAL '7 days'), 0) as prev_avg,
            -- Errors last 7 days
            COALESCE(SUM(ds.errors) FILTER (WHERE ds.date >= CURRENT_DATE - INTERVAL '7 days'), 0)::INTEGER as error_count,
            -- Feedback score: (positive - negative) / total, last 30 days
            CASE
                WHEN SUM(ds.positive_feedback + ds.negative_feedback) > 0
                THEN ROUND((SUM(ds.positive_feedback)::NUMERIC / SUM(ds.positive_feedback + ds.negative_feedback)) * 100, 1)
                ELSE NULL
            END as feedback_score
        FROM daily_stats ds
        GROUP BY ds.module
    )
    SELECT
        ms.module,
        -- Health status based on usage relative to peak
        CASE
            WHEN ms.peak_users = 0 THEN 'red'
            WHEN ms.recent_avg >= ms.peak_users * 0.5 THEN 'green'
            WHEN ms.recent_avg >= ms.peak_users * 0.25 THEN 'yellow'
            ELSE 'red'
        END as status,
        ms.dau,
        ms.wau,
        ms.mau,
        -- Trend arrow
        CASE
            WHEN ms.prev_avg = 0 AND ms.recent_avg > 0 THEN 'up'
            WHEN ms.prev_avg = 0 THEN 'flat'
            WHEN ms.recent_avg > ms.prev_avg * 1.1 THEN 'up'
            WHEN ms.recent_avg < ms.prev_avg * 0.9 THEN 'down'
            ELSE 'flat'
        END as trend,
        ms.error_count,
        ms.feedback_score
    FROM module_summary ms
    ORDER BY ms.mau DESC;
END;
$$;

-- Leadership summary function
CREATE OR REPLACE FUNCTION get_adoption_summary(p_institution_id UUID, p_days INTEGER DEFAULT 30)
RETURNS TABLE (
    total_page_views BIGINT,
    total_unique_users BIGINT,
    total_modules_active INTEGER,
    most_used_module TEXT,
    least_used_module TEXT,
    overall_feedback_score NUMERIC,
    total_errors BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT
        COALESCE(SUM(m.page_views), 0)::BIGINT as total_page_views,
        COALESCE(SUM(m.unique_users), 0)::BIGINT as total_unique_users,
        COUNT(DISTINCT m.module)::INTEGER as total_modules_active,
        (SELECT m2.module FROM adoption_metrics_daily m2
         WHERE m2.institution_id = p_institution_id
           AND m2.date >= CURRENT_DATE - (p_days || ' days')::INTERVAL
         GROUP BY m2.module ORDER BY SUM(m2.total_events) DESC LIMIT 1
        ) as most_used_module,
        (SELECT m2.module FROM adoption_metrics_daily m2
         WHERE m2.institution_id = p_institution_id
           AND m2.date >= CURRENT_DATE - (p_days || ' days')::INTERVAL
         GROUP BY m2.module ORDER BY SUM(m2.total_events) ASC LIMIT 1
        ) as least_used_module,
        CASE
            WHEN SUM(m.positive_feedback + m.negative_feedback) > 0
            THEN ROUND((SUM(m.positive_feedback)::NUMERIC / SUM(m.positive_feedback + m.negative_feedback)) * 100, 1)
            ELSE NULL
        END as overall_feedback_score,
        COALESCE(SUM(m.errors), 0)::BIGINT as total_errors
    FROM adoption_metrics_daily m
    WHERE m.institution_id = p_institution_id
      AND m.date >= CURRENT_DATE - (p_days || ' days')::INTERVAL;
END;
$$;

-- Cleanup: purge raw events older than 90 days
CREATE OR REPLACE FUNCTION cleanup_old_adoption_events()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    DELETE FROM adoption_events
    WHERE created_at < NOW() - INTERVAL '90 days';
END;
$$;
```

### 3.5 Cron Jobs

**Create separate migration:** `[TIMESTAMP]_adoption_cron_jobs.sql`

```sql
-- Nightly aggregation at 1:00 AM
SELECT cron.schedule(
    'compute-adoption-daily-metrics',
    '0 1 * * *',
    $$SELECT compute_adoption_metrics_daily(CURRENT_DATE - INTERVAL '1 day');$$
);

-- Cleanup raw events at 3:00 AM (runs daily, deletes events >90 days old)
SELECT cron.schedule(
    'cleanup-old-adoption-events',
    '0 3 * * *',
    $$SELECT cleanup_old_adoption_events();$$
);
```

> **Note:** `pg_cron` is already enabled in this project. See existing jobs in `supabase/migrations/20260119000004_create_engagement_jobs.sql` for reference.

### 3.6 After Migration

```bash
# Push migration to staging
~/bin/supabase db push --project-ref hhprjbgknupaplivtoib

# Regenerate TypeScript types
~/bin/supabase gen types typescript --project-id hhprjbgknupaplivtoib > types/supabase.ts
```

---

## 4. Module Extractor Utility

**Create:** `lib/utils/module-extractor.ts`

Pure function (no React, no side effects). Maps URL paths to human-readable module names.

```typescript
/**
 * Maps a URL pathname to a module name.
 * Used by the adoption tracker and feedback widget.
 *
 * Must be kept in sync with app/(routes)/ directory structure.
 */

const MODULE_MAP: Record<string, string> = {
  'academic': 'Academic',
  'admin': 'Admin',
  'admission': 'Admission CRM',
  'ai-query': 'AI Query',
  'alumni': 'Alumni',
  'application-hub': 'Application Hub',
  'applications': 'Applications',
  'audit-trail': 'Audit Trail',
  'billing': 'Billing',
  'bug-leaderboard': 'Bug Leaderboard',
  'competency-catalog': 'Competency Catalog',
  'consultant-portal': 'Consultant Portal',
  'dashboard': 'Dashboard',
  'facilitator-development': 'Facilitator Development',
  'grievance': 'Grievance',
  'industry': 'Industry',
  'learners': 'Learners',
  'learning-paths': 'Learning Paths',
  'maturity-assessment': 'Maturity Assessment',
  'okr': 'OKR',
  'parent-portal': 'Parent Portal',
  'portal': 'Portal',
  'process-excellence': 'Process Excellence',
  'resource-management': 'Resource Management',
  'solutions': 'Solutions',
  'staff': 'Staff',
  'stakeholder-nps': 'Stakeholder NPS',
  'system': 'System',
  'talent': 'Talent',
  'vac': 'VAC',
  'adoption-insights': 'Adoption Insights',
};

export function extractModuleFromPath(pathname: string): string {
  const segment = pathname.replace(/^\//, '').split('/')[0];
  return MODULE_MAP[segment] || segment || 'unknown';
}

export function extractModuleKey(pathname: string): string {
  const segment = pathname.replace(/^\//, '').split('/')[0];
  return segment || 'unknown';
}

export { MODULE_MAP };
```

---

## 5. Event Tracking Hook

**Create:** `hooks/use-adoption-tracker.ts`

This hook automatically tracks page views and provides functions for explicit event tracking.

### Behavior

| Trigger | Event Type | Automatic? |
|---------|------------|------------|
| Pathname changes | `page_view` | Yes — fires on every route change |
| Developer calls `trackAction()` | `feature_use` | No — explicit |
| Developer calls `trackError()` | `error` | No — explicit |
| Developer calls `trackWorkflow()` | `workflow_complete` | No — explicit |

### Implementation Notes

- **Batching:** Accumulate events in a `useRef` array. Flush every 30 seconds OR when `document.visibilityState` changes to `'hidden'` (tab close/navigate away).
- **Flush method:** Use `navigator.sendBeacon('/api/adoption/events', blob)` for fire-and-forget delivery. Falls back to `fetch()` if `sendBeacon` is unavailable.
- **Session ID:** Generate a random `crypto.randomUUID()` on mount. This groups all events from a single browser session.
- **Auth context:** Use `useAuth()` from `hooks/use-auth-provider.tsx` to get `profile.id`, `profile.role`, `profile.institution_id`.
- **Module derivation:** Use `extractModuleKey()` from `lib/utils/module-extractor.ts`.
- **Pathname tracking:** Use `usePathname()` from `next/navigation`.

### Exported Interface

```typescript
interface AdoptionTracker {
  trackAction: (action: string, metadata?: Record<string, any>) => void;
  trackError: (error: string, context?: Record<string, any>) => void;
  trackWorkflow: (workflow: string, metadata?: Record<string, any>) => void;
}
```

### Provider Component

**Create:** `components/adoption/adoption-tracker-provider.tsx`

Wraps children, initializes the tracking hook, and provides the tracker via React Context so any component can call `trackAction()` etc.

```typescript
// Usage in layout:
<AdoptionTrackerProvider>
  {children}
</AdoptionTrackerProvider>

// Usage in any component:
const { trackAction } = useAdoptionTracker();
trackAction('generated_report', { reportType: 'attendance' });
```

### Existing Pattern to Follow

See `lib/services/analytics/session-tracking-service.ts` for the session ID generation pattern and the `modules_accessed` tracking approach. The adoption tracker is similar but captures granular events instead of session-level summaries.

---

## 6. Feedback Widget

**Create:** `components/adoption/feedback-widget.tsx`

### Visual Design

```
┌──────────────────────────────────────────────────────────────────┐
│                                                                  │
│  [App content fills page]                                        │
│                                                                  │
│                                                                  │
│                                                                  │
│                                                                  │
│                                                                  │
│  ┌──────────┐                                    ┌──────────┐   │
│  │ 💬       │  ← Feedback widget (bottom-left)   │ 🐛       │   │
│  │ Feedback │                                    │ Bug      │   │
│  └──────────┘                                    └──────────┘   │
│  z-60                                            z-60 (existing) │
└──────────────────────────────────────────────────────────────────┘
```

### States

**Collapsed (default):**
- Small floating button, bottom-left
- Icon: `MessageSquare` from lucide-react
- Tooltip: "Share feedback"
- Desktop: `fixed bottom-4 left-4 z-[60]`
- Mobile: `fixed bottom-24 left-2 z-[60]` (above bottom navbar)

**Expanded (on click):**
- Popover (NOT modal) anchored to the button
- Width: ~280px
- Content flow:
  1. Show page context: "Feedback for: [current page name]"
  2. Two large buttons side by side: 👍 "Good" / 👎 "Not Good"
  3. After clicking a thumb → slide-in: "Tell us more (optional)" text input
  4. After clicking a thumb → slide-in: "Your name (optional)" text input
  5. "Send" button
  6. On submit → brief "Thanks!" message → auto-close after 1.5s

**Post-submit:**
- Sonner toast: "Thanks for your feedback!"
- Widget returns to collapsed state

### Data Captured on Submit

```typescript
{
  page_path: string;        // from usePathname()
  module: string;           // from extractModuleKey(pathname)
  feedback_type: 'positive' | 'negative';
  comment?: string;         // optional text
  contact_name?: string;    // optional identity
  role?: string;            // from useAuth().profile.role
  institution_id: string;   // from useAuth().profile.institution_id
  user_id?: string;         // include auth.uid() for tracking, but UI says "anonymous"
  metadata: {
    user_agent: string;
    timestamp: string;
  }
}
```

### Mobile Detection

Reuse the pattern from the bug reporter widget:

```typescript
function isMobileDevice(): boolean {
  if (typeof window === 'undefined') return false;
  return window.innerWidth < 768;
}
```

### Existing Pattern to Follow

Model after `components/bug-reporter/bug-reporter-widget.tsx`:
- Same fixed positioning pattern with z-index 60
- Same mobile/desktop responsive positioning
- Same auth context via `useAuth()`
- Same toast pattern (use Sonner — `import { toast } from 'sonner'`)

---

## 7. API Routes

### 7.1 POST `/api/adoption/events`

**Create:** `app/api/adoption/events/route.ts`

Receives batched events from `navigator.sendBeacon()`.

```typescript
// Zod schema
const eventSchema = z.object({
  session_id: z.string(),
  event_type: z.enum(['page_view', 'feature_use', 'error', 'workflow_complete']),
  module: z.string(),
  page_path: z.string(),
  action: z.string().optional(),
  metadata: z.record(z.any()).optional(),
});

const batchSchema = z.object({
  events: z.array(eventSchema).max(100),
  institution_id: z.string().uuid(),
  user_id: z.string().uuid().optional(),
});
```

**Logic:**
1. Parse request body (may be `text/plain` from sendBeacon — parse JSON from string)
2. Auth check: `supabase.auth.getUser()`
3. Validate with zod
4. Bulk insert: `supabase.from('adoption_events').insert(events)`
5. Return `{ success: true }` (200) or error

**Auth pattern:** Follow `app/api/bug-reports/route.ts` — use `createServerSupabaseClient()` from `lib/supabase/server.ts`.

### 7.2 POST `/api/adoption/feedback`

**Create:** `app/api/adoption/feedback/route.ts`

Receives a single feedback entry.

```typescript
const feedbackSchema = z.object({
  page_path: z.string(),
  module: z.string(),
  feedback_type: z.enum(['positive', 'negative']),
  comment: z.string().max(500).optional(),
  contact_name: z.string().max(100).optional(),
  institution_id: z.string().uuid(),
  user_id: z.string().uuid().optional(),
  role: z.string().optional(),
  metadata: z.record(z.any()).optional(),
});
```

**Logic:**
1. Auth check
2. Validate
3. Insert into `adoption_feedback`
4. Return `{ success: true, id: inserted.id }`

### 7.3 GET `/api/adoption/metrics`

**Create:** `app/api/adoption/metrics/route.ts`

Dashboard data endpoint.

**Query params:**

| Param | Type | Required | Default | Values |
|-------|------|----------|---------|--------|
| `view` | string | no | `leadership` | `builder` or `leadership` |
| `days` | number | no | `30` | `7`, `30`, `90` |
| `institution_id` | uuid | yes | — | — |

**Logic:**
1. Auth check — must be `admin` or `super_admin`
2. If `view=leadership`: Call `get_adoption_summary(institution_id, days)` via `supabase.rpc()`
3. If `view=builder`: Call `get_module_health_scores(institution_id)` via `supabase.rpc()`
4. Also fetch recent daily metrics from `adoption_metrics_daily` for charts
5. Return structured response

**Role check pattern:**
```typescript
const { data: profile } = await supabase
  .from('profiles')
  .select('role, is_super_admin')
  .eq('id', user.id)
  .single();

if (!profile?.is_super_admin && !['admin', 'super_admin'].includes(profile?.role)) {
  return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
}
```

### 7.4 GET `/api/adoption/feedback-trends`

**Create:** `app/api/adoption/feedback-trends/route.ts`

Returns feedback aggregated by module.

**Query params:** `days` (default 30), `institution_id` (required)

**Logic:**
1. Auth check — admin/super_admin only
2. Query `adoption_feedback` grouped by module:
   ```sql
   SELECT module,
          COUNT(*) FILTER (WHERE feedback_type = 'positive') as positive,
          COUNT(*) FILTER (WHERE feedback_type = 'negative') as negative,
          COUNT(*) as total
   FROM adoption_feedback
   WHERE institution_id = $1 AND created_at >= NOW() - ($2 || ' days')::INTERVAL
   GROUP BY module
   ORDER BY total DESC
   ```
3. Also fetch recent negative feedback with comments (for Builder view):
   ```sql
   SELECT module, comment, contact_name, created_at, page_path
   FROM adoption_feedback
   WHERE institution_id = $1 AND feedback_type = 'negative' AND comment IS NOT NULL
   ORDER BY created_at DESC LIMIT 50
   ```

---

## 8. React Query Hooks

### 8.1 Query Keys

**Modify:** `lib/query/query-keys.ts`

Add to the existing `queryKeys` object:

```typescript
adoption: {
  all: ['adoption'] as const,
  metrics: (view: string, days: number, institutionId: string) =>
    [...queryKeys.adoption.all, 'metrics', view, days, institutionId] as const,
  health: (institutionId: string) =>
    [...queryKeys.adoption.all, 'health', institutionId] as const,
  feedbackTrends: (days: number, institutionId: string) =>
    [...queryKeys.adoption.all, 'feedback-trends', days, institutionId] as const,
  feedbackStream: (institutionId: string) =>
    [...queryKeys.adoption.all, 'feedback-stream', institutionId] as const,
},
```

### 8.2 Hooks File

**Create:** `hooks/use-adoption-metrics.ts`

Follow the pattern in `hooks/admission/use-ai-insights.ts`:

```typescript
// useAdoptionMetrics(view, days, institutionId) — fetches dashboard data
// useModuleHealth(institutionId) — fetches module health scores
// useFeedbackTrends(days, institutionId) — fetches feedback aggregation
// useSubmitFeedback() — mutation for feedback submission

// All hooks should:
// - Use queryKeys.adoption.* for cache keys
// - Return { data, isLoading, error, refetch }
// - Have enabled: !!institutionId guard
// - Use 5-minute refetchInterval for dashboard data
```

---

## 9. Adoption Dashboard Page

**Create:** `app/(routes)/adoption-insights/page.tsx`

Single page with two tabs. Default tab depends on role:
- `super_admin` → defaults to Builder View
- `admin` / others → defaults to Leadership View

### 9.1 Leadership View (Tab 1)

| Section | Component | Data Source |
|---------|-----------|-------------|
| **Value Metrics** | 4x `Card` components in a grid | `get_adoption_summary()` via `/api/adoption/metrics?view=leadership` |
| **Module Health Grid** | Grid of cards with color-coded status (green/yellow/red badge + DAU number) | `get_module_health_scores()` via `/api/adoption/metrics?view=builder` |
| **Department Comparison** | Horizontal `BarChart` (Recharts) | Aggregated from `adoption_metrics_daily` |
| **Time Range Selector** | Button group: 7d / 30d / 90d | Controls `days` query param |

**Value Metric Cards:**

| Card | Value | Icon |
|------|-------|------|
| Total Page Views | `total_page_views` | `Eye` |
| Unique Users | `total_unique_users` | `Users` |
| Most Used Module | `most_used_module` | `TrendingUp` |
| Feedback Score | `overall_feedback_score`% | `ThumbsUp` |

**Module Health Colors:**
- Green badge: >50% of 30-day peak usage maintained
- Yellow badge: 25-50% of peak
- Red badge: <25% of peak OR zero usage in 7 days

### 9.2 Builder View (Tab 2)

| Section | Component | Data Source |
|---------|-----------|-------------|
| **Module Usage Table** | Sortable `Table` | `get_module_health_scores()` |
| **Error Trends** | `LineChart` (Recharts) | `adoption_metrics_daily` filtered by errors |
| **Feedback Stream** | Scrollable list of recent thumbs-down with comments | `/api/adoption/feedback-trends` |
| **Silent Failures** | Alert cards for modules with errors but no bug reports | Cross-query `adoption_events` errors vs `bug_reports` |
| **Time Range Selector** | Button group: 7d / 30d / 90d | Controls `days` query param |

**Module Usage Table Columns:**

| Column | Source | Sortable? |
|--------|--------|-----------|
| Module | `module` | Yes |
| DAU | `dau` | Yes |
| WAU | `wau` | Yes |
| MAU | `mau` | Yes |
| Trend | `trend` (↑ / ↓ / →) | No |
| Errors (7d) | `error_count` | Yes |
| Feedback Score | `feedback_score`% | Yes |
| Health | `status` (green/yellow/red dot) | Yes |

### 9.3 Chart Components to Follow

Existing chart pattern: `components/analytics/charts/login-trend-chart.tsx`

Uses Recharts with:
- `ResponsiveContainer` wrapper (100% width, configurable height)
- `LineChart` / `BarChart` with custom tooltips
- Tailwind colors for chart elements
- Empty state: centered "No data available" text

### 9.4 UI Components Available (shadcn/ui)

All of these are already installed — import from `@/components/ui/`:
- `Card, CardContent, CardDescription, CardHeader, CardTitle`
- `Tabs, TabsContent, TabsList, TabsTrigger`
- `Table, TableBody, TableCell, TableHead, TableHeader, TableRow`
- `Badge`
- `Button`
- `Popover, PopoverContent, PopoverTrigger`
- `Tooltip, TooltipContent, TooltipProvider, TooltipTrigger`
- `Textarea`
- `Input`
- `Select, SelectContent, SelectItem, SelectTrigger, SelectValue`

---

## 10. Layout Integration

### 10.1 Layout File

**Modify:** `app/(routes)/layout.tsx`

Current state (line 37): `<BugReporterWidget />`

Add the adoption tracker provider and feedback widget:

```tsx
import { AdoptionTrackerProvider } from '@/components/adoption/adoption-tracker-provider';
import { AdoptionFeedbackWidget } from '@/components/adoption/feedback-widget';

// In the JSX:
<AdminPanelLayout>
  <QueryClientProvider>
    <AdoptionTrackerProvider>
      {children}
      <Toaster />
      <HotToaster ... />
      <SonnerToaster ... />
      <BugReporterWidget />
      <AdoptionFeedbackWidget />
    </AdoptionTrackerProvider>
  </QueryClientProvider>
</AdminPanelLayout>
```

### 10.2 Sidebar Menu

**Modify:** `lib/sidebarMenuLink.ts`

**Step 1:** Add import at top (around line 50):

```typescript
import { Activity } from 'lucide-react'; // or TrendingUp, BarChart3
```

**Step 2:** Add to `MENU_PERMISSIONS` object:

```typescript
'/adoption-insights': 'adoption.insights.view',
```

**Step 3:** Add menu item to the **System** group (after Bug Leaderboard, around line 2280):

```typescript
{
  href: '/adoption-insights',
  label: 'Adoption Insights',
  active: pathname.startsWith('/adoption-insights'),
  icon: Activity,
  submenus: []
},
```

**Step 4:** In `GetRoleBasedPages()`, ensure `adoption.insights.view` permission is granted to `super_admin` and `admin` roles. Check how existing permissions are resolved — if using custom roles system, add the permission to the default admin role.

---

## 11. Files Summary

### New Files (13)

| # | File Path | Purpose |
|---|-----------|---------|
| 1 | `supabase/migrations/[TS]_adoption_tracking_system.sql` | 3 tables + 5 functions + RLS + indexes |
| 2 | `supabase/migrations/[TS]_adoption_cron_jobs.sql` | pg_cron scheduling |
| 3 | `lib/utils/module-extractor.ts` | URL → module name mapping |
| 4 | `hooks/use-adoption-tracker.ts` | Client-side event tracking hook |
| 5 | `components/adoption/adoption-tracker-provider.tsx` | React Context provider for tracker |
| 6 | `components/adoption/feedback-widget.tsx` | Thumbs up/down floating widget |
| 7 | `app/api/adoption/events/route.ts` | Batched event ingestion endpoint |
| 8 | `app/api/adoption/feedback/route.ts` | Feedback submission endpoint |
| 9 | `app/api/adoption/metrics/route.ts` | Dashboard metrics endpoint |
| 10 | `app/api/adoption/feedback-trends/route.ts` | Feedback trends endpoint |
| 11 | `hooks/use-adoption-metrics.ts` | React Query hooks for dashboard |
| 12 | `app/(routes)/adoption-insights/page.tsx` | Dashboard page (2 tabbed views) |
| 13 | `types/adoption.ts` | TypeScript interfaces (optional — can use generated types) |

### Modified Files (2)

| # | File Path | Change |
|---|-----------|--------|
| 1 | `app/(routes)/layout.tsx` | Add `AdoptionTrackerProvider` + `AdoptionFeedbackWidget` |
| 2 | `lib/sidebarMenuLink.ts` | Add "Adoption Insights" menu item + permission |

### Modified After Migration (1)

| # | File Path | Change |
|---|-----------|--------|
| 1 | `types/supabase.ts` | Regenerated via CLI (auto — don't hand-edit) |

### Existing Files to Reference (Don't Modify)

| File | Why Reference It |
|------|------------------|
| `components/bug-reporter/bug-reporter-widget.tsx` | Widget positioning, state management, mobile detection pattern |
| `hooks/use-auth-provider.tsx` | `useAuth()` hook — returns `{ profile, isLoading, error }` |
| `types/auth.ts` | `Profile` interface — has `id`, `role`, `institution_id`, `department_id`, `is_super_admin` |
| `lib/supabase/server.ts` | `createServerSupabaseClient()` for API routes |
| `lib/supabase/client.ts` | `createClientSupabaseClient()` for client components |
| `lib/query/query-keys.ts` | Query key structure pattern |
| `hooks/admission/use-ai-insights.ts` | React Query hook pattern |
| `app/api/bug-reports/route.ts` | API route pattern (zod + auth + Supabase) |
| `components/analytics/charts/login-trend-chart.tsx` | Recharts chart pattern |
| `components/ui/chart.tsx` | shadcn chart container component |
| `lib/services/analytics/session-tracking-service.ts` | Session ID and module tracking pattern |
| `supabase/migrations/20260119000002_create_engagement_analytics_schema.sql` | RLS policy pattern, index pattern |
| `supabase/migrations/20260119000004_create_engagement_jobs.sql` | pg_cron job pattern |

---

## 12. Implementation Order

Build in this exact order — each step depends on the previous:

| Step | What | Depends On | Verify By |
|------|------|------------|-----------|
| 1 | **Migration** — create tables, functions, RLS, indexes | Nothing | `supabase db push` succeeds; tables visible in Supabase dashboard |
| 2 | **Regenerate types** | Step 1 | `types/supabase.ts` contains `adoption_events`, `adoption_feedback`, `adoption_metrics_daily` |
| 3 | **Module extractor** | Nothing | Unit-testable pure function |
| 4 | **API routes** (all 4) | Steps 1-2 | `curl` each endpoint; events insert, feedback inserts, metrics return data |
| 5 | **Event tracking hook + provider** | Steps 3-4 | Navigate between pages; check `adoption_events` table has rows |
| 6 | **Feedback widget** | Step 4 | Click thumbs up/down; check `adoption_feedback` table has rows |
| 7 | **React Query hooks** | Step 4 | Import in test component; verify data fetching |
| 8 | **Dashboard page** | Steps 2, 7 | Open `/adoption-insights`; both tabs render; charts show data |
| 9 | **Layout integration** | Steps 5-6 | Widget appears on every page; events tracked on navigation |
| 10 | **Sidebar menu** | Step 8 | "Adoption Insights" visible in sidebar for admin/super_admin |
| 11 | **Cron migration** | Step 1 | Verify in Supabase: `SELECT * FROM cron.job WHERE jobname LIKE 'adoption%'` |
| 12 | **Build test** | All | `npm run build` passes with zero new errors |

---

## 13. Testing Checklist

### Database
- [ ] All 3 tables created in staging
- [ ] RLS policies work: authenticated user can INSERT events; only admin can SELECT
- [ ] `get_module_health_scores()` returns data when events exist
- [ ] `get_adoption_summary()` returns aggregated stats
- [ ] `compute_adoption_metrics_daily()` populates `adoption_metrics_daily`

### Event Tracking
- [ ] Navigate between pages → rows appear in `adoption_events`
- [ ] Events are batched (not one request per page view)
- [ ] Closing tab / switching away flushes pending events
- [ ] Session ID is consistent within a browser session

### Feedback Widget
- [ ] Widget appears bottom-left on desktop
- [ ] Widget appears above bottom navbar on mobile
- [ ] Clicking 👍 submits positive feedback
- [ ] Clicking 👎 shows optional comment field
- [ ] Submitting shows "Thanks!" toast
- [ ] Row appears in `adoption_feedback` with correct module and page_path
- [ ] Anonymous: `user_id` is null when identity not provided (or populated from auth silently — decide)
- [ ] Does NOT overlap with Bug Reporter widget (bottom-right)

### Dashboard
- [ ] `/adoption-insights` loads for super_admin
- [ ] `/adoption-insights` loads for admin
- [ ] `/adoption-insights` returns 403 for student/faculty roles
- [ ] Leadership tab shows module health grid with colors
- [ ] Builder tab shows sortable module table
- [ ] Time range selector (7d/30d/90d) changes data
- [ ] Charts render with real data
- [ ] Empty state renders gracefully when no data exists

### Build
- [ ] `npm run build` passes
- [ ] No new TypeScript errors introduced
- [ ] No console errors in browser

---

## 14. Scope Boundaries

### In Scope (This Spec)

- Event tracking (page views, feature uses, errors)
- Feedback widget (thumbs up/down + optional comment + optional identity)
- Adoption dashboard with two views (builder + leadership)
- Daily aggregation function + cron
- 90-day raw event retention + cleanup

### Out of Scope (Future Iterations)

| Feature | Why Deferred |
|---------|--------------|
| Session replay / breadcrumb trails | Needs per-action instrumentation in each module |
| Real-time WebSocket updates on dashboard | Polling every 5 min is sufficient for now |
| Email/notification alerts for adoption drops | Build after baseline data exists (30+ days) |
| A/B testing framework | Not needed until feature variants exist |
| User segmentation beyond role/department | Current granularity is sufficient |
| Feature discovery tracking (first-time vs returning) | Requires stateful tracking per user per feature |
| Workflow completion funnels | Requires per-module instrumentation of start/complete events |
| "We heard you" feedback loop to users | Phase 2 — after feedback data proves valuable |

---

## 15. Key Design Rationale

**Why anonymous feedback?** In Indian educational institutions, hierarchy is strong. A junior faculty member won't publicly criticize a system the Dean championed. Anonymous-by-default removes the power dynamic. Optional identity lets engaged users self-identify for follow-up.

**Why measure actions, not logins?** If a department HOD sees low usage, they might mandate daily logins. Logins go up, actual value stays flat. Measuring meaningful actions (generated a report, submitted attendance, completed a workflow) prevents metric gaming.

**Why 90-day retention on raw events?** 38 modules × 100+ users × dozens of actions/day = thousands of events daily. Over months, this becomes millions of rows. Aggregated daily summaries are kept forever. Raw events are purged after 90 days to keep the DB healthy.

**Why bottom-left for the widget?** The Bug Reporter widget already occupies the bottom-right corner. Placing the feedback widget on the opposite side avoids visual clutter and collision.

---

*End of specification. All code patterns reference existing MyJKKN codebase conventions. Developer should read the referenced files before implementing.*
