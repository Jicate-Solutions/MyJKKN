// lib/services/meetings/meeting-note-followups.ts
//
// From a meeting note to somebody's task list — the ONE path, shared by the two
// doors a note can come through:
//
//   1. app/api/meetings/notes/ingest/route.ts — a Fireflies transcript whose
//      calendar id matched exactly one booking (the route's MATCHING rule).
//   2. app/(routes)/meetings/notes/actions.ts — a note a human linked by hand
//      through fn_link_meeting_note().
//
// Moved out of the ingest route unchanged in behaviour except for four points,
// each written down where it happens:
//
//   a. The once-only stamp (meeting_notes.action_items_applied_at) is NOT set
//      for a note Fireflies has not summarised yet and that produced nothing.
//      Stamping it meant a summary Fireflies filled in later could never become
//      follow-ups.
//   b. The booking's own host and attendee (MyJKKN identities) are owner
//      candidates alongside the Fireflies participants. The EXACTLY-ONE rule is
//      unchanged: two plausible people still means nobody is chosen.
//   c. due_date is set only from an explicit calendar date in the item's own
//      words — never from "tomorrow", "in two days" or "next week".
//   d. Each owner who is not the host gets ONE bell per note, never twice.

import type { SupabaseClient } from '@supabase/supabase-js';

import { createBellNotification } from '@/lib/services/meetings/meeting-trigger-service';
import { logger } from '@/lib/utils/enhanced-logger';

const MODULE = 'meetings/note-followups';

/** Where an owner is sent to see their follow-ups ("My Follow-ups"). */
export const FOLLOWUPS_URL = '/meetings/action-items';
const BELL_CATEGORY = 'meetings:note-followup-owner';

/**
 * Everything this path needs from a note, whichever door it came through.
 * The Fireflies transcript already has this shape; a stored note is read into
 * it by noteFollowupInputFromStored().
 */
export interface NoteFollowupInput {
  title: string | null;
  /** Fireflies' overview. Null means Fireflies has not summarised the meeting. */
  summary: string | null;
  actionItemsRaw: string | null;
  /** ISO 8601, or null. Anchors the year of a year-less due date. */
  occurredAt: string | null;
  durationMinutes: number | null;
  participants: Array<{ email: string; displayName: string | null }>;
}

// ── FROM A TRANSCRIPT TO SOMEBODY'S TASK LIST ────────────────────────────────
//
// Fireflies returns `action_items` as ONE string, shaped like this:
//
//     **Maheswaran T**
//     Prepare to join JKKN within one to two months if appointed (18:18)
//
//     **Ommsharravana, Director, JKKN Institutions**
//     Follow-up with Principal regarding the appointment in two days (19:00)
//
// A bold line names the person; the plain lines under it are that person's
// follow-ups until the next bold line.
const OWNER_LINE = /^\*\*(.+?)\*\*:?\s*$/;
// A trailing "(19:00)" locates the moment in the recording. Useful while
// reading the transcript, noise in a task list — the note already links to the
// full recording, so it comes off here.
const TRAILING_TIMESTAMP = /\s*\(\d{1,2}:\d{2}(?::\d{2})?\)\s*$/;
const MAX_ACTION_TEXT = 500;

export interface ParsedAction {
  ownerName: string | null;
  text: string;
}

export function parseActionItems(raw: string | null): ParsedAction[] {
  if (!raw) return [];
  const out: ParsedAction[] = [];
  let owner: string | null = null;

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const ownerMatch = OWNER_LINE.exec(trimmed);
    if (ownerMatch) {
      owner = ownerMatch[1].trim() || null;
      continue;
    }

    // Some meetings come back as a flat list with no speaker headings at all.
    // Those are real follow-ups with an unknown owner, not junk — keep them,
    // with a null owner, rather than dropping work on the floor.
    const text = trimmed
      .replace(/^[-*•]\s*/, '')
      .replace(TRAILING_TIMESTAMP, '')
      .trim();
    if (!text) continue;
    out.push({ ownerName: owner, text: text.slice(0, MAX_ACTION_TEXT) });
  }
  return out;
}

// Titles carry no identity and differ between systems: Fireflies heard
// "Maheswaran T" while the calendar invite said "Prof. Dr. T. Maheswaran".
const NAME_NOISE = new Set(['dr', 'prof', 'mr', 'mrs', 'ms', 'miss', 'shri', 'smt', 'the']);

