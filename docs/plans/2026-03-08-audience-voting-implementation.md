# Audience Live Voting — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a live 1–5 star audience voting system for Demo Day, with a dedicated `/vote` page, real-time count updates via Supabase Realtime, and admin Open/Close controls on the Demo Day management page.

**Architecture:** New `audience_votes` table (upsert on submission+voter unique key) + `audience_vote_summary` view for fast aggregation. Admin controls `voting_opened_at`/`voting_closed_at` on `startup_events`. Supabase Realtime pushes live updates to all connected clients by invalidating React Query cache on `postgres_changes` events — same pattern as `hooks/admission/use-chat-realtime.ts`.

**Tech Stack:** Next.js 16 App Router, Supabase (postgres_changes Realtime), React Query (`useQuery`, `useMutation`, `useQueryClient`), shadcn/ui (`Card`, `Badge`, `Button`, `AlertDialog`), Lucide icons, Sonner toasts.

---

## Codebase Context (read before starting)

- Pattern file for Realtime: `hooks/admission/use-chat-realtime.ts`
- Pattern file for service: `lib/services/startup-studio/appathon-verification-service.ts`
- Pattern file for hooks: `hooks/startup-studio/use-appathon-verifications.ts`
- Demo-day page (to modify): `app/(routes)/startup-studio/events/[id]/demo-day/page.tsx`
  - Has "Demo Day Controls" Card with Freeze Metrics and Publish Results — add Voting control in same card
  - Uses `AlertDialog` for confirmation before irreversible actions
- Evaluate table (to modify): `app/(routes)/startup-studio/events/[id]/evaluate/_components/verification-table.tsx`
- Sidebar menu (to modify): `lib/sidebarMenuLink.ts`
  - MENU_PERMISSIONS map at line ~400: maps route patterns → permission key
  - Sidebar submenus built in `GetRoleBasedPages` function, evaluator/faculty/hod/principal role special-cases start at ~line 1679
- Types: `types/startup-studio.ts` — `StartupEvent` interface at line ~26 (add 2 fields)
- SQL files: `supabase/setup/01_tables.sql`, `supabase/setup/03_policies.sql`, `supabase/setup/05_views.sql`

---

## Task 1: Database — SQL changes

**Files:**
- Modify: `supabase/setup/01_tables.sql`
- Modify: `supabase/setup/03_policies.sql`
- Modify: `supabase/setup/05_views.sql`
- Execute SQL via Supabase MCP

### Step 1: Add to `01_tables.sql`

Find the section for startup_events and add after the existing table definition. Add a comment block then the SQL:

```sql
-- ── Audience Votes (Demo Day live voting) ─────────────────────────────────────
-- Updated: 2026-03-08 - Added audience_votes table for Demo Day live voting
CREATE TABLE IF NOT EXISTS audience_votes (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id         UUID NOT NULL REFERENCES startup_events(id) ON DELETE CASCADE,
  submission_id    UUID NOT NULL REFERENCES event_submissions(id) ON DELETE CASCADE,
  voter_profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  rating           INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  voted_at         TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(submission_id, voter_profile_id)
);

CREATE INDEX IF NOT EXISTS idx_audience_votes_event      ON audience_votes(event_id);
CREATE INDEX IF NOT EXISTS idx_audience_votes_submission ON audience_votes(submission_id);
CREATE INDEX IF NOT EXISTS idx_audience_votes_voter      ON audience_votes(voter_profile_id);
```

Also add voting columns to `startup_events` block:

```sql
-- Updated: 2026-03-08 - Added voting_opened_at, voting_closed_at for Demo Day live voting
-- (Add these ALTER TABLE statements at the end of the startup_events section, or inline if the table is fresh)
ALTER TABLE startup_events
  ADD COLUMN IF NOT EXISTS voting_opened_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS voting_closed_at TIMESTAMPTZ;
```

### Step 2: Add to `03_policies.sql`

