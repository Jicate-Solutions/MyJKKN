// ============================================================================
// Address quality — find the permanent addresses that will print wrong BEFORE
// the ID cards are printed.
// Created: 2026-08-14.
//
// WHY THIS EXISTS
//   The ID card back prints the learner's permanent address, joined from five
//   columns on learners_profiles. Two different things go wrong there and only
//   one of them is a rendering bug:
//
//     1. LENGTH. The joined string is longer than the card can show, so the
//        renderer hard-truncates it. That is the renderer's problem and is
//        owned elsewhere.
//     2. JUNK IN THE SOURCE COLUMNS. Measured on production 2026-08-14: one
//        active learner's permanent_address_street holds a mobile number and
//        TWO DIFFERENT PIN codes, with district / state / PIN repeated inside
//        the street and then joined AGAIN from their own columns. No renderer
//        change can make that print correctly — a person has to look at the
//        record and decide which PIN is right.
//
//   This module is the detector half of (2). It NEVER rewrites an address. It
//   classifies, explains and ranks, so the office can work down a list and fix
//   the records by hand before a batch goes to the printer.
//
// WHY THE JOIN IS DUPLICATED HERE RATHER THAN IMPORTED
//   lib/id-cards/render-data.ts owns the canonical join, but it is a server
//   module (it builds data: URIs with Buffer), so importing it into the browser
//   bundle is not an option. The order below mirrors render-data.ts exactly and
//   __tests__/lib/id-cards/address-quality.test.ts pins that against the
//   renderer's source, so a future change to the join turns this file red
//   instead of silently drifting.
// ============================================================================

/**
 * The default card back renders ADDRESS through `backInfoRow`, which cuts at 60
 * characters (lib/id-cards/render-card.tsx). This is the TIGHTEST cut any back
 * applies, and it is reported as a flag on the assessment — but it deliberately
 * does NOT raise an issue. Measured on production 2026-08-14, 4,194 of 4,825
 * active learners (86.9%) are over 60, because a correctly-entered Tamil Nadu
 * address is simply longer than that once the taluk, district, state and PIN
 * are joined on. A rule that fires on seven learners in eight is a renderer
 * problem being mis-filed as a data problem, and it would bury the 373 records
 * that actually need a person.
 */
export const PRINTABLE_ADDRESS_DEFAULT_BACK_MAX = 60;

/**
 * A template-designed back places ADDRESS as a free overlay element, cut at 80
 * characters. Past this the address is cut on every layout the repo ships, so
 * this is the width that raises `over_printable_length`.
 */
export const PRINTABLE_ADDRESS_CUSTOM_BACK_MAX = 80;

/** The five columns the card back joins, in the order it joins them. */
export interface AddressParts {
  street?: string | null;
  taluk?: string | null;
  district?: string | null;
  state?: string | null;
  pinCode?: string | null;
}

export type AddressIssueCode =
  | 'pin_conflict'
  | 'contact_number'
  | 'address_missing'
  | 'placeholder_text'
  | 'ekyc_labels'
  | 'junk_characters'
  | 'machine_code_value'
  | 'duplicated_part'
  | 'over_printable_length'
  | 'truncated_end';

export type AddressIssueSeverity = 'critical' | 'high' | 'medium';

export interface AddressIssueMeta {
  /** Short label for a badge. */
  label: string;
  severity: AddressIssueSeverity;
  /** Ranking weight — higher floats the record up the work list. */
  weight: number;
  /** Plain-English statement of what is wrong with the record. */
  why: string;
  /** Plain-English statement of what a person should do about it. */
  fix: string;
}

/**
 * Severity is about WHO has to act, not about how ugly the address looks:
 *   critical — a person must make a judgement call; nobody can guess it.
 *   high     — the record clearly holds machine junk that must be cleaned out.
 *   medium   — the address is readable but will print duplicated or cut off.
 */
