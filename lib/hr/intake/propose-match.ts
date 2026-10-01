/**
 * HR intake helper — what to propose for one candidate. Pure, no I/O.
 *
 * Order of evidence, strongest first:
 *   1. The same person is already on an earlier row of this file -> skip.
 *   2. The same person is already in MyJKKN -> merge_existing.
 *   3. They applied to the general pool, not a job -> needs_new_job (low).
 *   4. A person taught the helper where this CVViZ title goes -> that job (high),
 *      credited to them.
 *   5. Otherwise the open jobs are scored on title words, the resume's subject
 *      and qualification. One clear winner -> file it there; several close ->
 *      the best guess with the alternatives named; none -> needs_new_job.
 *
 * Reasons are short plain English, most important first. They are shown to the
 * person deciding, so they say what the helper saw, never how it computed.
 */

import type {
  IntakeCandidate,
  IntakeConfidence,
  IntakeDuplicate,
  IntakeMatchRule,
  IntakeOpenJob,
  IntakeProposal,
  ResumeExtract,
} from '@/types/hr-intake';
import { isGeneralPool, normaliseJobTitle, titleTokens } from './normalise';

/** An open job as the matcher scores it. qualifications come from the job's requirements. */
export interface MatchJob extends IntakeOpenJob {
  qualifications?: string[];
}

export interface ProposeInput {
  candidate: IntakeCandidate;
  extract: ResumeExtract | null;
  /** The resume's file name, a weak hint when the resume itself was not read. */
  resume_file_name?: string | null;
  duplicate: IntakeDuplicate;
  /** For a same_file row: the CVViZ job of the row it points at. */
  duplicate_of_job_title?: string | null;
  /** For a same_file row: that row's 1-based number. */
  duplicate_of_row_index?: number | null;
  /**
   * The college the upload belongs to. A proposal for a job at ANOTHER college
   * is never high: filed there, the person would be where the uploading
   * college cannot even see them.
   */
  batch_institution_id?: string | null;
  /** How the resume's file name matched (resume-files tiers); 'contains' is only a similar name. */
  resume_match?: 'exact' | 'stem' | 'number' | 'contains' | 'generic' | null;
  /** For a same_file row: the candidate on the row it points at. */
  duplicate_of_candidate?: Pick<IntakeCandidate, 'email' | 'phone'> | null;
  /** For a same_file row: whether that row has a resume paired. */
  duplicate_of_resume_uploaded?: boolean;
  openJobs: MatchJob[];
  rules: IntakeMatchRule[];
  /** Extra notes the caller wants on the card (e.g. "Resume not read"). Appended last. */
  extra_reasons?: string[];
  /**
   * Whether a resume file was paired with this row. Filing needs one, so when
   * this is explicitly false a "file under job" proposal is capped at low.
   * Left undefined, the resume is not considered.
   */
  resume_uploaded?: boolean;
}

/**
 * Why this row cannot be filed as it stands (filing refuses it), or [] when it
 * can. Mirrors the refusals in the service's fileOne: an email, a usable phone
 * number and an uploaded resume are all required.
 */
export function filingBlockers(
  candidate: Pick<IntakeCandidate, 'email' | 'phone'>,
  resumeUploaded: boolean | undefined,
): string[] {
  const out: string[] = [];
  if (!candidate.email && !candidate.phone) out.push('Cannot be filed yet: no email or phone');
  else if (!candidate.email) out.push('Cannot be filed yet: no email address');
  else if (!candidate.phone) out.push('Cannot be filed yet: no usable phone number');
  if (resumeUploaded === false) out.push('No resume uploaded');
  return out;
}

/** Score at or above which a single clear winner is proposed with high confidence. */
export const STRONG_SCORE = 0.75;
/** Score below which a job is not considered a fit at all. */
export const MIN_SCORE = 0.4;
/** How far ahead the best job must be for it to count as a clear winner. */
export const CLEAR_GAP = 0.15;

const SUBJECT_BONUS = 0.35;
const FILE_HINT_BONUS = 0.2;
const SUBJECT_MISMATCH_PENALTY = 0.3;
const QUALIFICATION_BONUS = 0.1;

const FILE_NAME_NOISE = new Set(['cv', 'resume', 'biodata', 'pdf', 'doc', 'docx', 'updated', 'final', 'my', 'new', 'latest', 'copy']);

export const jobLabel = (j: Pick<IntakeOpenJob, 'title' | 'institution_name'>) =>
  j.institution_name ? `${j.title} (${j.institution_name})` : j.title;

