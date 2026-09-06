'use server';

// app/(routes)/meetings/embed/actions.ts
//
// Universal Booking M7 — server actions for the admin "Embed & Theming" page.
//
//   getMyEmbedState()      — current host's handle + saved theme color +
//                            whether their page is public (so the UI can warn
//                            "set up your booking page first").
//   saveMyThemeColor(hex)  — persist meeting_host_pages.theme_color for the
//                            signed-in host. Scoped by host_profile_id =
//                            auth.uid(); the existing RLS policy enforces it.
//
// No new RPC, no service-role write — all writes go through the user's own
// authenticated client so RLS is the access control. Auth failures are
// explicit (rule #27), never a silent redirect.

import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { HEX_COLOR_RE } from '@/lib/services/meetings/meeting-embed-service';

export interface ActionResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface MyEmbedState {
  /** The host's public handle, or null if they haven't created a page yet. */
  handle: string | null;
  /** Saved brand color (#RRGGBB) or null = platform default. */
  themeColor: string | null;
  /** True only when the page exists AND is public (embed is live). */
  isPublic: boolean;
}

/**
 * meeting_host_pages is in the generated types, but to keep this module
 * self-contained and avoid TS2589-class friction on the untyped scheduling
 * tables it sometimes sits beside, read/write through an untyped client.
 */
async function untypedClient(): Promise<SupabaseClient> {
  return (await createClient()) as unknown as SupabaseClient;
}

export async function getMyEmbedState(): Promise<ActionResult<MyEmbedState>> {
  try {
    const supabase = await untypedClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return { success: false, error: 'You are signed out. Please sign in and try again.' };
    }

    const { data: page, error } = await supabase
      .from('meeting_host_pages')
      .select('handle, theme_color, is_public, auto_hidden')
      .eq('host_profile_id', user.id)
      .maybeSingle();

    if (error) {
      return { success: false, error: 'Could not load your booking page settings.' };
    }

    return {
      success: true,
      data: {
        handle: (page?.handle as string | undefined) ?? null,
        themeColor: (page?.theme_color as string | undefined) ?? null,
        isPublic: Boolean(page?.is_public) && !page?.auto_hidden,
      },
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unexpected error loading embed settings.',
    };
  }
}

export async function saveMyThemeColor(hex: string): Promise<ActionResult<MyEmbedState>> {
  try {
    const normalized = (hex ?? '').trim();
    if (!HEX_COLOR_RE.test(normalized)) {
      return { success: false, error: 'Please choose a valid color (e.g. #0E4D34).' };
    }

    const supabase = await untypedClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return { success: false, error: 'You are signed out. Please sign in and try again.' };
    }

    // The host must already have a page row (created on /meetings/availability
    // at opt-in). We update only the color; we never create the row here so we
    // don't bypass the handle/opt-in flow that owns that lifecycle.
    const { data: updated, error } = await supabase
      .from('meeting_host_pages')
      .update({ theme_color: normalized, updated_at: new Date().toISOString() })
      .eq('host_profile_id', user.id)
      .select('handle, theme_color, is_public, auto_hidden')
      .maybeSingle();

    if (error) {
      return { success: false, error: 'Could not save your brand color.' };
    }
    if (!updated) {
      return {
        success: false,
        error:
          'Set up your public booking page first (Meetings → My Availability) before choosing a brand color.',
      };
    }

    return {
      success: true,
      data: {
        handle: (updated.handle as string | undefined) ?? null,
        themeColor: (updated.theme_color as string | undefined) ?? null,
        isPublic: Boolean(updated.is_public) && !updated.auto_hidden,
      },
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unexpected error saving brand color.',
    };
  }
}
