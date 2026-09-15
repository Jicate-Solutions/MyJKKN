/**
 * Permissions Audit — gates that are real but are NOT permission keys.
 *
 * The page-access lens resolves most surfaces from `MENU_PERMISSIONS` and from
 * `canAccess('module','action')` / `<PermissionGuard module action>` calls it
 * finds in source. A minority of surfaces are gated on something the static
 * extractor can see the NAME of but not the MEANING of: a React Query hook
 * wrapping a SECURITY DEFINER RPC, a membership lookup, a policy table.
 *
 * The canonical example, and the reason this file exists: the HR Time Off
 * **Approvals** tab. `app/(routes)/hr/leave/_components/time-off-tabs.tsx`
 * appends that tab only when `useCanApproveLeave()` resolves true. There is no
 * permission key anywhere in that file, so every key-centric audit surface
 * reports the tab as ungated — while in production only super admins and the
 * holders of `hr.leave.approve` can see it.
 *
 * ── The contract ──────────────────────────────────────────────────────────
 *
 * An entry here is a CLAIM that a named gate resolves to a named permission
 * key, and the lens will render a role list on the strength of it. So:
 *
 *   - `mirrors` is filled ONLY after reading the RPC body in
 *     supabase/migrations and confirming the predicate. The `note` must say
 *     where that was read, so the next person can re-check it rather than
 *     trust it.
 *   - `mirrors: null` is a first-class, CORRECT answer. Per-record gates
 *     (`useCanFinalizeLeave(applicationId)`) and config-driven gates
 *     (`fn_mess_special_day_can_propose` reads a platform_policies row) have
 *     no role answer that is true for every row or every deployment. The UI
 *     names the mechanism and says the roles cannot be determined statically.
 *     That is the honest output; inventing a list would be worse than none.
 *   - A hook NOT listed here is not an error. The extractor still records it,
 *     and the UI still shows "gate not statically resolvable" with the hook
 *     named — visible, not silently dropped. Adding a line here upgrades that
 *     to a resolved role list; nothing breaks in the meantime.
 *
 * Keep this list short. If it starts growing past a couple of dozen entries,
 * the real fix is to move those gates onto permission keys, not to document
 * more exceptions.
 */

export interface NonKeyGateDefinition {
  /**
   * The permission key this gate resolves to, when the RPC's predicate is a
   * `user_has_permission('<key>')` check that has been read and verified.
   * `null` when the gate is per-record, config-driven, or otherwise has no
   * single role answer.
   */
  mirrors: string | null;
  /**
   * One line an auditor can act on: what the gate actually asks, and where
   * that was verified. Rendered verbatim in the lens.
   */
  note: string;
}

/**
 * Hook name → what it really gates.
 *
 * Keyed by the bare hook identifier because that is what the extractor sees at
 * the call site (`const { data: canApprove } = useCanApproveLeave()`).
 */
export const NON_KEY_GATES: Readonly<Record<string, NonKeyGateDefinition>> =
  Object.freeze({
    // ── Resolvable: the RPC's predicate IS a permission-key check ──────────

    useCanApproveLeave: {
      mirrors: 'hr.leave.approve',
      note:
        "hr_can_approve_leave() = is_super_admin() OR (user_has_permission('hr.leave.approve') " +
        'AND the caller belongs to at least one HR organization). Verified in ' +
        'supabase/migrations/20260722140000_hr_can_approve_leave_rpc.sql. A key holder with no ' +
        'hr_organization still sees nothing, so treat this list as the upper bound.',
    },

    // ── Not resolvable: per-record gates ──────────────────────────────────
    // These take a row id and answer for THAT row. No role list is true for
    // every row, so the lens names the mechanism and stops there.

    useCanFinalizeLeave: {
      mirrors: null,
      note:
        'fn_hr_leave_can_finalize(p_application_id) answers per application — it runs ' +
        'fn_leave_step_admits against that request’s frozen approval chain, so the answer ' +
        'depends on the row, not on the role alone.',
    },
    useCanDecideCancellation: {
      mirrors: null,
      note:
        'ReceiptCancelFlowService.canDecide(requestId) answers per cancellation request, ' +
        'against the approver flow configured for that request’s institution.',
    },
    useCanManageEventFeedback: {
      mirrors: null,
      note:
        'EventFeedbackService.canManage(eventId) answers per event — it asks whether the ' +
        'caller coordinates THAT event, which is a row in the event’s own tables, not a key.',
    },
    useCanRate: {
      mirrors: null,
      note:
        'canRate({ profileId, menu }) answers per menu cell — it combines the resident’s mess ' +
        'tier with the rating window for that meal. Neither is a permission key.',
    },

    // ── Not resolvable: config-driven gates ───────────────────────────────
    // The answer lives in a data row an administrator edits, not in code.

    useCanPropose: {
      mirrors: null,
      note:
        "fn_mess_special_day_can_propose() admits super admins and admins, then matches the " +
        "caller’s role_key against the platform_policies row " +
        "'mess.choose.special_day.proposer_roles'. That is a live list of ROLE KEYS in data, " +
        'not a permission key — read it from platform_policies to see who qualifies. ' +
        'Verified in supabase/migrations/20260623001000_mess_choose_mode_c_special_day_rpcs.sql.',
    },
    useIsCancellationApprover: {
      mirrors: null,
      note:
        'Asks whether the caller is a configured approver for any institution — a row in the ' +
        'receipt cancellation flow config, not a permission grant.',
    },
  });

/**
 * Look up a gate hook. Returns `undefined` for hooks that are not gates at all
 * (the extractor is deliberately permissive about what it collects) and for
 * gates nobody has documented yet — callers must treat both as "unknown", not
 * as "ungated".
 */
export function getNonKeyGate(hook: string): NonKeyGateDefinition | undefined {
  return NON_KEY_GATES[hook];
}

/**
 * Identifiers matching the extractor's gate-hook shape that are NOT gates.
 *
 * `use(Can|Is|Has)[A-Z]\w*` is a good heuristic for "this hook answers a
 * yes/no authority question", but it also catches ordinary data hooks that
 * merely start with those letters — `useCandidates`, `useCandidate`,
 * `useCandidateOwners`, `useCandidatesForJob`, `useCancel*` mutations. Listing
 * them here keeps them out of the lens instead of printing a dozen phantom
 * "code-gated" badges on the Recruitment pages.
 */
export const NON_GATE_HOOK_PREFIXES: readonly string[] = Object.freeze([
  'useCancel', // useCancelReservation, useCancelPO, useCancelMeeting, …
  'useCandidate', // useCandidates, useCandidateOwners, useCandidatesForJob, …
]);

/** True when an identifier matches the gate shape but is really a data hook. */
export function isNonGateHook(hook: string): boolean {
  return NON_GATE_HOOK_PREFIXES.some((prefix) => hook.startsWith(prefix));
}
