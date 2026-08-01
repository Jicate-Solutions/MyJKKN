/**
 * The CEO's CAC metric framework, as data.
 *
 * Source: "CLUSTER ACADEMIC COUNCIL (CAC) METRICS · MY JKKN · July 2026",
 * issued by ceo@jkkn.ac.in. Six categories, each with a stated objective, and
 * 48 leaf metrics beneath them.
 *
 * ONE ROW BELOW IS NOT THE CEO'S, and it is marked `addedBy: 'jkkn'` so that it
 * can never be mistaken for one. The charter names multi- and inter-disciplinary
 * work; the CEO's 48 measure it only as a teaching practice, under Best
 * Practices. Nothing measured it as research, which made the gap invisible
 * rather than merely unfilled. Adding it was justified by one thing — it is
 * derivable from data the platform already holds. That test is the bar for the
 * next such addition, and the file has 48 CEO rows plus 1 today.
 *
 * WHICH STRINGS ARE QUOTATIONS AND WHICH ARE TRANSLATIONS — read this before
 * editing any string below, because the two are deliberately treated differently
 * and the difference is not visible from the values alone:
 *
 *   `ceoLabel` and `title` are VERBATIM, including the document's own
 *   vocabulary, and are never reworded. They are what lets a reader hold this
 *   page beside the CEO's document and match it line by line — "Faculty
 *   Development Programmes (FDP)", "Training Hours per Faculty" and "Curriculum
 *   Planning & Delivery" all keep the source wording for exactly that reason.
 *
 *   `objective` is RENDERED IN JKKN TERMINOLOGY. Unlike a metric name, a
 *   category objective is a prose sentence, and it is printed on screen
 *   (measured-metrics-section.tsx renders `{category.objective}` under each
 *   category heading). JKKN's zero-tolerance terminology standard applies to
 *   copy a reader sees, so the sentence is translated rather than quoted. One
 *   substitution has been made, in category 6: "faculty" → "Senior Learners".
 *   Nothing else in any objective was altered — "Senior Learners" IS the JKKN
 *   term for faculty, so the CEO's meaning is carried across intact.
 *
 *   Everything this file adds around both (evidence, notes, identifiers) uses
 *   JKKN terminology.
 *
 * A WARNING FOR THE NEXT EDITOR. scripts/ci/check-terminology-delta.py is a
 * BLOCKING gate, and the verbatim labels above survive it only because it skips
 * a match that sits flush against a quote character — every one of those terms
 * happens to fall at the very start or end of its string. "faculty" and
 * "curriculum" are both zero-tolerance terms, so a label reflowed onto a new
 * line, re-punctuated, or given a prefix will move the term into mid-string and
 * fail CI. That is a signal, not a nuisance: it means a quotation has stopped
 * looking like one. Fix it by restoring the exact source wording, never by
 * splitting the literal so the term lands beside a quote — that would defeat a
 * Director-locked control rather than satisfy it.
 *
 * Why a versioned constant rather than rows in `sh_accreditation_metrics`:
 * that table is the scoring spine for the ten OUTSIDE regulators, and filing CAC
 * there would mean adding 'CAC' to the `BodyCode` union — which drags in weights,
 * ceilings and a total. The Director's first locked decision was measurement
 * WITHOUT a grade, so the catalog stays out of the scoring machinery. The CEO's
 * list is also fixed content, not something a user edits, so rows buy nothing.
 *
 * Why the substrate state is recorded here rather than inferred at render time:
 * a metric with no source must say "not captured yet", and a metric whose source
 * exists but is empty must say something different — otherwise the screen cannot
 * tell "we do not track this" apart from "we track it and nobody has filled it
 * in". Guessing that distinction from a zero is exactly the failure this page is
 * built to avoid. Each state below was verified against production on
 * 2026-07-30; the query that establishes each one is named in `evidence`.
 *
 * Pure, and in its own module, because importing the page pulls the Supabase
 * client in at module scope and that cannot load under vitest — the same reason
 * `cluster-scope.ts` sits beside it.
 */

