import { redirect } from 'next/navigation';

/**
 * AI Pulse "Submit" segment root — no content of its own. The AutoTabNav
 * surfaces `/ai-pulse/submit` as a chip (flat manifest render); without this
 * page that chip 404s. Redirect to the publication submit page so the chip
 * is functional. Per-page permission is enforced by the target.
 */
export default function AiPulseSubmitRootPage() {
  redirect('/ai-pulse/submit/publication');
}
