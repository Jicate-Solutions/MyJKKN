// lib/services/payments/ezetap/client.ts
//
// Transport for the p2padapter API. Differs from razorpay/client.ts on every axis
// that matters, which is why it is not a reuse of it:
//
//   - auth is `appKey` + `username` INSIDE the JSON body, not a Basic header;
//   - a vendor refusal comes back as HTTP 200 with success:false + errorCode, so
//     "the request worked" and "the vendor agreed" are two separate checks;
//   - there is no webhook and no signature: this server asking is the only proof.

import 'server-only';

import type { EzetapBaseResponse, EzetapEnvironment } from './types';

const BASE_URLS: Record<EzetapEnvironment, string> = {
  demo: 'https://demo.ezetap.com/api/3.0/p2padapter',
  live: 'https://www.ezetap.com/api/3.0/p2padapter',
};

/** A single call must not hold a cashier's request open for long. */
const REQUEST_TIMEOUT_MS = 15_000;

/**
 * Ezetap answered, and said no. `code` is the vendor's EZETAP_* code (or the
 * messageCode when no errorCode was given). Distinct from a transport failure,
 * where we do NOT know what Ezetap did.
 */
export class EzetapApiError extends Error {
  constructor(
    public readonly code: string | null,
    message: string,
    public readonly raw: unknown,
  ) {
    super(message);
    this.name = 'EzetapApiError';
  }
}

/** We could not get an answer at all (network, timeout, 5xx, unparsable body). */
export class EzetapTransportError extends Error {
  constructor(message: string, public readonly status: number | null) {
    super(message);
    this.name = 'EzetapTransportError';
  }
}

export async function ezetapRequest<T extends EzetapBaseResponse>(
  environment: EzetapEnvironment,
  action: 'pay' | 'status' | 'cancel',
  body: Record<string, unknown>,
): Promise<T> {
  const url = `${BASE_URLS[environment]}/${action}`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      cache: 'no-store',
    });
  } catch (err) {
    throw new EzetapTransportError(
      `Could not reach the payment terminal service (${action}): ${
        err instanceof Error ? err.message : String(err)
      }`,
      null,
    );
  }

  const text = await res.text();
  let json: T | null = null;
  try {
    json = text ? (JSON.parse(text) as T) : null;
  } catch {
    /* handled below */
  }

  if (!res.ok || !json) {
    // A 4xx with a vendor body is still a vendor answer.
    if (json?.errorCode) {
      throw new EzetapApiError(json.errorCode, json.errorMessage || json.errorCode, json);
    }
    throw new EzetapTransportError(
      `Payment terminal service ${action} failed: HTTP ${res.status}`,
      res.status,
    );
  }

  return json;
}
