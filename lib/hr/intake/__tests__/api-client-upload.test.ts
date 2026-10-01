/**
 * The three-step upload: the export alone creates the batch, each resume goes
 * straight to storage through a signed URL (never through the route, which
 * Vercel caps near 4.5 MB), then prepare reads them. Invented files only.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createIntakeBatch, decideIntakeRow, IntakeApiClientError } from '@/lib/hr/intake/api-client';

const batch = {
  id: 'b1', source: 'cvviz_export', file_name: 'export.csv', created_by: 'u1', created_by_name: null,
  created_at: '2026-10-01T00:00:00Z', status: 'ready', row_count: 2, decided_count: 0, applied_count: 0,
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

afterEach(() => vi.unstubAllGlobals());

describe('createIntakeBatch', () => {
  it('sends the export alone, uploads resumes to storage, then prepares with their paths', async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      if (url.endsWith('/batches')) return json({ batch: { ...batch, status: 'preparing' } }, 201);
      if (url.endsWith('/upload-urls')) {
        const { files } = JSON.parse(String(init?.body));
        return json({ uploads: files.map((f: { name: string }, i: number) => ({
          name: f.name, path: `b1/file-${i}.pdf`, signed_url: 'https://x', token: `t${i}`, content_type: 'application/pdf',
        })) });
      }
      if (url.endsWith('/prepare')) return json({ batch, rows: [] });
      return json({ error: 'unexpected' }, 500);
    }));
    const uploaded: string[] = [];
    const stages: string[] = [];
    const resumes = [new File(['a'], 'one.pdf', { type: 'application/pdf' }), new File(['b'], 'two.pdf', { type: 'application/pdf' })];

    const result = await createIntakeBatch({
      exportFile: new File(['h'], 'export.csv', { type: 'text/csv' }),
      resumes,
      uploader: async (u, f) => { uploaded.push(`${u.path}<-${f.name}`); },
      onProgress: (s, d, t) => stages.push(`${s}:${d}/${t}`),
    });

    expect(result.status).toBe('ready');
    // Step 1 carries only the export — no resume ever rides through the route.
    const form = calls[0].init?.body as FormData;
    expect(form.getAll('resumes')).toHaveLength(0);
    expect((form.get('export') as File).name).toBe('export.csv');
    expect(uploaded.sort()).toEqual(['b1/file-0.pdf<-one.pdf', 'b1/file-1.pdf<-two.pdf']);
    const prepareBody = JSON.parse(String(calls[2].init?.body));
    expect(prepareBody.uploaded).toHaveLength(2);
    expect(stages).toContain('resumes:2/2');
    expect(stages.at(-1)).toBe('reading:1/1');
  });

  it('skips the storage step when there are no resumes', async () => {
    const urls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      urls.push(url);
      return url.endsWith('/batches') ? json({ batch: { ...batch, status: 'preparing' } }, 201) : json({ batch, rows: [] });
    }));
    await createIntakeBatch({ exportFile: new File(['h'], 'e.csv'), resumes: [], uploader: async () => { throw new Error('must not upload'); } });
    expect(urls.map((u) => u.split('/').pop())).toEqual(['batches', 'prepare']);
  });

  it('stops with a plain error when a storage upload fails, and never prepares', async () => {
    const urls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      urls.push(url);
      if (url.endsWith('/batches')) return json({ batch: { ...batch, status: 'preparing' } }, 201);
      const { files } = JSON.parse(String(init?.body));
      return json({ uploads: files.map((f: { name: string }) => ({ name: f.name, path: 'b1/x', signed_url: 's', token: 't', content_type: 'application/pdf' })) });
    }));
    await expect(createIntakeBatch({
      exportFile: new File(['h'], 'e.csv'),
      resumes: [new File(['a'], 'one.pdf')],
      uploader: async () => { throw new IntakeApiClientError('Could not upload one.pdf: denied', 0); },
    })).rejects.toThrow('Could not upload one.pdf');
    expect(urls.some((u) => u.endsWith('/prepare'))).toBe(false);
  });
});

describe('decideIntakeRow', () => {
  it('returns the row and says when a correction could not be remembered', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ row: { id: 'r1' }, rule: null, rule_error: 'job is closed' })));
    const out = await decideIntakeRow('r1', { action: 'file_under_job', job_id: 'j1' });
    expect(out.row.id).toBe('r1');
    expect(out.ruleError).toBe('job is closed');
  });
});