```sql
-- ── Audience Votes Policies ───────────────────────────────────────────────────
ALTER TABLE audience_votes ENABLE ROW LEVEL SECURITY;

-- Any authenticated user can read vote summaries
CREATE POLICY "audience_votes_select"
  ON audience_votes FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Users can only insert their own vote
CREATE POLICY "audience_votes_insert"
  ON audience_votes FOR INSERT
  WITH CHECK (auth.uid() = voter_profile_id);

-- Users can only update their own vote
CREATE POLICY "audience_votes_update"
  ON audience_votes FOR UPDATE
  USING (auth.uid() = voter_profile_id)
  WITH CHECK (auth.uid() = voter_profile_id);
```

### Step 3: Add to `05_views.sql`

```sql
-- ── Audience Vote Summary (per submission aggregates) ─────────────────────────
-- Updated: 2026-03-08 - Added for Demo Day live voting
CREATE OR REPLACE VIEW audience_vote_summary AS
SELECT
  av.submission_id,
  av.event_id,
  COUNT(*)                          AS total_votes,
  ROUND(AVG(av.rating)::numeric, 1) AS average_rating
FROM audience_votes av
GROUP BY av.submission_id, av.event_id;
```

### Step 4: Execute all SQL via Supabase MCP

Run each block via `mcp__supabase__execute_sql` in this order:
1. `CREATE TABLE IF NOT EXISTS audience_votes ...` + indexes
2. `ALTER TABLE startup_events ADD COLUMN IF NOT EXISTS voting_opened_at ...`
3. `ALTER TABLE audience_votes ENABLE ROW LEVEL SECURITY` + 3 policies
4. `CREATE OR REPLACE VIEW audience_vote_summary ...`

Verify each returns `[]` (no error).

### Step 5: Verify

```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'startup_events'
  AND column_name IN ('voting_opened_at', 'voting_closed_at');
```
Expected: 2 rows returned.

```sql
SELECT table_name FROM information_schema.tables WHERE table_name = 'audience_votes';
```
Expected: 1 row.

### Step 6: Commit

```bash
git add supabase/setup/01_tables.sql supabase/setup/03_policies.sql supabase/setup/05_views.sql
git commit -m "feat(db): add audience_votes table, voting controls, and vote summary view"
```

---

## Task 2: TypeScript Types

**Files:**
- Modify: `types/startup-studio.ts`

### Step 1: Add `voting_opened_at` and `voting_closed_at` to `StartupEvent` interface

Find the `StartupEvent` interface (around line 26). After `metrics_frozen_at` and `results_published_at`, add:

```typescript
  voting_opened_at: string | null;   // ISO timestamp when admin opened audience voting
  voting_closed_at: string | null;   // ISO timestamp when admin closed audience voting
```

Full context (find this block and insert after `results_published_at`):
```typescript
  metrics_frozen_at: string | null;      // ISO timestamp when admin froze metrics
  results_published_at: string | null;   // ISO timestamp when results were published
  // ADD AFTER:
  voting_opened_at: string | null;       // ISO timestamp when admin opened audience voting
  voting_closed_at: string | null;       // ISO timestamp when admin closed audience voting
```

### Step 2: Add new types at end of file

Append to `types/startup-studio.ts`:

```typescript
// ── Audience Voting ──────────────────────────────────────────────────────────

export interface AudienceVote {
  id: string;
  event_id: string;
  submission_id: string;
  voter_profile_id: string;
  rating: number;        // 1–5
  voted_at: string;
  updated_at: string;
}

export interface VoteSummary {
  submission_id: string;
  event_id: string;
  total_votes: number;
  average_rating: number;  // e.g. 4.2
}
```

### Step 3: Verify TypeScript compiles

```bash
npx tsc --noEmit 2>&1 | head -20
```
Expected: 0 errors.

### Step 4: Commit

```bash
git add types/startup-studio.ts
git commit -m "feat(types): add AudienceVote, VoteSummary types and voting fields to StartupEvent"
```

---

## Task 3: Audience Vote Service

**Files:**
- Create: `lib/services/startup-studio/audience-vote-service.ts`

### Step 1: Create the service file