export function nameTokens(value: string | null | undefined): string[] {
  if (!value) return [];
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1 && !NAME_NOISE.has(t));
}

/**
 * Which real person does a name in the transcript belong to?
 *
 * NEVER a guess, and never a near-miss. A candidate is accepted only when a
 * DISTINCTIVE token (4+ characters — enough to exclude initials and "the") is
 * shared, and only when EXACTLY ONE person in the meeting qualifies. Two
 * plausible people means nobody is chosen.
 *
 * "One person" is counted by profile id: the host who is also a Fireflies
 * participant appears twice in the candidate list and is still one person.
 *
 * The cost of being wrong is not a cosmetic one: it puts one person's
 * commitment on another person's list, and the other person never learns they
 * owed something. An unmatched owner costs a label that reads exactly as
 * Fireflies heard it, which a human can correct in one click.
 */
export function resolveOwnerProfileId(
  ownerName: string | null,
  people: Array<{ profileId: string | null; names: string[] }>,
): string | null {
  const wanted = nameTokens(ownerName).filter((t) => t.length >= 4);
  if (wanted.length === 0) return null;

  const hits = new Set<string>();
  for (const person of people) {
    if (!person.profileId) continue;
    const theirs = new Set(person.names.flatMap(nameTokens).filter((t) => t.length >= 4));
    if (wanted.some((t) => theirs.has(t))) hits.add(person.profileId);
  }

  return hits.size === 1 ? [...hits][0] : null;
}

// ── DUE DATES: AN EXPLICIT CALENDAR DATE, OR NOTHING ─────────────────────────
//
// "Follow up in two days" is relative to a moment nobody wrote down precisely,
// and "by Friday" could be either of two Fridays. A wrong due date is worse than
// none — it makes a task look late, or safely far away, when it is neither. So
// only a date a person actually said is used: "30 Sep", "30/09/2026",
// "September 30", "2026-09-30". Numeric dates are read day-first (the Indian
// convention) and must carry a four-digit year, because "3/4" is as likely to
// be a score as a date. Two different dates in one item mean nothing is set.

const MONTHS: Array<[RegExp, number]> = [
  [/^jan(?:uary)?$/i, 1],
  [/^feb(?:ruary)?$/i, 2],
  [/^mar(?:ch)?$/i, 3],
  [/^apr(?:il)?$/i, 4],
  // "may" in lower case is the verb ("we may 2x the intake"); the month is
  // written with a capital.
  [/^(?:May|MAY)$/, 5],
  [/^june?$/i, 6],
  [/^july?$/i, 7],
  [/^aug(?:ust)?$/i, 8],
  [/^sep(?:t|tember)?$/i, 9],
  [/^oct(?:ober)?$/i, 10],
  [/^nov(?:ember)?$/i, 11],
  [/^dec(?:ember)?$/i, 12],
];

const MONTH_WORD =
  '(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sep(?:t|tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)';
const ORDINAL = '(?:st|nd|rd|th)?';
const YEAR_TAIL = '(?:,?\\s+(\\d{4}))?';

// 30 Sep · 30th of September · 30 Sep 2026
const DAY_MONTH = new RegExp(
  `(?<![\\d/.-])\\b(\\d{1,2})${ORDINAL}\\s+(?:of\\s+)?${MONTH_WORD}\\b\\.?${YEAR_TAIL}\\b`,
  'gi',
);
// September 30 · Sep 30th, 2027
const MONTH_DAY = new RegExp(
  `\\b${MONTH_WORD}\\b\\.?\\s+(\\d{1,2})${ORDINAL}\\b${YEAR_TAIL}\\b(?![/.-]\\d)`,
  'gi',
);
// 30/09/2026 · 30-09-2026 · 30.09.2026
const NUMERIC_DMY = /(?<![\d/.-])\b(\d{1,2})([/.-])(\d{1,2})\2(\d{4})\b(?![/.-]\d)/g;
// 2026-09-30
const ISO_DATE = /(?<![\d/.-])\b(\d{4})-(\d{1,2})-(\d{1,2})\b(?![/.-]\d)/g;

function monthNumber(word: string): number | null {
  for (const [re, n] of MONTHS) if (re.test(word)) return n;
  return null;
}

