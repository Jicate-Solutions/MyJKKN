# Role Card + Skill Bank Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add per-member Role Cards to the Appathon submission flow — each team member declares their 1–2 roles and tags teammates' contributions after team metrics are submitted.

**Architecture:** Phase 3 (Role Card) appended to the existing `/submit` page. Gated on `submission.metrics_updated_at !== null`. Visible to both team leaders and accepted members. Backed by two new tables (`appathon_role_cards`, `appathon_peer_tags`) with a PostgreSQL RPC for atomic insertion.

**Tech Stack:** Next.js 15 App Router, Supabase RLS + SECURITY DEFINER RPC, React Query, Zod, shadcn/ui, TypeScript

---

## Files Overview

| Action | Path |
|--------|------|
| Modify | `supabase/setup/01_tables.sql` |
| Modify | `supabase/setup/02_functions.sql` |
| Modify | `supabase/setup/03_policies.sql` |
| Create | `lib/constants/startup-studio/roles.ts` |
| Modify | `types/startup-studio.ts` |
| Create | `lib/services/startup-studio/role-card-service.ts` |
| Create | `hooks/startup-studio/use-role-cards.ts` |
| Create | `app/(routes)/startup-studio/events/[id]/submit/_components/role-card-section.tsx` |
| Modify | `app/(routes)/startup-studio/events/[id]/submit/page.tsx` |

---

## Task 1: Database Tables

**Files:**
- Modify: `supabase/setup/01_tables.sql` — append at the end of the file

**Step 1: Add the two tables + indexes to `01_tables.sql`**

Append this block at the end of the file (after the last existing CREATE TABLE):

```sql
-- ══════════════════════════════════════════════════════════════
-- APPATHON ROLE CARDS (Added: 2026-03-08 — Skill Bank Phase 1)
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS appathon_role_cards (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID NOT NULL REFERENCES event_submissions(id) ON DELETE CASCADE,
  team_id      UUID NOT NULL REFERENCES event_registrations(id) ON DELETE CASCADE,
  profile_id   UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  learner_id   UUID REFERENCES learners_profiles(id) ON DELETE SET NULL,
  self_roles   TEXT[] NOT NULL,
  proud_of     TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(submission_id, profile_id)
);

CREATE TABLE IF NOT EXISTS appathon_peer_tags (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role_card_id     UUID NOT NULL REFERENCES appathon_role_cards(id) ON DELETE CASCADE,
  tagger_profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  tagged_profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  tagged_role      TEXT NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(role_card_id, tagged_profile_id)
);

-- Indexes for Skill Bank queries
CREATE INDEX IF NOT EXISTS idx_appathon_role_cards_submission  ON appathon_role_cards(submission_id);
CREATE INDEX IF NOT EXISTS idx_appathon_role_cards_team        ON appathon_role_cards(team_id);
CREATE INDEX IF NOT EXISTS idx_appathon_role_cards_profile     ON appathon_role_cards(profile_id);
CREATE INDEX IF NOT EXISTS idx_appathon_role_cards_learner     ON appathon_role_cards(learner_id);
CREATE INDEX IF NOT EXISTS idx_appathon_peer_tags_role_card    ON appathon_peer_tags(role_card_id);
CREATE INDEX IF NOT EXISTS idx_appathon_peer_tags_tagged       ON appathon_peer_tags(tagged_profile_id);
CREATE INDEX IF NOT EXISTS idx_appathon_peer_tags_tagged_role  ON appathon_peer_tags(tagged_role);
```

**Step 2: Apply via Supabase MCP**

Use `mcp__supabase__apply_migration` with `name: "add_appathon_role_cards"` and the SQL from Step 1.

**Step 3: Verify tables exist**

Use `mcp__supabase__list_tables` and confirm `appathon_role_cards` and `appathon_peer_tags` appear.

**Step 4: Commit**

```bash
git add supabase/setup/01_tables.sql
git commit -m "feat(db): add appathon_role_cards and appathon_peer_tags tables"
```

---

## Task 2: PostgreSQL RPC + RLS Policies

**Files:**
- Modify: `supabase/setup/02_functions.sql` — append RPC function
- Modify: `supabase/setup/03_policies.sql` — append RLS policies

**Step 1: Add `submit_role_card` RPC to `02_functions.sql`**

Append at the end of the file:

