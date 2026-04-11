# Marathon Event Operations System - Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task.

**Goal:** Build a QR-code-based event-day operations system for marathon check-in, stall management, t-shirt distribution, and certificate issuance.

**Architecture:** Server-rendered QR codes (qrcode + sharp), client-side scanning (html5-qrcode), new `events_stalls` table with dynamic capacity-based auto-assignment, shared scanner UI component across 3 ops pages, new `marathon-ops-service.ts` for all scan operations.

**Tech Stack:** Next.js 14 App Router, Supabase (Postgres + RLS), React Query, TypeScript, shadcn/ui, Tailwind CSS, qrcode, sharp, html5-qrcode, archiver

---

## Phase 1: Database Schema & Types

### Task 1.1: Create `events_stalls` table

**Files:**
- Modify: `supabase/setup/01_tables.sql` (append after marathon tables ~line 3630)
- Modify: `supabase/SQL_FILE_INDEX.md` (update index)

**Step 1: Add table SQL to 01_tables.sql**

Append at end of marathon section:

```sql
-- ============================================================
-- EVENT STALLS (Marathon kit distribution stations)
-- ============================================================
CREATE TABLE IF NOT EXISTS events_stalls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  stall_name TEXT NOT NULL,
  stall_code TEXT NOT NULL,
  capacity INT NOT NULL DEFAULT 100,
  location_note TEXT,
  sort_order INT DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(event_id, stall_code)
);

CREATE INDEX IF NOT EXISTS idx_events_stalls_event ON events_stalls(event_id);
```

Note: No `bib_prefix` or `bib_range` columns. Assignment is computed dynamically by the service layer based on capacity and BIB sort order.

**Step 2: Add new columns to `events_registrations`**

Append after existing columns section:

```sql
-- Add ops tracking columns to events_registrations
ALTER TABLE events_registrations
  ADD COLUMN IF NOT EXISTS stall_id UUID REFERENCES events_stalls(id),
  ADD COLUMN IF NOT EXISTS tshirt_collected BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS tshirt_collected_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS tshirt_collected_by UUID REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS certificate_issued BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS certificate_issued_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS certificate_issued_by UUID REFERENCES profiles(id);

CREATE INDEX IF NOT EXISTS idx_events_registrations_stall ON events_registrations(stall_id);
```

**Step 3: Run the migration in Supabase SQL Editor or via MCP**

Execute both SQL blocks against the database.

**Step 4: Update SQL_FILE_INDEX.md**

Add entry for new `events_stalls` table and the new columns on `events_registrations`.

**Step 5: Commit**

```bash
git add supabase/setup/01_tables.sql supabase/SQL_FILE_INDEX.md
git commit -m "feat(marathon-ops): add events_stalls table + ops tracking columns on registrations"
```

---

### Task 1.2: Add RLS policies for `events_stalls`

**Files:**
- Modify: `supabase/setup/03_policies.sql`

**Step 1: Add RLS policies**

```sql
-- events_stalls policies
ALTER TABLE events_stalls ENABLE ROW LEVEL SECURITY;

CREATE POLICY "events_stalls_select" ON events_stalls
  FOR SELECT USING (true);

CREATE POLICY "events_stalls_insert" ON events_stalls
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "events_stalls_update" ON events_stalls
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "events_stalls_delete" ON events_stalls
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid())
  );
```

**Step 2: Execute in Supabase**

**Step 3: Commit**

```bash
git add supabase/setup/03_policies.sql
git commit -m "feat(marathon-ops): add RLS policies for events_stalls"
```

---

### Task 1.3: Add TypeScript types

**Files:**
- Modify: `types/events-marathon.ts`

**Step 1: Add types at the end of the file**

```typescript
// ============================================================================
// Event Stalls
// ============================================================================

export interface EventStall {
  id: string;
  event_id: string;
  stall_name: string;
  stall_code: string;
  capacity: number;
  location_note: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateEventStallDto {
  event_id: string;
  stall_name: string;
  stall_code: string;
  capacity: number;
  location_note?: string;
  sort_order?: number;
}

export interface UpdateEventStallDto {
  stall_name?: string;
  stall_code?: string;
  capacity?: number;
  location_note?: string;
  sort_order?: number;
  is_active?: boolean;
}

// ============================================================================
// Operations (Scan Actions)
// ============================================================================

export type OpsActionType = 'check_in' | 'tshirt' | 'certificate';

export interface OpsScanRequest {
  bib_number: string;
  action: OpsActionType;
  operator_id: string;
}

export interface OpsScanResult {
  success: boolean;
  action: OpsActionType;
  registration: {
    id: string;
    bib_number: string;
    participant_name: string;
    participant_phone: string | null;
    participant_age: number | null;
    participant_gender: string | null;
    category_code: string;
    custom_data: Record<string, unknown>;
    stall?: EventStall | null;
  };
  already_done: boolean;
  timestamp: string;
  message: string;
}

export interface OpsStats {
  total: number;
  checked_in: number;
  tshirt_collected: number;
  certificate_issued: number;
  stall_breakdown: {
    stall_id: string;
    stall_name: string;
    stall_code: string;
    capacity: number;
    assigned: number;
    checked_in: number;
  }[];
}
```

**Step 2: Commit**

```bash
git add types/events-marathon.ts
git commit -m "feat(marathon-ops): add TypeScript types for stalls and ops"
```

