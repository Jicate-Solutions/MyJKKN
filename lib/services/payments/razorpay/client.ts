// lib/services/payments/razorpay/client.ts
import type { RazorpayError } from './types';
import type { RazorpayApiAuth } from './credentials';

const RAZORPAY_BASE_URL = 'https://api.razorpay.com/v1';

function basicAuthHeader(auth: RazorpayApiAuth): string {
  if (!auth?.keyId || !auth?.keySecret) {
    throw new Error('Razorpay keyId and keySecret must be provided');
  }
  return 'Basic ' + Buffer.from(`${auth.keyId}:${auth.keySecret}`).toString('base64');
}

export class RazorpayApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly raw: unknown,
  ) {
    super(message);
    this.name = 'RazorpayApiError';
  }
}

/**
 * Local retry helper with conditional retry-filter.
 *
 * The project's `lib/retry.ts` `withRetry` retries on ALL thrown errors and does not
 * accept a predicate. Razorpay calls must only retry on transient gateway errors
 * (502/503/504); a 4xx (auth/validation) must surface immediately. Implementing the
 * filter locally is cleaner than wrapping every call in a try/catch sentinel pattern.
 */
async function retryOnTransient<T>(
  fn: () => Promise<T>,
  opts: { attempts: number; baseDelayMs: number; retryOn: (err: unknown) => boolean },
): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < opts.attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const isLast = i === opts.attempts - 1;
      if (isLast || !opts.retryOn(err)) throw err;
      // Exponential-ish backoff: baseDelayMs * 1.5^i
      const delay = opts.baseDelayMs * Math.pow(1.5, i);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  // Unreachable, but TS requires a terminal throw
  throw lastErr;
}

export async function razorpayRequest<T>(
  method: 'GET' | 'POST',
  path: string,
  auth: RazorpayApiAuth,
  body?: Record<string, unknown> | URLSearchParams,
): Promise<T> {
  const url = `${RAZORPAY_BASE_URL}${path}`;
  const headers: Record<string, string> = {
    Authorization: basicAuthHeader(auth),
    Accept: 'application/json',
  };
  let serializedBody: string | undefined;
  if (body) {
    if (body instanceof URLSearchParams) {
      headers['Content-Type'] = 'application/x-www-form-urlencoded';
      serializedBody = body.toString();
    } else {
      headers['Content-Type'] = 'application/json';
      serializedBody = JSON.stringify(body);
    }
  }
  const doFetch = async () => {
    const res = await fetch(url, { method, headers, body: serializedBody });
    const text = await res.text();
    let json: unknown = null;
    try { json = text ? JSON.parse(text) : null; } catch { /* keep null */ }
    if (!res.ok) {
      const err = (json as RazorpayError | null)?.error;
      throw new RazorpayApiError(
        res.status,
        err?.code ?? 'UNKNOWN',
        err?.description ?? `Razorpay ${method} ${path} failed: ${res.status}`,
        json ?? text,
      );
    }
    return json as T;
  };
  return retryOnTransient(doFetch, {
    attempts: 3,
    baseDelayMs: 300,
    retryOn: (e) => e instanceof RazorpayApiError && [502, 503, 504].includes(e.status),
  });
}
