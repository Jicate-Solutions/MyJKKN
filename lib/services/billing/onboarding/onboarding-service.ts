import { createClientSupabaseClient } from '@/lib/supabase/client';
import type { LearnerProfile } from '@/types/learner-profile';
import type {
  AccountTransitionDocumentEntry,
  AccountTransitionResult,
} from '@/types/admission';
import { AccountTransitionService } from '@/lib/services/admission/account-transition-service';
import { AdmissionSettingsService } from '@/lib/services/admission/admission-settings-service';
import { FeeChangeEventService } from '@/lib/services/admission/fee-change-event-service';
import { getErrorMessage } from '@/lib/utils';
import { describeOncePerLearnerError } from '@/lib/utils/billing-duplicate-error';
import { attachInstalmentSchedules } from '@/lib/services/billing/instalments/instalment-plan-service';
// FEE_STRUCTURE_CONFIG removed 2026-04-15 — dynamic fee_items flow replaces it.

// ============================================
// ONBOARDING SERVICE
// ============================================
// Created: 2026-04-06
// Purpose: Bridges admission → billing.
//   - markAsAccount: validates finance fields, transitions lifecycle_status
//     from 'approved' → 'account', auto-generates bills from profile fees.
//   - getOnboardingLearners: accounts-team view of learners in 'account' status.
//   - markAsApproved: transitions 'account' → 'active' when fully paid.
//   - revertToApproved: deletes unpaid bills, reverts 'account' → 'approved'.
// ============================================

// ─── Interfaces ───────────────────────────────────────────────────────────────

export interface OnboardingBillSummary {
  id: string;
  bill_description: string;
  final_amount: number;
  balance_amount: number;
  status: string;
  due_date: string;
}

export interface OnboardingLearner extends LearnerProfile {
  // Computed billing summary
  total_fees: number;
  total_paid: number;
  total_balance: number;
  /** Calendar days since lifecycle_status became 'account' (approximated from updated_at) */
  days_pending: number;
  bills: OnboardingBillSummary[];
}

export type PaymentStatus = 'unpaid' | 'partially_paid' | 'fully_paid';
export type BillStatus = 'generated' | 'not_generated';
export type OnboardingLifecycleStatus = 'account' | 'admitted' | 'reserved';

export const ONBOARDING_LIFECYCLE_STATUSES: OnboardingLifecycleStatus[] = [
  'account', 'admitted', 'reserved',
];

export interface OnboardingFilters {
  search?: string;           // matches name, email, phone, application_id
  institution_id?: string;
  degree_id?: string;
  department_id?: string;
  program_id?: string;
  lifecycle_status?: OnboardingLifecycleStatus;
  // NOTE: semester/section filters intentionally absent — onboarding cohort is
  // by design first-semester-only (newly admitted learners), so filtering by
  // them is meaningless. If multi-semester onboarding is ever introduced,
  // re-add semester_id/section_id here and the corresponding .eq() clauses.
  payment_status?: PaymentStatus;
  // Computed from joined bills — 'generated' = bills.length > 0, 'not_generated' = bills.length === 0.
  // Filtered post-fetch (same path as payment_status).
  bill_status?: BillStatus;
  page?: number;             // 1-based, default 1
  limit?: number;            // default 20
  sortBy?: keyof LearnerProfile;
  sortDirection?: 'asc' | 'desc';
}

export interface OnboardingListResponse {
  data: OnboardingLearner[];
  metadata: {
    total: number;
    page: number;
    limit: number;
    total_pages: number;
  };
}

export interface ValidationResult {
  valid: true;
}