```typescript
// lib/services/startup-studio/audience-vote-service.ts
import { createClientSupabaseClient } from '@/lib/supabase/client'
import type { AudienceVote, VoteSummary } from '@/types/startup-studio'

export class AudienceVoteService {
  // ─── Get all vote summaries for an event ─────────────────────────────────
  static async getVoteSummaries(eventId: string): Promise<VoteSummary[]> {
    const supabase = createClientSupabaseClient() as any
    const { data, error } = await supabase
      .from('audience_vote_summary')
      .select('*')
      .eq('event_id', eventId)
    if (error) throw error
    return (data ?? []) as VoteSummary[]
  }

  // ─── Get current user's votes for an event ───────────────────────────────
  static async getMyVotes(eventId: string, profileId: string): Promise<AudienceVote[]> {
    const supabase = createClientSupabaseClient() as any
    const { data, error } = await supabase
      .from('audience_votes')
      .select('*')
      .eq('event_id', eventId)
      .eq('voter_profile_id', profileId)
    if (error) throw error
    return (data ?? []) as AudienceVote[]
  }

  // ─── Cast or update a vote (upsert) ──────────────────────────────────────
  static async castVote(params: {
    eventId: string
    submissionId: string
    voterProfileId: string
    rating: number
  }): Promise<AudienceVote> {
    const supabase = createClientSupabaseClient() as any
    const payload = {
      event_id: params.eventId,
      submission_id: params.submissionId,
      voter_profile_id: params.voterProfileId,
      rating: params.rating,
      updated_at: new Date().toISOString(),
    }
    const { data, error } = await supabase
      .from('audience_votes')
      .upsert(payload, { onConflict: 'submission_id,voter_profile_id' })
      .select()
      .single()
    if (error) throw error
    return data as AudienceVote
  }

  // ─── Admin: Open voting ───────────────────────────────────────────────────
  static async openVoting(eventId: string): Promise<void> {
    const supabase = createClientSupabaseClient() as any
    const { error } = await supabase
      .from('startup_events')
      .update({ voting_opened_at: new Date().toISOString(), voting_closed_at: null })
      .eq('id', eventId)
    if (error) throw error
  }

  // ─── Admin: Close voting ──────────────────────────────────────────────────
  static async closeVoting(eventId: string): Promise<void> {
    const supabase = createClientSupabaseClient() as any
    const { error } = await supabase
      .from('startup_events')
      .update({ voting_closed_at: new Date().toISOString() })
      .eq('id', eventId)
    if (error) throw error
  }
}
```

### Step 2: Verify TypeScript compiles

```bash
npx tsc --noEmit 2>&1 | head -20
```
Expected: 0 errors.

### Step 3: Commit

```bash
git add lib/services/startup-studio/audience-vote-service.ts
git commit -m "feat(service): add AudienceVoteService with cast, summaries, open/close voting"
```

---

## Task 4: React Query Hooks + Realtime

**Files:**
- Create: `hooks/startup-studio/use-audience-votes.ts`

### Step 1: Create the hooks file

