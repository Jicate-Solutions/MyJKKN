/**
 * Bulk Receipt Service — turns a parsed Excel upload into N billing_receipts
 * (one per (student, paid_date, payment_mode) bucket) with M billing_receipt_items
 * (one per bill row).
 *
 * Designed to be called server-side ONLY (from the bulk-import API route).
 * Browser callers should not import this file because it relies on a
 * service-role-aware client passed in by the route.
 *
 * The actual receipt insert is delegated to BillingReceiptService.createBillingReceipt
 * so that bill-status recomputation and auto-invoice generation stay in one
 * place — there's a single source of truth for "what happens when a receipt
 * is created", and we don't risk drift between single-receipt and bulk paths.
 *
 * 2026-05-15: refactored grouping from {student} to {student, paid_date,
 * payment_mode} so a single student paying multiple bills on different days
 * gets one receipt per (date, mode) tuple instead of all bills being forced
 * into one date. Per-row payment metadata flows from the Excel template.
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { BillingReceiptService } from './billing-receipt-service';
import type {
  BulkReceiptRow,
  BulkReceiptCreated,
  BulkReceiptImportError,
  BulkReceiptPaymentMode
} from '@/lib/utils/mappings/bulk-receipt-excel-mappings';
import type { CreateReceiptDto } from '@/types/billing-schedule';

/**
 * Optional default applied by the importer when a row lacks its own
 * accountant_id. The whole batch carries one accountant — typically the
 * authenticated super-admin who uploaded the file.
 */
export interface BulkReceiptBatchDefaults {
  accountant_id?: string;
}

/**
 * One bucket = one billing_receipt on commit. Carries the per-row payment
 * metadata that was identical across every row in the bucket (by definition
 * of the group key).
 */
export interface BulkReceiptStudentGroup {
  student_id: string;
  institution_id: string;
  roll_number: string;
  student_name: string;
  payment_mode: BulkReceiptPaymentMode;
  payment_paid_date: string;
  payer_name: string;
  payer_contact: string | null;
  payment_reference_number: string | null;
  payment_remarks: string | null;
  rows: BulkReceiptRow[]; // each carries bill_id + paid_amount
  row_numbers: number[]; // for traceability in error messages and preview
}

/**
 * Group cleaned rows by (student_id, payment_paid_date, payment_mode).
 *
 * Two rows for the same student with DIFFERENT (date, mode) end up in
 * separate groups → separate receipts. This matches the real-world case
 * where a student paid different bills on different days. The other
 * per-row metadata (payer name, contact, reference, remarks) is taken
 * from the FIRST row in the bucket — different rows with the same key
 * but different payer name are extremely unusual and not worth a
 * separate receipt for.
 */
export function groupRowsByStudentAndPayment(
  rows: Array<{ rowNumber: number; cleaned: BulkReceiptRow }>,
  errors: BulkReceiptImportError[]
): BulkReceiptStudentGroup[] {
  const map = new Map<string, BulkReceiptStudentGroup>();
  // Per-group bill_id → row index, so duplicate-bill detection is O(1)
  // instead of group.rows.find() which is O(n). Without this, a group
  // with N bills costs O(N²) total to build — pathological for a
  // single student who owes many small bills (e.g. monthly hostel fees).
  const billIdxByGroup = new Map<string, Map<string, number>>();

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

    const key = `${sid}::${cleaned.payment_paid_date}::${cleaned.payment_mode}`;

    let group = map.get(key);
    let billIdx = billIdxByGroup.get(key);
    if (!group) {
      group = {
        student_id: sid,
        institution_id: iid,
        roll_number: cleaned.roll_number,
        student_name: cleaned.student_name,
        payment_mode: cleaned.payment_mode,
        payment_paid_date: cleaned.payment_paid_date,
        payer_name: cleaned.payer_name,
        payer_contact: cleaned.payer_contact,
        payment_reference_number: cleaned.payment_reference_number,
        payment_remarks: cleaned.payment_remarks,
        rows: [],
        row_numbers: []
      };
      billIdx = new Map<string, number>();
      map.set(key, group);
      billIdxByGroup.set(key, billIdx);
    }
    // If the same bill_id appears twice in the same bucket, collapse into
    // one item with summed amount. Forgiving of accidental duplicate rows.
    const existingIdx = billIdx!.get(cleaned.bill_id);
    if (existingIdx !== undefined) {
      group.rows[existingIdx]!.paid_amount += cleaned.paid_amount;
    } else {
      billIdx!.set(cleaned.bill_id, group.rows.length);
      group.rows.push(cleaned);
      group.row_numbers.push(rowNumber);
    }
  }

  return Array.from(map.values());
}

/**
 * Create a single billing_receipt + items for one student/date/mode group.
 *
 * Returns either the success summary OR an error. We do NOT throw — bulk
 * import is partial-success and the route needs to keep going.
 */
export async function createReceiptForStudentGroup(
  group: BulkReceiptStudentGroup,
  defaults: BulkReceiptBatchDefaults,
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
      rowNumbers: group.row_numbers,
      message: `No positive paid amounts for student ${group.student_name} — receipt skipped.`
    };
  }

  const dto: CreateReceiptDto = {
    student_id: group.student_id,
    institution_id: group.institution_id,
    payment_mode: group.payment_mode,
    payment_reference_number: group.payment_reference_number ?? undefined,
    payment_amount: totalAmount,
    payment_paid_date: group.payment_paid_date,
    payer_name: group.payer_name || group.student_name || group.roll_number,
    payer_contact: group.payer_contact ?? undefined,
    accountant_id: defaults.accountant_id,
    payment_remarks: group.payment_remarks ?? undefined,
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
    return { ok: false, rowNumbers: group.row_numbers, message };
  }
}