/** Bumped when the CEO reissues the framework. Shown on the page. */
export const CAC_CATALOG_VERSION = '2026-07';

/**
 * How much of a metric the platform can actually stand behind today.
 *
 * `measured`      — real per-institution numbers exist and are wired.
 * `awaiting-entry` — the platform holds a place for this and nobody has used it
 *                    yet. A true statement about adoption, not about quality.
 * `cluster-only`  — captured, but only for the cluster as a whole. Rendering it
 *                    in a per-institution row would attribute a shared number to
 *                    one college.
 * `no-substrate`  — nothing anywhere in the platform captures this yet.
 *
 * `awaiting-entry`, `cluster-only` and `no-substrate` all render as "not captured
 * yet" in the per-institution cell, per the Director's second locked decision —
 * never as 0. They differ only in the reason line, which is what makes the gap
 * diagnosable instead of merely visible.
 */
export type MetricSubstrate =
  | 'measured'
  | 'awaiting-entry'
  | 'cluster-only'
  | 'no-substrate';

/**
 * Which kinds of institution the metric can sensibly apply to.
 *
 * A matriculation school has no Scopus publications and no patents. Rendering
 * those as blank cells for the two schools would read as a failure rather than
 * as a category that does not apply — the Director's third locked decision.
 */
export type MetricScope = 'college' | 'school' | 'both';

export interface CacMetric {
  /** Stable slug. Also the key the aggregation function returns. */
  id: string;
  /**
   * Verbatim from the CEO document. Never reworded — unless `addedBy` is set,
   * in which case there is no source line to quote and the label is JKKN's own.
   */
  ceoLabel: string;
  /**
   * The CEO's own grouping bullet, where the document nests one. Kept so the
   * screen can reproduce the document's shape rather than flattening it.
   *
   * On an `addedBy` row there is no such bullet, so the slot carries the fact
   * that the row is not the CEO's instead — it is the one field beside the
   * label that the table actually prints, which is what makes the distinction
   * visible to a reader rather than only to a test.
   */
  parent?: string;
  /**
   * Set ONLY on a dimension JKKN added beyond the CEO's 48.
   *
   * It exists so "the document has 48 leaf metrics" stays an assertable fact
   * after this file grows. Without it the only guard against inventing a CEO
   * line is a total that anyone can bump; with it, the count of rows carrying
   * no `addedBy` is pinned at 48 and an invented quotation fails CI.
   */
  addedBy?: 'jkkn';
  substrate: MetricSubstrate;
  scope: MetricScope;
  /**
   * Where a measured number comes from, or why there is none. Written for a
   * reader deciding whether to trust the figure.
   *
   * COUNTING RULE — follow it when editing any string below. Two of these
   * counts were already stale within hours of being written (usage_events said
   * 99,272 against an actual 106,088; platform_policies said 453 against 467),
   * because a hardcoded total of a live table starts rotting the moment it is
   * committed and nothing here can ever notice.
   *
   *   Continuously growing tables (usage_events, platform_policies,
   *   student_attendance, curriculum_lesson, ai_pulse_prompt_builds, events and
   *   their registrations) — state INSTITUTION COVERAGE only, never an absolute
   *   row count. Coverage moves when an institution starts or stops recording,
   *   which is the fact worth stating; the row total is noise that ages badly.
   *
   *   Static or empty tables (sh_publications, alumni_outcomes,
   *   sh_solution_mous, cdc_placements, startup_events, the two okr tables) —
   *   keep the number, because "0 rows" and "1 record" are the whole point, but
   *   stamp it "as of 2026-07-30" so a reader knows it is an observation with a
   *   date rather than a live figure.
   *
   * The test of a good string: a reader six months from now must not be shown a
   * number that has silently stopped being true and has nothing marking it.
   */
  evidence: string;
}