```typescript
// hooks/startup-studio/use-audience-votes.ts
'use client'

import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { createClientSupabaseClient } from '@/lib/supabase/client'
import { AudienceVoteService } from '@/lib/services/startup-studio/audience-vote-service'

// ─── Query Keys ──────────────────────────────────────────────────────────────
export const voteKeys = {
  summaries: (eventId: string) => ['vote-summaries', eventId] as const,
  myVotes: (eventId: string, profileId: string) =>
    ['my-votes', eventId, profileId] as const,
}

// ─── Get all vote summaries for an event ─────────────────────────────────────
export function useVoteSummaries(eventId: string) {
  return useQuery({
    queryKey: voteKeys.summaries(eventId),
    queryFn: () => AudienceVoteService.getVoteSummaries(eventId),
    staleTime: 10_000,
    enabled: !!eventId,
  })
}

// ─── Get current user's votes for an event ───────────────────────────────────
export function useMyVotes(eventId: string, profileId: string) {
  return useQuery({
    queryKey: voteKeys.myVotes(eventId, profileId),
    queryFn: () => AudienceVoteService.getMyVotes(eventId, profileId),
    staleTime: 30_000,
    enabled: !!eventId && !!profileId,
  })
}

// ─── Cast or update a vote ────────────────────────────────────────────────────
export function useCastVote(eventId: string, profileId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (params: { submissionId: string; rating: number }) =>
      AudienceVoteService.castVote({
        eventId,
        submissionId: params.submissionId,
        voterProfileId: profileId,
        rating: params.rating,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: voteKeys.summaries(eventId) })
      qc.invalidateQueries({ queryKey: voteKeys.myVotes(eventId, profileId) })
    },
    onError: () => toast.error('Failed to save vote'),
  })
}

// ─── Admin: Open voting ───────────────────────────────────────────────────────
export function useOpenVoting(eventId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => AudienceVoteService.openVoting(eventId),
    onSuccess: () => {
      toast.success('Audience voting is now open!')
      qc.invalidateQueries({ queryKey: ['startup-event', eventId] })
      qc.invalidateQueries({ queryKey: ['startup-events'] })
    },
    onError: () => toast.error('Failed to open voting'),
  })
}

// ─── Admin: Close voting ──────────────────────────────────────────────────────
export function useCloseVoting(eventId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => AudienceVoteService.closeVoting(eventId),
    onSuccess: () => {
      toast.success('Audience voting has been closed.')
      qc.invalidateQueries({ queryKey: ['startup-event', eventId] })
      qc.invalidateQueries({ queryKey: ['startup-events'] })
    },
    onError: () => toast.error('Failed to close voting'),
  })
}

// ─── Realtime subscription — updates vote summaries live ─────────────────────
// Use this hook on pages that need live vote counts (vote page + evaluate page).
// Pattern matches hooks/admission/use-chat-realtime.ts
export function useAudienceVotesRealtime(eventId: string) {
  const qc = useQueryClient()

  useEffect(() => {
    if (!eventId) return

    const supabase = createClientSupabaseClient()
    const channel = supabase
      .channel(`audience_votes:${eventId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'audience_votes',
          filter: `event_id=eq.${eventId}`,
        },
        () => {
          qc.invalidateQueries({ queryKey: voteKeys.summaries(eventId) })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [eventId, qc])
}
```

### Step 2: Verify TypeScript compiles

```bash
npx tsc --noEmit 2>&1 | head -20
```
Expected: 0 errors.

### Step 3: Commit

```bash
git add hooks/startup-studio/use-audience-votes.ts
git commit -m "feat(hooks): add useVoteSummaries, useMyVotes, useCastVote, useOpenVoting, useCloseVoting, useAudienceVotesRealtime"
```

---

## Task 5: TeamVoteCard Component

**Files:**
- Create: `app/(routes)/startup-studio/events/[id]/vote/_components/team-vote-card.tsx`

### Step 1: Create the directory and component

```typescript
// app/(routes)/startup-studio/events/[id]/vote/_components/team-vote-card.tsx
'use client'

import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Star } from 'lucide-react'
import { cn } from '@/lib/utils'

interface TeamVoteCardProps {
  teamName: string
  appName: string | null
  institutionName: string
  demoSlot: number | null
  slotIndex: number           // fallback if demoSlot is null
  totalVotes: number
  averageRating: number       // e.g. 4.2
  myRating: number            // 0 = not voted
  onVote: (rating: number) => void
  isSubmitting: boolean
  votingOpen: boolean
}

