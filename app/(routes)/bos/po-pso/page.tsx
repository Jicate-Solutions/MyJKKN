import { Suspense } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { BosViewGuard } from '@/components/auth/bos-view-guard';
import { PoPsoPageClient } from './_components/po-pso-page-client';

/**
 * /bos/po-pso — Institution master POs & PSOs with per-board PSO overrides.
 *
 * POs are set once per institution and apply to every board (e.g. all
 * Engineering & Technology boards at CET share one PO set). PSOs default
 * from the master but each board may customize its own set.
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
