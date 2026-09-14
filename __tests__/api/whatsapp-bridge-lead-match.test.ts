/**
 * BridgeOutboxService — matching an inbound number to a learner's admission
 * lead, and the E.164 contract on the way out.
 *
 * ⚠️ THE DEFECT THIS SUITE EXISTS FOR. Siblings at JKKN genuinely share a
 * parent's phone number, and families share an email. The first draft matched
 * with `.ilike('phone', '%<last10>%').limit(1).maybeSingle()` and NO `.order()`,
 * which asks PostgreSQL for "any one of them" — genuinely arbitrary, and free to
 * differ between two calls with identical input. A parent's reply would be filed
 * against whichever child the planner happened to return, and nothing anywhere
 * would record that a guess had been made. The person reading that admission
 * record later has no way to know to doubt it.
 *
 * The rule these tests pin: more than one candidate attaches to NONE of them.
 * A message a human has to file by hand is a cheap failure. A message filed
 * against the wrong learner is not.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// A fake PostgREST client. Chainable, and thenable at every link, because the
// real builder resolves wherever the caller awaits it.
// ---------------------------------------------------------------------------

interface FakeState {
  leads: Array<{ id: string; phone: string | null }>;
  /** wa_message_id values already recorded — the idempotency store. */
  existingInbound: Map<string, Record<string, unknown>>;
  /** Every ilike pattern the service asked for, so "one query not four" is provable. */
  leadQueries: string[];
  insertedInbound: Array<Record<string, unknown>>;
  insertedOutbox: Array<Record<string, unknown>>;
}

let state: FakeState;

function makeBuilder(table: string) {
  const ops: Record<string, unknown> = { table };

  const builder: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'limit', 'upsert', 'insert', 'maybeSingle', 'single', 'order']) {
    builder[m] = (...args: unknown[]) => {
      ops[m] = args;
      return builder;
    };
  }
  builder.ilike = (_col: string, pattern: string) => {
    ops.ilike = pattern;
    if (table === 'admission_leads') state.leadQueries.push(pattern);
    return builder;
  };

  builder.then = (resolve: (v: unknown) => unknown) => {
    return Promise.resolve(resolveOps(ops)).then(resolve);
  };

  return builder;
}

function resolveOps(ops: Record<string, unknown>): unknown {
  const table = ops.table as string;

  if (table === 'admission_leads') {
    // Emulate PostgREST `ilike '%<tail>'` — a SUFFIX match on the raw column.
    const pattern = (ops.ilike as string) ?? '%';
    const suffix = pattern.replace(/^%/, '').toLowerCase();
    const rows = state.leads.filter((l) => (l.phone ?? '').toLowerCase().endsWith(suffix));
    return { data: rows, error: null };
  }

  if (table === 'wa_bridge_inbound') {
    if (ops.upsert) {
      const row = (ops.upsert as unknown[])[0] as Record<string, unknown>;
      const key = row.wa_message_id as string;
      if (state.existingInbound.has(key)) {
        // ignoreDuplicates: the conflict is a no-op and returns NO rows.
        return { data: [], error: null };
      }
      const stored = { ...row, id: `inbound-${state.existingInbound.size + 1}` };
      state.existingInbound.set(key, stored);
      state.insertedInbound.push(stored);
      return { data: [{ id: stored.id }], error: null };
    }
    if (ops.maybeSingle) {
      const eq = ops.eq as unknown[];
      const stored = state.existingInbound.get(eq[1] as string);
      return { data: stored ?? null, error: null };
    }
  }

  if (table === 'wa_bridge_outbox') {
    if (ops.insert) {
      const row = (ops.insert as unknown[])[0] as Record<string, unknown>;
      state.insertedOutbox.push(row);
      return { data: { id: 'outbox-1' }, error: null };
    }
  }

  return { data: null, error: null };
}

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ from: (table: string) => makeBuilder(table) }),
}));

import {
  BridgeOutboxService,
  normalizeToPhone,
} from '@/lib/services/whatsapp/bridge-outbox-service';

const SIB_A = 'aaaaaaaa-0000-0000-0000-000000000001';
const SIB_B = 'bbbbbbbb-0000-0000-0000-000000000002';
const SOLO = 'cccccccc-0000-0000-0000-000000000003';

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key-for-tests';
  state = {
    leads: [],
    existingInbound: new Map(),
    leadQueries: [],
    insertedInbound: [],
    insertedOutbox: [],
  };
});

