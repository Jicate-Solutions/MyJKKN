// lib/services/payments/factory.ts
import type { PaymentProvider, PaymentProviderName, PaymentModule } from './provider';
import { RazorpayProvider } from './razorpay/razorpay-provider';
import { resolveRazorpayCredentials, type ResolveContext } from './razorpay/resolve-credentials';

function envVarForModule(module: PaymentModule): string {
  switch (module) {
    case 'billing': return 'BILLING_PAYMENT_PROVIDER';
    case 'events':  return 'EVENTS_PAYMENT_PROVIDER';
    case 'ims':     return 'IMS_PAYMENT_PROVIDER';
    case 'courses': return 'COURSES_PAYMENT_PROVIDER';
  }
}

/**
 * Razorpay is the only supported provider since HDFC SmartGateway was
 * decommissioned. The per-module env switch is retained so a stray
 * `=hdfc_smartgateway` fails loudly instead of silently doing nothing;
 * an unset value defaults to razorpay.
 */
export function getActiveProviderName(module: PaymentModule): PaymentProviderName {
  const raw = process.env[envVarForModule(module)] ?? 'razorpay';
  if (raw === 'razorpay') return raw;
  throw new Error(
    `${envVarForModule(module)}=${raw} is not supported. HDFC SmartGateway has been ` +
    `decommissioned; set it to 'razorpay' or leave it unset.`,
  );
}

/**
 * Resolve the active payment provider for a module.
 *
 * `ctx` selects which institution's Razorpay credentials to use (pinned
 * accountId → institution's active account → common env account). Omitting `ctx`
 * uses the common env account.
 *
 * Async because per-institution credential resolution is a DB call.
 */
export async function getPaymentProvider(
  module: PaymentModule,
  ctx?: ResolveContext,
): Promise<PaymentProvider> {
  getActiveProviderName(module); // validates the env switch (Razorpay-only)
  const creds = await resolveRazorpayCredentials(ctx ?? {});
  return new RazorpayProvider(creds);
}
