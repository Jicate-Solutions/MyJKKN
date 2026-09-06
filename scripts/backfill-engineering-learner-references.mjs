// scripts/backfill-engineering-learner-references.mjs
//
// One-off repair (2026-08-10): backfill the reference/referral attribution for
// the 786 ACTIVE learners of JKKN College of Engineering and Technology from the
// hand-filled "Engineering College - All Learners List" workbook.
//
// WHY A SCRIPT AND NOT THE BULK EDIT UPLOAD
// The sheet is a valid Bulk Edit Active template, but POST /api/learners/
// bulk-edit-exited writes ~60 mapped columns, and the brief was "these reference
// fields only". This writes exactly six columns and nothing else. It also needs
// fuzzy matching plus a human review round-trip, which the upload path has no
// affordance for (its resolver is exact-match; 119 of the 194 distinct names in
// this sheet would come back as warnings with nothing done).
//
// THE SHAPE OF THE PROBLEM
// The sheet's "Reference ID" column is empty on all 786 rows — it is the column
// to PRODUCE, not to read. "Reference Person" holds free text an operator typed:
// 'S.ESWARAMOORTHY/VP/ENGG', 'MRS. Porkodi G (Assistant Professor)',
// 'SATHISH.S PD JKKNCET'. Matching that to a staff row needs three signals that
// are all present in the string and all discarded by naive normalisation:
//   1. core name tokens        SASIDHARAN
//   2. initials                M.BABY -> Baby M, not Baby V
//   3. institution             AP/JKKNCP -> VENKATESWARAN V (Pharmacy)
//
// THREE THINGS WORTH KNOWING BEFORE EDITING
//
//  1. referred_by_id is POLYMORPHIC and has NO foreign key. Its target table is
//     decided by referral_type (education_consultants | staff | learners_
//     profiles). A wrong-table uuid writes silently with no 23503, so --verify
//     re-reads every id back and asserts it lives in the right table.
//
//  2. Ambiguity is NEVER guessed. Bare-name matching is provably unsafe here:
//     NANDHINI is 9 staff, SURYA is 10 learners, 'Mrs.Deepika R[CET222]' and
//     'Mrs. Deepika R[CET230]' are two rows with the same name AND initial.
//     Anything that does not reduce to exactly one candidate goes to the review
//     workbook for a human to pick.
//
//  3. Setting referred_by_id to a consultant fires trg_sync_learner_referral_to_
//     attribution, inserting a consultant_lead_attributions row at primary/100
//     unverified. ~500 rows here. That was an explicit product decision, not an
//     oversight — the attributions are the truthful record of who referred whom.
//
// USAGE
//   node scripts/backfill-engineering-learner-references.mjs              # dry run
//   node scripts/backfill-engineering-learner-references.mjs --apply
//   node scripts/backfill-engineering-learner-references.mjs --create-consultants --apply
//   node scripts/backfill-engineering-learner-references.mjs --review <xlsx> --apply
//   node scripts/backfill-engineering-learner-references.mjs --verify

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require2 = createRequire(import.meta.url);
const { createClient } = require2('@supabase/supabase-js');
const XLSX = require2('xlsx');

// ─────────────────────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────────────────────

const SHEET_PATH =
  process.env.REF_SHEET ??
  'C:/Users/Admin/Downloads/Engineering College - All Learners List (1).xlsx';
const OUT_DIR = process.env.REF_OUT ?? 'C:/Users/Admin/Downloads';
const PLAN_JSON = path.join(OUT_DIR, 'reference-backfill-plan.json');
const REVIEW_XLSX = path.join(OUT_DIR, 'reference-review.xlsx');

const APPLY = process.argv.includes('--apply');
const CREATE_CONSULTANTS = process.argv.includes('--create-consultants');
const VERIFY_ONLY = process.argv.includes('--verify');
const REVIEW_IN = (() => {
  const i = process.argv.indexOf('--review');
  return i >= 0 ? process.argv[i + 1] : null;
})();

/** Learner lifecycle stages that can plausibly refer someone. */
const STUDENT_SCOPE = ['active', 'graduated', 'inactive', 'exited'];

/**
 * Mirror written to the legacy reference_type column. All three are members of
 * EXCEL_REFERENCE_TYPE (lib/utils/mappings/enquiry-excel-mappings.ts).
 */
const LEGACY_LABEL = {
  consultant: 'EDUCATIONAL CONSULTANT',
  student: 'CURRENT/FORMER STUDENT',
  faculty: 'JKKN STAFF',
};

/**
 * The Excel label 'Staff' stores 'faculty' — learners_profiles_referral_type_
 * check only accepts consultant|student|faculty|learner_ambassador. There is no
 * 'direct' value, which is why DIRECT rows get the legacy column only.
 */
const TYPE_FROM_SHEET = { Consultant: 'consultant', Staff: 'faculty', Student: 'student' };

// ─────────────────────────────────────────────────────────────────────────────
// Supabase (service role — RLS bypassed, this is an admin repair)
// ─────────────────────────────────────────────────────────────────────────────

const env = {};
for (const line of fs.readFileSync(new URL('../.env', import.meta.url), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
}
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

/**
 * PostgREST caps an unbounded select at 1,000 rows. The learner list is 5,661,
 * so a plain .select() would silently drop ~4,600 people — they would fail name
 * matching and become tier-5 orphans without a single error.
 */
async function fetchAll(table, columns, apply) {
  const rows = [];
  const BATCH = 1000;
  for (let offset = 0; ; offset += BATCH) {
    let query = sb.from(table).select(columns).range(offset, offset + BATCH - 1);
    if (apply) query = apply(query);
    const { data, error } = await withRetry(() => query);
    if (error) throw new Error(`Failed to load ${table}: ${error.message}`);
    if (!data?.length) break;
    rows.push(...data);
    if (data.length < BATCH) break;
  }
  return rows;
}

/** Transient ECONNRESET on server-side Supabase = stale keep-alive socket. */
async function withRetry(fn, attempts = 4) {
  let last;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      last = err;
      await new Promise((r) => setTimeout(r, 400 * (i + 1)));
    }
  }
  throw last;
}

