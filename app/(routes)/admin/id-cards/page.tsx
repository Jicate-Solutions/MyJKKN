// app/(routes)/admin/id-cards/page.tsx
// ID Cards module hub — redirect to the policy page (the natural entry:
// admins configure printer policy before templates or the print queue).
// Required so /admin/id-cards itself never 404s (hub-page reachability gate).

import { redirect } from 'next/navigation';

export default function IdCardsIndexPage() {
  redirect('/admin/id-cards/policy');
}
