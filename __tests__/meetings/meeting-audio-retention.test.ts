/**
 * The 90-day promise, kept.
 *
 * /meetings/record tells the person holding the phone that the audio is kept
 * for 90 days and then deleted. Until this cron existed, `audio_delete_after`
 * was stamped at finish and nothing ever read it — the sentence on the screen
 * was false. These tests are about the sentence being true: what gets deleted,
 * what survives, and what happens when one recording's storage misbehaves.
 *
 * Supabase and its storage are faked. What is under test is the sweep.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const SECRET = 'cron-secret-under-test';

let rows: Record<string, unknown>[];
let listed: Record<string, { name: string }[]>;
let removed: string[][];
let updates: { id: string; patch: Record<string, unknown> }[];
let removeFails: string | null;
let listFails: string | null;
/** What the query filters asked for, so the filters themselves can be asserted. */
let filters: string[];

vi.mock('@/lib/supabase/server', () => ({
  createServiceRoleClient: () => ({
    from() {
      const builder: Record<string, unknown> = {};
      builder.select = () => builder;
      builder.not = (col: string) => {
        filters.push(`not:${col}`);
        return builder;
      };
      builder.lt = (col: string) => {
        filters.push(`lt:${col}`);
        return builder;
      };
      builder.is = (col: string) => {
        filters.push(`is-null:${col}`);
        return builder;
      };
      builder.order = () => builder;
      builder.limit = async () => ({ data: rows, error: null });
      builder.update = (patch: Record<string, unknown>) => ({
        eq: async (_col: string, id: string) => {
          updates.push({ id, patch });
          return { error: null };
        },
      });
      return builder;
    },
    storage: {
      from() {
        return {
          list: async (folder: string) => {
            if (listFails && folder.includes(listFails)) {
              return { data: null, error: { message: 'storage list exploded' } };
            }
            return { data: listed[folder] ?? [], error: null };
          },
          remove: async (paths: string[]) => {
            if (removeFails && paths.some((p) => p.includes(removeFails!))) {
              return { error: { message: 'storage remove exploded' } };
            }
            removed.push(paths);
            return { error: null };
          },
        };
      },
    },
  }),
}));

import { GET } from '@/app/api/cron/meeting-audio-retention/route';

function call(query = ''): Promise<Response> {
  return GET(
    new NextRequest(`https://jkkn.ai/api/cron/meeting-audio-retention?secret=${SECRET}${query}`),
  );
}

beforeEach(() => {
  process.env.CRON_SECRET = SECRET;
  rows = [
    { id: 'rec-1', recorded_by: 'host-1', title: 'IQAC', chunk_count: 3, audio_delete_after: '2026-06-01T00:00:00Z' },
  ];
  listed = {
    'host-1/rec-1': [{ name: '0000.webm' }, { name: '0001.webm' }, { name: '0002.webm' }],
  };
  removed = [];
  updates = [];
  removeFails = null;
  listFails = null;
  filters = [];
});

describe('who is allowed to run it', () => {
  it('refuses without the secret — this endpoint deletes audio', async () => {
    const res = await GET(new NextRequest('https://jkkn.ai/api/cron/meeting-audio-retention'));
    expect(res.status).toBe(401);
    expect(removed).toHaveLength(0);
  });

  it('refuses a wrong secret', async () => {
    const res = await GET(
      new NextRequest('https://jkkn.ai/api/cron/meeting-audio-retention?secret=nope'),
    );
    expect(res.status).toBe(401);
  });

  it('accepts the Bearer header Vercel sends', async () => {
    const res = await GET(
      new NextRequest('https://jkkn.ai/api/cron/meeting-audio-retention', {
        headers: { authorization: `Bearer ${SECRET}` },
      }),
    );
    expect(res.status).toBe(200);
  });

  it('refuses to run at all when no secret is configured', async () => {
    delete process.env.CRON_SECRET;
    const res = await call();
    expect(res.status).toBe(500);
    expect(removed).toHaveLength(0);
  });
});