// ─────────────────────────────────────────────────────────────────────────────
// Normalisation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Tokens that carry no identity: honorifics, designations, institution and
 * department codes, year/course noise. Stripped from the core key but scanned
 * FIRST for the institution and department hints, which are the discriminators
 * that break most of the ties.
 */
const STOP = new Set(
  `MR MRS MS MISS DR THIRU PROF
   AP ASP HOD VP PD ASST ASSISTANT ASSOCIATE PROFESSOR PHYSICAL DIRECTOR LAB INSTRUCTOR
   DRIVER DESIGNER ALUMNI MAINOFFICE MAIN OFFICE BUS DEPT DEPARTMENT AIDED SELF
   JKKNCET JKKNCAS JKKNCP JKKNCOP JKKNCOE JKKN JICATE CET CAS COP COE ENG ENGG
   APJKKNCET HODJKKNCET SCHOOL BED ED
   JKKNSINAR SINAR JKKNCON CNR JKKNCNR JKKNDC JKKNDCH DCH MO JKKM
   VICE PRINCIPAL DEAN MADAM MAM SIR RECEPTION PHOTOGRAPHER OLD STND
   ALUMINI TFD SF
   CSE CS IT ECE EEE MECH CIVIL MBA MCA MATHS MATHEMATICS PHY PHYSICS CHEMISTRY
   SH ARTS ART COMMERCE COM ENGLISH TAMIL NURSING AHS PHARM PHARMD BDS BSC BCOM
   PHARMACY PHARMCAY BSCN BSCN ACCOUNTS TRANSPORT STAFF BATCH
   MA CA PA HISTORY IIICSE DCC
   YEAR ND RD TH ST II III IV SRH NO NILL DIRECT`
    .split(/\s+/)
    .filter(Boolean)
);

/**
 * Sheet token -> institution. Resolved to real institution ids at load time by
 * matching institutions.name, because staff_id prefixes are NOT a reliable
 * institution signal: 'NOT' appears across seven different institutions.
 */
const INSTITUTION_HINTS = [
  { tokens: ['JKKNCET', 'CET', 'ENGG', 'ENG', 'JKKNCOE'], re: /College of Engineering/i },
  { tokens: ['JKKNCAS', 'CAS'], re: /College of Arts and Science/i },
  {
    tokens: ['JKKNCP', 'JKKNCOP', 'COP', 'PHARM', 'PHARMD', 'PHARMACY', 'PHARMCAY'],
    re: /College of Pharmacy/i,
  },
  { tokens: ['JICATE'], re: /Jicate/i },
  // JKKNSINAR is how operators write the nursing school on the Nursing sheet —
  // verified: 'L.THILAGAM, JKKNSINAR' and 'M.KRISHNAVENI/AP/JKKNSINAR' resolve
  // to CNR008 / CNR011, both College of Nursing rows.
  {
    tokens: ['NURSING', 'JKKNSINAR', 'SINAR', 'JKKNCON', 'CNR', 'JKKNCNR', 'BSCN'],
    re: /College of Nursing/i,
  },
  { tokens: ['AHS'], re: /Allied Health/i },
  { tokens: ['BDS', 'DENTAL', 'JKKNDC', 'JKKNDCH', 'DCH'], re: /Dental/i },
  // Support staff (accounts, transport) sit on Main Office, not on the college
  // whose learner names them. Without this hint they contradict every candidate.
  { tokens: ['MAINOFFICE', 'MAIN', 'OFFICE', 'MO', 'ACCOUNTS', 'TRANSPORT'], re: /Main Office/i },
  { tokens: ['SCHOOL'], re: /School|Vidhyalya/i },
];

/**
 * Sheet token -> staff.designation fragment. This is what separates the two
 * 'Sathish S' rows, which are BOTH in Engineering so the institution hint is
 * useless: NOT008 is the Physical Director, CET257 a Teaching Assistant, and 28
 * learners point at 'PD' / '(Physical Director)'.
 */
const DESIGNATION_HINTS = [
  { tokens: ['PD'], re: /physical\s*director/i },
  { tokens: ['AP'], re: /assistant\s*professor/i },
  { tokens: ['ASP'], re: /associate\s*professor/i },
  { tokens: ['HOD'], re: /\bhod\b|head\s*of/i },
  { tokens: ['VP'], re: /vice\s*principal/i },
  { tokens: ['DRIVER'], re: /driver/i },
  { tokens: ['INSTRUCTOR'], re: /instructor/i },
  { tokens: ['DESIGNER'], re: /designer/i },
];

/** Sheet token -> department name fragment. Tertiary tie-breaker. */
const DEPARTMENT_HINTS = [
  { tokens: ['CSE', 'CS'], re: /Computer Science/i },
  { tokens: ['IT'], re: /Information Technology/i },
  { tokens: ['ECE'], re: /Electronics/i },
  { tokens: ['EEE'], re: /Electrical/i },
  { tokens: ['MECH'], re: /Mechanical/i },
  { tokens: ['CIVIL'], re: /Civil/i },
  { tokens: ['MBA'], re: /Business|Management/i },
  { tokens: ['MATHS', 'MATHEMATICS'], re: /Mathemat/i },
  { tokens: ['ENGLISH'], re: /English/i },
  { tokens: ['TAMIL'], re: /Tamil/i },
  { tokens: ['COMMERCE', 'COM'], re: /Commerce/i },
  { tokens: ['PHY', 'PHYSICS'], re: /Physics/i },
];

