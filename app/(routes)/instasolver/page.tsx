// app/(routes)/instasolver/page.tsx
//
// The /instasolver hub. Next.js App Router needs a page.tsx at every directory
// meant to be reachable as a URL, so without this file /instasolver is a 404
// even though /instasolver/broken works — the "Hub Page Reachability" gate
// exists because that exact class of bug reached production three times in
// 2026 (HR in April, PDE in June, the PDE sweep in June).
//
// ── THIS IS A PLACEHOLDER, AND IT IS MEANT TO BE REPLACED ───────────────────
// Decision I3 (specs/instasolver-2026-09-14.md) puts a real chooser here —
// "One button. First tap asks: complaint / something broken / need to buy" —
// and that chooser is built in #3743, which creates this same path. When #3743
// lands, ITS page.tsx supersedes this file wholesale; there is nothing here
// worth merging. Until then this lane is the only door that exists, so sending
// the visitor straight to it is both the honest behaviour and the only one
// that does not 404.
//
// `replace` rather than a push: /instasolver is a routing waypoint, not a
// screen, so it must not sit in the visitor's back history and bounce them
// forward again when they try to leave.

import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default function InstaSolverHubPage() {
  redirect('/instasolver/broken');
}
