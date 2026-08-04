'use server';

// app/(routes)/meetings/adoption/actions.ts
//
// The admin half of the booking-address lock.
//
// WHY THIS FILE EXISTS
//   savePublicPage() refuses to rename a published page and tells the host:
//   "Your page is live, so its address is locked. Contact an administrator to
//   change it." On 2026-08-04 a sweep found no code anywhere that let an
//   administrator do it. The message named a person with no button, and a
//   published address was frozen forever — by omission, not by policy.
//
// WHY NO NEW PERMISSION KEY
//   Gated on is_super_admin() OR is_admin(), which is exactly what the RLS
//   policy on meeting_host_pages (mhp_host_all) already allows and exactly who
//   the host-facing message points at. A new key would have to be granted to
//   somebody before it did anything — and the same sweep found
//   meetings.routing.view registered, carried by 24 roles, and set to false on
//   all 24, leaving a finished feature unreachable since it shipped. Not
//   repeating that here.
//
// WHY A RENAME IS NOT AN UPDATE
//   The old address is retired into meeting_host_page_handles, so /meet/<old>
//   keeps working and forwards. The lock exists because "the link may already be
//   shared"; honouring that means the old link must survive the rename, not
//   merely be replaced.

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

export interface RenameHandleResult {
  success: boolean;
  error?: string;
  data?: { handle: string; previousHandle: string };
}

/** Mirrors meeting_host_pages_handle_check. The DB constraint is the authority —
 *  this exists only so a typo gets a sentence instead of a Postgres error. */
const HANDLE_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export async function renameHostHandle(input: {
  hostProfileId: string;
  newHandle: string;
  reason?: string;
}): Promise<RenameHandleResult> {
  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return { success: false, error: 'You are signed out. Please sign in and try again.' };
    }

    // --- gate ---------------------------------------------------------------
    // Checked here AND enforced by RLS. This check produces a readable refusal;
    // RLS is what makes the refusal true even if this code is wrong.
    const [{ data: isSuperAdmin }, { data: isAdmin }] = await Promise.all([
      supabase.rpc('is_super_admin'),
      supabase.rpc('is_admin'),
    ]);
    if (!isSuperAdmin && !isAdmin) {
      // Rule #27: say no out loud. Never a silent redirect — a bounce with no
      // explanation is indistinguishable from a broken page.
      return {
        success: false,
        error: 'Only an administrator can change a booking address.',
      };
    }

    const newHandle = (input.newHandle ?? '').toLowerCase().trim();
    if (!HANDLE_RE.test(newHandle) || newHandle.length < 3 || newHandle.length > 50) {
      return {
        success: false,
        error: 'Address must be 3–50 characters: lowercase letters, numbers and single hyphens.',
      };
    }

    const { data: page, error: pageError } = await supabase
      .from('meeting_host_pages')
      .select('id, handle, host_profile_id')
      .eq('host_profile_id', input.hostProfileId)
      .maybeSingle();

    if (pageError) {
      return { success: false, error: `Could not load that booking page: ${pageError.message}` };
    }
    if (!page) {
      return {
        success: false,
        error: 'That person has no booking page yet, so there is no address to change.',
      };
    }
    if (page.handle === newHandle) {
      return { success: false, error: 'That is already their address — nothing to change.' };
    }

    // --- is the new address free? ------------------------------------------
    // Asks about LIVE and RETIRED addresses in one call, so a rename can never
    // hand out an address that is still forwarding somebody else's old links.
    const { data: taken, error: takenError } = await supabase.rpc('fn_meeting_handle_taken', {
      p_handle: newHandle,
    });
    if (takenError) {
      return { success: false, error: `Could not check that address: ${takenError.message}` };
    }
    if (taken) {
      return {
        success: false,
        error: `/meet/${newHandle} is already in use, or still forwarding from a previous rename.`,
      };
    }

    // --- retire the old address BEFORE taking the new one -------------------
    // Order matters. If the insert fails we stop with the page untouched. Doing
    // it the other way round could free the old address with nothing forwarding
    // it, which is the exact silent link-breakage this feature exists to avoid.
    const { error: historyError } = await supabase
      .from('meeting_host_page_handles')
      .insert({
        host_profile_id: page.host_profile_id,
        handle: page.handle,
        retired_by: user.id,
        reason: input.reason?.trim().slice(0, 300) || null,
      });

    if (historyError) {
      return {
        success: false,
        error: `Could not preserve the old address, so nothing was changed: ${historyError.message}`,
      };
    }

    const { error: updateError } = await supabase
      .from('meeting_host_pages')
      .update({ handle: newHandle })
      .eq('id', page.id);

    if (updateError) {
      // Roll the history row back by hand — there is no transaction across two
      // PostgREST calls. Leaving it would permanently reserve an address that is
      // still live on the page, and the next rename attempt would refuse.
      await supabase
        .from('meeting_host_page_handles')
        .delete()
        .eq('host_profile_id', page.host_profile_id)
        .eq('handle', page.handle);

      const friendly = updateError.message.includes('meeting_host_pages_handle_check')
        ? 'That address is reserved by the platform. Please pick another.'
        : updateError.message;
      return { success: false, error: `Could not change the address: ${friendly}` };
    }

    revalidatePath('/meetings/adoption');
    revalidatePath('/meetings/availability');
    revalidatePath(`/meet/${newHandle}`);
    revalidatePath(`/meet/${page.handle}`);

    return { success: true, data: { handle: newHandle, previousHandle: page.handle } };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Something went wrong changing the address.',
    };
  }
}