const empty = (
  action: IntakeProposal['action'],
  confidence: IntakeConfidence,
  reasons: string[],
): IntakeProposal => ({
  action,
  job_id: null,
  job_title: null,
  institution_id: null,
  confidence,
  reasons,
  rule_id: null,
  rule_author_name: null,
});

const forJob = (
  job: MatchJob,
  confidence: IntakeConfidence,
  reasons: string[],
): IntakeProposal => ({
  action: 'file_under_job',
  job_id: job.id,
  job_title: job.title,
  institution_id: job.institution_id,
  confidence,
  reasons,
  rule_id: null,
  rule_author_name: null,
});

const intersects = (a: Iterable<string>, b: Set<string>) => {
  for (const x of a) if (b.has(x)) return true;
  return false;
};

/**
 * Words that change WHICH post a title is. "Vice Principal" is not "Principal",
 * "Assistant" is not "Associate": when one side has such a word the other lacks,
 * the titles share words but name different posts, so the overlap is capped
 * below the fit threshold.
 */
const RANK_WORDS = new Set([
  'vice', 'deputy', 'assistant', 'associate', 'senior', 'junior', 'head', 'chief', 'lead', 'additional', 'joint', 'trainee',
]);
const RANK_MISMATCH_CAP = 0.3;

/** 0..1: exact normalised title = 1, otherwise word overlap (Jaccard), capped on a rank mismatch. */
export function titleScore(cvTitle: string, jobTitle: string): number {
  const a = normaliseJobTitle(cvTitle);
  if (a === '') return 0;
  if (a === normaliseJobTitle(jobTitle)) return 1;
  const ca = new Set(titleTokens(cvTitle));
  const jb = new Set(titleTokens(jobTitle));
  let inter = 0;
  for (const t of ca) if (jb.has(t)) inter += 1;
  const union = new Set([...ca, ...jb]).size;
  const jaccard = union === 0 ? 0 : inter / union;
  const rankMismatch = [...ca].some((t) => RANK_WORDS.has(t) && !jb.has(t))
    || [...jb].some((t) => RANK_WORDS.has(t) && !ca.has(t));
  return rankMismatch ? Math.min(jaccard, RANK_MISMATCH_CAP) : jaccard;
}

interface Scored {
  job: MatchJob;
  score: number;
  subjectMatched: boolean;
  fileHintMatched: string | null;
}

function scoreJobs(input: ProposeInput, cvTitle: string): Scored[] {
  const cvTokens = new Set(titleTokens(cvTitle));
  const cvAlternatives = [cvTitle, ...cvTitle.split(/\s*\/\s*|\s+or\s+/i)].filter((t) => t.trim() !== '');
  const subject = new Set(titleTokens(input.extract?.subject ?? ''));
  const quals = new Set([
    ...titleTokens(input.candidate.qualification ?? ''),
    ...titleTokens(input.extract?.qualification ?? ''),
  ]);

  // A file-name hint only counts when it names a word some open job uses beyond
  // the CVViZ title ("..._English.pdf" against "... - English"). Names and
  // filler words in file names can never match by accident that way.
  const jobExtraWords = new Set<string>();
  for (const j of input.openJobs) {
    for (const t of [...titleTokens(j.title), ...titleTokens(j.department_name ?? '')]) {
      if (!cvTokens.has(t)) jobExtraWords.add(t);
    }
  }
  const fileHint = subject.size === 0
    ? titleTokens((input.resume_file_name ?? '').replace(/\.[a-z0-9]{2,5}$/i, ''))
        .filter((t) => !FILE_NAME_NOISE.has(t) && !/^\d+$/.test(t) && jobExtraWords.has(t))
    : [];

  return input.openJobs.map((job) => {
    const jobTitleTokens = titleTokens(job.title);
    const jobWords = new Set([...jobTitleTokens, ...titleTokens(job.department_name ?? '')]);
    // "Lab Technician/Research Assistant" fits a "Lab Technician" job: each
    // slash-separated alternative is scored and the best one counts.
    const base = Math.max(...cvAlternatives.map((alt) => titleScore(alt, job.title)));
    let score = base;
    // Supporting evidence only lifts a job whose title already names the same
    // post. A capped rank mismatch ("Associate" for "Assistant") stays out.
    const titleFits = base > RANK_MISMATCH_CAP;

    let subjectMatched = false;
    if (titleFits && subject.size > 0) {
      if (intersects(subject, jobWords)) {
        score += SUBJECT_BONUS;
        subjectMatched = true;
      } else {
        // The job names a speciality the CVViZ title does not ("... - History"),
        // and the resume says the person's subject is something else.
        const extra = jobTitleTokens.filter((t) => !cvTokens.has(t));
        if (extra.length > 0) score -= SUBJECT_MISMATCH_PENALTY;
      }
    }

    let fileHintMatched: string | null = null;
    const hit = titleFits ? fileHint.find((t) => jobWords.has(t)) : undefined;
    if (hit) {
      score += FILE_HINT_BONUS;
      fileHintMatched = hit;
    }

    const jobQuals = new Set((job.qualifications ?? []).flatMap((q) => titleTokens(q)));
    if (titleFits && quals.size > 0 && jobQuals.size > 0 && intersects(quals, jobQuals)) score += QUALIFICATION_BONUS;

    return { job, score: Math.max(0, score), subjectMatched, fileHintMatched };
  });
}

