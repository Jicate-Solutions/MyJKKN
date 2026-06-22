// app/api/cdc/career-guidance/route.ts
// AI Career Guidance (BUG-004057) — counsellor tool.
// POST { learnerId } → aggregate the learner's career-relevant data and call
// Claude to produce career paths / skill gaps / next steps, plus a list of
// missing data to record. Empty CDC sources (OBE marks, placements,
// internships, training) are surfaced as gaps rather than hidden.
//
// Privacy: only career-relevant, non-sensitive fields are sent to the model.
// Identity/financial/contact PII (aadhar, income, parent details, address,
// mobile, email) is deliberately NOT included in the prompt.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import Anthropic from '@anthropic-ai/sdk';
import type {
  CareerGuidanceResult, CareerGuidanceSignal, CareerGuidance,
} from '@/types/cdc/career-guidance';

const MODEL = 'claude-sonnet-4-6';

const SYSTEM_PROMPT = `You are a career-counselling assistant for the Career Development Centre (CDC) of an Indian higher-education group. A counsellor has selected one student and wants guidance to discuss with them.

Use ONLY the data provided. Ground every suggestion in that data. Where key data is missing, still give useful guidance at the program/year level, and list the missing data in "dataToImprove" so the CDC knows what to record for sharper future guidance. Be concrete and India-context aware (placements, higher studies, government exams, entrepreneurship as relevant).

Return ONLY valid JSON — no markdown, no code fences, no commentary — matching exactly:
{
  "summary": "2-3 sentence overview of where this student stands and the headline recommendation",
  "careerPaths": [ { "title": "short role/path name", "why": "one line grounded in their data" } ],
  "skillGaps": [ "specific skill or gap to close" ],
  "nextSteps": [ "concrete action the student/counsellor can take this term" ],
  "dataToImprove": [ "data the CDC should record to make this guidance sharper" ]
}
Give 3-5 careerPaths, 3-6 skillGaps, 3-6 nextSteps.`;

// Scalar text/numeric → trimmed string, or null when blank.
function scalarText(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

// JSONB value (object/array/scalar) → a compact meaningful string, or null when
// effectively empty (e.g. {} or all-blank fields). Handles the "JSONB stores
// object or array" gotcha — these columns are jsonb in prod, often empty {}.
function jsonbContent(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'string') return v.trim() === '' ? null : v.trim();
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (Array.isArray(v)) {
    const parts = v.map(jsonbContent).filter(Boolean);
    return parts.length ? parts.join(', ') : null;
  }
  if (typeof v === 'object') {
    const entries = Object.entries(v as Record<string, unknown>)
      .map(([k, val]) => [k, jsonbContent(val)] as const)
      .filter(([, val]) => val);
    if (!entries.length) return null;
    return entries.map(([k, val]) => `${k}: ${val}`).join('; ');
  }
  return null;
}

// 10th/12th marks JSONB { percentage, obtained_marks, max_marks, ... } → a marks
// string, or null when no percentage/obtained value is recorded.
function marksValue(v: unknown): string | null {
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    const o = v as Record<string, unknown>;
    const pct = scalarText(o.percentage);
    if (pct) return `${pct}%`;
    const obtained = scalarText(o.obtained_marks);
    const max = scalarText(o.max_marks);
    if (obtained) return max ? `${obtained}/${max}` : obtained;
    return null;
  }
  return scalarText(v);
}

