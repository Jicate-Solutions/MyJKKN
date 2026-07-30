'use server';

// app/(routes)/meetings/availability/_components/delegates-actions.ts
//
// Server actions for "Who can manage my calendar" — a host names a delegate
// (typically a PA) who can see that host's meetings on /calendar.
//
// Director, 2026-07-30: the Dental PA needed the principal's calendar and had
// been given the `principal` ROLE to get it. That made the platform think the
// college had two principals AND — because the auto-meeting engine refuses to
// book when any participant has no Google Calendar connection — silently
// blocked every meeting that college would ever have been given.
//
// Writes go straight to meeting_host_delegates under RLS (mhd_insert/mhd_delete
// scope every write to host_profile_id = auth.uid()), so there is no SECURITY
// DEFINER surface to lock down here. host_profile_id is taken from the session,
// never from the client.
//
// meeting_host_delegates is not in the generated types/supabase.ts yet, so this
// file uses the untyped client — same reason as the sibling
// integration-prefs-actions.ts.

import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';

// Flat ActionResult shape used across the availability surface (the repo
// compiles with strictNullChecks:false — optional fields, not a union).
export interface ActionResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface Delegate {
  delegateProfileId: string;
  fullName: string;
  email: string;
}

async function untypedClient(): Promise<SupabaseClient> {
  return (await createClient()) as unknown as SupabaseClient;
}

/** Everyone the signed-in host has given access to their calendar. */
export async function getMyDelegates(): Promise<ActionResult<Delegate[]>> {
  try {
    const supabase = await untypedClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return { success: false, error: 'You are signed out. Please sign in and try again.' };
    }

    const { data, error } = await supabase
      .from('meeting_host_delegates')
      .select('delegate_profile_id, profiles!meeting_host_delegates_delegate_profile_id_fkey(full_name, email)')
      .eq('host_profile_id', user.id)
      .eq('is_active', true)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('[meetings/availability] getMyDelegates failed:', error.message);
      return { success: false, error: 'Could not load who can manage your calendar.' };
    }

    const delegates: Delegate[] = ((data ?? []) as any[]).map((r) => ({
      delegateProfileId: r.delegate_profile_id,
      fullName: r.profiles?.full_name ?? 'Unknown person',
      email: r.profiles?.email ?? '',
    }));

    return { success: true, data: delegates };
  } catch (err) {
    console.error('[meetings/availability] getMyDelegates threw:', err);
    return { success: false, error: 'Could not load who can manage your calendar.' };
  }
}

/**
 * Give someone access to the signed-in host's calendar, by their JKKN email.
 * Looked up by email rather than exposing a people-picker of every profile.
 */
export async function addDelegate(email: string): Promise<ActionResult<Delegate>> {
  try {
    const supabase = await untypedClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return { success: false, error: 'You are signed out. Please sign in and try again.' };
    }

    const wanted = (email ?? '').trim().toLowerCase();
    if (!wanted) {
      return { success: false, error: 'Please enter the person’s email address.' };
    }

    const { data: person, error: lookupError } = await supabase
      .from('profiles')
      .select('id, full_name, email, is_active')
      .ilike('email', wanted)
      .maybeSingle();

    if (lookupError) {
      console.error('[meetings/availability] addDelegate lookup failed:', lookupError.message);
      return { success: false, error: 'Could not look that person up. Please try again.' };
    }
    if (!person) {
      return { success: false, error: `No MyJKKN account found for ${wanted}.` };
    }
    if (!person.is_active) {
      return { success: false, error: `${person.full_name} is no longer active in MyJKKN.` };
    }
    if (person.id === user.id) {
      return { success: false, error: 'You already have access to your own calendar.' };
    }

    // RLS (mhd_insert) independently enforces host_profile_id = auth.uid().
    const { error: insertError } = await supabase
      .from('meeting_host_delegates')
      .upsert(
        {
          host_profile_id: user.id,
          delegate_profile_id: person.id,
          is_active: true,
          created_by: user.id,
        },
        { onConflict: 'host_profile_id,delegate_profile_id' },
      );

    if (insertError) {
      console.error('[meetings/availability] addDelegate failed:', insertError.message);
      return { success: false, error: 'Could not give that person access. Please try again.' };
    }

    return {
      success: true,
      data: {
        delegateProfileId: person.id,
        fullName: person.full_name ?? 'Unknown person',
        email: person.email ?? wanted,
      },
    };
  } catch (err) {
    console.error('[meetings/availability] addDelegate threw:', err);
    return { success: false, error: 'Could not give that person access. Please try again.' };
  }
}

/** Take a delegate's access away. */
export async function removeDelegate(delegateProfileId: string): Promise<ActionResult<null>> {
  try {
    const supabase = await untypedClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return { success: false, error: 'You are signed out. Please sign in and try again.' };
    }
    if (!delegateProfileId) {
      return { success: false, error: 'Nothing to remove.' };
    }

    // host_profile_id is pinned to the session here AND by RLS (mhd_delete), so
    // a tampered client cannot revoke somebody else's delegate.
    const { error } = await supabase
      .from('meeting_host_delegates')
      .delete()
      .eq('host_profile_id', user.id)
      .eq('delegate_profile_id', delegateProfileId);

    if (error) {
      console.error('[meetings/availability] removeDelegate failed:', error.message);
      return { success: false, error: 'Could not remove that person. Please try again.' };
    }

    return { success: true, data: null };
  } catch (err) {
    console.error('[meetings/availability] removeDelegate threw:', err);
    return { success: false, error: 'Could not remove that person. Please try again.' };
  }
}