/**
 * The proposal for one row. A "file under job" proposal for a row filing would
 * refuse (no email or phone, no resume) is never high or medium: it is capped at
 * low, with the reason first.
 */
export function proposeMatch(input: ProposeInput): IntakeProposal {
  const p = requirePositiveEvidence(input, capOtherCollege(input, proposeFromEvidence(input)));
  if (p.action !== 'file_under_job') return p;
  const blockers = filingBlockers(input.candidate, input.resume_uploaded);
  if (blockers.length === 0) return p;
  return { ...p, confidence: 'low', reasons: [...blockers, ...p.reasons] };
}

/** Words in a post's title or department that name no subject. */
const POST_WORDS = new Set([
  'professor', 'lecturer', 'teacher', 'faculty', 'officer', 'technician', 'staff', 'clerk', 'manager', 'principal',
  'director', 'dean', 'coordinator', 'executive', 'trainer', 'instructor', 'lab', 'laboratory', 'department',
  'dept', 'section', 'office', 'administrative', 'administration', 'admin', 'general', 'support', 'keeper', 'store',
  // Terms of appointment, not subjects.
  'guest', 'visiting', 'contract', 'temporary', 'permanent', 'adhoc', 'part', 'full', 'time',
]);
/** Words that qualify a subject without changing it ("English Literature" is English). */
const SUBJECT_FLUFF = new Set(['literature', 'studies', 'language', 'languages', 'applied']);
/** Words in a qualification that name no subject ("M.Sc.", "Ph.D.", "Master of Arts"). */
const DEGREE_WORDS = new Set([
  'master', 'masters', 'bachelor', 'bachelors', 'degree', 'diploma', 'doctorate', 'doctor', 'philosophy', 'phil',
  'mphil', 'phd', 'science', 'sciences', 'arts', 'msc', 'bsc', 'mba', 'mca', 'bca', 'mcom', 'bcom', 'btech',
  'mtech', 'net', 'set', 'slet', 'gate', 'graduate', 'post', 'pg', 'ug', 'honours', 'hons', 'education',
]);
const subjectWordsOf = (...values: (string | null | undefined)[]) =>
  new Set(
    values
      .flatMap((v) => titleTokens(v ?? ''))
      .filter((t) => t.length >= 4 && !DEGREE_WORDS.has(t) && !RANK_WORDS.has(t) && !POST_WORDS.has(t) && !SUBJECT_FLUFF.has(t)),
  );

/**
 * "High" tells HR the helper is sure, so it needs POSITIVE evidence, not just
 * the absence of a contradiction (HR still decides every card; there is no
 * bulk accept):
 * - the resume was paired by its own name, not only a similar one;
 * - when the post names a subject (in its title or department), the CVViZ
 *   title, the resume's subject or the qualification names it too, and none of
 *   the resume's subject or qualification points elsewhere.
 * Anything short of that is medium, with the reason first.
 */