---

## Phase 2: Service Layer

### Task 2.1: Create `marathon-stall-service.ts`

**Files:**
- Create: `lib/services/events/marathon/marathon-stall-service.ts`

**Step 1: Create the service**

```typescript
// lib/services/events/marathon/marathon-stall-service.ts
// CRUD operations for event stalls + dynamic auto-assignment

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';
import type { EventStall, CreateEventStallDto, UpdateEventStallDto } from '@/types/events-marathon';

export class MarathonStallService {
  private static get supabase() {
    return createClientSupabaseClient();
  }

  /**
   * Get all stalls for an event.
   */
  static async getStalls(eventId: string): Promise<EventStall[]> {
    const { data, error } = await this.supabase
      .from('events_stalls')
      .select('*')
      .eq('event_id', eventId)
      .eq('is_active', true)
      .order('sort_order', { ascending: true });

    if (error) {
      logger.error('events/marathon-stalls', 'Failed to fetch stalls', error);
      throw error;
    }
    return (data ?? []) as EventStall[];
  }

  /**
   * Create a new stall.
   */
  static async createStall(dto: CreateEventStallDto): Promise<EventStall> {
    const { data, error } = await this.supabase
      .from('events_stalls')
      .insert([dto])
      .select()
      .single();

    if (error) {
      logger.error('events/marathon-stalls', 'Failed to create stall', error);
      throw error;
    }
    return data as EventStall;
  }

  /**
   * Update a stall.
   */
  static async updateStall(id: string, dto: UpdateEventStallDto): Promise<EventStall> {
    const { data, error } = await this.supabase
      .from('events_stalls')
      .update({ ...dto, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      logger.error('events/marathon-stalls', 'Failed to update stall', error);
      throw error;
    }
    return data as EventStall;
  }

  /**
   * Delete a stall (soft-delete by setting is_active=false).
   */
  static async deleteStall(id: string): Promise<void> {
    const { error } = await this.supabase
      .from('events_stalls')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) {
      logger.error('events/marathon-stalls', 'Failed to delete stall', error);
      throw error;
    }
  }

  /**
   * Auto-assign participants to stalls based on BIB number order and stall capacity.
   *
   * Logic:
   * 1. Fetch all active stalls ordered by sort_order
   * 2. Fetch all registrations ordered by bib_number
   * 3. Distribute sequentially: fill Stall 1 to capacity, then Stall 2, etc.
   * 4. Update stall_id on each registration
   *
   * Returns count of assigned participants.
   */
  static async autoAssignStalls(eventId: string): Promise<{ assigned: number; unassigned: number }> {
    const stalls = await this.getStalls(eventId);
    if (stalls.length === 0) {
      throw new Error('No active stalls found. Create stalls first.');
    }

    // Fetch all registrations ordered by BIB
    const { data: registrations, error } = await this.supabase
      .from('events_registrations')
      .select('id, bib_number')
      .eq('event_id', eventId)
      .not('bib_number', 'is', null)
      .order('bib_number', { ascending: true });

    if (error) {
      logger.error('events/marathon-stalls', 'Failed to fetch registrations for assignment', error);
      throw error;
    }

    const regs = registrations ?? [];
    let assigned = 0;
    let stallIdx = 0;
    let stallCount = 0;

    // Build assignment map: stall_id -> [registration_ids]
    const assignments = new Map<string, string[]>();
    for (const stall of stalls) {
      assignments.set(stall.id, []);
    }

    for (const reg of regs) {
      if (stallIdx >= stalls.length) break; // All stalls full

      const currentStall = stalls[stallIdx];
      assignments.get(currentStall.id)!.push(reg.id);
      stallCount++;
      assigned++;

      if (stallCount >= currentStall.capacity) {
        stallIdx++;
        stallCount = 0;
      }
    }

    // Batch update registrations per stall (chunks of 100)
    for (const [stallId, regIds] of assignments) {
      for (let i = 0; i < regIds.length; i += 100) {
        const chunk = regIds.slice(i, i + 100);
        const { error: updateErr } = await this.supabase
          .from('events_registrations')
          .update({ stall_id: stallId })
          .in('id', chunk);

        if (updateErr) {
          logger.error('events/marathon-stalls', `Failed to assign chunk to stall ${stallId}`, updateErr);
        }
      }
    }

    const unassigned = regs.length - assigned;
    logger.info('events/marathon-stalls', `Auto-assigned ${assigned} participants, ${unassigned} unassigned`, { eventId });

    return { assigned, unassigned };
  }

  /**
   * Clear all stall assignments for an event.
   */
  static async clearAssignments(eventId: string): Promise<void> {
    const { error } = await this.supabase
      .from('events_registrations')
      .update({ stall_id: null })
      .eq('event_id', eventId);

    if (error) {
      logger.error('events/marathon-stalls', 'Failed to clear assignments', error);
      throw error;
    }
  }
}
```

**Step 2: Commit**

```bash
git add lib/services/events/marathon/marathon-stall-service.ts
git commit -m "feat(marathon-ops): add stall service with dynamic auto-assignment"
```

---

### Task 2.2: Create `marathon-ops-service.ts`

**Files:**
- Create: `lib/services/events/marathon/marathon-ops-service.ts`

**Step 1: Create the service**