const rawTokens = (value) =>
  String(value ?? '')
    .toUpperCase()
    // Operators sometimes identify staff by their work email rather than their
    // name. The local part IS the name ('sekar.v@jkkn.ac.in' -> SEKAR V), but
    // the domain tokenises into AC and IN, which are 2-letter non-STOP words —
    // so they became identity tokens and contradicted every candidate. Dropping
    // the domain turns 5 dead rows into exact matches on DR. SEKAR V [COP003],
    // the same person 14 other rows already name in words.
    // Matching on the stored staff.email would NOT work here: his record holds
    // hodpharmaceuticalanalysis@jkkn.ac.in.
    .replace(/@\S+/g, ' ')
    // Ampersand joins, never splits: 'S&H' is the Science and Humanities
    // department, and letting it split produced phantom initials S and H that
    // then "contradicted" every candidate for 'K.KAVITHA, AP/S&H, JKKNCET'.
    .replace(/&/g, '')
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);

/** Identity tokens in the order written: 2+ letters, not a code, not numeric. */
const coreTokens = (value) => {
  const seen = new Set();
  return rawTokens(value).filter((w) => {
    if (w.length < 2 || STOP.has(w) || /^\d+$/.test(w) || seen.has(w)) return false;
    seen.add(w);
    return true;
  });
};

/** Order-independent identity key — the primary index. */
const coreKey = (value) => [...coreTokens(value)].sort().join(' ');

/**
 * Identity tokens with the word boundaries removed, so a name the operator ran
 * together still matches the record that spaces it out: 'EZHILMATHI' vs
 * 'EZHIL MATHI', 'RANJITHKUMAR' vs 'Ranjith kumar', 'SIVA SANKARI' vs
 * 'SIVASANKARI'.
 *
 * Squashing the SORTED key is useless — 'RANJITH KUMAR' sorts to
 * 'KUMARRANJITH', which matches nothing. Both the written order and the sorted
 * order are indexed so either spelling finds the other.
 *
 * This is still exact matching on content, not a guess; more than one hit falls
 * through to the same consistency check as any other pool.
 */
const squashKeys = (value) => {
  const t = coreTokens(value);
  if (t.length < 1) return [];
  return [...new Set([t.join(''), [...t].sort().join('')])];
};

/** The parenthetical operators append: 'Mr. Sathish S (Physical Director)'. */
const parentheticalOf = (value) => {
  const m = String(value ?? '').match(/\(([^)]+)\)/);
  return m ? m[1].trim() : '';
};

/**
 * Single LETTERS — 'M.BABY' -> {M}. The discriminator staff surnames need,
 * since staff.last_name is usually just an initial. Digits are excluded: '4' in
 * 'K.R.SURYA, 4-ECE' is a year, and counting it as an initial made every
 * candidate look contradictory.
 */
const initialsOf = (value) => new Set(rawTokens(value).filter((w) => /^[A-Z]$/.test(w)));

const hintsOf = (value, table) => {
  const t = new Set(rawTokens(value));
  return table.filter((h) => h.tokens.some((tok) => t.has(tok)));
};

/** Digits only, and only a real 10-digit Indian mobile is worth storing. */
const normPhone = (value) => {
  const digits = String(value ?? '').replace(/\D/g, '');
  return digits.length === 10 ? digits : '';
};

const joinName = (first, last) =>
  `${String(first ?? '').trim()} ${String(last ?? '').trim()}`.replace(/\s+/g, ' ').trim();

// Trigram similarity, same shape as pg_trgm's similarity(). Local so the matcher
// stays a single pass over data already in memory.
const trigramsOf = (value) => {
  const padded = `  ${String(value).toUpperCase().replace(/\s+/g, ' ').trim()} `;
  const set = new Set();
  for (let i = 0; i < padded.length - 2; i++) set.add(padded.slice(i, i + 3));
  return set;
};
const trigramSim = (a, b) => {
  const A = trigramsOf(a);
  const B = trigramsOf(b);
  let shared = 0;
  for (const g of A) if (B.has(g)) shared++;
  const union = A.size + B.size - shared;
  return union === 0 ? 0 : shared / union;
};

// ─────────────────────────────────────────────────────────────────────────────
// Load reference data
// ─────────────────────────────────────────────────────────────────────────────

async function loadCandidates() {
  const [institutions, departments, consultantRows, staffRows, learnerRows] = await Promise.all([
    fetchAll('institutions', 'id, name'),
    fetchAll('departments', 'id, department_name, institution_id'),
    fetchAll('education_consultants', 'id, name, phone, consultant_type, status'),
    fetchAll('staff', 'id, first_name, last_name, staff_id, designation, phone, institution_id, department_id, is_active'),
    fetchAll(
      'learners_profiles',
      'id, first_name, last_name, roll_number, student_mobile, lifecycle_status, institution_id, program_id',
      (q) => q.in('lifecycle_status', STUDENT_SCOPE)
    ),
  ]);

  const instName = new Map(institutions.map((i) => [i.id, i.name]));
  const deptName = new Map(departments.map((d) => [d.id, d.department_name]));

  const byType = {
    consultant: consultantRows.map((row) => ({
      id: row.id,
      name: String(row.name ?? '').trim(),
      code: row.phone ? String(row.phone).trim() : null,
      contact: row.phone ?? null,
      institutionId: null,
      institution: null,
      department: null,
      status: row.status,
    })),
    faculty: staffRows.map((row) => ({
      id: row.id,
      name: joinName(row.first_name, row.last_name),
      code: row.staff_id ? String(row.staff_id).trim() : null,
      contact: row.phone ?? null,
      institutionId: row.institution_id,
      institution: instName.get(row.institution_id) ?? null,
      department: deptName.get(row.department_id) ?? null,
      designation: row.designation ?? null,
      status: row.is_active ? 'active' : 'former',
    })),
    student: learnerRows.map((row) => ({
      id: row.id,
      name: joinName(row.first_name, row.last_name),
      code: row.roll_number ? String(row.roll_number).trim() : null,
      contact: row.student_mobile ?? null,
      institutionId: row.institution_id,
      institution: instName.get(row.institution_id) ?? null,
      department: null,
      status: row.lifecycle_status,
    })),
  };

  const index = {};
  const squashed = {};
  for (const type of Object.keys(byType)) {
    const byKey = new Map();
    const bySquash = new Map();
    for (const c of byType[type]) {
      c.initials = initialsOf(c.name);
      c.coreKey = coreKey(c.name);
      c.phoneKey = normPhone(c.contact);
      if (!c.coreKey) continue;
      if (!byKey.has(c.coreKey)) byKey.set(c.coreKey, []);
      byKey.get(c.coreKey).push(c);
      for (const sq of squashKeys(c.name)) {
        if (!bySquash.has(sq)) bySquash.set(sq, []);
        if (!bySquash.get(sq).includes(c)) bySquash.get(sq).push(c);
      }
    }
    index[type] = byKey;
    squashed[type] = bySquash;
  }

  return { byType, index, squashed, institutions };
}

