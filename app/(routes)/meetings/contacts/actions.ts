'use server';

// app/(routes)/meetings/contacts/actions.ts
//
// Server actions for the M6 "Contacts" surface. The roster reads happen in the
// page (server component) via MeetingContactsService against the RLS client;
// this file holds only the mutation (save host notes) and a small fetch helper
// the client drawer uses to lazily load a contact's booking timeline.
//
// AUTH: host_profile_id is resolved from auth.getUser() — never trusted from
// the client. RLS on meeting_contacts additionally enforces host_profile_id =
// auth.uid() on the write, so even a forged action payload cannot write another
// host's row.

import { revalidatePath } from 'next/cache';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import {
  MeetingContactsService,
  type ContactDetail,
} from '@/lib/services/meetings/meeting-contacts-service';

// The meeting_* tables aren't in generated types (TS2589 class) — untyped
// client, matching the availability/inbox surfaces.
async function untypedClient(): Promise<SupabaseClient> {
  return (await createClient()) as unknown as SupabaseClient;
}

export interface SaveNotesResult {
  success: boolean;
  error?: string;
}

/**
 * Save (upsert) the current host's private notes + optional corrected
 * name/phone for one contact, keyed by email.
 */
export async function saveContactNotes(input: {
  email: string;
  notes?: string | null;
  name?: string | null;
  phone?: string | null;
}): Promise<SaveNotesResult> {
  const supabase = await untypedClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return { success: false, error: 'Not authenticated' };
  }

  if (!input.email || !input.email.trim()) {
    return { success: false, error: 'Missing contact email' };
  }

  const result = await MeetingContactsService.upsertContactNotes(supabase, user.id, {
    email: input.email,
    notes: input.notes ?? null,
    name: input.name ?? null,
    phone: input.phone ?? null,
  });

  if (result.success) {
    revalidatePath('/meetings/contacts');
  }
  return result;
}

/**
 * Load one contact's full detail (roster row + booking timeline). Used by the
 * client drawer when a contact row is opened. Returns null if the email never
 * booked the current host.
 */
export async function getContactDetailAction(
  email: string,
): Promise<ContactDetail | null> {
  const supabase = await untypedClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return null;

  return MeetingContactsService.getContactDetail(supabase, email);
}