function requirePositiveEvidence(input: ProposeInput, p: IntakeProposal): IntakeProposal {
  if (p.action !== 'file_under_job' || p.confidence !== 'high') return p;
  const down = (reason: string): IntakeProposal => ({ ...p, confidence: 'medium', reasons: [reason, ...p.reasons] });
  if (input.resume_match === 'contains') {
    return down('Resume matched only by a similar file name: check it is this person\u2019s');
  }
  if (input.resume_match === 'generic') {
    return down('The resume file has a generic name: check it is this person\u2019s');
  }
  const job = input.openJobs.find((j) => j.id === p.job_id);
  if (!job) return p;
  const postSubject = new Set(
    [...titleTokens(job.title), ...titleTokens(job.department_name ?? '')].filter(
      (t) => !POST_WORDS.has(t) && !RANK_WORDS.has(t) && !SUBJECT_FLUFF.has(t),
    ),
  );
  if (postSubject.size === 0) return p;
  // Each source that names a subject must name EXACTLY the post's subject:
  // sharing one word is not enough ("Civil Engineering" is not "Mechanical
  // Engineering"; "Child Health Nursing" is not "Medical Surgical Nursing").
  const cvSubject = new Set(
    titleTokens(input.candidate.cvviz_job_title ?? '').filter((t) => !POST_WORDS.has(t) && !RANK_WORDS.has(t) && !SUBJECT_FLUFF.has(t)),
  );
  const sources: [string, Set<string>][] = [
    ['The CVViZ job title', cvSubject],
    ['The resume\u2019s subject', subjectWordsOf(input.extract?.subject)],
    ['The qualification', subjectWordsOf(input.candidate.qualification, input.extract?.qualification)],
  ];
  const named = sources.filter(([, words]) => words.size > 0);
  const sameSet = (a: Set<string>, b: Set<string>) => a.size === b.size && [...a].every((w) => b.has(w));
  const differs = named.find(([, words]) => !sameSet(words, postSubject));
  if (differs) {
    return down(`${differs[0]} (${[...differs[1]].join(' ')}) is not exactly this post\u2019s subject (${[...postSubject].join(' ')}): check before filing`);
  }
  if (named.length === 0) {
    return down('Nothing in the CVViZ title or the resume names this post\u2019s subject: check before filing');
  }
  return p;
}

function capOtherCollege(input: ProposeInput, p: IntakeProposal): IntakeProposal {
  if (p.action !== 'file_under_job' || !input.batch_institution_id) return p;
  if (p.institution_id === input.batch_institution_id) return p;
  const where = input.openJobs.find((j) => j.id === p.job_id)?.institution_name ?? 'another college';
  const reason = `This job is at ${where}, not the college this upload belongs to: check before filing`;
  return { ...p, confidence: p.confidence === 'high' ? 'medium' : p.confidence, reasons: [reason, ...p.reasons] };
}