const describe = (c) =>
  `${c.name}${c.code ? ` [${c.code}]` : ''}${c.institution ? ` · ${c.institution}` : ''}` +
  `${c.department ? ` · ${c.department}` : ''}${c.status && c.status !== 'active' ? ` (${c.status})` : ''}`;

// ─────────────────────────────────────────────────────────────────────────────
// The matcher
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resolve one free-text "Reference Person" string within its declared type.
 * Returns { tier, candidate, candidates, reason }.
 *
 * Tiers, first hit wins:
 *   T1 exact core-token-set, single candidate                 -> link
 *   T2 multi-candidate narrowed to one by initials            -> link
 *   T3 still multi, narrowed to one by institution/department -> link
 *   T4 anything still ambiguous, or a trigram near-miss       -> review
 *   T5 no candidate at all                                    -> name-only
 */
/**
 * Records of a DIFFERENT type that answer to this name, for the review sheet.
 *
 * 'student' is deliberately never a probe TARGET: with 5,661 learners on file, a
 * staff name coinciding with a learner name is coincidence, not evidence —
 * probing into it turned 'M.ANUSUYA, AP/COMMERCE, ARTS' into a confident
 * suggestion that some learner referred this person. Probing OUT of student is
 * fine and necessary: 'SURYA.K.R ECE' carries phone 9025708390, which belongs to
 * the alumni consultant SURYA K R.
 */
function crossTypeHits(person, type, ctx, contact = '') {
  const key = coreKey(person);
  const out = [];
  const seen = new Set();
  for (const other of ['consultant', 'faculty']) {
    if (other === type) continue;
    const hits = [
      ...(ctx.index[other].get(key) ?? []),
      ...squashKeys(person).flatMap((sq) => ctx.squashed[other].get(sq) ?? []),
      // A phone is strong evidence, but only alongside SOME name affinity.
      // Phone numbers are shared and mistyped in this data: 8667473020 belongs
      // to the KPM consultancy yet two unrelated staff rows carry it, and
      // offering 'Driver Testing' as a candidate for 'KPM KALVI VATTARAM' is
      // noise that also split the consultancy's learners into two groups.
      // 'SURYA.K.R ECE' vs consultant 'SURYA K R' scores 1.0 here and survives.
      ...(contact
        ? ctx.byType[other].filter(
            (c) => c.phoneKey && c.phoneKey === contact && trigramSim(key, c.coreKey ?? c.name) >= 0.3
          )
        : []),
    ];
    for (const c of hits) {
      if (seen.has(c.id)) continue;
      seen.add(c.id);
      out.push(Object.assign(Object.create(Object.getPrototypeOf(c)), c, { __crossType: other }));
    }
  }
  return out;
}

