// lib/services/accreditation/meeting-draft-service.ts
// ============================================================================
// Grounded fact assembly + prompt building for the AI committee assistant.
//
// Three jobs, one discipline (mirrors accreditation-draft-service.ts, the
// narrative drafter that is already live):
//   (a) AGENDA  — the pre-sitting brief + proposed agenda + ATR minute skeleton
//                 for a Cluster Academic Council OR a college IQAC. The brief
//                 carries the figures; the agenda carries none (doctrine).
//   (b) SITTING — computed DETERMINISTICALLY in SQL, not drafted. A date and an
//                 attendee list are exactly the things a model must never
//                 invent, so no model is asked for them.
//   (c) MINUTES — prose polish over the ALREADY pre-filled structural minutes.
//                 It may not add a decision, an attendee, or a date, and it may
//                 not drop a resolution.
//
// Everything the model is allowed to know is read from real rows here and handed
// over as a numbered fact block. The deterministic gates then check what comes
// back: grounding-validator.ts for added facts, agenda-doctrine-gate.ts for
// figures on an agenda, and findOmittedResolutions() below for dropped
// resolutions (the validator sees additions, never omissions).
//
// Terminology: agendas and minutes are INTERNAL governance documents, so JKKN
// house terms apply (learner / Senior Learner). The narrative drafter's
// assessor-vocabulary exception is deliberately NOT copied here.
// ============================================================================

import type { EvidenceRow } from './grounding-validator';

/** Minimal client shape so a service-role or session client both fit. */
type SupabaseLike = { from: (t: string) => any };

/**
 * Carries at or above this count get a "ESCALATE TO DIRECTOR" line. This is the
 * IQAC Meeting Loop's existing strike rule (PR #1940/#1943), restated here so
 * the prompt and the allowed-fact set agree on one number.
 */
export const ESCALATION_STRIKE_THRESHOLD = 2;

export interface CommitteeMeta {
  id: string;
  institution_id: string;
  committee_name: string;
  committee_type: string;
  body_code: string;
  institution_name?: string;
}

export interface MeetingMeta {
  id: string;
  meeting_no: number;
  scheduled_for: string | null;
  held_at: string | null;
  minutes_summary: string | null;
}

export interface ResolutionFact {
  id: string;
  resolution_text: string;
  owner_label: string | null;
  due_date: string | null;
  status: string;
  carried_count: number;
  outcome_note: string | null;
}

export interface EvidenceLandedFact {
  metric_code: string;
  rows: number;
  period_label: string | null;
}

export interface AgendaFactSet {
  committee: CommitteeMeta;
  meeting: MeetingMeta;
  lastSitting: { meeting_no: number; on: string | null } | null;
  openResolutions: ResolutionFact[];
  evidenceLanded: EvidenceLandedFact[];
}

export interface MinutesFactSet {
  committee: CommitteeMeta;
  meeting: MeetingMeta;
  reviewed: ResolutionFact[];
  passed: ResolutionFact[];
  /** The deterministic ATR text the engine already assembled — the base prose. */
  structuralMinutes: string;
}

// ---------------------------------------------------------------------------
// Committee kind → the words the sitting is called by
// ---------------------------------------------------------------------------

/** How the committee describes itself in the prompt. One job type, two kinds. */
export function committeeKindLabel(committeeType: string): string {
  return committeeType === 'cluster'
    ? 'Cluster Academic Council (a cross-college council)'
    : 'college IQAC (Internal Quality Assurance Cell)';
}

// ---------------------------------------------------------------------------
// Fact reads
// ---------------------------------------------------------------------------

async function readCommittee(
  client: SupabaseLike,
  committeeId: string,
): Promise<CommitteeMeta | null> {
  const { data } = await client
    .from('accreditation_committees')
    .select('id, institution_id, committee_name, committee_type, body_code')
    .eq('id', committeeId)
    .maybeSingle();
  if (!data) return null;
  const { data: inst } = await client
    .from('institutions')
    .select('name')
    .eq('id', data.institution_id)
    .maybeSingle();
  return { ...(data as CommitteeMeta), institution_name: inst?.name ?? undefined };
}

async function readMeeting(
  client: SupabaseLike,
  meetingId: string,
): Promise<MeetingMeta | null> {
  const { data } = await client
    .from('accreditation_committee_meetings')
    .select('id, meeting_no, scheduled_for, held_at, minutes_summary')
    .eq('id', meetingId)
    .maybeSingle();
  return (data as MeetingMeta) ?? null;
}

const RESOLUTION_COLS =
  'id, resolution_text, owner_label, due_date, status, carried_count, outcome_note';

