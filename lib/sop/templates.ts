// lib/sop/templates.ts
// Pre-built SOP document templates. Each template returns a Tiptap JSON tree
// that the API uses to seed `bos_sop_documents.content` when the create
// request includes { template_id }.
//
// We keep templates in TypeScript (not the database) so they ship with the
// app and can be improved without migrations. Adding a template is a one-row
// change to TEMPLATE_REGISTRY.

import type { SopDocContent, SopNode } from '@/types/bos-sop';

// Convenient builders so the template definitions stay readable.
const p = (text: string, attrs?: Record<string, unknown>): SopNode => ({
  type: 'paragraph',
  attrs,
  content: text ? [{ type: 'text', text }] : [],
});

const h = (level: number, text: string): SopNode => ({
  type: 'heading',
  attrs: { level },
  content: [{ type: 'text', text }],
});

const hr = (): SopNode => ({ type: 'horizontalRule' });

const ul = (...items: string[]): SopNode => ({
  type: 'bulletList',
  content: items.map((item) => ({
    type: 'listItem',
    content: [p(item)],
  })),
});

const ol = (...items: string[]): SopNode => ({
  type: 'orderedList',
  content: items.map((item) => ({
    type: 'listItem',
    content: [p(item)],
  })),
});

const blockquote = (text: string): SopNode => ({
  type: 'blockquote',
  content: [p(text)],
});

// ── Template definitions ───────────────────────────────────────────────────

interface SopTemplate {
  id: string;
  name: string;
  description: string;
  category: 'syllabus_framing' | 'syllabus_revision' | 'meeting_protocol' | 'evaluation_policy' | 'general';
  language: 'en' | 'ta' | 'mixed';
  build: () => SopDocContent;
}

// Standard Operating Procedure: Framing and Revision of Syllabus (UG/PG, A&S)
// Mirrors the document the user requested as the canonical Phase-1 SOP.
const syllabusFramingRevision: SopTemplate = {
  id: 'syllabus_framing_revision',
  name: 'Framing & Revision of Syllabus (UG/PG — Arts & Science)',
  description:
    'Standard Operating Procedure for framing and revising syllabi for UG and PG programmes in Arts and Science.',
  category: 'syllabus_framing',
  language: 'en',
  build: () => ({
    type: 'doc',
    content: [
      h(1, 'Standard Operating Procedure (SOP)'),
      h(2, 'Framing and Revision of Syllabus'),
      p('UG and PG Programmes — Arts and Science', { textAlign: 'center' }),
      hr(),
      h(2, '1. Purpose'),
      p(
        'To define the procedure followed by the Board of Studies (BoS) for framing new syllabi and revising existing syllabi for UG and PG programmes in Arts and Science, ensuring alignment with UGC norms, regulatory bodies, and outcome-based education (OBE) principles.'
      ),
      h(2, '2. Scope'),
      p(
        'This SOP applies to all departments offering UG and PG programmes in Arts and Science under the institution. It covers framing of syllabi for newly introduced programmes, periodic revision of existing syllabi, and incorporation of feedback from stakeholders.'
      ),
      h(2, '3. Responsibility'),
      ul(
        'Chairperson of the Board of Studies — overall responsibility for the procedure',
        'Head of the Department — coordination at department level',
        'Subject Experts (External & Internal) — technical review of syllabi',
        'BoS Members — discussion, deliberation, and approval',
        'Controller of Examinations (COE) — alignment with examination patterns',
        'Office of Academic Affairs — documentation and notification'
      ),
      h(2, '4. Procedure'),
      h(3, '4.1 Framing of New Syllabus'),
      ol(
        'Identify the need for a new programme based on industry demand, academic relevance, and student preferences.',
        'Constitute a Subject Committee with internal faculty and at least one external subject expert.',
        'Draft the syllabus following OBE framework — Programme Outcomes (POs), Programme Specific Outcomes (PSOs), Course Outcomes (COs), and a chosen taxonomy (Bloom\'s for UG/PG Arts & Science, Fink\'s for Management).',
        'Map every Course Outcome to one or more taxonomy levels.',
        'Circulate the draft to all BoS members at least 7 days before the meeting.',
        'Discuss, refine, and approve the syllabus in the BoS meeting.',
        'Forward the approved syllabus to the Academic Council for ratification.'
      ),
      h(3, '4.2 Revision of Existing Syllabus'),
      ol(
        'Conduct stakeholder feedback every academic year (students, alumni, faculty, employers).',
        'Identify gaps, redundancies, or outdated content based on feedback and accreditation requirements.',
        'Subject Committee proposes revised content; revisions cannot exceed 30% of credits unless approved by Academic Council.',
        'Maintain version control — every revision must record version number, date, and rationale in the BoS module.',
        'Publish the revised syllabus through the institution\'s official notification process.'
      ),
      h(2, '5. Frequency of Revision'),
      ul(
        'UG syllabi — once every 3 years (minor revisions allowed annually)',
        'PG syllabi — once every 2 years',
        'Emergency revisions — at any time on the recommendation of the BoS chair'
      ),
      h(2, '6. Documentation & Records'),
      ul(
        'BoS meeting minutes',
        'Approved syllabus document with version history',
        'Course Outcome → Taxonomy mapping sheet',
        'Stakeholder feedback summary',
        'Notification of syllabus rollout'
      ),
      h(2, '7. References'),
      ul(
        'UGC Quality Mandate Guidelines',
        'NAAC Manual for Self-Study Report (latest revision)',
        'Institution\'s Academic Regulations'
      ),
      h(2, '8. Review of this SOP'),
      blockquote(
        'This SOP shall be reviewed every 2 years by the BoS or earlier if regulatory bodies issue new guidelines.'
      ),
    ],
  }),
};

