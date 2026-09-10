import { Suspense } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { BosViewGuard } from '@/components/auth/bos-view-guard';
import { PoPsoPageClient } from './_components/po-pso-page-client';

/**
 * /bos/po-pso — Institution-wise POs & PSOs maintained by the HOD.
 *
 * Scope chain: Institution → Department → Programme → Regulation. The rows
 * live in bos_programme_outcomes / bos_programme_specific_outcomes — the
 * SAME tables the /bos/compositions Outcomes tab and the syllabus CO-PO
 * editor read (single source of truth; nothing is ever deleted, outcomes
 * are soft-deactivated). Tabs: ?tab=pos | psos | mapping (course × PO/PSO).
 *
 * Access: BosViewGuard passes super-admin / principal / board members / HODs
 * (heads of ≥1 department). Writes are authorized server-side per programme
 * by canWriteProgrammeOutcomes (HOD of the owning department, principal,
 * board member, super-admin).
 */
export default function PoPsoPage() {
  return (
    <BosViewGuard module='academic.bos-compositions'>
      <Card>
        <CardContent className='p-6'>
          {/* Suspense boundary required: PoPsoPageClient's tabs use useTabParam() → useSearchParams(). */}
          <Suspense fallback={null}>
            <PoPsoPageClient />
          </Suspense>
        </CardContent>
      </Card>
    </BosViewGuard>
  );
}