// ===========================================================================
// The sibling case
// ===========================================================================
describe('two leads sharing one phone attach to NEITHER', () => {
  it('records the message unattached and flags it ambiguous', async () => {
    // Two children of one family, one parent's number, written two different
    // ways — which is exactly how it arrives in real data.
    state.leads = [
      { id: SIB_A, phone: '+919876543210' },
      { id: SIB_B, phone: '919876543210' },
    ];

    const result = await BridgeOutboxService.recordInbound({
      from: '919876543210@s.whatsapp.net',
      waMessageId: 'wamid.siblings',
      body: 'Yes, we will attend',
    });

    expect(result.leadId).toBeNull();
    expect(result.matchStatus).toBe('ambiguous');
    expect(result.matchCandidateCount).toBe(2);

    // And the row that was written says so, so a person can find it.
    expect(state.insertedInbound[0].lead_id).toBeNull();
    expect(state.insertedInbound[0].match_status).toBe('ambiguous');
    expect(state.insertedInbound[0].match_candidate_count).toBe(2);
  });

  it('is deterministic — the same input never resolves to a lead on a second call', async () => {
    state.leads = [
      { id: SIB_A, phone: '+919876543210' },
      { id: SIB_B, phone: '919876543210' },
    ];

    const first = await BridgeOutboxService.recordInbound({
      from: '919876543210',
      waMessageId: 'wamid.one',
    });
    const second = await BridgeOutboxService.recordInbound({
      from: '+91 98765 43210',
      waMessageId: 'wamid.two',
    });

    expect(first.leadId).toBeNull();
    expect(second.leadId).toBeNull();
    expect(first.matchStatus).toBe('ambiguous');
    expect(second.matchStatus).toBe('ambiguous');
  });

  it('attaches when exactly one lead carries the number', async () => {
    state.leads = [{ id: SOLO, phone: '+919876543210' }];

    const result = await BridgeOutboxService.recordInbound({
      from: '919876543210',
      waMessageId: 'wamid.solo',
    });

    expect(result.leadId).toBe(SOLO);
    expect(result.matchStatus).toBe('matched');
    expect(result.matchCandidateCount).toBe(1);
  });

  it('treats the same lead written twice as one candidate, not two', async () => {
    // The same row cannot appear twice, but the guard is on lead ID rather
    // than on row count, so a future join that duplicates rows cannot turn one
    // learner into an ambiguity.
    state.leads = [{ id: SOLO, phone: '09876543210' }];
    const result = await BridgeOutboxService.recordInbound({
      from: '919876543210',
      waMessageId: 'wamid.trunk',
    });
    expect(result.matchStatus).toBe('matched');
    expect(result.leadId).toBe(SOLO);
  });

  it('records an unmatched message rather than discarding it', async () => {
    state.leads = [];
    const result = await BridgeOutboxService.recordInbound({
      from: '919999999999',
      waMessageId: 'wamid.stranger',
    });
    expect(result.matchStatus).toBe('unmatched');
    expect(result.matchCandidateCount).toBe(0);
    expect(state.insertedInbound).toHaveLength(1);
  });
});

// ===========================================================================
// The substring trap
// ===========================================================================
describe('a longer unrelated number is not a match', () => {
  it('ignores a number that merely ENDS in the same ten digits', async () => {
    // +1 555 987 654 3210 is a different person on a different continent. The
    // old `%tail%` (and even a bare suffix match) would have taken it.
    state.leads = [{ id: SOLO, phone: '+15559876543210' }];

    const result = await BridgeOutboxService.recordInbound({
      from: '919876543210',
      waMessageId: 'wamid.otherCountry',
    });

    expect(result.leadId).toBeNull();
    expect(result.matchStatus).toBe('unmatched');
  });

  it('accepts only the prefixes that mean the same Indian number', async () => {
    for (const phone of ['9876543210', '09876543210', '919876543210', '+919876543210']) {
      state.existingInbound.clear();
      state.leads = [{ id: SOLO, phone }];
      const result = await BridgeOutboxService.recordInbound({
        from: '919876543210',
        waMessageId: `wamid.${phone}`,
      });
      expect(result.matchStatus, `phone written as "${phone}"`).toBe('matched');
    }
  });

  it('KNOWN GAP: a lead whose phone is stored with internal spaces is not found', async () => {
    // Documented, not fixed, and unchanged by this PR. The lookup is a SQL
    // suffix match on the raw `phone` column, so `+91 98765 43210` does not end
    // in `9876543210` as stored and never reaches the verification step. The
    // ORIGINAL code had the same gap for the same reason (its `%tail%` contains-
    // match also fails on an internal space), so this is a pre-existing
    // limitation being recorded rather than a regression introduced here.
    // Widening the SQL pattern to catch it would mean fetching on a short tail
    // and filtering in TypeScript, which risks truncating a large candidate set
    // and inventing a FALSE ambiguity — a worse failure than this one.
    state.leads = [{ id: SOLO, phone: '+91 98765 43210' }];
    const result = await BridgeOutboxService.recordInbound({
      from: '919876543210',
      waMessageId: 'wamid.spaced',
    });
    expect(result.matchStatus).toBe('unmatched');
  });

  it('refuses to match anything from a number too short to be one', async () => {
    state.leads = [{ id: SOLO, phone: '919876543210' }];
    const result = await BridgeOutboxService.recordInbound({
      from: '12345',
      waMessageId: 'wamid.short',
    });
    expect(result.matchStatus).toBe('unmatched');
    expect(state.leadQueries).toHaveLength(0); // not even asked
  });
});

