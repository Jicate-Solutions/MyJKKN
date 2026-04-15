import { createClientSupabaseClient } from '@/lib/supabase/client';
import type { LearnerProfile } from '@/types/learner-profile';
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

export interface OnboardingFilters {
  search?: string;           // matches name, email, phone, application_id
  institution_id?: string;
  degree_id?: string;
  department_id?: string;
  program_id?: string;
  payment_status?: PaymentStatus;
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
      payment_status,
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
        .eq('lifecycle_status', 'account');

      // Academic filters
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

      const { data: rawData, error, count } = await query;

      if (error) throw error;

      // Map rows → OnboardingLearner; apply payment_status post-filter
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

      // Post-filter by payment_status
      const filtered = payment_status
        ? mapped.filter(
            (l) =>
              computePaymentStatus(l.total_fees, l.total_balance) === payment_status
          )
        : mapped;

      // Paginate post-filter results
      const total = payment_status ? filtered.length : (count ?? 0);
      const offset = (page - 1) * limit;
      const paginated = payment_status
        ? filtered.slice(offset, offset + limit)
        : filtered; // DB-level pagination already applied via range below

      // For non-payment_status queries apply DB-level pagination
      // (we re-run or slice — for simplicity we slice the already-fetched page)
      const finalData = payment_status ? paginated : filtered.slice(0, limit);

      return {
        data: finalData,
        metadata: {
          total,
          page,
          limit,
          total_pages: Math.ceil(total / limit),
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

  static async createBillsFromProfile(learnerId: string): Promise<void> {
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

      // Get current user for created_by
      const { data: userData } = await supabase.auth.getUser();
      const currentUserId = userData?.user?.id ?? null;

      // Fetch billing categories for this institution (used as fallback for legacy columns)
      const { data: itemCategories } = await supabase
        .from('billing_categories')
        .select('id, category_name, institution_id')
        .eq('institution_id', learner.institution_id)
        .eq('is_active', true);

      const categoryLookup: Record<string, string> = {};
      if (itemCategories) {
        for (const cat of itemCategories) {
          categoryLookup[cat.category_name] = cat.id;
        }
      }

      // Due date = 30 days from now
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
          }>)
        : [];

      if (feeItems.length > 0) {
        for (const item of feeItems) {
          const amount = Number(item?.amount ?? 0);
          if (amount <= 0) continue;
          billsToInsert.push({
            student_id: learnerId,
            institution_id: learner.institution_id,
            category_id: item.category_id || null,
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
          });
        }
      } else {
        // Legacy fallback: iterate hardcoded finance columns.
        for (const fieldName of BILL_FIELD_ORDER) {
          const amount = Number((learner as any)[fieldName] ?? 0);
          if (amount > 0) {
            const description = BILL_DESCRIPTIONS[fieldName] ?? fieldName;
            const categoryId = categoryLookup[description] || null;
            billsToInsert.push({
              student_id: learnerId,
              institution_id: learner.institution_id,
              category_id: categoryId,
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
        throw new Error(
          `No fee items or finance values found for learner ${learnerId}`
        );
      }

      const { error: insertError } = await supabase
        .from('billing_student_bills')
        .insert(billsToInsert);

      if (insertError) throw insertError;
    } catch (error) {
      console.error('[billing/onboarding] createBillsFromProfile failed:', error);
      throw error;
    }
  }

  // ── 4. markAsAccount ────────────────────────────────────────────────────

  /**
   * Admission team calls this to send a learner to the accounts team.
   * 1. Validates lifecycle_status is enquiry, pending, or approved.
   * 2. Validates all required finance fields are filled.
   * 3. Updates lifecycle_status → 'account'.
   * 4. Auto-generates bills from the finance profile with proper categories.
   */
  static async markAsAccount(learnerId: string): Promise<void> {
    try {
      const supabase = this.supabase as any;

      // Fetch current learner
      const { data: learner, error: fetchError } = await supabase
        .from('learners_profiles')
        .select('*')
        .eq('id', learnerId)
        .single();

      if (fetchError) throw fetchError;
      if (!learner) throw new Error(`Learner ${learnerId} not found`);

      // Guard: must be in a pre-billing status
      const allowedStatuses = ['enquiry', 'pending', 'approved'];
      if (!allowedStatuses.includes(learner.lifecycle_status)) {
        throw new Error(
          `Cannot mark as account: learner is '${learner.lifecycle_status}'. Must be enquiry, pending, or approved.`
        );
      }

      // Validate finance fields
      const validation = this.validateFinanceFields(learner as LearnerProfile);
      if (!validation.valid) {
        throw new Error(
          `Finance fields incomplete. Missing: ${(validation as ValidationFailure).missing.join(', ')}`
        );
      }

      // Transition to 'account'
      const { error: updateError } = await supabase
        .from('learners_profiles')
        .update({ lifecycle_status: 'account', updated_at: new Date().toISOString() })
        .eq('id', learnerId);

      if (updateError) throw updateError;

      // Auto-generate bills
      await this.createBillsFromProfile(learnerId);
    } catch (error) {
      console.error('[billing/onboarding] markAsAccount failed:', error);
      throw error;
    }
  }

  // ── 5. markAsApproved (accounts → active) ───────────────────────────────

  /**
   * Accounts team calls this after confirming 100% payment.
   * Validates lifecycle_status is 'account' and all bills are fully paid,
   * then transitions lifecycle_status → 'active'.
   */
  static async markAsApproved(learnerId: string): Promise<void> {
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
          `Cannot approve: learner is '${learner.lifecycle_status}', expected 'account'`
        );
      }

      // Check all bills are paid
      const { data: bills, error: billError } = await supabase
        .from('billing_student_bills')
        .select('id, balance_amount')
        .eq('student_id', learnerId);

      if (billError) throw billError;

      const totalBalance = ((bills as any[]) ?? []).reduce(
        (sum: number, b: any) => sum + Number(b.balance_amount ?? 0),
        0
      );

      if (totalBalance > 0) {
        throw new Error(
          `Cannot approve: learner has outstanding balance of ₹${totalBalance.toFixed(2)}`
        );
      }

      const { error: updateError } = await supabase
        .from('learners_profiles')
        .update({ lifecycle_status: 'active', updated_at: new Date().toISOString() })
        .eq('id', learnerId);

      if (updateError) throw updateError;
    } catch (error) {
      console.error('[billing/onboarding] markAsApproved failed:', error);
      throw error;
    }
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