export const ADDRESS_ISSUE_META: Record<AddressIssueCode, AddressIssueMeta> = {
  pin_conflict: {
    label: 'Two different PIN codes',
    severity: 'critical',
    weight: 100,
    why: 'The street text and the PIN code column hold different PIN codes. One of them is wrong.',
    fix: 'Check which PIN code is correct for this address, keep that one, and delete the other.',
  },
  contact_number: {
    label: 'Phone number inside the address',
    severity: 'critical',
    weight: 90,
    why: 'A mobile or phone number is stored inside an address field, so it would be printed on the card back.',
    fix: 'Move the number to the mobile field and remove it from the address.',
  },
  address_missing: {
    label: 'No address at all',
    severity: 'critical',
    weight: 85,
    why: 'All five address columns are empty, so the card back prints no address.',
    fix: 'Collect the permanent address and enter it before printing this card.',
  },
  placeholder_text: {
    label: 'Placeholder instead of an address',
    severity: 'critical',
    weight: 80,
    why: 'A field holds filler text such as ***, NA or -, which would be printed exactly as written.',
    fix: 'Replace the filler with the real value, or clear the field if it does not apply.',
  },
  ekyc_labels: {
    label: 'Pasted form labels',
    severity: 'high',
    weight: 60,
    why: 'The street text carries pasted form labels such as VTC:, PO:, DISTRICT: or PIN CODE:, so the card prints the labels too.',
    fix: 'Rewrite the street as a plain address and move each labelled value into its own column.',
  },
  junk_characters: {
    label: 'Line breaks or stray quotes',
    severity: 'high',
    weight: 55,
    why: 'A field contains line breaks, tabs or stray quote marks that break the printed line.',
    fix: 'Retype the field as one clean line with no line breaks or quote marks.',
  },
  machine_code_value: {
    label: 'Machine code instead of a name',
    severity: 'high',
    weight: 50,
    why: 'A field holds an internal code such as tamil_nadu rather than a readable name, and prints exactly as stored.',
    fix: 'Replace the code with the readable name, for example Tamil Nadu.',
  },
  duplicated_part: {
    label: 'District, state or PIN repeated',
    severity: 'medium',
    weight: 30,
    why: 'The street text already contains the district, state, taluk or PIN, so the joined address prints it twice.',
    fix: 'Remove the repeated part from the street text and leave it in its own column.',
  },
  over_printable_length: {
    label: 'Too long for any card layout',
    severity: 'medium',
    weight: 25,
    why: 'The joined address is over 80 characters, so the end is cut off on every card layout.',
    fix: 'Shorten the street text — removing repeated parts is usually enough.',
  },
  truncated_end: {
    label: 'Cut off mid-address',
    severity: 'medium',
    weight: 20,
    why: 'The street text ends with a comma or dash, which usually means it was saved half-finished.',
    fix: 'Complete the address, or remove the trailing punctuation.',
  },
};

const SEVERITY_RANK: Record<AddressIssueSeverity, number> = {
  critical: 3,
  high: 2,
  medium: 1,
};