function resolvePerson(person, type, ctx, contact = '') {
  const key = coreKey(person);
  if (!key) return { tier: 'T5', candidates: [], reason: 'no identity tokens in the cell' };

  let pool = ctx.index[type].get(key) ?? [];
  let tier = 'T1';

  // Word-boundary-insensitive retry before giving up on an exact match.
  // Build a NEW array — the Map values are shared index arrays and must not be
  // appended to.
  if (!pool.length) {
    const seen = new Set();
    const merged = [];
    for (const sq of squashKeys(person))
      for (const c of ctx.squashed[type].get(sq) ?? []) {
        if (seen.has(c.id)) continue;
        seen.add(c.id);
        merged.push(c);
      }
    if (merged.length) {
      pool = merged;
      tier = 'T1b';
    }
  }

  if (pool.length === 1) {
    // Being the only record with this name is not a licence to ignore a signal
    // that disagrees. 'MOHANKUMAR - JKKNCAS' has exactly one namesake in staff —
    // at the CBSE school, not Arts and Science. Either the operator wrote the
    // wrong college or this is a different person; both need a human, so only
    // the institution (a structured field, unlike a free-text designation) is
    // allowed to veto here.
    const instHints = hintsOf(person, INSTITUTION_HINTS);
    const c = pool[0];
    if (instHints.length && c.institution && !instHints.some((h) => h.re.test(c.institution)))
      return {
        tier: 'T4',
        candidates: pool,
        reason: `only one record has this name, but the sheet points at a different institution than "${c.institution}"`,
      };
    // The initial vetoes too, but ONLY when both sides carry exactly one and
    // they disagree outright. 'senthil.v@jkkn.ac.in' reduces to the single core
    // token SENTHIL and so lands here as a pool of one — against DR. SENTHIL M,
    // while two other SENTHILs exist that the core key never reached. Linking
    // V to M there is a wrong person, not a spelling variant.
    // Kept deliberately narrow: multi-initial forms ('M.S.PUNITHAMALAR') and
    // records with no initial on file are NOT vetoed, because Tamil records mix
    // father-initial and surname-initial conventions and a mismatch there is
    // routine rather than disqualifying.
    const soleInitials = initialsOf(person);
    if (soleInitials.size === 1 && c.initials.size === 1) {
      const [want] = [...soleInitials];
      if (!c.initials.has(want))
        return {
          tier: 'T4',
          candidates: pool,
          reason: `only one record has this name, but its initial is "${[...c.initials][0]}" and the sheet says "${want}"`,
        };
    }
    return {
      tier,
      candidate: c,
      candidates: pool,
      reason: tier === 'T1b' ? 'name match (spacing differs)' : 'unique name match',
    };
  }

  if (pool.length > 1) {
    // CONSISTENCY, NOT A NARROWING CASCADE.
    //
    // Filtering one signal at a time and returning as soon as the pool hits one
    // candidate is what made 'SARANYA S AP JKKNCET' resolve to a record in Arts
    // and Science: the initial narrowed to CAS039 and returned before anything
    // noticed the sheet says JKKNCET and that Saranya G[CET148] is the one in
    // Engineering. So instead: score every candidate against every signal and
    // link only when exactly one candidate is contradicted by nothing.
    //
    // A signal may only EXCLUDE a candidate when that candidate carries the
    // attribute. A record with no designation on file is not disagreeing with
    // the sheet — absence of evidence is not evidence of contradiction.
    const initials = initialsOf(person);
    const paren = parentheticalOf(person);
    const desigHints = hintsOf(person, DESIGNATION_HINTS);
    const instHints = hintsOf(person, INSTITUTION_HINTS);
    const deptHints = hintsOf(person, DEPARTMENT_HINTS);

    const signals = [];
    if (contact)
      signals.push({
        label: `phone ${contact}`,
        strong: true,
        test: (c) => (c.phoneKey ? c.phoneKey === contact : null),
      });
    if (initials.size)
      signals.push({
        label: `initial ${[...initials].join('')}`,
        test: (c) => (c.initials.size ? [...initials].every((i) => c.initials.has(i)) : null),
      });
    if (paren || desigHints.length)
      signals.push({
        label: `designation "${paren || desigHints.map((h) => h.tokens[0]).join('/')}"`,
        // A free-text parenthetical is not a structured field. If it agrees with
        // nobody it is operator prose, not a contradiction — drop it rather than
        // forcing every candidate out.
        dropIfExcludesAll: true,
        test: (c) =>
          c.designation
            ? (paren && c.designation.toLowerCase().includes(paren.toLowerCase())) ||
              desigHints.some((h) => h.re.test(c.designation))
            : null,
      });
    if (instHints.length)
      signals.push({
        label: 'institution',
        test: (c) => (c.institution ? instHints.some((h) => h.re.test(c.institution)) : null),
      });
    if (deptHints.length)
      signals.push({
        label: 'department',
        test: (c) => (c.department ? deptHints.some((h) => h.re.test(c.department)) : null),
      });

    const active = signals.filter((s) => !(s.dropIfExcludesAll && pool.every((c) => s.test(c) === false)));
    const consistent = pool.filter((c) => active.every((s) => s.test(c) !== false));
    // Only signals that actually split the pool are worth naming in the reason.
    const decisive = active.filter((s) => pool.some((c) => s.test(c) === false)).map((s) => s.label);

    if (consistent.length === 1)
      return {
        tier: active.some((s) => s.strong && s.test(consistent[0]) === true) ? 'T2' : 'T3',
        candidate: consistent[0],
        candidates: pool,
        reason: decisive.length ? decisive.join(' + ') : 'single consistent candidate',
      };

    // Inconclusive in-type: offer other-type records too, so the reviewer sees
    // the alumni consultant whose phone matches rather than ten same-named
    // learners.
    const cross = crossTypeHits(person, type, ctx, contact);

    if (consistent.length === 0)
      return {
        tier: 'T4',
        candidates: [...pool, ...cross],
        reason: `SIGNALS CONFLICT — ${pool.length} records share this name and none agrees with every hint (${decisive.join(', ')})`,
      };

    return {
      tier: 'T4',
      candidates: [...consistent, ...cross],
      reason: `${pool.length} records share this name; hints narrowed to ${consistent.length} but not to one`,
    };
  }

  // No exact key. Offer trigram near-misses for review — never auto-link them.
  const near = ctx.byType[type]
    .map((c) => ({ c, score: trigramSim(key, c.coreKey || c.name) }))
    .filter((x) => x.score >= 0.45)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  if (near.length)
    return {
      tier: 'T4',
      candidates: [...near.map((n) => n.c), ...crossTypeHits(person, type, ctx, contact)],
      reason: `no exact match; closest spelling ${(near[0].score * 100).toFixed(0)}%`,
    };

  // Cross-type probe: mislabelled Type is common in this sheet — 'Dr.V.SEKAR/
  // JKKNCOP' is tagged Consultant but is staff, 'KPM KALVI VATTARAM' is tagged
  // Staff but is a consultancy.
  //
  // 'student' is deliberately NOT a probe target. With 5,661 learners on file, a
  // staff name coinciding with a learner name is coincidence, not evidence —
  // probing into it turned 'M.ANUSUYA, AP/COMMERCE, ARTS' into a confident
  // suggestion that some learner referred this person.
  const cross = crossTypeHits(person, type, ctx, contact);
  if (cross.length)
    return {
      tier: 'T4',
      candidates: cross,
      crossType: cross[0].__crossType,
      reason: `TYPE MISMATCH — no ${type} by this name, but ${cross.length === 1 ? 'is a' : `${cross.length} match as`} ${cross[0].__crossType}`,
    };

  return { tier: 'T5', candidates: [], reason: 'no record anywhere — outside person' };
}

// ─────────────────────────────────────────────────────────────────────────────
// Build the plan
// ─────────────────────────────────────────────────────────────────────────────

function readSheet() {
  const wb = XLSX.readFile(SHEET_PATH);
  return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { raw: false, defval: '' });
}

