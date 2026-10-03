// app/(routes)/instasolver/page.tsx
//
// /instasolver opens the InstaSolver desk (docs/instasolver/MYJKKN-MODULE-SPEC.md).
//
// Until 2026-10-01 this was the "what kind?" chooser of specs/instasolver-2026-09-14.md
// (broken → Campus Walk, complaint → grievance, purchase → Procurement). The owner
// decided on 2026-10-01 to hide the chooser and its lanes from navigation. The lanes
// themselves — /instasolver/broken, /complaint and /track/[token] — still answer
// direct links, so a tracking code already given to an anonymous complainant keeps
// working. The chooser UI is kept in ./_components/chooser-client.tsx and can be
// restored from git history of this file.

import { redirect } from 'next/navigation';

export default function InstaSolverPage() {
  redirect('/instasolver/dashboard');
}
