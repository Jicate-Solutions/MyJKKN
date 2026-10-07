// app/(routes)/instasolver/issues/new/page.tsx
//
// ONE report path (Director, 5–6 Oct 2026). This was the second "report an
// issue" form, from the desk ported in #4191. Reports now go only through the
// InstaSolver chooser, which routes them straight to the person who fixes it.
// Old bookmarks and buttons that still point here land on the chooser with a
// one-line "Reporting has moved here" note (Director's edge-case answer, 7 Oct).
// The form component is kept for now; nothing of the desk is deleted.

import { redirect } from 'next/navigation';
import { REPORTING_MOVED_HREF } from '@/lib/instasolver/one-report-path';

export default function NewIssuePage() {
  redirect(REPORTING_MOVED_HREF);
}