async function buildPlan(ctx, overrides = new Map()) {
  const rows = readSheet();
  const decisions = [];
  const nameCache = new Map();

  for (const row of rows) {
    const id = String(row['ID*'] ?? '').trim();
    const sheetType = String(row['Reference Type'] ?? '').trim();
    const person = String(row['Reference Person'] ?? '').trim();
    const contact = normPhone(row['Reference Contact']);
    if (!id) continue;

    // "No referrer" is spelled differently by different workbooks: the
    // Engineering sheet left Reference Type BLANK and wrote DIRECT in the person
    // cell; the Nursing sheet puts the literal "DIRECT" in Reference Type. Both
    // mean the same thing and must land in the same bucket — treating the
    // second as an unknown type silently wrote nothing at all for 45 learners.
    // referral_type has no 'direct' value (learners_profiles_referral_type_check
    // allows consultant|student|faculty|learner_ambassador), so only the legacy
    // column can carry it.
    // Four spellings seen so far, one per workbook: Engineering left the type
    // BLANK, Nursing wrote "DIRECT", Arts (Self) wrote "-". Apply the SAME
    // predicate to the type cell and the person cell so the next variant is
    // absorbed instead of falling through to `unknown Reference Type` — which
    // writes nothing at all and looks like a clean run.
    const isNoReferrer = (s) => !s || /^(DIRECT|NIL|NILL|NA|N\/A|NOT APPLICABLE|-+)$/i.test(s.trim()) || /^DIRECT/i.test(s.trim());
    const declaredDirect = isNoReferrer(sheetType);

    if (declaredDirect) {
      if (isNoReferrer(person)) {
        decisions.push({
          id,
          outcome: 'direct',
          person,
          values: { reference_type: 'DIRECT APPLICATION' },
          reason: 'DIRECT — no referrer',
        });
      } else {
        // A real person's name filed under DIRECT contradicts itself. The type
        // is probably a mis-key; never guess which of the three it should be.
        decisions.push({
          id,
          outcome: 'review',
          type: null,
          person,
          tier: 'T4',
          candidates: [],
          values: {},
          reason: 'typed DIRECT but names a person — confirm the referral type',
        });
      }
      continue;
    }

    const type = TYPE_FROM_SHEET[sheetType];
    if (!type) {
      decisions.push({ id, outcome: 'skip', person, values: {}, reason: `unknown Reference Type "${sheetType}"` });
      continue;
    }

    // Declared a real type but named nobody ("Consultant" / person "DIRECT").
    // The type is noise; the row is a direct application.
    if (isNoReferrer(person)) {
      decisions.push({
        id,
        outcome: 'direct',
        person,
        values: { reference_type: 'DIRECT APPLICATION' },
        reason: `typed ${sheetType} but names no referrer — recorded as direct`,
      });
      continue;
    }

    // The review workbook is keyed by (type, person) — one decision per name.
    // The resolver cache additionally keys on contact, because a phone in the
    // row can break a tie that the name alone cannot.
    const nameKey = `${type}||${person}`;
    const cacheKey = `${nameKey}||${contact}`;
    const override = overrides.get(nameKey);
    let res;
    if (override) {
      res = override;
    } else {
      if (!nameCache.has(cacheKey)) nameCache.set(cacheKey, resolvePerson(person, type, ctx, contact));
      res = nameCache.get(cacheKey);
    }

    const linkType = res.crossTypeApplied ?? type;

    if (res.candidate) {
      const c = res.candidate;
      decisions.push({
        id,
        outcome: 'linked',
        type: linkType,
        person,
        tier: res.tier,
        reason: res.reason,
        matched: describe(c),
        values: {
          referral_type: linkType,
          referred_by_id: c.id,
          referred_by_name: c.name,
          reference_type: LEGACY_LABEL[linkType],
          reference_name: c.name,
          ...(contact || normPhone(c.contact)
            ? { reference_contact: contact || normPhone(c.contact) }
            : {}),
        },
      });
    } else if (res.tier === 'T5') {
      // Keep the operator's full string, minus trailing punctuation. For an
      // outside person this descriptor ('SIVACHANDRAN.L/JKKN DRIVER') is the
      // only identifying information that will ever exist for them.
      const name = person.replace(/\s+/g, ' ').replace(/[,\/\-\s]+$/, '').trim().toUpperCase();
      decisions.push({
        id,
        outcome: 'name_only',
        type,
        person,
        tier: res.tier,
        reason: res.reason,
        values: {
          referral_type: type,
          referred_by_id: null,
          referred_by_name: name,
          reference_type: LEGACY_LABEL[type],
          reference_name: name,
          ...(contact ? { reference_contact: contact } : {}),
        },
      });
    } else {
      decisions.push({
        id,
        outcome: 'review',
        type,
        person,
        tier: res.tier,
        reason: res.reason,
        // Cross-type records lead. They are only ever surfaced because something
        // specific pointed at them — a name or, for 'SURYA.K.R ECE', an exact
        // phone match on the alumni consultant — so burying that behind ten
        // same-named learners hides the answer.
        candidates: [...(res.candidates ?? [])]
          .sort((a, b) => (b.__crossType ? 1 : 0) - (a.__crossType ? 1 : 0))
          .map((c) => ({
            id: c.id,
            // Flag the type so a reviewer picking a cross-type record knows the
            // referral_type will change with it.
            label: `${c.__crossType ? `[${c.__crossType.toUpperCase()}] ` : ''}${describe(c)}`,
          })),
        crossType: res.crossType ?? null,
        values: {},
      });
    }
  }

  return { decisions, nameCache };
}

// ─────────────────────────────────────────────────────────────────────────────
// Review workbook
// ─────────────────────────────────────────────────────────────────────────────

