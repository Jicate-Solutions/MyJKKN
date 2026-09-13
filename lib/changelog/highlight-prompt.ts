// What's New — the plain-English highlight writer: prompt assembly and result
// parsing. Pure functions, no network, no clock, no Supabase.
//
// WHY THIS IS A LIBRARY AND NOT A STRING IN THE MIGRATION. The registry row for
// whats_new.highlight_draft carries the bare '{{prompt}}' slot, so the whole
// prompt is assembled here. That is deliberate: the rules below are the product
// decision (name the ROLE never a person; strip the fix(scope): prefix and the
// (#1234); refuse rather than invent), and rules asserted by a test are rules
// that survive editing. A prompt living in an applied migration is asserted by
// nothing and can only be changed by another migration.
//
// ───────────────────────── SEND NAMES, NOT IDENTIFIERS ──────────────────────
//
// OneMark's drafting produced nothing usable until PR #3378 put real names in
// the payload — with bare UUIDs the model refused rather than guess, which was
// the correct refusal. The same rule binds here and is the single most
// important property of buildHighlightPrompt(): the prompt carries the commit
// SUBJECT, the module's human LABEL ("Billing", not `billing`), and the
// author's display name. It never carries a sha and never carries a module key.
// A 12-character hash means nothing to a model asked to explain a change to a
// Principal, and a model given only hashes writes confident nonsense or
// refuses — both of which cost a round trip.
//
// The sha is the JOIN KEY and travels in payload._ctx, where the collect pass
// reads it. It is not part of the question.

import type { ChangelogEntry } from './types';

/** What the model is asked to return, after parsing. */
export interface HighlightDraft {
  headline: string;
  affects: string;
  action: string;
}

/**
 * A refusal is a RESULT, not a failure.
 *
 * Most of what ships is invisible to a reader: a type error fixed, a query made
 * faster, a migration renumbered. Asked to explain one of those to a Principal,
 * the only honest answer is that there is nothing to explain — and a model that
 * cannot say so will invent an effect instead, which is precisely the failure
 * this page cannot afford. So "no user-visible effect" is a first-class answer
 * with its own shape, and the cron files it as 'skipped' rather than publishing
 * it. Selection then never offers that entry again.
 */
export interface HighlightRefusal {
  noUserVisibleEffect: true;
  reason: string;
}

export type HighlightResult = HighlightDraft | HighlightRefusal;

export function isRefusal(r: HighlightResult): r is HighlightRefusal {
  return (r as HighlightRefusal).noUserVisibleEffect === true;
}

/**
 * Everything the writer is told about one change.
 *
 * Note what is absent: `sha`. See the header — the identifier is the join key,
 * not part of the question. The type makes that structural rather than a
 * discipline the caller has to remember.
 */
export interface HighlightSubject {
  /** the commit subject, in the words of the person who shipped it */
  subject: string;
  /** the module's HUMAN label — "Billing", never `billing` */
  moduleLabel: string;
  /** where in the app this module lives, when it has a screen */
  moduleHref: string | null;
  /** the author's display name */
  author: string;
  kind: ChangelogEntry['t'];
  breaking: boolean;
}

const KIND_SENTENCE: Record<ChangelogEntry['t'], string> = {
  new: 'This change ADDED something that was not there before.',
  fixed: 'This change FIXED something that was behaving wrongly.',
  security: 'This change CLOSED a security or privacy hole — someone could see or do something they should not have been able to.',
  faster: 'This change made something FASTER.',
};

/**
 * The instructions. Stable text, so it is a module constant rather than
 * rebuilt per call — and so a diff on this file shows exactly what changed
 * about the writing when a highlight starts reading differently.
 *
 * The two worked examples are doing real work and are not decoration. The
 * first shows the whole transformation on a change that IS user-visible: the
 * `fix(analytics):` prefix gone, a role named where the commit named none, and
 * an action that says where on screen to go. The second shows the refusal, on a
 * change that genuinely has no user-visible effect. Without the second example
 * a model reads the task as "always produce three lines" and will produce them
 * for a renamed variable.
 */
