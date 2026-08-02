// app/(routes)/accreditation/_lib/body-applicability.ts
// ============================================================================
// Which of the ten outside bodies actually inspects a given college.
//
// Director decision 3, 2026-08-01: when a body does not apply to a college, say
// "does not apply" — never a blank, never a zero. A zero is a claim about
// performance; "does not apply" is a claim about jurisdiction, and printing the
// first when you mean the second accuses a college of failing an inspection it
// was never subject to.
//
// THIS MODULE IS THE PER-BODY REFINEMENT BENEATH AN EXISTING COARSE RULE.
// `isInspectedByAccreditationBodies()` next door in `iqac/_lib/collect-once.ts`
// answers the *any-body* question — does ANY of the ten inspect this
// institution — and answers it from `iqac_code`. That rule is settled and this
// module never contradicts it: an institution the coarse rule calls uninspected
// is 'does_not_apply' here for every one of the ten, unconditionally, before
// any per-body reasoning happens at all.
//
// VERIFIED LIVE 2026-08-02: the cluster holds 14 institutions, 8 of which carry
// an `iqac_code` — ALHD, ASAI, ASSF, DENT, EDUC, ENGG, NURS, PHAR. The other
// six (two schools, the main office, the incubation forum, a test tenant and an
// external company) carry none and are inspected by nobody.
//
// WHY THE MAP IS A CONFIG ROW AND NOT A CONSTANT IN THIS FILE
// -----------------------------------------------------------
// `docs/architecture/config-table-pattern.md` names **mappings** in its own
// DOES list: every threshold, mapping, flag or routing rule a super
// administrator might tweak gets a database row and a runtime reader. Which
// bodies inspect which college is precisely such a mapping — it changes when a
// college opens a programme, seeks a new accreditation, or enters a ranking
// exercise, none of which should need a deploy. The map therefore lives in
// `platform_policies` under `accreditation.body_applicability.map`, read via the
// existing `fn_get_policy` RPC.
//
// The table below is the FALLBACK, reviewed here so the module still answers
// honestly before the row is applied — not a second source of truth. A test
// asserts it is byte-identical to the JSON the migration seeds.
//
// THREE ANSWERS, NOT TWO
// ----------------------
// 'applies' and 'does_not_apply' are both assertions of fact and both need a
// basis. Everything else is 'not_established' — rendered "Not established yet".
// Recording an unverified pairing as 'does_not_apply' would commit exactly the
// error this decision exists to prevent, just in the opposite direction: it
// would quietly excuse a college from an inspection it may well be subject to.
//
// Pure and standalone, for the same reason as its neighbours in the sibling
// `_lib` folders: the pages import the Supabase client at module scope and will
// not load under vitest.
// ============================================================================

/**
 * What can be said about one (institution, body) pair.
 *
 * `not_established` is a first-class answer, not an error state. It is the
 * honest reading whenever nothing held here settles the question either way.
 */
export type ApplicabilityVerdict = 'applies' | 'does_not_apply' | 'not_established';

/** The words each verdict renders as. Never blank, never a number. */
export const APPLICABILITY_LABEL: Readonly<Record<ApplicabilityVerdict, string>> = {
  applies: 'Applies',
  does_not_apply: 'Does not apply',
  not_established: 'Not established yet',
};

/**
 * The shape read from `institutions`. `iqac_code` is the marker that already
 * identifies a college platform-wide (`useJKKNInstitutions`, the CAC grouping,
 * the coarse rule in `collect-once.ts`), so it is what this module keys on too.
 */
export interface ApplicableInstitution {
  id?: string;
  name: string;
  iqac_code: string | null;
}

/**
 * How far a body's own remit settles the question.
 *
 *   `institution_wide` — the body inspects institutions as a whole, so it
 *     reaches every inspected college. A ninth college gets the right answer
 *     the day it is given a code, with no edit anywhere.
 *
 *   `discipline` — the body's statute confines it to ONE field of study. The
 *     absence of a college from `appliesTo` is therefore itself verified: the
 *     Dental Council has no jurisdiction over a pharmacy college, and saying so
 *     is reading the statute, not guessing.
 *
 *   `partial` — some pairings are established and the rest genuinely are not.
 *     Absence means unknown, and renders "Not established yet".
 */
export type BodyRemit = 'institution_wide' | 'discipline' | 'partial';

export interface BodyApplicabilityRule {
  /** Body code as the rest of the accreditation module spells it. */
  bodyCode: string;
  remit: BodyRemit;
  /** `iqac_code` values this body verifiably inspects. */
  appliesTo: string[];
  /** Completes "… inspects ___ only." Also explains a 'partial' body's limits. */
  remitNote: string;
}

export interface BodyApplicabilityConfig {
  /** Bumped whenever the map is revised, so a stale read is visible. */
  version: string;
  bodies: BodyApplicabilityRule[];
}

