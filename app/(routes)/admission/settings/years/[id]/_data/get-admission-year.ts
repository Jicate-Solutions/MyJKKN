/**
 * Server-side data fetcher for Admission Year detail page.
 *
 * SERVER-SIDE — uses server Supabase client (RLS enforced via logged-in cookie).
 * Client-side mirror: AdmissionYearService.getAdmissionYear in
 * lib/services/admission/admission-year-service.ts. Keep shapes in sync.
 */

import { createClient } from '@/lib/supabase/server';
import type { AdmissionYear } from '@/types/admission';
import { notFound } from 'next/navigation';

export async function getAdmissionYear(id: string): Promise<AdmissionYear> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('admission_years')
    .select(
      `*,
       institution:institutions (id, name, counselling_code),
       program:programs (id, program_id, program_name, program_duration_yrs)`
    )
    .eq('id', id)
    .single();

  if (error) {
    console.error('[getAdmissionYear] Error fetching admission year:', error);
    if (error.code === 'PGRST116') notFound();
    throw new Error(`Failed to fetch admission year: ${error.message}`);
  }

  if (!data) notFound();

  return data as AdmissionYear;
}
