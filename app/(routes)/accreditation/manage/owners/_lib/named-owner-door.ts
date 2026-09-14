/**
 * Who may open the owner desk, and what they may be told once it opens.
 *
 * ─── The door ──────────────────────────────────────────────────────────────
 * /accreditation/manage/owners is the ONLY screen that calls
 * fn_accreditation_assign_metric_owner, and that function has a deliberate
 * second entitlement branch: a caller holding the body-level row
 * (metric_code IS NULL) for an institution+body may assign metric owners inside
 * it WITHOUT accreditation.naac.narrative.manage. That branch is Director
 * decision 2 of 2026-09-08 — a body owner may delegate inside their own body
 * and remains accountable for what they delegated.
 *
 * The page gated itself on the permission keys alone, and on 2026-09-09 seven
 * of the fourteen live body owners held NEITHER key: their role is `faculty`,
 * and no role grants faculty accreditation.naac.narrative.view (the nine roles
 * that carry it are accreditation_officer, ceo, coo, hod, managing_director,
 * principal, registrar, vice_principal). So half the roster met the
 * access-denied card on the one screen that could exercise the right the
 * database had already granted them. It is the same mistake the earlier .manage
 * gate made with the 102 HODs and 10 principals, one rung further down: the
 * widening to .view reached hod/principal and stopped there.
 *
 * BEING NAMED IS THE ENTITLEMENT. Assignment is ownership (Director,
 * 2026-09-08) — there is no Accept step and 'pending' only records that the
 * person has not opened their page yet — so holding a row IS the reason to be
 * here, and no permission key can be the thing that decides it.
 *
 * ─── What they may be told ─────────────────────────────────────────────────
 * A viewer who got in this way reads the table under RLS, and
 * `accred_metric_owners_select` gives them their own rows plus (from migration
 * 20261127090000) the rows inside a body they own. It does NOT give them the
 * other bodies at their campus. Rendering the whole desk to them would print
 * "NIRF — Nobody yet" over a NIRF owner who exists and is simply invisible to
 * them, and a per-body tally counting bodies they cannot read. A denied read
 * must never be rendered as a factual claim — the same rule the campus-scope
 * guard on this page already enforces — so the desk narrows to the bodies they
 * are named on, and says so.
 *
 * Pure, and in its own module, because importing the page pulls the Supabase
 * client in at module scope and that cannot load under vitest.
 */

import type { InstitutionBodyScope } from '../../../_lib/institution-body-scope';
import { isBodyInScope } from '../../../_lib/institution-body-scope';

/** The shape this module needs from an `accreditation_metric_owners` row. */
export interface NamedOwnerRow {
  institution_id: string;
  body_code: string;
  metric_code: string | null;
  programme_id: string | null;
  owner_user_id: string;
  assignment_status: 'pending' | 'confirmed' | 'declined';
}

/**
 * Is this person named anywhere on the accreditation desk?
 *
 * DECLINED ROWS COUNT, on purpose. fn_accreditation_acknowledge_ownership
 * accepts 'confirmed' from a declined row with no state guard, so declining is
 * answerable — and shutting a declined owner out of the page would strand
 * anyone who declined by accident on the wrong side of the very door this
 * function exists to open. Declining still stops the mail; it does not revoke
 * the right to look.
 *
 * Metric-level rows count too. There are none in production today, but the
 * delegation this fix unblocks creates them, and a delegate who holds only a
 * metric row needs the same door to answer (or decline) what they were handed.
 * Whether they may in turn DELEGATE is a separate question with a separate
 * answer — see `bodiesOwnedAt`.
 *
 * `rows` must already be the viewer's own rows. RLS alone is not that filter:
 * once a body owner can read the rows inside a body they own, an unfiltered
 * read answers "can I see something" rather than "am I named".
 */
export function isNamedOwner(
  rows: readonly NamedOwnerRow[],
  userId: string | null,
): boolean {
  if (!userId) return false;
  return rows.some((r) => r.owner_user_id === userId);
}