// ---------------------------------------------------------------------------
// The reviewed fallback map — kept identical to the seeded config row.
// ---------------------------------------------------------------------------
//
// Four councils are confined by statute to a single field, so their negatives
// are as solid as their positives. Two bodies reach institutions as a whole.
// The remaining four are recorded as `partial` ON PURPOSE:
//
//   NBA and AICTE — their remit is technical education, and ENGG is the one
//     college that unambiguously sits inside it. Whether either reaches the
//     other seven depends on which programmes each college actually runs, which
//     is not held here. Marking those pairs 'does_not_apply' would be a guess
//     wearing the clothes of a fact.
//
//   NIRF and QS — participation is a decision each college files, not a
//     jurisdiction anyone holds over it. Nothing in this database records that
//     decision yet, so no pairing is established in either direction.
//
// Every one of these is one config row away from being settled, with no deploy.
export const DEFAULT_BODY_APPLICABILITY: BodyApplicabilityConfig = {
  version: '2026-08-09',
  bodies: [
    {
      bodyCode: 'NAAC',
      remit: 'institution_wide',
      appliesTo: [],
      remitNote: 'whole institutions, across every discipline',
    },
    {
      bodyCode: 'UGC',
      remit: 'institution_wide',
      appliesTo: [],
      remitNote: 'whole institutions offering higher education',
    },
    {
      bodyCode: 'PCI',
      remit: 'discipline',
      appliesTo: ['PHAR'],
      remitNote: 'pharmacy education',
    },
    {
      bodyCode: 'DCI',
      remit: 'discipline',
      appliesTo: ['DENT'],
      remitNote: 'dental education',
    },
    {
      bodyCode: 'INC',
      remit: 'discipline',
      appliesTo: ['NURS'],
      remitNote: 'nursing education',
    },
    {
      bodyCode: 'NCTE',
      remit: 'discipline',
      appliesTo: ['EDUC'],
      remitNote: 'teaching-qualification programmes',
    },
    {
      bodyCode: 'NBA',
      remit: 'partial',
      appliesTo: ['ENGG'],
      remitNote: 'programme-level technical accreditation',
    },
    {
      bodyCode: 'AICTE',
      remit: 'partial',
      appliesTo: ['ENGG'],
      remitNote: 'technical education',
    },
    {
      bodyCode: 'NIRF',
      remit: 'partial',
      appliesTo: [],
      remitNote: 'a ranking exercise each college chooses to enter',
    },
    {
      bodyCode: 'QS',
      remit: 'partial',
      appliesTo: [],
      remitNote: 'an international ranking exercise each college chooses to enter',
    },
  ],
};

/** The policy key the map is stored under. Mirrors `POLICY_KEYS`. */
export const BODY_APPLICABILITY_POLICY_KEY = 'accreditation.body_applicability.map';

const normaliseCode = (v: string | null | undefined): string => (v ?? '').trim().toUpperCase();

const isRemit = (v: unknown): v is BodyRemit =>
  v === 'institution_wide' || v === 'discipline' || v === 'partial';

/**
 * Turn whatever `fn_get_policy` returned into a usable map.
 *
 * Falls back to the reviewed default on anything unusable — a missing row, a
 * malformed value, a body entry with no code. Failing soft is right here: the
 * default is itself reviewed, so a bad row degrades to a conservative answer
 * rather than to a blank screen. Individual malformed entries are dropped
 * rather than poisoning the whole map, and a map left with no usable entry
 * falls back whole.
 */
export function parseBodyApplicabilityConfig(raw: unknown): BodyApplicabilityConfig {
  if (!raw || typeof raw !== 'object') return DEFAULT_BODY_APPLICABILITY;

  const candidate = raw as Partial<BodyApplicabilityConfig>;
  if (!Array.isArray(candidate.bodies)) return DEFAULT_BODY_APPLICABILITY;

  const bodies: BodyApplicabilityRule[] = [];
  for (const entry of candidate.bodies) {
    if (!entry || typeof entry !== 'object') continue;
    const rule = entry as Partial<BodyApplicabilityRule>;
    const bodyCode = normaliseCode(typeof rule.bodyCode === 'string' ? rule.bodyCode : null);
    if (!bodyCode || !isRemit(rule.remit)) continue;

    bodies.push({
      bodyCode,
      remit: rule.remit,
      appliesTo: Array.isArray(rule.appliesTo)
        ? rule.appliesTo.filter((c): c is string => typeof c === 'string' && c.trim() !== '')
        : [],
      remitNote: typeof rule.remitNote === 'string' ? rule.remitNote : '',
    });
  }

  if (bodies.length === 0) return DEFAULT_BODY_APPLICABILITY;

  return {
    version: typeof candidate.version === 'string' && candidate.version.trim() !== ''
      ? candidate.version
      : DEFAULT_BODY_APPLICABILITY.version,
    bodies,
  };
}

