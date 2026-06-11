'use server';

// app/(routes)/meetings/manage/actions.ts
//
// Server actions for the NATIVE "Manage Meeting Types" page (Path W).
//
// These replace the broken cross-origin Cal.com iframe editor. They call the
// Cal.com v2 REST API server-side, authenticated with the CURRENT MyJKKN user's
// per-user vaulted API key — so the user manages their own event types inside
// MyJKKN, with their MyJKKN identity, and never sees a separate Cal.com login.
//
// Flow per action:
//   1. Resolve the current user (createClient + auth.getUser()).
//      → If unauthenticated, return an EXPLICIT error (never silently redirect — rule #27).
//   2. JicateBookingProvisionService.ensureProvisioned(...) — idempotent; guarantees
//      the user has a Cal.com User + vaulted API key before we fetch anything.
//   3. Build a CalComApiClient bound to the user's decrypted key and call the
//      matching method.
//
// SECURITY: the plaintext API key never leaves the server and is NEVER logged.
//
// NOTE FOR THE LEAD: lib/services/integrations/cal-com-api-client.ts exports
// getCalClientForUser() as a NotImplemented STUB (it throws). The real factory
// was never shipped. To stay inside the file allowlist (manage/** only) we
// compose the client here from the two real building blocks that DO exist:
// CalApiKeyVault.get() (decrypts the key) + new CalComApiClient(key). This is
// the exact composition the stub's docstring describes. If a real
// getCalClientForUser lands later, swap the helper below for a single import.

import { createClient } from '@/lib/supabase/server';
import { CalApiKeyVault } from '@/lib/services/integrations/cal-api-key-vault';
import {
  CalComApiClient,
  CalAuthError,
  CalNotFoundError,
  CalRateLimitError,
  type CalComEventType,
  type CalComEventTypeCreateInput,
} from '@/lib/services/integrations/cal-com-api-client';
import { JicateBookingProvisionService } from '@/lib/services/integrations/jicate-booking-provision-service';

// ============================================================================
// RESULT TYPES
// ============================================================================

// NOTE: the repo runs with strictNullChecks:false (tsconfig.json), under which
// TypeScript CANNOT narrow a discriminated union by its `success` literal.
// A flat optional-field shape is the pattern that type-checks here — callers
// branch on `res.success` and then read `res.data` / `res.error` (both optional).
export interface ActionResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

/** Subset of event-type fields the manage UI renders / round-trips. */
export interface ManageEventType {
  id: number;
  title: string;
  slug: string;
  lengthInMinutes: number;
  hidden: boolean;
  description: string | null;
}

/** Payload accepted by create / update from the client. */
export interface EventTypeFormInput {
  title: string;
  slug: string;
  lengthInMinutes: number;
  description?: string;
  /** Update-only: toggle visibility on the booking page. */
  hidden?: boolean;
}

// ============================================================================
// INTERNAL: resolve current user + provision + bound Cal.com client
// ============================================================================

/**
 * Resolve the current MyJKKN user, ensure they're provisioned on jicate-booking,
 * and return a CalComApiClient authenticated with their vaulted key.
 *
 * Throws a tagged Error on any failure; callers convert it to a structured
 * { success: false, error } via toErrorResult().
 */
async function getUserScopedCalClient(): Promise<CalComApiClient> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    // Explicit — never silently redirect (rule #27).
    throw new Error('NOT_AUTHENTICATED');
  }

  // Idempotent: fast-returns if the user already has a vaulted key.
  await JicateBookingProvisionService.ensureProvisioned({
    myjkknUserId: user.id,
    email: user.email ?? '',
    name:
      (user.user_metadata?.full_name as string | undefined) ??
      (user.user_metadata?.name as string | undefined),
  });

  const stored = await CalApiKeyVault.get(user.id);
  if (!stored) {
    // ensureProvisioned should have created this; if it's still missing the
    // provision flow failed silently upstream — surface it, don't blank-screen.
    throw new Error('NOT_PROVISIONED');
  }

  return new CalComApiClient(stored.cal_api_key);
}