/**
 * The awarding bodies this person is named on at ONE campus — the bodies the
 * desk may make claims about when it opened for them by name alone.
 *
 * Any row counts here, body-level or metric-level: a metric-level delegate has
 * a legitimate reason to see that body's page, and the counts they then read
 * are the counts for a body they hold a piece of.
 */
export function bodiesNamedOnAt(
  rows: readonly NamedOwnerRow[],
  userId: string | null,
  institutionId: string | null,
): string[] {
  if (!userId || !institutionId) return [];
  const bodies = new Set<string>();
  for (const r of rows) {
    if (r.owner_user_id === userId && r.institution_id === institutionId) {
      bodies.add(r.body_code);
    }
  }
  return [...bodies].sort();
}

/**
 * The bodies this person may DELEGATE inside at one campus.
 *
 * Deliberately stricter than `bodiesNamedOnAt`: body-level only (a metric
 * delegate holds one metric, not the body) and never a declined row (somebody
 * who has said the body is not theirs is not the person to hand pieces of it
 * around). These are exactly the conditions fn_accreditation_assign_metric_owner
 * checks server-side, restated here only to decide what to DRAW — the function
 * takes the caller from auth.uid() and cannot be widened from the browser.
 */
export function bodiesOwnedAt(
  rows: readonly NamedOwnerRow[],
  userId: string | null,
  institutionId: string | null,
): string[] {
  if (!userId || !institutionId) return [];
  const bodies = new Set<string>();
  for (const r of rows) {
    if (
      r.owner_user_id === userId &&
      r.institution_id === institutionId &&
      r.metric_code === null &&
      r.programme_id === null &&
      r.assignment_status !== 'declined'
    ) {
      bodies.add(r.body_code);
    }
  }
  return [...bodies].sort();
}

/**
 * The scope the page may count and list against.
 *
 * For a viewer holding a permission key this is the campus's own scope,
 * unchanged. For a viewer who got in by being named it is the intersection of
 * "bodies I am named on" with "bodies this campus answers to" — so a body the
 * campus has since stopped answering to does not reappear just because an old
 * row survives, and a body they are named on but cannot read is never counted.
 *
 * Returned as an InstitutionBodyScope so the SAME value feeds
 * filterMetricsToScope and bodiesForScope. That is what keeps the denominator
 * moving with the list: narrowing only what is drawn would leave "of 107" in
 * place over a table showing 17.
 */
export function claimableScope(
  campusScope: InstitutionBodyScope,
  narrowTo: readonly string[] | null,
): InstitutionBodyScope {
  if (!narrowTo) return campusScope;
  return {
    kind: 'known',
    bodies: [...new Set(narrowTo)].filter((b) => isBodyInScope(campusScope, b)).sort(),
  };
}

/**
 * The one sentence printed above a desk that narrowed itself because the
 * viewer is named rather than permitted. It replaces `scopeSentence`, which
 * would describe the campus's full body list over a table showing part of it.
 *
 * No count of metrics and no claim about how full the desk is — both rot. It
 * says which bodies are in view and, plainly, that the rest is not visible
 * rather than empty.
 */
export function namedOwnerScopeSentence(
  bodies: readonly string[],
  institutionName: string | null,
): string {
  const who = institutionName ?? 'this campus';
  if (bodies.length === 0) {
    return (
      `You are on this page because you are named as an accreditation owner, ` +
      `but not for any awarding body at ${who}. Choose the campus you were ` +
      `named for, or ask IQAC which one it is.`
    );
  }
  const one = bodies.length === 1;
  return (
    `Showing the ${one ? 'awarding body' : `${bodies.length} awarding bodies`} you ` +
    `are named on at ${who}: ${bodies.join(', ')}. The rest of this campus's ` +
    `desk is not visible to you — that is a limit on what you may read, not a ` +
    `statement that nobody owns it.`
  );
}
