// lib/services/payments/factory.ts
import type { PaymentProvider, PaymentProviderName, PaymentModule } from './provider';
import { RazorpayProvider } from './razorpay/razorpay-provider';
import { HdfcSmartGatewayProvider } from './hdfc-smartgateway-provider';
import { resolveRazorpayCredentials, type ResolveContext } from './razorpay/resolve-credentials';

function envVarForModule(module: PaymentModule): string {
  switch (module) {
    case 'billing': return 'BILLING_PAYMENT_PROVIDER';
    case 'events':  return 'EVENTS_PAYMENT_PROVIDER';
  }
}

export function getActiveProviderName(module: PaymentModule): PaymentProviderName {
  const raw = process.env[envVarForModule(module)] ?? 'hdfc_smartgateway';
  if (raw === 'razorpay' || raw === 'hdfc_smartgateway') return raw;
  throw new Error(
    `Invalid ${envVarForModule(module)}=${raw}. Must be 'hdfc_smartgateway' or 'razorpay'.`,
  );
}

/**
 * Resolve the active payment provider for a module.
 *
 * For Razorpay, `ctx` selects which institution's credentials to use (pinned
 * accountId → institution's active account → common env account). Omitting `ctx`
 * uses the common env account, preserving the original single-account behavior.
 *
 * Async because per-institution credential resolution is a DB call.
 */
export async function getPaymentProvider(
  module: PaymentModule,
  ctx?: ResolveContext,
): Promise<PaymentProvider> {
  const name = getActiveProviderName(module);
  switch (name) {
    case 'razorpay': {
      const creds = await resolveRazorpayCredentials(ctx ?? {});
      return new RazorpayProvider(creds);
    }
    case 'hdfc_smartgateway':
      return new HdfcSmartGatewayProvider();
  }
}
