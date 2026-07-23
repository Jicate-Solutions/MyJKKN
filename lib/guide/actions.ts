"use server";

/**
 * Canonical Smart Guide — server actions for the PLATFORM guide (progress +
 * instrumentation), keyed by the 9 CANONICAL personas.
 *
 * WHY A SEPARATE SINK from lib/ai-pulse/guide/actions.ts: that file validates
 * incoming events against the AI-Pulse 6-persona union (student/champion/faculty/
 * hod/incharge/admin). The platform FAB emits CANONICAL personas (learner /
 * facilitator / unit-lead / coordinator / supervisor / module-admin /
 * platform-admin / parent / external) — NONE of which pass the AI-Pulse
 * validator, so reusing it would silently drop every platform-FAB event. This
 * sink validates against the canonical allow-lists instead, while writing to the
 * SAME generic public.guide_progress / public.guide_events tables (their
 * persona/surface columns are free text — see migration 20260613234500).
 *
 * A "use server" file may export ONLY async functions. All are user-scoped (RLS
 * enforces row ownership too) and FAIL SOFT — a progress/analytics hiccup must
 * never throw into the UI.
 */
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  isCanonicalPersona,
  GUIDE_EVENT_NAMES,
  GUIDE_SURFACES,
  type GuideEvent,
} from "@/lib/guide/types";

/** Completed step keys for the current user + canonical persona (empty if logged out). */
export async function getCompletedSteps(persona: string): Promise<string[]> {
  try {
    if (!isCanonicalPersona(persona)) return []; // reject junk persona — public endpoint
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return [];
    const { data, error } = await supabase
      .from("guide_progress")
      .select("step_key")
      .eq("user_id", user.id)
      .eq("persona", persona);
    if (error) return [];
    return (data ?? []).map((r: { step_key: string }) => r.step_key);
  } catch {
    return [];
  }
}

/** Mark a step done/undone for the current user + canonical persona. */
export async function toggleStep(
  persona: string,
  stepKey: string,
  done: boolean
): Promise<{ ok: boolean }> {
  try {
    if (!isCanonicalPersona(persona)) return { ok: false };
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false };
    if (done) {
      // ignoreDuplicates → INSERT ... ON CONFLICT DO NOTHING — avoids needing an
      // UPDATE RLS policy on the immutable progress row.
      const { error } = await supabase
        .from("guide_progress")
        .upsert(
          { user_id: user.id, persona, step_key: stepKey },
          { onConflict: "user_id,persona,step_key", ignoreDuplicates: true }
        );
      return { ok: !error };
    }
    const { error } = await supabase
      .from("guide_progress")
      .delete()
      .eq("user_id", user.id)
      .eq("persona", persona)
      .eq("step_key", stepKey);
    return { ok: !error };
  } catch {
    return { ok: false };
  }
}

/** Append one instrumentation event. Fire-and-forget; never throws into the UI. */
export async function logGuideEvent(event: GuideEvent): Promise<void> {
  try {
    // Validate against the canonical runtime allow-lists — this is a public
    // endpoint, so a caller could POST arbitrary strings and poison the shared
    // metrics table.
    if (
      !(GUIDE_EVENT_NAMES as readonly string[]).includes(event.name) ||
      !(GUIDE_SURFACES as readonly string[]).includes(event.surface) ||
      !isCanonicalPersona(event.persona)
    ) {
      return;
    }
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    await supabase.from("guide_events").insert({
      user_id: user?.id ?? null,
      name: event.name,
      persona: event.persona,
      surface: event.surface,
      step_key: event.stepKey ? event.stepKey.slice(0, 256) : null,
      context: event.context ? event.context.slice(0, 256) : null,
    });
  } catch {
    // analytics must never break the page
  }
}
