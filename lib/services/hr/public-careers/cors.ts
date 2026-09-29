/**
 * CORS for /api/public/careers/*. The consumer is jkkn.ac.in and its one-label
 * subdomains (all https). Origins are reflected, never '*', and credentials are
 * never allowed — these routes are anonymous by design.
 */

const JKKN_ORIGIN = /^https:\/\/([a-z0-9-]+\.)?jkkn\.ac\.in$/i;

/** Comma-separated PUBLIC_CAREERS_EXTRA_ORIGINS, e.g. http://localhost:3000 in dev. */
export function extraOrigins(): string[] {
  return (process.env.PUBLIC_CAREERS_EXTRA_ORIGINS ?? '')
    .split(',').map((o) => o.trim()).filter(Boolean);
}

export function resolveAllowedOrigin(origin: string | null, extra: string[] = extraOrigins()): string | null {
  if (!origin) return null;
  if (JKKN_ORIGIN.test(origin)) return origin;
  return extra.includes(origin) ? origin : null;
}

export function corsHeaders(allowed: string | null): Record<string, string> {
  const base: Record<string, string> = {
    Vary: 'Origin',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
  if (allowed) base['Access-Control-Allow-Origin'] = allowed;
  return base;
}

export function withCors<T extends Response>(res: T, request: Request): T {
  const headers = corsHeaders(resolveAllowedOrigin(request.headers.get('origin')));
  for (const [k, v] of Object.entries(headers)) res.headers.set(k, v);
  return res;
}

export function preflight(request: Request): Response {
  return withCors(new Response(null, { status: 204 }), request);
}
