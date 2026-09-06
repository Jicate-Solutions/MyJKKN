// One row in the admin "Upgrades" report — derived from a single upgrade-fee bill
// (billing_student_bills.fee_source='hostel_category'), covering room + mess upgrades.
export interface CategoryUpgradeRow {
  bill_id: string;
  learner_id: string;            // learners_profiles.id (billing student_id)
  learner_name: string;          // "First Last", fallback "—"
  roll_number: string | null;    // shown with "N/A" fallback (matches billing module)
  institution_name: string | null;
  kind: 'room' | 'mess';
  description: string;           // bill_description, e.g. "Classic Room → Deluxe Room"
  upgrade_fee: number;           // final_amount
  paid_amount: number;           // final_amount - balance_amount
  status: string;                // raw bill status
  status_label: 'Completed' | 'Pending';
  created_at: string;
  academic_year_name: string | null;
}

export type UpgradeStatusFilter = 'all' | 'completed' | 'pending';
export type UpgradeKindFilter = 'all' | 'room' | 'mess';
