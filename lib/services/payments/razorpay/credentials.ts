// lib/services/payments/razorpay/credentials.ts
//
// Pure credential types for the Razorpay provider. NO server-only import here so
// these types can be referenced from any layer — but the VALUES (keySecret /
// webhookSecret) are only ever produced server-side by the account vault / env
// resolver, and must NEVER be sent to the browser or logged.

/** Minimal auth needed for a Razorpay REST call (HTTP Basic). */
export interface RazorpayApiAuth {
  keyId: string;
  keySecret: string;
}

/** Fully-resolved credentials for one Razorpay account. */
export interface RazorpayCredentials extends RazorpayApiAuth {
  /** Webhook signing secret (distinct from keySecret). */
  webhookSecret: string;
  mode: 'test' | 'live';
  /** Where the credentials came from — useful for logging/audit (no secrets). */
  source: 'institution' | 'env';
  /** Set when sourced from a razorpay_accounts row. */
  accountId?: string;
  institutionId?: string;
  webhookRef?: string;
}
