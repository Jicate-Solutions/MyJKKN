/**
 * Notifications — POST /api/notifications/link-preview SSRF guard.
 *
 * This route exists because YouTube's oEmbed endpoint does not reliably send
 * CORS headers, so the browser cannot resolve a video's title itself. That
 * makes it a server endpoint that fetches on behalf of a caller-supplied
 * string — the textbook SSRF shape. Handed
 * http://169.254.169.254/latest/meta-data/ a naive implementation reads cloud
 * instance credentials and hands them back over the wire.
 *
 * The guard is deliberately NOT a blocklist of bad hosts (blocklists lose to
 * redirects, DNS rebinding, IPv6 forms, decimal-encoded IPs). Instead the
 * caller's string is never fetched: it is parsed down to an 11-character video
 * id, and the only URL that reaches fetch() is REBUILT from that id against a
 * hard-coded youtube.com origin.
 *
 * The load-bearing assertion in this file is therefore not "returns 400" — it
 * is `expect(fetchMock).not.toHaveBeenCalled()`. A 400 with the request already
 * sent would still be a live SSRF.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — declared before the handler is imported (vitest hoists vi.mock).
// ---------------------------------------------------------------------------

let currentUser: { id: string } | null = { id: 'user-admin' };

/**
 * What user_has_permission('notifications.create') answers for this caller.
 * The route's gate is the same key the compose form guards on, so a sender who
 * can open compose must never be refused here.
 */
let hasNotificationsCreate = true;

vi.mock('@/lib/supabase/server', () => ({
  createClient: () =>
    Promise.resolve({
      auth: {
        getUser: () =>
          Promise.resolve({ data: { user: currentUser }, error: null })
      },
      rpc: (fn: string, args: { permission_name?: string }) => {
        if (fn === 'user_has_permission') {
          return Promise.resolve({
            data:
              args?.permission_name === 'notifications.create'
                ? hasNotificationsCreate
                : false,
            error: null
          });
        }
        return Promise.resolve({ data: null, error: null });
      }
    })
}));

vi.mock('next/server', async () => {
  const actual = await vi.importActual<typeof import('next/server')>('next/server');
  return { ...actual, connection: () => Promise.resolve() };
});

// SUT imported AFTER the mocks.
import { POST } from '@/app/api/notifications/link-preview/route';

const VIDEO_ID = '1LbkGBuCmpA'; // the Director's reference video
const OEMBED_URL =
  'https://www.youtube.com/oembed?url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3D1LbkGBuCmpA&format=json';

const OEMBED_BODY = {
  title: 'JKKN SCHOOL OF INFLUENCERS',
  author_name: 'JKKN INSTITUTIONS',
  thumbnail_url: 'https://i.ytimg.com/vi/1LbkGBuCmpA/hqdefault.jpg'
};

/** Stands in for the network. Every assertion about SSRF reads this. */
const fetchMock = vi.fn();

function previewRequest(body: unknown) {
  return new Request('https://jkkn.ai/api/notifications/link-preview', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  }) as any;
}

beforeEach(() => {
  currentUser = { id: 'user-admin' };
  hasNotificationsCreate = true;
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve(OEMBED_BODY)
  });
  vi.stubGlobal('fetch', fetchMock);
});

// ---------------------------------------------------------------------------
// The SSRF guard — the reason this suite exists.
// ---------------------------------------------------------------------------

/**
 * Each of these is a real SSRF technique, not a variation on "not a URL".
 * They must all be refused BEFORE any network call.
 */
