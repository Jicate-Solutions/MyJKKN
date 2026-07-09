# v3.5 JSONB Shapes + Canonical Common Blocks

TypeScript sources of truth: `types/bos.ts` (interfaces listed per section).
All `id` fields are optional and normally omitted on import; `sno`/`option_no`
are 1-based integers maintained contiguous by the form on add/remove.

**Inline bold**: the paragraph fields (`capstone_project.intro_note`,
`concept_applications.intro_note`, `llc_conference.description`) support
`**bold phrase**` markers, mirroring the source documents' `<strong>` spans.
The PDF/DOCX exporters render them bold; the form textarea shows the literal
markers. Stamp them with `scripts/update-bos-syllabus-v35-bold-markers.sql`
(idempotent) after importing new rows.

## 1. `concept_applications` — `BosConceptApplicationsData`

```json
{
  "intro_note": "Five short Fink's-shaped activities, one per Unit, ...",
  "activities": [
    {
      "sno": 1,
      "unit": "I",
      "finks_dimension": "Foundational Knowledge",
      "task": "What the Learner does with THEIR real content...",
      "deliverable_notes": "The evidence + the 3-4 sentence reflection prompt..."
    }
  ]
}
```

- `unit` is free text: `"I"`–`"V"` for theory papers, `"Lab 1-2"` style for
  practicals, `"Word Tasks 1-2"` style for office-tools papers.
- `finks_dimension` full names: Foundational Knowledge, Application,
  Integration, Human Dimension, Caring, Learning How to Learn.
- Two standard intro_note variants: "...activities, one per Unit, conducted..."
  (theory) and "...activities anchored to the lab experiments, conducted..."
  (practicals). Both end with the same evidence sentence ("The deliverable for
  each is the evidence — a photo, a reading, a hand-drawn sketch, a data
  table, a quoted voice, running code — plus three or four sentences, not an
  essay. Every task requires a named local place, a named person, a real
  measurement, or a hand-made artefact that an AI cannot fabricate.").

## 2. `assessment_pattern` — `BosAssessmentPatternData` (canonical v3.5 block)

Identical across all v3.5 courses; copy verbatim:

```json
{
  "internal_marks": 30,
  "external_marks": 70,
  "components": [
    { "sno": 1, "component": "CIA I, CIA II & Model Examination", "marks": 15 },
    { "sno": 2, "component": "Activities*", "marks": 5 },
    { "sno": 3, "component": "Capstone Project (see below)", "marks": 10 }
  ],
  "activities_note": "* Activities: Assignment / Case study / Field survey / PPT / Group discussion / Subject Viva / Report Writing / Mind map / Flow chart / Model making / Debate / Surprise test / Open book test.",
  "note": "The five Concept Applications are formative Fink's-shaped practice. The summative Fink's assessment is the Capstone Project (10 marks) detailed below."
}
```

## 3. `capstone_project` — `BosCapstoneProjectData`

```json
{
  "intro_note": "Choose ONE of FIVE — Solo · 10 marks (Internal) · ...",
  "options": [
    {
      "option_no": 1,
      "title": "The Document Kit for a Real Event",
      "primary": "text after 'PRIMARY (AI-proof):' with the prefix stripped",
      "support": "text after 'SUPPORT:' — usually starts '~400 words on...'",
      "llc": "text after 'LLC:' — what is demonstrated live"
    }
  ]
}
```

Canonical v3.5 `intro_note` (identical across courses; copy verbatim):

> Choose ONE of FIVE — Solo · 10 marks (Internal) · spans the semester ·
> presented at the end-of-course Learners Led Conference. The Senior Learner
> introduces all five Capstones to the cohort in week 1. The assessment
> focuses on what AI cannot do. Each Capstone has three parts: (1) the
> AI-proof primary deliverable — a real measured object, a hand-drawn graph, a
> named-source interview with a phone-verifiable contact, running code, a real
> dataset, or a thing you built, as the option specifies; (2) a short
> ~400-word reflection — deliberately brief, enough to show your thinking, too
> short to be worth generating; and (3) a 5–7 minute presentation at the
> end-of-course Learners Led Conference (LLC) where you show the real thing
> and answer unscripted questions. A long polished essay is exactly what a
> language model produces best, so it is not the deliverable. No
> outside-community Public Exhibition — the LLC audience is the cohort and
> faculty.

## 4. `capstone_rubric` — `BosCapstoneRubricData` (canonical v3.5 block)

Identical across all v3.5 courses; copy verbatim (criteria sum = total_marks = 10):

```json
{
  "total_marks": 10,
  "note": "10 marks · common to all 5 options",
  "criteria": [
    { "sno": 1, "criterion": "Specificity of lived engagement (not generic; named places, named people, real measurements, real data)", "marks": 2 },
    { "sno": 2, "criterion": "Quality of disciplinary craft (course-appropriate technique — reasoning, measurement rigour, code, analysis — in service of the subject)", "marks": 3 },
    { "sno": 3, "criterion": "Honest self-reflection (pre-conceptions named, shift documented, courage in saying what is hard)", "marks": 2 },
    { "sno": 4, "criterion": "Continuing commitment OR ethical care (subject consent, give-back, named follow-through where applicable)", "marks": 2 },
    { "sno": 5, "criterion": "Authentic voice + LLC presentation (the Capstone is presented at the Learners Led Conference — clarity, ownership, ability to answer questions; AI use declared if any — Humans are Principals, AI are Agents)", "marks": 1 }
  ]
}
```

## 5. `llc_conference` — `BosLlcConferenceData` (canonical v3.5 block)

Identical across all v3.5 courses; copy verbatim:

```json
{
  "title": "End-of-Course Learners Led Conference",
  "subtitle": "cohort audience · faculty + Senior Learner facilitate · no outside guest required",
  "description": "In the final fortnight of the semester, the cohort convenes a Learners Led Conference — JKKN's established learner-run session format — in which every Learner presents their Capstone: a 5–7 minute talk showing what they made, measured, built, or found (the object, the data table, the hand-drawn graph, the running program, the quoted voice, the photograph of the named place) and answering two or three questions from peers and faculty. The Learner is the Principal of the session. Faculty and the Senior Learner facilitate and assess the presentation dimension of the Capstone rubric. This makes each Capstone presentable and public-to-the-cohort without importing Full-tier Public-Exhibition machinery."
}
```
