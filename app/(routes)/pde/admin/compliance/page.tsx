// =====================================================================
// /pde/admin/compliance — parent landing
// =====================================================================
// The compliance area currently has a single live view: per-college.
// Send the user straight there so the nav entry doesn't dead-end at
// an empty index.
// =====================================================================

import { redirect } from 'next/navigation';

export const navMeta = {
  label: 'PDE Compliance',
  icon: 'ShieldCheck',
} as const;

export default function PdeCompliancePage() {
  redirect('/pde/admin/compliance/per-college');
}