```typescript
// lib/services/events/marathon/marathon-ops-service.ts
// Unified scan operations for check-in, t-shirt, certificate

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';
import type { OpsActionType, OpsScanResult, OpsStats } from '@/types/events-marathon';

export class MarathonOpsService {
  private static get supabase() {
    return createClientSupabaseClient();
  }

  /**
   * Lookup registration by BIB number. Returns registration with stall info.
   */
  static async getRegistrationByBib(eventId: string, bibNumber: string) {
    const { data, error } = await this.supabase
      .from('events_registrations')
      .select(`
        id, bib_number, participant_name, participant_phone,
        participant_age, participant_gender, participant_type,
        status, checked_in, checked_in_at,
        tshirt_collected, tshirt_collected_at,
        certificate_issued, certificate_issued_at,
        payment_status, payment_amount,
        custom_data,
        category:event_categories(id, name, code),
        stall:events_stalls(id, stall_name, stall_code, location_note)
      `)
      .eq('event_id', eventId)
      .eq('bib_number', bibNumber)
      .single();

    if (error) {
      logger.warn('events/marathon-ops', `BIB lookup failed: ${bibNumber}`, error);
      return null;
    }
    return data;
  }

  /**
   * Universal scan action handler.
   * Actions: check_in, tshirt, certificate
   * Idempotent — returns already_done=true if action was already performed.
   */
  static async processScan(
    eventId: string,
    bibNumber: string,
    action: OpsActionType,
    operatorId: string
  ): Promise<OpsScanResult> {
    const reg = await this.getRegistrationByBib(eventId, bibNumber);

    if (!reg) {
      return {
        success: false,
        action,
        registration: null as any,
        already_done: false,
        timestamp: new Date().toISOString(),
        message: `BIB ${bibNumber} not found`,
      };
    }

    const now = new Date().toISOString();
    let alreadyDone = false;
    let message = '';

    switch (action) {
      case 'check_in': {
        if (reg.checked_in) {
          alreadyDone = true;
          message = `Already checked in at ${reg.checked_in_at}`;
        } else {
          const { error } = await this.supabase
            .from('events_registrations')
            .update({
              checked_in: true,
              checked_in_at: now,
              checked_in_by: operatorId,
              status: 'checked_in',
            })
            .eq('id', reg.id);

          if (error) {
            logger.error('events/marathon-ops', 'Check-in failed', error);
            return {
              success: false, action, registration: reg as any,
              already_done: false, timestamp: now,
              message: 'Database update failed. Please retry.',
            };
          }
          message = 'Checked in successfully';
        }
        break;
      }

      case 'tshirt': {
        if (reg.tshirt_collected) {
          alreadyDone = true;
          message = `T-shirt already collected at ${reg.tshirt_collected_at}`;
        } else {
          const { error } = await this.supabase
            .from('events_registrations')
            .update({
              tshirt_collected: true,
              tshirt_collected_at: now,
              tshirt_collected_by: operatorId,
            })
            .eq('id', reg.id);

          if (error) {
            logger.error('events/marathon-ops', 'T-shirt collection failed', error);
            return {
              success: false, action, registration: reg as any,
              already_done: false, timestamp: now,
              message: 'Database update failed. Please retry.',
            };
          }
          message = 'T-shirt collected';
        }
        break;
      }

      case 'certificate': {
        if (reg.certificate_issued) {
          alreadyDone = true;
          message = `Certificate already issued at ${reg.certificate_issued_at}`;
        } else {
          const { error } = await this.supabase
            .from('events_registrations')
            .update({
              certificate_issued: true,
              certificate_issued_at: now,
              certificate_issued_by: operatorId,
            })
            .eq('id', reg.id);

          if (error) {
            logger.error('events/marathon-ops', 'Certificate issuance failed', error);
            return {
              success: false, action, registration: reg as any,
              already_done: false, timestamp: now,
              message: 'Database update failed. Please retry.',
            };
          }
          message = 'Certificate issued';
        }
        break;
      }
    }

    return {
      success: true,
      action,
      registration: {
        id: reg.id,
        bib_number: reg.bib_number,
        participant_name: reg.participant_name,
        participant_phone: reg.participant_phone,
        participant_age: reg.participant_age,
        participant_gender: reg.participant_gender,
        category_code: (reg.category as any)?.code ?? '',
        custom_data: (reg.custom_data ?? {}) as Record<string, unknown>,
        stall: reg.stall as any,
      },
      already_done: alreadyDone,
      timestamp: now,
      message,
    };
  }

  /**
   * Get operations statistics for the dashboard.
   */
  static async getOpsStats(eventId: string): Promise<OpsStats> {
    // Fetch all registrations with stall info
    const { data: regs, error } = await this.supabase
      .from('events_registrations')
      .select('id, checked_in, tshirt_collected, certificate_issued, stall_id')
      .eq('event_id', eventId);

    if (error) {
      logger.error('events/marathon-ops', 'Failed to fetch ops stats', error);
      throw error;
    }

    const all = regs ?? [];

    // Fetch stalls for breakdown
    const { data: stalls } = await this.supabase
      .from('events_stalls')
      .select('id, stall_name, stall_code, capacity')
      .eq('event_id', eventId)
      .eq('is_active', true)
      .order('sort_order');

    const stallBreakdown = (stalls ?? []).map((s: any) => {
      const stallRegs = all.filter((r: any) => r.stall_id === s.id);
      return {
        stall_id: s.id,
        stall_name: s.stall_name,
        stall_code: s.stall_code,
        capacity: s.capacity,
        assigned: stallRegs.length,
        checked_in: stallRegs.filter((r: any) => r.checked_in).length,
      };
    });

    return {
      total: all.length,
      checked_in: all.filter((r: any) => r.checked_in).length,
      tshirt_collected: all.filter((r: any) => r.tshirt_collected).length,
      certificate_issued: all.filter((r: any) => r.certificate_issued).length,
      stall_breakdown: stallBreakdown,
    };
  }

  /**
   * Search registrations by name, phone, or BIB (for manual fallback).
   */
  static async searchRegistrations(eventId: string, query: string) {
    const q = query.trim();
    const { data, error } = await this.supabase
      .from('events_registrations')
      .select(`
        id, bib_number, participant_name, participant_phone,
        participant_age, participant_gender,
        checked_in, checked_in_at,
        tshirt_collected, tshirt_collected_at,
        certificate_issued, certificate_issued_at,
        custom_data,
        category:event_categories(name, code),
        stall:events_stalls(stall_name, stall_code)
      `)
      .eq('event_id', eventId)
      .or(`bib_number.ilike.%${q}%,participant_name.ilike.%${q}%,participant_phone.ilike.%${q}%`)
      .order('bib_number')
      .limit(20);

    if (error) {
      logger.error('events/marathon-ops', 'Search failed', error);
      throw error;
    }
    return data ?? [];
  }
}
```

