'use server';

// app/(routes)/meetings/availability/actions.ts
//
// Server actions for the NATIVE "My Availability" page (replaces the broken
// cross-origin Cal.com iframe in page.tsx — see the page header for the why).
//
// These actions call jicate-booking's Cal.com v2 REST API SERVER-SIDE only,
// using the per-user "Path W" vaulted API key. The plaintext key NEVER reaches
// the browser and is NEVER logged.
//
// Flow for every action:
//   1. createClient().auth.getUser()  → resolve the current MyJKKN user.
//      If there is no user we return an explicit structured error — NEVER a
//      silent redirect (CLAUDE.md rule #27).
//   2. JicateBookingProvisionService.ensureProvisioned(...)  → idempotent
//      auto-provision of the Cal.com user + vaulted key (fast-path < 5ms once
//      provisioned).
//   3. Build a CalComApiClient bound to this user's decrypted key and call the
//      schedule read/write methods.
//
// IMPORTANT — why we assemble the client here instead of getCalClientForUser():
//   lib/services/integrations/cal-com-api-client.ts exports getCalClientForUser
//   as a NotImplemented STUB (Phase 1 PR-C never landed). The real building
//   blocks DO exist and are in our allowed import set:
//     - JicateBookingProvisionService.ensureProvisioned (provision + vault.set)
//     - CalApiKeyVault.get (decrypts plaintext key + returns cal_user_id)
//     - new CalComApiClient(plaintextKey) (constructor takes a plaintext key)
//   We compose those three here, inside our own action file, so we do not have
//   to edit any out-of-lane building-block file. If/when getCalClientForUser is
//   implemented, getCalForCurrentUser() below can be swapped to call it.

import { createClient } from '@/lib/supabase/server';
import { JicateBookingProvisionService } from '@/lib/services/integrations/jicate-booking-provision-service';
import { CalApiKeyVault } from '@/lib/services/integrations/cal-api-key-vault';
import {
  CalComApiClient,
  type CalComSchedule,
  type CalComScheduleAvailability,
} from '@/lib/services/integrations/cal-com-api-client';

// ──────────────────────────────────────────────────────────────────────────
// Result envelope — every action returns { success, data? , error? }
// ──────────────────────────────────────────────────────────────────────────

// NOTE: this is a single optional-field shape, NOT a discriminated union.
// This repo compiles with strictNullChecks:false, under which TypeScript does
// NOT narrow `{success:true,data} | {success:false,error}` on the `success`
// flag — every `.data`/`.error` access at a call site then errors. A flat
// shape with optional fields avoids that trap. Callers check `success` then
// read `data`/`error` (which are `T | undefined` / `string | undefined`).
export interface ActionResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Shape the editor needs: the schedule id we are editing, its timezone, the
 * weekly availability windows, and the schedule name (for display only).
 */
export interface MyScheduleData {
  scheduleId: number;
  name: string;
  timeZone: string;
  availability: CalComScheduleAvailability[];
}

// ──────────────────────────────────────────────────────────────────────────
// Internal: resolve current user + a Cal client bound to their key
// ──────────────────────────────────────────────────────────────────────────

interface ResolvedCal {
  client: CalComApiClient;
  calUserId: number;
}

/**
 * Resolve the current MyJKKN user, ensure they are provisioned on
 * jicate-booking, and return a Cal.com API client bound to their key.
 *
 * Throws a plain Error with a user-safe message on any failure; callers wrap
 * this in try/catch and convert to a structured { success:false, error }.
 */
async function getCalForCurrentUser(): Promise<ResolvedCal> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  // Explicit auth failure — never a silent redirect (rule #27).
  if (authError || !user) {
    throw new Error('You are not signed in. Please sign in to MyJKKN and try again.');
  }

  // Idempotent auto-provision (creates the Cal.com user + vaulted key on first
  // call; < 5ms fast-path afterwards). Must run BEFORE reading the vault.
  await JicateBookingProvisionService.ensureProvisioned({
    myjkknUserId: user.id,
    email: user.email ?? '',
    name:
      (user.user_metadata?.full_name as string | undefined) ??
      (user.user_metadata?.name as string | undefined),
  });

  const stored = await CalApiKeyVault.get(user.id);
  if (!stored) {
    // Provisioning just ran, so this should not happen — but handle it
    // explicitly rather than letting a null deref blow up later.
    throw new Error(
      'Your booking account is still being set up. Please refresh in a moment and try again.',
    );
  }

  return {
    client: new CalComApiClient(stored.cal_api_key),
    calUserId: stored.cal_user_id,
  };
}

