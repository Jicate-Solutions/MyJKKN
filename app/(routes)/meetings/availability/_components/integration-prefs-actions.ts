'use server';

// app/(routes)/meetings/availability/_components/integration-prefs-actions.ts
//
// Server actions for the host "Video provider" setting (Universal Booking
// Wave-3). Backs integration-prefs-card.tsx.
//
// Reads/writes meeting_host_integration_prefs via the
// fn_set_meeting_integration_pref RPC (migration 20260619000200). The RPC is
// SECURITY INVOKER, so RLS (mhip_host_all) scopes every write to the signed-in
// host; an explicit auth.uid() guard inside the function also blocks writing
// another host's row.
//
// Platform availability of each provider (Zoom/Teams configured?) is read here
// server-side from the env-gated service modules and passed to the client card
// — those isXConfigured() helpers read process.env and cannot run in the
// browser.
//
// meeting_host_integration_prefs is not in the generated types/supabase.ts yet
// (TS2589 class, see the sibling actions.ts), so this file uses the untyped
// client and casts the RPC call.

import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { isZoomConfigured } from '@/lib/services/integrations/zoom-service';
import { isTeamsConfigured } from '@/lib/services/integrations/teams-service';
import { isGoogleCalConfigured } from '@/lib/services/integrations/google-calendar-service';

// Matches the flat ActionResult shape used across the availability surface
// (repo compiles with strictNullChecks:false — optional fields, not a
// discriminated union).
export interface ActionResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export type VideoProvider = 'google' | 'zoom' | 'teams';

export interface IntegrationPrefsState {
  /** The host's current choice; 'google' when no row exists yet (DB default). */
  videoProvider: VideoProvider;
  /** Optional per-host identity (Zoom host email / Teams UPN). */
  providerHostIdentity: string | null;
  /** Whether each provider is set up platform-wide (env-gated). */
  availability: {
    google: boolean;
    zoom: boolean;
    teams: boolean;
  };
  /**
   * Opt-in: also put the guest's booking discussion note in the calendar event
   * TITLE. The note always appears in the event body regardless of this.
   */
  showNoteInTitle: boolean;
  /**
   * False until migration 20260813000000 is applied (it is Director-gated, so
   * this code can ship first). The card hides the toggle rather than offering a
   * setting that cannot be stored.
   */
  noteInTitleSupported: boolean;
}

const VALID_PROVIDERS: readonly VideoProvider[] = ['google', 'zoom', 'teams'];

/** PostgreSQL undefined_column — the note-in-title migration is not applied yet. */
const UNDEFINED_COLUMN = '42703';

async function untypedClient(): Promise<SupabaseClient> {
  return (await createClient()) as unknown as SupabaseClient;
}

/**
 * Load the host's current provider preference plus the platform availability of
 * each provider. A missing row is normal (defaults to 'google').
 */
export async function getIntegrationPrefs(): Promise<ActionResult<IntegrationPrefsState>> {
  try {
    const supabase = await untypedClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return { success: false, error: 'You are signed out. Please sign in and try again.' };
    }

    // Ask for show_note_in_title first; a database where migration
    // 20260813000000 has not been applied answers 42703, and we re-read without
    // it so the rest of the card keeps working.
    let noteInTitleSupported = true;
    let { data, error } = await supabase
      .from('meeting_host_integration_prefs')
      .select('video_provider, provider_host_identity, show_note_in_title')
      .eq('host_profile_id', user.id)
      .maybeSingle();

    if (error?.code === UNDEFINED_COLUMN) {
      noteInTitleSupported = false;
      ({ data, error } = await supabase
        .from('meeting_host_integration_prefs')
        .select('video_provider, provider_host_identity')
        .eq('host_profile_id', user.id)
        .maybeSingle());
    }

    if (error) {
      console.error('[meetings/availability] getIntegrationPrefs failed:', error.message);
      return { success: false, error: 'Could not load your video settings. Please try again.' };
    }

    const provider = (data?.video_provider as VideoProvider) ?? 'google';

    return {
      success: true,
      data: {
        videoProvider: VALID_PROVIDERS.includes(provider) ? provider : 'google',
        providerHostIdentity: data?.provider_host_identity ?? null,
        availability: {
          google: isGoogleCalConfigured(),
          zoom: isZoomConfigured(),
          teams: isTeamsConfigured(),
        },
        showNoteInTitle: data?.show_note_in_title === true,
        noteInTitleSupported,
      },
    };
  } catch (err) {
    console.error('[meetings/availability] getIntegrationPrefs threw:', err);
    return { success: false, error: 'Could not load your video settings. Please try again.' };
  }
}