export interface CacCategory {
  id: string;
  /** 1–6, as numbered in the CEO document. */
  number: number;
  /** Verbatim category heading. */
  title: string;
  /**
   * The document's "Objective:" line, rendered in JKKN terminology rather than
   * quoted — it is prose shown on screen. See the file header for the single
   * substitution made and why `ceoLabel` is treated the opposite way.
   */
  objective: string;
  metrics: CacMetric[];
}

// ---------------------------------------------------------------------------
// The catalog. 6 categories, 48 CEO leaf metrics + 1 marked `addedBy: 'jkkn'`.
// ---------------------------------------------------------------------------

export const CAC_METRIC_CATALOG: readonly CacCategory[] = [
  {
    id: 'learner-centricity',
    number: 1,
    title: 'Learner Centricity',
    objective: 'Enhance learner success, engagement, and holistic development.',
    metrics: [
      {
        id: 'attendance',
        ceoLabel: 'Attendance',
        substrate: 'measured',
        scope: 'both',
        evidence:
          'student_attendance, counted per institution. 10 of 14 institutions have records.',
      },
      {
        id: 'pass-percentage',
        ceoLabel: 'Academic Performance & Pass Percentage',
        substrate: 'measured',
        scope: 'college',
        evidence:
          'coe_naac_evidence, mirrored nightly from the COE exam system. Only the Arts and Science campus has published results, so 2 of 14 institutions carry a figure — and those two are one campus recorded twice.',
      },
      {
        id: 'mentorship-slow',
        ceoLabel: 'Slow Learners',
        parent: 'Learner Mentorship',
        substrate: 'no-substrate',
        scope: 'both',
        evidence:
          'No table records a mentorship band per learner. Attendance and marks exist, but the platform never stores the judgement that a learner needs extra support.',
      },
      {
        id: 'mentorship-advanced',
        ceoLabel: 'Advanced Learners',
        parent: 'Learner Mentorship',
        substrate: 'no-substrate',
        scope: 'both',
        evidence: 'Same gap as the slow-learner band — no mentorship band is stored.',
      },
      {
        id: 'competitive-exams',
        ceoLabel: 'Competitive Examination Performance',
        substrate: 'no-substrate',
        scope: 'college',
        evidence:
          'Nothing records an external competitive examination result. The COE mirror carries internal semester results only.',
      },
      {
        id: 'placement-progression',
        ceoLabel: 'Placement & Higher Education Progression',
        substrate: 'awaiting-entry',
        scope: 'college',
        evidence:
          'cdc_placements exists and holds 1 record platform-wide as of 2026-07-30, with no institution column — it links through the learner. One record is not a measurement, so this reads as not captured.',
      },
      {
        id: 'holistic-sports',
        ceoLabel: 'Sports',
        parent: 'Holistic Development',
        substrate: 'measured',
        scope: 'both',
        evidence:
          'HOSTED: events of type sports, sports_tournament or marathon joined to events_registrations — 7 institutions have such events, and registrations are so concentrated on one marathon that the total says little about participation. OUTBOUND: health_sports_achievements at event_level above the institution (inter_college, district, state, national, international), verified counted apart from unverified — a tournament our learners travel to creates no events row, so without this half it earns nothing. That table held 1 row as of 2026-07-30, unverified: the route is open, the figure is not yet on this grid. Read: lib/services/accreditation/outbound-participation.ts.',
      },
      {
        id: 'holistic-cultural',
        ceoLabel: 'Cultural Activities',
        parent: 'Holistic Development',
        substrate: 'measured',
        scope: 'both',
        evidence:
          'HOSTED: events of type cultural joined to events_registrations. One institution only, and nothing is registered against what it has — a real but very small number. OUTBOUND: health_sports_achievements carries a category column, widened on 2026-07-26 to hold cultural awards, read at event_level above the institution with verified split from unverified. As of 2026-07-30 that table holds one row and its category is sports, so nothing outbound is recorded for cultural activity yet.',
      },
      {
        id: 'holistic-leadership',
        ceoLabel: 'Leadership Development',
        parent: 'Holistic Development',
        substrate: 'no-substrate',
        scope: 'both',
        evidence:
          'Council and committee memberships exist, but nothing records a learner leadership programme or its participants.',
      },
      {
        id: 'holistic-entrepreneurship',
        ceoLabel: 'Entrepreneurship & Start-ups',
        parent: 'Holistic Development',
        substrate: 'no-substrate',
        scope: 'both',
        evidence:
          'startup_events holds 12 rows as of 2026-07-30 and DOES carry an institution — host_institution_id, populated for 10 of them across 4 institutions. It is still not wired here, for a different reason: it records institutional incubation activity with no learner link, so it cannot describe learner entrepreneurship. It is reported once, under Incubation & Start-up Activities, rather than counted twice here.',
      },
      {
        id: 'holistic-community-service',
        ceoLabel: 'Community Service (NSS/NCC/YRC)',
        parent: 'Holistic Development',
        substrate: 'no-substrate',
        scope: 'both',
        evidence: 'No NSS, NCC or YRC enrolment or activity is recorded anywhere.',
      },
    ],
  },

  {
    id: 'academic-coordination',
    number: 2,
    title: 'Academic Coordination',
    objective: 'Improve academic quality through collaborative planning.',
    metrics: [
      {
        id: 'results-analysis',
        ceoLabel: 'Academic Results Analysis',
        substrate: 'measured',
        scope: 'college',
        evidence:
          'Exam sessions with published results mirrored into coe_naac_evidence. The Arts and Science campus is the only one with any published.',
      },
      {
        id: 'curriculum-delivery',
        ceoLabel: 'Curriculum Planning & Delivery',
        substrate: 'measured',
        scope: 'both',
        evidence:
          'curriculum_lesson — the learning-framework session records Senior Learners file. 6 institutions have records.',
      },
      {
        id: 'cert-swayam',
        ceoLabel: 'SWAYAM',
        parent: 'Online Certification Courses',
        substrate: 'no-substrate',
        scope: 'college',
        evidence: 'No external certification enrolment or completion is stored.',
      },
      {
        id: 'cert-nptel',
        ceoLabel: 'NPTEL',
        parent: 'Online Certification Courses',
        substrate: 'no-substrate',
        scope: 'college',
        evidence: 'No external certification enrolment or completion is stored.',
      },
      {
        id: 'cert-mooc',
        ceoLabel: 'MOOC Platforms',
        parent: 'Online Certification Courses',
        substrate: 'no-substrate',
        scope: 'college',
        evidence: 'No external certification enrolment or completion is stored.',
      },
      {
        id: 'value-added-courses',
        ceoLabel: 'Value-Added Courses',
        substrate: 'no-substrate',
        scope: 'both',
        evidence:
          'Courses are recorded, but nothing marks one as value-added, so the subset cannot be counted.',
      },
      {
        id: 'academic-calendar-compliance',
        ceoLabel: 'Academic Calendar Compliance',
        substrate: 'no-substrate',
        scope: 'both',
        evidence:
          'A calendar exists, but nothing compares planned dates against what actually happened, which is what compliance would measure.',
      },
      {
        id: 'obe-monitoring',
        ceoLabel: 'Outcome-Based Education (OBE) Monitoring',
        substrate: 'measured',
        scope: 'college',
        evidence:
          'obe_course_outcomes, with attainment rollups. 3 institutions have records.',
      },
    ],
  },

  {
    id: 'quality-enhancement',
    number: 3,
    title: 'Quality Enhancement',
    objective: 'Foster innovation and continuous improvement.',
    metrics: [
      {
        id: 'bp-innovative-teaching',
        ceoLabel: 'Innovative Teaching–Learning Practices',
        parent: 'Best Practices',
        substrate: 'no-substrate',
        scope: 'both',
        evidence:
          'No table records a declared best practice. This is narrative content today, written per accreditation cycle rather than counted.',
      },
      {
        id: 'bp-innovative-assessment',
        ceoLabel: 'Innovative Assessment Methods',
        parent: 'Best Practices',
        substrate: 'no-substrate',
        scope: 'both',
        evidence: 'No declared best practice is recorded.',
      },
      {
        id: 'bp-interdisciplinary',
        ceoLabel: 'Interdisciplinary & Multidisciplinary Learning',
        parent: 'Best Practices',
        substrate: 'no-substrate',
        scope: 'both',
        evidence:
          'No declared best practice is recorded. Read this as a way of TEACHING a programme, not as research output — it says nothing about whether our published work crosses departments. That is a separate question with a separate cause, reported under Research & Collaboration as Interdisciplinary Research.',
      },
      {
        id: 'bp-experiential',
        ceoLabel: 'Experiential Learning',
        parent: 'Best Practices',
        substrate: 'no-substrate',
        scope: 'both',
        evidence: 'No declared best practice is recorded.',
      },
      {
        id: 'bp-ai-enabled',
        ceoLabel: 'AI-Enabled Teaching & Learning',
        parent: 'Best Practices',
        substrate: 'no-substrate',
        scope: 'both',
        evidence:
          'AI Pulse counts how often Senior Learners actually use AI, which is reported under AI Adoption. A declared AI-enabled teaching practice is a different thing and is not recorded, so this is not filled from the same number.',
      },
      {
        id: 'academic-audit',
        ceoLabel: 'Academic Audit & Quality Initiatives',
        substrate: 'no-substrate',
        scope: 'both',
        evidence:
          'No academic audit round, finding or closure is stored. Committee meetings are recorded, but not as audits.',
      },
    ],
  },

  {
    id: 'institutional-governance',
    number: 4,
    title: 'Institutional Governance',
    objective: 'Strengthen governance through data-driven decision-making.',
    metrics: [
      {
        id: 'idp',
        ceoLabel: 'Institutional Development Plan (IDP)',
        substrate: 'no-substrate',
        scope: 'both',
        evidence: 'No development plan document or milestone set is recorded.',
      },
      {
        id: 'atr',
        ceoLabel: 'Action Taken Report (ATR)',
        substrate: 'no-substrate',
        scope: 'both',
        evidence:
          'Meeting resolutions are recorded, but nothing tracks whether the action was taken, which is what an ATR reports.',
      },
      {
        id: 'kpi-okr',
        ceoLabel: 'KPI / OKR Monitoring',
        substrate: 'cluster-only',
        scope: 'both',
        evidence:
          'okr_metric_registry defines 19 metrics and carries no institution at all. okr_metric_execution_log holds 27 runs and DOES carry institution_id, populated for 17 of them across 2 institutions (all as of 2026-07-30) — so a per-institution figure is possible from the execution log later. It is not wired in this slice, so what is shown here is cluster-wide.',
      },
      {
        id: 'ca-pa',
        ceoLabel: 'Continuous Assessment / Performance Appraisal (CA/PA)',
        substrate: 'no-substrate',
        scope: 'both',
        evidence:
          'No appraisal cycle or rating for team members is recorded in this platform.',
      },
      {
        id: 'fdp',
        ceoLabel: 'Faculty Development Programmes (FDP)',
        substrate: 'no-substrate',
        scope: 'both',
        evidence:
          'No development programme for Senior Learners is recorded — neither the programme nor who attended.',
      },
      {
        id: 'e-governance',
        ceoLabel: 'E-Governance & Digital Transformation',
        substrate: 'measured',
        scope: 'both',
        evidence:
          'usage_events — actual platform use, counted per institution. The only metric carrying data for all 14 institutions.',
      },
      {
        id: 'policy-compliance',
        ceoLabel: 'Policy Implementation & Compliance',
        substrate: 'measured',
        scope: 'both',
        evidence:
          'platform_policies scoped to an institution: 2 institutions carry any. The remaining policies are cluster-wide and are reported separately, never attributed to a single college.',
      },
    ],
  },

  {
    id: 'research-collaboration',
    number: 5,
    title: 'Research & Collaboration',
    objective: 'Promote innovation, research, and societal impact.',
    metrics: [
      {
        id: 'publications',
        ceoLabel: 'Publications (Scopus/Web of Science/UGC)',
        substrate: 'awaiting-entry',
        scope: 'college',
        evidence:
          'sh_publications exists, with an institution column, and holds 0 rows as of 2026-07-30. The platform can hold this the moment anyone records one.',
      },
      {
        // Not one of the CEO's 48. The charter names multi- and
        // inter-disciplinary work, and until this row existed the catalog
        // answered that only under Best Practices — as a way of teaching. That
        // left the research half of the charter measured nowhere, and read as
        // though it were covered. It is added here rather than left to the
        // narrative because, unlike a declared best practice, this one is
        // already derivable from data the platform is built to hold.
        id: 'research-interdisciplinary',
        ceoLabel: 'Interdisciplinary Research',
        parent: 'Added by JKKN · not in the CEO list',
        addedBy: 'jkkn',
        substrate: 'awaiting-entry',
        scope: 'college',
        evidence:
          'Derived, never declared: sh_publications carries institution_id and department_id, and sh_publication_contributors resolves every contributor through staff_id or learner_id to a person holding their own department and institution — so a paper whose contributors span two departments, or two institutions, is countable without anyone tagging it as interdisciplinary. Both tables held 0 rows on 2026-08-01, so what is missing is the first recorded publication, not the engineering. Two cases stay outside any such count: an external co-author carries only a free-text affiliation, and a non-teaching contributor may have no department at all.',
      },
      {
        id: 'research-grants',
        ceoLabel: 'Research Grants',
        substrate: 'no-substrate',
        scope: 'college',
        evidence: 'No grant, sanction or funded amount is recorded.',
      },
      {
        id: 'research-projects',
        ceoLabel: 'Research Projects',
        substrate: 'no-substrate',
        scope: 'college',
        evidence: 'No research project record exists.',
      },
      {
        id: 'patents-ipr',
        ceoLabel: 'Patents & Intellectual Property Rights (IPR)',
        substrate: 'no-substrate',
        scope: 'college',
        evidence: 'No patent filing or grant is recorded.',
      },
      {
        id: 'mous',
        ceoLabel: 'MoUs & Strategic Collaborations',
        substrate: 'awaiting-entry',
        scope: 'both',
        evidence:
          'sh_solution_mous exists and holds 0 rows as of 2026-07-30. It also carries no institution column, so even once filled it would report cluster-wide.',
      },
      {
        id: 'incubation-startups',
        ceoLabel: 'Incubation & Start-up Activities',
        substrate: 'cluster-only',
        scope: 'both',
        evidence:
          'startup_events holds 12 rows as of 2026-07-30. It DOES carry an institution — host_institution_id, populated for 10 of them across 4 institutions — so a per-institution figure is possible. It is simply not wired in this slice, so what is shown here is cluster-wide.',
      },
      {
        id: 'consultancy',
        ceoLabel: 'Consultancy',
        substrate: 'no-substrate',
        scope: 'college',
        evidence: 'No consultancy engagement or revenue is recorded.',
      },
      {
        id: 'community-outreach',
        ceoLabel: 'Community Outreach & Extension Activities',
        substrate: 'no-substrate',
        scope: 'both',
        evidence:
          'Some events are outreach in practice, but nothing marks an event as extension activity, so the subset cannot be separated from the rest.',
      },
    ],
  },

  {
    id: 'professional-development',
    number: 6,
    title: 'Professional Development',
    objective: 'Build future-ready Senior Learners and institutional leadership.',
    metrics: [
      {
        id: 'ai-adoption',
        ceoLabel: 'Artificial Intelligence (AI) Adoption',
        substrate: 'measured',
        scope: 'both',
        evidence:
          'ai_pulse_prompt_builds — prompts Senior Learners actually built. 4 of 14 institutions, and a small count so far.',
      },
      {
        id: 'leadership-development',
        ceoLabel: 'Leadership Development',
        substrate: 'no-substrate',
        scope: 'both',
        evidence:
          'No leadership programme for team members is recorded, and role assignments do not imply one.',
      },
      {
        id: 'industry-engagement',
        ceoLabel: 'Industry Engagement',
        substrate: 'no-substrate',
        scope: 'college',
        evidence:
          'No industry visit, guest engagement or partnership is recorded as such.',
      },
      {
        id: 'alumni-engagement',
        ceoLabel: 'Alumni Engagement',
        substrate: 'awaiting-entry',
        scope: 'college',
        evidence:
          'alumni_outcomes exists, carries an institution column, and holds 0 rows as of 2026-07-30. A second alumni-tracking table is also empty.',
      },
      {
        id: 'parent-engagement',
        ceoLabel: 'Parent Engagement',
        substrate: 'awaiting-entry',
        scope: 'both',
        evidence:
          'pp_parent_accounts holds 590 accounts across 2 institutions, but as of 2026-07-30 not one has ever been used: last_login_at, mobile and email are null on all 590. The accounts are provisioned, not engaged. Counting them would put a large number on screen under a label reading ENGAGEMENT, so the count is deliberately not reported and this reads as not captured. It becomes measurable the day a parent signs in.',
      },
      {
        id: 'vendor-engagement',
        ceoLabel: 'Vendor & Strategic Partner Engagement',
        substrate: 'no-substrate',
        scope: 'both',
        evidence:
          'Procurement records vendors, but nothing measures engagement with them.',
      },
      {
        id: 'professional-certifications',
        ceoLabel: 'Professional Certifications',
        substrate: 'no-substrate',
        scope: 'both',
        evidence: 'No certification held by a team member is recorded.',
      },
      {
        id: 'training-hours',
        ceoLabel: 'Training Hours per Faculty',
        substrate: 'no-substrate',
        scope: 'both',
        evidence:
          'No training attendance or hour count is recorded for Senior Learners.',
      },
    ],
  },
] as const;

