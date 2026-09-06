// hooks/admission/use-referral-rates.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ReferralRateService } from '@/lib/services/admission/referral-rate-service';
import type { CreateReferralRateInput } from '@/types/referral-rates';

export function useReferralRates(academicYear?: number) {
  return useQuery({
    queryKey: ['referral-rates', academicYear ?? 'all'],
    queryFn: () => ReferralRateService.getRates(academicYear),
  });
}

export function useReferralRateMutations() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ['referral-rates'] });

  const createRate = useMutation({
    mutationFn: (input: CreateReferralRateInput) => ReferralRateService.createRate(input),
    onSuccess: () => { toast.success('Rate saved'); invalidate(); },
    onError: (e: Error) => toast.error(e.message || 'Could not save rate'),
  });

  const updateRate = useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<CreateReferralRateInput> }) =>
      ReferralRateService.updateRate(id, input),
    onSuccess: () => { toast.success('Rate updated'); invalidate(); },
    onError: (e: Error) => toast.error(e.message || 'Could not update rate'),
  });

  const setActive = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      ReferralRateService.setActive(id, isActive),
    onSuccess: () => { toast.success('Rate updated'); invalidate(); },
    onError: (e: Error) => toast.error(e.message || 'Could not update rate'),
  });

  return { createRate, updateRate, setActive };
}

/** Preview (dry run) or generate (write) commissions. Never auto-runs. */
export function useGenerateCommissions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ year, dryRun, consultantIds }: { year: number; dryRun: boolean; consultantIds?: string[] }) =>
      ReferralRateService.generate(year, dryRun, consultantIds),
    onSuccess: (res) => {
      if (!res.dry_run) {
        toast.success(`Generated ${res.rows_written} pending commission(s)`);
        qc.invalidateQueries({ queryKey: ['commission-transactions'] });
      }
    },
    onError: (e: Error) => toast.error(e.message || 'Generation failed'),
  });
}

export function useInstitutionOptions() {
  return useQuery({ queryKey: ['rate-institutions'], queryFn: () => ReferralRateService.getInstitutions() });
}
export function useProgramOptions() {
  return useQuery({ queryKey: ['rate-programs'], queryFn: () => ReferralRateService.getPrograms() });
}