**Step 2: Commit**

```bash
git add lib/services/events/marathon/marathon-ops-service.ts
git commit -m "feat(marathon-ops): add unified ops service for scan operations"
```

---

### Task 2.3: Create React Query hooks

**Files:**
- Create: `hooks/events/marathon/use-marathon-ops.ts`
- Create: `hooks/events/marathon/use-marathon-stalls.ts`

**Step 1: Create stall hooks**

```typescript
// hooks/events/marathon/use-marathon-stalls.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { MarathonStallService } from '@/lib/services/events/marathon/marathon-stall-service';
import type { CreateEventStallDto, UpdateEventStallDto } from '@/types/events-marathon';

export function useMarathonStalls(eventId: string) {
  return useQuery({
    queryKey: ['marathon-stalls', eventId],
    queryFn: () => MarathonStallService.getStalls(eventId),
    enabled: !!eventId,
  });
}

export function useCreateStall() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateEventStallDto) => MarathonStallService.createStall(dto),
    onSuccess: (_, dto) => {
      qc.invalidateQueries({ queryKey: ['marathon-stalls', dto.event_id] });
    },
  });
}

export function useUpdateStall() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dto, eventId }: { id: string; dto: UpdateEventStallDto; eventId: string }) =>
      MarathonStallService.updateStall(id, dto),
    onSuccess: (_, { eventId }) => {
      qc.invalidateQueries({ queryKey: ['marathon-stalls', eventId] });
    },
  });
}

export function useDeleteStall() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, eventId }: { id: string; eventId: string }) =>
      MarathonStallService.deleteStall(id),
    onSuccess: (_, { eventId }) => {
      qc.invalidateQueries({ queryKey: ['marathon-stalls', eventId] });
    },
  });
}

export function useAutoAssignStalls() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (eventId: string) => MarathonStallService.autoAssignStalls(eventId),
    onSuccess: (_, eventId) => {
      qc.invalidateQueries({ queryKey: ['marathon-stalls', eventId] });
      qc.invalidateQueries({ queryKey: ['marathon-ops-stats', eventId] });
      qc.invalidateQueries({ queryKey: ['marathon-registrations', eventId] });
    },
  });
}

export function useClearStallAssignments() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (eventId: string) => MarathonStallService.clearAssignments(eventId),
    onSuccess: (_, eventId) => {
      qc.invalidateQueries({ queryKey: ['marathon-stalls', eventId] });
      qc.invalidateQueries({ queryKey: ['marathon-ops-stats', eventId] });
    },
  });
}
```

**Step 2: Create ops hooks**

```typescript
// hooks/events/marathon/use-marathon-ops.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { MarathonOpsService } from '@/lib/services/events/marathon/marathon-ops-service';
import type { OpsActionType } from '@/types/events-marathon';

export function useOpsStats(eventId: string) {
  return useQuery({
    queryKey: ['marathon-ops-stats', eventId],
    queryFn: () => MarathonOpsService.getOpsStats(eventId),
    enabled: !!eventId,
    refetchInterval: 10_000, // Live refresh every 10s
  });
}

export function useProcessScan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      eventId, bibNumber, action, operatorId,
    }: {
      eventId: string; bibNumber: string; action: OpsActionType; operatorId: string;
    }) => MarathonOpsService.processScan(eventId, bibNumber, action, operatorId),
    onSuccess: (_, { eventId }) => {
      qc.invalidateQueries({ queryKey: ['marathon-ops-stats', eventId] });
    },
  });
}

export function useOpsSearch(eventId: string, query: string) {
  return useQuery({
    queryKey: ['marathon-ops-search', eventId, query],
    queryFn: () => MarathonOpsService.searchRegistrations(eventId, query),
    enabled: !!eventId && query.length >= 2,
  });
}
```

**Step 3: Commit**

