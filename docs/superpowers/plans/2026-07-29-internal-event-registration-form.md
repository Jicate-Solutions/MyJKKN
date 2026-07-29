# Internal Event Registration Form Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let any logged-in JKKN user register for a general (non-tournament) event through a link the organizer shares, and let the organizer build that form and read the answers.

**Architecture:** Purely additive. Three new pages under `app/(routes)/events/[id]/`, one new API route, one shared access hook, one pure helper, one partial unique index. Every tournament route is left untouched, so the 43 tests shipped in commit `691e116f4` cannot regress. All the heavy lifting is done by components that already exist and are already event-type agnostic — `RegistrationFormEditor`, `DynamicFieldInput`, `EventLogistics`, `EventRegistrationsService`.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, Supabase (Postgres + RLS), TanStack Query, Shadcn UI, Tailwind, Vitest + Testing Library, react-hot-toast.

**Spec:** `docs/superpowers/specs/2026-07-29-internal-event-registration-form-design.md`

## Global Constraints

- **Test runner is Vitest, not Jest.** Component test files start with `// @vitest-environment jsdom` then `import '@testing-library/jest-dom';`. Import `{ describe, it, expect, vi, beforeEach, afterEach }` from `'vitest'`.
- **Run a single test file with:** `npx vitest run <path>`
- **Never write `bib_number` from this feature.** The column has a *global* `UNIQUE` constraint.
- **Write answers to `custom_fields`, never `custom_data`.** `EventRegistrationsService` maps `custom_fields` to labels; `custom_data` is a different column used for t-shirt size and blood group.
- **The department column is `departments.department_name`, NOT `departments.name`.** A wrong name returns PostgREST 42703, which this codebase swallows as a `console.warn` and degrades to a blank value instead of failing.
- `participant_type` vocabulary is `'internal' | 'external'`. This feature always writes `'internal'`.
- `source` for this feature is always `'event_self'` (parallel to the existing `'tournament_self'`).
- `createClient()` from `@/lib/supabase/server` is **async** — always `await` it. `createServiceRoleClient()` is **sync**.
- Route handlers receive `{ params }: { params: Promise<{ ... }> }` — params must be awaited.
- Loading states render a skeleton. **Never `return null` while loading** (CLS lesson #2213, cited in `general-events-section.tsx`).
- Commit after every task. Do not batch commits.

---

## File Structure

| File | Responsibility |
|---|---|
| `supabase/migrations/20260808090000_events_registrations_one_self_per_profile.sql` | One partial unique index |
| `hooks/events/use-event-access.ts` | `canManage`/`canView` for a general event; single source of truth for the gate |
| `hooks/events/use-general-events.ts` *(modify)* | add `useGeneralEvent(id)` — single event by id |
| `hooks/events/use-my-event-registration.ts` | The current user's own registration for one event |
| `lib/services/events/shared/event-registration-window.ts` | Pure open/closed decision. No Supabase, no DOM |
| `app/(routes)/events/[id]/page.tsx` | Organizer detail page: header, share link, form card, logistics |
| `app/(routes)/events/[id]/registration-form/page.tsx` | Builder shell around `RegistrationFormEditor` |
| `app/(routes)/events/[id]/register/page.tsx` | Registrant form |
| `app/api/events/[eventId]/register/route.ts` | POST — validate then service-role insert |
| `components/events/shared/registration-form-card.tsx` *(moved)* | was route-local under `tournament/[id]/_components/`; gains an `href` prop |
| `components/events/shared/registration-form/registration-form-editor.tsx` *(moved)* | was route-local; gains a `backHref` prop |
| `components/events/shared/registration-form/standard-fields-card.tsx` *(moved)* | moves with the editor, its only consumer |
| `...general-events-section.tsx` *(modify, ~4 lines)* | link the event name to `/events/[id]` |

Tests mirror each unit in `__tests__/events/`.

### Why two components move

Both are imported by a tournament route today and by a general-event route after this work. Commit
`691e116f4` set the precedent when it lifted `division-fee-badge.tsx` out of the tournament route
for exactly this reason — *"a shared board must not import a route-local component."* Leaving them
in place would mean `app/(routes)/events/[id]/page.tsx` reaching into
`app/(routes)/events/tournament/[id]/_components/`, which a reviewer should reject.

Each move is mechanical — a `git mv` plus import updates — and every consumer is covered by an
existing test, so a missed import fails the suite rather than reaching production.

---

### Task 1: Migration — one registration per person per self-service event

**Files:**
- Create: `supabase/migrations/20260808090000_events_registrations_one_self_per_profile.sql`

**Interfaces:**
- Consumes: nothing
- Produces: unique index `events_registrations_one_self_per_profile`; Task 6 relies on violations surfacing as Postgres error code `23505`

- [ ] **Step 1: Confirm the index can be created**

Run this against the database first. It MUST return zero rows.

```sql
SELECT event_id, profile_id, count(*)
FROM events_registrations
WHERE profile_id IS NOT NULL
  AND source = 'event_self'
  AND status <> 'cancelled'
GROUP BY 1, 2
HAVING count(*) > 1;
```

If it returns rows, STOP and report them — do not delete data to force the index through.

Note why the predicate is this narrow: a blanket index on `(event_id, profile_id)` **fails today and would break tournaments**. Production holds one profile with three entries in the same volleyball tournament, which is legitimate — an entrant may field several teams across divisions. Those rows carry `source='tournament_self'` and this predicate excludes them.

- [ ] **Step 2: Write the migration**

```sql
-- Internal event registration: one registration per person per event.
--
-- Scoped to source='event_self' ON PURPOSE. A blanket unique index on
-- (event_id, profile_id) would fail to create AND would break tournaments:
-- one profile legitimately holds several tournament_entries in the same
-- tournament (multiple teams across divisions), each with its own
-- events_registrations row carrying source='tournament_self'.
--
-- status <> 'cancelled' mirrors EventRegistrationsService, which filters
-- cancelled rows out — so cancelling a registration frees the slot.

CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS
  events_registrations_one_self_per_profile
  ON events_registrations (event_id, profile_id)
  WHERE profile_id IS NOT NULL
    AND source = 'event_self'
    AND status <> 'cancelled';
```

- [ ] **Step 3: Apply it**

Apply via the Supabase MCP `apply_migration` tool (this project has no local Supabase CLI).

Note: `CREATE INDEX CONCURRENTLY` cannot run inside a transaction block. If the tool wraps statements in a transaction and it fails, drop `CONCURRENTLY` — this table is small enough (~1 600 rows) that the brief lock is harmless.

- [ ] **Step 4: Verify it exists**

```sql
SELECT indexname, indexdef FROM pg_indexes
WHERE tablename = 'events_registrations'
  AND indexname = 'events_registrations_one_self_per_profile';
```
Expected: exactly one row, with the `WHERE` clause present in `indexdef`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260808090000_events_registrations_one_self_per_profile.sql
git commit -m "feat(events): one self-service registration per person per event"
```

---

### Task 2: Shared access gate for general events

**Files:**
- Create: `hooks/events/use-event-access.ts`
- Test: `__tests__/events/use-event-access.test.ts`

**Interfaces:**
- Consumes: `getIncharges(event)` from `@/hooks/events/use-tournament-access` (already exported — do NOT reimplement it)
- Produces: `useEventAccess(event?: Pick<Event,'config'> | null): EventAccess` where
  `EventAccess = { canManage: boolean; canView: boolean; isIncharge: boolean; isLoading: boolean }`.
  Tasks 3 and 4 both consume this.

- [ ] **Step 1: Write the failing test**

Create `__tests__/events/use-event-access.test.ts`:

```ts
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

const authState: { profile: { id: string; role?: string } | null } = { profile: null };
const permState = { isSuperAdmin: false, isLoading: false };

vi.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({ profile: authState.profile, isLoading: false }),
}));
vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: () => ({
    isSuperAdmin: permState.isSuperAdmin,
    isLoading: permState.isLoading,
    can: () => false,
  }),
}));

import { useEventAccess } from '@/hooks/events/use-event-access';

const EVENT_WITH_INCHARGE = {
  config: { incharges: [{ member_id: 'user-incharge', name: 'In Charge' }] },
};

beforeEach(() => {
  authState.profile = null;
  permState.isSuperAdmin = false;
  permState.isLoading = false;
});