// ---------------------------------------------------------------------------
// Derived facts about the catalog. Computed, never hand-maintained, so the
// header count on the page can never drift from the list beneath it.
// ---------------------------------------------------------------------------

export function allMetrics(): CacMetric[] {
  return CAC_METRIC_CATALOG.flatMap((c) => c.metrics);
}

/**
 * The ids of every metric this catalog claims real substrate for.
 *
 * The page compares this against what the read actually returned, so that a
 * wired metric which comes back with nothing for every institution can be shown
 * as having stopped reporting rather than as fourteen empty institutions.
 *
 * Derived, like every other fact in this section, and for the sharper of the two
 * reasons: a hand-kept list would go stale exactly when a metric is wired or
 * unwired, which is the moment the comparison has to be right. A stale list
 * would either accuse a healthy new metric of having stopped or stay silent
 * about the one that did.
 */
export function measuredMetricIds(): string[] {
  return allMetrics()
    .filter((m) => m.substrate === 'measured')
    .map((m) => m.id);
}

export interface CatalogSummary {
  categories: number;
  metrics: number;
  measured: number;
  /** Everything that renders "not captured yet", for any of the three reasons. */
  notCaptured: number;
}

export function summariseCatalog(): CatalogSummary {
  const metrics = allMetrics();
  const measured = metrics.filter((m) => m.substrate === 'measured').length;
  return {
    categories: CAC_METRIC_CATALOG.length,
    metrics: metrics.length,
    measured,
    notCaptured: metrics.length - measured,
  };
}

/**
 * The reason line shown beneath "not captured yet".
 *
 * Kept beside the state it explains so a new state cannot be added without
 * someone deciding what the screen should say about it.
 */
export function substrateReason(substrate: MetricSubstrate): string {
  switch (substrate) {
    case 'measured':
      return 'Measured from platform records.';
    case 'awaiting-entry':
      return 'The platform can hold this — nothing has been recorded yet.';
    case 'cluster-only':
      return 'Captured for the cluster as a whole, not per institution.';
    case 'no-substrate':
      return 'Nothing in the platform captures this yet.';
  }
}