function proposeFromEvidence(input: ProposeInput): IntakeProposal {
  const extra = input.extra_reasons ?? [];
  const cvTitle = input.candidate.cvviz_job_title ?? '';

  // 1. Same person earlier in this file.
  if (input.duplicate.kind === 'same_file') {
    const reasons = [input.duplicate.note ?? 'Same person as an earlier row in this file'];
    const other = input.duplicate_of_job_title ?? '';
    const differentJob = normaliseJobTitle(other) !== normaliseJobTitle(cvTitle) && cvTitle !== '';
    if (differentJob) {
      const where = input.duplicate_of_row_index ? `row ${input.duplicate_of_row_index}` : 'that row';
      reasons.push(`This row is for "${cvTitle}"; ${where} is for "${other || 'no job'}". File it too if both posts matter.`);
    }
    // High only when this is surely the same person (same email, not just a
    // shared phone) AND the row it defers to can itself be filed; otherwise a
    // confident skip could hide the only fileable row, or a different person
    // who shares a family or agency phone.
    const first = input.duplicate_of_candidate ?? null;
    const sameEmail = !!input.candidate.email && !!first?.email
      && input.candidate.email.toLowerCase() === first.email.toLowerCase();
    const firstBlockers = first ? filingBlockers(first, input.duplicate_of_resume_uploaded) : ['unknown'];
    // CVViZ gives one row per application, and its titles are generic: the same
    // title can be an open post at two colleges, so two rows may be two real
    // applications. Only when the title fits at most ONE open post is the second
    // row surely a repeat.
    const posts = cvTitle ? scoreJobs(input, cvTitle).filter((s) => s.score >= MIN_SCORE).length : 0;
    if (!sameEmail) reasons.push('Only the phone number or name matches: check this is the same person before skipping');
    else if (firstBlockers.length > 0) reasons.push('The earlier row cannot be filed as it stands: decide which row to file');
    else if (!differentJob && posts > 1) reasons.push(`"${cvTitle}" is open at more than one post: file this one too if both posts matter`);
    const sure = !differentJob && sameEmail && firstBlockers.length === 0 && posts <= 1;
    return empty('skip', sure ? 'high' : 'medium', [...reasons, ...extra]);
  }

  // 2. Already in MyJKKN.
  if (input.duplicate.kind === 'existing_application' || input.duplicate.kind === 'existing_candidate') {
    const fallback = input.duplicate.kind === 'existing_application'
      ? 'Already applied in MyJKKN'
      : 'Already a candidate in MyJKKN';
    // Never high: the earlier record may be for another job or another college,
    // and linking files nothing new.
    return empty('merge_existing', 'medium', [
      input.duplicate.note ?? fallback,
      'Check the earlier record is for this job before linking; if not, file this one too',
      ...extra,
    ]);
  }

  // 3. The general pool is not a job.
  if (isGeneralPool(cvTitle)) {
    return empty('needs_new_job', 'low', ['Applied to the general pool, not a job', ...extra]);
  }

  const openById = new Map(input.openJobs.map((j) => [j.id, j]));
  const norm = normaliseJobTitle(cvTitle);

  // 4. A learned rule.
  const matching = input.rules.filter((r) => r.cvviz_job_title_norm === norm);
  const live = matching
    .filter((r) => openById.has(r.job_id))
    .sort((a, b) => b.times_used - a.times_used || b.created_at.localeCompare(a.created_at));
  if (live.length > 0) {
    const rule = live[0];
    const job = openById.get(rule.job_id)!;
    const who = rule.created_by_name ?? 'A colleague';
    const reasons = [`${who} taught this: "${cvTitle}" goes to ${jobLabel(job)}`];
    for (const other of live.slice(1)) {
      const j = openById.get(other.job_id)!;
      reasons.push(`Another rule, from ${other.created_by_name ?? 'a colleague'}, says ${jobLabel(j)}`);
    }
    // A rule is one person's correction for one candidate. It is high only when
    // nothing argues against it for THIS candidate: no other open post fits the
    // title, and the resume's subject does not point to another post.
    const otherFits = scoreJobs(input, cvTitle).filter((x) => x.job.id !== job.id && x.score >= MIN_SCORE);
    // Checked on its own, not through scoring: a rule usually exists exactly
    // because the CVViZ title does not name the post.
    const subject = new Set(titleTokens(input.extract?.subject ?? ''));
    const words = (j: MatchJob) => new Set([...titleTokens(j.title), ...titleTokens(j.department_name ?? '')]);
    const subjectPoints = subject.size > 0 && !intersects(subject, words(job))
      ? input.openJobs.find((j) => j.id !== job.id && intersects(subject, words(j)))
      : undefined;
    if (subjectPoints) {
      reasons.push(`The resume's subject (${input.extract!.subject}) points to ${jobLabel(subjectPoints)} instead`);
    } else if (otherFits.length > 0) {
      reasons.push(`"${cvTitle}" also fits ${otherFits.map((x) => jobLabel(x.job)).join('; ')}: check the rule fits this person`);
    }
    const sure = live.length === 1 && otherFits.length === 0 && !subjectPoints;
    return {
      ...forJob(job, sure ? 'high' : 'medium', [...reasons, ...extra]),
      rule_id: rule.id,
      rule_author_name: rule.created_by_name,
    };
  }
  const deadRuleNote = matching.length > 0 ? ['A learned rule pointed to a job that is no longer open'] : [];

  // 5. Score the open jobs.
  const scored = scoreJobs(input, cvTitle).sort((a, b) => b.score - a.score);
  const fits = scored.filter((s) => s.score >= MIN_SCORE);

  if (fits.length === 0) {
    const closest = scored.find((s) => s.score > 0);
    const reasons = [`No open job for ${cvTitle}`];
    if (closest) reasons.push(`Closest open job: ${jobLabel(closest.job)}`);
    return empty('needs_new_job', closest ? 'low' : 'medium', [...reasons, ...deadRuleNote, ...extra]);
  }

  const best = fits[0];
  const close = fits.slice(1).filter((s) => best.score - s.score < CLEAR_GAP);
  const evidence: string[] = [];
  if (best.subjectMatched && input.extract?.subject) evidence.push(`Resume subject: ${input.extract.subject}`);
  if (best.fileHintMatched) evidence.push(`Resume file name mentions "${best.fileHintMatched}"`);

  if (close.length === 0) {
    const strong = best.score >= STRONG_SCORE && !best.fileHintMatched;
    return forJob(best.job, strong ? 'high' : 'medium', [
      `CVViZ job "${cvTitle}" fits the open job ${jobLabel(best.job)}`,
      ...evidence,
      ...deadRuleNote,
      ...extra,
    ]);
  }

  return forJob(best.job, best.score >= STRONG_SCORE && !best.fileHintMatched ? 'medium' : 'low', [
    `Several open jobs fit "${cvTitle}"; best guess ${jobLabel(best.job)}`,
    `Also close: ${close.map((s) => jobLabel(s.job)).join('; ')}`,
    ...evidence,
    ...deadRuleNote,
    ...extra,
  ]);
}
