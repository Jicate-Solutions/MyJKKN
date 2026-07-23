'use client';

// /admission/counselors/team/allocation — Tab 3 body: source list.
// Replaces the legacy counselor-centric grid (allocation-tab.tsx). Renders
// the same SourcesDataTable used by /admission/settings/sources but in
// 'allocate' mode: no "New Source" toolbar (CRUD lives in /settings/sources),
// no per-row actions dropdown, and label clicks navigate to the per-source
// assignment workspace at /admission/counselors/team/allocation/{id}.

import { SourcesDataTable } from '@/app/(routes)/admission/settings/sources/_components/sources-data-table';

export default function AllocationPage() {
  return <SourcesDataTable variant="allocate" />;
}
