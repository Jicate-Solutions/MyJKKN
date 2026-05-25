// lib/services/payments/factory.ts
import type { PaymentProvider, PaymentProviderName, PaymentModule } from './provider';
import { RazorpayProvider } from './razorpay/razorpay-provider';
import { HdfcSmartGatewayProvider } from './hdfc-smartgateway-provider';

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

export function getPaymentProvider(module: PaymentModule): PaymentProvider {
  const name = getActiveProviderName(module);
  switch (name) {
    case 'razorpay':          return new RazorpayProvider();
    case 'hdfc_smartgateway': return new HdfcSmartGatewayProvider();
  }
}
