/**
 * OneMark — /api/foundation/onemark/paper/[id]/pdf must refuse before it reads.
 *
 * Same discipline as facilitate-route-permission.test.ts: "not allowed" is a
 * 403 with a reason, never an empty 200 and never a redirect. The renderer and
 * the loader are mocked — this file is about the gate and the query string.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

let currentUser: { id: string } | null = { id: 'user-1' };
let permissionResult: boolean | null = true;
let rpcCalls: Array<{ name: string; args: any }> = [];
let loadCalls: Array<{ id: string; includeAnswers: boolean }> = [];
let renderCalls: string[] = [];
let modelResult: any = { assessmentId: 'a1' };
let renderImpl: ((series: string) => Promise<any>) | null = null;

vi.mock('next/server', async () => {
  const actual = await vi.importActual<any>('next/server');
  return { ...actual, connection: () => Promise.resolve() };
});

vi.mock('@/lib/supabase/server', () => ({
  createClient: () =>
    Promise.resolve({
      auth: { getUser: () => Promise.resolve({ data: { user: currentUser } }) },
      rpc: (name: string, args: any) => {
        rpcCalls.push({ name, args });
        return Promise.resolve({ data: name === 'user_has_permission' ? permissionResult : null, error: null });
      },
    }),
  createServiceRoleClient: () => ({}),
}));

vi.mock('@/lib/onemark/pdf/load-paper', () => ({
  loadPaperModel: (id: string, opts: { includeAnswers: boolean }) => {
    loadCalls.push({ id, includeAnswers: opts.includeAnswers });
    return Promise.resolve(modelResult);
  },
}));

vi.mock('@/lib/onemark/pdf/render', () => ({
  renderQuestionPaperPdf: (_m: any, series: string) => {
    renderCalls.push(`paper:${series}`);
    if (renderImpl) return renderImpl(series);
    return Promise.resolve({ buffer: Buffer.from('%PDF-paper'), filename: `paper-${series}.pdf` });
  },
  renderAnswerKeyPdf: (_m: any, series: string) => {
    renderCalls.push(`key:${series}`);
    return Promise.resolve({ buffer: Buffer.from('%PDF-key'), filename: `key-${series}.pdf` });
  },
}));

import { GET } from '@/app/api/foundation/onemark/paper/[id]/pdf/route';

function call(query = '') {
  const req = new (require('next/server').NextRequest)(`http://localhost/api/foundation/onemark/paper/a1/pdf${query}`);
  return GET(req, { params: Promise.resolve({ id: 'a1' }) });
}

beforeEach(() => {
  currentUser = { id: 'user-1' };
  permissionResult = true;
  rpcCalls = [];
  loadCalls = [];
  renderCalls = [];
  modelResult = { assessmentId: 'a1' };
  renderImpl = null;
});

describe('GET /api/foundation/onemark/paper/[id]/pdf', () => {
  it('401 when signed out, before any read', async () => {
    currentUser = null;
    const res = await call();
    expect(res.status).toBe(401);
    expect(loadCalls).toEqual([]);
  });

  it('403 with a reason without foundation.assessments.manage — nothing loaded, nothing rendered', async () => {
    permissionResult = false;
    const res = await call('?key=1');
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/foundation\.assessments\.manage/);
    expect(rpcCalls[0]).toEqual({ name: 'user_has_permission', args: { permission_name: 'foundation.assessments.manage' } });
    expect(loadCalls).toEqual([]);
    expect(renderCalls).toEqual([]);
  });

  it('a null permission result (RPC error / no row) is refused, not allowed', async () => {
    permissionResult = null;
    const res = await call();
    expect(res.status).toBe(403);
  });

  it('400 on a series outside A–D', async () => {
    const res = await call('?series=E');
    expect(res.status).toBe(400);
    expect(loadCalls).toEqual([]);
  });

  it('404 when the paper is not visible to the caller — and the message promises no state check the code does not make', async () => {
    modelResult = null;
    const res = await call();
    expect(res.status).toBe(404);
    expect(renderCalls).toEqual([]);
    const body = await res.json();
    expect(body.error).not.toMatch(/finalis/i);
  });

  it('500 never echoes the loader error (raw PostgREST text names tables and columns)', async () => {
    modelResult = Promise.reject(new Error('column fp_items.stem_ta does not exist'));
    const res = await call('?key=1');
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('Could not render the paper');
    expect(JSON.stringify(body)).not.toContain('fp_items');
  });

  it('422 naming the item and the glyph when no embedded font can print a character — never a box', async () => {
    const { GlyphCoverageError } = await import('@/lib/onemark/pdf/notation');
    renderImpl = () => Promise.reject(new GlyphCoverageError([{ itemId: 'item-9', glyphs: ['‰ U+2030'] }]));
    const res = await call('?series=A');
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.gaps).toEqual([{ itemId: 'item-9', glyphs: ['‰ U+2030'] }]);
    expect(body.error).toMatch(/cannot print/);
  });

  it('streams the question paper WITHOUT answers by default', async () => {
    const res = await call('?series=b');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/pdf');
    expect(res.headers.get('cache-control')).toContain('no-store');
    expect(res.headers.get('content-disposition')).toContain('paper-B.pdf');
    expect(loadCalls).toEqual([{ id: 'a1', includeAnswers: false }]);
    expect(renderCalls).toEqual(['paper:B']);
  });

  it('streams the separate answer key only when key=1', async () => {
    const res = await call('?series=C&key=1');
    expect(res.status).toBe(200);
    expect(loadCalls).toEqual([{ id: 'a1', includeAnswers: true }]);
    expect(renderCalls).toEqual(['key:C']);
  });
});