function writeReviewWorkbook(decisions) {
  const byName = new Map();
  for (const d of decisions) {
    if (d.outcome !== 'review') continue;
    const key = `${d.type}||${d.person}`;
    if (!byName.has(key)) byName.set(key, { ...d, learners: 0 });
    byName.get(key).learners++;
  }

  const rows = [...byName.values()]
    .sort((a, b) => b.learners - a.learners)
    .map((d) => {
      const out = {
        'Reference Type': d.type === 'faculty' ? 'Staff' : d.type === 'consultant' ? 'Consultant' : 'Student',
        'Reference Person (from sheet)': d.person,
        'Learners affected': d.learners,
        'Why uncertain': d.reason,
        'Chosen ID': '',
        'Or mark OUTSIDE': '',
      };
      (d.candidates ?? []).forEach((c, i) => {
        out[`Candidate ${i + 1}`] = c.label;
        out[`Candidate ${i + 1} ID`] = c.id;
      });
      return out;
    });

  if (!rows.length) return { file: null, count: 0 };

  const headers = [
    'Reference Type',
    'Reference Person (from sheet)',
    'Learners affected',
    'Why uncertain',
    'Chosen ID',
    'Or mark OUTSIDE',
  ];
  const widest = Math.max(...[...byName.values()].map((d) => (d.candidates ?? []).length), 1);
  for (let i = 1; i <= widest; i++) headers.push(`Candidate ${i}`, `Candidate ${i} ID`);

  const ws = XLSX.utils.json_to_sheet(rows, { header: headers });
  ws['!cols'] = headers.map((h) => ({
    wch: h.startsWith('Candidate') && !h.endsWith('ID') ? 52 : h === 'Why uncertain' ? 46 : h.includes('Person') ? 40 : 18,
  }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Review');
  XLSX.writeFile(wb, REVIEW_XLSX);
  return { file: REVIEW_XLSX, count: rows.length };
}

/** Read back a filled review workbook into resolver overrides. */
function readReviewWorkbook(file, ctx) {
  const wb = XLSX.readFile(file);
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { raw: false, defval: '' });
  const byId = new Map();
  for (const type of Object.keys(ctx.byType))
    for (const c of ctx.byType[type]) byId.set(String(c.id).toLowerCase(), { type, c });

  const overrides = new Map();
  const problems = [];
  for (const r of rows) {
    const sheetType = String(r['Reference Type'] ?? '').trim();
    const type = TYPE_FROM_SHEET[sheetType];
    const person = String(r['Reference Person (from sheet)'] ?? '').trim();
    const chosen = String(r['Chosen ID'] ?? '').trim().toLowerCase();
    const outside = String(r['Or mark OUTSIDE'] ?? '').trim().toUpperCase();
    if (!type || !person) continue;

    if (outside === 'OUTSIDE' || outside === 'YES' || outside === 'Y') {
      overrides.set(`${type}||${person}`, { tier: 'T5', candidates: [], reason: 'marked OUTSIDE in review' });
      continue;
    }
    if (!chosen) continue;

    const hit = byId.get(chosen);
    if (!hit) {
      problems.push(`"${person}": Chosen ID ${chosen} matches no record — row skipped.`);
      continue;
    }
    overrides.set(`${type}||${person}`, {
      tier: 'REVIEWED',
      candidate: hit.c,
      candidates: [hit.c],
      crossTypeApplied: hit.type !== type ? hit.type : undefined,
      reason: hit.type !== type ? `reviewed — retyped to ${hit.type}` : 'reviewed — chosen by operator',
    });
  }
  return { overrides, problems };
}

// ─────────────────────────────────────────────────────────────────────────────
// Write
// ─────────────────────────────────────────────────────────────────────────────

async function applyDecisions(decisions) {
  const writable = decisions.filter((d) => Object.keys(d.values).length > 0);
  let ok = 0;
  const failures = [];

  for (const d of writable) {
    // Never fire-and-forget a Supabase mutation: try/catch does NOT catch RLS
    // denials or constraint violations — they come back in `error`.
    const { error } = await withRetry(() =>
      sb.from('learners_profiles').update(d.values).eq('id', d.id)
    );
    if (error) failures.push({ id: d.id, person: d.person, error: error.message, code: error.code });
    else ok++;
    if (ok % 100 === 0) process.stdout.write(`   …${ok}/${writable.length}\r`);
  }
  return { attempted: writable.length, ok, failures };
}

/**
 * Consultant-typed names with no record anywhere. Deduped by identity tokens,
 * NOT by raw string: the operator typed 'KPM KALVI VATTARAM, DCC' and
 * 'KPM KALVI VATTARAM, DCC - 8667473020' for the same consultancy, and creating
 * both would put a near-duplicate in a table whose picker is already hard to
 * disambiguate (SURESH is four rows). The longest spelling wins as the name and
 * any phone found across the variants is carried over.
 */
function collectMissingConsultants(decisions) {
  const wanted = new Map();
  for (const d of decisions) {
    if (d.outcome !== 'name_only' || d.type !== 'consultant') continue;
    // A name a human explicitly marked OUTSIDE is a decision, not a gap. Arts
    // (Self) named AGENT (7 learners), NET, TRUST, GAM and CO OPEARATIVE
    // SOCIETY as "consultants"; auto-creating those would put five records that
    // are not agencies into the Consultants module and the commission ledger.
    // --create-consultants must never overrule the review workbook.
    if (/marked OUTSIDE in review/i.test(d.reason ?? '')) continue;
    const key = coreKey(d.person);
    if (!key) continue;
    if (!wanted.has(key)) wanted.set(key, { name: '', phone: '', learners: 0, variants: new Set() });
    const w = wanted.get(key);
    w.learners++;
    w.variants.add(d.person);
    const tidy = d.person.replace(/\s+/g, ' ').replace(/[,\/\-\s]+$/, '').trim();
    // Drop a phone number the operator appended to the name itself.
    const withoutPhone = tidy.replace(/\s*[-–—]\s*\d{10}\s*$/, '').trim();
    if (withoutPhone.length > w.name.length) w.name = withoutPhone;
    if (!w.phone && d.values.reference_contact) w.phone = d.values.reference_contact;
    const inline = tidy.match(/(\d{10})\s*$/);
    if (!w.phone && inline) w.phone = inline[1];
  }
  return [...wanted.values()].map((w) => ({ ...w, variants: [...w.variants] }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Verify
// ─────────────────────────────────────────────────────────────────────────────

async function verify(ctx) {
  const ids = [...new Set(readSheet().map((r) => String(r['ID*'] ?? '').trim()).filter(Boolean))];
  const rows = [];
  for (let i = 0; i < ids.length; i += 100) {
    const { data, error } = await withRetry(() =>
      sb
        .from('learners_profiles')
        .select('id, referral_type, referred_by_id, referred_by_name, reference_type, reference_name, reference_contact')
        .in('id', ids.slice(i, i + 100))
    );
    if (error) throw new Error(error.message);
    rows.push(...data);
  }

  const byId = new Map();
  for (const type of Object.keys(ctx.byType))
    for (const c of ctx.byType[type]) byId.set(String(c.id).toLowerCase(), type);

  const counts = { linked: 0, name_only: 0, direct: 0, untouched: 0 };
  const wrongTable = [];
  for (const r of rows) {
    if (r.referred_by_id) {
      counts.linked++;
      const actual = byId.get(String(r.referred_by_id).toLowerCase());
      if (actual !== r.referral_type)
        wrongTable.push({ id: r.id, referral_type: r.referral_type, actual_table: actual ?? 'NOT FOUND' });
    } else if (r.referral_type) counts.name_only++;
    else if (r.reference_type === 'DIRECT APPLICATION') counts.direct++;
    else counts.untouched++;
  }

  console.log('\n── VERIFY ─────────────────────────────────────────────');
  console.log(`   rows read back      : ${rows.length}`);
  console.log(`   linked              : ${counts.linked}`);
  console.log(`   name-only (outside) : ${counts.name_only}`);
  console.log(`   DIRECT APPLICATION  : ${counts.direct}`);
  console.log(`   untouched           : ${counts.untouched}`);
  console.log(
    `   wrong-table ids     : ${wrongTable.length}${wrongTable.length ? '  ← MUST BE ZERO' : '  ✓'}`
  );
  if (wrongTable.length) console.table(wrongTable.slice(0, 20));
  return { counts, wrongTable };
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

const ctx = await loadCandidates();
console.log(
  `loaded  consultants=${ctx.byType.consultant.length}  staff=${ctx.byType.faculty.length}  learners=${ctx.byType.student.length}`
);

if (VERIFY_ONLY) {
  await verify(ctx);
  process.exit(0);
}

let overrides = new Map();
if (REVIEW_IN) {
  const r = readReviewWorkbook(REVIEW_IN, ctx);
  overrides = r.overrides;
  console.log(`review workbook: ${overrides.size} name decision(s) read from ${REVIEW_IN}`);
  for (const p of r.problems) console.log(`   ! ${p}`);
}

const { decisions } = await buildPlan(ctx, overrides);

const tally = decisions.reduce((acc, d) => ((acc[d.outcome] = (acc[d.outcome] ?? 0) + 1), acc), {});
const distinctReview = new Set(decisions.filter((d) => d.outcome === 'review').map((d) => `${d.type}||${d.person}`));
const tierTally = decisions.reduce((acc, d) => (d.tier ? ((acc[d.tier] = (acc[d.tier] ?? 0) + 1), acc) : acc), {});

console.log('\n── PLAN (rows) ────────────────────────────────────────');
for (const [k, v] of Object.entries(tally)) console.log(`   ${k.padEnd(12)} ${v}`);
console.log(`   ── total     ${decisions.length}`);
console.log('\n── by match tier ──────────────────────────────────────');
for (const [k, v] of Object.entries(tierTally).sort()) console.log(`   ${k.padEnd(12)} ${v}`);
console.log(`\n   distinct names needing review: ${distinctReview.size}`);

fs.writeFileSync(PLAN_JSON, JSON.stringify(decisions, null, 1));
console.log(`\nplan written -> ${PLAN_JSON}`);

const review = writeReviewWorkbook(decisions);
if (review.file) console.log(`review sheet -> ${review.file}  (${review.count} names)`);

const newConsultants = collectMissingConsultants(decisions);
if (newConsultants.length) {
  console.log(`\n── consultants with no record (${newConsultants.length}) ──`);
  for (const c of newConsultants)
    console.log(
      `   ${String(c.learners).padStart(3)} learner(s)  ${c.name}${c.phone ? `  [${c.phone}]` : ''}` +
        (c.variants.length > 1 ? `   (merged ${c.variants.length} spellings)` : '')
    );
  if (CREATE_CONSULTANTS && APPLY) {
    for (const c of newConsultants) {
      const { data, error } = await withRetry(() =>
        sb
          .from('education_consultants')
          .insert({ name: c.name, phone: c.phone || null, consultant_type: 'external', status: 'active' })
          .select('id')
          .single()
      );
      if (error) console.log(`   ! failed to create ${c.name}: ${error.message}`);
      else console.log(`   + created ${c.name} -> ${data.id}`);
    }
    // Stop here on purpose. The plan in memory still says these learners are
    // name-only; re-running rebuilds it against the consultants that now exist
    // so they link on the first write instead of being written twice.
    console.log('\nConsultants created. Re-run without --create-consultants to link and apply.');
    process.exit(0);
  } else {
    console.log('   (pass --create-consultants --apply to insert these)');
  }
}

if (!APPLY) {
  console.log('\nDRY RUN — nothing written. Re-run with --apply.');
  process.exit(0);
}

console.log('\n── APPLYING ───────────────────────────────────────────');
const result = await applyDecisions(decisions);
console.log(`   attempted ${result.attempted}   ok ${result.ok}   failed ${result.failures.length}`);
if (result.failures.length) {
  console.table(result.failures.slice(0, 25));
  process.exitCode = 1;
}
await verify(ctx);
