/**
 * OneMark Wave 3 Lane D — /api/foundation/onemark/assets must refuse before it
 * writes.
 *
 * What these hold on to, in order of how much damage a regression does:
 *   1. No signed-out or unpermitted caller ever reaches the bucket, and a
 *      refusal is an explicit status with a reason — never an empty 200, never
 *      a redirect (rule 27).
 *   2. Alt text is MANDATORY (ruling #4): an attach with no description is a
 *      400 and NOTHING is uploaded.
 *   3. A hostile SVG and an oversized or mislabelled file are refused before a
 *      single byte reaches storage.
 *   4. When the row insert is refused after the bytes landed, the object is
 *      taken back out — a rejected attach leaves no orphan.
 *   5. A learner's read is a 60-second SIGNED url, never a public one.
 *   6. Until Lane S3 creates the bucket, an attach is a 503 that says so.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

let currentUser: { id: string } | null = { id: 'author-1' };
let permissions: Record<string, boolean> = {
  'foundation.items.manage': true,
  'foundation.practice.take': false,
};

let uploadError: { message: string } | null = null;
let insertError: { message: string } | null = null;
let uploaded: Array<{ path: string; contentType: string; bytes: Buffer }> = [];
let removed: string[][] = [];
let signCalls: Array<{ paths: string[]; ttl: number }> = [];
let adminRows: any[] = [];

vi.mock('next/server', async () => {
  const actual = await vi.importActual<any>('next/server');
  return { ...actual, connection: () => Promise.resolve() };
});

const storage = {
  from: () => ({
    upload: (path: string, body: Buffer, opts: any) => {
      if (uploadError) return Promise.resolve({ error: uploadError });
      uploaded.push({ path, contentType: opts?.contentType, bytes: Buffer.from(body) });
      return Promise.resolve({ error: null });
    },
    remove: (paths: string[]) => {
      removed.push(paths);
      return Promise.resolve({ error: null });
    },
    createSignedUrls: (paths: string[], ttl: number) => {
      signCalls.push({ paths, ttl });
      return Promise.resolve({
        data: paths.map((p) => ({ path: p, signedUrl: `https://signed.example/${p}?token=t` })),
        error: null,
      });
    },
  }),
};

function sessionClient() {
  return {
    auth: { getUser: () => Promise.resolve({ data: { user: currentUser } }) },
    rpc: (name: string, args: any) =>
      Promise.resolve({
        data: name === 'user_has_permission' ? permissions[args?.permission_name] === true : null,
        error: null,
      }),
    from: () => ({
      insert: () => ({
        select: () => ({
          single: () =>
            Promise.resolve(
              insertError
                ? { data: null, error: insertError }
                : {
                    data: {
                      id: 'asset-1',
                      item_id: '11111111-1111-4111-8111-111111111111',
                      asset_type: 'png',
                      storage_path: uploaded[0]?.path ?? 'x/y.png',
                      alt_text: 'a described diagram',
                      sort_order: 1,
                      created_at: 'now',
                      updated_at: 'now',
                    },
                    error: null,
                  },
            ),
        }),
      }),
    }),
  };
}

function adminClient() {
  const builder: any = {
    select: () => builder,
    eq: () => builder,
    in: () => builder,
    neq: () => builder,
    order: () => builder,
    then: (resolve: any) => resolve({ data: adminRows, error: null }),
  };
  return { from: () => builder, storage };
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => Promise.resolve(sessionClient()),
  createServiceRoleClient: () => adminClient(),
}));

const { GET, POST, looksLikeMissingBucket, normaliseSortOrder } = await import(
  '@/app/api/foundation/onemark/assets/route'
);
const { ONEMARK_ASSET_SIGNED_URL_TTL_SECONDS } = await import('@/lib/onemark/assets/constants');

const ITEM = '11111111-1111-4111-8111-111111111111';
const GOOD_ALT = 'A circuit with two resistors in parallel across a six volt cell.';
const PNG_BYTES = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAAAAAA6fptVAAAACklEQVR4nGNiAAAABgADNjd8qAAAAABJRU5ErkJggg==',
  'base64',
);

function postRequest(fields: Record<string, string>, file?: { name: string; type: string; body: Buffer }) {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.set(k, v);
  if (file) {
    form.set('file', new File([new Uint8Array(file.body)], file.name, { type: file.type }));
  }
  return new Request('http://localhost/api/foundation/onemark/assets', { method: 'POST', body: form }) as any;
}

function getRequest(query: string) {
  return { nextUrl: new URL(`http://localhost/api/foundation/onemark/assets${query}`) } as any;
}

beforeEach(() => {
  currentUser = { id: 'author-1' };
  permissions = { 'foundation.items.manage': true, 'foundation.practice.take': false };
  uploadError = null;
  insertError = null;
  uploaded = [];
  removed = [];
  signCalls = [];
  adminRows = [];
});

describe('GET — who may see a question picture', () => {
  it('401s a signed-out caller', async () => {
    currentUser = null;
    const res = await GET(getRequest(`?item_id=${ITEM}`));
    expect(res.status).toBe(401);
  });

  it('403s a caller holding neither key, with a reason', async () => {
    permissions = { 'foundation.items.manage': false, 'foundation.practice.take': false };
    const res = await GET(getRequest(`?item_id=${ITEM}`));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toMatch(/do not have access/i);
  });

  it('400s a request with no usable item_id', async () => {
    expect((await GET(getRequest('?item_id=not-a-uuid'))).status).toBe(400);
    expect((await GET(getRequest(''))).status).toBe(400);
  });

  it('lets a learner holding only practice.take read, and signs for 60 seconds', async () => {
    permissions = { 'foundation.items.manage': false, 'foundation.practice.take': true };
    adminRows = [
      {
        id: 'asset-1',
        item_id: ITEM,
        asset_type: 'png',
        storage_path: `${ITEM}/a.png`,
        alt_text: GOOD_ALT,
        sort_order: 1,
        created_at: 'now',
        updated_at: 'now',
      },
    ];
    const res = await GET(getRequest(`?item_id=${ITEM}`));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(signCalls[0].ttl).toBe(ONEMARK_ASSET_SIGNED_URL_TTL_SECONDS);
    expect(ONEMARK_ASSET_SIGNED_URL_TTL_SECONDS).toBe(60);
    expect(body.assets[0].url).toContain('https://signed.example/');
    expect(body.assets[0].alt_text).toBe(GOOD_ALT);
    // A learner is never handed the storage path — only a link that dies.
    expect(body.assets[0].storage_path).toBeUndefined();
  });

  it('keeps the description when the object cannot be signed (ruling #11 fallback)', async () => {
    permissions = { 'foundation.items.manage': false, 'foundation.practice.take': true };
    adminRows = [
      {
        id: 'asset-1',
        item_id: ITEM,
        asset_type: 'png',
        storage_path: null,
        alt_text: GOOD_ALT,
        sort_order: 1,
        created_at: 'now',
        updated_at: 'now',
      },
    ];
    const body = await (await GET(getRequest(`?item_id=${ITEM}`))).json();
    expect(body.assets[0].url).toBeNull();
    expect(body.assets[0].alt_text).toBe(GOOD_ALT);
  });
});

describe('POST — attaching a picture', () => {
  it('403s a caller without foundation.items.manage, and stores nothing', async () => {
    permissions = { 'foundation.items.manage': false, 'foundation.practice.take': true };
    const res = await POST(
      postRequest({ item_id: ITEM, alt_text: GOOD_ALT }, { name: 'd.png', type: 'image/png', body: PNG_BYTES }),
    );
    expect(res.status).toBe(403);
    expect(uploaded).toHaveLength(0);
  });

  it('400s with no description, and stores nothing (ruling #4)', async () => {
    const res = await POST(
      postRequest({ item_id: ITEM, alt_text: '   ' }, { name: 'd.png', type: 'image/png', body: PNG_BYTES }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/describe the picture/i);
    expect(uploaded).toHaveLength(0);
  });

  it('415s a JPEG and names the constraint that refuses it', async () => {
    const res = await POST(
      postRequest({ item_id: ITEM, alt_text: GOOD_ALT }, { name: 'd.jpg', type: 'image/jpeg', body: PNG_BYTES }),
    );
    expect(res.status).toBe(415);
    expect((await res.json()).error).toMatch(/asset_type/);
    expect(uploaded).toHaveLength(0);
  });

  it('400s a hostile SVG before a byte reaches storage', async () => {
    const hostile = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>x()</script></svg>');
    const res = await POST(
      postRequest({ item_id: ITEM, alt_text: GOOD_ALT }, { name: 'd.svg', type: 'image/svg+xml', body: hostile }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain('<script>');
    expect(uploaded).toHaveLength(0);
  });

  it('400s a JPEG renamed .png before storage', async () => {
    const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(16)]);
    const res = await POST(
      postRequest({ item_id: ITEM, alt_text: GOOD_ALT }, { name: 'd.png', type: 'image/png', body: jpeg }),
    );
    expect(res.status).toBe(400);
    expect(uploaded).toHaveLength(0);
  });

  it('stores a clean PNG under the item folder with a generated name', async () => {
    const res = await POST(
      postRequest({ item_id: ITEM, alt_text: GOOD_ALT }, { name: '../../escape.png', type: 'image/png', body: PNG_BYTES }),
    );
    expect(res.status).toBe(201);
    expect(uploaded).toHaveLength(1);
    expect(uploaded[0].path.startsWith(`${ITEM}/`)).toBe(true);
    expect(uploaded[0].path).not.toContain('escape');
    expect(uploaded[0].path).not.toContain('..');
    expect(uploaded[0].contentType).toBe('image/png');
  });

  it('takes the bytes back out when the row insert is refused', async () => {
    insertError = { message: 'new row violates row-level security policy' };
    const res = await POST(
      postRequest({ item_id: ITEM, alt_text: GOOD_ALT }, { name: 'd.png', type: 'image/png', body: PNG_BYTES }),
    );
    expect(res.status).toBe(500);
    expect(removed).toHaveLength(1);
    expect(removed[0][0]).toBe(uploaded[0].path);
  });

  it('503s with "contract pending" until Lane S3 creates the bucket', async () => {
    uploadError = { message: 'Bucket not found' };
    const res = await POST(
      postRequest({ item_id: ITEM, alt_text: GOOD_ALT }, { name: 'd.png', type: 'image/png', body: PNG_BYTES }),
    );
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.contract_pending).toBe(true);
    expect(body.error).toMatch(/not switched on yet/i);
  });
});

describe('helpers', () => {
  it('recognises a missing bucket from the only signal storage gives', () => {
    expect(looksLikeMissingBucket('Bucket not found')).toBe(true);
    expect(looksLikeMissingBucket('bucket_not_found')).toBe(true);
    expect(looksLikeMissingBucket('Payload too large')).toBe(false);
    expect(looksLikeMissingBucket(null)).toBe(false);
  });

  it('defaults a missing or silly position to 1', () => {
    expect(normaliseSortOrder(null)).toBe(1);
    expect(normaliseSortOrder('0')).toBe(1);
    expect(normaliseSortOrder('-3')).toBe(1);
    expect(normaliseSortOrder('2.5')).toBe(1);
    expect(normaliseSortOrder('900')).toBe(1);
    expect(normaliseSortOrder('nonsense')).toBe(1);
    expect(normaliseSortOrder('3')).toBe(3);
  });
});