const INSTRUCTIONS = `You write the "What's New" page for MyJKKN, the platform every JKKN college runs on. Your readers are Principals, HODs, Senior Learners, office team members and learners. They are NOT developers. Most have never read a commit message and never will.

You are given ONE change that shipped. Write the three lines a reader needs.

1. "headline" — what changed, in plain English, as a person would say it out loud.
   - NEVER start with a prefix like "fix(billing):" or "feat(academic):". Delete it.
   - NEVER include a pull request number like "(#1234)". Delete it.
   - No jargon: no RLS, no SECURITY DEFINER, no RPC, no migration, no endpoint, no null, no enum, no schema, no cache, no refactor. If the change is about one of those, say what a PERSON would notice instead.
   - One sentence. Write it from the reader's side ("Your dashboard now...", "Fee receipts now...").

2. "affects" — who will notice this.
   - Name the ROLE, never a person. "Principals and HODs", "Anyone who takes attendance", "Learners on a hostel plan", "Office team members who raise invoices".
   - NEVER write a human name, even if one appears in the change. Do not write "raised by Dr Priya" or "suggested by the Principal of Dental". Say "raised by a HOD" or just name the role that benefits.
   - If it genuinely affects everyone signed in, say so.

3. "action" — what the reader can DO now, and where on screen to find it.
   - Name the path the way the menu reads: "Open Analytics → Engagement".
   - If there is nothing to click and the change simply takes effect, say that plainly ("Nothing to do — it applies the next time you open a receipt.").

WHEN THERE IS NOTHING TO SAY, SAY THAT. Most engineering work is invisible to a reader: an internal function renamed, a type corrected, a build gate added, a test fixed, a database column tidied. If this change has no effect a reader could notice, DO NOT invent one. Return the refusal shape instead. A refusal is a correct and expected answer here — it is much better than a confident sentence about an effect that does not exist.

Return ONLY valid JSON. No markdown, no code fences, no commentary.

Either exactly this:
{"headline": "...", "affects": "...", "action": "..."}

Or exactly this:
{"no_user_visible_effect": true, "reason": "<one short sentence: why a reader would never notice>"}

─── WORKED EXAMPLE 1 — a change a reader notices ───
Change: "fix(analytics): Engagement shows each principal only their college"
Area: Analytics · Kind: this change FIXED something that was behaving wrongly.
You return:
{"headline": "Your Engagement dashboard now shows only your own unit", "affects": "Principals and HODs", "action": "Open Analytics → Engagement; other colleges' numbers are gone."}

─── WORKED EXAMPLE 2 — a change no reader notices ───
Change: "refactor(core): extract useDebounce hook and drop the duplicate implementation"
Area: Platform · Kind: this change FIXED something that was behaving wrongly.
You return:
{"no_user_visible_effect": true, "reason": "Internal code tidy-up — nothing on any screen changes."}`;

/**
 * Assemble the full prompt for ONE change.
 *
 * The result is what goes in payload.prompt; the runner substitutes it into the
 * type's single `{{prompt}}` slot and sends nothing else.
 */
export function buildHighlightPrompt(s: HighlightSubject): string {
  const lines = [
    `Change: "${s.subject}"`,
    `Area: ${s.moduleLabel}`,
    `Kind: ${KIND_SENTENCE[s.kind] ?? KIND_SENTENCE.fixed}`,
    `Shipped by: ${s.author}`,
  ];
  if (s.moduleHref) {
    // Where the reader would go. Given as a path because the model is writing
    // the "where on screen" line and guessing at navigation is how a highlight
    // ends up sending someone to a page that does not exist.
    lines.push(`This area opens at: ${s.moduleHref}`);
  } else {
    lines.push(
      'This area has no single screen of its own — it is platform-wide, so "what you can do now" is usually "nothing to do".'
    );
  }
  if (s.breaking) {
    lines.push(
      'IMPORTANT: this change alters something people ALREADY DO. Say plainly what is different from before, because someone will be surprised by it.'
    );
  }

  return `${INSTRUCTIONS}\n\n─── THE CHANGE TO WRITE UP ───\n${lines.join('\n')}\n\nReturn the JSON now.`;
}

/** Trim, and treat a whitespace-only string as absent. */
function text(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t === '' ? null : t;
}

/**
 * Parse the model's answer.
 *
 * Returns null on anything it cannot read with confidence, and null means the
 * cron files NOTHING — the entry simply re-qualifies on the next run. That is
 * the right failure: a half-parsed highlight is a wrong sentence published
 * unreviewed on the page people use to learn the system, and there is no
 * approval step left to catch it.
 *
 * A fenced ```json block and a bare object embedded in prose are both tolerated,
 * because both are ordinary model output and neither is a sign the content is
 * untrustworthy. Missing FIELDS are not tolerated: all three lines or nothing.
 */
export function parseHighlightResult(raw: string | null): HighlightResult | null {
  if (!raw) return null;
  let obj: unknown;
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  try {
    obj = JSON.parse(cleaned);
  } catch {
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try {
      obj = JSON.parse(m[0]);
    } catch {
      return null;
    }
  }
  if (!obj || typeof obj !== 'object') return null;
  const o = obj as Record<string, unknown>;

  // The refusal is checked FIRST. A model that returns the refusal shape and
  // also, helpfully, a headline explaining that there is nothing to say would
  // otherwise get that apology published as a highlight.
  if (o.no_user_visible_effect === true) {
    return {
      noUserVisibleEffect: true,
      reason: text(o.reason) ?? 'No user-visible effect.',
    };
  }

  const headline = text(o.headline);
  const affects = text(o.affects);
  const action = text(o.action);
  // All three or nothing: the database CHECK requires the same thing for an
  // approved row, so a partial answer could not be filed anyway. Refusing it
  // here means the entry re-qualifies instead of erroring on insert.
  if (!headline || !affects || !action) return null;

  return { headline, affects, action };
}

/**
 * The dedupe key for one change.
 *
 * `_dedupe` is the in-flight guard fn_ai_enqueue_system checks, so this is what
 * stops a re-run queueing a second job for a sha the lane is already working
 * on. Keyed on (app_key, sha) — the pair changelog_entries is keyed by — and
 * NOT on the week, because an entry that slid across a week boundary is still
 * the same change and must not be written up twice.
 */
export function highlightDedupeKey(appKey: string, sha: string): string {
  return `whats_new_highlight|${appKey}|${sha}`;
}