describe('useEventAccess', () => {
  it('grants manage to a super admin', () => {
    permState.isSuperAdmin = true;
    authState.profile = { id: 'u1' };
    const { result } = renderHook(() => useEventAccess(EVENT_WITH_INCHARGE));
    expect(result.current.canManage).toBe(true);
  });

  it.each(['admin', 'administrator', 'event_coordinator'])(
    'grants manage to role %s',
    (role) => {
      authState.profile = { id: 'u1', role };
      const { result } = renderHook(() => useEventAccess(EVENT_WITH_INCHARGE));
      expect(result.current.canManage).toBe(true);
    }
  );

  it('denies manage to an unrelated role', () => {
    authState.profile = { id: 'u1', role: 'student' };
    const { result } = renderHook(() => useEventAccess(EVENT_WITH_INCHARGE));
    expect(result.current.canManage).toBe(false);
  });

  it('grants manage to a listed in-charge', () => {
    authState.profile = { id: 'user-incharge', role: 'student' };
    const { result } = renderHook(() => useEventAccess(EVENT_WITH_INCHARGE));
    expect(result.current.canManage).toBe(true);
    expect(result.current.isIncharge).toBe(true);
  });

  it('reports isLoading while permissions load, so callers do not bounce a real manager', () => {
    permState.isLoading = true;
    authState.profile = { id: 'u1', role: 'admin' };
    const { result } = renderHook(() => useEventAccess(EVENT_WITH_INCHARGE));
    expect(result.current.isLoading).toBe(true);
  });

  it('denies manage when the event is null', () => {
    authState.profile = { id: 'user-incharge', role: 'student' };
    const { result } = renderHook(() => useEventAccess(null));
    expect(result.current.canManage).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run __tests__/events/use-event-access.test.ts`
Expected: FAIL — cannot resolve `@/hooks/events/use-event-access`.

- [ ] **Step 3: Write the hook**

Create `hooks/events/use-event-access.ts`:

```ts
// hooks/events/use-event-access.ts
// Access model for GENERAL events (lecture, cultural, convocation, …) — the
// event-type-agnostic sibling of use-tournament-access.
//
// The manage set deliberately MIRRORS what the DB already enforces in
// events_reg_admin_read (super_admin | admin | administrator | event_coordinator)
// plus the per-event in-charge list. Keeping the UI gate identical to the RLS
// gate means we never show someone a page the database will then blank out.
//
// No new permission key: the Events catalog has no generic events.manage, and
// adding one without widening the RLS policies would let its holders into a
// page that returns zero rows.

'use client';

import { useMemo } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { usePermissions } from '@/hooks/use-permissions';
import { getIncharges } from '@/hooks/events/use-tournament-access';
import type { Event } from '@/types/events';

/** Roles granted registration read/write by events_reg_admin_read. */
const MANAGER_ROLES = ['super_admin', 'admin', 'administrator', 'event_coordinator'];

export interface EventAccess {
  /** Build the form, view registrations, copy the share link. */
  canManage: boolean;
  /** See the event at all. Every authenticated user may view a general event. */
  canView: boolean;
  /** Listed in events.config.incharges for THIS event. */
  isIncharge: boolean;
  isLoading: boolean;
}

export function useEventAccess(event?: Pick<Event, 'config'> | null): EventAccess {
  const { profile } = useAuth();
  const { isSuperAdmin, isLoading: permsLoading } = usePermissions();

  const profileId = profile?.id ?? null;
  const role = (profile as { role?: string } | null)?.role ?? null;

  const isIncharge = useMemo(
    () => (!profileId || !event ? false : getIncharges(event).some((i) => i.member_id === profileId)),
    [event, profileId]
  );

  const hasManagerRole = isSuperAdmin || (!!role && MANAGER_ROLES.includes(role));
  const canManage = hasManagerRole || isIncharge;

  return {
    canManage,
    canView: true,
    isIncharge,
    isLoading: permsLoading,
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run __tests__/events/use-event-access.test.ts`
Expected: PASS, 8 tests (the `it.each` over three roles counts as three).

- [ ] **Step 5: Commit**

```bash
git add hooks/events/use-event-access.ts __tests__/events/use-event-access.test.ts
git commit -m "feat(events): shared access gate for general events

Mirrors events_reg_admin_read's role set plus the per-event in-charge list,
so the UI gate matches the RLS gate and nobody is admitted to a page the
database will blank."
```

---

### Task 3: General event detail page

**Files:**
- Modify: `hooks/events/use-general-events.ts` (add `useGeneralEvent`)
- Move: `app/(routes)/events/tournament/[id]/_components/registration-form-card.tsx` → `components/events/shared/registration-form-card.tsx`
- Modify: `app/(routes)/events/tournament/[id]/page.tsx` (import path only)
- Create: `app/(routes)/events/[id]/page.tsx`
- Modify: `app/(routes)/events/_components/general-events-section.tsx` (link the name)
- Test: `__tests__/events/general-event-detail-page.test.tsx`

**Interfaces:**
- Consumes: `useEventAccess` from Task 2
- Produces: `useGeneralEvent(id: string)` — a TanStack Query hook returning `{ data: Event | null, isLoading, isError }`. The route `/events/[id]` becomes the organizer's home for a general event.

- [ ] **Step 1: Add the single-event hook**

Append to `hooks/events/use-general-events.ts` (after the existing `useGeneralEvents`):

```ts
/**
 * One event by id, for the general-event detail page. Deliberately NOT
 * filtered by event_type — the page itself redirects tournaments to their
 * own console, so a type filter here would only turn that redirect into a
 * "not found".
 */
export function useGeneralEvent(id: string) {
  return useQuery({
    queryKey: [...KEYS.all, 'detail', id] as const,
    queryFn: () => EventBaseService.getEvent(id),
    enabled: !!id,
  });
}
```

- [ ] **Step 2: Move RegistrationFormCard into shared, and give it an href**

The new page must not import a component out of the tournament route's `_components/` folder.
Move it first, so the page can be written against its final location.

```bash
git mv "app/(routes)/events/tournament/[id]/_components/registration-form-card.tsx" \
       components/events/shared/registration-form-card.tsx
```

In `components/events/shared/registration-form-card.tsx`, make the builder URL a prop — it currently
hardcodes the tournament path:

```tsx
export function RegistrationFormCard({
  eventId,
  canManage,
  href,
}: {
  eventId: string;
  canManage: boolean;
  /** Builder URL. Defaults to the tournament builder so the original caller is unchanged. */
  href?: string;
}) {
```

and the `Link`:

```tsx
          <Link href={href ?? `/events/tournament/${eventId}/registration-form`}>
```

Update the one existing consumer. In `app/(routes)/events/tournament/[id]/page.tsx`, change:

```tsx
import { RegistrationFormCard } from './_components/registration-form-card';
```

to:

```tsx
import { RegistrationFormCard } from '@/components/events/shared/registration-form-card';
```

Confirm nothing else referenced it:

Run: `rg -n "_components/registration-form-card" --glob '!node_modules'`
Expected: no matches.

- [ ] **Step 3: Write the failing test**

Create `__tests__/events/general-event-detail-page.test.tsx`:

```tsx
// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase/client', () => ({ createClientSupabaseClient: () => ({}) }));

const replace = vi.fn();
vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'ev-1' }),
  useRouter: () => ({ replace, push: vi.fn() }),
}));

const eventState: { data: unknown; isLoading: boolean } = { data: null, isLoading: false };
vi.mock('@/hooks/events/use-general-events', () => ({
  useGeneralEvent: () => ({ data: eventState.data, isLoading: eventState.isLoading }),
}));

const accessState = { canManage: true, isLoading: false };
vi.mock('@/hooks/events/use-event-access', () => ({
  useEventAccess: () => ({ ...accessState, canView: true, isIncharge: false }),
}));

// EventLogistics pulls in a dozen boards whose services build Supabase clients.
vi.mock('@/components/events/shared/event-logistics', () => ({
  EventLogistics: () => <div data-testid="logistics" />,
}));
vi.mock('@/components/events/shared/registration-form-card', () => ({
  RegistrationFormCard: () => <div data-testid="form-card" />,
}));

import GeneralEventDetailPage from '@/app/(routes)/events/[id]/page';

const LECTURE = {
  id: 'ev-1',
  name: 'JKKN School of Influencer',
  event_type: 'lecture',
  status: 'planning',
  event_date: '2026-07-29',
  venue: 'Auditorium',
  config: {},
};

beforeEach(() => {
  replace.mockClear();
  eventState.data = LECTURE;
  eventState.isLoading = false;
  accessState.canManage = true;
  accessState.isLoading = false;
});
afterEach(() => cleanup());

describe('GeneralEventDetailPage', () => {
  it('renders the event name and its logistics for a manager', () => {
    render(<GeneralEventDetailPage />);
    expect(screen.getByText('JKKN School of Influencer')).toBeInTheDocument();
    expect(screen.getByTestId('logistics')).toBeInTheDocument();
  });

  it('offers a copy-link button to a manager', () => {
    render(<GeneralEventDetailPage />);
    expect(screen.getByRole('button', { name: /copy registration link/i })).toBeInTheDocument();
  });

  it('hides the share link and logistics from a non-manager', () => {
    accessState.canManage = false;
    render(<GeneralEventDetailPage />);
    expect(screen.queryByRole('button', { name: /copy registration link/i })).not.toBeInTheDocument();
    expect(screen.queryByTestId('logistics')).not.toBeInTheDocument();
  });

  it('redirects a tournament to its own console', () => {
    eventState.data = { ...LECTURE, event_type: 'sports_tournament' };
    render(<GeneralEventDetailPage />);
    expect(replace).toHaveBeenCalledWith('/events/tournament/ev-1');
  });

  it('shows a skeleton while loading, never a blank page', () => {
    eventState.data = null;
    eventState.isLoading = true;
    const { container } = render(<GeneralEventDetailPage />);
    // <Skeleton> applies animate-pulse itself — asserting on it proves a
    // skeleton rendered rather than a blank page.
    expect(container.querySelector('.animate-pulse')).toBeTruthy();
  });

  it('reports a missing event instead of crashing', () => {
    eventState.data = null;
    eventState.isLoading = false;
    render(<GeneralEventDetailPage />);
    expect(screen.getByText(/not found/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 4: Run it to verify it fails**

Run: `npx vitest run __tests__/events/general-event-detail-page.test.tsx`
Expected: FAIL — cannot resolve `@/app/(routes)/events/[id]/page`.

- [ ] **Step 5: Write the page**

Create `app/(routes)/events/[id]/page.tsx`:

```tsx
'use client';

// app/(routes)/events/[id]/page.tsx
// Detail page for a GENERAL event — the wizard-created rows (lecture, cultural,
// convocation, …) that have no dedicated console. Until this page existed there
// was no way to reach the registration form builder for such an event, and no
// way to read its registrations, even though both were already event-agnostic
// underneath.
//
// Tournaments redirect to their own console: one canonical page per event, so
// the two never drift.

import { useEffect } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { CalendarDays, MapPin, Link2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { EVENT_STATUS_LABELS } from '@/types/events';
import { useGeneralEvent } from '@/hooks/events/use-general-events';
import { useEventAccess } from '@/hooks/events/use-event-access';
import { EventLogistics } from '@/components/events/shared/event-logistics';
import { RegistrationFormCard } from '@/components/events/shared/registration-form-card';

/** 'sports_day' → 'Sports Day'. Live event_type values are wider than the TS union. */
const formatEventType = (type: string) =>
  type.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

const formatDate = (value?: string | null) => {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? null
    : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
};

export default function GeneralEventDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = String(params?.id ?? '');

  const { data: event, isLoading } = useGeneralEvent(id);
  const access = useEventAccess(event);
  const canManage = access.canManage;

  const isTournament = event?.event_type === 'sports_tournament';

  // A tournament has a richer console; send it there rather than rendering a
  // second, poorer view of the same event.
  useEffect(() => {
    if (isTournament) router.replace(`/events/tournament/${id}`);
  }, [isTournament, id, router]);

  const copyLink = async () => {
    const url = `${window.location.origin}/events/${id}/register`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Registration link copied');
    } catch {
      // Clipboard is blocked on insecure origins and in some browsers — show
      // the URL so the organizer can copy it by hand rather than fail silently.
      toast(url, { duration: 10000 });
    }
  };

  if (isLoading) {
    return (
      <ContentLayout title="Event">
        <div className="mt-4 space-y-4">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </ContentLayout>
    );
  }

  if (!event) {
    return (
      <ContentLayout title="Event">
        <Card className="mt-4">
          <CardContent className="py-12 text-center text-muted-foreground">
            Event not found, or you don&apos;t have access to it.
          </CardContent>
        </Card>
      </ContentLayout>
    );
  }

  if (isTournament) return null; // redirecting

  const dateLabel = formatDate(event.event_date ?? event.start_date);

  return (
    <ContentLayout title={event.name}>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Events', href: '/events' },
          { label: event.name },
        ]}
      />

      <Card className="mt-4">
        <CardContent className="flex flex-wrap items-start justify-between gap-3 py-4">
          <div className="min-w-0 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold">{event.name}</h1>
              <Badge variant="secondary" className="text-[10px] font-normal">
                {formatEventType(event.event_type as string)}
              </Badge>
              <Badge variant="outline" className="text-[10px] font-normal">
                {EVENT_STATUS_LABELS[event.status] ?? event.status}
              </Badge>
            </div>
            {(dateLabel || event.venue) && (
              <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                {dateLabel && (
                  <span className="flex items-center gap-1">
                    <CalendarDays className="h-3 w-3" />
                    {dateLabel}
                  </span>
                )}
                {event.venue && (
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3 w-3" />
                    {event.venue}
                  </span>
                )}
              </div>
            )}
          </div>
          {canManage && (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" className="gap-1.5" onClick={copyLink}>
                <Link2 className="h-3.5 w-3.5" />
                Copy registration link
              </Button>
              <Button asChild size="sm" variant="ghost">
                <Link href={`/events/${id}/register`}>Preview form</Link>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {canManage && (
        <div className="mt-4">
          <RegistrationFormCard
            eventId={id}
            canManage={canManage}
            href={`/events/${id}/registration-form`}
          />
          <EventLogistics
            eventId={id}
            eventType={String(event.event_type)}
            canManage={canManage}
          />
        </div>
      )}
    </ContentLayout>
  );
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run __tests__/events/general-event-detail-page.test.tsx`
Expected: PASS, 6 tests.

- [ ] **Step 7: Link the hub list to the new page**

In `app/(routes)/events/_components/general-events-section.tsx`, the event name renders as plain text inside `GeneralEventRow`. Without this change there is no way to reach the page.

Add the import at the top of the file:

```tsx
import Link from 'next/link';
```

Replace:

```tsx
          <span className="text-sm font-medium">{event.name}</span>
```

with:

```tsx
          <Link
            href={`/events/${event.id}`}
            className="text-sm font-medium hover:underline"
          >
            {event.name}
          </Link>
```

- [ ] **Step 8: Verify the existing hub tests still pass**

Run: `npx vitest run __tests__/events/`
Expected: PASS — all files, including the 43 pre-existing tournament tests.

- [ ] **Step 9: Commit**

```bash
git add -A hooks/events/use-general-events.ts \
           "app/(routes)/events/[id]/page.tsx" \
           components/events/shared/registration-form-card.tsx \
           "app/(routes)/events/tournament/[id]/_components/" \
           "app/(routes)/events/tournament/[id]/page.tsx" \
           "app/(routes)/events/_components/general-events-section.tsx" \
           __tests__/events/general-event-detail-page.test.tsx
git commit -m "feat(events): detail page for general events

Gives lectures, cultural programmes and convocations somewhere to reach the
registration form builder and read their registrations. EventLogistics needed
no change: every tab was already eventTypes: 'all'. Tournaments redirect to
their own console so there is one canonical page per event.

RegistrationFormCard moves to components/events/shared/ because two routes now
render it -- the same reason division-fee-badge.tsx moved in 691e116f4. A page
under events/[id]/ must not import from events/tournament/[id]/_components/."
```

---

### Task 4: Builder shell for general events

**Files:**
- Move: `app/(routes)/events/tournament/[id]/registration-form/_components/registration-form-editor.tsx` → `components/events/shared/registration-form/registration-form-editor.tsx`
- Move: `app/(routes)/events/tournament/[id]/registration-form/_components/standard-fields-card.tsx` → `components/events/shared/registration-form/standard-fields-card.tsx`
- Modify: `app/(routes)/events/tournament/[id]/registration-form/page.tsx` (import path only)
- Modify: `__tests__/events/registration-form-editor-standard-fields.test.tsx`, `__tests__/events/standard-fields-card.test.tsx` (import paths only)
- Create: `app/(routes)/events/[id]/registration-form/page.tsx`
- Test: `__tests__/events/general-event-builder-page.test.tsx`

**Interfaces:**
- Consumes: `useEventAccess` (Task 2), `useGeneralEvent` (Task 3), `RegistrationFormEditor`
- Produces: route `/events/[id]/registration-form`. `RegistrationFormEditor` moves to `@/components/events/shared/registration-form/registration-form-editor` and gains an optional `backHref` prop.

- [ ] **Step 1: Move the editor and its card into shared**

Two routes render this editor now, so it stops being route-local. `standard-fields-card.tsx` moves
with it — the editor is its only consumer, and files that change together belong together.

```bash
mkdir -p components/events/shared/registration-form
git mv "app/(routes)/events/tournament/[id]/registration-form/_components/registration-form-editor.tsx" \
       components/events/shared/registration-form/registration-form-editor.tsx
git mv "app/(routes)/events/tournament/[id]/registration-form/_components/standard-fields-card.tsx" \
       components/events/shared/registration-form/standard-fields-card.tsx
```

The editor's own `import { StandardFieldsCard, StandardFieldsPreview } from './standard-fields-card';`
still resolves — they moved together.

Update the three consumers. In `app/(routes)/events/tournament/[id]/registration-form/page.tsx`:

```tsx
import { RegistrationFormEditor } from '@/components/events/shared/registration-form/registration-form-editor';
```

In `__tests__/events/registration-form-editor-standard-fields.test.tsx` and
`__tests__/events/standard-fields-card.test.tsx`, repoint any import of
`app/(routes)/events/tournament/[id]/registration-form/_components/...` at
`@/components/events/shared/registration-form/...`.

Then confirm nothing else referenced the old location:

Run: `rg -n "registration-form/_components" --glob '!node_modules'`
Expected: no matches.

One comment inside `standard-fields-card.tsx` references the public register form's path as the
thing it must stay in sync with. Leave that comment's target unchanged — that file did not move.

- [ ] **Step 2: Make the editor's back-link a prop**

In the moved `registration-form-editor.tsx`, change the component signature (was line 295):

```tsx
export function RegistrationFormEditor({
  eventId,
  backHref,
}: {
  eventId: string;
  /** Where "Back" goes. Defaults to the tournament detail page so the original caller is unchanged. */
  backHref?: string;
}) {
```

and the Back button (was line 460):

```tsx
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push(backHref ?? `/events/tournament/${eventId}`)}
          >
```

Those are the only content changes to this file. The editor must not otherwise know which route
hosts it.

- [ ] **Step 3: Verify the move broke nothing before adding anything**

Run: `npx vitest run __tests__/events/`
Expected: PASS — every pre-existing test, at the new import paths.

Do this before writing the new page. If the suite is red here, it is the move that broke it, and
that is far easier to see now than after a new page is layered on top.

- [ ] **Step 4: Write the failing test**

Create `__tests__/events/general-event-builder-page.test.tsx`:

```tsx
// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase/client', () => ({ createClientSupabaseClient: () => ({}) }));

const replace = vi.fn();
vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'ev-1' }),
  useRouter: () => ({ replace, push: vi.fn() }),
}));

const eventState: { data: unknown; isLoading: boolean } = { data: null, isLoading: false };
vi.mock('@/hooks/events/use-general-events', () => ({
  useGeneralEvent: () => ({ data: eventState.data, isLoading: eventState.isLoading }),
}));

const accessState = { canManage: true, isLoading: false };
vi.mock('@/hooks/events/use-event-access', () => ({
  useEventAccess: () => ({ ...accessState, canView: true, isIncharge: false }),
}));

vi.mock(
  '@/components/events/shared/registration-form/registration-form-editor',
  () => ({ RegistrationFormEditor: () => <div data-testid="editor" /> })
);

import BuilderPage from '@/app/(routes)/events/[id]/registration-form/page';

const LECTURE = { id: 'ev-1', name: 'JKKN School of Influencer', event_type: 'lecture', config: {} };

beforeEach(() => {
  replace.mockClear();
  eventState.data = LECTURE;
  eventState.isLoading = false;
  accessState.canManage = true;
  accessState.isLoading = false;
});
afterEach(() => cleanup());

describe('general event registration-form builder page', () => {
  it('renders the editor for a manager', () => {
    render(<BuilderPage />);
    expect(screen.getByTestId('editor')).toBeInTheDocument();
  });

  it('redirects a non-manager back to the event', () => {
    accessState.canManage = false;
    render(<BuilderPage />);
    expect(replace).toHaveBeenCalledWith('/events/ev-1');
  });

  it('does NOT redirect while access is still loading', () => {
    accessState.canManage = false;
    accessState.isLoading = true;
    render(<BuilderPage />);
    expect(replace).not.toHaveBeenCalled();
  });

  it('does not redirect while the event is still loading', () => {
    eventState.data = null;
    eventState.isLoading = true;
    accessState.canManage = false;
    render(<BuilderPage />);
    expect(replace).not.toHaveBeenCalled();
  });
});
```

The third test is the important one. The tournament builder page carries a comment about exactly this bug: redirecting before `can()`/`isSuperAdmin` resolve bounces a real manager off their own page.

- [ ] **Step 5: Run it to verify it fails**

Run: `npx vitest run __tests__/events/general-event-builder-page.test.tsx`
Expected: FAIL — cannot resolve the page module.

- [ ] **Step 6: Write the page**

Create `app/(routes)/events/[id]/registration-form/page.tsx`:

```tsx
'use client';

// Registration Form builder for a GENERAL event. A thin shell around the same
// RegistrationFormEditor the tournament builder uses — the editor was already
// event-agnostic (it takes nothing but an eventId), so this page contributes
// only the breadcrumb, the access gate and the Back target.

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useGeneralEvent } from '@/hooks/events/use-general-events';
import { useEventAccess } from '@/hooks/events/use-event-access';
import { RegistrationFormEditor } from '@/components/events/shared/registration-form/registration-form-editor';

export default function GeneralEventRegistrationFormPage() {
  const params = useParams();
  const router = useRouter();
  const id = String(params?.id ?? '');

  const { data: event, isLoading } = useGeneralEvent(id);
  const access = useEventAccess(event);
  const { canManage, isLoading: accessLoading } = access;

  // Wait for BOTH the event and the permission load before bouncing anyone.
  // Redirecting early throws a real manager off their own page while
  // isSuperAdmin is still false — the bug the tournament builder page
  // documents at the same spot.
  useEffect(() => {
    if (!isLoading && !accessLoading && event && !canManage) {
      router.replace(`/events/${id}`);
    }
  }, [isLoading, accessLoading, event, canManage, id, router]);

  if (isLoading || accessLoading) {
    return (
      <ContentLayout title="Registration Form">
        <Skeleton className="mt-4 h-64 w-full" />
      </ContentLayout>
    );
  }

  if (!event) {
    return (
      <ContentLayout title="Registration Form">
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Event not found, or you don&apos;t have access to it.
          </CardContent>
        </Card>
      </ContentLayout>
    );
  }

  if (!canManage) return null; // redirecting

  return (
    <ContentLayout title={`Registration Form · ${event.name}`}>
      <PageBreadcrumb
        items={[
          { label: 'Events', href: '/events' },
          { label: event.name, href: `/events/${id}` },
          { label: 'Registration Form' },
        ]}
      />
      <RegistrationFormEditor eventId={id} backHref={`/events/${id}`} />
    </ContentLayout>
  );
}
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx vitest run __tests__/events/general-event-builder-page.test.tsx`
Expected: PASS, 4 tests.

- [ ] **Step 8: Verify the tournament builder is unbroken**

Run: `npx vitest run __tests__/events/`
Expected: PASS — every file. `backHref` is optional and defaults to the old value, so the tournament
builder behaves exactly as before.

- [ ] **Step 9: Commit**

```bash
git add -A components/events/shared/registration-form/ \
           "app/(routes)/events/tournament/[id]/registration-form/" \
           "app/(routes)/events/[id]/registration-form/page.tsx" \
           __tests__/events/
git commit -m "feat(events): registration form builder for general events

The editor was already event-agnostic; only its hardcoded Back target tied it
to the tournament route, so that becomes an optional prop defaulting to the
old value. Access waits for both the event and the permission load before
redirecting, so a real manager is never bounced while permissions resolve.

The editor and standard-fields-card move to components/events/shared/ now that
two routes render them, following the same rule as 691e116f4: a shared
component must not live inside one route's _components folder."
```

---

### Task 5: Pure registration-window helper

**Files:**
- Create: `lib/services/events/shared/event-registration-window.ts`
- Test: `__tests__/events/event-registration-window.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  ```ts
  type WindowState =
    | { open: true }
    | { open: false; reason: 'not_available' | 'not_yet' | 'closed'; message: string };

  function checkRegistrationWindow(
    event: { status?: string | null; registration_open_date?: string | null; registration_close_date?: string | null },
    now?: Date
  ): WindowState;
  ```
  Task 6 (route) and Task 7 (page) both call this, guaranteeing the server's decision and the page's message can never disagree.

- [ ] **Step 1: Write the failing test**

Create `__tests__/events/event-registration-window.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { checkRegistrationWindow } from '@/lib/services/events/shared/event-registration-window';

const NOW = new Date('2026-07-29T10:00:00Z');

describe('checkRegistrationWindow', () => {
  it('is open when published with no dates set', () => {
    expect(checkRegistrationWindow({ status: 'planning' }, NOW)).toEqual({ open: true });
  });

  it.each(['draft', 'cancelled'])('is closed for status %s', (status) => {
    const result = checkRegistrationWindow({ status }, NOW);
    expect(result.open).toBe(false);
    if (!result.open) expect(result.reason).toBe('not_available');
  });

  it('is closed before the open date, naming the date', () => {
    const result = checkRegistrationWindow(
      { status: 'planning', registration_open_date: '2026-08-05T00:00:00Z' },
      NOW
    );
    expect(result.open).toBe(false);
    if (!result.open) {
      expect(result.reason).toBe('not_yet');
      expect(result.message).toContain('5 August 2026');
    }
  });

  it('is closed after the close date', () => {
    const result = checkRegistrationWindow(
      { status: 'planning', registration_close_date: '2026-07-01T00:00:00Z' },
      NOW
    );
    expect(result.open).toBe(false);
    if (!result.open) expect(result.reason).toBe('closed');
  });

  it('is open inside the window', () => {
    expect(
      checkRegistrationWindow(
        {
          status: 'planning',
          registration_open_date: '2026-07-01T00:00:00Z',
          registration_close_date: '2026-08-30T00:00:00Z',
        },
        NOW
      )
    ).toEqual({ open: true });
  });

  it('is open exactly on the open boundary', () => {
    expect(
      checkRegistrationWindow(
        { status: 'planning', registration_open_date: NOW.toISOString() },
        NOW
      )
    ).toEqual({ open: true });
  });

  it('treats an unparseable date as no limit rather than locking everyone out', () => {
    expect(
      checkRegistrationWindow({ status: 'planning', registration_open_date: 'not-a-date' }, NOW)
    ).toEqual({ open: true });
  });

  it('checks status before dates, so a draft inside its window is still closed', () => {
    const result = checkRegistrationWindow(
      {
        status: 'draft',
        registration_open_date: '2026-07-01T00:00:00Z',
        registration_close_date: '2026-08-30T00:00:00Z',
      },
      NOW
    );
    expect(result.open).toBe(false);
    if (!result.open) expect(result.reason).toBe('not_available');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run __tests__/events/event-registration-window.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the helper**

Create `lib/services/events/shared/event-registration-window.ts`:

```ts
// lib/services/events/shared/event-registration-window.ts
// Is this event accepting registrations right now?
//
// PURE — no Supabase, no DOM, no clock of its own (`now` is injectable). Both
// the API route and the registrant page call this, so the server's decision and
// the message the registrant reads can never disagree.
//
// The rule matches the tournament public page: a non-draft, non-cancelled event
// inside its registration window. Blank dates mean "no limit" — most events
// never set them.

const CLOSED_STATUSES = ['draft', 'cancelled'];

export type WindowState =
  | { open: true }
  | { open: false; reason: 'not_available' | 'not_yet' | 'closed'; message: string };

export interface RegistrationWindowInput {
  status?: string | null;
  registration_open_date?: string | null;
  registration_close_date?: string | null;
}

/** '2026-08-05T00:00:00Z' → '5 August 2026'. */
function formatLongDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/** A parseable Date, or null. An unparseable stored date must not lock everyone out. */
function parseDate(value?: string | null): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function checkRegistrationWindow(
  event: RegistrationWindowInput,
  now: Date = new Date()
): WindowState {
  // Status first: a draft inside its window is still not available.
  if (event.status && CLOSED_STATUSES.includes(event.status)) {
    return {
      open: false,
      reason: 'not_available',
      message: 'Registration is not available for this event.',
    };
  }

  const opens = parseDate(event.registration_open_date);
  if (opens && now < opens) {
    return {
      open: false,
      reason: 'not_yet',
      message: `Registration opens on ${formatLongDate(event.registration_open_date as string)}.`,
    };
  }

  const closes = parseDate(event.registration_close_date);
  if (closes && now > closes) {
    return {
      open: false,
      reason: 'closed',
      message: 'Registration has closed.',
    };
  }

  return { open: true };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run __tests__/events/event-registration-window.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/services/events/shared/event-registration-window.ts \
        __tests__/events/event-registration-window.test.ts
git commit -m "feat(events): pure registration-window helper

Injectable clock and no Supabase, so the branchiest logic in this feature is
tested without mocks. Shared by the API route and the registrant page so the
server's decision and the registrant's message cannot disagree."
```

---

### Task 6: Registration API route

**Files:**
- Create: `app/api/events/[eventId]/register/route.ts`
- Test: `__tests__/events/event-register-route.test.ts`

**Interfaces:**
- Consumes: `checkRegistrationWindow` (Task 5), `validateCustomFields` from `@/lib/services/events/tournament/event-registration-form-service`
- Produces: `POST /api/events/[eventId]/register`, body `{ phone: string; custom_fields?: Record<string, unknown> }`, returns `201 { registration_id }` or an error status with `{ error: string }`.
  Task 7 consumes this contract.

- [ ] **Step 1: Write the failing test**

Create `__tests__/events/event-register-route.test.ts`:

```ts
import { describe, expect, it, vi, beforeEach } from 'vitest';

// ── Supabase test double ────────────────────────────────────────────────────
// One chainable builder per table. `results` decides what each table returns,
// and `inserted` captures the row the route tried to write.
const results: Record<string, unknown> = {};
const inserted: { payload?: Record<string, unknown> } = {};
let insertError: { code?: string; message: string } | null = null;

function builderFor(table: string) {
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  ['select', 'eq', 'neq', 'in', 'order', 'limit'].forEach((m) => {
    chain[m] = vi.fn(self);
  });
  chain.maybeSingle = vi.fn(async () => ({ data: results[table] ?? null, error: null }));
  chain.single = vi.fn(async () => ({ data: results[table] ?? null, error: null }));
  chain.then = undefined;
  chain.insert = vi.fn((payload: Record<string, unknown>) => {
    inserted.payload = payload;
    return {
      select: () => ({
        single: async () =>
          insertError
            ? { data: null, error: insertError }
            : { data: { id: 'reg-new' }, error: null },
      }),
    };
  });
  // Plain awaited queries (no .single()) resolve to a list.
  (chain as { catch?: unknown }).catch = undefined;
  return chain;
}

const authUser: { user: { id: string } | null } = { user: null };

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: authUser.user } }) },
  }),
  createServiceRoleClient: () => ({ from: (table: string) => builderFor(table) }),
}));

vi.mock('@/lib/utils/enhanced-logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { POST } from '@/app/api/events/[eventId]/register/route';

const EVENT_ID = 'ev-1';
const params = Promise.resolve({ eventId: EVENT_ID });

function post(body: unknown) {
  return new Request('http://localhost/api/events/ev-1/register', {
    method: 'POST',
    body: JSON.stringify(body),
  }) as unknown as Parameters<typeof POST>[0];
}

const OPEN_EVENT = {
  id: EVENT_ID,
  name: 'JKKN School of Influencer',
  status: 'planning',
  institution_id: 'inst-1',
  registration_open_date: null,
  registration_close_date: null,
};

const PROFILE = {
  id: 'user-1',
  full_name: 'Sangeetha V',
  email: 'aimech@jkkn.ac.in',
  institution_id: 'inst-9',
  department_id: 'dept-1',
};

beforeEach(() => {
  authUser.user = { id: 'user-1' };
  results.events = OPEN_EVENT;
  results.profiles = PROFILE;
  results.departments = { department_name: 'Mechanical' };
  results.events_registrations = null; // not already registered
  results.event_registration_form_fields = [];
  inserted.payload = undefined;
  insertError = null;
});

describe('POST /api/events/[eventId]/register', () => {
  it('rejects a signed-out caller with 401', async () => {
    authUser.user = null;
    const res = await POST(post({ phone: '9876543210' }), { params });
    expect(res.status).toBe(401);
  });

  it('404s when the event does not exist', async () => {
    results.events = null;
    const res = await POST(post({ phone: '9876543210' }), { params });
    expect(res.status).toBe(404);
  });

  it('404s for a draft event', async () => {
    results.events = { ...OPEN_EVENT, status: 'draft' };
    const res = await POST(post({ phone: '9876543210' }), { params });
    expect(res.status).toBe(404);
  });

  it('422s before the window opens, naming the date', async () => {
    results.events = { ...OPEN_EVENT, registration_open_date: '2099-01-01T00:00:00Z' };
    const res = await POST(post({ phone: '9876543210' }), { params });
    expect(res.status).toBe(422);
    expect((await res.json()).error).toContain('opens on');
  });

  it('422s after the window closes', async () => {
    results.events = { ...OPEN_EVENT, registration_close_date: '2000-01-01T00:00:00Z' };
    const res = await POST(post({ phone: '9876543210' }), { params });
    expect(res.status).toBe(422);
  });

  it('422s on a malformed phone number', async () => {
    const res = await POST(post({ phone: '123' }), { params });
    expect(res.status).toBe(422);
    expect((await res.json()).error).toMatch(/phone/i);
  });

  it('422s when a required custom field is missing, naming the label', async () => {
    results.event_registration_form_fields = [
      { field_key: 'why_join', field_label: 'Why do you want to join?', is_required: true },
    ];
    const res = await POST(post({ phone: '9876543210', custom_fields: {} }), { params });
    expect(res.status).toBe(422);
    expect((await res.json()).error).toContain('Why do you want to join?');
  });

  it('409s when the caller already has a registration', async () => {
    results.events_registrations = { id: 'reg-existing' };
    const res = await POST(post({ phone: '9876543210' }), { params });
    expect(res.status).toBe(409);
  });

  it('409s when the unique index rejects a racing second submit', async () => {
    insertError = { code: '23505', message: 'duplicate key value' };
    const res = await POST(post({ phone: '9876543210' }), { params });
    expect(res.status).toBe(409);
  });

  it('inserts with the internal/self-service conventions on the happy path', async () => {
    const res = await POST(
      post({ phone: '9876543210', custom_fields: { tshirt: 'L' } }),
      { params }
    );
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ registration_id: 'reg-new' });

    const row = inserted.payload!;
    expect(row.participant_type).toBe('internal');
    expect(row.source).toBe('event_self');
    expect(row.status).toBe('registered');
    expect(row.profile_id).toBe('user-1');
    expect(row.custom_fields).toEqual({ tshirt: 'L' });
    expect(row.department).toBe('Mechanical');
  });

  it('stores answers in custom_fields, never custom_data', async () => {
    await POST(post({ phone: '9876543210', custom_fields: { tshirt: 'L' } }), { params });
    expect(inserted.payload).not.toHaveProperty('custom_data');
  });

  it('never writes bib_number, which is globally unique', async () => {
    await POST(post({ phone: '9876543210' }), { params });
    expect(inserted.payload!.bib_number).toBeUndefined();
  });

  it("stores the EVENT's institution, not the registrant's", async () => {
    await POST(post({ phone: '9876543210' }), { params });
    expect(inserted.payload!.institution_id).toBe('inst-1');
  });

  it('falls back to email when the profile has no full_name (column is NOT NULL)', async () => {
    results.profiles = { ...PROFILE, full_name: null };
    await POST(post({ phone: '9876543210' }), { params });
    expect(inserted.payload!.participant_name).toBe('aimech@jkkn.ac.in');
  });

  it('registers fine when the profile has no department', async () => {
    results.profiles = { ...PROFILE, department_id: null };
    const res = await POST(post({ phone: '9876543210' }), { params });
    expect(res.status).toBe(201);
    expect(inserted.payload!.department).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run __tests__/events/event-register-route.test.ts`
Expected: FAIL — cannot resolve the route module.

- [ ] **Step 3: Write the route**

Create `app/api/events/[eventId]/register/route.ts`:

```ts
export const dynamic = 'force-dynamic';

// POST /api/events/[eventId]/register
// SELF-SERVICE registration for a GENERAL event by a logged-in JKKN user
// (student or staff). The event-type-agnostic sibling of the tournament's
// public-register route, minus everything that exists only to serve guests:
// no access codes, no divisions, no eligibility rules, no payment.
//
// This route is the ONLY real gate. events_registrations carries an INSERT
// policy (events_reg_public_insert) with role {public} and WITH CHECK (true),
// so every check here must be re-done server-side regardless of what the page
// already validated. Writes run service-role AFTER those checks.

import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { checkRegistrationWindow } from '@/lib/services/events/shared/event-registration-window';
import { validateCustomFields } from '@/lib/services/events/tournament/event-registration-form-service';
import { logger } from '@/lib/utils/enhanced-logger';
import type { EventRegistrationFormField } from '@/types/tournament';

const MOD = 'events/register';

interface RegisterBody {
  phone?: string;
  custom_fields?: Record<string, unknown> | null;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  try {
    const { eventId } = await params;
    const body = ((await request.json().catch(() => ({}))) ?? {}) as RegisterBody;

    // ---- 1. must be signed in ----
    const auth = await createClient();
    const {
      data: { user },
    } = await auth.auth.getUser();
    if (!user) {
      return NextResponse.json(
        { error: 'Sign in with your JKKN account to register.' },
        { status: 401 }
      );
    }

    const svc = createServiceRoleClient();

    // ---- 2. event must exist and be accepting registrations ----
    const { data: event } = await (svc as any)
      .from('events')
      .select('id, name, status, institution_id, registration_open_date, registration_close_date')
      .eq('id', eventId)
      .maybeSingle();

    if (!event) {
      return NextResponse.json({ error: 'Event not found.' }, { status: 404 });
    }

    const windowState = checkRegistrationWindow(event);
    if (!windowState.open) {
      // 'not_available' means draft/cancelled — indistinguishable from absent to
      // a registrant, so 404. A dated window that has not opened or has closed is
      // a real event in the wrong state, so 422.
      const status = windowState.reason === 'not_available' ? 404 : 422;
      return NextResponse.json({ error: windowState.message }, { status });
    }

    // ---- 3. phone ----
    const phone = String(body.phone ?? '').replace(/\D/g, '');
    if (phone.length < 10 || phone.length > 15) {
      return NextResponse.json(
        { error: 'Enter a valid phone number (10-15 digits).' },
        { status: 422 }
      );
    }

    // ---- 4. identity from the profile (never from the request body) ----
    const { data: profile } = await (svc as any)
      .from('profiles')
      .select('id, full_name, email, institution_id, department_id')
      .eq('id', user.id)
      .maybeSingle();

    if (!profile) {
      return NextResponse.json({ error: 'Your profile could not be loaded.' }, { status: 404 });
    }

    // The column is departments.department_name — NOT departments.name. A wrong
    // name returns PostgREST 42703, which degrades to a blank value rather than
    // an error. No department is normal and must not block the registration.
    let departmentName: string | null = null;
    if (profile.department_id) {
      const { data: dept } = await (svc as any)
        .from('departments')
        .select('department_name')
        .eq('id', profile.department_id)
        .maybeSingle();
      departmentName = dept?.department_name ?? null;
    }

    // ---- 5. already registered? ----
    // Deliberately NOT filtered by source: a person bulk-imported onto the roster
    // is already registered, and should be told so rather than added twice.
    const { data: existing } = await (svc as any)
      .from('events_registrations')
      .select('id')
      .eq('event_id', eventId)
      .eq('profile_id', user.id)
      .neq('status', 'cancelled')
      .maybeSingle();

    if (existing) {
      return NextResponse.json(
        { error: 'You have already registered for this event.' },
        { status: 409 }
      );
    }

    // ---- 6. required custom fields ----
    const { data: fields } = await (svc as any)
      .from('event_registration_form_fields')
      .select('field_key, field_label, is_required')
      .eq('event_id', eventId);

    const missing = validateCustomFields(
      (fields ?? []) as EventRegistrationFormField[],
      body.custom_fields
    );
    if (missing) {
      return NextResponse.json({ error: missing }, { status: 422 });
    }

    // ---- 7. write ----
    const { data: created, error: insertError } = await (svc as any)
      .from('events_registrations')
      .insert({
        event_id: eventId,
        profile_id: user.id,
        // The EVENT's institution, not the registrant's: events_reg_institution_read
        // compares this to the reader's institution, so storing the registrant's
        // would hide a cross-college registration from the organizing college.
        institution_id: event.institution_id,
        participant_type: 'internal',
        // participant_name is NOT NULL while profiles.full_name is nullable.
        participant_name: profile.full_name || profile.email || 'Unnamed',
        participant_email: profile.email ?? null,
        participant_phone: phone,
        department: departmentName,
        // custom_fields, NOT custom_data — custom_fields is what
        // EventRegistrationsService maps back to the organizer's labels.
        custom_fields: body.custom_fields ?? {},
        status: 'registered',
        payment_status: 'not_required',
        source: 'event_self',
        checked_in: false,
        // bib_number is deliberately absent: the column is GLOBALLY unique.
      })
      .select('id')
      .single();

    if (insertError) {
      // 23505 = unique_violation, i.e. events_registrations_one_self_per_profile
      // caught a second submit racing the check in step 5.
      if (insertError.code === '23505') {
        return NextResponse.json(
          { error: 'You have already registered for this event.' },
          { status: 409 }
        );
      }
      logger.error(MOD, 'Failed to insert registration', { eventId, insertError });
      return NextResponse.json({ error: 'Could not save your registration.' }, { status: 500 });
    }

    return NextResponse.json({ registration_id: created.id }, { status: 201 });
  } catch (error) {
    logger.error(MOD, 'Unexpected error in register route', error);
    return NextResponse.json({ error: 'Could not save your registration.' }, { status: 500 });
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run __tests__/events/event-register-route.test.ts`
Expected: PASS, 15 tests.

If the chainable mock does not satisfy a call the route makes, adjust `builderFor` — do NOT weaken an assertion to make it pass.

- [ ] **Step 5: Commit**

```bash
git add "app/api/events/[eventId]/register/route.ts" \
        __tests__/events/event-register-route.test.ts
git commit -m "feat(events): self-service registration API for general events

events_registrations has a {public} INSERT policy with WITH CHECK (true), so
this route is the only real gate and re-checks everything the page checked.
Identity comes from the profile, never the request body. Leaves bib_number
null (globally unique) and writes answers to custom_fields, the column the
read service maps back to labels."
```

---

### Task 7: Registrant form page

**Files:**
- Create: `app/(routes)/events/[id]/register/page.tsx`
- Test: `__tests__/events/event-register-page.test.tsx`

**Interfaces:**
- Consumes: `useGeneralEvent` (Task 3), `checkRegistrationWindow` (Task 5), `POST /api/events/[eventId]/register` (Task 6), `useRegistrationForm` from `@/hooks/events/use-tournament-registration-form`, `DynamicFieldInput` + `isFieldVisible` from `@/components/events/dynamic-field-input`
- Produces: route `/events/[id]/register` — the link organizers share

- [ ] **Step 1: Write the failing test**

Create `__tests__/events/event-register-page.test.tsx`:

```tsx
// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase/client', () => ({ createClientSupabaseClient: () => ({}) }));
vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'ev-1' }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

const authState: { profile: unknown; isLoading: boolean } = { profile: null, isLoading: false };
vi.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({ profile: authState.profile, isLoading: authState.isLoading }),
}));

const eventState: { data: unknown; isLoading: boolean } = { data: null, isLoading: false };
vi.mock('@/hooks/events/use-general-events', () => ({
  useGeneralEvent: () => ({ data: eventState.data, isLoading: eventState.isLoading }),
}));

const formState: { data: unknown } = { data: { is_enabled: true, sections: [] } };
vi.mock('@/hooks/events/use-tournament-registration-form', () => ({
  useRegistrationForm: () => ({ data: formState.data, isLoading: false }),
}));

const myRegState: { data: unknown; isLoading: boolean } = { data: null, isLoading: false };
vi.mock('@/hooks/events/use-my-event-registration', () => ({
  useMyEventRegistration: () => ({
    data: myRegState.data,
    isLoading: myRegState.isLoading,
    refetch: vi.fn(),
  }),
}));

import RegisterPage from '@/app/(routes)/events/[id]/register/page';

const PROFILE = {
  id: 'user-1',
  full_name: 'Sangeetha V',
  email: 'aimech@jkkn.ac.in',
};
const OPEN_EVENT = {
  id: 'ev-1',
  name: 'JKKN School of Influencer',
  status: 'planning',
  registration_open_date: null,
  registration_close_date: null,
};

beforeEach(() => {
  authState.profile = PROFILE;
  authState.isLoading = false;
  eventState.data = OPEN_EVENT;
  eventState.isLoading = false;
  formState.data = { is_enabled: true, sections: [] };
  myRegState.data = null;
  myRegState.isLoading = false;
  global.fetch = vi.fn(async () => ({
    ok: true,
    status: 201,
    json: async () => ({ registration_id: 'reg-new' }),
  })) as unknown as typeof fetch;
});
afterEach(() => cleanup());

describe('event register page', () => {
  it('asks a signed-out visitor to sign in', () => {
    authState.profile = null;
    render(<RegisterPage />);
    expect(screen.getByText(/sign in with your jkkn account/i)).toBeInTheDocument();
  });

  it('shows who is registering, read-only', () => {
    render(<RegisterPage />);
    expect(screen.getByText('Sangeetha V')).toBeInTheDocument();
    expect(screen.getByText('aimech@jkkn.ac.in')).toBeInTheDocument();
  });

  it('says registration is not available for a draft event', () => {
    eventState.data = { ...OPEN_EVENT, status: 'draft' };
    render(<RegisterPage />);
    expect(screen.getByText(/not available/i)).toBeInTheDocument();
  });

  it('names the opening date before the window opens', () => {
    eventState.data = { ...OPEN_EVENT, registration_open_date: '2099-08-05T00:00:00Z' };
    render(<RegisterPage />);
    expect(screen.getByText(/registration opens on/i)).toBeInTheDocument();
  });

  it('says registration has closed after the window', () => {
    eventState.data = { ...OPEN_EVENT, registration_close_date: '2000-01-01T00:00:00Z' };
    render(<RegisterPage />);
    expect(screen.getByText(/registration has closed/i)).toBeInTheDocument();
  });

  it('renders a phone field and a submit button when open', () => {
    render(<RegisterPage />);
    expect(screen.getByLabelText(/phone/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /register/i })).toBeInTheDocument();
  });

  it('renders the organizer custom fields', () => {
    formState.data = {
      is_enabled: true,
      sections: [
        {
          id: 's1',
          title: 'About you',
          display_order: 0,
          fields: [
            {
              id: 'f1',
              field_key: 'why_join',
              field_label: 'Why do you want to join?',
              field_type: 'text',
              is_required: true,
              display_order: 0,
              options: null,
              condition: null,
            },
          ],
        },
      ],
    };
    render(<RegisterPage />);
    expect(screen.getByText('About you')).toBeInTheDocument();
    expect(screen.getByText(/why do you want to join\?/i)).toBeInTheDocument();
  });

  it('shows the existing registration read-only instead of the form', () => {
    myRegState.data = {
      id: 'reg-1',
      created_at: '2026-07-29T00:00:00Z',
      custom_fields: { why_join: 'Content creation' },
    };
    render(<RegisterPage />);
    expect(screen.getByText(/you're registered|you are registered/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^register$/i })).not.toBeInTheDocument();
  });

  it('posts the phone and custom answers, then confirms', async () => {
    render(<RegisterPage />);
    fireEvent.change(screen.getByLabelText(/phone/i), { target: { value: '9876543210' } });
    fireEvent.click(screen.getByRole('button', { name: /register/i }));

    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    const [url, init] = (global.fetch as unknown as { mock: { calls: [string, RequestInit][] } })
      .mock.calls[0];
    expect(url).toBe('/api/events/ev-1/register');
    expect(JSON.parse(init.body as string).phone).toBe('9876543210');
  });

  it('surfaces the server error message verbatim', async () => {
    global.fetch = vi.fn(async () => ({
      ok: false,
      status: 422,
      json: async () => ({ error: '"Why do you want to join?" is required' }),
    })) as unknown as typeof fetch;

    render(<RegisterPage />);
    fireEvent.change(screen.getByLabelText(/phone/i), { target: { value: '9876543210' } });
    fireEvent.click(screen.getByRole('button', { name: /register/i }));

    expect(
      await screen.findByText(/"Why do you want to join\?" is required/)
    ).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run __tests__/events/event-register-page.test.tsx`
Expected: FAIL — neither the page nor `use-my-event-registration` exists.

- [ ] **Step 3: Write the "my registration" hook**

Create `hooks/events/use-my-event-registration.ts`:

```ts
// hooks/events/use-my-event-registration.ts
// The CURRENT user's registration for one event, or null.
//
// Needs no new RLS policy: events_reg_self_read already grants
// (profile_id = auth.uid()), so this reads with the ordinary browser client.

'use client';

import { useQuery } from '@tanstack/react-query';
import { createClientSupabaseClient } from '@/lib/supabase/client';

export interface MyEventRegistration {
  id: string;
  created_at: string | null;
  participant_phone: string | null;
  custom_fields: Record<string, unknown> | null;
}

export function useMyEventRegistration(eventId: string, profileId?: string | null) {
  return useQuery({
    queryKey: ['my-event-registration', eventId, profileId],
    enabled: !!eventId && !!profileId,
    queryFn: async (): Promise<MyEventRegistration | null> => {
      const supabase = createClientSupabaseClient();
      const { data, error } = await (supabase as any)
        .from('events_registrations')
        .select('id, created_at, participant_phone, custom_fields')
        .eq('event_id', eventId)
        .eq('profile_id', profileId)
        .neq('status', 'cancelled')
        .maybeSingle();
      if (error) throw error;
      return (data as MyEventRegistration) ?? null;
    },
  });
}
```

- [ ] **Step 4: Write the page**

Create `app/(routes)/events/[id]/register/page.tsx`:

```tsx
'use client';

// app/(routes)/events/[id]/register/page.tsx
// The page an organizer's shared link points at. INSIDE the auth group on
// purpose: registration for a general event is JKKN-internal, so identity comes
// from the session and is never typed in. That removes everything the public
// tournament form needs for guests — no name/institution inputs, no access
// code, no divisions, no payment.
//
// The window decision comes from the same pure helper the API route uses, so
// the message here and the server's verdict cannot disagree. The server still
// re-checks: this page is convenience, not security.

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { CheckCircle2, Loader2, LogIn } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { useGeneralEvent } from '@/hooks/events/use-general-events';
import { useRegistrationForm } from '@/hooks/events/use-tournament-registration-form';
import { useMyEventRegistration } from '@/hooks/events/use-my-event-registration';
import { checkRegistrationWindow } from '@/lib/services/events/shared/event-registration-window';
import { DynamicFieldInput, isFieldVisible } from '@/components/events/dynamic-field-input';
import type { EventRegistrationFormField } from '@/types/tournament';

/** Centred single-message card — every closed/blocked state uses this. */
function Notice({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <Card className="mx-auto mt-8 max-w-lg">
      <CardContent className="space-y-2 py-12 text-center">
        <p className="text-base font-medium">{title}</p>
        {children}
      </CardContent>
    </Card>
  );
}

export default function EventRegisterPage() {
  const params = useParams();
  const eventId = String(params?.id ?? '');

  const { profile, isLoading: authLoading } = useAuth();
  const { data: event, isLoading: eventLoading } = useGeneralEvent(eventId);
  const { data: form } = useRegistrationForm(eventId);
  const { data: mine, isLoading: mineLoading, refetch } = useMyEventRegistration(
    eventId,
    profile?.id
  );

  const [phone, setPhone] = useState('');
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const sections = useMemo(
    () => (form?.is_enabled === false ? [] : form?.sections ?? []),
    [form]
  );

  if (authLoading || eventLoading || mineLoading) {
    return (
      <ContentLayout title="Register">
        <Skeleton className="mx-auto mt-8 h-64 w-full max-w-lg" />
      </ContentLayout>
    );
  }

  if (!profile) {
    return (
      <ContentLayout title="Register">
        <Notice title="Sign in with your JKKN account to register">
          <Button asChild className="mt-2 gap-1.5">
            <Link href={`/login?redirect=/events/${eventId}/register`}>
              <LogIn className="h-4 w-4" />
              Sign in
            </Link>
          </Button>
        </Notice>
      </ContentLayout>
    );
  }

  if (!event) {
    return (
      <ContentLayout title="Register">
        <Notice title="This event could not be found." />
      </ContentLayout>
    );
  }

  const windowState = checkRegistrationWindow(event);
  if (!windowState.open) {
    return (
      <ContentLayout title={event.name}>
        <Notice title={windowState.message} />
      </ContentLayout>
    );
  }

  // Already registered (or just now registered) → the receipt, not the form.
  if (mine || done) {
    const answers = (mine?.custom_fields ?? {}) as Record<string, unknown>;
    const labelFor = (key: string) =>
      sections
        .flatMap((s) => s.fields ?? [])
        .find((f) => f.field_key === key)?.field_label ?? key;

    return (
      <ContentLayout title={event.name}>
        <Card className="mx-auto mt-8 max-w-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              You&apos;re registered
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {event.name}
              {mine?.created_at &&
                ` · ${new Date(mine.created_at).toLocaleDateString('en-IN', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                })}`}
            </p>
            {Object.keys(answers).length > 0 && (
              <dl className="space-y-2 border-t pt-3 text-sm">
                {Object.entries(answers).map(([key, value]) => (
                  <div key={key}>
                    <dt className="text-xs text-muted-foreground">{labelFor(key)}</dt>
                    <dd>{Array.isArray(value) ? value.join(', ') : String(value ?? '—')}</dd>
                  </div>
                ))}
              </dl>
            )}
          </CardContent>
        </Card>
      </ContentLayout>
    );
  }

  const submit = async () => {
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch(`/api/events/${eventId}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, custom_fields: values }),
      });
      const json = await res.json();
      if (!res.ok) {
        // Show the server's own wording — it names the offending field.
        setError(json.error ?? 'Could not save your registration.');
        return;
      }
      setDone(true);
      refetch();
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ContentLayout title={event.name}>
      <Card className="mx-auto mt-6 max-w-lg">
        <CardHeader>
          <CardTitle className="text-base">Register for {event.name}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Identity — read-only. Already known; never asked twice. */}
          <div className="rounded-lg border bg-muted/40 p-3">
            <p className="mb-1 text-xs font-medium text-muted-foreground">Registering as</p>
            <p className="text-sm font-medium">{profile.full_name ?? profile.email}</p>
            <p className="text-xs text-muted-foreground">{profile.email}</p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="phone">
              Phone <span className="text-destructive">*</span>
            </Label>
            <Input
              id="phone"
              inputMode="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="10-digit mobile number"
            />
          </div>

          {sections.map((section) => (
            <div key={section.id} className="space-y-3 border-t pt-4">
              <p className="text-sm font-semibold">{section.title}</p>
              {(section.fields ?? [])
                .filter((f: EventRegistrationFormField) => isFieldVisible(f, values))
                .map((field: EventRegistrationFormField) => (
                  <DynamicFieldInput
                    key={field.id}
                    field={field}
                    value={values[field.field_key]}
                    onChange={(v) => setValues((prev) => ({ ...prev, [field.field_key]: v }))}
                  />
                ))}
            </div>
          ))}

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button onClick={submit} disabled={submitting} className="w-full">
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Register
          </Button>
        </CardContent>
      </Card>
    </ContentLayout>
  );
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run __tests__/events/event-register-page.test.tsx`
Expected: PASS, 10 tests.

- [ ] **Step 6: Run the whole events suite**

Run: `npx vitest run __tests__/events/`
Expected: PASS — every file, including the 43 pre-existing tournament tests.

- [ ] **Step 7: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors in any file this plan created or modified. Pre-existing errors elsewhere are not yours to fix.

- [ ] **Step 8: Commit**

```bash
git add "app/(routes)/events/[id]/register/page.tsx" \
        hooks/events/use-my-event-registration.ts \
        __tests__/events/event-register-page.test.tsx
git commit -m "feat(events): internal registration form for general events

Identity comes from the session, so the form asks only for a phone number and
the organizer's own questions. Reuses DynamicFieldInput, so what the organizer
designed and what a registrant sees cannot drift. Reading one's own
registration needs no new policy — events_reg_self_read already covers it."
```

---

## Manual verification for "JKKN School of Influencer"

After Task 7, verify against the real event `84a49ec4-8fc8-44f9-a6a1-e84df5330f07`:

- [ ] `/events` → the event name in **General Events** is now a link
- [ ] Click it → the detail page loads with Registration Form card + Event Logistics
- [ ] **Manage registration form** → add a section and a field → **Save** → toast confirms
- [ ] Set `registration_open_date`/`registration_close_date` and move `status` from `draft` to `planning`
- [ ] **Copy registration link** → open it in a second browser as a different JKKN user
- [ ] Submit → confirmation appears
- [ ] Reload that link → the read-only "You're registered" panel appears, not the form
- [ ] Back on the detail page → **Event Logistics → Registrations** lists the registrant with the custom answers under their proper labels

If the last step shows answers under raw slug keys instead of labels, the route wrote to `custom_data` instead of `custom_fields` — re-check Task 6.

## Notes for the implementer

- **Do not touch any file under `app/(routes)/events/tournament/`** beyond the two documented one-line changes (the editor's `backHref` prop in Task 4, the card's `href` prop in Task 3). That subtree carries 43 passing tests.
- **Do not "fix" the pre-existing issues** this plan's spec records as follow-ups: the `bib_number` global-unique collision, `EventBulkRegisterService` writing `participant_type: 'external'` for JKKN people, or the breadth of `events_reg_institution_read`. Each deserves its own change with its own review.
- If a test fails, fix the code, not the assertion. The assertions encode decisions from the spec.
