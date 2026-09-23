import { describe, expect, it, vi } from 'vitest';

// BaseService builds the browser client at import time; these tests exercise
// only the pure marshalling code, so the client is a stub.
vi.mock('@/lib/supabase/client', () => ({
  createClientSupabaseClient: () => ({ rpc: vi.fn(), from: vi.fn() })
}));

import { BillingAuditService } from '@/lib/services/campus-living/billing-audit-service';
import { parseFilters, toScopeQuery } from '@/app/(routes)/campus-living/billing-audit/_components/use-billing-audit-filters';

describe('BillingAuditService.baseParams', () => {
  it('turns empty / unset selections into null, never "" or undefined', () => {
    const p = BillingAuditService.baseParams({
      institution_ids: [],
      academic_year_id: '',
      block_id: undefined,
      room_category_id: null,
      program_id: '',
      gender: undefined
    });
    expect(p).toEqual({
      p_institution_ids: null,
      p_academic_year_id: null,
      p_block_id: null,
      p_room_category_id: null,
      p_program_id: null,
      p_gender: null,
      p_allocated_only: false
    });
    // `.eq(col, undefined)` sends the literal string "undefined"; '' matches
    // zero rows. Neither may ever reach the RPC.
    for (const v of Object.values(p)) expect(v === undefined || v === '').toBe(false);
  });

  it('passes real selections through and keeps allocated_only boolean', () => {
    const p = BillingAuditService.baseParams({
      institution_ids: ['inst-1'],
      academic_year_id: 'ay-1',
      allocated_only: true
    });
    expect(p.p_institution_ids).toEqual(['inst-1']);
    expect(p.p_academic_year_id).toBe('ay-1');
    expect(p.p_allocated_only).toBe(true);
  });
});

describe('BillingAuditService.mapRow', () => {
  const raw = {
    out_learner_id: 'l1',
    out_roll_number: null,
    out_register_number: 'R1',
    out_full_name: 'A LEARNER',
    out_gender: 'Female',
    out_institution_id: 'i1',
    out_institution_name: 'JKKN College of Nursing and Research',
    out_program_name: 'BSC NURSING',
    out_year_of_study: 1,
    out_semester_name: null,
    out_lifecycle_status: 'active',
    out_is_allocated: true,
    out_block_id: 'b1',
    out_block_name: 'Girls Hostel B',
    out_room_number: '204',
    out_bed_number: 'B2',
    out_seated_category_name: 'Deluxe Room',
    out_tagged_category_id: 'c1',
    out_tagged_category_name: 'Deluxe Plus Room',
    out_mess_category_name: 'Premium',
    out_band_fee: '120000.00',
    out_entitled_category_name: 'Classic Room',
    out_band_status: 'above',
    out_expected_room_fee: '65000.00',
    out_expected_mess_fee: null,
    out_expected_upgrade_fee: null,
    out_category_room_rate: '37500',
    out_category_mess_rate: '62500',
    out_room_billed: '25000.00',
    out_room_paid: '0',
    out_room_status: 'unpaid',
    out_room_due_date: '2026-09-30',
    out_mess_billed: null,
    out_mess_paid: null,
    out_mess_status: null,
    out_mess_due_date: null,
    out_upgrade_billed: '10000.00',
    out_upgrade_paid: '0',
    out_upgrade_status: 'unpaid',
    out_upgrade_due_date: '2026-08-31',
    out_total_billed: '75000.00',
    out_total_paid: '0',
    out_total_outstanding: '75000.00',
    out_overdue_amount: '10000.00',
    out_overdue_count: 1,
    out_findings: ['unpaid', 'overdue', 'amount_mismatch'],
    out_bills: [
      {
        bill_id: 'x1',
        class: 'room',
        category_name: 'Hostel Fee',
        description: null,
        year_name: '2026-2027',
        amount: 25000,
        paid: 0,
        pending: 25000,
        status: 'unpaid',
        due_date: '2026-09-30',
        is_overdue: false
      }
    ],
    out_target_academic_year_name: '2026-2027',
    out_total_count: '36'
  };

  it('coerces numeric strings to numbers and keeps NULL expectations null', () => {
    const row = BillingAuditService.mapRow(raw as never);
    expect(row.band_fee).toBe(120000);
    expect(row.expected_room_fee).toBe(65000);
    // null must stay null: Number(null) = 0 would read as "expects zero".
    expect(row.expected_mess_fee).toBeNull();
    expect(row.expected_upgrade_fee).toBeNull();
    expect(row.mess_billed).toBeNull();
    expect(row.mess_status).toBeNull();
    expect(row.mess_due_date).toBeNull();
    expect(row.total_outstanding).toBe(75000);
    expect(row.total_count).toBe(36);
  });

  it('parses the bills jsonb whether it arrives as an array or a string', () => {
    const a = BillingAuditService.mapRow(raw as never);
    expect(a.bills).toHaveLength(1);
    expect(a.bills[0]).toMatchObject({ bill_id: 'x1', class: 'room', pending: 25000, is_overdue: false });

    const b = BillingAuditService.mapRow({ ...raw, out_bills: JSON.stringify(raw.out_bills) } as never);
    expect(b.bills).toEqual(a.bills);

    const c = BillingAuditService.mapRow({ ...raw, out_bills: null, out_findings: null } as never);
    expect(c.bills).toEqual([]);
    expect(c.findings).toEqual([]);
  });
});

describe('billing-audit URL filters', () => {
  it('round-trips the scope through the query string and defaults finding to all', () => {
    const f = parseFilters(
      new URLSearchParams('institution_id=i1&block_id=b1&allocated_only=1&finding=overdue&page=3')
    );
    expect(f).toMatchObject({
      institution_ids: ['i1'],
      block_id: 'b1',
      allocated_only: true,
      finding: 'overdue',
      academic_year_id: null,
      gender: null
    });
    // The scope query carries everything except the finding, so an Analytics
    // card can add its own finding= without inheriting a stale one.
    expect(toScopeQuery(f)).toBe('institution_id=i1&block_id=b1&allocated_only=1');
    expect(parseFilters(new URLSearchParams('')).finding).toBe('all');
  });
});