/** Filler a person typed to get past a required field. */
const PLACEHOLDER = /^(?:[*.\-_#?/\\]+|n\.?\s*a\.?|nil|none|null|not\s*available|x{3,}|test)$/i;

/** Form labels that only appear when an eKYC / Aadhaar block was pasted in. */
const PASTED_FORM_LABEL =
  /\b(?:vtc|p\.?o|post\s*office|sub[\s-]*dist(?:rict)?|dist(?:rict)?|state|pin\s*code|house\s*no|street\s*name|landmark|locality|care\s*of|c\/o)\b\s*[:=]/i;

/**
 * Characters that break a printed line. Written as explicit escapes rather than
 * pasted literals so nobody has to guess what an invisible character in the
 * source was meant to be: CR, LF, TAB, a literal backslash-n that survived an
 * import, a double quote, and the two invisible spaces that come from Word.
 */
const LINE_BREAKING = /[\r\n\t"]|\\n|\\r|\u00A0|\u200B/;

/** An internal code such as `tamil_nadu` or `erode_taluk`, never a real name. */
const MACHINE_CODE = /^[a-z0-9]+(?:_[a-z0-9]+)+$/;

/** A street saved half-finished ends on a separator rather than a word. */
const TRAILING_SEPARATOR = /[,\-/&;:]$/;

const clean = (value: string | null | undefined): string => (value ?? '').trim();

/**
 * Every run of digits in a string. Used instead of lookbehind assertions, which
 * older Safari does not support and this report runs in the browser.
 */
const digitRuns = (value: string): string[] => value.match(/\d+/g) ?? [];

/** Six-digit runs that could be an Indian PIN code (they never start with 0). */
const pinCodesIn = (value: string): string[] =>
  digitRuns(value).filter((run) => run.length === 6 && run[0] !== '0');

/** True when a run of digits looks like an Indian mobile number. */
const looksLikeMobile = (run: string): boolean => {
  if (run.length === 10) return /^[6-9]/.test(run);
  // 12 digits is the 91 country code glued to a 10-digit mobile.
  if (run.length === 12) return run.startsWith('91') && /^[6-9]/.test(run.slice(2));
  return false;
};

/** A `MOBILE:` / `Ph. -` style label followed by digits, whatever the length. */
const CONTACT_LABEL =
  /\b(?:mobile|mob|phone|ph|cell|contact|whatsapp)\b\s*(?:no\.?|number)?\s*[:.\-#]\s*\+?\d/i;

/**
 * True when `needle` appears in `haystack` as a whole word. Guarded at four
 * characters so short taluk names cannot collide with ordinary street words.
 * Uses explicit non-letter edges rather than `\b`, because `\b` treats a digit
 * as a word character and would miss `SALEM-636005`.
 */
const containsWord = (haystack: string, needle: string): boolean => {
  if (needle.length < 4) return false;
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|[^A-Za-z])${escaped}(?:[^A-Za-z]|$)`, 'i').test(haystack);
};

/**
 * Join the five columns exactly the way the card back does
 * (lib/id-cards/render-data.ts): trim each part, drop the empties, comma-join.
 */
export function joinPrintableAddress(parts: AddressParts): string {
  return [parts.street, parts.taluk, parts.district, parts.state, parts.pinCode]
    .map(clean)
    .filter(Boolean)
    .join(', ');
}

export interface AddressAssessment {
  /** The exact string the card back would print, before truncation. */
  joined: string;
  /** Its length, to compare against the two printable limits. */
  length: number;
  /** Every issue found, ordered most severe first. */
  issues: AddressIssueCode[];
  /** Sum of the issue weights — the work-list ranking key. */
  score: number;
  /** The worst severity present, or null when the address is clean. */
  severity: AddressIssueSeverity | null;
  /** Every distinct PIN code seen, when they disagree. Empty otherwise. */
  conflictingPinCodes: string[];
  /** Which parts the street repeats: 'district' | 'state' | 'taluk' | 'PIN code'. */
  duplicatedParts: string[];
  /** True when the address is over the tighter, default-back limit. */
  overDefaultBack: boolean;
  /** True when the address is over the looser, template-back limit too. */
  overCustomBack: boolean;
}

/**
 * Classify one learner's permanent address. Pure — reads the five values and
 * returns findings. It never proposes a corrected address, on purpose: the PIN
 * conflict alone proves a machine cannot know which value is the right one.
 */
export function assessAddress(parts: AddressParts): AddressAssessment {
  const street = clean(parts.street);
  const taluk = clean(parts.taluk);
  const district = clean(parts.district);
  const state = clean(parts.state);
  const pinCode = clean(parts.pinCode);
  const values = [street, taluk, district, state, pinCode];

  const joined = joinPrintableAddress(parts);
  const issues = new Set<AddressIssueCode>();

  if (joined === '') issues.add('address_missing');
  if (values.some((value) => value !== '' && PLACEHOLDER.test(value))) {
    issues.add('placeholder_text');
  }

  // A PIN code column is a number by design; only the free-text fields can hide
  // a phone, so the PIN column is excluded from this check.
  const freeText = [street, taluk, district, state].filter(Boolean).join(' | ');
  if (digitRuns(freeText).some(looksLikeMobile) || CONTACT_LABEL.test(freeText)) {
    issues.add('contact_number');
  }

  const streetPinCodes = pinCodesIn(street);
  const distinctPinCodes = new Set(streetPinCodes);
  if (/^\d{6}$/.test(pinCode)) distinctPinCodes.add(pinCode);
  const conflictingPinCodes = distinctPinCodes.size > 1 ? [...distinctPinCodes] : [];
  if (conflictingPinCodes.length > 0) issues.add('pin_conflict');

  if (PASTED_FORM_LABEL.test(street)) issues.add('ekyc_labels');
  if (values.some((value) => value !== '' && LINE_BREAKING.test(value))) {
    issues.add('junk_characters');
  }
  if (values.some((value) => value !== '' && MACHINE_CODE.test(value))) {
    issues.add('machine_code_value');
  }

  const duplicatedParts: string[] = [];
  if (district && containsWord(street, district)) duplicatedParts.push('district');
  if (state && containsWord(street, state)) duplicatedParts.push('state');
  if (taluk && containsWord(street, taluk)) duplicatedParts.push('taluk');
  if (pinCode && streetPinCodes.includes(pinCode)) duplicatedParts.push('PIN code');
  if (duplicatedParts.length > 0) issues.add('duplicated_part');

  const overDefaultBack = joined.length > PRINTABLE_ADDRESS_DEFAULT_BACK_MAX;
  const overCustomBack = joined.length > PRINTABLE_ADDRESS_CUSTOM_BACK_MAX;
  // Gated on the LOOSER limit on purpose — see PRINTABLE_ADDRESS_DEFAULT_BACK_MAX.
  if (overCustomBack) issues.add('over_printable_length');

  if (street !== '' && TRAILING_SEPARATOR.test(street)) issues.add('truncated_end');

  const ordered = [...issues].sort(
    (a, b) => ADDRESS_ISSUE_META[b].weight - ADDRESS_ISSUE_META[a].weight
  );
  const score = ordered.reduce((sum, code) => sum + ADDRESS_ISSUE_META[code].weight, 0);
  const severity =
    ordered.length === 0
      ? null
      : ordered.reduce<AddressIssueSeverity>((worst, code) => {
          const next = ADDRESS_ISSUE_META[code].severity;
          return SEVERITY_RANK[next] > SEVERITY_RANK[worst] ? next : worst;
        }, ADDRESS_ISSUE_META[ordered[0]].severity);

  return {
    joined,
    length: joined.length,
    issues: ordered,
    score,
    severity,
    conflictingPinCodes,
    duplicatedParts,
    overDefaultBack,
    overCustomBack,
  };
}

/** Convenience wrapper for callers that only need the issue codes. */
export function detectAddressIssues(parts: AddressParts): AddressIssueCode[] {
  return assessAddress(parts).issues;
}

/**
 * True when the record needs a person to make a judgement call, as opposed to
 * merely printing long. This is the number the office should work down first.
 */
export function needsHumanDecision(assessment: AddressAssessment): boolean {
  return assessment.severity === 'critical' || assessment.severity === 'high';
}