export async function POST(req: NextRequest) {
  try {
    const { learnerId } = await req.json().catch(() => ({ learnerId: undefined }));
    if (!learnerId || typeof learnerId !== 'string') {
      return NextResponse.json({ error: 'learnerId is required' }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Profile — career-relevant, non-PII fields only.
    const { data: profile, error: profErr } = await supabase
      .from('learners_profiles')
      .select(`
        id, first_name, last_name, gender,
        tenth_marks, twelfth_marks, neet_score, medical_cutoff_marks, engineering_cutoff_marks,
        career_aspirations, capabilities, industry_readiness_score, portfolio_url,
        board_of_study, medium_of_instruction, first_graduate, learner_type,
        program:programs(program_name),
        department:departments(department_name),
        academic_year:academic_years(academic_year_name),
        degree:degrees(degree_name)
      `)
      .eq('id', learnerId)
      .maybeSingle();

    if (profErr) {
      console.error('[cdc/career-guidance] profile load failed:', profErr);
      return NextResponse.json({ error: 'Could not load learner (you may not have access).' }, { status: 403 });
    }
    if (!profile) {
      return NextResponse.json({ error: 'Learner not found' }, { status: 404 });
    }

    const p = profile as Record<string, unknown> & {
      program?: { program_name?: string } | null;
      department?: { department_name?: string } | null;
      academic_year?: { academic_year_name?: string } | null;
      degree?: { degree_name?: string } | null;
    };
    const programName: string | null = p.program?.program_name ?? null;
    const departmentName: string | null = p.department?.department_name ?? null;
    const yearName: string | null = p.academic_year?.academic_year_name ?? null;
    const degreeName: string | null = p.degree?.degree_name ?? null;
    const fullName = [p.first_name, p.last_name].filter(Boolean).join(' ').trim() || 'the student';

    // Outcome-source counts (all keyed on learner_id).
    const counts: Record<string, number> = {};
    for (const tbl of ['obe_learner_co_marks', 'cdc_placements', 'internship_assignments', 'cdc_training_enrollments']) {
      const { count } = await supabase
        .from(tbl)
        .select('*', { count: 'exact', head: true })
        .eq('learner_id', learnerId);
      counts[tbl] = count ?? 0;
    }

    // These profile fields are JSONB in prod (often empty {}) or text — extract
    // meaningful values, treating empty structures as "not recorded".
    const aspirations = jsonbContent(p.career_aspirations);
    const capabilities = jsonbContent(p.capabilities);
    const twelfth = marksValue(p.twelfth_marks);
    const tenth = marksValue(p.tenth_marks);
    const neet = scalarText(p.neet_score);
    const priorMarks = [twelfth && `12th ${twelfth}`, tenth && `10th ${tenth}`, neet && `NEET ${neet}`]
      .filter(Boolean).join(', ');
    const readinessRaw = scalarText(p.industry_readiness_score);
    const readiness = readinessRaw && Number(readinessRaw) > 0 ? readinessRaw : null;

    const signals: CareerGuidanceSignal[] = [
      { key: 'profile', label: 'Student profile', present: true,
        detail: [degreeName, programName, yearName].filter(Boolean).join(' · ') || 'Basic profile', fillHint: null },
      { key: 'aspirations', label: 'Career aspirations', present: !!aspirations,
        detail: aspirations ? aspirations.slice(0, 80) : 'Not recorded',
        fillHint: aspirations ? null : 'Capture in the learner profile' },
      { key: 'capabilities', label: 'Capabilities / strengths', present: !!capabilities,
        detail: capabilities ? capabilities.slice(0, 80) : 'Not recorded',
        fillHint: capabilities ? null : 'Capture in the learner profile' },
      { key: 'prior_marks', label: 'Prior academics (10th/12th/entrance)', present: !!priorMarks,
        detail: priorMarks || 'Not recorded', fillHint: priorMarks ? null : 'Capture in the learner profile' },
      { key: 'readiness', label: 'Industry readiness score', present: !!readiness,
        detail: readiness ?? 'Not scored',
        fillHint: readiness ? null : 'Set during CDC assessment' },
      { key: 'obe_marks', label: 'Course/outcome marks (OBE)', present: counts.obe_learner_co_marks > 0,
        detail: `${counts.obe_learner_co_marks} records`, fillHint: counts.obe_learner_co_marks > 0 ? null : 'Populate via Academic → OBE' },
      { key: 'placements', label: 'Placement record', present: counts.cdc_placements > 0,
        detail: `${counts.cdc_placements} records`, fillHint: counts.cdc_placements > 0 ? null : 'Record under CDC → Placements' },
      { key: 'internships', label: 'Internship history', present: counts.internship_assignments > 0,
        detail: `${counts.internship_assignments} records`, fillHint: counts.internship_assignments > 0 ? null : 'Record under CDC → Internships' },
      { key: 'training', label: 'Training enrolments', present: counts.cdc_training_enrollments > 0,
        detail: `${counts.cdc_training_enrollments} records`, fillHint: counts.cdc_training_enrollments > 0 ? null : 'Enrol under CDC → Training' },
    ];
    const completenessPct = Math.round((signals.filter((s) => s.present).length / signals.length) * 100);

    // Build the data block for the model (only present signals carry detail).
    const present = signals.filter((s) => s.present).map((s) => `- ${s.label}: ${s.detail}`).join('\n') || '- (only basic profile available)';
    const missing = signals.filter((s) => !s.present).map((s) => `- ${s.label}`).join('\n') || '- (none)';
    const userPrompt = `Student context:
- Degree/Programme: ${[degreeName, programName].filter(Boolean).join(' — ') || 'Unknown'}
- Department: ${departmentName ?? 'Unknown'}
- Year/Batch: ${yearName ?? 'Unknown'}
- First-generation learner: ${p.first_graduate ? 'Yes' : 'No/Unknown'}
- Medium of instruction: ${p.medium_of_instruction ?? 'Unknown'}

Data available:
${present}

Data NOT yet recorded (reflect these in dataToImprove):
${missing}

Generate the career guidance JSON now.`;

    const apiKey = process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'AI is not configured (missing API key).' }, { status: 503 });
    }

    const anthropic = new Anthropic({ apiKey });
    let message;
    try {
      message = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 2000,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userPrompt }],
      });
    } catch (e) {
      console.error('[cdc/career-guidance] Anthropic call failed:', e);
      return NextResponse.json({ error: 'AI request failed. Please try again.' }, { status: 502 });
    }

    const text = message.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text).join('').trim();

    let guidance: CareerGuidance;
    try {
      const jsonStr = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
      guidance = JSON.parse(jsonStr);
    } catch {
      // Fallback: surface the raw text so nothing is silently lost.
      guidance = { summary: text || 'No guidance returned.', careerPaths: [], skillGaps: [], nextSteps: [], dataToImprove: [] };
    }

    const result: CareerGuidanceResult = {
      learner: { id: p.id, name: fullName, program: programName, department: departmentName, year: yearName },
      signals,
      completenessPct,
      guidance,
      generatedAt: new Date().toISOString(),
      model: MODEL,
    };
    return NextResponse.json(result);
  } catch (e) {
    console.error('[cdc/career-guidance] unexpected error:', e);
    return NextResponse.json({ error: 'Unexpected error generating guidance.' }, { status: 500 });
  }
}