const SSRF_PAYLOADS: Array<[string, string]> = [
  ['AWS/GCP instance metadata (credential theft)', 'http://169.254.169.254/latest/meta-data/'],
  ['metadata over https', 'https://169.254.169.254/latest/meta-data/iam/security-credentials/'],
  ['GCP metadata by hostname', 'http://metadata.google.internal/computeMetadata/v1/'],
  ['loopback', 'http://127.0.0.1:3000/api/admin/notifications'],
  ['loopback by name', 'http://localhost:8080/'],
  ['IPv6 loopback', 'http://[::1]:5432/'],
  ['private RFC1918 range', 'http://10.0.0.5/internal'],
  ['private 192.168 range', 'http://192.168.1.1/admin'],
  ['decimal-encoded loopback', 'http://2130706433/'],
  ['file scheme', 'file:///etc/passwd'],
  ['supabase internal', 'http://kong:8000/rest/v1/profiles'],
  ['plain external site', 'https://example.com'],
  ['attacker host with a real video id in the path', 'https://evil.example.com/watch?v=1LbkGBuCmpA'],
  ['look-alike host (suffix trick)', 'https://youtube.com.evil.example.com/watch?v=1LbkGBuCmpA'],
  ['look-alike host (prefix trick)', 'https://notyoutube.com/watch?v=1LbkGBuCmpA'],
  ['open redirector pointing at YouTube', 'https://example.com/r?to=https://www.youtube.com/watch?v=1LbkGBuCmpA'],
  ['userinfo trick', 'https://www.youtube.com@evil.example.com/watch?v=1LbkGBuCmpA'],
  ['gopher scheme', 'gopher://127.0.0.1:6379/_INFO'],
  ['not a URL at all', 'just some text'],
  ['empty string', '']
];