/** Facts for the pre-sitting brief + agenda of ONE scheduled meeting. */
export async function getAgendaFactSet(
  client: SupabaseLike,
  args: { meetingId: string; committeeId: string },
): Promise<AgendaFactSet | null> {
  const committee = await readCommittee(client, args.committeeId);
  const meeting = await readMeeting(client, args.meetingId);
  if (!committee || !meeting) return null;

  // The previous sitting (highest meeting_no below this one that actually ran).
  const { data: prior } = await client
    .from('accreditation_committee_meetings')
    .select('meeting_no, held_at, scheduled_for')
    .eq('committee_id', args.committeeId)
    .lt('meeting_no', meeting.meeting_no)
    .in('status', ['held', 'minuted'])
    .order('meeting_no', { ascending: false })
    .limit(1);
  const priorRow = (prior ?? [])[0] as
    | { meeting_no: number; held_at: string | null; scheduled_for: string | null }
    | undefined;
  const lastSitting = priorRow
    ? { meeting_no: priorRow.meeting_no, on: priorRow.held_at ?? priorRow.scheduled_for }
    : null;

  const { data: open } = await client
    .from('accreditation_committee_resolutions')
    .select(RESOLUTION_COLS)
    .eq('committee_id', args.committeeId)
    .eq('status', 'open')
    .order('due_date', { ascending: true, nullsFirst: false });

  // Evidence that landed for this institution since the last sitting, grouped by
  // metric. These figures belong in the BRIEF, never on the agenda.
  let evidenceLanded: EvidenceLandedFact[] = [];
  const since = lastSitting?.on ?? null;
  let q = client
    .from('quality_evidence_mappings')
    .select('metric_code, period_label')
    .eq('institution_id', committee.institution_id)
    .eq('body_code', committee.body_code);
  if (since) q = q.gte('mapped_at', since);
  const { data: ev } = await q;
  if (Array.isArray(ev)) {
    const byMetric = new Map<string, EvidenceLandedFact>();
    for (const r of ev as Array<{ metric_code: string; period_label: string | null }>) {
      const cur = byMetric.get(r.metric_code);
      if (cur) cur.rows += 1;
      else
        byMetric.set(r.metric_code, {
          metric_code: r.metric_code,
          rows: 1,
          period_label: r.period_label,
        });
    }
    evidenceLanded = [...byMetric.values()].sort((a, b) => b.rows - a.rows);
  }

  return {
    committee,
    meeting,
    lastSitting,
    openResolutions: (open ?? []) as ResolutionFact[],
    evidenceLanded,
  };
}

/**
 * The deterministic Action-Taken-Report text, assembled from the entered rows.
 *
 * Mirrors buildMinutesSummary() in meetings-section.tsx — the prefill the
 * convener already sees in the Close-meeting dialog. It is rebuilt here because
 * a HELD (not yet closed) meeting has minutes_summary = NULL, so at enqueue time
 * there is no stored text to polish; without this the prompt would hand the model
 * "(empty)" and the polish would have nothing to be faithful to.
 *
 * Deliberately NOT written back to accreditation_committee_meetings:
 * CommitteeMeetingService.closeMeeting stays the SOLE writer of minutes_summary,
 * so the AI prose and the human textarea can never race for that column.
 */
export function buildStructuralMinutes(
  meeting: MeetingMeta,
  reviewed: ResolutionFact[],
  passed: ResolutionFact[],
): string {
  if (meeting.minutes_summary && meeting.minutes_summary.trim()) {
    return meeting.minutes_summary.trim();
  }
  const done = reviewed.filter((r) => r.status === 'done');
  const dropped = reviewed.filter((r) => r.status === 'dropped');
  const carried = reviewed.filter((r) => r.status !== 'done' && r.status !== 'dropped');
  const on = meeting.held_at ?? meeting.scheduled_for ?? '';
  const verdict = (r: ResolutionFact) =>
    r.status === 'done' ? 'done' : r.status === 'dropped' ? 'dropped' : 'carried';

  const lines: string[] = [
    `Loop Review — meeting #${meeting.meeting_no}, ${on}. ` +
      `Reviewed ${reviewed.length} prior resolutions: ${done.length} done, ` +
      `${carried.length} carried forward, ${dropped.length} dropped. ` +
      `Passed ${passed.length} new resolutions.`,
  ];
  for (const r of reviewed) {
    lines.push(
      `${r.resolution_text} — ${verdict(r)}${r.outcome_note ? `: ${r.outcome_note}` : ''}`,
    );
  }
  for (const r of passed) {
    lines.push(
      `RESOLVED: ${r.resolution_text} (${r.owner_label ?? 'unassigned'}${
        r.due_date ? `, due ${r.due_date}` : ''
      })`,
    );
  }
  return lines.join('\n');
}

