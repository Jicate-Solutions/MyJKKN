// =====================================================================
// /pde/admin/policies — landing page redirects to the first sub-policy.
// =====================================================================
// Matches the convention in /pde/admin/page.tsx (uses platform_policies
// for the default landing — but since this is just one sub-area with a
// single sub-page today, a static redirect is fine. When more PDE
// policy sub-pages land (Cluster B–E), swap to platform_policies lookup.
// =====================================================================

import { redirect } from 'next/navigation';

export default function AdminPdePoliciesIndex() {
  redirect('/pde/admin/policies/scoring');
}
