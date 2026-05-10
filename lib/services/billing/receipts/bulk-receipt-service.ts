/**
 * Bulk Receipt Service — turns a parsed Excel upload into N billing_receipts
 * (one per student) with M billing_receipt_items (one per bill row).
 *
 * Designed to be called server-side ONLY (from the bulk-import API route).
 * Browser callers should not import this file because it relies on a
 * service-role-aware client passed in by the route.
 *
 * The actual receipt insert is delegated to BillingReceiptService.createBillingReceipt
 * so that bill-status recomputation and auto-invoice generation stay in one
 * place — there's a single source of truth for "what happens when a receipt
 * is created", and we don't risk drift between single-receipt and bulk paths.
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { BillingReceiptService } from './billing-receipt-service';
import type {
  BulkReceiptRow,
  BulkReceiptCreated,
  BulkReceiptImportError
} from '@/lib/utils/mappings/bulk-receipt-excel-mappings';
import type { CreateReceiptDto, PaymentMode } from '@/types/billing-schedule';

export interface BulkReceiptBatchMetadata {
  payment_mode: PaymentMode;
  payment_paid_date: string;
  /** When 'student', payer_name comes from the row's student_name. */
  payer_mode: 'student' | 'fixed';
  payer_name_fixed?: string;
  payer_contact?: string;
  payment_reference_number?: string;
  payment_remarks?: string;
  accountant_id?: string;
}

export interface BulkReceiptStudentGroup {
  student_id: string;
  institution_id: string;
  roll_number: string;
  student_name: string;
  rows: BulkReceiptRow[]; // each carries bill_id + paid_amount
}

/**
 * Group cleaned rows by student. Each row already carries
 * _resolved_student_id and _resolved_institution_id from the validator —
 * if either is missing we drop the row with an error and the caller
 * surfaces it.
 */
export function groupRowsByStudent(
  rows: Array<{ rowNumber: number; cleaned: BulkReceiptRow }>,
  errors: BulkReceiptImportError[]
): BulkReceiptStudentGroup[] {
  const map = new Map<string, BulkReceiptStudentGroup>();

  for (const { rowNumber, cleaned } of rows) {
    const sid = cleaned._resolved_student_id;
    const iid = cleaned._resolved_institution_id;
    if (!sid || !iid) {
      errors.push({
        row: rowNumber,
        message:
          'Row could not be linked to a student/institution — skipped during grouping.'
      });
      continue;
    }

    let group = map.get(sid);
    if (!group) {
      group = {
        student_id: sid,
        institution_id: iid,
        roll_number: cleaned.roll_number,
        student_name: cleaned.student_name,
        rows: []
      };
      map.set(sid, group);
    }
    // If the same bill_id appears twice for the same student in the upload,
    // collapse into one item with summed amount. This is forgiving of
    // accidental duplicate rows in the Excel, but the validator should
    // have caught the obvious case earlier.
    const existing = group.rows.find((r) => r.bill_id === cleaned.bill_id);
    if (existing) {
      existing.paid_amount += cleaned.paid_amount;
    } else {
      group.rows.push(cleaned);
    }
  }

  return Array.from(map.values());
}

/**
 * Create a single billing_receipt + items for one student group.
 *
 * Returns either the success summary OR an error. We do NOT throw — bulk
 * import is partial-success and the route needs to keep going.
 */
export async function createReceiptForStudentGroup(
  group: BulkReceiptStudentGroup,
  meta: BulkReceiptBatchMetadata,
  supabaseClient: SupabaseClient
): Promise<
  | { ok: true; receipt: BulkReceiptCreated }
  | { ok: false; rowNumbers: number[]; message: string }
> {
  const totalAmount = group.rows.reduce((sum, r) => sum + r.paid_amount, 0);

  // Defensive: a group with no positive paid_amount shouldn't reach here,
  // but if it does, refuse rather than insert a zero-amount receipt.
  if (totalAmount <= 0) {
    return {
      ok: false,
      rowNumbers: [],
      message: `No positive paid amounts for student ${group.student_name} — receipt skipped.`
    };
  }

  const dto: CreateReceiptDto = {
    student_id: group.student_id,
    institution_id: group.institution_id,
    payment_mode: meta.payment_mode,
    payment_reference_number: meta.payment_reference_number,
    payment_amount: totalAmount,
    payment_paid_date: meta.payment_paid_date,
    payer_name:
      meta.payer_mode === 'fixed' && meta.payer_name_fixed
        ? meta.payer_name_fixed
        : group.student_name || group.roll_number, // fallback if name is empty
    payer_contact: meta.payer_contact,
    accountant_id: meta.accountant_id,
    payment_remarks: meta.payment_remarks,
    receipt_items: group.rows.map((r) => ({
      bill_id: r.bill_id,
      amount_paid: r.paid_amount
    }))
  };

  try {
    const receipt = await BillingReceiptService.createBillingReceipt(
      dto,
      supabaseClient
    );
    return {
      ok: true,
      receipt: {
        receipt_id: receipt.id,
        receipt_number: receipt.receipt_number,
        student_id: group.student_id,
        roll_number: group.roll_number,
        student_name: group.student_name,
        payment_amount: totalAmount,
        bill_count: group.rows.length
      }
    };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Unknown error creating receipt';
    return { ok: false, rowNumbers: [], message };
  }
}
