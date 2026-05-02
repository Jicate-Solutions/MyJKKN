import { Resend } from 'resend';

// Lazy singleton — Next.js 16's "Collecting page data" phase imports every
// module that's transitively reachable from a route handler, even at build
// time when env vars may be missing. Instantiating `new Resend(undefined)` at
// module top-level made the constructor throw, failing the entire build.
//
// Caller MUST handle the case where RESEND_API_KEY is unset and getResend()
// throws — typically by returning a 503 from the route handler instead of
// crashing module load.
let _client: Resend | null = null;

export function getResend(): Resend {
  if (_client) return _client;
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    throw new Error(
      'RESEND_API_KEY is not set. Email features are disabled. ' +
      'Set the env var in Vercel project settings to enable.'
    );
  }
  _client = new Resend(key);
  return _client;
}

/**
 * @deprecated Use getResend() instead — this Proxy is kept for back-compat
 * with existing call sites. It throws on first method call if the env var is
 * unset, instead of at module load time.
 */
export const resend = new Proxy({} as Resend, {
  get(_target, prop) {
    const real = getResend() as unknown as Record<string | symbol, unknown>;
    const value = real[prop];
    return typeof value === 'function' ? value.bind(real) : value;
  },
});