describe('what it picks up', () => {
  it('asks only for rows that are due and not already done', async () => {
    await call();
    expect(filters).toContain('not:audio_delete_after');
    expect(filters).toContain('lt:audio_delete_after');
    // Already-deleted rows are excluded by the query, so a re-run costs nothing
    // and can never double-report.
    expect(filters).toContain('is-null:audio_deleted_at');
  });
});

describe('what it does', () => {
  it('deletes every object in the recording and stamps the row', async () => {
    const res = await call();
    const body = await res.json();

    expect(removed).toEqual([
      ['host-1/rec-1/0000.webm', 'host-1/rec-1/0001.webm', 'host-1/rec-1/0002.webm'],
    ]);
    expect(body).toMatchObject({ success: true, swept: 1, objects_removed: 3 });
    expect(updates).toHaveLength(1);
    expect(updates[0].patch).toHaveProperty('audio_deleted_at');
  });

  it('keeps the record of the meeting — only the sound is deleted', async () => {
    await call();
    const patch = updates[0].patch;
    // The row survives with its title, length and what it was attached to.
    expect(patch).not.toHaveProperty('title');
    expect(patch).not.toHaveProperty('duration_seconds');
    expect(patch).not.toHaveProperty('booking_id');
    // chunk_count stays: how many pieces the meeting HAD is still true, and
    // zeroing it makes an old meeting read as a failed recording.
    expect(patch).not.toHaveProperty('chunk_count');
    // bytes_total goes to zero — those files do not exist any more.
    expect(patch).toMatchObject({ bytes_total: 0 });
  });

  it('deletes what is actually in the folder, not what chunk_count predicted', async () => {
    // A chunk that landed after finish is still someone's voice.
    rows = [{ ...rows[0], chunk_count: 1 }];
    const res = await call();
    const body = await res.json();
    expect(body.objects_removed).toBe(3);
  });

  it('stamps a recording whose audio was already gone', async () => {
    // Otherwise it is a candidate on every run, for ever.
    listed = { 'host-1/rec-1': [] };
    const res = await call();
    const body = await res.json();
    expect(removed).toHaveLength(0);
    expect(body).toMatchObject({ swept: 1, objects_removed: 0 });
    expect(updates).toHaveLength(1);
  });
});

describe('a dry run', () => {
  it('reports what would go and touches nothing', async () => {
    const res = await call('&dry_run=1');
    const body = await res.json();
    expect(body).toMatchObject({ dry_run: true, swept: 1, objects_removed: 3 });
    expect(removed).toHaveLength(0);
    expect(updates).toHaveLength(0);
  });
});

describe('when one recording goes wrong', () => {
  beforeEach(() => {
    rows = [
      { id: 'rec-1', recorded_by: 'host-1', title: 'IQAC', chunk_count: 1, audio_delete_after: '2026-06-01T00:00:00Z' },
      { id: 'rec-2', recorded_by: 'host-2', title: 'Interview', chunk_count: 1, audio_delete_after: '2026-06-02T00:00:00Z' },
    ];
    listed = {
      'host-1/rec-1': [{ name: '0000.webm' }],
      'host-2/rec-2': [{ name: '0000.webm' }],
    };
  });

  it('carries on with the rest, and does not stamp the one that failed', async () => {
    removeFails = 'rec-1';
    const res = await call();
    const body = await res.json();

    expect(body).toMatchObject({ success: true, swept: 1, errors: 1 });
    expect(updates.map((u) => u.id)).toEqual(['rec-2']);
    // Unstamped means it is picked up again tomorrow, rather than left with its
    // audio and a green report.
    expect(body.error_detail[0]).toMatchObject({ id: 'rec-1' });
  });

  it('treats a failed listing the same way — never stamps what it could not read', async () => {
    listFails = 'rec-2';
    const res = await call();
    const body = await res.json();
    expect(body).toMatchObject({ swept: 1, errors: 1 });
    expect(updates.map((u) => u.id)).toEqual(['rec-1']);
  });
});
