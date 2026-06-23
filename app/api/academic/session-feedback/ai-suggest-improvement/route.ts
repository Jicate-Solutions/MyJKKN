// app/api/academic/session-feedback/ai-suggest-improvement/route.ts
// Session-feedback AI assist — the loop's IMPROVE step.
//
// POST { course_code, from?, to? } → for a course whose recent post-class
// feedback scored LOW on student understanding, call Claude to return concrete
// teaching adjustments (likely causes, suggested changes, a quick win, and what
// to watch in the next session's understanding score).
//
// ANONYMITY (load-bearing invariant): the raw anonymized comment text
// (free_texts) is read via the SERVICE-ROLE-ONLY fn_scf_ai_signal and sent ONLY
// to the model. It is NEVER returned in the HTTP response — staff receive only
// the synthesized suggestion plus numeric meta. The scope logic below is the
// authorization boundary (the read bypasses RLS).
//
// Cloned from app/api/cdc/career-guidance/route.ts (auth shape, model call,
// fence-strip + JSON.parse, error handling).

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import Anthropic from '@anthropic-ai/sdk';

const MODEL = 'claude-sonnet-4-6';

// Roles that may see institution-wide signals (non-super leadership). A plain
// faculty/staff caller falls through to the self-scoped (own-email) path.
const LEADERSHIP_ROLES = new Set([
  'administrator',
  'institution_admin',
  'dean',
  'hod',
  'principal',
  'coordinator',
]);

const SYSTEM_PROMPT = `You are a teaching-improvement assistant for an Indian higher-education institution. A class's students gave anonymous post-class feedback on how well they understood a session. You receive ONLY aggregate signals and anonymized comment text — never any student identity.
Use ONLY the data provided; ground every suggestion in it. Be concrete and India-context aware. NEVER quote a comment verbatim and NEVER refer to an individual student — speak only in aggregate themes so no student can be identified.
Return ONLY valid JSON (no markdown, no code fences, no commentary) matching exactly:
{ "summary": "...", "likelyCauses": ["..."], "suggestedAdjustments": [{"title":"...","how":"..."}], "quickWin": "...", "whatToWatchNext": "..." }
Give 2-4 likelyCauses and 3-5 suggestedAdjustments. whatToWatchNext must reference the next session's understanding score (the loop's verifier).`;

// YYYY-MM-DD validator — reject malformed dates rather than passing junk to the RPC.
function isoDate(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const courseCode =
      typeof body.course_code === 'string' ? body.course_code.trim() : '';
    if (!courseCode) {
      return NextResponse.json(
        { ok: false, error: 'course_code is required' },
        { status: 400 }
      );
    }

    // Date window — default to the last 30 days when not supplied.
    const today = new Date();
    const defaultTo = today.toISOString().slice(0, 10);
    const defaultFrom = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    const from = isoDate(body.from) ?? defaultFrom;
    const to = isoDate(body.to) ?? defaultTo;

    // 1) Authn — session client.
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json(
        { ok: false, error: 'not authenticated' },
        { status: 401 }
      );
    }

    // 2) Caller's profile → drives scope. Read with the SESSION client (RLS:
    //    a user can always read their own profile row).
    const { data: profile } = await supabase
      .from('profiles')
      .select('id, email, role, is_super_admin, institution_id')
      .eq('id', user.id)
      .maybeSingle();

    const role = (profile?.role as string | null) ?? null;
    const isSuper =
      profile?.is_super_admin === true || role === 'super_admin';
    const isLeadership = isSuper || (role !== null && LEADERSHIP_ROLES.has(role));

    // 3) Decide scope filters for the RPC. Each branch self-limits:
    //    - super        → all institutions, all faculty
    //    - leadership    → own institution, all faculty
    //    - else (staff)  → own taught sessions only (scoped by their email)
    //   The else branch is safe even for a caller with no taught sessions: the
    //   email filter simply returns 0 rows. No hard 403 is needed because every
    //   non-super path is self-limiting; only unauthenticated callers are rejected.
    let pInstitutionId: string | null;
    let pFacultyEmail: string | null;
    if (isSuper) {
      pInstitutionId = null;
      pFacultyEmail = null;
    } else if (isLeadership) {
      pInstitutionId = (profile?.institution_id as string | null) ?? null;
      pFacultyEmail = null;
    } else {
      pInstitutionId = null;
      pFacultyEmail = (profile?.email as string | null)?.toLowerCase() ?? null;
    }

    // 4) Read the aggregate + anonymized comments via the SERVICE-ROLE-ONLY RPC.
    const admin = createServiceRoleClient();
    const { data, error: rpcError } = await admin.rpc('fn_scf_ai_signal', {
      p_course_code: courseCode,
      p_from: from,
      p_to: to,
      p_institution_id: pInstitutionId,
      p_faculty_email: pFacultyEmail,
    });

    if (rpcError) {
      console.error('[academic/ai-suggest-improvement] RPC failed:', rpcError);
      return NextResponse.json(
        { ok: false, error: 'Could not load feedback signal.' },
        { status: 500 }
      );
    }

    const row = Array.isArray(data) ? data[0] : data;
    const responses = Number(row?.responses ?? 0);
    const lowResponses = Number(row?.low_responses ?? 0);
    const avgUnderstood =
      row?.avg_understood !== null && row?.avg_understood !== undefined
        ? Number(row.avg_understood)
        : null;
    // free_texts stays server-side ONLY — fed to the model, never returned.
    const freeTexts: string[] = Array.isArray(row?.free_texts) ? row.free_texts : [];

    // 5) Below the small-n floor → skip the LLM (saves cost + avoids noise).
    if (responses < 3) {
      return NextResponse.json({
        ok: true,
        suggestion: null,
        reason: 'not_enough_feedback',
        meta: { responses, avg_understood: avgUnderstood },
      });
    }

    // 6) Build the prompt + call Claude.
    const commentBlock =
      freeTexts.length > 0
        ? freeTexts.map((t) => `- ${String(t).trim()}`).join('\n')
        : '- (no written comments — use the numeric signals)';
    const userPrompt = `Course: ${courseCode}
Window: ${from} to ${to}
Responses: ${responses}
Low-understanding responses (understood <= 2 of 5): ${lowResponses}
Average understanding (1-5): ${avgUnderstood ?? 'n/a'}

Anonymized student comments:
${commentBlock}

Generate the teaching-improvement JSON now.`;

    const apiKey = process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { ok: false, error: 'AI is not configured (missing API key).' },
        { status: 503 }
      );
    }

    const anthropic = new Anthropic({ apiKey });
    const resp = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const text = resp.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim();

    // Strip ```json fences (the model occasionally wraps despite instructions).
    const jsonStr = text
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();
    const suggestion = JSON.parse(jsonStr);

    // ANONYMITY: response carries ONLY the synthesized suggestion + numeric meta.
    // freeTexts is deliberately excluded.
    return NextResponse.json({
      ok: true,
      suggestion,
      meta: {
        responses,
        low_responses: lowResponses,
        avg_understood: avgUnderstood,
        model: resp.model,
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unexpected error.';
    console.error('[academic/ai-suggest-improvement] error:', e);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
