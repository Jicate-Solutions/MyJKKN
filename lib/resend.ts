import { Resend } from 'resend';

// The Resend constructor throws when RESEND_API_KEY is absent. Constructing the
// client at module load therefore made this file impossible to even IMPORT in an
// environment without that key — and because ten modules import it, `next build`
// died during page-data collection on a route the change under test had never
// touched (most often /api/bug-reports/[id]). CI carries the key, so CI never saw
// it; the failure only ever appeared locally, which is precisely where it made the
// build gate untrustworthy. Two separate agents lost time isolating it.
//
// Construction is therefore deferred to the first property access. Importing is
// always safe; a missing key still fails loudly, with the library's own message,
// at the moment an email is actually sent.

let client: Resend | null = null;

function getClient(): Resend {
  if (client === null) {
    client = new Resend(process.env.RESEND_API_KEY);
  }
  return client;
}

/**
 * Shared Resend client. Same shape and same behaviour as a directly constructed
 * `new Resend(process.env.RESEND_API_KEY)` — the only difference is WHEN the
 * constructor runs, and therefore when a missing key is reported.
 */
export const resend = new Proxy({} as Resend, {
  get(_target, property) {
    const instance = getClient();
    const value = Reflect.get(instance, property);
    return typeof value === 'function' ? value.bind(instance) : value;
  },
});