describe('POST /api/notifications/link-preview — SSRF guard', () => {
  it.each(SSRF_PAYLOADS)('rejects %s and never fetches it', async (_label, url) => {
    const res = await POST(previewRequest({ url }));

    expect(res.status).toBe(400);
    // THE assertion. A 400 after the request left the box is still an SSRF.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('never lets a caller-supplied string reach fetch, even a valid YouTube one', async () => {
    // A genuine YouTube link carrying params an attacker might hope survive
    // into the outbound request.
    await POST(
      previewRequest({
        url: `https://www.youtube.com/watch?v=${VIDEO_ID}&list=PLevil&t=1&redirect=http://169.254.169.254/`
      })
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const requested = String(fetchMock.mock.calls[0][0]);

    // The outbound URL is the reconstruction, byte for byte — nothing the
    // caller typed beyond the 11-char id survives.
    expect(requested).toBe(OEMBED_URL);
    expect(requested).not.toContain('169.254.169.254');
    expect(requested).not.toContain('PLevil');
    expect(requested).not.toContain('redirect');
    expect(new URL(requested).origin).toBe('https://www.youtube.com');
  });

  it('rejects a non-string url field without fetching', async () => {
    for (const url of [null, 42, { href: 'https://www.youtube.com' }, ['x']]) {
      fetchMock.mockClear();
      const res = await POST(previewRequest({ url }));
      expect(res.status).toBe(400);
      expect(fetchMock).not.toHaveBeenCalled();
    }
  });

  it('rejects a malformed body without fetching', async () => {
    const bad = new Request('https://jkkn.ai/api/notifications/link-preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not json'
    }) as any;

    const res = await POST(bad);
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Auth — an unauthenticated caller must not be able to use us as a proxy.
// ---------------------------------------------------------------------------

describe('POST /api/notifications/link-preview — auth', () => {
  it('refuses an unauthenticated caller with 401 and never fetches', async () => {
    currentUser = null;
    const res = await POST(
      previewRequest({ url: `https://www.youtube.com/watch?v=${VIDEO_ID}` })
    );

    expect(res.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Authorisation — being logged in is not enough.
//
// A session alone used to be the whole gate, which made this route a YouTube
// metadata fetcher available to every learner on the platform. The gate is
// now notifications.create — the same key the compose form at
// /notifications/admin/new guards on, because that form is this route's only
// caller. Any other key would 403 a sender looking at a working page.
// ---------------------------------------------------------------------------

describe('POST /api/notifications/link-preview — authorisation', () => {
  it('refuses a logged-in caller without notifications.create with 403 and never fetches', async () => {
    hasNotificationsCreate = false;

    const res = await POST(
      previewRequest({ url: `https://www.youtube.com/watch?v=${VIDEO_ID}` })
    );

    expect(res.status).toBe(403);
    // The point of the gate: no outbound request is made on their behalf.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('says what happened rather than failing silently', async () => {
    hasNotificationsCreate = false;

    const res = await POST(
      previewRequest({ url: `https://www.youtube.com/watch?v=${VIDEO_ID}` })
    );
    const body = await res.json();

    expect(typeof body.error).toBe('string');
    expect(body.error).toMatch(/permission/i);
  });

  it('keeps 401 (no session) and 403 (session, no permission) distinct', async () => {
    currentUser = null;
    hasNotificationsCreate = true;
    expect(
      (await POST(previewRequest({ url: `https://youtu.be/${VIDEO_ID}` }))).status
    ).toBe(401);

    currentUser = { id: 'learner-1' };
    hasNotificationsCreate = false;
    expect(
      (await POST(previewRequest({ url: `https://youtu.be/${VIDEO_ID}` }))).status
    ).toBe(403);
  });

  it('refuses before parsing, so an unauthorised SSRF attempt still never fetches', async () => {
    hasNotificationsCreate = false;

    const res = await POST(
      previewRequest({ url: 'http://169.254.169.254/latest/meta-data/' })
    );

    expect(res.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('still resolves the preview for a caller who HAS notifications.create', async () => {
    hasNotificationsCreate = true;

    const res = await POST(
      previewRequest({ url: `https://www.youtube.com/watch?v=${VIDEO_ID}` })
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      videoId: VIDEO_ID,
      title: 'JKKN SCHOOL OF INFLUENCERS',
      author: 'JKKN INSTITUTIONS',
      thumbnailUrl: 'https://i.ytimg.com/vi/1LbkGBuCmpA/hqdefault.jpg'
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toBe(OEMBED_URL);
  });
});

// ---------------------------------------------------------------------------
// Behaviour — the payload the compose form stores on metadata.link_preview.
// ---------------------------------------------------------------------------

describe('POST /api/notifications/link-preview — resolved payload', () => {
  it('returns the oEmbed title, author and thumbnail', async () => {
    const res = await POST(
      previewRequest({ url: `https://youtu.be/${VIDEO_ID}` })
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      videoId: VIDEO_ID,
      title: 'JKKN SCHOOL OF INFLUENCERS',
      author: 'JKKN INSTITUTIONS',
      thumbnailUrl: 'https://i.ytimg.com/vi/1LbkGBuCmpA/hqdefault.jpg'
    });
  });

  it('accepts every link form the sender might paste', async () => {
    for (const url of [
      `https://www.youtube.com/watch?v=${VIDEO_ID}`,
      `https://youtu.be/${VIDEO_ID}`,
      `https://www.youtube.com/shorts/${VIDEO_ID}`,
      `https://www.youtube.com/live/${VIDEO_ID}`,
      `https://www.youtube-nocookie.com/embed/${VIDEO_ID}`,
      VIDEO_ID
    ]) {
      const res = await POST(previewRequest({ url }));
      expect(res.status).toBe(200);
      expect((await res.json()).videoId).toBe(VIDEO_ID);
    }
  });

  it('degrades to an id-only card when oEmbed fails — sending is never blocked', async () => {
    fetchMock.mockRejectedValue(new Error('TimeoutError'));

    const res = await POST(
      previewRequest({ url: `https://www.youtube.com/watch?v=${VIDEO_ID}` })
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      videoId: VIDEO_ID,
      title: null,
      author: null,
      // Derived from the id with no network call, so the card still renders.
      thumbnailUrl: `https://img.youtube.com/vi/${VIDEO_ID}/hqdefault.jpg`,
      degraded: true
    });
  });

  it('degrades on a non-200 from oEmbed (private/deleted video)', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
      json: () => Promise.resolve({})
    });

    const res = await POST(
      previewRequest({ url: `https://www.youtube.com/watch?v=${VIDEO_ID}` })
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.videoId).toBe(VIDEO_ID);
    expect(body.degraded).toBe(true);
  });

  it('falls back to the derived thumbnail when oEmbed omits one', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ title: 'A video', author_name: 'JKKN' })
    });

    const res = await POST(
      previewRequest({ url: `https://www.youtube.com/watch?v=${VIDEO_ID}` })
    );

    expect((await res.json()).thumbnailUrl).toBe(
      `https://img.youtube.com/vi/${VIDEO_ID}/hqdefault.jpg`
    );
  });
});