/**
 * Pick the schedule the user edits. We edit the DEFAULT schedule
 * (isDefault === true) when one exists; otherwise the first schedule returned.
 */
function pickDefaultSchedule(schedules: CalComSchedule[]): CalComSchedule | null {
  if (schedules.length === 0) return null;
  return schedules.find((s) => s.isDefault) ?? schedules[0];
}

// ──────────────────────────────────────────────────────────────────────────
// PUBLIC ACTIONS
// ──────────────────────────────────────────────────────────────────────────

/**
 * Fetch the current user's default working-hours schedule.
 *
 * If the user has no schedule yet (freshly provisioned account), we create a
 * sensible default (Mon–Fri 09:00–17:00, Asia/Kolkata) so the editor always
 * has something concrete to render and save against.
 */
export async function getMySchedule(): Promise<ActionResult<MyScheduleData>> {
  try {
    const { client } = await getCalForCurrentUser();

    const schedules = await client.listSchedules();
    let schedule = pickDefaultSchedule(schedules);

    // No schedule yet → create a default one so the page is never blank.
    if (!schedule) {
      schedule = await client.createSchedule({
        name: 'Working Hours',
        timeZone: 'Asia/Kolkata',
        isDefault: true,
        availability: [
          {
            days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
            startTime: '09:00',
            endTime: '17:00',
          },
        ],
      });
    } else {
      // Hydrate availability/overrides — list responses are inline in v2, but
      // re-fetch the single schedule to be certain we have the full shape.
      schedule = await client.getSchedule(schedule.id);
    }

    return {
      success: true,
      data: {
        scheduleId: schedule.id,
        name: schedule.name,
        timeZone: schedule.timeZone,
        availability: schedule.availability ?? [],
      },
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to load your availability.',
    };
  }
}

/**
 * Save the user's weekly availability + timezone for the given schedule.
 *
 * REPLACE SEMANTICS: the `availability` array fully replaces the schedule's
 * existing windows (per CalComApiClient.updateSchedule docs — pinned to
 * cal-api-version 2024-06-11). The editor always sends the complete set.
 *
 * Date-overrides (holidays / one-off changes) are intentionally NOT touched by
 * this MVP save — see the page/editor comments. We omit `overrides` from the
 * PATCH body so any existing overrides are preserved untouched.
 */
export async function saveMySchedule(
  scheduleId: number,
  availability: CalComScheduleAvailability[],
  timeZone: string,
): Promise<ActionResult<MyScheduleData>> {
  try {
    // Minimal server-side validation — the editor enforces these too, but a
    // server action is a trust boundary, so we re-check.
    if (!Number.isFinite(scheduleId) || scheduleId <= 0) {
      return { success: false, error: 'Invalid schedule reference. Please reload the page.' };
    }
    if (!timeZone || typeof timeZone !== 'string') {
      return { success: false, error: 'Please choose a timezone before saving.' };
    }
    const timeRe = /^([01]\d|2[0-3]):[0-5]\d$/;
    for (const w of availability) {
      if (!Array.isArray(w.days) || w.days.length === 0) {
        return { success: false, error: 'Each availability window must have at least one day.' };
      }
      if (!timeRe.test(w.startTime) || !timeRe.test(w.endTime)) {
        return { success: false, error: 'Times must be in 24-hour HH:mm format.' };
      }
      if (w.startTime >= w.endTime) {
        return {
          success: false,
          error: `A start time (${w.startTime}) must be before its end time (${w.endTime}).`,
        };
      }
    }

    const { client } = await getCalForCurrentUser();

    const updated = await client.updateSchedule(scheduleId, {
      timeZone,
      availability,
    });

    return {
      success: true,
      data: {
        scheduleId: updated.id,
        name: updated.name,
        timeZone: updated.timeZone,
        availability: updated.availability ?? availability,
      },
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to save your availability.',
    };
  }
}