```sql
-- ══════════════════════════════════════════════════════════════
-- submit_role_card RPC (Added: 2026-03-08)
-- Atomic insert of role card + peer tags in one transaction.
-- SECURITY DEFINER: bypasses RLS but validates caller = p_profile_id.
-- ══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION submit_role_card(
  p_submission_id    UUID,
  p_team_id          UUID,
  p_profile_id       UUID,
  p_learner_id       UUID,
  p_self_roles       TEXT[],
  p_proud_of         TEXT,
  p_peer_tags        JSONB  -- array of {tagged_profile_id: uuid, tagged_role: text}
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role_card_id UUID;
  v_peer        JSONB;
BEGIN
  -- Caller must be the profile filling the card
  IF auth.uid() IS DISTINCT FROM p_profile_id THEN
    RAISE EXCEPTION 'Unauthorized: caller does not match profile_id';
  END IF;

  -- Validate self_roles: 1-2 items
  IF array_length(p_self_roles, 1) IS NULL
     OR array_length(p_self_roles, 1) < 1
     OR array_length(p_self_roles, 1) > 2 THEN
    RAISE EXCEPTION 'Must select 1–2 roles';
  END IF;

  -- Validate proud_of: 10-150 characters
  IF length(trim(p_proud_of)) < 10 OR length(trim(p_proud_of)) > 150 THEN
    RAISE EXCEPTION 'proud_of must be 10–150 characters';
  END IF;

  -- Insert role card (UNIQUE constraint prevents duplicates)
  INSERT INTO appathon_role_cards
    (submission_id, team_id, profile_id, learner_id, self_roles, proud_of)
  VALUES
    (p_submission_id, p_team_id, p_profile_id, p_learner_id, p_self_roles, trim(p_proud_of))
  RETURNING id INTO v_role_card_id;

  -- Insert peer tags
  FOR v_peer IN SELECT * FROM jsonb_array_elements(p_peer_tags)
  LOOP
    INSERT INTO appathon_peer_tags
      (role_card_id, tagger_profile_id, tagged_profile_id, tagged_role)
    VALUES (
      v_role_card_id,
      p_profile_id,
      (v_peer->>'tagged_profile_id')::UUID,
      v_peer->>'tagged_role'
    );
  END LOOP;

  RETURN v_role_card_id;
END;
$$;

GRANT EXECUTE ON FUNCTION submit_role_card TO authenticated;
```

**Step 2: Add RLS policies to `03_policies.sql`**

Append at the end of the file:

```sql
-- ══════════════════════════════════════════════════════════════
-- RLS: appathon_role_cards & appathon_peer_tags (Added: 2026-03-08)
-- ══════════════════════════════════════════════════════════════

ALTER TABLE appathon_role_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE appathon_peer_tags  ENABLE ROW LEVEL SECURITY;

-- Role Cards: SELECT (own card OR same team OR admin/faculty)
CREATE POLICY "role_cards_select" ON appathon_role_cards FOR SELECT USING (
  auth.uid() = profile_id
  OR EXISTS (
    SELECT 1 FROM event_team_members etm
    WHERE etm.profile_id = auth.uid()
      AND etm.status = 'accepted'
      AND etm.registration_id = appathon_role_cards.team_id
  )
  OR EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid()
      AND p.role IN ('admin', 'principal', 'hod', 'faculty')
  )
  OR (SELECT is_super_admin FROM profiles WHERE id = auth.uid())
);

-- Role Cards: INSERT (only via RPC, but this policy adds defence-in-depth)
CREATE POLICY "role_cards_insert" ON appathon_role_cards FOR INSERT WITH CHECK (
  auth.uid() = profile_id
);

-- Peer Tags: SELECT (own tags OR same team via role card OR admin)
CREATE POLICY "peer_tags_select" ON appathon_peer_tags FOR SELECT USING (
  auth.uid() = tagger_profile_id
  OR EXISTS (
    SELECT 1 FROM appathon_role_cards rc
    JOIN event_team_members etm ON etm.registration_id = rc.team_id
    WHERE rc.id = appathon_peer_tags.role_card_id
      AND etm.profile_id = auth.uid()
      AND etm.status = 'accepted'
  )
  OR EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid()
      AND p.role IN ('admin', 'principal', 'hod', 'faculty')
  )
  OR (SELECT is_super_admin FROM profiles WHERE id = auth.uid())
);

-- Peer Tags: INSERT (only via RPC — role card must be owned by caller)
CREATE POLICY "peer_tags_insert" ON appathon_peer_tags FOR INSERT WITH CHECK (
  auth.uid() = tagger_profile_id
  AND EXISTS (
    SELECT 1 FROM appathon_role_cards rc
    WHERE rc.id = appathon_peer_tags.role_card_id
      AND rc.profile_id = auth.uid()
  )
);

-- No UPDATE or DELETE for learners on either table (final = final)
```

