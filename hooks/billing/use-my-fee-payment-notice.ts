'use client';

// The signed-in learner's own 48-hour Transport Maintenance Fee notice, read
// through fn_my_fee_payment_notice() (SECURITY DEFINER, returns only the
// caller's row; tms_fee_payment_notice itself has no client RLS policy).
// Polls every minute while a countdown runs, so a payment or a raised
// Transport Fee reaches the banner without a reload.
import { useQuery } from '@tanstack/react-query';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import type { FeePaymentNotice } from '@/lib/billing/fee-payment-notice';

// fn_my_fee_payment_notice is a TMS function, not in the generated types.
type UntypedRpc = { rpc: (fn: string) => PromiseLike<{ data: unknown; error: { message: string } | null }> };

export function useMyFeePaymentNotice(enabled = true) {
  return useQuery({
    queryKey: ['my-fee-payment-notice'],
    enabled,
    staleTime: 30 * 1000,
    refetchOnWindowFocus: true,
    refetchInterval: (q) => (q.state.data?.status === 'running' ? 60_000 : false),
    queryFn: async (): Promise<FeePaymentNotice | null> => {
      const supabase = createClientSupabaseClient() as unknown as UntypedRpc;
      const { data, error } = await supabase.rpc('fn_my_fee_payment_notice');
      if (error) throw new Error(error.message);
      if (!data) return null;
      const n = data as FeePaymentNotice;
      return { ...n, amount: Number(n.amount) || 0, urgent_hours: Number(n.urgent_hours) || 6 };
    },
  });
}
