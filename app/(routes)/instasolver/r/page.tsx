import { redirect } from 'next/navigation';

/**
 * /instasolver/r — hub for the scan-to-report links.
 *
 * Every QR sticker points at /instasolver/r/<token>. A person who trims the
 * code off the end, or is sent the path without it, lands here; Next.js App
 * Router 404s a directory with routable children and no page.tsx of its own
 * (the hub-page-404 class the "Hub Page Reachability" gate stops). Without a
 * code there is no room or item to report against, so this sends them to the
 * InstaSolver home, where they can report a problem by hand.
 */
/**
 * The folder is named "r" to keep sticker links short. Without this label the
 * route manifest titles it "R", which is what the breadcrumb and tab showed.
 */
export const navMeta = { label: 'Scan to report' };

export default function InstaSolverScanHubPage() {
  redirect('/instasolver');
}