```bash
git add hooks/events/marathon/use-marathon-ops.ts hooks/events/marathon/use-marathon-stalls.ts
git commit -m "feat(marathon-ops): add React Query hooks for stalls and ops"
```

---

## Phase 3: QR Code Generation

### Task 3.1: Create QR code API route

**Files:**
- Create: `app/api/events/marathon/[eventId]/qr/[bibNumber]/route.ts`

This route generates a branded QR code image on-the-fly. The QR encodes `BIB:{bibNumber}`. Branding: event name at top, BIB + stall below QR, JKKN + slogan at bottom.

**Step 1: Create the API route**

```typescript
// app/api/events/marathon/[eventId]/qr/[bibNumber]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import QRCode from 'qrcode';
import sharp from 'sharp';
import { createServiceRoleClient } from '@/lib/supabase/server';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ eventId: string; bibNumber: string }> }
) {
  const { eventId, bibNumber } = await params;
  const supabase = createServiceRoleClient();

  // Fetch event name
  const { data: event } = await supabase
    .from('events')
    .select('name')
    .eq('id', eventId)
    .single();

  // Fetch registration for stall info
  const { data: reg } = await supabase
    .from('events_registrations')
    .select('participant_name, stall:events_stalls(stall_code)')
    .eq('event_id', eventId)
    .eq('bib_number', bibNumber)
    .single();

  const eventName = event?.name ?? 'Marathon 2026';
  const stallCode = (reg?.stall as any)?.stall_code ?? '';
  const participantName = reg?.participant_name ?? '';

  // Generate QR code as PNG buffer (300x300)
  const qrBuffer = await QRCode.toBuffer(`BIB:${bibNumber}`, {
    type: 'png',
    width: 300,
    margin: 1,
    errorCorrectionLevel: 'M',
    color: { dark: '#000000', light: '#FFFFFF' },
  });

  // Compose branded image using sharp
  const width = 400;
  const height = 520;

  // SVG text overlay
  const svgText = `
    <svg width="${width}" height="${height}">
      <rect width="${width}" height="${height}" fill="white"/>
      <text x="${width / 2}" y="35" text-anchor="middle" font-family="Arial,sans-serif" font-size="16" font-weight="bold" fill="#1a1a2e">${eventName}</text>
      <text x="${width / 2}" y="385" text-anchor="middle" font-family="monospace" font-size="28" font-weight="bold" fill="#1a1a2e">BIB: ${bibNumber}</text>
      ${stallCode ? `<text x="${width / 2}" y="415" text-anchor="middle" font-family="Arial,sans-serif" font-size="18" fill="#e94560">Stall: ${stallCode}</text>` : ''}
      ${participantName ? `<text x="${width / 2}" y="445" text-anchor="middle" font-family="Arial,sans-serif" font-size="14" fill="#555">${participantName}</text>` : ''}
      <line x1="20" y1="465" x2="${width - 20}" y2="465" stroke="#ddd" stroke-width="1"/>
      <text x="${width / 2}" y="488" text-anchor="middle" font-family="Arial,sans-serif" font-size="12" font-weight="bold" fill="#1a1a2e">JKKN Educational Institutions</text>
      <text x="${width / 2}" y="508" text-anchor="middle" font-family="Arial,sans-serif" font-size="10" fill="#e94560">India's 1st AI Empowered Marathon</text>
    </svg>
  `;

  const branded = await sharp(Buffer.from(svgText))
    .composite([
      {
        input: qrBuffer,
        top: 55,
        left: Math.round((width - 300) / 2),
      },
    ])
    .png()
    .toBuffer();

  return new NextResponse(branded, {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=86400',
      'Content-Disposition': `inline; filename="qr-${bibNumber}.png"`,
    },
  });
}
```

**Step 2: Commit**

```bash
git add app/api/events/marathon/\[eventId\]/qr/\[bibNumber\]/route.ts
git commit -m "feat(marathon-ops): add branded QR code generation API route"
```

---

### Task 3.2: Create bulk QR download API route

**Files:**
- Create: `app/api/events/marathon/[eventId]/qr/bulk/route.ts`

This route generates a ZIP file containing all QR code PNGs for the event.