/** Map a thrown error to a user-facing message without leaking internals/keys. */
function toErrorResult<T>(err: unknown, verb: string): ActionResult<T> {
  if (err instanceof Error) {
    switch (err.message) {
      case 'NOT_AUTHENTICATED':
        return {
          success: false,
          error: 'You are signed out. Please sign in to MyJKKN and try again.',
        };
      case 'NOT_PROVISIONED':
        return {
          success: false,
          error:
            'Your booking account is not set up yet. Refresh the page; if this persists, contact support.',
        };
    }
  }

  if (err instanceof CalAuthError) {
    return {
      success: false,
      error:
        'Your booking connection has expired. Refresh the page to reconnect; if this persists, contact support.',
    };
  }
  if (err instanceof CalNotFoundError) {
    return {
      success: false,
      error: 'That meeting type no longer exists. Refresh the list and try again.',
    };
  }
  if (err instanceof CalRateLimitError) {
    return {
      success: false,
      error: 'Too many requests right now. Please wait a minute and try again.',
    };
  }

  console.error(`[meetings/manage] ${verb} failed:`, err);
  return {
    success: false,
    error: `Could not ${verb}. Please try again.`,
  };
}

/** Project the full Cal.com event-type onto the lean UI shape. */
function toManageEventType(e: CalComEventType): ManageEventType {
  return {
    id: e.id,
    title: e.title,
    slug: e.slug,
    lengthInMinutes: e.lengthInMinutes,
    hidden: Boolean(e.hidden),
    description: e.description ?? null,
  };
}

// ============================================================================
// INPUT NORMALISATION
// ============================================================================

/** Cal.com-safe slug: lowercase, hyphenated, trimmed. */
function normaliseSlug(raw: string): string {
  return raw
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

function validateForm(
  input: EventTypeFormInput,
): { ok: boolean; value?: CalComEventTypeCreateInput; error?: string } {
  const title = input.title?.trim() ?? '';
  if (title.length === 0) return { ok: false, error: 'Title is required.' };
  if (title.length > 200) return { ok: false, error: 'Title is too long (max 200 characters).' };

  const slug = normaliseSlug(input.slug || title);
  if (slug.length === 0) {
    return { ok: false, error: 'Slug must contain at least one letter or number.' };
  }

  const len = Number(input.lengthInMinutes);
  if (!Number.isFinite(len) || len <= 0) {
    return { ok: false, error: 'Duration must be a positive number of minutes.' };
  }
  if (len > 1440) {
    return { ok: false, error: 'Duration cannot exceed 24 hours (1440 minutes).' };
  }

  const description = input.description?.trim();

  return {
    ok: true,
    value: {
      title,
      slug,
      lengthInMinutes: Math.round(len),
      ...(description ? { description } : {}),
    },
  };
}

// ============================================================================
// ACTIONS
// ============================================================================

/**
 * List the current user's Cal.com event types (lean shape).
 */
export async function listMyEventTypes(): Promise<ActionResult<ManageEventType[]>> {
  try {
    const cal = await getUserScopedCalClient();
    const eventTypes = await cal.listEventTypes();
    return { success: true, data: eventTypes.map(toManageEventType) };
  } catch (err) {
    return toErrorResult(err, 'load your meeting types');
  }
}

/**
 * Create a new event type for the current user.
 */
export async function createMyEventType(
  input: EventTypeFormInput,
): Promise<ActionResult<ManageEventType>> {
  const validated = validateForm(input);
  if (!validated.ok) return { success: false, error: validated.error };

  try {
    const cal = await getUserScopedCalClient();
    const created = await cal.createEventType(validated.value);
    return { success: true, data: toManageEventType(created) };
  } catch (err) {
    return toErrorResult(err, 'create the meeting type');
  }
}

/**
 * Update an existing event type. Partial — only provided fields change.
 */
export async function updateMyEventType(
  id: number,
  input: EventTypeFormInput,
): Promise<ActionResult<ManageEventType>> {
  if (!Number.isFinite(id) || id <= 0) {
    return { success: false, error: 'Invalid meeting type reference.' };
  }

  const validated = validateForm(input);
  if (!validated.ok) return { success: false, error: validated.error };

  // hidden is an update-only toggle not covered by validateForm's create shape.
  const patch: Partial<CalComEventTypeCreateInput> = { ...validated.value };
  if (typeof input.hidden === 'boolean') patch.hidden = input.hidden;

  try {
    const cal = await getUserScopedCalClient();
    const updated = await cal.updateEventType(id, patch);
    return { success: true, data: toManageEventType(updated) };
  } catch (err) {
    return toErrorResult(err, 'update the meeting type');
  }
}

/**
 * Delete an event type.
 */
export async function deleteMyEventType(id: number): Promise<ActionResult<{ id: number }>> {
  if (!Number.isFinite(id) || id <= 0) {
    return { success: false, error: 'Invalid meeting type reference.' };
  }

  try {
    const cal = await getUserScopedCalClient();
    await cal.deleteEventType(id);
    return { success: true, data: { id } };
  } catch (err) {
    return toErrorResult(err, 'delete the meeting type');
  }
}