/**
 * Facts for polishing the minutes of ONE held meeting. `structuralMinutes` is
 * optional: when omitted (the cron's enqueue path) it is rebuilt deterministically
 * from the entered rows by buildStructuralMinutes().
 */
export async function getMinutesFactSet(
  client: SupabaseLike,
  args: { meetingId: string; committeeId: string; structuralMinutes?: string },
): Promise<MinutesFactSet | null> {
  const committee = await readCommittee(client, args.committeeId);
  const meeting = await readMeeting(client, args.meetingId);
  if (!committee || !meeting) return null;

  const { data: reviewed } = await client
    .from('accreditation_committee_resolutions')
    .select(RESOLUTION_COLS)
    .eq('reviewed_in_meeting_id', args.meetingId)
    .order('updated_at', { ascending: true });

  const { data: passed } = await client
    .from('accreditation_committee_resolutions')
    .select(RESOLUTION_COLS)
    .eq('meeting_id', args.meetingId)
    .order('created_at', { ascending: true });

  const reviewedRows = (reviewed ?? []) as ResolutionFact[];
  const passedRows = (passed ?? []) as ResolutionFact[];

  return {
    committee,
    meeting,
    reviewed: reviewedRows,
    passed: passedRows,
    structuralMinutes:
      args.structuralMinutes && args.structuralMinutes.trim()
        ? args.structuralMinutes
        : buildStructuralMinutes(meeting, reviewedRows, passedRows),
  };
}

// ---------------------------------------------------------------------------
// The allowed-fact set handed to the grounding validator
// ---------------------------------------------------------------------------

/**
 * Turn real rows into the EvidenceRow shape the grounding validator consumes.
 * Every number, date, and code the draft may legitimately quote must appear
 * here — anything else comes back 'ungrounded'.
 */
export function agendaEvidenceRows(facts: AgendaFactSet): EvidenceRow[] {
  const rows: EvidenceRow[] = [
    {
      source_id: facts.meeting.id,
      metric_code: 'sitting',
      metadata: {
        meeting_no: facts.meeting.meeting_no,
        scheduled_for: facts.meeting.scheduled_for,
        last_sitting_no: facts.lastSitting?.meeting_no ?? null,
        last_sitting_on: facts.lastSitting?.on ?? null,
        committee_name: facts.committee.committee_name,
        institution_name: facts.committee.institution_name ?? null,
        // The loop's real Director-escalation threshold (2+ carries). Listed as
        // a fact so the prompt's own "carried 2 or more times" wording is not
        // read back as an ungrounded figure when no resolution happens to sit
        // at exactly 2 strikes.
        escalation_threshold: ESCALATION_STRIKE_THRESHOLD,
      },
    },
  ];
  for (const r of facts.openResolutions) {
    rows.push({ source_id: r.id, metric_code: 'resolution', metadata: { ...r } });
  }
  for (const e of facts.evidenceLanded) {
    rows.push({
      source_id: `${facts.committee.body_code}:${e.metric_code}`,
      metric_code: e.metric_code,
      metadata: { ...e },
    });
  }
  return rows;
}

