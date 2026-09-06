'use server';

// app/(routes)/meetings/series/rules/actions.ts
//
// Server actions for the scheduling rules — piece 2 of the Monthly Slate spec.
//
// Two rules, both the EAO's to set rather than baked into code:
//   * BLOCKED PERIODS — public holidays and festivals only. Travel deliberately
//     does NOT appear: a travel week turns a series online (may_be_online on the
//     series) instead of blocking it, so a 'travel' block kind would encode the
//     opposite of the Director's decision.
//   * ROTATION ORDER — one order over the units, deciding who yields when two
//     want the same slot.
//
// There is no "maximum meetings per day" here, by decision.
//
// RLS-scoped anon client throughout: the migration's policies are the access
// answer, not a check duplicated in this file.

import { createClient } from '@/lib/supabase/server';
import { isBlockKind, type BlockKind } from '@/lib/services/meetings/recurring-series-config';
import type { ActionResult, InstitutionOption } from '../actions';

export interface BlockedPeriod {
  id: string;
  name: string;
  blockKind: BlockKind;
  startsOn: string;
  endsOn: string;
  /** null = the period blocks every unit. */
  institutionId: string | null;
  isActive: boolean;
  notes: string | null;
}

export interface BlockedPeriodInput {
  name: string;
  blockKind: BlockKind;
  startsOn: string;
  endsOn: string;
  institutionId?: string | null;
  notes?: string | null;
}

export interface RotationEntry {
  institutionId: string;
  position: number;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function listBlockedPeriods(): Promise<ActionResult<BlockedPeriod[]>> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('meeting_blocked_periods')
      .select('id, name, block_kind, starts_on, ends_on, institution_id, is_active, notes')
      .order('starts_on', { ascending: true });
    if (error) return { success: false, error: error.message };
    return {
      success: true,
      data: ((data ?? []) as any[]).map((r) => ({
        id: r.id,
        name: r.name,
        blockKind: r.block_kind,
        startsOn: r.starts_on,
        endsOn: r.ends_on,
        institutionId: r.institution_id ?? null,
        isActive: Boolean(r.is_active),
        notes: r.notes ?? null,
      })),
    };
  } catch (err: any) {
    return { success: false, error: err?.message ?? 'Could not load the blocked periods.' };
  }
}

export async function createBlockedPeriod(
  input: BlockedPeriodInput,
): Promise<ActionResult<{ id: string }>> {
  try {
    if (!input.name || !input.name.trim()) return { success: false, error: 'Give it a name.' };
    if (!isBlockKind(input.blockKind)) {
      return { success: false, error: 'Pick whether this is a public holiday or a festival.' };
    }
    if (!ISO_DATE.test(input.startsOn ?? '') || !ISO_DATE.test(input.endsOn ?? '')) {
      return { success: false, error: 'Pick a start and an end date.' };
    }
    if (input.endsOn < input.startsOn) {
      return { success: false, error: 'The end date cannot be before the start date.' };
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { success: false, error: 'You are not signed in.' };

    const { data, error } = await supabase
      .from('meeting_blocked_periods')
      .insert({
        name: input.name.trim(),
        block_kind: input.blockKind,
        starts_on: input.startsOn,
        ends_on: input.endsOn,
        institution_id: input.institutionId || null,
        notes: input.notes?.trim() || null,
        created_by: user.id,
      })
      .select('id')
      .single();
    if (error) return { success: false, error: error.message };
    return { success: true, data: { id: (data as any).id } };
  } catch (err: any) {
    return { success: false, error: err?.message ?? 'Could not add the blocked period.' };
  }
}

export async function setBlockedPeriodActive(
  id: string,
  isActive: boolean,
): Promise<ActionResult<null>> {
  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from('meeting_blocked_periods')
      .update({ is_active: isActive })
      .eq('id', id);
    if (error) return { success: false, error: error.message };
    return { success: true, data: null };
  } catch (err: any) {
    return { success: false, error: err?.message ?? 'Could not update the blocked period.' };
  }
}

export async function deleteBlockedPeriod(id: string): Promise<ActionResult<null>> {
  try {
    const supabase = await createClient();
    const { error } = await supabase.from('meeting_blocked_periods').delete().eq('id', id);
    if (error) return { success: false, error: error.message };
    return { success: true, data: null };
  } catch (err: any) {
    return { success: false, error: err?.message ?? 'Could not remove the blocked period.' };
  }
}

export async function listRotationOrder(): Promise<ActionResult<RotationEntry[]>> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('meeting_rotation_order')
      .select('institution_id, position')
      .order('position', { ascending: true });
    if (error) return { success: false, error: error.message };
    return {
      success: true,
      data: ((data ?? []) as any[]).map((r) => ({
        institutionId: r.institution_id,
        position: r.position,
      })),
    };
  } catch (err: any) {
    return { success: false, error: err?.message ?? 'Could not load the rotation order.' };
  }
}

/**
 * Replace the whole rotation order.
 *
 * Positions are re-numbered 0..n-1 from the submitted sequence rather than
 * trusted: an order with two units both at position 3 is not an order, and the
 * unique constraint is on the institution, not the position.
 */
export async function saveRotationOrder(
  institutionIds: string[],
): Promise<ActionResult<null>> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { success: false, error: 'You are not signed in.' };

    const seen = new Set<string>();
    const ordered = institutionIds.filter((id) => {
      if (!id || seen.has(id)) return false;
      seen.add(id);
      return true;
    });

    const { error: delError } = await supabase
      .from('meeting_rotation_order')
      .delete()
      .not('id', 'is', null);
    if (delError) return { success: false, error: delError.message };

    if (ordered.length > 0) {
      const { error } = await supabase.from('meeting_rotation_order').insert(
        ordered.map((institutionId, index) => ({
          institution_id: institutionId,
          position: index,
          created_by: user.id,
        })),
      );
      if (error) return { success: false, error: error.message };
    }
    return { success: true, data: null };
  } catch (err: any) {
    return { success: false, error: err?.message ?? 'Could not save the rotation order.' };
  }
}

/** Re-exported so the rules screen imports its pickers from one place. */
export async function listRuleInstitutions(): Promise<ActionResult<InstitutionOption[]>> {
  const { listInstitutionOptions } = await import('../actions');
  return listInstitutionOptions();
}
