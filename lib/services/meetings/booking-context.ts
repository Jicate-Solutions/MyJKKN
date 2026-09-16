// lib/services/meetings/booking-context.ts
//
// What a visitor must say before they can take a long slot.
//
// WHY. Until 16 Sep 2026 a 15-minute chat and a 60-minute block asked for
// exactly the same three things: name, email, and one line of "what you'd like
// to cover". That line was required in the browser and nowhere else — the book
// route stored `note ? { note } : {}`, so a booking with no note at all was
// accepted — and a single character satisfied the browser. An hour of the
// host's day went the same way as a two-minute one.
//
// Director, 16 Sep: ask much more, and scale it by length.
//
// The rules live here, alone and pure, because THREE surfaces must agree on
// them: the booking page, the embedded widget, and the route that actually
// writes the row. A rule that lives in a form is a suggestion; only the route
// makes it true, and the forms exist so nobody meets the rule as an error.

/**
 * At or above this many minutes, a booking must answer the long form.
 *
 * 45 rather than 60 on purpose: a 45-minute slot costs the host most of an
 * hour once it is surrounded by the walk there and the thing it interrupts.
 */
export const LONG_MEETING_MIN = 45;

export interface ContextQuestion {
  /**
   * The key this answer is stored under in meeting_bookings.answers.
   *
   * `note` is deliberately first and deliberately named: the calendar event
   * description and the person-history service already read answers.note, and
   * renaming it would quietly empty both.
   */
  key: string;
  label: string;
  help: string;
  /** Minimum characters, after trimming. Below this the booking is refused. */
  minChars: number;
  placeholder: string;
}

const SHORT_FORM: ContextQuestion[] = [
  {
    key: 'note',
    label: 'What would you like to cover?',
    help: 'A sentence is enough.',
    minChars: 1,
    placeholder: 'What this is about',
  },
];

const LONG_FORM: ContextQuestion[] = [
  {
    key: 'note',
    label: 'What do you need from this meeting?',
    help: 'Name the outcome — a decision, an approval, advice, an introduction.',
    minChars: 60,
    placeholder: 'By the end of this meeting I need…',
  },
  {
    key: 'background',
    label: 'What has already been tried, decided or discussed?',
    help: 'Including who you have already spoken to.',
    minChars: 60,
    placeholder: 'So far…',
  },
  {
    key: 'why_this_long',
    label: 'Why does this need the full time rather than twenty minutes?',
    help: 'If a shorter meeting would do, book the shorter one.',
    minChars: 40,
    placeholder: 'It needs this long because…',
  },
];

/** The questions a booking of this length must answer. */
export function contextQuestionsFor(durationMin: number | null | undefined): ContextQuestion[] {
  const mins = typeof durationMin === 'number' && durationMin > 0 ? durationMin : 0;
  return mins >= LONG_MEETING_MIN ? LONG_FORM : SHORT_FORM;
}

/** True when a booking of this length has to answer the long form. */
export function isLongMeeting(durationMin: number | null | undefined): boolean {
  return contextQuestionsFor(durationMin) === LONG_FORM;
}

export type ContextCheck =
  | { ok: true; answers: Record<string, string> }
  | { ok: false; key: string; error: string };

/**
 * Check what the visitor wrote, and hand back exactly what should be stored.
 *
 * Trims, enforces the minimum, and drops anything that is not one of this
 * length's questions — a form the caller controls must not be able to write
 * arbitrary keys into a column the host's page renders.
 */
export function checkBookingContext(
  durationMin: number | null | undefined,
  raw: Record<string, unknown> | null | undefined,
): ContextCheck {
  const questions = contextQuestionsFor(durationMin);
  const source = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const answers: Record<string, string> = {};

  for (const q of questions) {
    const value = typeof source[q.key] === 'string' ? (source[q.key] as string).trim() : '';
    if (value.length < q.minChars) {
      return {
        ok: false,
        key: q.key,
        error:
          q.minChars <= 1
            ? `Please answer: ${q.label}`
            : `Please say a little more about "${q.label}" — at least ${q.minChars} characters, so the meeting can be prepared for.`,
      };
    }
    // 2,000 rather than the old 500: three real answers do not fit in 500, and
    // the column is jsonb.
    answers[q.key] = value.slice(0, 2000);
  }

  return { ok: true, answers };
}

/** Friendly label for a stored key, for the host's own screens. */
export function contextLabelFor(key: string): string {
  const known = [...LONG_FORM, ...SHORT_FORM].find((q) => q.key === key);
  if (known) return known.label;
  // Unknown keys come from the older routed-booking form, whose keys ARE the
  // questions. Show them as they were written.
  return key;
}
