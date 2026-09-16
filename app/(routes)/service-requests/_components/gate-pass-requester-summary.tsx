'use client';

/**
 * Read-only "who this pass is for" strip shown above the Gate Pass block.
 * Everything here is taken from the learner profile so the requester never
 * types it (requirement §2 step 1). Missing values read as a dash rather
 * than blocking the form — the profile is the source of truth, not this card.
 */

import { useQuery } from '@tanstack/react-query';
import { UserRound } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { createClientSupabaseClient } from '@/lib/supabase/client';

interface LearnerSummary {
  fullName: string;
  rollNumber: string | null;
  registerNumber: string | null;
  email: string | null;
  mobile: string | null;
}

export function GatePassRequesterSummary() {
  const { profile } = useAuth();
  const learnerId = (profile as { learner_id?: string | null } | null)?.learner_id ?? null;

  const { data } = useQuery<LearnerSummary>({
    queryKey: ['gate-pass', 'requester-summary', profile?.id, learnerId],
    enabled: !!profile?.id,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const fallback: LearnerSummary = {
        fullName: profile?.full_name ?? '',
        rollNumber: null,
        registerNumber: null,
        email: profile?.email ?? null,
        mobile: (profile as { phone_number?: string | null } | null)?.phone_number ?? null,
      };
      if (!learnerId) return fallback;
      try {
        const supabase = createClientSupabaseClient();
        const { data: row } = await supabase
          .from('learners_profiles')
          .select('first_name, last_name, roll_number, register_number, college_email, student_email, student_mobile')
          .eq('id', learnerId)
          .maybeSingle();
        if (!row) return fallback;
        const r = row as Record<string, string | null>;
        const name = [r.first_name, r.last_name].filter(Boolean).join(' ').trim();
        return {
          fullName: name || fallback.fullName,
          rollNumber: r.roll_number,
          registerNumber: r.register_number,
          email: r.college_email || r.student_email || fallback.email,
          mobile: r.student_mobile || fallback.mobile,
        };
      } catch {
        return fallback;
      }
    },
  });

  const cell = (label: string, value: string | null | undefined) => (
    <div className="min-w-0">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="truncate text-sm font-medium">{value || '—'}</p>
    </div>
  );

  return (
    <div className="rounded-lg border bg-muted/40 p-4">
      <p className="mb-3 flex items-center gap-2 text-sm font-semibold">
        <UserRound className="h-4 w-4" />
        Gate pass will be issued to
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {cell('Name', data?.fullName ?? profile?.full_name)}
        {cell('Roll number', data?.rollNumber)}
        {cell('Register number', data?.registerNumber)}
        {cell('Email', data?.email ?? profile?.email)}
        {cell('Mobile', data?.mobile)}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        These details come from your profile. If something is wrong, update the profile
        before submitting.
      </p>
    </div>
  );
}
