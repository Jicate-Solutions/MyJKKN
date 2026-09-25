// app/api/pde/cases/draft-from-notes/route.ts
// ============================================================================
// The THIRD "→ PDE teaching case" authoring path: pasted notes + the author's
// own case-sheet headings.
//
//   POST { case_sheet_template, source_notes, senior_learner_guide?, depth?,
//          discipline?, course_id? }
//     → draft the case on the ₹0 Max lane (pde.case_author) and RETURN the
//       assembled CreateClinicalCaseInput for the faculty form builder.
//
// Like /import-from-pms this route NEVER writes a case — the Senior Learner
// reviews the AI draft in the builder and clicks "Save as draft"
// (POST /api/pde/cases). AI clinical content is never auto-created.
//
// SECURITY NOTE — this input is NOT de-identified. The PMS path receives a
// record the hospital system already stripped; here the author pastes raw text,
// so both blocks are fenced as untrusted data (and fence markers inside them are
// neutralized), the prompt forbids copying identifiers through, and any
// identifier the heuristic spots is returned for the author to act on. The job
// runs tool_set='none', so there is nothing for injected text to hijack.
// ============================================================================

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // long-poll the Max drain (claims ~every minute)

import { createHash } from 'node:crypto';
import { NextRequest, NextResponse, connection } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { enqueueJobsLane, awaitJobsLaneResults } from '@/lib/services/platform/ai-jobs-lane';
import {
  buildNotesAuthorPrompt,
  parseNotesDraft,
  scanForIdentifiers,
  MAX_NOTES_CHARS,
  MAX_TEMPLATE_CHARS,
  MIN_NOTES_CHARS,
  type NotesDraftDepth,
} from '@/lib/services/pde/case-author-notes';
import { stampQuestionOptionIds } from '@/app/api/pde/cases/import-from-pms/route';
import { requireCaseAuthor } from '@/lib/services/pde/require-case-author';
import { logger } from '@/lib/utils/enhanced-logger';
import type { CreateClinicalCaseInput } from '@/types/pde';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest) {
  await connection();
  const supabase = await createClient();
  // Teaching staff only — same gate as the other authoring paths.
  const gate = await requireCaseAuthor(supabase);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const caseSheetTemplate = typeof body.case_sheet_template === 'string' ? body.case_sheet_template.trim() : '';
  const sourceNotes = typeof body.source_notes === 'string' ? body.source_notes.trim() : '';
  const seniorLearnerGuide = body.senior_learner_guide === true;
  const depth: NotesDraftDepth = body.depth === 'sequential' ? 'sequential' : 'comprehensive';
  const discipline = typeof body.discipline === 'string' ? body.discipline.trim().slice(0, 100) : '';
  const courseId = typeof body.course_id === 'string' && UUID_RE.test(body.course_id) ? body.course_id : undefined;

  if (!caseSheetTemplate) {
    return NextResponse.json({ error: 'Paste your department’s case-sheet headings first.' }, { status: 400 });
  }
  if (caseSheetTemplate.length > MAX_TEMPLATE_CHARS) {
    return NextResponse.json(
      { error: `The case-sheet headings are too long (limit ${MAX_TEMPLATE_CHARS} characters).` },
      { status: 400 }
    );
  }
  if (sourceNotes.length < MIN_NOTES_CHARS) {
    return NextResponse.json(
      { error: `Add more source material — at least ${MIN_NOTES_CHARS} characters are needed to build a case.` },
      { status: 400 }
    );
  }
  if (sourceNotes.length > MAX_NOTES_CHARS) {
    return NextResponse.json(
      { error: `The notes are too long (limit ${MAX_NOTES_CHARS} characters). Split the case and draft it in parts.` },
      { status: 400 }
    );
  }

  const identifierWarnings = scanForIdentifiers(sourceNotes);

  const prompt = buildNotesAuthorPrompt({
    caseSheetTemplate,
    sourceNotes,
    seniorLearnerGuide,
    depth,
    discipline: discipline || undefined,
  });

  // Dedupe on the CONTENT, not on a record id: the same paste submitted twice
  // (a double-click, an impatient retry) must not occupy two of the three
  // in-flight slots this job type allows.
  const digest = createHash('sha256')
    .update(`${depth}|${seniorLearnerGuide ? 1 : 0}|${caseSheetTemplate}|${sourceNotes}`)
    .digest('hex')
    .slice(0, 32);

  const admin = createServiceRoleClient();
  const enq = await enqueueJobsLane(admin, {
    jobType: 'pde.case_author',
    prompt,
    context: { source: 'notes', depth, digest },
    dedupeKey: `pde-case-author-notes:${digest}`,
  });
  if (!enq.ok) {
    if ('reason' in enq && enq.reason === 'in_flight') {
      return NextResponse.json(
        { error: 'These notes are already being drafted — try again shortly.' },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { error: 'The AI drafting lane is unavailable right now. Please try again later.' },
      { status: 503 }
    );
  }

  const results = await awaitJobsLaneResults(admin, [enq.jobId], { deadlineMs: 270_000, intervalMs: 2_500 });
  const text = results.get(enq.jobId);
  if (!text) {
    return NextResponse.json({ error: 'The AI didn’t finish drafting in time. Please try again.' }, { status: 504 });
  }

  const draft = parseNotesDraft(text);
  if (!draft) {
    return NextResponse.json({ error: 'The AI returned a draft we couldn’t read. Please try again.' }, { status: 502 });
  }

  // Stamp stable option ids BEFORE the draft can become a case — an id-less
  // option is unanswerable and ungradeable. Reuses the PMS path's stamper so
  // both AI paths produce identical option contracts.
  const { questions, warnings } = stampQuestionOptionIds(draft.questions);
  if (warnings.length > 0) {
    logger.warn('pde/case-draft-from-notes', 'Repaired option contract violations in the AI draft', {
      digest,
      warnings,
    });
  }

  const assembled: Partial<CreateClinicalCaseInput> = {
    course_id: courseId,
    title: (draft.suggested_title || 'Drafted clinical case').slice(0, 200),
    description:
      'Drafted from pasted clinical notes against this department’s own case sheet. ' +
      'AI-drafted questions and answer-keys — verify clinical accuracy, and check that no patient identifier ' +
      'survived from the source notes, before publishing.',
    case_scenario: draft.case_scenario,
    metadata: {
      domain_weights: draft.domain_weights,
      ...(discipline ? { discipline } : {}),
      source: 'notes+ai',
    },
    questions,
    pass_threshold: 60,
  };

  return NextResponse.json({
    data: assembled,
    // Senior-Learner-only. Deliberately NOT folded into the case: nothing here reaches a
    // learner, because it never enters the learner-facing record at all.
    senior_learner_guide: draft.senior_learner_guide,
    // Structured sequential output. Binds to the staged-case model once it lands.
    parts: draft.parts,
    identifier_warnings: identifierWarnings,
    warnings,
  });
}
