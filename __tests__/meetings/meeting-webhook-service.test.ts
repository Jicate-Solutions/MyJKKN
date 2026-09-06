// __tests__/meetings/meeting-webhook-service.test.ts
//
// MODULE 9 — input-validation suite for MeetingWebhookService.create/update.
// A fake Supabase client records the inserted/updated row so we can assert both
// the validation gates (rejecting bad name / URL / events) and the normalized
// shape that reaches the DB (trimmed, deduped, sanitized events).

import { describe, expect, it } from 'vitest';
import {
  MeetingWebhookService,
  WEBHOOK_EVENTS,
} from '@/lib/services/meetings/meeting-webhook-service';

// Fake client: .from().insert(row).select().single() echoes the row back as if
// the DB filled defaults; .update(patch).eq().select().single() echoes patch.
function makeClient() {
  let lastInsert: Record<string, unknown> | null = null;
  let lastUpdate: Record<string, unknown> | null = null;

  const client = {
    from() {
      return {
        insert(row: Record<string, unknown>) {
          lastInsert = row;
          return {
            select() {
              return {
                single() {
                  return Promise.resolve({
                    data: { id: 'w1', is_active: true, ...row },
                    error: null,
                  });
                },
              };
            },
          };
        },
        update(patch: Record<string, unknown>) {
          lastUpdate = patch;
          return {
            eq() {
              return {
                select() {
                  return {
                    single() {
                      return Promise.resolve({ data: { id: 'w1', ...patch }, error: null });
                    },
                  };
                },
              };
            },
          };
        },
      };
    },
  };

  return {
    client: client as never,
    getInsert: () => lastInsert,
    getUpdate: () => lastUpdate,
  };
}

const HOST = '00000000-0000-0000-0000-000000000001';

describe('MeetingWebhookService.create', () => {
  it('rejects an empty name', async () => {
    const { client } = makeClient();
    const res = await MeetingWebhookService.create(client, {
      hostProfileId: HOST,
      name: '   ',
      targetUrl: 'https://example.com',
    });
    expect(res.success).toBe(false);
  });

  it('rejects a non-http URL', async () => {
    const { client } = makeClient();
    const res = await MeetingWebhookService.create(client, {
      hostProfileId: HOST,
      name: 'CRM',
      targetUrl: 'ftp://nope',
    });
    expect(res.success).toBe(false);
  });

  it('trims fields and lets the DB default the events when none given', async () => {
    const { client, getInsert } = makeClient();
    const res = await MeetingWebhookService.create(client, {
      hostProfileId: HOST,
      name: '  My Hook  ',
      targetUrl: '  https://example.com/h  ',
    });
    expect(res.success).toBe(true);
    const row = getInsert()!;
    expect(row.name).toBe('My Hook');
    expect(row.target_url).toBe('https://example.com/h');
    expect(row.events).toBeUndefined(); // let DB default apply
  });

  it('dedupes + filters events to the known set', async () => {
    const { client, getInsert } = makeClient();
    await MeetingWebhookService.create(client, {
      hostProfileId: HOST,
      name: 'H',
      targetUrl: 'https://e.com',
      events: [
        'booking.created',
        'booking.created',
        'booking.bogus' as never,
        'booking.cancelled',
      ],
    });
    const row = getInsert()!;
    expect(row.events).toEqual(['booking.created', 'booking.cancelled']);
  });
});

describe('MeetingWebhookService.update', () => {
  it('rejects an empty patch', async () => {
    const { client } = makeClient();
    const res = await MeetingWebhookService.update(client, 'w1', {});
    expect(res.success).toBe(false);
  });

  it('rejects an events array that sanitizes to empty', async () => {
    const { client } = makeClient();
    const res = await MeetingWebhookService.update(client, 'w1', {
      events: ['nope' as never],
    });
    expect(res.success).toBe(false);
  });

  it('applies an isActive toggle', async () => {
    const { client, getUpdate } = makeClient();
    const res = await MeetingWebhookService.update(client, 'w1', { isActive: false });
    expect(res.success).toBe(true);
    expect(getUpdate()!.is_active).toBe(false);
  });
});

describe('WEBHOOK_EVENTS', () => {
  it('is exactly the three booking lifecycle events', () => {
    expect([...WEBHOOK_EVENTS]).toEqual([
      'booking.created',
      'booking.cancelled',
      'booking.rescheduled',
    ]);
  });
});