const meetingProtocol: SopTemplate = {
  id: 'meeting_protocol',
  name: 'BoS Meeting Protocol',
  description: 'Standard procedure for conducting Board of Studies meetings.',
  category: 'meeting_protocol',
  language: 'en',
  build: () => ({
    type: 'doc',
    content: [
      h(1, 'Standard Operating Procedure'),
      h(2, 'Conduct of Board of Studies Meetings'),
      hr(),
      h(2, '1. Purpose'),
      p('To standardise the conduct of BoS meetings, ensuring quorum, fair deliberation, and compliant record-keeping.'),
      h(2, '2. Pre-Meeting'),
      ol(
        'Issue notice at least 14 days in advance with date, time, venue, and provisional agenda.',
        'Circulate working papers and proposed syllabi 7 days before the meeting.',
        'Confirm attendance of external experts and the Vice-Chancellor nominee.'
      ),
      h(2, '3. Quorum'),
      p('At least 50% of total members, of whom one must be an external subject expert.'),
      h(2, '4. During the Meeting'),
      ol(
        'Welcome and introduction by the Chairperson.',
        'Approval of the previous meeting\'s minutes.',
        'Item-wise discussion of the agenda.',
        'Recording of decisions, dissent notes, and action items.',
        'Vote of thanks.'
      ),
      h(2, '5. Post-Meeting'),
      ul(
        'Draft minutes within 3 working days; circulate for member confirmation within 7 days.',
        'Forward ratified minutes and resolutions to Academic Council.',
        'Update the BoS module with attendance, decisions, and resolutions.'
      ),
    ],
  }),
};

const evaluationPolicy: SopTemplate = {
  id: 'evaluation_policy',
  name: 'Evaluation Policy SOP',
  description: 'Internal and external evaluation procedure for UG/PG programmes.',
  category: 'evaluation_policy',
  language: 'en',
  build: () => ({
    type: 'doc',
    content: [
      h(1, 'Standard Operating Procedure'),
      h(2, 'Evaluation Policy'),
      hr(),
      h(2, '1. Continuous Internal Assessment (CIA)'),
      ul(
        'Two periodic tests (15 marks each)',
        'Assignment / Seminar (5 marks)',
        'Attendance (5 marks)'
      ),
      h(2, '2. End-Semester Examination (ESE)'),
      p('60 marks, conducted by the Controller of Examinations as per the approved scheme.'),
      h(2, '3. Outcome Mapping'),
      p('Every question in the question paper shall be tagged with the Course Outcome and the taxonomy level it assesses.'),
      h(2, '4. Re-evaluation & Grievances'),
      ol(
        'Student applies for re-evaluation within 7 days of result publication.',
        'A second examiner re-evaluates the script.',
        'If the difference exceeds 10%, a third examiner is appointed; the average becomes the final mark.'
      ),
    ],
  }),
};

const blank: SopTemplate = {
  id: 'blank',
  name: 'Blank Document',
  description: 'Start from an empty document.',
  category: 'general',
  language: 'en',
  build: () => ({ type: 'doc', content: [p('')] }),
};

// ── Registry ───────────────────────────────────────────────────────────────

export const SOP_TEMPLATES: SopTemplate[] = [
  blank,
  syllabusFramingRevision,
  meetingProtocol,
  evaluationPolicy,
];

export function getSopTemplate(id: string): SopTemplate | undefined {
  return SOP_TEMPLATES.find((t) => t.id === id);
}

export function getSopTemplateContent(id: string): SopDocContent | undefined {
  const tpl = getSopTemplate(id);
  return tpl ? tpl.build() : undefined;
}

export function listSopTemplates(): Pick<
  SopTemplate,
  'id' | 'name' | 'description' | 'category' | 'language'
>[] {
  return SOP_TEMPLATES.map(({ id, name, description, category, language }) => ({
    id,
    name,
    description,
    category,
    language,
  }));
}
