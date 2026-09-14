'use server';

// app/(routes)/meetings/slate/actions.ts
//
// Server actions for "Review the proposed month" — piece 4a of the Monthly
// Slate spec. READ ONLY plus one generator: there is deliberately no Approve,
// no Reschedule, no Drop and no Try-again here, and nothing in this file can
// create a booking. Those are piece 4b.
//
// Every read and write goes through the RLS-scoped client, so "may this person
// see or regenerate this month" is answered by the policies that shipped with
// migration 20261210100000, not by a check duplicated here.
//
// Companion:
//   page.tsx                       — server component, explicit auth cards
//   _components/slate-review.tsx   — 'use client' review surface
//   lib/services/meetings/monthly-slate-service.ts — the loading + persistence

import { revalidatePath } from 'next/cache';

import { createClient } from '@/lib/supabase/server';
import {
  defaultSlateMonth,
  generateMonthlySlate,
  isMonthKey,
  loadStoredSlate,
  resolveSlateHostProfileId,
  type StoredSlate,
} from '@/lib/services/meetings/monthly-slate-service';
import { labelInstitutions } from '@/lib/utils/institutions/institution-labels';

import type { ActionResult, InstitutionOption } from '../series/actions';

// NOTE: StoredSlate is deliberately NOT re-exported from this file.
// A `'use server'` module may only export async functions. `export type { X }`
// is a RE-EXPORT of a binding from another module, and Turbopack emits it into
// the generated server-actions manifest as a runtime export — which then does
// not exist, because it is a type. That is exactly the build failure this line
// caused. A locally-declared `export interface` (below, and throughout
// ../series/actions.ts) is erased properly and is fine.
// Consumers import StoredSlate from @/lib/services/meetings/monthly-slate-service.

export interface SlateContext {
  month: string;
  slate: StoredSlate | null;
  institutions: InstitutionOption[];
  /** How many series are configured and active — drives the honest empty state. */
  activeSeriesCount: number;
}

/**
 * Everything the review screen needs for one month.
 *
 * The slate is keyed to the SIGNED-IN user: a month is reviewed by the person
 * looking at it. A delegate who needs the Director's own month reaches it
 * through the same RLS policy, but generating produces their own draft rather
 * than overwriting someone else's.
 */
export async function loadSlateContext(month?: string): Promise<ActionResult<SlateContext>> {
  try {
    const chosen = isMonthKey(month) ? month : defaultSlateMonth();
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { success: false, error: 'You are not signed in.' };

    // The month belongs to the SERIES HOST's calendar, not to whoever opened
    // this page — Director's ruling 2026-09-14, one shared draft per month.
    // With no series configured this returns an error; that is not a failure
    // here, it just means there is no slate yet and the empty state shows.
    const host = await resolveSlateHostProfileId(supabase);
    const hostProfileId = host.ok ? host.hostProfileId : null;

    const [slate, institutionsRes, seriesCountRes] = await Promise.all([
      hostProfileId ? loadStoredSlate(supabase, hostProfileId, chosen) : Promise.resolve(null),
      supabase
        .from('institutions')
        .select('id, name, display_name')
        .eq('is_active', true)
        .order('name', { ascending: true }),
      supabase
        .from('meeting_recurring_series')
        .select('id', { count: 'exact', head: true })
        .eq('is_active', true),
    ]);

    if (institutionsRes.error) return { success: false, error: institutionsRes.error.message };
    if (seriesCountRes.error) return { success: false, error: seriesCountRes.error.message };

    return {
      success: true,
      data: {
        month: chosen,
        slate,
        institutions: labelInstitutions((institutionsRes.data ?? []) as any[]),
        activeSeriesCount: seriesCountRes.count ?? 0,
      },
    };
  } catch (err: any) {
    return { success: false, error: err?.message ?? 'Could not load the proposed month.' };
  }
}

/**
 * Propose (or re-propose) a month and store it as a draft.
 *
 * Books nothing and invites nobody. Regenerating replaces the draft's items and
 * does NOT advance the rotation cursor — that happens on approval, which is not
 * built yet.
 */
export async function generateSlate(month: string): Promise<ActionResult<StoredSlate>> {
  try {
    if (!isMonthKey(month)) return { success: false, error: 'Pick a month first.' };

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { success: false, error: 'You are not signed in.' };

    // One shared draft per month, keyed to the series host's calendar — NOT to
    // the signed-in user. Two delegates preparing the same month must land on
    // the SAME draft; two drafts can each be approved and that double-books
    // everyone invited. `actorProfileId` still records who pressed the button.
    const host = await resolveSlateHostProfileId(supabase);
    if (!host.ok) return { success: false, error: host.error };

    const slate = await generateMonthlySlate(supabase, {
      month,
      hostProfileId: host.hostProfileId,
      actorProfileId: user.id,
    });

    revalidatePath('/meetings/slate');
    return { success: true, data: slate };
  } catch (err: any) {
    return { success: false, error: err?.message ?? 'Could not propose the month.' };
  }
}
