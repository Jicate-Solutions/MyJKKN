// app/(routes)/admin/id-cards/page.tsx
// ID Cards module hub — redirect to the print queue (the daily-driver page;
// its id_cards.jobs.view permission matches the sidebar entry's gate, so
// everyone who can see the nav item lands on a page they can use; policy is
// super-admin-only and reachable via its own tab).
// Required so /admin/id-cards itself never 404s (hub-page reachability gate).

import { redirect } from 'next/navigation';

export default function IdCardsIndexPage() {
  redirect('/admin/id-cards/print-queue');
}
