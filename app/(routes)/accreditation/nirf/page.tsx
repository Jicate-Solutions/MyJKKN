// app/(routes)/accreditation/nirf/page.tsx
// ============================================================================
// /accreditation/nirf — NIRF ranking dashboard STUB (PR-A8 c2, to be replaced by PR-A9).
// Reuses PublicationsService.calculateNIRFMetrics() and the substrate seeded
// in PR-A2. Full dashboard lands in PR-A9.
// ============================================================================
'use client';

import { BodyPlaceholderPage } from '@/components/accreditation/body-placeholder-page';

export default function NIRFDashboardPage() {
  return (
    <BodyPlaceholderPage
      bodyCode="NIRF"
      upcomingPR="PR-A9"
      description="TLR + RPC + GO + OI + PR — MoE annual ranking. Reuses the existing PublicationsService.calculateNIRFMetrics() for research, admission substrate for student intake, HR substrate for faculty."
    />
  );
}
