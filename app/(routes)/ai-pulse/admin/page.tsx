import { redirect } from 'next/navigation';

/**
 * AI Pulse "Admin" segment root — no content of its own. The AutoTabNav
 * surfaces `/ai-pulse/admin` as a chip (flat manifest render); without this
 * page that chip 404s. Redirect to the first admin sub-page so the chip is
 * functional. Per-page permission is enforced by the target (cycles console).
 */
export default function AiPulseAdminRootPage() {
  redirect('/ai-pulse/admin/cycles');
}
