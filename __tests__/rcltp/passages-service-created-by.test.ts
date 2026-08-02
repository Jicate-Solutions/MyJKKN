/**
 * RcltpPassagesService.createPassage — created_by.
 *
 * Director decision 7 (2026-07-28) notifies the person who ADDED a non-English
 * passage. rcltp_passages.created_by has no DB default and rcltp_set_updated_at
 * is the table's only trigger, so unless the insert stamps it the recipient
 * does not exist and every such notice falls to the school head instead. That
 * is what these tests pin.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Hoisted: the service builds its Supabase singleton in a STATIC initializer,
// which runs the moment the module is imported — before any plain `const` in
// this file exists.
const { state } = vi.hoisted(() => ({
  state: {
    session: null as { user: { id: string } } | null,
    getSessionImpl: null as null | (() => Promise<any>),
    inserted: [] as any[],
    getUser: null as any,
  },
}));
state.getUser = vi.fn();
const inserted = state.inserted;
const getUser = state.getUser;

vi.mock('react-hot-toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
  default: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('@/lib/supabase/client', () => ({
  createClientSupabaseClient: () => ({
    auth: {
      getSession: () => state.getSessionImpl!(),
      // Present so a switch to it would be visible; it must never be called —
      // getUser() revalidates against the auth server and stalls the write
      // (bug #1205).
      getUser: (...args: unknown[]) => state.getUser(...args),
    },
    from: () => ({
      insert: (rows: any[]) => {
        state.inserted.push(...rows);
        return {
          select: () => ({
            single: async () => ({ data: { id: 'new-passage', ...rows[0] }, error: null }),
          }),
        };
      },
    }),
  }),
}));

import { RcltpPassagesService } from '@/lib/services/rcltp/passages-service';

const INPUT = { title: 'A passage', body: 'Some text', institution_id: 'inst-1' };

beforeEach(() => {
  inserted.length = 0;
  getUser.mockClear();
  state.session = { user: { id: 'author-1' } };
  state.getSessionImpl = async () => ({ data: { session: state.session } });
});

describe('createPassage records who added it', () => {
  it('stamps the signed-in user onto created_by', async () => {
    await RcltpPassagesService.createPassage(INPUT);
    expect(inserted[0].created_by).toBe('author-1');
  });

  it('reads the cached session, never getUser()', async () => {
    await RcltpPassagesService.createPassage(INPUT);
    expect(getUser).not.toHaveBeenCalled();
  });

  it('an explicit created_by from the caller wins', async () => {
    await RcltpPassagesService.createPassage({ ...INPUT, created_by: 'importer-9' });
    expect(inserted[0].created_by).toBe('importer-9');
  });

  it('no session leaves it null rather than blocking the write', async () => {
    state.session = null;
    const result = await RcltpPassagesService.createPassage(INPUT);
    expect(inserted[0].created_by).toBeNull();
    expect(result.id).toBe('new-passage');
  });

  it('a thrown session read leaves it null rather than blocking the write', async () => {
    state.getSessionImpl = async () => {
      throw new Error('auth offline');
    };
    await RcltpPassagesService.createPassage(INPUT);
    expect(inserted[0].created_by).toBeNull();
  });

  it("does not disturb the existing 'en' default or the caller's fields", async () => {
    await RcltpPassagesService.createPassage(INPUT);
    expect(inserted[0].language).toBe('en');
    expect(inserted[0].title).toBe('A passage');
    expect(inserted[0].institution_id).toBe('inst-1');

    inserted.length = 0;
    await RcltpPassagesService.createPassage({ ...INPUT, language: 'ta' });
    expect(inserted[0].language).toBe('ta');
  });
});
