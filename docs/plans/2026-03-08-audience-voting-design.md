# Audience Live Voting System — Design Document

**Date:** 2026-03-08
**Module:** Startup Studio — Demo Day
**Status:** Approved, pending implementation

---

## Overview

A live audience voting system for Demo Day presentations. Any authenticated user can navigate to a dedicated `/vote` page, view all presenting teams, and cast a 1–5 star rating per team. Vote counts and averages update in real time for all connected users. Evaluator judges see live vote stats alongside their verification table. Admins open and close voting manually from the Demo Day management page.

---

## Requirements

| # | Requirement |
|---|-------------|
| 1 | Any authenticated user (any role) can cast a star rating (1–5) per team |
| 2 | One vote per person per team; changing rating updates the existing vote |
| 3 | Voting window is controlled manually by super_admin (Open / Close buttons) |
| 4 | Live vote count + average rating visible to all users while voting is open |
| 5 | Audience votes are display-only on leaderboard — do NOT affect evaluator score |
| 6 | Evaluators see live vote count + avg columns in their verification table |
| 7 | Dedicated `/startup-studio/events/[id]/vote` page for audience |

---

## Database Schema

### New Table: `audience_votes`

```sql
CREATE TABLE audience_votes (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id         UUID NOT NULL REFERENCES startup_events(id) ON DELETE CASCADE,
  submission_id    UUID NOT NULL REFERENCES event_submissions(id) ON DELETE CASCADE,
  voter_profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  rating           INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  voted_at         TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(submission_id, voter_profile_id)
);

CREATE INDEX idx_audience_votes_event     ON audience_votes(event_id);
CREATE INDEX idx_audience_votes_submission ON audience_votes(submission_id);
```

### Columns Added to `startup_events`

```sql
ALTER TABLE startup_events
  ADD COLUMN voting_opened_at TIMESTAMPTZ,
  ADD COLUMN voting_closed_at TIMESTAMPTZ;
```

- `voting_opened_at NULL` = voting not yet opened
- `voting_opened_at SET, voting_closed_at NULL` = voting open
- `voting_closed_at SET` = voting closed

### New View: `audience_vote_summary`

```sql
CREATE VIEW audience_vote_summary AS
SELECT
  av.submission_id,
  av.event_id,
  COUNT(*)                          AS total_votes,
  ROUND(AVG(av.rating)::numeric, 1) AS average_rating
FROM audience_votes av
GROUP BY av.submission_id, av.event_id;
```

---

## RLS Policies

| Operation | Policy |
|-----------|--------|
| SELECT    | `auth.uid() IS NOT NULL` — any logged-in user |
| INSERT    | `auth.uid() = voter_profile_id` — own votes only |
| UPDATE    | `auth.uid() = voter_profile_id` — own votes only |
| DELETE    | Disabled — no deleting votes |

Upsert strategy: `INSERT ... ON CONFLICT (submission_id, voter_profile_id) DO UPDATE SET rating = ..., updated_at = now()`

---

## Realtime Strategy

Uses the same Supabase Realtime pattern as the admission chat module (`hooks/admission/use-chat-realtime.ts`):

```typescript
supabase
  .channel(`audience_votes:${eventId}`)
  .on('postgres_changes', {
    event: '*',
    schema: 'public',
    table: 'audience_votes',
    filter: `event_id=eq.${eventId}`,
  }, () => {
    qc.invalidateQueries({ queryKey: ['vote-summaries', eventId] })
  })
  .subscribe()
```

All connected users on `/vote` and `/evaluate` pages receive live count updates instantly when anyone casts or changes a vote.

---

## Pages & Components

### New: `/startup-studio/events/[id]/vote/page.tsx`

- Gate: shows "Voting Not Open" screen if `!voting_opened_at || voting_closed_at`
- Lists all teams with a submission, sorted by demo slot order
- Each team card (`team-vote-card.tsx`) shows:
  - Team name + app name
  - Live avg rating (★ 4.2) + total votes (142 votes)
  - 5-star input (pre-filled with user's existing rating if any)
- User can update their rating at any time while voting is open
- Realtime subscription keeps counts live without page refresh

### Modified: Demo Day page (`/demo-day`)

Add voting control section:
- **"Open Voting"** button (when `voting_opened_at` is null)
- **"Close Voting"** button (when voting is open)
- Status badge: `Voting Open` (green) / `Voting Closed` (gray) / `Not Started` (muted)

### Modified: Evaluate page verification table

Add two columns after Status:
- `Votes` — total vote count
- `Avg ★` — average star rating (e.g. `4.2`)

Both update live via shared realtime subscription.

### Sidebar Menu

Add "Live Voting" link under Startup Studio, visible to all authenticated users (no permission gate).

---

## New Files

| File | Purpose |
|------|---------|
| `lib/services/startup-studio/audience-vote-service.ts` | DB queries: get summaries, my votes, cast vote, open/close voting |
| `hooks/startup-studio/use-audience-votes.ts` | React Query hooks + realtime subscription hook |
| `app/(routes)/startup-studio/events/[id]/vote/page.tsx` | Voting page |
| `app/(routes)/startup-studio/events/[id]/vote/_components/team-vote-card.tsx` | Star rating card per team |

## Modified Files

| File | Change |
|------|--------|
| `supabase/setup/01_tables.sql` | Add `audience_votes` table + 2 cols on `startup_events` |
| `supabase/setup/03_policies.sql` | RLS for `audience_votes` |
| `supabase/setup/05_views.sql` | `audience_vote_summary` view |
| `types/startup-studio.ts` | `AudienceVote`, `VoteSummary` types |
| `lib/sidebarMenuLink.ts` | Add "Live Voting" menu entry |
| `app/(routes)/startup-studio/events/[id]/demo-day/page.tsx` | Open/Close Voting buttons |
| `app/(routes)/startup-studio/events/[id]/evaluate/_components/verification-table.tsx` | Votes + Avg columns |

---

## Data Flow

```
User casts/updates vote
  → AudienceVoteService.castVote() upsert
    → audience_votes table updated
      → Supabase Realtime fires postgres_changes event
        → useAudienceVotesRealtime invalidates ['vote-summaries', eventId]
          → useVoteSummaries refetches from audience_vote_summary view
            → All connected /vote and /evaluate pages update counts live
```

---

## Out of Scope

- Audience votes do NOT affect evaluator score or leaderboard rank
- No anonymous voting — must be authenticated
- No per-star breakdown display (just avg + count)
- No vote export in this phase