**Step 3: Apply via Supabase MCP**

Use `mcp__supabase__apply_migration` with `name: "add_role_card_rls_and_rpc"` and the combined SQL from Steps 1 and 2.

**Step 4: Commit**

```bash
git add supabase/setup/02_functions.sql supabase/setup/03_policies.sql
git commit -m "feat(db): add submit_role_card RPC and RLS for role cards + peer tags"
```

---

## Task 3: Role Constants + TypeScript Types

**Files:**
- Create: `lib/constants/startup-studio/roles.ts`
- Modify: `types/startup-studio.ts`

**Step 1: Create `lib/constants/startup-studio/roles.ts`**

```typescript
// lib/constants/startup-studio/roles.ts

export const APPATHON_ROLES = [
  {
    id: 'problem_finder',
    label: 'Problem Finder',
    description: 'Found the problem worth solving, talked to users',
  },
  {
    id: 'prompt_architect',
    label: 'Prompt Architect',
    description: 'Built the app in Lovable through AI prompting',
  },
  {
    id: 'design_shaper',
    label: 'Design Shaper',
    description: 'Shaped UI/UX, visual quality, user experience',
  },
  {
    id: 'user_getter',
    label: 'User Getter',
    description: 'Marketed the app, got people to sign up and use it',
  },
  {
    id: 'deal_closer',
    label: 'Deal Closer',
    description: 'Got someone to pay, handled pricing/payments',
  },
  {
    id: 'team_captain',
    label: 'Team Captain',
    description: 'Coordinated the team, managed time, kept things on track',
  },
] as const;

export type AppathonRoleId = (typeof APPATHON_ROLES)[number]['id'];
```

**Step 2: Add types to `types/startup-studio.ts`**

Append at the end of the file:

```typescript
// ── Role Cards (Skill Bank) ───────────────────────────────────────────────

export interface RoleCard {
  id: string;
  submission_id: string;
  team_id: string;
  profile_id: string;
  learner_id: string | null;
  self_roles: string[];
  proud_of: string;
  created_at: string;
  peer_tags?: PeerTag[];
}

export interface PeerTag {
  id: string;
  role_card_id: string;
  tagger_profile_id: string;
  tagged_profile_id: string;
  tagged_role: string;
  created_at: string;
}

export interface CreateRoleCardDto {
  submission_id: string;
  team_id: string;
  profile_id: string;
  learner_id: string | null;
  self_roles: string[];
  proud_of: string;
  peer_tags: Array<{ tagged_profile_id: string; tagged_role: string }>;
}
```

**Step 3: Commit**

```bash
git add lib/constants/startup-studio/roles.ts types/startup-studio.ts
git commit -m "feat(types): add RoleCard, PeerTag types and APPATHON_ROLES constants"
```

---

## Task 4: Role Card Service

**Files:**
- Create: `lib/services/startup-studio/role-card-service.ts`

**Step 1: Create the service**

