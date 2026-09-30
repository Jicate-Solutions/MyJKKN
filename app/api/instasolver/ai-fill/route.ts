// app/api/instasolver/ai-fill/route.ts
// ============================================================================
// InstaSolver — "Fill it for me".
//
// Director rulings, 30 Sep 2026: the fastest way to report is to type it in
// ANY words (Tamil included). The AI picks the trade, the place and how
// urgent it is; when unsure it asks ONE question with tap-to-pick answers.
// The form fields it fills stay editable, and nothing is filed here — the
// person still presses Send on the normal form, which posts to
// app/api/instasolver/broken exactly as before.
//
// WHAT THIS ROUTE NEVER DOES
//   - It never receives a photo. The body is JSON `{ text }` only; the photo
//     stays in the browser until the person sends the report itself.
//   - It writes nothing of its own. Places are READ from `resources` under
//     the caller's own session, never service-role. What keeps them to the
//     person's own college is the explicit `institution_id` filter below —
//     NOT RLS: `resources` also has a permissive "any signed-in user may
//     read" SELECT policy (supabase/SQL_FILE_INDEX.md, 2026-09-12), so
//     `resources_select_institution` alone scopes nothing. The per-user cap is in memory
//     (lib/instasolver/ai-fill.ts says why). The platform wrapper records
//     each model call in `ai_model_usage`, like every other AI feature.
//   - It never fails loudly. Any model error, timeout or malformed reply
//     returns `{ success:false, fallback:true }` with the plain-form message,
//     and the person picks the fields by hand as they could before.
//
// Same gate order as the broken route, BEFORE any model call, so a guest or
// an inactive account cannot spend AI budget: signed in -> has a profile ->
// profile active -> not a guest.
//
// The model comes from the platform's config wrapper (claudeChatForFeature,
// feature key `instasolver.ai_fill`) so /admin/ai-models governs it and every
// call is recorded in ai_model_usage like the rest of the platform.
// ============================================================================

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 30;

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { claudeChatForFeature } from '@/lib/services/platform/ai-clients/chat';
import {
  AI_FILL_FALLBACK_MESSAGE,
  AI_FILL_LIMITS,
  AI_FILL_LIMIT_PER_WINDOW,
  buildAiFillSystemPrompt,
  distinctPlaces,
  parseAiFill,
  takeAiFillSlot
} from '@/lib/instasolver/ai-fill';

const FEATURE_KEY = 'instasolver.ai_fill';
/** The model call's own timeout. The whole fill gives up at OVERALL_TIMEOUT_MS. */
const MODEL_TIMEOUT_MS = 12_000;
const OVERALL_TIMEOUT_MS = 15_000;
const MAX_PLACE_ROWS = 800;

function fail(error: string, status: number, extra?: Record<string, unknown>) {
  return NextResponse.json({ success: false, error, ...extra }, { status });
}

function fallback(status: number, reason: string) {
  return NextResponse.json(
    { success: false, fallback: true, reason, error: AI_FILL_FALLBACK_MESSAGE },
    { status }
  );
}

class FillTimeout extends Error {}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return fail('You need to be signed in to report something broken.', 401);
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, role, institution_id, is_active')
    .eq('id', user.id)
    .maybeSingle();

  if (profileError) {
    console.error('[instasolver/ai-fill] profile lookup failed:', profileError.message);
    return fail('Could not check your account just now. Please try again.', 503);
  }
  if (!profile) {
    return fail(
      'Your account has no profile on MyJKKN yet. Contact the office to have your profile set up.',
      403
    );
  }
  if (profile.is_active !== true) {
    return fail(
      'Your account is not active, so it cannot file reports. Contact the office if this is wrong.',
      403
    );
  }
  if (profile.role === 'guest') {
    return fail(
      'Guest accounts cannot report a fault yet. Ask the office to finish setting up your account, then try again.',
      403
    );
  }

  let text = '';
  try {
    const body = (await request.json()) as unknown;
    if (body && typeof body === 'object' && typeof (body as { text?: unknown }).text === 'string') {
      text = (body as { text: string }).text.trim();
    }
  } catch {
    return fail('Expected a JSON body with the text.', 400);
  }
  if (text.length < AI_FILL_LIMITS.inputMin || text.length > AI_FILL_LIMITS.inputMax) {
    return fail(
      `Tell us what is wrong — between ${AI_FILL_LIMITS.inputMin} and ${AI_FILL_LIMITS.inputMax} characters.`,
      400
    );
  }

  if (!takeAiFillSlot(user.id)) {
    return fail(
      `You've used "Fill it for me" ${AI_FILL_LIMIT_PER_WINDOW} times in the last hour. Please fill the form below by hand, or try again later.`,
      429,
      { fallback: true }
    );
  }

  // Places at the reporter's own college. A failure here is not fatal: the
  // model simply works from the person's own words. Most `resources` rows are
  // equipment with no building or block, so only rows that name one are read,
  // in a stable order — otherwise the row cap returns a random, partial list
  // and real block chips are silently dropped.
  let knownPlaces: string[] = [];
  if (profile.institution_id) {
    try {
      const { data: rows, error: placesError } = await supabase
        .from('resources')
        .select('building_number, block_number')
        .eq('institution_id', profile.institution_id)
        .or('building_number.not.is.null,block_number.not.is.null')
        .order('building_number', { ascending: true, nullsFirst: false })
        .order('block_number', { ascending: true, nullsFirst: false })
        .limit(MAX_PLACE_ROWS);
      if (placesError) {
        console.warn('[instasolver/ai-fill] places read failed:', placesError.message);
      } else {
        knownPlaces = distinctPlaces(rows ?? []);
      }
    } catch (e: unknown) {
      console.warn(
        '[instasolver/ai-fill] places read threw:',
        e instanceof Error ? e.message : e
      );
    }
  }

  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const call = claudeChatForFeature(
      FEATURE_KEY,
      {
        max_tokens: 700,
        system: buildAiFillSystemPrompt(knownPlaces),
        messages: [
          {
            role: 'user',
            content: `The person's report, exactly as they typed it:\n"""\n${text}\n"""`
          }
        ]
      },
      { timeout: MODEL_TIMEOUT_MS, maxRetries: 0 }
    );
    const overall = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new FillTimeout('overall timeout')), OVERALL_TIMEOUT_MS);
    });
    const { text: reply } = await Promise.race([call, overall]);

    const fill = parseAiFill(reply, knownPlaces);
    if (!fill) {
      console.warn('[instasolver/ai-fill] model reply did not parse — plain form fallback');
      return fallback(502, 'unparseable');
    }

    return NextResponse.json({ success: true, fill }, { status: 200 });
  } catch (e: unknown) {
    const timedOut =
      e instanceof FillTimeout ||
      (e instanceof Error && /timed? ?out|timeout/i.test(`${e.name} ${e.message}`));
    console.warn(
      `[instasolver/ai-fill] ${timedOut ? 'timed out' : 'model call failed'} — plain form fallback:`,
      e instanceof Error ? e.message : e
    );
    return fallback(timedOut ? 504 : 502, timedOut ? 'timeout' : 'model_error');
  } finally {
    if (timer) clearTimeout(timer);
  }
}