export function TeamVoteCard({
  teamName,
  appName,
  institutionName,
  demoSlot,
  slotIndex,
  totalVotes,
  averageRating,
  myRating,
  onVote,
  isSubmitting,
  votingOpen,
}: TeamVoteCardProps) {
  const [hovered, setHovered] = useState(0)

  const displaySlot = demoSlot ?? slotIndex

  return (
    <Card className={cn(
      'transition-colors',
      myRating > 0 && 'border-primary/40 bg-primary/5'
    )}>
      <CardContent className="pt-4 pb-4 space-y-3">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-muted-foreground">
                #{displaySlot}
              </span>
              <p className="font-semibold text-sm leading-tight">{teamName}</p>
            </div>
            {appName && (
              <p className="text-xs text-muted-foreground mt-0.5">{appName}</p>
            )}
            <p className="text-xs text-muted-foreground">{institutionName}</p>
          </div>

          {/* Live vote count */}
          <div className="text-right shrink-0">
            <div className="flex items-center gap-1 justify-end">
              <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
              <span className="text-sm font-bold tabular-nums">
                {totalVotes > 0 ? averageRating.toFixed(1) : '—'}
              </span>
            </div>
            <p className="text-xs text-muted-foreground tabular-nums">
              {totalVotes} {totalVotes === 1 ? 'vote' : 'votes'}
            </p>
          </div>
        </div>

        {/* Star rating input */}
        <div className="flex items-center gap-1">
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              type="button"
              disabled={!votingOpen || isSubmitting}
              onClick={() => onVote(star)}
              onMouseEnter={() => setHovered(star)}
              onMouseLeave={() => setHovered(0)}
              className={cn(
                'p-0.5 rounded transition-transform',
                votingOpen && !isSubmitting
                  ? 'hover:scale-110 cursor-pointer'
                  : 'cursor-not-allowed opacity-50'
              )}
              aria-label={`Rate ${star} star${star !== 1 ? 's' : ''}`}
            >
              <Star
                className={cn(
                  'h-6 w-6 transition-colors',
                  (hovered || myRating) >= star
                    ? 'fill-amber-400 text-amber-400'
                    : 'fill-muted text-muted-foreground/40'
                )}
              />
            </button>
          ))}
          {myRating > 0 && (
            <Badge variant="secondary" className="ml-2 text-xs">
              Your vote: {myRating}★
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
```

### Step 2: Verify TypeScript compiles

```bash
npx tsc --noEmit 2>&1 | head -20
```

### Step 3: Commit

```bash
git add "app/(routes)/startup-studio/events/[id]/vote/_components/team-vote-card.tsx"
git commit -m "feat(ui): add TeamVoteCard component with star rating input and live vote display"
```

---

## Task 6: Vote Page

**Files:**
- Create: `app/(routes)/startup-studio/events/[id]/vote/page.tsx`

### Step 1: Create the page

```typescript
// app/(routes)/startup-studio/events/[id]/vote/page.tsx
'use client'

import { use } from 'react'
import Link from 'next/link'
import { ArrowLeft, Loader2, VoteIcon } from 'lucide-react'
import { ContentLayout } from '@/components/layout/content-layout'
import { PageBreadcrumb } from '@/components/navigation'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { useAuth } from '@/hooks/use-auth'
import { useEvent } from '@/hooks/startup-studio/use-events'
import { useEventSubmissions } from '@/hooks/startup-studio/use-event-submissions'
import {
  useVoteSummaries,
  useMyVotes,
  useCastVote,
  useAudienceVotesRealtime,
} from '@/hooks/startup-studio/use-audience-votes'
import { TeamVoteCard } from './_components/team-vote-card'

export default function VotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { profile } = useAuth()
  const profileId = profile?.id ?? ''

  const { data: event, isLoading: eventLoading } = useEvent(id)
  const { data: submissions = [], isLoading: subsLoading } = useEventSubmissions(id)
  const { data: summaries = [] } = useVoteSummaries(id)
  const { data: myVotes = [] } = useMyVotes(id, profileId)
  const { mutate: castVote, isPending } = useCastVote(id, profileId)

  // Subscribe to live vote updates
  useAudienceVotesRealtime(id)

  const isLoading = eventLoading || subsLoading

  // Determine voting window state
  const votingOpen =
    !!event?.voting_opened_at && !event?.voting_closed_at

  // Build lookup maps
  const summaryMap = new Map(summaries.map(s => [s.submission_id, s]))
  const myVoteMap = new Map(myVotes.map(v => [v.submission_id, v.rating]))

  if (isLoading) {
    return (
      <ContentLayout title="Live Voting">
        <div className="flex justify-center items-center p-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </ContentLayout>
    )
  }

  if (!votingOpen) {
    return (
      <ContentLayout title="Live Voting">
        <div className="mx-auto p-6 text-center space-y-4 pt-12 max-w-sm">
          <VoteIcon className="h-12 w-12 text-muted-foreground mx-auto" />
          <h2 className="text-lg font-semibold">
            {!event?.voting_opened_at
              ? 'Voting Not Open Yet'
              : 'Voting Has Closed'}
          </h2>
          <p className="text-sm text-muted-foreground">
            {!event?.voting_opened_at
              ? 'The admin will open audience voting when presentations begin.'
              : 'Thank you for voting! Results will be announced shortly.'}
          </p>
          <Link href={`/startup-studio/events/${id}`}>
            <Button variant="outline" className="gap-1.5">
              <ArrowLeft className="h-4 w-4" /> Back to Event
            </Button>
          </Link>
        </div>
      </ContentLayout>
    )
  }

  // Filter submissions with an app (only teams that submitted)
  const votableTeams = submissions.filter(s => s.app_name || s.live_app_url)

  return (
    <ContentLayout title="Live Voting">
      <PageBreadcrumb items={[
        { label: 'Home', href: '/' },
        { label: 'Startup Studio', href: '/startup-studio/events' },
        { label: event?.name ?? 'Event', href: `/startup-studio/events/${id}` },
        { label: 'Live Voting' },
      ]} />

      <div className="space-y-4 mt-4 pb-10">
        <div className="flex items-center gap-3">
          <Link href={`/startup-studio/events/${id}`}>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-lg font-bold flex items-center gap-2">
              <VoteIcon className="h-5 w-5 text-primary" />
              Live Audience Voting
            </h1>
            <p className="text-xs text-muted-foreground">{event?.name}</p>
          </div>
        </div>

        <Alert className="border-green-500 bg-green-50 dark:bg-green-950/20">
          <AlertDescription className="text-green-700 dark:text-green-400 text-sm">
            Voting is open! Rate each team 1–5 stars. You can update your rating anytime.
          </AlertDescription>
        </Alert>

        {votableTeams.length === 0 ? (
          <div className="text-center py-12 text-sm text-muted-foreground">
            No team submissions found for this event.
          </div>
        ) : (
          <div className="space-y-3">
            {votableTeams.map((sub, index) => {
              const summary = summaryMap.get(sub.id)
              const myRating = myVoteMap.get(sub.id) ?? 0
              return (
                <TeamVoteCard
                  key={sub.id}
                  teamName={(sub as any).event_registrations?.team_name ?? 'Team'}
                  appName={sub.app_name}
                  institutionName={(sub as any).event_registrations?.institutions?.name ?? ''}
                  demoSlot={null}
                  slotIndex={index + 1}
                  totalVotes={summary?.total_votes ?? 0}
                  averageRating={summary?.average_rating ?? 0}
                  myRating={myRating}
                  onVote={(rating) =>
                    castVote({ submissionId: sub.id, rating })
                  }
                  isSubmitting={isPending}
                  votingOpen={votingOpen}
                />
              )
            })}
          </div>
        )}
      </div>
    </ContentLayout>
  )
}
```

**Note on `useEventSubmissions`:** Check `hooks/startup-studio/use-event-submissions.ts` to confirm the correct hook signature. The hook likely takes `eventId` and returns submissions. If the type doesn't include nested `event_registrations`, check the service's select query and adjust the type cast accordingly.

### Step 2: Check `useEventSubmissions` hook signature

```bash
grep -n "export function useEventSubmissions" hooks/startup-studio/use-event-submissions.ts
```

Read the hook to confirm what data shape it returns and adjust the `(sub as any).event_registrations?.team_name` cast if needed.

### Step 3: Verify TypeScript compiles

```bash
npx tsc --noEmit 2>&1 | head -30
```

### Step 4: Commit

```bash
git add "app/(routes)/startup-studio/events/[id]/vote/"
git commit -m "feat(vote): add live audience voting page with real-time star rating"
```

---

## Task 7: Demo-Day Page — Open/Close Voting Controls

**Files:**
- Modify: `app/(routes)/startup-studio/events/[id]/demo-day/page.tsx`

### Step 1: Add imports

At the top of the file, add to the existing imports:
```typescript
import { Vote } from 'lucide-react'  // add to existing lucide-react import line
import { useOpenVoting, useCloseVoting } from '@/hooks/startup-studio/use-audience-votes'
```

### Step 2: Add hook calls inside the component

After the existing hook calls (after `useEvaluatorProgress`), add:
```typescript
const openVoting = useOpenVoting(id)
const closeVoting = useCloseVoting(id)
```

### Step 3: Add Voting Control card row

Inside the "Demo Day Controls" `<CardContent>` (which already has Freeze Metrics and Publish Results rows), add a third row after Publish Results:

```tsx
{/* Audience Voting */}
<div className="flex items-center justify-between p-3 rounded-lg border">
  <div>
    <p className="text-sm font-medium">Audience Voting</p>
    <p className="text-xs text-muted-foreground">
      {event?.voting_closed_at
        ? `Closed at ${new Date(event.voting_closed_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`
        : event?.voting_opened_at
        ? `Opened at ${new Date(event.voting_opened_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`
        : 'Let the audience rate teams live during presentations.'}
    </p>
  </div>
  {event?.voting_closed_at ? (
    <Badge variant="secondary" className="gap-1">
      <Vote className="h-3 w-3" /> Closed
    </Badge>
  ) : event?.voting_opened_at ? (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button size="sm" variant="outline" className="gap-1.5 text-red-600 border-red-400 hover:bg-red-50" disabled={closeVoting.isPending}>
          <Vote className="h-3.5 w-3.5" /> Close Voting
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Close Audience Voting?</AlertDialogTitle>
          <AlertDialogDescription>
            No new votes can be cast after closing. This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction className="bg-destructive" onClick={() => closeVoting.mutate()}>
            Close Now
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  ) : (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button size="sm" variant="outline" className="gap-1.5" disabled={openVoting.isPending}>
          <Vote className="h-3.5 w-3.5" /> Open Voting
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Open Audience Voting?</AlertDialogTitle>
          <AlertDialogDescription>
            All authenticated users will be able to cast star ratings for each team.
            Share the link: <code className="text-xs bg-muted px-1 rounded">/startup-studio/events/{id}/vote</code>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={() => openVoting.mutate()}>
            Open Now
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )}
</div>
```

### Step 4: Verify TypeScript compiles

```bash
npx tsc --noEmit 2>&1 | head -20
```

### Step 5: Commit

```bash
git add "app/(routes)/startup-studio/events/[id]/demo-day/page.tsx"
git commit -m "feat(demo-day): add Open/Close audience voting controls to Demo Day management page"
```

---

## Task 8: Evaluate Table — Add Votes and Avg Columns

**Files:**
- Modify: `app/(routes)/startup-studio/events/[id]/evaluate/_components/verification-table.tsx`
- Modify: `app/(routes)/startup-studio/events/[id]/evaluate/page.tsx`

### Step 1: Add vote props to `VerificationTable`

In `verification-table.tsx`, add to the `VerificationTableProps` interface:
```typescript
voteSummaryMap: Map<string, { total_votes: number; average_rating: number }>
```

### Step 2: Add two columns to `TableHeader`

After the existing Status column header, before the Action column:
```tsx
<TableHead className="text-center hidden lg:table-cell">Votes</TableHead>
<TableHead className="text-center hidden lg:table-cell">Avg ★</TableHead>
```

### Step 3: Add two cells per row

In the `TableRow` map, after the Status cell:
```tsx
<TableCell className="text-center text-sm hidden lg:table-cell tabular-nums">
  {voteSummaryMap.get(team.submission?.id ?? '')?.total_votes ?? 0}
</TableCell>
<TableCell className="text-center text-sm hidden lg:table-cell tabular-nums">
  {(() => {
    const avg = voteSummaryMap.get(team.submission?.id ?? '')?.average_rating
    return avg ? `${avg.toFixed(1)}★` : '—'
  })()}
</TableCell>
```

### Step 4: Update `evaluate/page.tsx` to pass vote data

In `evaluate/page.tsx`:

Add imports:
```typescript
import { useVoteSummaries, useAudienceVotesRealtime } from '@/hooks/startup-studio/use-audience-votes'
```

Add hook call inside the component (after existing hooks):
```typescript
const { data: voteSummaries = [] } = useVoteSummaries(id)
useAudienceVotesRealtime(id)

const voteSummaryMap = new Map(
  voteSummaries.map(s => [s.submission_id, s])
)
```

Pass to `VerificationTable`:
```tsx
<VerificationTable
  teams={tabTeams[tabKey]}
  onVerify={handleVerify}
  isSubmitting={isPending}
  voteSummaryMap={voteSummaryMap}
/>
```

### Step 5: Verify TypeScript compiles

```bash
npx tsc --noEmit 2>&1 | head -20
```

### Step 6: Commit

```bash
git add "app/(routes)/startup-studio/events/[id]/evaluate/_components/verification-table.tsx"
git add "app/(routes)/startup-studio/events/[id]/evaluate/page.tsx"
git commit -m "feat(evaluate): show live audience vote count and average in verification table"
```

---

## Task 9: Sidebar Menu — Add Live Voting Link

**Files:**
- Modify: `lib/sidebarMenuLink.ts`

### Step 1: Add to MENU_PERMISSIONS map

In the `MENU_PERMISSIONS` object (around line 402), add:
```typescript
'/startup-studio/events/[id]/vote': 'startup_studio.events.view',
```

### Step 2: Add submenu entry

In the `GetRoleBasedPages` function, inside the startup studio submenus array (after the `leaderboard` entry and before `checklists`), add:
```typescript
{
  href: `/startup-studio/events/${activeId}/vote`,
  label: 'Live Voting',
  active: pathname.includes('/vote')
},
```

### Step 3: Allow the vote link for all special role groups

In the role-filtering section (around line 1679), find each special-case `if` block and add `/vote` as allowed:

**Evaluator role block** (shows only `/evaluate`):
```typescript
// BEFORE:
if (isEvaluatorRole && submenu.href.includes('/startup-studio/events/')) {
  return submenu.href.includes('/evaluate');
}

// AFTER:
if (isEvaluatorRole && submenu.href.includes('/startup-studio/events/')) {
  return submenu.href.includes('/evaluate') || submenu.href.includes('/vote');
}
```

**Limited staff role block** (faculty/hod/principal):
```typescript
// Find the block that returns true for /venues, /registrations, etc.
// Add:
if (submenu.href.includes('/vote')) return true;
```

### Step 4: Verify TypeScript compiles

```bash
npx tsc --noEmit 2>&1 | head -20
```

### Step 5: Commit

```bash
git add lib/sidebarMenuLink.ts
git commit -m "feat(sidebar): add Live Voting link visible to all roles in Startup Studio"
```

---

## Task 10: Final Push

### Step 1: Full build check

```bash
npx next build 2>&1 | tail -20
```
Expected: exit code 0, no type errors.

### Step 2: Push to GitHub

```bash
git push origin main
```

---

## Testing Checklist

After implementation, manually verify:

- [ ] Super admin opens voting from Demo Day page → badge changes to "Open"
- [ ] Navigate to `/startup-studio/events/[id]/vote` → voting page loads with all teams
- [ ] Cast a star rating → vote count updates live on the same page
- [ ] Open second browser tab on `/vote` → vote count updates on both tabs simultaneously (Realtime working)
- [ ] Navigate to `/evaluate` → Votes and Avg columns show correct numbers
- [ ] Super admin closes voting → vote page shows "Voting Has Closed" gate
- [ ] "Live Voting" appears in sidebar for all roles (evaluator, faculty, hod, principal, admin)
- [ ] Changing star rating on same team → count stays same, avg updates