```typescript
// app/api/events/marathon/[eventId]/qr/bulk/route.ts
import { NextRequest, NextResponse } from 'next/server';
import archiver from 'archiver';
import QRCode from 'qrcode';
import sharp from 'sharp';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { Readable } from 'stream';

export const maxDuration = 120; // Allow up to 2 minutes for bulk generation

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const { eventId } = await params;
  const supabase = createServiceRoleClient();

  const { data: event } = await supabase
    .from('events')
    .select('name')
    .eq('id', eventId)
    .single();

  const { data: registrations } = await supabase
    .from('events_registrations')
    .select('bib_number, participant_name, stall:events_stalls(stall_code)')
    .eq('event_id', eventId)
    .not('bib_number', 'is', null)
    .order('bib_number');

  if (!registrations?.length) {
    return NextResponse.json({ error: 'No registrations found' }, { status: 404 });
  }

  const eventName = event?.name ?? 'Marathon 2026';

  // Create ZIP archive
  const archive = archiver('zip', { zlib: { level: 5 } });
  const chunks: Buffer[] = [];

  archive.on('data', (chunk: Buffer) => chunks.push(chunk));

  const done = new Promise<Buffer>((resolve, reject) => {
    archive.on('end', () => resolve(Buffer.concat(chunks)));
    archive.on('error', reject);
  });

  // Generate QR for each registration
  for (const reg of registrations) {
    const bib = reg.bib_number;
    const stallCode = (reg.stall as any)?.stall_code ?? '';
    const name = reg.participant_name ?? '';

    const qrBuffer = await QRCode.toBuffer(`BIB:${bib}`, {
      type: 'png', width: 300, margin: 1, errorCorrectionLevel: 'M',
    });

    const width = 400;
    const height = 520;
    const svgText = `
      <svg width="${width}" height="${height}">
        <rect width="${width}" height="${height}" fill="white"/>
        <text x="${width / 2}" y="35" text-anchor="middle" font-family="Arial,sans-serif" font-size="16" font-weight="bold" fill="#1a1a2e">${eventName}</text>
        <text x="${width / 2}" y="385" text-anchor="middle" font-family="monospace" font-size="28" font-weight="bold" fill="#1a1a2e">BIB: ${bib}</text>
        ${stallCode ? `<text x="${width / 2}" y="415" text-anchor="middle" font-family="Arial,sans-serif" font-size="18" fill="#e94560">Stall: ${stallCode}</text>` : ''}
        ${name ? `<text x="${width / 2}" y="445" text-anchor="middle" font-family="Arial,sans-serif" font-size="14" fill="#555">${name}</text>` : ''}
        <line x1="20" y1="465" x2="${width - 20}" y2="465" stroke="#ddd" stroke-width="1"/>
        <text x="${width / 2}" y="488" text-anchor="middle" font-family="Arial,sans-serif" font-size="12" font-weight="bold" fill="#1a1a2e">JKKN Educational Institutions</text>
        <text x="${width / 2}" y="508" text-anchor="middle" font-family="Arial,sans-serif" font-size="10" fill="#e94560">India's 1st AI Empowered Marathon</text>
      </svg>
    `;

    const branded = await sharp(Buffer.from(svgText))
      .composite([{ input: qrBuffer, top: 55, left: 50 }])
      .png()
      .toBuffer();

    archive.append(branded, { name: `${bib}.png` });
  }

  archive.finalize();
  const zipBuffer = await done;

  return new NextResponse(zipBuffer, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="qr-codes-${eventId.slice(0, 8)}.zip"`,
    },
  });
}
```

**Step 2: Commit**

```bash
git add app/api/events/marathon/\[eventId\]/qr/bulk/route.ts
git commit -m "feat(marathon-ops): add bulk QR code ZIP download endpoint"
```

---

## Phase 4: Scanner Component

### Task 4.1: Install html5-qrcode and create shared scanner component

**Files:**
- Create: `components/marathon/bib-scanner.tsx`

**Step 1: Install library**

```bash
npm install html5-qrcode
```

**Step 2: Create the reusable BIB scanner component**

This component wraps `html5-qrcode` with:
- Auto-start camera on mount
- Parse `BIB:XXXX` format from scanned text
- Debounce 3 seconds between scans
- Green/yellow/red flash feedback
- Manual search fallback input
- Wake Lock to prevent screen sleep

```typescript
// components/marathon/bib-scanner.tsx
'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, Camera, CameraOff } from 'lucide-react';
import { cn } from '@/lib/utils';

interface BibScannerProps {
  onScan: (bibNumber: string) => void;
  disabled?: boolean;
  className?: string;
}

export function BibScanner({ onScan, disabled, className }: BibScannerProps) {
  const [isScanning, setIsScanning] = useState(false);
  const [manualInput, setManualInput] = useState('');
  const [flash, setFlash] = useState<'green' | 'yellow' | 'red' | null>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const lastScanRef = useRef<number>(0);
  const containerId = 'bib-qr-reader';

  const parseBib = useCallback((text: string): string | null => {
    // Accept "BIB:T001" or just "T001" / "F0501" / "K2001"
    const match = text.match(/(?:BIB:)?([TFK]\d{3,4})/i);
    return match ? match[1].toUpperCase() : null;
  }, []);

  const handleScanResult = useCallback(
    (decodedText: string) => {
      const now = Date.now();
      if (now - lastScanRef.current < 3000) return; // 3s debounce
      lastScanRef.current = now;

      const bib = parseBib(decodedText);
      if (bib) {
        onScan(bib);
        // Haptic feedback
        if (navigator.vibrate) navigator.vibrate(100);
      }
    },
    [onScan, parseBib]
  );

  useEffect(() => {
    // Request Wake Lock to keep screen on
    let wakeLock: WakeLockSentinel | null = null;
    if ('wakeLock' in navigator) {
      navigator.wakeLock.request('screen').then(wl => { wakeLock = wl; }).catch(() => {});
    }
    return () => { wakeLock?.release(); };
  }, []);

  const startScanning = useCallback(async () => {
    try {
      const scanner = new Html5Qrcode(containerId);
      scannerRef.current = scanner;
      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        handleScanResult,
        () => {} // ignore errors
      );
      setIsScanning(true);
    } catch (err) {
      console.error('Failed to start scanner:', err);
    }
  }, [handleScanResult]);

  const stopScanning = useCallback(async () => {
    if (scannerRef.current?.isScanning) {
      await scannerRef.current.stop();
    }
    setIsScanning(false);
  }, []);

  useEffect(() => {
    startScanning();
    return () => { stopScanning(); };
  }, [startScanning, stopScanning]);

  const handleManualSearch = () => {
    const bib = parseBib(manualInput) ?? manualInput.trim().toUpperCase();
    if (bib) {
      onScan(bib);
      setManualInput('');
    }
  };

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      {/* Camera viewfinder */}
      <div className="relative rounded-lg overflow-hidden bg-black aspect-square max-h-[60vh]">
        <div id={containerId} className="w-full h-full" />
        {flash && (
          <div
            className={cn(
              'absolute inset-0 z-10 flex items-center justify-center transition-opacity duration-300',
              flash === 'green' && 'bg-green-500/30',
              flash === 'yellow' && 'bg-yellow-500/30',
              flash === 'red' && 'bg-red-500/30'
            )}
          />
        )}
      </div>

      {/* Camera toggle */}
      <Button
        variant="outline"
        size="sm"
        onClick={isScanning ? stopScanning : startScanning}
        className="w-full"
      >
        {isScanning ? <CameraOff className="h-4 w-4 mr-2" /> : <Camera className="h-4 w-4 mr-2" />}
        {isScanning ? 'Stop Camera' : 'Start Camera'}
      </Button>

      {/* Manual fallback */}
      <div className="flex gap-2">
        <Input
          placeholder="Search BIB / Name / Phone"
          value={manualInput}
          onChange={(e) => setManualInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleManualSearch()}
          className="flex-1"
        />
        <Button onClick={handleManualSearch} disabled={!manualInput.trim()}>
          <Search className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