export interface ValidationFailure {
  valid: false;
  missing: string[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Human-readable bill descriptions for each finance field */
const BILL_DESCRIPTIONS: Record<string, string> = {
  application_fee: 'Application Fee',
  university_reg_fee: 'University Registration Fee',
  tuition_fee: 'Tuition Fee',
  hostel_fee: 'Hostel Fee',
  uniform_fee: 'Uniform Fee',
  hospital_training_fee: 'Hospital Training Fee',
  placement_fee: 'Placement Fee',
  transport_fee: 'Transport Fee',
};

/** Order in which bills are generated */
const BILL_FIELD_ORDER = [
  'application_fee',
  'university_reg_fee',
  'tuition_fee',
  'hostel_fee',
  'uniform_fee',
  'hospital_training_fee',
  'placement_fee',
  'transport_fee',
] as const;

function computePaymentStatus(
  totalFees: number,
  totalBalance: number
): PaymentStatus {
  if (totalBalance <= 0) return 'fully_paid';
  if (totalBalance < totalFees) return 'partially_paid';
  return 'unpaid';
}

function daysSince(dateStr: string): number {
  const then = new Date(dateStr).getTime();
  const now = Date.now();
  return Math.floor((now - then) / (1000 * 60 * 60 * 24));
}

// ─── Service ──────────────────────────────────────────────────────────────────

export class OnboardingService {
  private static supabase = createClientSupabaseClient();

  // ── 1. getOnboardingLearners ─────────────────────────────────────────────

  static async getOnboardingLearners(
    filters: OnboardingFilters = {}
  ): Promise<OnboardingListResponse> {
    const {
      search,
      institution_id,
      degree_id,
      department_id,
      program_id,
      lifecycle_status,
      payment_status,
      bill_status,
      page = 1,
      limit = 20,
      sortBy = 'updated_at',
      sortDirection = 'desc',
    } = filters;

    try {
      const supabase = this.supabase as any;

      let query = supabase
        .from('learners_profiles')
        .select(
          `
          *,
          institution:institutions(id, name),
          degree:degrees(id, degree_name),
          department:departments(id, department_name),
          program:programs(id, program_name),
          bills:billing_student_bills(
            id,
            bill_description,
            final_amount,
            balance_amount,
            status,
            due_date
          )
          `,
          { count: 'exact' }
        )
        .in('lifecycle_status', lifecycle_status
          ? [lifecycle_status]
          : ONBOARDING_LIFECYCLE_STATUSES
        );

      // Academic filters (Institution → Degree → Department → Programme).
      // Onboarding cohort is first-semester-only, so semester/section omitted.
      if (institution_id) query = query.eq('institution_id', institution_id);
      if (degree_id) query = query.eq('degree_id', degree_id);
      if (department_id) query = query.eq('department_id', department_id);
      if (program_id) query = query.eq('program_id', program_id);

      // Search across name, email, phone, application_id
      if (search && search.trim()) {
        const term = search.trim();
        query = query.or(
          [
            `first_name.ilike.%${term}%`,
            `last_name.ilike.%${term}%`,
            `student_email.ilike.%${term}%`,
            `student_mobile.ilike.%${term}%`,
            `application_id.ilike.%${term}%`,
          ].join(',')
        );
      }

      // Sorting
      query = query.order(sortBy as string, { ascending: sortDirection === 'asc' });

      // DB-level pagination — only when no computed filter is set.
      // payment_status and bill_status are both derived from joined bill rows,
      // so they must be filtered post-fetch; that path paginates in memory below.
      const offset = (page - 1) * limit;
      const requiresPostFilter = !!(payment_status || bill_status);
      if (!requiresPostFilter) {
        query = query.range(offset, offset + limit - 1);
      }

      const { data: rawData, error, count } = await query;

      if (error) throw error;

      // Map rows → OnboardingLearner; compute totals from joined bills.
      const mapped: OnboardingLearner[] = (rawData ?? []).map((row: any) => {
        const bills: OnboardingBillSummary[] = (row.bills ?? []).map((b: any) => ({
          id: b.id,
          bill_description: b.bill_description,
          final_amount: Number(b.final_amount ?? 0),
          balance_amount: Number(b.balance_amount ?? 0),
          status: b.status,
          due_date: b.due_date,
        }));

        const total_fees = bills.reduce((s, b) => s + b.final_amount, 0);
        const total_balance = bills.reduce((s, b) => s + b.balance_amount, 0);
        const total_paid = total_fees - total_balance;

        return {
          ...row,
          bills,
          total_fees,
          total_paid,
          total_balance,
          days_pending: daysSince(row.updated_at),
        };
      });

      if (requiresPostFilter) {
        // Post-filter on computed fields, then paginate in memory.
        // `count` from Supabase reflects pre-filter total, so it's unusable here.
        let filtered = mapped;
        if (payment_status) {
          filtered = filtered.filter(
            (l) =>
              computePaymentStatus(l.total_fees, l.total_balance) === payment_status
          );
        }
        if (bill_status) {
          filtered = filtered.filter((l) =>
            bill_status === 'generated' ? l.bills.length > 0 : l.bills.length === 0
          );
        }
        const total = filtered.length;
        return {
          data: filtered.slice(offset, offset + limit),
          metadata: {
            total,
            page,
            limit,
            total_pages: Math.max(1, Math.ceil(total / limit)),
          },
        };
      }

      // No computed filter — DB-level pagination already applied.
      const total = count ?? 0;
      return {
        data: mapped,
        metadata: {
          total,
          page,
          limit,
          total_pages: Math.max(1, Math.ceil(total / limit)),
        },
      };
    } catch (error) {
      console.error('[billing/onboarding] getOnboardingLearners failed:', error);
      throw error;
    }
  }

  // ── 2. validateFinanceFields ─────────────────────────────────────────────

  static validateFinanceFields(
    learner: LearnerProfile
  ): ValidationResult | ValidationFailure {
    // Updated: 2026-04-15 - Dynamic fee_items replace preset validation.
    // A learner is valid for onboarding when they have at least one fee_item
    // with a positive amount, OR (legacy) fee_structure_type + tuition_fee set.
    const missing: string[] = [];

    const feeItems = Array.isArray((learner as any).fee_items)
      ? ((learner as any).fee_items as Array<{
          category_id?: string;
          amount?: number;
        }>)
      : [];
    const hasValidFeeItems = feeItems.some(
      (it) => it?.category_id && Number(it?.amount) > 0
    );

    if (hasValidFeeItems) {
      return { valid: true };
    }

    // Legacy validation fallback
    if (!learner.fee_structure_type) {
      missing.push('fee_items (or legacy fee_structure_type)');
    }
    if (!learner.tuition_fee || learner.tuition_fee <= 0) {
      missing.push('fee_items (or legacy tuition_fee)');
    }

    return missing.length > 0
      ? { valid: false, missing }
      : { valid: true };
  }

  // ── 3. createBillsFromProfile ────────────────────────────────────────────

  /**
   * Creates billing_student_bills rows from learner.fee_items (or legacy fields).
   * Returns the number of bills inserted (0 if learner already has bills, or if
   * no billable fee data exists). Idempotent — calling twice is a no-op the
   * second time because the bill-existence guard skips already-billed learners.
   *
   * CUTOVER HISTORY — read before re-adding an accommodation check here.
   * 2026-06-06 this method skipped hostellers entirely, mirroring the same guard
   * in `admission_account_transition_with_bills`, because Campus Living
   * (campus_living_generate_hostel_year_bills) also emitted academic bills and
   * the two would double-bill: the Campus Living dedup keys on hostel_year_id
   * and cannot bridge a NULL one written from here.
   * 2026-06-21 that academic branch was REMOVED from Campus Living — core
   * academic fees now come from admission_fee_structures for EVERYONE.
   * 2026-07-25 the paired skip here was retired. Leaving it in place had
   * stranded 17 hostellers (Rs 27,36,500) with resolved fee_items and zero
   * bills — silent, because every admission screen showed a complete structure.
   *
   * What replaces it: hostel / mess / transport CATEGORIES are skipped for
   * every learner, hosteller or day scholar, since Campus Living owns
   * hostel+mess and TMS owns transport. Only a POSITIVE kind match is skipped,
   * so a fee with an unmapped or inactive category is still billed rather than
   * silently dropped.
   */
  static async createBillsFromProfile(learnerId: string): Promise<number> {
    try {
      const supabase = this.supabase as any;

      // Fetch learner
      const { data: learner, error: fetchError } = await supabase
        .from('learners_profiles')
        .select('*')
        .eq('id', learnerId)
        .single();

      if (fetchError) throw fetchError;
      if (!learner) throw new Error(`Learner ${learnerId} not found`);

      // Idempotency guard — if learner already has bills, do nothing.
      // Bulk-generate flows rely on this to skip already-billed learners.
      const { count: existingBillCount, error: countError } = await supabase
        .from('billing_student_bills')
        .select('id', { count: 'exact', head: true })
        .eq('student_id', learnerId);
      if (countError) throw countError;
      if ((existingBillCount ?? 0) > 0) {
        return 0;
      }

      // Get current user for created_by
      const { data: userData } = await supabase.auth.getUser();
      const currentUserId = userData?.user?.id ?? null;

      // Fetch billing categories (global, no institution filter as of 2026-04-28)
      const { data: itemCategories, error: categoryError } = await supabase
        .from('billing_categories')
        .select('id, category_name, kind')
        .eq('is_active', true);
      if (categoryError) throw categoryError;

      const categoryLookup: Record<string, string> = {};
      const kindById: Record<string, string> = {};
      if (itemCategories) {
        for (const cat of itemCategories) {
          categoryLookup[cat.category_name] = cat.id;
          kindById[cat.id] = cat.kind;
        }
      }

      // Owned by Campus Living (hostel, mess) and TMS (transport) — never
      // billed from the admission path. See the CUTOVER HISTORY note above.
      const FOREIGN_MODULE_KINDS = new Set(['hostel', 'mess', 'transport']);
      const isForeignModule = (categoryId?: string | null) =>
        !!categoryId && FOREIGN_MODULE_KINDS.has(kindById[categoryId]);
      let skippedForeign = 0;

      // FALLBACK due date only. As of 2026-08-21 the real due date comes from
      // the fee structure — admission_fee_structure_items.due_offset_days /
      // due_date, falling back to admission_fee_structures.default_due_offset_days
      // (itself defaulted to 30) — and is applied by
      // attachInstalmentSchedules below. This +30 stands only for a fee
      // item the engine cannot resolve to a structure item at all, which is
      // exactly the pre-2026-08-21 behaviour for those rows.
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 30);
      const dueDateStr = dueDate.toISOString().split('T')[0];

      // Updated: 2026-04-15 - Prefer dynamic fee_items; fall back to legacy fee columns.
      const billsToInsert: any[] = [];
      const feeItems = Array.isArray(learner.fee_items)
        ? (learner.fee_items as Array<{
            category_id: string;
            category_name: string;
            amount: number;
            /** Added 2026-08-21; absent on snapshots resolved before then. */
            fee_structure_item_id?: string | null;
          }>)
        : [];

      if (feeItems.length > 0) {
        for (const item of feeItems) {
          const amount = Number(item?.amount ?? 0);
          if (amount <= 0) continue;
          if (isForeignModule(item.category_id)) {
            skippedForeign++;
            continue;
          }
          billsToInsert.push({
            student_id: learnerId,
            institution_id: learner.institution_id,
            academic_year_id: learner.academic_year_id ?? null,
            item_category_id: item.category_id || null,
            bill_description: item.category_name || 'Fee',
            due_date: dueDateStr,
            quantity: 1,
            unit_amount: amount,
            total_amount: amount,
            tax_amount: 0,
            final_amount: amount,
            balance_amount: amount,
            status: 'unpaid',
            remarks: `Onboarding bill — auto-generated from learner fee_items`,
            created_by: currentUserId,
            // Lets the expander find this item's schedule without re-running the
            // 8-dimension match, and lets the promotion engine walk a settled
            // bill back to the schedule line that names a lifecycle status.
            fee_structure_item_id: item.fee_structure_item_id ?? null,
          });
        }
      } else {
        // Legacy fallback: iterate hardcoded finance columns.
        for (const fieldName of BILL_FIELD_ORDER) {
          const amount = Number((learner as any)[fieldName] ?? 0);
          if (amount > 0) {
            const description = BILL_DESCRIPTIONS[fieldName] ?? fieldName;
            const categoryId = categoryLookup[description] || null;
            if (isForeignModule(categoryId)) {
              skippedForeign++;
              continue;
            }
            billsToInsert.push({
              student_id: learnerId,
              institution_id: learner.institution_id,
              academic_year_id: learner.academic_year_id ?? null,
              item_category_id: categoryId,
              bill_description: description,
              due_date: dueDateStr,
              quantity: 1,
              unit_amount: amount,
              total_amount: amount,
              tax_amount: 0,
              final_amount: amount,
              balance_amount: amount,
              status: 'unpaid',
              remarks: `Onboarding bill — auto-generated from learner legacy finance profile`,
              created_by: currentUserId,
            });
          }
        }
      }

      if (billsToInsert.length === 0) {
        // Everything this learner owes belongs to another module (a hosteller
        // whose structure is hostel/mess only, say). That is a legitimate
        // no-op, not an error — return 0 so the bulk-generate caller counts it
        // as `skipped`, exactly like an already-billed learner.
        if (skippedForeign > 0) {
          console.info(
            `[billing/onboarding] createBillsFromProfile: learner ${learnerId} has ${skippedForeign} fee item(s), all owned by Campus Living/TMS — nothing to bill here`
          );
          return 0;
        }
        throw new Error(
          `No fee items or finance values found for learner ${learnerId}`
        );
      }

      // Instalment expansion — DORMANT until an active instalment plan matches
      // this learner's (institution, programme, category, academic year). With
      // zero plans configured (or before migration 20260825013000 is applied),
      // this returns billsToInsert untouched and the insert below is byte for
      // byte today's behaviour. A matching plan turns ONE yearly row into N
      // instalment rows whose amounts sum exactly to the yearly amount, each
      // with its own due date. Split arithmetic lives in the SQL engine
      // (billing_instalment_split_for_learner) shared with the account
      // transition RPC, so the two generation paths cannot disagree.
      // ONE row per fee, each optionally carrying the tranches that belong
      // inside it. This used to expand a scheduled fee into N sibling BILLS,
      // which is why three fee items produced five bills.
      const scheduled = await attachInstalmentSchedules(
        supabase,
        learnerId,
        billsToInsert
      );

      // `__instalments` is not a billing_student_bills column — strip it before
      // the insert or PostgREST rejects the whole batch.
      const rowsToInsert = scheduled.map(({ __instalments, ...row }) => row);

      const { data: insertedBills, error: insertError } = await supabase
        .from('billing_student_bills')
        .insert(rowsToInsert)
        .select('id, item_category_id, fee_structure_item_id');

      // Onboarding inserts the learner's whole fee set as one batch, so a
      // single once-per-learner collision rejects all of it. Name the category
      // that blocked it — otherwise the operator sees only a generic failure
      // for a learner whose bills were partly already created earlier.
      const duplicateMessage = describeOncePerLearnerError(insertError);
      if (duplicateMessage) {
        throw new Error(
          `${duplicateMessage} No bills were created for this learner — resolve the existing bill, then retry.`
        );
      }

      if (insertError) throw insertError;

      // Write each schedule under the bill it belongs to. Matched on
      // item_category_id rather than array position: PostgREST does not
      // guarantee the returned order matches the sent order, and a schedule
      // attached to the wrong fee would bill the right total on the wrong
      // dates — silently, and only visible at the end of term. One bill per
      // category per learner is already guaranteed here, so the key is unique.
      const billIdByCategory = new Map<string, string>();
      for (const b of (insertedBills ?? []) as Array<{
        id: string;
        item_category_id: string | null;
      }>) {
        if (b.item_category_id) billIdByCategory.set(b.item_category_id, b.id);
      }

      const instalmentRows = scheduled.flatMap((row) => {
        if (!row.__instalments?.length || !row.item_category_id) return [];
        const billId = billIdByCategory.get(row.item_category_id);
        if (!billId) return [];
        return row.__instalments.map((t) => ({
          bill_id: billId,
          sequence_no: t.sequence_no,
          amount: t.amount,
          due_date: t.due_date,
          promotes_to_status_code: t.promotes_to_status_code,
        }));
      });

      if (instalmentRows.length > 0) {
        const { error: instalmentError } = await supabase
          .from('billing_bill_instalments')
          .insert(instalmentRows);
        // NOT swallowed. A bill whose schedule failed to write is a bill that
        // silently reverts to a single due date — the exact defect this whole
        // feature exists to remove — so the caller must hear about it.
        if (instalmentError) {
          throw new Error(
            `Bills were created but their instalment schedule could not be saved: ${getErrorMessage(instalmentError)}`
          );
        }
      }

      return rowsToInsert.length;
    } catch (error) {
      console.error('[billing/onboarding] createBillsFromProfile failed:', error);
      throw error;
    }
  }

  // ── 4. markAsAccount ────────────────────────────────────────────────────

  /**
   * Admission team calls this to send a learner to the accounts team.
   *
   * Plan 4 (2026-05-05): refactored to delegate to
   * AccountTransitionService.transitionToAccount, which calls the atomic
   * SECURITY DEFINER RPC `admission_account_transition_with_bills`. The RPC
   * does:
   *   1. Permission check (admission_documents.manage)
   *   2. Lead status validation (admitted | pending | approved)
   *   3. Fee structure resolution (or legacy_fee_mode fee_items check)
   *   4. Required documents validation
   *   5. Documents UPSERT
   *   6. lifecycle_status → 'account'
   *   7. Bill auto-generation (idempotent)
   * All in one transaction — any failure rolls back everything.
   *
   * Backward-compat: existing callers pass only `learnerId`. If the
   * institution has `required_documents_for_account_transition` set AND no
   * documents are passed, the RPC will throw `required_documents_missing: ...`.
   * UI callers should use the AccountTransitionDialog (Plan 4 Task 11) to
   * collect documents and pass them via `receivedDocuments`.
   *
   * Legacy `validateFinanceFields` removed — the RPC does its own fee
   * resolution validation.
   */
  static async markAsAccount(
    learnerId: string,
    receivedDocuments?: AccountTransitionDocumentEntry[],
  ): Promise<AccountTransitionResult> {
    try {
      const supabase = this.supabase as any;

      // Read institution to fetch required-documents config.
      const { data: lp, error: readError } = await supabase
        .from('learners_profiles')
        .select('institution_id')
        .eq('id', learnerId)
        .single();
      if (readError) throw readError;
      if (!lp) throw new Error(`Learner ${learnerId} not found`);

      const settings = await AdmissionSettingsService.getByInstitution(lp.institution_id);
      const required = settings?.required_documents_for_account_transition ?? [];

      return AccountTransitionService.transitionToAccount({
        learner_id: learnerId,
        required_documents: required,
        received_documents: receivedDocuments ?? [],
      });
    } catch (error) {
      console.error('[billing/onboarding] markAsAccount failed:', error);
      throw error;
    }
  }

  // ── 5. markAsApproved (accounts → active) ───────────────────────────────

  /**
   * Accounts team calls this to promote a learner from 'account' → 'active'.
   *
   * Plan (2026-05-17): refactored to delegate the paid-percentage threshold
   * check to the SECURITY DEFINER RPC `evaluate_learner_status_after_payment`,
   * which is the single source of truth. The threshold is configured per
   * status in `admission_statuses` (currently 60% on `active`) instead of the
   * old hardcoded 100% rule.
   *
   * Preserved checks (kept on the JS side):
   *   - lifecycle_status must be 'account'
   *   - no `pending_review` fee-change event for the learner
   *
   * Returns `{ promoted: true }` when the RPC flipped the status, or
   * `{ promoted: false, reason }` for non-fatal reasons (e.g. learner was
   * already not in `account`). Throws on hard errors (RPC error, pending
   * fee-change event, below threshold).
   */
  static async markAsApproved(
    learnerId: string
  ): Promise<{ promoted: boolean; reason?: string }> {
    // Cast to `any` — generated Supabase types lag the new RPC
    // `evaluate_learner_status_after_payment` (added in Task D1, 2026-05-17).
    // Same pattern used by sibling methods in this file.
    const supabase = this.supabase as any;

    // 1. Load current lifecycle_status
    const { data: profile, error: profileErr } = await supabase
      .from('learners_profiles')
      .select('id, lifecycle_status')
      .eq('id', learnerId)
      .single();
    if (profileErr) throw new Error(getErrorMessage(profileErr));
    if (profile.lifecycle_status !== 'account') {
      return { promoted: false, reason: `Learner is in '${profile.lifecycle_status}', not 'account'.` };
    }

    // 2. Block if fee-change event pending (existing rule, preserved)
    if (await FeeChangeEventService.hasPendingForLearner(learnerId)) {
      throw new Error('Cannot approve: fee-change event pending. Resolve first.');
    }

    // 3. Delegate to SECURITY DEFINER RPC — single source of truth.
    const { data, error } = await supabase
      .rpc('evaluate_learner_status_after_payment', { p_learner_id: learnerId });
    if (error) throw new Error(getErrorMessage(error));

    const result = data as {
      updated: boolean; from_status?: string; to_status?: string;
      paid_pct?: number; threshold?: number; reason?: string;
    };

    if (!result.updated) {
      if (result.reason === 'below_threshold') {
        throw new Error(
          `Cannot approve: paid ${result.paid_pct ?? 0}% — need threshold from settings (active status).`
        );
      }
      return { promoted: false, reason: result.reason ?? 'unknown' };
    }
    return { promoted: true };
  }

  // ── 5b. reevaluateStatus (operator re-run of the automatic promotion) ────

  /**
   * Re-runs the automatic lifecycle evaluation for one learner and reports what
   * it decided. This is the manual counterpart to the payment triggers: the
   * accounts team reaches for it when a learner's status looks behind their
   * payments.
   *
   * PROMOTION ONLY, and never a bypass. The RPC applies exactly the thresholds
   * configured in `admission_statuses` — it cannot move a learner who has not
   * actually paid, it returns `no_op_for_status` outside account/reserved, and
   * it re-asserts the from-status inside every UPDATE. So the worst a stray
   * click can do is nothing.
   *
   * Unlike `markAsApproved`, this reports rather than throws: "nothing changed"
   * is the expected answer most of the time, not an error. The returned
   * `paid_pct`/`threshold` are what the caller should show — "paid 12%, needs
   * 30%" is the answer the operator actually wants.
   */
  static async reevaluateStatus(learnerId: string): Promise<{
    updated: boolean;
    finalStatus?: string;
    paidPct?: number;
    threshold?: number;
    reason?: string;
  }> {
    // Cast to `any` — generated Supabase types lag this RPC, same as the
    // sibling methods in this file.
    const supabase = this.supabase as any;

    const { data, error } = await supabase.rpc(
      'evaluate_learner_status_after_payment',
      { p_learner_id: learnerId }
    );
    // Supabase errors are plain objects, not Error instances — getErrorMessage
    // surfaces the real code/message instead of "[object Object]".
    if (error) throw new Error(getErrorMessage(error));

    const result = (data ?? {}) as {
      updated?: boolean;
      final_status?: string;
      paid_pct?: number;
      threshold?: number;
      reason?: string;
    };

    return {
      updated: result.updated === true,
      finalStatus: result.final_status,
      paidPct: Number(result.paid_pct ?? 0),
      threshold: result.threshold == null ? undefined : Number(result.threshold),
      reason: result.reason
    };
  }

  // ── 6. revertToApproved ──────────────────────────────────────────────────

  /**
   * Reverts a learner from 'account' back to 'approved'.
   * Deletes all unpaid bills for this learner, then reverts lifecycle_status.
   * Partially-paid bills are NOT deleted to preserve payment history.
   */
  static async revertToApproved(learnerId: string): Promise<void> {
    try {
      const supabase = this.supabase as any;

      // Fetch learner
      const { data: learner, error: fetchError } = await supabase
        .from('learners_profiles')
        .select('id, lifecycle_status')
        .eq('id', learnerId)
        .single();

      if (fetchError) throw fetchError;
      if (!learner) throw new Error(`Learner ${learnerId} not found`);

      if (learner.lifecycle_status !== 'account') {
        throw new Error(
          `Cannot revert: learner is '${learner.lifecycle_status}', expected 'account'`
        );
      }

      // Delete only fully unpaid bills (balance_amount = final_amount → no payments made)
      const { error: deleteError } = await supabase
        .from('billing_student_bills')
        .delete()
        .eq('student_id', learnerId)
        .eq('status', 'unpaid');

      if (deleteError) throw deleteError;

      // Revert lifecycle status
      const { error: updateError } = await supabase
        .from('learners_profiles')
        .update({
          lifecycle_status: 'approved',
          updated_at: new Date().toISOString(),
        })
        .eq('id', learnerId);

      if (updateError) throw updateError;
    } catch (error) {
      console.error('[billing/onboarding] revertToApproved failed:', error);
      throw error;
    }
  }
}
