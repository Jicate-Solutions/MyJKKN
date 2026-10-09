'use server';

// app/(routes)/hr/admin/policies/pay-scales/actions.ts
//
// Serves the JKKN reference pay ladders to the Pay Scales page.
//
// WHY A SERVER ACTION, NOT A CLIENT IMPORT
//   The ladders are the institution's salary band. Imported into the client
//   editor they would ship inside a public /_next/static file that anyone,
//   signed in or not, can download. Kept here, they leave the server only for
//   a super administrator, the same audience the page itself allows.
//
// REFERENCE ONLY (Director ruling 2026-09-18): this returns figures to look at.
// It writes nothing, and nobody's pay changes because of it.

import { createClient } from '@/lib/supabase/server';
import {
  referenceLaddersFor,
  referenceNotesFor,
} from '@/lib/hr/pay-scales/jkkn-reference-ladders';
import type { PayLadder } from '@/types/hr-pay-ladders';

export type ReferencePayLaddersResult =
  | { success: true; ladders: PayLadder[]; notes: string[] }
  | { success: false; error: string };

export async function getReferencePayLadders(
  institutionId: string
): Promise<ReferencePayLaddersResult> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return { success: false, error: 'You are signed out. Please sign in and try again.' };
    }

    const { data: isSuperAdmin, error: roleError } = await supabase.rpc('is_super_admin');
    if (roleError) {
      // The database's own wording stays in the server log, not on the screen.
      console.error('[hr/pay-scales] is_super_admin check failed:', roleError);
      return { success: false, error: 'Could not confirm your access. Please try again.' };
    }
    if (!isSuperAdmin) {
      // Rule #27: refuse out loud, never an empty list that reads as "no band".
      return {
        success: false,
        error: 'Only a super administrator can see the reference pay band.',
      };
    }

    return {
      success: true,
      ladders: referenceLaddersFor(institutionId),
      notes: referenceNotesFor(institutionId),
    };
  } catch (err) {
    console.error('[hr/pay-scales] reference ladders failed:', err);
    return { success: false, error: 'Could not load the reference pay band.' };
  }
}