```

**Step 3: Commit**

```bash
npm install html5-qrcode
git add components/marathon/bib-scanner.tsx package.json package-lock.json
git commit -m "feat(marathon-ops): add reusable BIB scanner component with html5-qrcode"
```

---

### Task 4.2: Create scan result card component

**Files:**
- Create: `components/marathon/scan-result-card.tsx`

This component displays the result after scanning — adapts its content based on the action type (check-in, t-shirt, certificate).

```typescript
// components/marathon/scan-result-card.tsx
'use client';

import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';
import type { OpsScanResult } from '@/types/events-marathon';

interface ScanResultCardProps {
  result: OpsScanResult | null;
  className?: string;
}

export function ScanResultCard({ result, className }: ScanResultCardProps) {
  if (!result) return null;

  const { success, already_done, registration: reg, action, message } = result;

  const bgColor = !success
    ? 'bg-red-50 border-red-200'
    : already_done
      ? 'bg-yellow-50 border-yellow-200'
      : 'bg-green-50 border-green-200';

  const Icon = !success ? XCircle : already_done ? AlertTriangle : CheckCircle2;
  const iconColor = !success ? 'text-red-600' : already_done ? 'text-yellow-600' : 'text-green-600';

  const tshirtSize = (reg?.custom_data as any)?.tshirt_size ?? '';

  return (
    <div className={cn('rounded-lg border-2 p-4 animate-in fade-in', bgColor, className)}>
      <div className="flex items-start gap-3">
        <Icon className={cn('h-8 w-8 flex-shrink-0 mt-0.5', iconColor)} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-mono text-2xl font-bold">{reg?.bib_number}</span>
            <Badge variant="outline">{reg?.category_code}</Badge>
          </div>
          <p className="text-lg font-semibold truncate">{reg?.participant_name}</p>
          <p className="text-sm text-muted-foreground">{message}</p>

          {/* Action-specific content */}
          {action === 'check_in' && reg?.stall && (
            <div className="mt-3 p-3 bg-white rounded-md border">
              <p className="text-sm text-muted-foreground">Assigned Stall</p>
              <p className="text-3xl font-bold text-primary">
                {(reg.stall as any).stall_name}
              </p>
              {(reg.stall as any).location_note && (
                <p className="text-sm text-muted-foreground">{(reg.stall as any).location_note}</p>
              )}
            </div>
          )}

          {action === 'tshirt' && tshirtSize && (
            <div className="mt-2">
              <Badge className="text-lg px-3 py-1">Size: {tshirtSize}</Badge>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add components/marathon/scan-result-card.tsx
git commit -m "feat(marathon-ops): add scan result card component"
```

---

## Phase 5: Operations Pages

### Task 5.1: Create the Stalls management page

**Files:**
- Create: `app/(routes)/events/marathon/[id]/ops/stalls/page.tsx`

This page allows admins to:
- View all stalls in a table
- Create/edit/delete stalls (name, code, capacity, location note)
- Trigger "Auto Assign" to distribute participants by BIB order
- See assignment counts per stall

Full implementation with shadcn DataTable, Dialog for create/edit, Button for auto-assign with confirmation.

**Step 1: Implement the page** (use existing DataTable pattern from registrations page, create/edit dialog with form fields: stall_name, stall_code, capacity, location_note, sort_order)

**Step 2: Commit**

```bash
git add app/\(routes\)/events/marathon/\[id\]/ops/stalls/page.tsx
git commit -m "feat(marathon-ops): add stalls management page with auto-assign"
```

---

### Task 5.2: Create the Check-in page

**Files:**
- Create: `app/(routes)/events/marathon/[id]/ops/check-in/page.tsx`

Layout:
- Top: Station name "CHECK-IN" + live counter (checked_in / total)
- Center: BibScanner component (60% viewport)
- Below scanner: ScanResultCard (auto-hides after 5s)
- Bottom: Full DataTable of all registrations with checked_in status, sortable/searchable

On scan: call `useProcessScan({ action: 'check_in' })` → display ScanResultCard with stall info → auto-resume scanning.

**Step 1: Implement the page** (uses BibScanner, ScanResultCard, useProcessScan, useOpsStats, DataTable with columns: BIB, Name, Phone, Category, Stall, Checked In status + timestamp)

**Step 2: Commit**

```bash
git add app/\(routes\)/events/marathon/\[id\]/ops/check-in/page.tsx
git commit -m "feat(marathon-ops): add QR-based check-in page"
```

---

### Task 5.3: Create the T-shirt distribution page

**Files:**
- Create: `app/(routes)/events/marathon/[id]/ops/tshirt/page.tsx`

Same layout as check-in but with:
- Station name: "T-SHIRT DISTRIBUTION"
- Action: `'tshirt'`
- Result card shows t-shirt size prominently
- Warning if participant not checked in yet (soft, non-blocking)
- DataTable columns: BIB, Name, Size, Checked In, T-shirt Collected status

**Step 1: Implement the page**

**Step 2: Commit**

```bash
git add app/\(routes\)/events/marathon/\[id\]/ops/tshirt/page.tsx
git commit -m "feat(marathon-ops): add QR-based t-shirt distribution page"
```

---

### Task 5.4: Create the Certificate issuance page

**Files:**
- Create: `app/(routes)/events/marathon/[id]/ops/certificate/page.tsx`

Same layout as check-in but with:
- Station name: "CERTIFICATE ISSUANCE"
- Action: `'certificate'`
- Result card shows certificate ID if available from marathon_results
- DataTable columns: BIB, Name, Checked In, T-shirt, Certificate Issued status

**Step 1: Implement the page**

**Step 2: Commit**

```bash
git add app/\(routes\)/events/marathon/\[id\]/ops/certificate/page.tsx
git commit -m "feat(marathon-ops): add QR-based certificate issuance page"
```

---

### Task 5.5: Create the QR Codes management page

**Files:**
- Create: `app/(routes)/events/marathon/[id]/ops/qr-codes/page.tsx`

Features:
- Grid view of all participant QR codes (lazy-loaded images from `/api/events/marathon/[eventId]/qr/[bib]`)
- Search/filter by BIB, name, category
- Individual download button per QR
- "Download All" button → triggers bulk ZIP download
- Preview modal on click

**Step 1: Implement the page**

**Step 2: Commit**

```bash
git add app/\(routes\)/events/marathon/\[id\]/ops/qr-codes/page.tsx
git commit -m "feat(marathon-ops): add QR codes management page with bulk download"
```

---

### Task 5.6: Create the Live Dashboard page

**Files:**
- Create: `app/(routes)/events/marathon/[id]/ops/dashboard/page.tsx`

Features:
- Live stats cards: Total, Checked In, T-shirts Collected, Certificates Issued (with progress bars)
- Per-stall breakdown table: Stall Name, Capacity, Assigned, Checked In, %
- Auto-refreshes every 10s via `useOpsStats` hook
- Designed for wall-mounted tablet display

**Step 1: Implement the page**

**Step 2: Commit**

```bash
git add app/\(routes\)/events/marathon/\[id\]/ops/dashboard/page.tsx
git commit -m "feat(marathon-ops): add live ops dashboard"
```

---

## Phase 6: Navigation & Integration

### Task 6.1: Add ops routes to sidebar/navigation

**Files:**
- Modify: `app/(routes)/events/marathon/[id]/_components/` (event detail layout or nav)
- Or modify the marathon event detail page to add "Operations" section

Add navigation links for:
- Operations Dashboard
- Check-in
- T-shirt Distribution
- Certificate Issuance
- Stall Management
- QR Codes

**Step 1: Add navigation items to the marathon event detail layout**

**Step 2: Commit**

```bash
git commit -m "feat(marathon-ops): add ops navigation to marathon event pages"
```

---

### Task 6.2: Add QR download to individual registration detail page

**Files:**
- Modify: `app/(routes)/events/marathon/[id]/registrations/[regId]/page.tsx` (or wherever single registration detail is)

Add a "Download QR Code" button that links to `/api/events/marathon/[eventId]/qr/[bibNumber]`.

Also display stall assignment, check-in status, t-shirt status, and certificate status as status badges.

**Step 1: Add QR download button and status badges**

**Step 2: Commit**

```bash
git commit -m "feat(marathon-ops): add QR download + ops status to registration detail"
```

---

## Summary

| Phase | Tasks | Description |
|-------|-------|-------------|
| **1. Database** | 1.1-1.3 | New table, columns, RLS, TypeScript types |
| **2. Services** | 2.1-2.3 | Stall service, ops service, React Query hooks |
| **3. QR Code** | 3.1-3.2 | Individual + bulk QR generation API routes |
| **4. Scanner** | 4.1-4.2 | Reusable BIB scanner + result card components |
| **5. Pages** | 5.1-5.6 | Stalls, check-in, t-shirt, certificate, QR codes, dashboard |
| **6. Integration** | 6.1-6.2 | Navigation + registration detail enhancements |

**Total: 15 tasks across 6 phases**

Estimated commits: ~15 (one per task)
