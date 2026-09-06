// Industry Partner service.
//
// Reads `public.industry_partners` — the directory of COMPANIES the institution
// partners with. Distinct from `industry_mentors` (individual people), which is
// served by `industry-mentor-service.ts` in this same folder. The table is
// already documented as CDC-owned in `lib/services/pde-employer-briefing-service.ts`,
// which is why this service lives under `lib/services/cdc/`.
//
// Every query runs on the cookie-scoped server client, so row visibility is
// decided by RLS on `industry_partners` (own institution, plus whatever
// `role_has_institution_access()` grants). This service deliberately does NOT
// add its own `.eq('institution_id', …)` filter — doing so would silently
// narrow super-admins and cross-institution roles to a single college.
//
// READ-ONLY by design. The business-card scanner
// (`lib/services/contacts/card-routing.ts` → `app/api/contacts/card-scan/*`) is
// currently the only writer, and it writes with the service-role client. No
// create/edit surface is provided here because there is no demand for manual
// entry yet.

import { createClient } from '@/lib/supabase/server';
import type {
  IndustryPartner,
  IndustryPartnerListParams,
  IndustryPartnerListResponse,
} from '@/types/cdc/industry-partners';

/**
 * PostgREST's `or()` filter is a comma/parenthesis-delimited mini-grammar, so a
 * raw user string containing `,` `(` `)` or `.` can break out of the intended
 * filter. Strip those characters rather than trying to escape them — a partner
 * search box has no legitimate need for them.
 */
function sanitizeSearch(raw: string): string {
  return raw.replace(/[,()*.\\%]/g, ' ').trim();
}

export async function listIndustryPartners(
  params: IndustryPartnerListParams = {}
): Promise<IndustryPartnerListResponse> {
  const supabase = await createClient();
  const {
    search,
    status = 'active',
    partnershipType,
    page = 1,
    limit = 25,
  } = params;

  let query = (supabase as any)
    .from('industry_partners')
    .select('*', { count: 'exact' });

  if (status === 'active') query = query.eq('is_active', true);
  if (status === 'inactive') query = query.eq('is_active', false);

  if (partnershipType) {
    query = query.eq('partnership_type', partnershipType);
  }

  if (search) {
    const term = sanitizeSearch(search);
    if (term) {
      query = query.or(
        [
          `company_name.ilike.%${term}%`,
          `industry_sector.ilike.%${term}%`,
          `contact_person.ilike.%${term}%`,
          `city.ilike.%${term}%`,
        ].join(',')
      );
    }
  }

  const safeLimit = Math.min(Math.max(limit, 1), 100);
  const safePage = Math.max(page, 1);
  const offset = (safePage - 1) * safeLimit;

  query = query
    .order('company_name', { ascending: true })
    .range(offset, offset + safeLimit - 1);

  const { data, error, count } = await query;

  if (error) throw new Error(error.message);

  return {
    partners: (data ?? []) as IndustryPartner[],
    total: count ?? 0,
    page: safePage,
    limit: safeLimit,
  };
}

export async function getIndustryPartner(
  id: string
): Promise<IndustryPartner | null> {
  const supabase = await createClient();

  const { data, error } = await (supabase as any)
    .from('industry_partners')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  // An RLS denial is indistinguishable from "no such row" — both come back as
  // null with error === null. Returning null for both is correct here: the page
  // renders the same "not found or not visible to you" state either way.
  if (error) throw new Error(error.message);

  return (data ?? null) as IndustryPartner | null;
}
