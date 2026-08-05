// ============================================================================
// The five not-green rules — presentation half.
//
// The rules THEMSELVES are computed in SQL (fn_director_handover_board, migration
// 20260811130000) so no consumer can invent a private idea of red. Nothing here
// re-derives a rule; this file only decides what each SQL-computed reason is
// CALLED and what colour it is drawn in. (The nightly chase engine does NOT read
// that function today — checked, not assumed; see page.tsx.)
//
// The five are kept apart on purpose. They are not five flavours of "late" —
// the Director's next move is different for each one, and collapsing them into a
// single amber bucket destroys exactly the information he opened the page for:
//
//   overdue        the date has passed          -> chase the person
//   quiet          nothing for 7 days           -> ask what's happening
//   never_accepted nobody has said yes yet      -> reassign it
//   owner_gone     the person has left          -> reassign it now
//   no_access      the door never opened        -> hand it over again, higher
//
// `no_access` was added on 2026-08-05. It is the one rule whose absence made the
// other four lie: a handover whose keys its access level does not cover grants
// nothing, and the board used to draw it green for a week and then call it
// "gone quiet" — which reads as "he is ignoring me" when the truth is "he was
// never let in". 207 of 860 MENU_PERMISSIONS keys grant nothing at the DEFAULT
// level, so this was the common case, not the corner.
// ============================================================================

export type NotGreenReason =
  | 'owner_gone'
  | 'no_access'
  | 'overdue'
  | 'never_accepted'
  | 'quiet';

export interface NotGreenRule {
  reason: NotGreenReason;
  /** Short label on the row's chip. */
  label: string;
  /** What the Director does about it. Shown next to the count. */
  action: string;
  /** One line explaining why the row is flagged. */
  describe: (row: HandoverBoardRow) => string;
  /** Chip / border classes. Each rule gets its own colour — never a shared amber. */
  chipClass: string;
  cardClass: string;
  dotClass: string;
}

export interface HandoverBoardRow {
  id: string;
  route: string;
  title: string;
  note: string | null;
  permission_keys: string[];
  access_level: 'watch' | 'update' | 'full';
  status: 'pending' | 'accepted' | 'expired' | 'orphaned';
  grantee_user_id: string;
  grantee_name: string;
  grantee_email: string | null;
  grantee_is_active: boolean;
  institution_id: string | null;
  due_date: string;
  days_remaining: number;
  created_at: string;
  responded_at: string | null;
  /** Anyone's activity, the Director's own nudges included. Not the quiet clock. */
  last_activity_at: string;
  /**
   * The last thing the GRANTEE did — the only signal the quiet rule reads, and
   * the one `days_quiet` counts from. Separate from `last_activity_at` because
   * the nudge button writes that column, and a Director must not be able to
   * clear "gone quiet" by talking to himself.
   */
  last_grantee_activity_at: string;
  days_quiet: number;
  last_note: string | null;
  is_live: boolean;
  not_green_reason: NotGreenReason | null;
  not_green_reasons: NotGreenReason[];
}

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

// Order here IS the urgency order the SQL uses for `not_green_reason`, and the
// order the counts strip renders in. Keep the two in step.
export const NOT_GREEN_RULES: NotGreenRule[] = [
  {
    reason: 'owner_gone',
    label: 'Owner gone',
    action: 'Reassign now',
    describe: (r) =>
      `${r.grantee_name}'s account is no longer active. Access was cut automatically — nobody is working on this.`,
    chipClass:
      'border-purple-300 bg-purple-100 text-purple-900 dark:border-purple-800 dark:bg-purple-950 dark:text-purple-200',
    cardClass: 'border-l-4 border-l-purple-500',
    dotClass: 'bg-purple-500'
  },
  {
    reason: 'no_access',
    label: 'The door never opened',
    action: 'Hand it over again',
    describe: (r) =>
      `${r.grantee_name} cannot open ${r.route}. Nothing on this item unlocks — the access level it was sent at (${r.access_level}) does not cover the permission it names, or that permission is one no handover may cross. Hand the same page over again at a level that covers it.`,
    chipClass:
      'border-sky-300 bg-sky-100 text-sky-900 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-200',
    cardClass: 'border-l-4 border-l-sky-500',
    dotClass: 'bg-sky-500'
  },
  {
    reason: 'overdue',
    label: 'Past its date',
    action: 'Chase it',
    describe: (r) => {
      const late = Math.abs(r.days_remaining);
      return `Was due ${r.due_date} — ${late} ${plural(late, 'day', 'days')} ago, and still open.`;
    },
    chipClass:
      'border-red-300 bg-red-100 text-red-900 dark:border-red-800 dark:bg-red-950 dark:text-red-200',
    cardClass: 'border-l-4 border-l-red-500',
    dotClass: 'bg-red-500'
  },
  {
    reason: 'never_accepted',
    label: 'Never accepted',
    action: 'Reassign it',
    describe: (r) =>
      `Handed over more than 48 hours ago and ${r.grantee_name} has not said yes or no.`,
    chipClass:
      'border-orange-300 bg-orange-100 text-orange-900 dark:border-orange-800 dark:bg-orange-950 dark:text-orange-200',
    cardClass: 'border-l-4 border-l-orange-500',
    dotClass: 'bg-orange-500'
  },
  {
    reason: 'quiet',
    label: 'Gone quiet',
    action: 'Ask what is happening',
    // Names the person on purpose. The clock counts only what the GRANTEE has
    // done — your own nudges do not appear in this number and do not reset it.
    describe: (r) =>
      `Nothing from ${r.grantee_name} for ${r.days_quiet} ${plural(r.days_quiet, 'day', 'days')}. Your own nudges do not count towards this.`,
    chipClass:
      'border-amber-300 bg-amber-100 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200',
    cardClass: 'border-l-4 border-l-amber-500',
    dotClass: 'bg-amber-500'
  }
];

export const RULE_BY_REASON: Record<NotGreenReason, NotGreenRule> = NOT_GREEN_RULES.reduce(
  (acc, rule) => {
    acc[rule.reason] = rule;
    return acc;
  },
  {} as Record<NotGreenReason, NotGreenRule>
);

export const ACCESS_LEVEL_LABEL: Record<HandoverBoardRow['access_level'], string> = {
  watch: 'Watch only',
  update: 'Can move it along',
  full: 'Full run of it'
};

/**
 * A closed-by-sweep row (expired / orphaned) is on the desk but its door is
 * already shut, and the spine's lifecycle RPCs refuse to touch it. The page uses
 * this to disable the buttons rather than let the Director click into an error.
 */
export function isActionable(row: HandoverBoardRow): boolean {
  return row.status === 'pending' || row.status === 'accepted';
}
