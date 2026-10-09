// app/(routes)/instasolver/requirements/new/page.tsx
//
// ONE report path (Director, 5–6 Oct 2026). Buying is not an InstaSolver lane
// (decision I3): the chooser's Buy option sends people who may raise a purchase
// request to Procurement, and tells everyone else whom to ask. Old bookmarks and
// buttons that still point at this "Request an item" form land on the chooser
// with the "Reporting has moved here" note. The form component is kept, since
// requirements/[id] still uses it.

import { redirect } from 'next/navigation';
import { REPORTING_MOVED_HREF } from '@/lib/instasolver/one-report-path';

export default function NewRequirementPage() {
  redirect(REPORTING_MOVED_HREF);
}
