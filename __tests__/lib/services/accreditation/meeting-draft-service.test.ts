import { describe, it, expect } from 'vitest';
import {
  buildAgendaPrompt,
  buildMinutesPolishPrompt,
  buildStructuralMinutes,
  committeeKindLabel,
  findOmittedResolutions,
  minutesEvidenceRows,
  splitBriefOutput,
  type AgendaFactSet,
  type MinutesFactSet,
  type ResolutionFact,
} from '@/lib/services/accreditation/meeting-draft-service';
import { validateGrounding } from '@/lib/services/accreditation/grounding-validator';

// ---------------------------------------------------------------------------
// Fixtures shaped like real rows (columns verified against prod 2026-07-26).
// ---------------------------------------------------------------------------

const RES_A: ResolutionFact = {
  id: '11111111-1111-4111-8111-111111111111',
  resolution_text: 'Install fire extinguishers on every hostel floor',
  owner_label: 'Estate Officer',
  due_date: '2026-08-15',
  status: 'open',
  carried_count: 2,
  outcome_note: null,
};

const RES_B: ResolutionFact = {
  id: '22222222-2222-4222-8222-222222222222',
  resolution_text: 'Publish the revised learning pathway for pharmacology practicals',
  owner_label: 'Senior Learner — Pharmacology',
  due_date: null,
  status: 'done',
  carried_count: 0,
  outcome_note: 'Circulated to the department',
};

const MINUTES_FACTS: MinutesFactSet = {
  committee: {
    id: 'c0000000-0000-4000-8000-000000000000',
    institution_id: 'i0000000-0000-4000-8000-000000000000',
    committee_name: 'IQAC — JKKN Dental College',
    committee_type: 'main',
    body_code: 'NAAC',
    institution_name: 'JKKN Dental College and Hospital',
  },
  meeting: {
    id: 'm0000000-0000-4000-8000-000000000000',
    meeting_no: 4,
    scheduled_for: '2026-07-20',
    held_at: '2026-07-20T05:30:00+00:00',
    minutes_summary: null,
  },
  reviewed: [RES_B],
  passed: [RES_A],
  structuralMinutes: '',
};

const AGENDA_FACTS: AgendaFactSet = {
  committee: MINUTES_FACTS.committee,
  meeting: { ...MINUTES_FACTS.meeting, held_at: null },
  lastSitting: { meeting_no: 3, on: '2026-04-18' },
  openResolutions: [RES_A],
  evidenceLanded: [{ metric_code: '7.3.f', rows: 6, period_label: 'AY 2026-27' }],
};

// ---------------------------------------------------------------------------

describe('committeeKindLabel — one job type, two committee kinds', () => {
  it('describes a cluster committee as the cross-college council', () => {
    expect(committeeKindLabel('cluster')).toContain('Cluster Academic Council');
  });

  it('describes every other kind as a college IQAC', () => {
    expect(committeeKindLabel('main')).toContain('IQAC');
    expect(committeeKindLabel('statutory')).toContain('IQAC');
  });
});

describe('buildStructuralMinutes', () => {
  it('prefers minutes already stored on the meeting', () => {
    const out = buildStructuralMinutes(
      { ...MINUTES_FACTS.meeting, minutes_summary: '  Already written by a person.  ' },
      [RES_B],
      [RES_A],
    );
    expect(out).toBe('Already written by a person.');
  });

  it('rebuilds an Action-Taken-Report from the entered rows when none is stored', () => {
    const out = buildStructuralMinutes(MINUTES_FACTS.meeting, [RES_B], [RES_A]);
    expect(out).toContain('meeting #4');
    expect(out).toContain('1 done');
    expect(out).toContain(RES_B.resolution_text);
    expect(out).toContain(`RESOLVED: ${RES_A.resolution_text}`);
    expect(out).toContain('due 2026-08-15');
  });

  it('counts a carried item (status still open) as carried, not done', () => {
    const out = buildStructuralMinutes(MINUTES_FACTS.meeting, [RES_A], []);
    expect(out).toContain('0 done');
    expect(out).toContain('1 carried forward');
  });
});

describe('findOmittedResolutions — the failure the grounding gate cannot see', () => {
  const all = [RES_A, RES_B];

  it('accepts prose that carries every resolution', () => {
    const prose = [
      'The committee reviewed the commitment to publish the revised learning pathway for pharmacology practicals, which was completed.',
      'It then resolved to install fire extinguishers on every hostel floor.',
    ].join(' ');
    expect(findOmittedResolutions(prose, all)).toEqual([]);
  });

  it('flags a resolution the polish silently dropped', () => {
    const prose =
      'The committee resolved to install fire extinguishers on every hostel floor by mid-August.';
    expect(findOmittedResolutions(prose, all)).toEqual([RES_B.id]);
  });

  it('flags every dropped resolution, not just the first', () => {
    expect(findOmittedResolutions('The committee met and adjourned.', all)).toEqual([
      RES_A.id,
      RES_B.id,
    ]);
  });

  it('tolerates rephrasing around the resolution, not replacement of it', () => {
    const prose =
      'RESOLVED (unanimously): install fire extinguishers on every hostel floor — Estate Officer to act. ' +
      'Also noted: publish the revised learning pathway for pharmacology practicals.';
    expect(findOmittedResolutions(prose, all)).toEqual([]);
  });

  it('ignores punctuation and casing differences', () => {
    const prose =
      'Install Fire Extinguishers, on every hostel floor! Publish the revised learning pathway for pharmacology practicals.';
    expect(findOmittedResolutions(prose, all)).toEqual([]);
  });

  it('is vacuously satisfied when a sitting recorded nothing', () => {
    expect(findOmittedResolutions('Nothing was decided.', [])).toEqual([]);
  });
});