// ===========================================================================
// One query, not four
// ===========================================================================
describe('the lead lookup runs once', () => {
  it('asks the database a single time per inbound message', async () => {
    state.leads = [{ id: SOLO, phone: '919876543210' }];

    await BridgeOutboxService.recordInbound({
      from: '+919876543210',
      waMessageId: 'wamid.count',
    });

    // The old loop walked four phone "variants" that all share the same last
    // ten digits, so it ran the identical statement four times.
    expect(state.leadQueries).toEqual(['%9876543210']);
  });
});

// ===========================================================================
// Idempotency
// ===========================================================================
describe('a repeated wa_message_id collapses onto the first record', () => {
  it('returns the original id and duplicate: true', async () => {
    state.leads = [{ id: SOLO, phone: '919876543210' }];

    const first = await BridgeOutboxService.recordInbound({
      from: '919876543210',
      waMessageId: 'wamid.retry',
      body: 'first arrival',
    });
    const second = await BridgeOutboxService.recordInbound({
      from: '919876543210',
      waMessageId: 'wamid.retry',
      body: 'first arrival',
    });

    expect(first.duplicate).toBe(false);
    expect(second.duplicate).toBe(true);
    expect(second.id).toBe(first.id);
    expect(second.leadId).toBe(first.leadId);
    // One row, not two. A parent who wrote once must not appear to have
    // written twice because the bridge was unsure its POST landed.
    expect(state.insertedInbound).toHaveLength(1);
  });

  it('carries the ambiguity through a retry', async () => {
    state.leads = [
      { id: SIB_A, phone: '919876543210' },
      { id: SIB_B, phone: '+919876543210' },
    ];

    await BridgeOutboxService.recordInbound({ from: '919876543210', waMessageId: 'wamid.amb' });
    const again = await BridgeOutboxService.recordInbound({
      from: '919876543210',
      waMessageId: 'wamid.amb',
    });

    expect(again.duplicate).toBe(true);
    expect(again.matchStatus).toBe('ambiguous');
    expect(again.matchCandidateCount).toBe(2);
  });
});

// ===========================================================================
// The outbound contract
// ===========================================================================
describe('to_phone is canonical E.164 digits', () => {
  it.each([
    ['9876543210', '919876543210'],
    ['09876543210', '919876543210'],
    ['+91 98765 43210', '919876543210'],
    ['919876543210@s.whatsapp.net', '919876543210'],
    ['+1-555-010-9999', '15550109999'],
  ])('normalises %s to %s', (input, expected) => {
    expect(normalizeToPhone(input)).toBe(expected);
  });

  it.each(['', 'not a number', '12345', '0123456', '9'.repeat(16)])(
    'refuses %s outright rather than queueing an undialable row',
    (input) => {
      expect(normalizeToPhone(input)).toBeNull();
    }
  );

  it('writes the normalised form, never what the caller passed', async () => {
    await BridgeOutboxService.enqueue({ toPhone: '+91 98765 43210', body: 'hello' });
    expect(state.insertedOutbox[0].to_phone).toBe('919876543210');
  });

  it('throws rather than queueing an unusable number', async () => {
    await expect(
      BridgeOutboxService.enqueue({ toPhone: 'call the office', body: 'hello' })
    ).rejects.toThrow(/not a usable phone number/i);
    expect(state.insertedOutbox).toHaveLength(0);
  });
});

describe('the outbound payload matches its type', () => {
  it('refuses a text message with no body', async () => {
    await expect(
      BridgeOutboxService.enqueue({ toPhone: '919876543210', type: 'text', body: '   ' })
    ).rejects.toThrow(/needs a body/i);
  });

  it('refuses a media message with no url', async () => {
    await expect(
      BridgeOutboxService.enqueue({ toPhone: '919876543210', type: 'media', body: 'caption' })
    ).rejects.toThrow(/needs a media_url/i);
  });

  it('accepts a media message with a url and a caption', async () => {
    await BridgeOutboxService.enqueue({
      toPhone: '919876543210',
      type: 'media',
      body: 'Fee receipt',
      mediaUrl: 'https://example.org/receipt.pdf',
    });
    expect(state.insertedOutbox[0].type).toBe('media');
  });

  it('accepts a long Tamil body — the cap is characters, not bytes', async () => {
    const tamil = 'வணக்கம், கட்டணம் செலுத்தப்பட்டது. '.repeat(50);
    expect(Buffer.byteLength(tamil, 'utf8')).toBeGreaterThan(4096);
    expect([...tamil].length).toBeLessThanOrEqual(4096);

    await BridgeOutboxService.enqueue({ toPhone: '919876543210', body: tamil });
    expect(state.insertedOutbox[0].body).toBe(tamil);
  });

  it('refuses a body genuinely past WhatsApp’s character limit', async () => {
    await expect(
      BridgeOutboxService.enqueue({ toPhone: '919876543210', body: 'அ'.repeat(4097) })
    ).rejects.toThrow(/exceeds 4096 characters/i);
  });
});
