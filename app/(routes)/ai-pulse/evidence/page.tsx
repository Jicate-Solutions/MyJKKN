import { redirect } from 'next/navigation';

/**
 * AI Pulse "Evidence" segment root — no content of its own. The AutoTabNav
 * surfaces `/ai-pulse/evidence` as a chip (flat manifest render); without this
 * page that chip 404s. Redirect to the first evidence sub-page so the chip is
 * functional. Per-page permission is enforced by the target (NAAC export).
 */
export default function AiPulseEvidenceRootPage() {
  redirect('/ai-pulse/evidence/naac');
}