```typescript
// lib/services/startup-studio/role-card-service.ts
import { createClientSupabaseClient } from '@/lib/supabase/client';
import type { RoleCard, CreateRoleCardDto } from '@/types/startup-studio';

export class RoleCardService {
  /**
   * Atomically creates a role card + peer tags via the submit_role_card RPC.
   * Returns the new role card UUID.
   */
  static async createRoleCard(dto: CreateRoleCardDto): Promise<string> {
    const supabase = createClientSupabaseClient();
    const { data, error } = await supabase.rpc('submit_role_card', {
      p_submission_id: dto.submission_id,
      p_team_id: dto.team_id,
      p_profile_id: dto.profile_id,
      p_learner_id: dto.learner_id,
      p_self_roles: dto.self_roles,
      p_proud_of: dto.proud_of,
      p_peer_tags: dto.peer_tags,
    });
    if (error) throw error;
    return data as string;
  }

  /** Fetch the current user's role card for a submission (null if not yet submitted). */
  static async getMyRoleCard(
    submissionId: string,
    profileId: string
  ): Promise<RoleCard | null> {
    const supabase = createClientSupabaseClient();
    const { data, error } = await supabase
      .from('appathon_role_cards')
      .select('*, peer_tags:appathon_peer_tags(*)')
      .eq('submission_id', submissionId)
      .eq('profile_id', profileId)
      .maybeSingle();
    if (error) throw error;
    return data as RoleCard | null;
  }

  /** Fetch all role cards for a team's submission (used for progress tracking). */
  static async getTeamRoleCards(submissionId: string): Promise<RoleCard[]> {
    const supabase = createClientSupabaseClient();
    const { data, error } = await supabase
      .from('appathon_role_cards')
      .select('id, profile_id, self_roles, proud_of, created_at')
      .eq('submission_id', submissionId);
    if (error) throw error;
    return (data ?? []) as RoleCard[];
  }
}
```

**Step 2: Commit**

```bash
git add lib/services/startup-studio/role-card-service.ts
git commit -m "feat(service): add RoleCardService with createRoleCard, getMyRoleCard, getTeamRoleCards"
```

---

## Task 5: React Query Hooks

**Files:**
- Create: `hooks/startup-studio/use-role-cards.ts`

**Step 1: Create the hooks file**

```typescript
// hooks/startup-studio/use-role-cards.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { RoleCardService } from '@/lib/services/startup-studio/role-card-service';
import type { CreateRoleCardDto } from '@/types/startup-studio';
import { useAuth } from '@/hooks/use-auth';

/** Fetch the current user's role card for a submission. */
export function useMyRoleCard(submissionId: string | undefined) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['my-role-card', submissionId, user?.id],
    queryFn: () => RoleCardService.getMyRoleCard(submissionId!, user!.id),
    enabled: !!submissionId && !!user?.id,
    staleTime: 30_000,
  });
}

/** Fetch all role cards for a team's submission (progress tracking). */
export function useTeamRoleCards(submissionId: string | undefined) {
  return useQuery({
    queryKey: ['team-role-cards', submissionId],
    queryFn: () => RoleCardService.getTeamRoleCards(submissionId!),
    enabled: !!submissionId,
    staleTime: 15_000,
  });
}

/** Submit the current user's role card. */
export function useSubmitRoleCard() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateRoleCardDto) => RoleCardService.createRoleCard(dto),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['my-role-card', variables.submission_id] });
      queryClient.invalidateQueries({ queryKey: ['team-role-cards', variables.submission_id] });
    },
  });
}
```

**Step 2: Commit**

```bash
git add hooks/startup-studio/use-role-cards.ts
git commit -m "feat(hooks): add useMyRoleCard, useTeamRoleCards, useSubmitRoleCard"
```

---

## Task 6: RoleCardSection Component

**Files:**
- Create: `app/(routes)/startup-studio/events/[id]/submit/_components/role-card-section.tsx`

**Step 1: Create the component**

This component is self-contained: it fetches its own data and renders either the form (if card not submitted) or a success summary (if already submitted).