export function minutesEvidenceRows(facts: MinutesFactSet): EvidenceRow[] {
  const rows: EvidenceRow[] = [
    {
      source_id: facts.meeting.id,
      metric_code: 'sitting',
      metadata: {
        meeting_no: facts.meeting.meeting_no,
        held_at: facts.meeting.held_at,
        scheduled_for: facts.meeting.scheduled_for,
        reviewed_count: facts.reviewed.length,
        passed_count: facts.passed.length,
        committee_name: facts.committee.committee_name,
        institution_name: facts.committee.institution_name ?? null,
      },
    },
  ];
  for (const r of [...facts.reviewed, ...facts.passed]) {
    rows.push({ source_id: r.id, metric_code: 'resolution', metadata: { ...r } });
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Omission check — the failure mode the grounding validator cannot see
// ---------------------------------------------------------------------------

/** Normalise for comparison: lowercase, collapse whitespace, drop punctuation. */
function normalise(s: string): string {
  return (s ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Which resolutions the polished prose silently DROPPED.
 *
 * The grounding validator only catches tokens the model ADDED. A polish that
 * quietly loses a resolution still reads 'grounded' — and that minute becomes
 * NAAC 7.3.e evidence through the nightly rollup. So every resolution must be
 * traceable in the prose.
 *
 * Matching is deliberately lenient about wording (a polish is allowed to
 * rephrase) but strict about substance: a resolution counts as present when a
 * contiguous run of its first six meaningful words appears in the prose, or —
 * for very short resolutions — when the whole normalised text appears.
 */
export function findOmittedResolutions(
  polishedMd: string,
  resolutions: ResolutionFact[],
): string[] {
  const hay = normalise(polishedMd);
  const missing: string[] = [];
  for (const r of resolutions) {
    const words = normalise(r.resolution_text).split(' ').filter(Boolean);
    if (words.length === 0) continue;
    const probe = words.slice(0, Math.min(6, words.length)).join(' ');
    if (!hay.includes(probe)) missing.push(r.id);
  }
  return missing;
}

// ---------------------------------------------------------------------------
// Prompts
// ---------------------------------------------------------------------------

function factLines(label: string, lines: string[]): string {
  return `${label}\n${lines.length ? lines.join('\n') : '(none)'}`;
}

/**
 * The pre-sitting brief + agenda + ATR skeleton prompt.
 *
 * Carries forward the three-part output contract of the DARK
 * 'accreditation.cac_brief' job (#2402) verbatim in intent, parameterised by
 * committee kind so ONE job type serves both a cluster council and a college
 * IQAC. The forbidden-agenda rule is stated here AND enforced deterministically
 * by agenda-doctrine-gate.ts — the prompt is the request, the gate is the
 * guarantee.
 */
export function buildAgendaPrompt(facts: AgendaFactSet): string {
  const { committee, meeting, lastSitting, openResolutions, evidenceLanded } = facts;

  const carried = openResolutions.map(
    (r) =>
      `- ${r.resolution_text} · owner: ${r.owner_label ?? 'unassigned'} · due: ${
        r.due_date ?? 'not set'
      } · carried ${r.carried_count} time(s)`,
  );
  const evidence = evidenceLanded.map(
    (e) => `- ${e.metric_code}: ${e.rows} evidence record(s)${e.period_label ? ` (${e.period_label})` : ''}`,
  );

  return [
    `You are the secretary-analyst for a JKKN ${committeeKindLabel(committee.committee_type)}, preparing the papers for a sitting. The convener reviews and okays this draft; you prepare, you never decide.`,
    ``,
    `Committee: ${committee.committee_name}`,
    `Institution: ${committee.institution_name ?? committee.institution_id}`,
    `Accreditation body: ${committee.body_code}`,
    `Sitting: meeting #${meeting.meeting_no} on ${meeting.scheduled_for ?? 'date not set'}`,
    lastSitting
      ? `Last sitting: meeting #${lastSitting.meeting_no} on ${lastSitting.on ?? 'unknown'}`
      : `Last sitting: none — this is the committee's first recorded sitting`,
    ``,
    factLines(`Resolutions still open from earlier sittings:`, carried),
    ``,
    factLines(`Evidence that landed since the last sitting:`, evidence),
    ``,
    `Write EXACTLY these three parts, nothing else, each under its own literal heading:`,
    ``,
    `"Brief:" three short sections, each grounded ONLY in the facts above. If a section has no data, write exactly: "Nothing to report."`,
    `1. Open commitments: each still-open resolution with its owner, its due date, and how many times it has been carried. Any resolution carried ${ESCALATION_STRIKE_THRESHOLD} or more times gets its own line starting exactly "ESCALATE TO DIRECTOR:".`,
    `2. Evidence landed: what arrived since the last sitting and which metric it supports.`,
    `3. What needs the room: the items that cannot be settled by one person reading a screen.`,
    ``,
    `"Proposed agenda:" a numbered list carrying ONLY blockers needing the committee, decisions needing a resolution, and carried items. THE FORBIDDEN-AGENDA RULE IS ABSOLUTE: any number readable from the platform belongs in the brief above and must NEVER appear on the agenda. No counts, no scores, no percentages, no metric codes, no status readouts. If an agenda item is just figures, it is already in the brief — drop it. An automated gate rejects the draft if a figure appears on the agenda.`,
    ``,
    `"Minute skeleton (ATR):" one line per agenda item in the form: item | resolution taken: ____ | responsibility (seat): ____ | target date: ____ | status: ____ . Leave the blanks for the sitting to fill.`,
    ``,
    `HARD RULES (an automated gate rejects any violation):`,
    `1. Use ONLY numbers, dates, and codes that appear verbatim in the facts above. Never invent, estimate, round, or compute a figure.`,
    `2. Do not state who will attend. Attendance is not recorded in this system.`,
    `3. Write "learner", never "student". Write "Senior Learner" for anyone in a teaching role.`,
    `4. No preamble, no sign-off, no commentary about these instructions.`,
  ]
    .filter((l) => l !== undefined)
    .join('\n');
}

/**
 * The minutes prose-polish prompt.
 *
 * The structural minutes already exist (the engine assembles them from the
 * entered reviews and resolutions). This asks for the formal write-up of exactly
 * that content — nothing added, nothing dropped.
 */
export function buildMinutesPolishPrompt(facts: MinutesFactSet): string {
  const { committee, meeting, reviewed, passed, structuralMinutes } = facts;

  const reviewedLines = reviewed.map(
    (r) =>
      `- ${r.resolution_text} · outcome: ${r.status}${
        r.outcome_note ? ` · note: ${r.outcome_note}` : ''
      } · carried ${r.carried_count} time(s)`,
  );
  const passedLines = passed.map(
    (r) =>
      `- ${r.resolution_text} · owner: ${r.owner_label ?? 'unassigned'} · due: ${
        r.due_date ?? 'not set'
      }`,
  );

  return [
    `You are writing up the formal minutes of a JKKN ${committeeKindLabel(committee.committee_type)} sitting. A person entered the decisions below during the sitting; your ONLY task is to turn them into the formal write-up. You are polishing prose, not deciding anything.`,
    ``,
    `Committee: ${committee.committee_name}`,
    `Institution: ${committee.institution_name ?? committee.institution_id}`,
    `Sitting: meeting #${meeting.meeting_no}${meeting.held_at ? `, held ${meeting.held_at}` : ''}`,
    ``,
    factLines(`Prior resolutions reviewed at this sitting:`, reviewedLines),
    ``,
    factLines(`New resolutions passed at this sitting:`, passedLines),
    ``,
    `The minutes as the system assembled them (this is the substance — keep all of it):`,
    structuralMinutes || '(empty)',
    ``,
    `HARD RULES (automated gates reject any violation):`,
    `1. You may NOT add a decision, a resolution, an attendee, a date, or any figure that is not above. A gate checks every number, date, and code against the facts above.`,
    `2. You may NOT drop a resolution. Every resolution listed above must appear in your write-up. A gate checks for omissions and rejects the draft if one is missing.`,
    `3. Do NOT state who attended or how many attended. Attendance is not recorded in this system, so any attendance sentence would be fabricated.`,
    `4. Keep the Action-Taken-Report structure: what was reviewed and its outcome, then what was resolved with its owner and target date.`,
    `5. Write "learner", never "student". Write "Senior Learner" for anyone in a teaching role.`,
    `6. Return the minutes prose only — no preamble, no headings other than the report's own, no commentary about these instructions.`,
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Output splitting — the brief may carry figures, the agenda may not
// ---------------------------------------------------------------------------

export interface SplitBrief {
  /** Everything under "Brief:" — figures are legitimate here. */
  brief: string;
  /** Everything under "Proposed agenda:" — the doctrine gate scans ONLY this. */
  agenda: string;
  /** Everything under "Minute skeleton (ATR):". */
  minuteSkeleton: string;
}

const AGENDA_HEADING_RE = /^\s*"?proposed agenda:?"?\s*$/i;
const SKELETON_HEADING_RE = /^\s*"?minute skeleton(?:\s*\(atr\))?:?"?\s*$/i;
const BRIEF_HEADING_RE = /^\s*"?brief:?"?\s*$/i;

/**
 * Split the three-part output. Headings may arrive quoted or unquoted, with or
 * without the trailing colon, and possibly inline with following text — so the
 * split is line-based on a heading-only line, and anything before the first
 * recognised heading is treated as brief text (a model that forgets the "Brief:"
 * label still gets its figures classified as brief, never as agenda).
 */
export function splitBriefOutput(text: string): SplitBrief {
  const lines = (text ?? '').split('\n');
  const out: SplitBrief = { brief: '', agenda: '', minuteSkeleton: '' };
  const buckets: Record<keyof SplitBrief, string[]> = {
    brief: [],
    agenda: [],
    minuteSkeleton: [],
  };
  let current: keyof SplitBrief = 'brief';
  for (const line of lines) {
    if (BRIEF_HEADING_RE.test(line)) {
      current = 'brief';
      continue;
    }
    if (AGENDA_HEADING_RE.test(line)) {
      current = 'agenda';
      continue;
    }
    if (SKELETON_HEADING_RE.test(line)) {
      current = 'minuteSkeleton';
      continue;
    }
    buckets[current].push(line);
  }
  out.brief = buckets.brief.join('\n').trim();
  out.agenda = buckets.agenda.join('\n').trim();
  out.minuteSkeleton = buckets.minuteSkeleton.join('\n').trim();
  return out;
}