function isoDate(y: number, m: number, d: number): string | null {
  if (y < 2000 || y > 2099 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  // 31 Feb rolls over to 3 Mar in Date — which is exactly the date nobody said.
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) {
    return null;
  }
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** The meeting's calendar day on campus (IST, UTC+05:30), as y/m/d. */
function campusDay(occurredAt: string | null): { y: number; m: number; d: number } | null {
  if (!occurredAt) return null;
  const t = new Date(occurredAt).getTime();
  if (Number.isNaN(t)) return null;
  const ist = new Date(t + (5 * 60 + 30) * 60_000);
  return { y: ist.getUTCFullYear(), m: ist.getUTCMonth() + 1, d: ist.getUTCDate() };
}

/**
 * A year-less "30 Sep" is the NEXT 30 Sep on or after the meeting day: a
 * follow-up agreed in a meeting is never due before that meeting. With no
 * meeting date there is nothing to anchor the year to, so nothing is set.
 */
function withInferredYear(m: number, d: number, occurredAt: string | null): string | null {
  const day = campusDay(occurredAt);
  if (!day) return null;
  const sameYear = isoDate(day.y, m, d);
  const meetingIso = isoDate(day.y, day.m, day.d);
  if (sameYear && meetingIso && sameYear >= meetingIso) return sameYear;
  return isoDate(day.y + 1, m, d);
}

/**
 * The due date written in one follow-up, as 'YYYY-MM-DD', or null.
 *
 * Null covers: no date at all, only a relative phrase, an impossible date, a
 * year-less date on a note with no meeting date, and two different dates.
 */
export function parseExplicitDueDate(text: string, occurredAt: string | null): string | null {
  if (!text) return null;
  const found = new Set<string>();
  let unreadable = false;

  const add = (value: string | null) => {
    if (value) found.add(value);
    else unreadable = true;
  };

  for (const m of text.matchAll(DAY_MONTH)) {
    const month = monthNumber(m[2]);
    if (!month) continue; // lower-case "may"
    const day = Number(m[1]);
    add(m[3] ? isoDate(Number(m[3]), month, day) : withInferredYear(month, day, occurredAt));
  }
  for (const m of text.matchAll(MONTH_DAY)) {
    const month = monthNumber(m[1]);
    if (!month) continue;
    const day = Number(m[2]);
    add(m[3] ? isoDate(Number(m[3]), month, day) : withInferredYear(month, day, occurredAt));
  }
  for (const m of text.matchAll(NUMERIC_DMY)) {
    add(isoDate(Number(m[4]), Number(m[3]), Number(m[1])));
  }
  for (const m of text.matchAll(ISO_DATE)) {
    add(isoDate(Number(m[1]), Number(m[2]), Number(m[3])));
  }

  // Something date-shaped we could not read (31 Feb, 13/13/2026) means the item
  // is not saying what we think it says. Set nothing rather than half of it.
  if (unreadable || found.size !== 1) return null;
  return [...found][0];
}

// ── A STORED NOTE, READ THE WAY THE FIREFLIES CLIENT READS A TRANSCRIPT ──────

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

/**
 * meeting_notes.raw holds the Fireflies payload verbatim. This reads the two
 * parts the follow-ups need — summary.action_items and meeting_attendees — with
 * the same normalisation lib/services/meetings/fireflies-client.ts applies at
 * ingest (trimmed, lower-cased, de-duplicated addresses; blanks dropped), so a
 * hand-linked note produces exactly what an auto-matched one would have.
 */
export function noteFollowupInputFromStored(note: {
  title: string | null;
  summary: string | null;
  occurred_at: string | null;
  duration_minutes: number | null;
  raw: unknown;
}): NoteFollowupInput {
  const raw = note.raw && typeof note.raw === 'object' ? (note.raw as Record<string, unknown>) : {};
  const summaryNode =
    raw.summary && typeof raw.summary === 'object' ? (raw.summary as Record<string, unknown>) : null;

  const participants: NoteFollowupInput['participants'] = [];
  const seen = new Set<string>();
  const attendees = Array.isArray(raw.meeting_attendees) ? raw.meeting_attendees : [];
  for (const entry of attendees) {
    if (!entry || typeof entry !== 'object') continue;
    const row = entry as Record<string, unknown>;
    const email = asString(row.email)?.toLowerCase();
    if (!email || seen.has(email)) continue;
    seen.add(email);
    participants.push({ email, displayName: asString(row.displayName) });
  }

  return {
    title: note.title,
    summary: note.summary,
    actionItemsRaw: summaryNode ? asString(summaryNode.action_items) : null,
    occurredAt: note.occurred_at,
    durationMinutes: note.duration_minutes,
    participants,
  };
}

// ── APPLYING A NOTE TO ITS BOOKING ───────────────────────────────────────────

type Person = { profileId: string | null; names: string[]; email: string | null };
type ProfileRow = { id: string; email: string | null; full_name: string | null };

/**
 * Turn a matched note into the things a person can act on.
 *
 * Runs ONCE per note, guarded by meeting_notes.action_items_applied_at. The
 * ingest is scheduled every half hour and re-reads the same transcripts on
 * purpose; without the guard each tick would add another copy of the same
 * follow-ups, and a task somebody deleted would reappear within thirty minutes.
 * After the stamp is set the machine never touches these rows again — they
 * belong to whoever edits them next. The same guard makes a hand-link that is
 * undone and redone a no-op the second time.
 *
 * Nothing here can fail the caller. A note that is stored but whose follow-ups
 * could not be applied is a smaller problem than a transcript we did not keep,
 * and the stamp is only written when the work actually succeeded, so the next
 * run retries it.
 */
export async function applyNoteToBooking(
  supabase: SupabaseClient,
  noteId: string,
  bookingId: string,
  note: NoteFollowupInput,
): Promise<void> {
  const { data: stamp } = await supabase
    .from('meeting_notes')
    .select('action_items_applied_at')
    .eq('id', noteId)
    .maybeSingle();

  if (!stamp || (stamp as { action_items_applied_at: string | null }).action_items_applied_at) {
    return;
  }

  // ── who was in the room, as real people ────────────────────────────────────
  // Matching is on EMAIL, which is exact, never on a name, which is not.
  // Fireflies attributes a follow-up to a display name; the participant list
  // maps that name to an address; the address identifies the person. The name
  // is only ever used to choose BETWEEN the people who were actually present.
  const emails = note.participants.map((x) => x.email).filter(Boolean);
  const people: Person[] = [];

  if (emails.length > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, email, full_name')
      .in('email', emails);

    const byEmail = new Map(
      ((profiles ?? []) as ProfileRow[])
        .filter((r) => r.email)
        .map((r) => [r.email!.toLowerCase(), r]),
    );

    for (const p of note.participants) {
      const profile = byEmail.get(p.email);
      people.push({
        profileId: profile?.id ?? null,
        names: [p.displayName, profile?.full_name ?? null].filter(Boolean) as string[],
        email: p.email,
      });
    }

    // Fill in the participant rows' profile_id, which the ingest has always
    // left null. Best-effort: a name on a card is worth less than the note.
    for (const person of people) {
      if (!person.profileId || !person.email) continue;
      await supabase
        .from('meeting_note_participants')
        .update({ profile_id: person.profileId })
        .eq('note_id', noteId)
        .eq('email', person.email);
    }
  }

  // ── the follow-ups, as tasks on the meeting ───────────────────────────────
  const actions = parseActionItems(note.actionItemsRaw);
  let applied = true;
  let inserted: Array<{ owner_profile_id: string | null }> = [];
  let hostProfileId: string | null = null;

  if (actions.length > 0) {
    const { data: booking } = await supabase
      .from('meeting_bookings')
      .select('host_profile_id, attendee_profile_id')
      .eq('id', bookingId)
      .maybeSingle();

    const b = booking as { host_profile_id: string | null; attendee_profile_id: string | null } | null;
    hostProfileId = b?.host_profile_id ?? null;

    // The booking's own host and attendee are MyJKKN identities — known for
    // certain, not inferred. They join the candidates on the same terms as the
    // participants: a name must still point at EXACTLY ONE of them.
    const bookingPeopleIds = [hostProfileId, b?.attendee_profile_id ?? null].filter(
      (id): id is string => Boolean(id),
    );
    if (bookingPeopleIds.length > 0) {
      const { data: bookingProfiles } = await supabase
        .from('profiles')
        .select('id, email, full_name')
        .in('id', bookingPeopleIds);
      for (const profile of (bookingProfiles ?? []) as ProfileRow[]) {
        if (!profile.full_name) continue;
        people.push({ profileId: profile.id, names: [profile.full_name], email: profile.email });
      }
    }

    // host_profile_id is NOT NULL on meeting_action_items and is who the task
    // hangs off. Without a host there is nothing to attach to, so the follow-ups
    // wait rather than being written somewhere arbitrary.
    if (hostProfileId) {
      const rows = actions.map((a) => ({
        booking_id: bookingId,
        host_profile_id: hostProfileId as string,
        action_text: a.text,
        decision_text: null,
        owner_label: a.ownerName,
        owner_profile_id: resolveOwnerProfileId(a.ownerName, people),
        due_date: parseExplicitDueDate(a.text, note.occurredAt),
        status: 'open' as const,
      }));

      const { error } = await supabase.from('meeting_action_items').insert(rows);
      if (error) {
        applied = false;
        logger.warn(MODULE, 'Stored the note but could not create its follow-ups', {
          noteId,
          error: error.message,
        });
      } else {
        inserted = rows;
      }
    } else {
      applied = false;
      logger.warn(MODULE, 'A matched booking has no host, so follow-ups were not created', {
        noteId,
        bookingId,
      });
    }
  }

  // ── the interview record, when this meeting is one ────────────────────────
  // Only ever FILLS IN a blank. A person who has written their own outcome has
  // said something the machine has not, and overwriting it would delete the
  // more valuable of the two.
  const { data: interview } = await supabase
    .from('hr_recruitment_interviews')
    .select('id, outcome_summary, duration_minutes')
    .eq('booking_id', bookingId)
    .maybeSingle();

  if (interview) {
    const patch: Record<string, unknown> = {};
    const row = interview as { outcome_summary: string | null; duration_minutes: number | null };
    if (!row.outcome_summary && note.summary) patch.outcome_summary = note.summary;
    if (row.duration_minutes == null && note.durationMinutes != null) {
      patch.duration_minutes = note.durationMinutes;
    }
    if (Object.keys(patch).length > 0) {
      const { error } = await supabase
        .from('hr_recruitment_interviews')
        .update(patch)
        .eq('id', (interview as { id: string }).id);
      if (error) {
        logger.warn(MODULE, 'Could not write the transcript into its interview record', {
          noteId,
          error: error.message,
        });
      }
    }
  }

  // ── tell each owner, once ─────────────────────────────────────────────────
  if (inserted.length > 0 && hostProfileId) {
    await notifyOwners(supabase, noteId, bookingId, hostProfileId, note.title, inserted);
  }

  // A note Fireflies has not summarised yet, and that produced nothing, is NOT
  // finished — it is early. Stamping it would block the summary Fireflies fills
  // in later from ever becoming follow-ups. A note that DID produce follow-ups
  // is stamped regardless, or the next tick would create them a second time.
  const unsummarisedAndEmpty = !note.summary && inserted.length === 0;

  if (applied && !unsummarisedAndEmpty) {
    await supabase
      .from('meeting_notes')
      .update({ action_items_applied_at: new Date().toISOString() })
      .eq('id', noteId);
  }
}

/**
 * One in-app bell per owner, per note — never to the host, who already sees
 * every follow-up on their own meeting. The idempotency key is enforced by the
 * notifications table's own unique index, so a retried run cannot bell twice.
 * A bell that fails is logged and forgotten: it must not undo the follow-ups.
 */
async function notifyOwners(
  supabase: SupabaseClient,
  noteId: string,
  bookingId: string,
  hostProfileId: string,
  title: string | null,
  items: Array<{ owner_profile_id: string | null }>,
): Promise<void> {
  const counts = new Map<string, number>();
  for (const item of items) {
    const owner = item.owner_profile_id;
    if (!owner || owner === hostProfileId) continue;
    counts.set(owner, (counts.get(owner) ?? 0) + 1);
  }

  const meeting = title ? `“${title}”` : 'a recent meeting';

  for (const [ownerId, count] of counts) {
    try {
      await createBellNotification(supabase, {
        recipientIds: [ownerId],
        createdBy: hostProfileId,
        title: count === 1 ? 'A follow-up is yours' : `${count} follow-ups are yours`,
        body:
          count === 1
            ? `From ${meeting}, one follow-up was put on your list.`
            : `From ${meeting}, ${count} follow-ups were put on your list.`,
        url: FOLLOWUPS_URL,
        category: BELL_CATEGORY,
        metadata: { note_id: noteId, booking_id: bookingId, item_count: count },
        idempotencyKey: `meetings:note-followup-owner:${noteId}:${ownerId}`,
      });
    } catch (error) {
      logger.warn(MODULE, 'Could not tell an owner about their follow-ups', {
        noteId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