```tsx
// app/(routes)/startup-studio/events/[id]/submit/_components/role-card-section.tsx
'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Users, CheckCircle2, Star, Loader2 } from 'lucide-react';
import { APPATHON_ROLES } from '@/lib/constants/startup-studio/roles';
import {
  useMyRoleCard,
  useTeamRoleCards,
  useSubmitRoleCard,
} from '@/hooks/startup-studio/use-role-cards';
import type { EventTeamMember } from '@/types/startup-studio';

// ── Zod schema ────────────────────────────────────────────────────────────────

const roleCardSchema = z.object({
  self_roles: z
    .array(z.string())
    .min(1, 'Pick at least 1 role')
    .max(2, 'Pick at most 2 roles'),
  proud_of: z
    .string()
    .min(10, 'Minimum 10 characters')
    .max(150, 'Maximum 150 characters'),
  peer_tags: z.record(z.string(), z.string().min(1, 'Required')),
});

type RoleCardFormValues = z.infer<typeof roleCardSchema>;

// ── Props ─────────────────────────────────────────────────────────────────────

interface RoleCardSectionProps {
  submissionId: string;
  teamId: string;        // event_registrations.id
  profileId: string;     // auth user id
  learnerId: string | null;
  teamMembers: EventTeamMember[];
}

// ── Main Component ────────────────────────────────────────────────────────────

export function RoleCardSection({
  submissionId,
  teamId,
  profileId,
  learnerId,
  teamMembers,
}: RoleCardSectionProps) {
  const { data: myCard, isLoading: myCardLoading } = useMyRoleCard(submissionId);
  const { data: teamCards, isLoading: teamCardsLoading } = useTeamRoleCards(submissionId);
  const submitRoleCard = useSubmitRoleCard();

  const acceptedMembers = teamMembers.filter((m) => m.status === 'accepted');
  const otherMembers = acceptedMembers.filter(
    (m) => m.profile_id !== profileId && m.profile_id !== null
  );
  const completedCount = teamCards?.length ?? 0;
  const totalCount = acceptedMembers.length;

  const form = useForm<RoleCardFormValues>({
    resolver: zodResolver(roleCardSchema),
    defaultValues: {
      self_roles: [],
      proud_of: '',
      peer_tags: Object.fromEntries(otherMembers.map((m) => [m.profile_id!, ''])),
    },
  });

  if (myCardLoading || teamCardsLoading) {
    return (
      <Card>
        <CardContent className="py-8 flex justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  // ── Already submitted: success summary ─────────────────────────────────────
  if (myCard) {
    return (
      <Card className="border-green-200 bg-green-50/40 dark:border-green-900/40 dark:bg-green-950/20">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center justify-between text-base">
            <span className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              Your Role Card is submitted!
            </span>
            <ProgressBadge completed={completedCount} total={totalCount} />
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5">
              Your roles
            </p>
            <div className="flex flex-wrap gap-1.5">
              {myCard.self_roles.map((roleId) => {
                const role = APPATHON_ROLES.find((r) => r.id === roleId);
                return (
                  <Badge key={roleId} variant="secondary">
                    {role?.label ?? roleId}
                  </Badge>
                );
              })}
            </div>
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
              Most proud of
            </p>
            <p className="text-sm leading-relaxed">{myCard.proud_of}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // ── Form ───────────────────────────────────────────────────────────────────
  const watchedRoles = form.watch('self_roles');
  const watchedProudOf = form.watch('proud_of');

  const onSubmit = (values: RoleCardFormValues) => {
    const peer_tags = Object.entries(values.peer_tags)
      .filter(([, role]) => role)
      .map(([tagged_profile_id, tagged_role]) => ({ tagged_profile_id, tagged_role }));

    submitRoleCard.mutate({
      submission_id: submissionId,
      team_id: teamId,
      profile_id: profileId,
      learner_id: learnerId,
      self_roles: values.self_roles,
      proud_of: values.proud_of,
      peer_tags,
    });
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between text-base">
          <span className="flex items-center gap-2">
            <Star className="h-4 w-4 text-yellow-500" />
            Your Role Card
          </span>
          <ProgressBadge completed={completedCount} total={totalCount} />
        </CardTitle>
        <p className="text-sm text-muted-foreground mt-1">
          Team submission complete! Now each team member fills their individual Role Card.
        </p>
      </CardHeader>

      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">

            {/* Field 1: Self Roles */}
            <FormField
              control={form.control}
              name="self_roles"
              render={() => (
                <FormItem>
                  <FormLabel>
                    What was your main role in the team? Pick 1–2.{' '}
                    <span className="text-destructive">*</span>
                  </FormLabel>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                    {APPATHON_ROLES.map((role) => {
                      const checked = watchedRoles.includes(role.id);
                      const disabled = !checked && watchedRoles.length >= 2;
                      return (
                        <label
                          key={role.id}
                          className={[
                            'flex items-start gap-2.5 p-3 rounded-lg border cursor-pointer transition-colors',
                            checked
                              ? 'border-green-500 bg-green-50/50 dark:bg-green-950/20'
                              : 'border-border hover:border-muted-foreground/40',
                            disabled ? 'opacity-40 cursor-not-allowed' : '',
                          ].join(' ')}
                        >
                          <Checkbox
                            checked={checked}
                            disabled={disabled}
                            onCheckedChange={(chk) => {
                              const current = form.getValues('self_roles');
                              form.setValue(
                                'self_roles',
                                chk
                                  ? [...current, role.id]
                                  : current.filter((r) => r !== role.id),
                                { shouldValidate: true }
                              );
                            }}
                            className="mt-0.5 shrink-0"
                          />
                          <div>
                            <p className="text-sm font-medium leading-none">{role.label}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {role.description}
                            </p>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Field 2: Proud Of */}
            <FormField
              control={form.control}
              name="proud_of"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    In one sentence, what are you most proud of from this Appathon?{' '}
                    <span className="text-destructive">*</span>
                  </FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      placeholder="e.g., I got 15 classmates to sign up and use the app"
                      maxLength={150}
                    />
                  </FormControl>
                  <div className="flex items-center justify-between mt-1">
                    <FormMessage />
                    <span className="text-xs text-muted-foreground ml-auto">
                      {watchedProudOf.length}/150
                    </span>
                  </div>
                </FormItem>
              )}
            />

            {/* Field 3: Peer Tags */}
            {otherMembers.length > 0 && (
              <div className="space-y-3">
                <p className="text-sm font-medium">Tag your teammates</p>
                {otherMembers.map((member) => (
                  <FormField
                    key={member.profile_id}
                    control={form.control}
                    name={`peer_tags.${member.profile_id}`}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-sm font-normal">
                          What was{' '}
                          <span className="font-medium">
                            {member.full_name ?? member.email}
                          </span>
                          &apos;s biggest contribution?{' '}
                          <span className="text-destructive">*</span>
                        </FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select a role" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {APPATHON_ROLES.map((role) => (
                              <SelectItem key={role.id} value={role.id}>
                                {role.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                ))}
              </div>
            )}

            <Button
              type="submit"
              disabled={submitRoleCard.isPending}
              className="w-full sm:w-auto gap-2"
            >
              <CheckCircle2 className="h-4 w-4" />
              {submitRoleCard.isPending ? 'Submitting...' : 'Submit Role Card'}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}

// ── Progress Badge ────────────────────────────────────────────────────────────

function ProgressBadge({ completed, total }: { completed: number; total: number }) {
  return (
    <Badge
      variant={completed === total && total > 0 ? 'default' : 'secondary'}
      className="gap-1 text-xs font-normal"
    >
      <Users className="h-3 w-3" />
      {completed} of {total} completed
    </Badge>
  );
}
```