export interface SaveIntegrationPrefInput {
  videoProvider: VideoProvider;
  /** Zoom host email / Teams UPN. Ignored for google. Empty → cleared (null). */
  providerHostIdentity?: string;
  /**
   * Also put the guest's discussion note in the calendar event title. Omitted
   * by a card whose database has no show_note_in_title column yet.
   */
  showNoteInTitle?: boolean;
}

/**
 * Persist the host's video provider choice via fn_set_meeting_integration_pref.
 * Re-enforces the platform-availability gate server-side: a host can never pick
 * a provider their institution hasn't configured, even if the client is bypassed.
 */
export async function saveIntegrationPref(
  input: SaveIntegrationPrefInput,
): Promise<ActionResult<IntegrationPrefsState>> {
  try {
    const supabase = await untypedClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return { success: false, error: 'You are signed out. Please sign in and try again.' };
    }

    const provider = input.videoProvider;
    if (!VALID_PROVIDERS.includes(provider)) {
      return { success: false, error: 'Please choose Google Meet, Zoom or Microsoft Teams.' };
    }

    // Server-side availability gate — a host must not be able to select a
    // provider their institution has not enabled. Google is the always-on
    // default (per-host OAuth), so it's allowed even if the env is incomplete;
    // Zoom/Teams require their platform credentials.
    if (provider === 'zoom' && !isZoomConfigured()) {
      return {
        success: false,
        error: 'Zoom is not enabled by your institution yet. Please choose another option.',
      };
    }
    if (provider === 'teams' && !isTeamsConfigured()) {
      return {
        success: false,
        error: 'Microsoft Teams is not enabled by your institution yet. Please choose another option.',
      };
    }

    // Identity only applies to Zoom/Teams; clear it for google. Trim + cap to
    // the column's 320-char limit, empty → null.
    let identity: string | null = null;
    if (provider !== 'google') {
      const trimmed = (input.providerHostIdentity ?? '').trim();
      identity = trimmed.length > 0 ? trimmed.slice(0, 320) : null;
    }

    const { error } = await (supabase as SupabaseClient).rpc(
      'fn_set_meeting_integration_pref',
      {
        p_video_provider: provider,
        p_provider_host_identity: identity,
      },
    );

    if (error) {
      console.error('[meetings/availability] saveIntegrationPref failed:', error.message);
      return { success: false, error: 'Could not save your video settings. Please try again.' };
    }

    // Note-in-title lives on the same row, which the RPC above has just
    // upserted — so a plain UPDATE always finds it. Sent only when the card
    // offered the toggle; a failure here is reported, never swallowed.
    let showNoteInTitle = false;
    let noteInTitleSupported = true;
    if (input.showNoteInTitle !== undefined) {
      showNoteInTitle = input.showNoteInTitle === true;
      const { error: noteError } = await supabase
        .from('meeting_host_integration_prefs')
        .update({ show_note_in_title: showNoteInTitle })
        .eq('host_profile_id', user.id);
      if (noteError) {
        console.error(
          '[meetings/availability] saveIntegrationPref note-in-title failed:',
          noteError.message,
        );
        return {
          success: false,
          error:
            'Your video provider was saved, but the calendar title setting could not be. Please try again.',
        };
      }
    } else {
      // The card omits the toggle when the column is absent; keep reporting it
      // as unsupported so the refreshed state does not grow a phantom control.
      noteInTitleSupported = false;
    }

    return {
      success: true,
      data: {
        videoProvider: provider,
        providerHostIdentity: identity,
        availability: {
          google: isGoogleCalConfigured(),
          zoom: isZoomConfigured(),
          teams: isTeamsConfigured(),
        },
        showNoteInTitle,
        noteInTitleSupported,
      },
    };
  } catch (err) {
    console.error('[meetings/availability] saveIntegrationPref threw:', err);
    return { success: false, error: 'Could not save your video settings. Please try again.' };
  }
}