/** The rule for one body, or null when the map says nothing about it. */
export function findBodyRule(
  bodyCode: string,
  config: BodyApplicabilityConfig = DEFAULT_BODY_APPLICABILITY,
): BodyApplicabilityRule | null {
  const wanted = normaliseCode(bodyCode);
  if (!wanted) return null;
  return config.bodies.find((b) => normaliseCode(b.bodyCode) === wanted) ?? null;
}

/**
 * Whether ANY of the ten inspects this institution.
 *
 * Deliberately identical in behaviour to `isInspectedByAccreditationBodies()`
 * in `iqac/_lib/collect-once.ts`, and duplicated rather than imported: that
 * module belongs to the IQAC screen and pulls its own page's shape along with
 * it. Two callers agreeing on one field is cheaper than a cross-lane import,
 * and a test pins the two to the same answer so they cannot drift apart.
 */
export function isInspectedAtAll(inst: ApplicableInstitution): boolean {
  return normaliseCode(inst?.iqac_code) !== '';
}

/**
 * The answer for one (institution, body) pair.
 *
 * Order of reasoning, and why it is this order:
 *
 *   1. An institution with no `iqac_code` is inspected by nobody. Settled by
 *      the coarse rule, so it is decided FIRST and no body-specific rule can
 *      override it. This is what keeps the two modules from contradicting.
 *   2. A body the map says nothing about is unknown, never a negative — a body
 *      added to the framework tomorrow must not silently excuse every college.
 *   3. An explicit `appliesTo` listing wins next; it is the most specific fact.
 *   4. `institution_wide` reaches every inspected college.
 *   5. Only a `discipline` body may turn absence into a negative, because only
 *      a statute confining it to one field makes that absence meaningful.
 *   6. Everything left is unknown.
 */
export function resolveApplicability(
  inst: ApplicableInstitution,
  bodyCode: string,
  config: BodyApplicabilityConfig = DEFAULT_BODY_APPLICABILITY,
): ApplicabilityVerdict {
  if (!isInspectedAtAll(inst)) return 'does_not_apply';

  const rule = findBodyRule(bodyCode, config);
  if (!rule) return 'not_established';

  const code = normaliseCode(inst.iqac_code);
  if (rule.appliesTo.some((c) => normaliseCode(c) === code)) return 'applies';
  if (rule.remit === 'institution_wide') return 'applies';
  if (rule.remit === 'discipline') return 'does_not_apply';

  return 'not_established';
}

export interface ApplicabilityStatement {
  verdict: ApplicabilityVerdict;
  /** Short words for a chip or cell. */
  label: string;
  /** A full sentence saying why. Never empty, never a number. */
  sentence: string;
}

/**
 * The verdict plus the sentence a reader sees.
 *
 * Every branch returns prose. A cell that would otherwise have shown a zero
 * shows one of these instead, which is the whole point of the decision.
 */
export function describeBodyApplicability(
  inst: ApplicableInstitution,
  bodyCode: string,
  config: BodyApplicabilityConfig = DEFAULT_BODY_APPLICABILITY,
): ApplicabilityStatement {
  const verdict = resolveApplicability(inst, bodyCode, config);
  const label = APPLICABILITY_LABEL[verdict];
  const body = normaliseCode(bodyCode) || 'This body';
  const name = (inst?.name ?? '').trim() || 'this institution';

  if (!isInspectedAtAll(inst)) {
    return {
      verdict,
      label,
      sentence: `Does not apply — no awarding body inspects ${name}.`,
    };
  }

  const rule = findBodyRule(bodyCode, config);

  if (verdict === 'applies') {
    return { verdict, label, sentence: `${body} inspects ${name}.` };
  }

  if (verdict === 'does_not_apply') {
    const note = rule?.remitNote?.trim();
    return {
      verdict,
      label,
      sentence: note
        ? `Does not apply — ${body} inspects ${note} only.`
        : `Does not apply — ${name} is outside ${body}'s remit.`,
    };
  }

  const note = rule?.remitNote?.trim();
  return {
    verdict,
    label,
    sentence: note
      ? `Not established yet — ${body} covers ${note}, and whether it reaches ${name} has not been recorded.`
      : `Not established yet — whether ${body} applies to ${name} has not been recorded.`,
  };
}

/** Every body the map speaks about, in the order the map lists them. */
export function bodiesInMap(
  config: BodyApplicabilityConfig = DEFAULT_BODY_APPLICABILITY,
): string[] {
  return config.bodies.map((b) => b.bodyCode);
}

/**
 * Every body's answer for one institution, for a row of chips on a screen.
 * Returns one entry per body in the map — none is omitted, so a reader never
 * has to work out which body is missing and why.
 */
export function describeAllBodies(
  inst: ApplicableInstitution,
  config: BodyApplicabilityConfig = DEFAULT_BODY_APPLICABILITY,
): Array<ApplicabilityStatement & { bodyCode: string }> {
  return config.bodies.map((b) => ({
    bodyCode: b.bodyCode,
    ...describeBodyApplicability(inst, b.bodyCode, config),
  }));
}