**Step 2: Commit**

```bash
git add app/(routes)/startup-studio/events/[id]/submit/_components/role-card-section.tsx
git commit -m "feat(ui): add RoleCardSection component with multi-role checkbox, proud_of, and peer tagging"
```

---

## Task 7: Integrate Role Card into Submit Page

**Files:**
- Modify: `app/(routes)/startup-studio/events/[id]/submit/page.tsx`

This task has 4 precise edits to `page.tsx`. Read the file before editing to confirm line numbers.

**Step 1: Add new imports (after line 37 — the `Link` import)**

Add these 3 import lines:

```typescript
import { useMyTeamMembers } from '@/hooks/startup-studio/use-event-registrations';
import { RoleCardSection } from './_components/role-card-section';
```

**Step 2: Change `useAuth` destructuring to also get `user`**

Find line (currently reads):
```typescript
const { isLoading: authLoading } = useAuth();
```

Change to:
```typescript
const { user, isLoading: authLoading } = useAuth();
```

**Step 3: Add `useMyTeamMembers` hook call (after the `memberSubLoading` line ~line 99)**

After:
```typescript
const { data: memberSubmission, isLoading: memberSubLoading } = useTeamSubmission(id, memberRegistrationId);
```

Add:
```typescript
// For role card: need team members list for peer tagging (leaders get this via registration.team_members,
// but members need a separate fetch)
const { data: memberTeamMembers } = useMyTeamMembers(id);
```

**Step 4: Update the member view branch to add Role Card section**

Find the member view return statement. Currently it ends with:
```tsx
          <MemberSubmissionView submission={memberSubmission} />
        </div>
      </ContentLayout>
    );
```

