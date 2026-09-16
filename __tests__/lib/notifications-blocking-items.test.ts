/**
 * mapBlockingItems — the one mapping shared by /api/notifications/pulse and
 * /api/notifications/acknowledge (2026-09-16).
 *
 * Load-bearing: ack rows keep EXACTLY the derived fields the gate always had
 * (deadline_at = sent_at + deadline hours, is_overdue), bug-feedback rows carry
 * the snooze state the gate decides "Ask me later" from, and an untagged row
 * (older payload) still reads as an ack.
 */
import { describe, it, expect } from 'vitest';
import { mapBlockingItems, BUG_FEEDBACK_MAX_SNOOZES } from '@/lib/notifications/blocking-items';

const NOW = new Date('2026-09-16T10:00:00.000Z');

describe('mapBlockingItems', () => {
  it('maps an ack row exactly as before (deadline from sent_at + hours, overdue flag)', () => {
    const [item] = mapBlockingItems(
      [
        {
          kind: 'ack',
          id: 'un-1',
          notification_id: 'n-1',
          title: 'Fee circular',
          body: 'Read me',
          priority: 'high',
          category: 'finance',
          url: null,
          created_by_name: null,
          sent_at: '2026-09-16T01:00:00.000Z',
          created_at: '2026-09-16T01:00:00.000Z',
          acknowledgment_deadline_hours: 4,
          metadata: null
        }
      ],
      NOW
    );
    expect(item).toMatchObject({
      kind: 'ack',
      id: 'un-1',
      notification_id: 'n-1',
      created_by_name: 'System',
      deadline_at: '2026-09-16T05:00:00.000Z',
      is_overdue: true
    });
    expect(item.answer_options).toBeUndefined();
    expect(item.request_id).toBeUndefined();
  });

  it('treats a row with no kind as an ack (older RPC payloads)', () => {
    const [item] = mapBlockingItems([{ id: 'x', notification_id: 'n', sent_at: '2026-09-16T09:00:00.000Z' }], NOW);
    expect(item.kind).toBe('ack');
    expect(item.is_overdue).toBe(false);
  });

  it('carries the answer options for a must-answer row', () => {
    const [item] = mapBlockingItems(
      [{ kind: 'answer', id: 'un-2', notification_id: 'n-2', sent_at: '2026-09-16T09:00:00.000Z', answer_options: ['Yes', 'No', 3] }],
      NOW
    );
    expect(item.kind).toBe('answer');
    expect(item.answer_options).toEqual(['Yes', 'No', '3']);
  });

  it('maps a bug-feedback row: never overdue, deadline = expires_at, can_snooze below the cap', () => {
    const rows = [
      {
        kind: 'bug_feedback',
        id: 'req-1',
        notification_id: 'req-1',
        title: 'You reported BUG-1 — is it fixed for you?',
        body: 'It broke',
        sent_at: '2026-09-10T00:00:00.000Z',
        expires_at: '2026-11-09T00:00:00.000Z',
        request_id: 'req-1',
        bug_id: 'bug-1',
        display_id: 'BUG-1',
        snooze_count: 2
      },
      { kind: 'bug_feedback', id: 'req-2', notification_id: 'req-2', sent_at: '2026-09-10T00:00:00.000Z', expires_at: '2026-11-09T00:00:00.000Z', request_id: 'req-2', snooze_count: BUG_FEEDBACK_MAX_SNOOZES }
    ];
    const [a, b] = mapBlockingItems(rows, NOW);
    expect(a).toMatchObject({
      kind: 'bug_feedback',
      request_id: 'req-1',
      display_id: 'BUG-1',
      deadline_at: '2026-11-09T00:00:00.000Z',
      is_overdue: false,
      snooze_count: 2,
      can_snooze: true,
      created_by_name: 'MyJKKN bug fixes'
    });
    expect(b.can_snooze).toBe(false);
  });

  it('returns an empty list for null input', () => {
    expect(mapBlockingItems(null)).toEqual([]);
  });
});
