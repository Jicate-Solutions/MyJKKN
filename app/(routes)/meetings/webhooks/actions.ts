'use server';

// app/(routes)/meetings/webhooks/actions.ts
//
// MODULE 9 — server actions for the host-owned webhooks admin page.
// Every action resolves the signed-in user as host_profile_id and operates
// through the RLS-scoped server client (createClient) so a host can only ever
// touch their own webhooks. The MeetingWebhookService holds the data logic.
//
// repo compiles with strictNullChecks:false — flat optional-field ActionResult.

import { revalidatePath } from 'next/cache';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import {
  MeetingWebhookService,
  type MeetingWebhook,
  type MeetingWebhookDelivery,
  type WebhookEvent,
} from '@/lib/services/meetings/meeting-webhook-service';

export interface ActionResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

async function resolveHost(): Promise<
  { client: SupabaseClient; hostId: string } | { error: string }
> {
  const supabase = (await createClient()) as unknown as SupabaseClient;
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return { error: 'You must be signed in.' };
  return { client: supabase, hostId: user.id };
}

export async function listMyWebhooks(): Promise<ActionResult<MeetingWebhook[]>> {
  const ctx = await resolveHost();
  if ('error' in ctx) return { success: false, error: ctx.error };
  const data = await MeetingWebhookService.listForHost(ctx.client, ctx.hostId);
  return { success: true, data };
}

export async function listMyDeliveries(): Promise<ActionResult<MeetingWebhookDelivery[]>> {
  const ctx = await resolveHost();
  if ('error' in ctx) return { success: false, error: ctx.error };
  const data = await MeetingWebhookService.listDeliveriesForHost(ctx.client, ctx.hostId);
  return { success: true, data };
}

export async function createWebhook(input: {
  name: string;
  targetUrl: string;
  events?: WebhookEvent[];
}): Promise<ActionResult<MeetingWebhook>> {
  const ctx = await resolveHost();
  if ('error' in ctx) return { success: false, error: ctx.error };
  const res = await MeetingWebhookService.create(ctx.client, {
    hostProfileId: ctx.hostId,
    name: input.name,
    targetUrl: input.targetUrl,
    events: input.events,
  });
  if (!res.success) return { success: false, error: res.error };
  revalidatePath('/meetings/webhooks');
  return { success: true, data: res.data };
}

export async function updateWebhook(
  id: string,
  input: { name?: string; targetUrl?: string; events?: WebhookEvent[]; isActive?: boolean },
): Promise<ActionResult<MeetingWebhook>> {
  const ctx = await resolveHost();
  if ('error' in ctx) return { success: false, error: ctx.error };
  const res = await MeetingWebhookService.update(ctx.client, id, input);
  if (!res.success) return { success: false, error: res.error };
  revalidatePath('/meetings/webhooks');
  return { success: true, data: res.data };
}

export async function deleteWebhook(id: string): Promise<ActionResult<{ id: string }>> {
  const ctx = await resolveHost();
  if ('error' in ctx) return { success: false, error: ctx.error };
  const res = await MeetingWebhookService.remove(ctx.client, id);
  if (!res.success) return { success: false, error: res.error };
  revalidatePath('/meetings/webhooks');
  return { success: true, data: res.data };
}