describe('splitBriefOutput — the brief may carry figures, the agenda may not', () => {
  const output = [
    'Brief:',
    '1. Open commitments: 1 resolution open, carried 2 times.',
    '',
    'Proposed agenda:',
    '1. Decide who escalates the fire-safety certificate.',
    '',
    'Minute skeleton (ATR):',
    'item | resolution taken: ____ | responsibility (seat): ____',
  ].join('\n');

  it('routes each section to its own bucket', () => {
    const parts = splitBriefOutput(output);
    expect(parts.brief).toContain('carried 2 times');
    expect(parts.agenda).toContain('Decide who escalates');
    expect(parts.minuteSkeleton).toContain('resolution taken');
  });

  it('keeps the brief\'s figures OUT of the agenda section', () => {
    expect(splitBriefOutput(output).agenda).not.toContain('carried 2 times');
  });

  it('tolerates quoted and colon-less headings', () => {
    const parts = splitBriefOutput(
      ['"Brief:"', 'b', '"Proposed agenda"', 'a', '"Minute skeleton (ATR)"', 's'].join('\n'),
    );
    expect(parts.brief).toBe('b');
    expect(parts.agenda).toBe('a');
    expect(parts.minuteSkeleton).toBe('s');
  });

  it('treats text before any heading as BRIEF, never as agenda (fail-safe)', () => {
    // A model that forgets the "Brief:" label must not have its figures land in
    // the agenda bucket, where the doctrine gate would refuse the whole draft.
    const parts = splitBriefOutput('12 items are open.\nProposed agenda:\n1. Decide.');
    expect(parts.brief).toContain('12 items are open.');
    expect(parts.agenda).toBe('1. Decide.');
  });
});

describe('buildAgendaPrompt', () => {
  const prompt = buildAgendaPrompt(AGENDA_FACTS);

  it('states the forbidden-agenda rule in absolute terms', () => {
    expect(prompt).toContain('FORBIDDEN-AGENDA RULE IS ABSOLUTE');
    expect(prompt).toContain('NEVER appear on the agenda');
  });

  it('forbids inventing an attendee, because attendance is not recorded anywhere', () => {
    expect(prompt).toContain('Do not state who will attend');
  });

  it('carries JKKN house terminology, not the assessor vocabulary exception', () => {
    expect(prompt).toContain('Write "learner", never "student"');
    expect(prompt).toContain('Senior Learner');
  });

  it('hands over the real open resolutions and the real evidence counts', () => {
    expect(prompt).toContain(RES_A.resolution_text);
    expect(prompt).toContain('carried 2 time(s)');
    expect(prompt).toContain('7.3.f: 6 evidence record(s)');
  });

  it('names the committee kind so one job type serves CAC and IQAC alike', () => {
    expect(prompt).toContain('IQAC');
    expect(buildAgendaPrompt({
      ...AGENDA_FACTS,
      committee: { ...AGENDA_FACTS.committee, committee_type: 'cluster' },
    })).toContain('Cluster Academic Council');
  });
});

describe('buildMinutesPolishPrompt', () => {
  const prompt = buildMinutesPolishPrompt({
    ...MINUTES_FACTS,
    structuralMinutes: buildStructuralMinutes(MINUTES_FACTS.meeting, [RES_B], [RES_A]),
  });

  it('forbids adding a decision, an attendee, or a date', () => {
    expect(prompt).toContain('may NOT add a decision');
    expect(prompt).toContain('attendee');
  });

  it('forbids dropping a resolution and says a gate checks for it', () => {
    expect(prompt).toContain('may NOT drop a resolution');
    expect(prompt).toContain('omissions');
  });

  it('hands over the structural minutes as the substance to keep', () => {
    expect(prompt).toContain('keep all of it');
    expect(prompt).toContain('RESOLVED:');
  });
});

describe('grounding over the minutes fact set — a fabricated fact cannot pass', () => {
  const rows = minutesEvidenceRows(MINUTES_FACTS);

  it('accepts prose quoting only real values', () => {
    const prose =
      'At meeting #4 the committee reviewed 1 prior resolution and passed 1 new resolution, ' +
      'namely to install fire extinguishers on every hostel floor by 2026-08-15.';
    expect(validateGrounding(prose, rows).verdict).toBe('grounded');
  });

  it('rejects an invented attendance figure', () => {
    const prose = 'Eleven members attended; 11 signed the register.';
    const res = validateGrounding(prose, rows);
    expect(res.verdict).toBe('ungrounded');
    expect(res.ungroundedTokens).toContain('11');
  });

  it('rejects an invented date', () => {
    const res = validateGrounding('The sitting was held on 2026-01-09.', rows);
    expect(res.verdict).toBe('ungrounded');
    expect(res.ungroundedTokens).toContain('2026-01-09');
  });
});