Replace with:
```tsx
          <MemberSubmissionView submission={memberSubmission} />

          {/* Phase 3: Role Card — visible to members once team metrics are submitted */}
          {memberSubmission?.metrics_updated_at && user && (
            <RoleCardSection
              submissionId={memberSubmission.id}
              teamId={memberRegistrationId!}
              profileId={user.id}
              learnerId={(membershipAny?.learner_id as string | null) ?? null}
              teamMembers={(memberTeamMembers as any[]) ?? []}
            />
          )}
        </div>
      </ContentLayout>
    );
```

**Step 5: Update the leader view to add Role Card section**

Find the leader return block. Currently it ends with:
```tsx
        <MetricsSection
          submission={submission}
          locked={metricsLocked}
          config={event?.config as EventConfig}
          eventId={id}
        />
      </div>
    </ContentLayout>
  );
```

Replace with:
```tsx
        <MetricsSection
          submission={submission}
          locked={metricsLocked}
          config={event?.config as EventConfig}
          eventId={id}
        />

        {/* Phase 3: Role Card — visible once team leader has submitted metrics */}
        {submission?.metrics_updated_at && user && (
          <RoleCardSection
            submissionId={submission.id}
            teamId={registration.id}
            profileId={user.id}
            learnerId={
              registration.team_members?.find((m) => m.profile_id === user.id)
                ?.learner_id ?? null
            }
            teamMembers={registration.team_members ?? []}
          />
        )}
      </div>
    </ContentLayout>
  );
```

**Step 6: Verify the page compiles**

```bash
npx tsc --noEmit
```

Expected: No errors. If TypeScript complains about `memberTeamMembers` types, cast with `as EventTeamMember[]` using the imported type.

**Step 7: Commit**

```bash
git add app/(routes)/startup-studio/events/[id]/submit/page.tsx
git commit -m "feat(submit): add Phase 3 Role Card section to submission flow for leaders and members"
```

---

## Task 8: Final Verification

**Step 1: TypeScript check**

```bash
npx tsc --noEmit
```
Expected: 0 errors.

**Step 2: Manual test checklist**

Test as team leader:
- [ ] Create/join a team, submit project (Phase 1), submit metrics (Phase 2)
- [ ] Phase 3 section appears with progress badge showing "0 of N completed"
- [ ] Pick 1 role → checkboxes work; pick 2 → rest are disabled; deselect → re-enabled
- [ ] `proud_of` character counter updates, min 10 enforced
- [ ] All peer dropdowns show 6 role options
- [ ] Submit → success summary card replaces form
- [ ] Progress badge updates to "1 of N completed"

Test as team member (login as different user):
- [ ] Go to `/startup-studio/events/[id]/submit`
- [ ] See read-only project details + metrics view
- [ ] Phase 3 Role Card form appears below
- [ ] Member can fill and submit their own card independently

Test edge cases:
- [ ] Solo team (1 member): no peer tags section shown, only self_roles + proud_of
- [ ] Submitting card twice: error from UNIQUE constraint (RPC returns duplicate key error) — second submit button should be disabled once card is saved
- [ ] proud_of with 9 chars: form shows validation error
- [ ] 3 self_roles attempted: third checkbox is disabled

**Step 3: Final commit tag**

```bash
git tag appathon-role-cards-v1
```

---

## Architecture Notes

### Why SECURITY DEFINER RPC instead of client-side sequential inserts?

Supabase's JS SDK doesn't support explicit transactions. If we inserted `appathon_role_cards` then `appathon_peer_tags` in two separate calls, a network failure between them would leave an orphaned role card with no peer tags. The RPC wraps both inserts in a single database transaction that either fully commits or fully rolls back.

### Why `profile_id` AND `learner_id` in `appathon_role_cards`?

- `profile_id` → always non-null for authenticated users → used for RLS (`auth.uid()` checks)
- `learner_id` → links to the student academic record → used for Skill Bank queries joining to `learners_profiles` (college, department, program data)

### Why show Role Card only after `metrics_updated_at`?

The spec explicitly sequences: team metrics → individual role cards. This gate ensures the team has committed to their submission tier before individual attribution is locked in. It also prevents confusion if the team leader updates metrics after members have already filed their cards.

### Peer Tags schema: `profile_id` not `learner_id`

The spec uses `learner_id` for `tagger_id`/`tagged_id`, but not all team members may have `learner_id` (pre-auth invites). We use `profile_id` (always available post-login) for referential integrity, and the Skill Bank queries can join `profiles → learners_profiles` when learner data is needed.
