import { redirect } from 'next/navigation';

/**
 * Automations landing — redirects to Monitoring (the first child tab).
 *
 * The `/admission/marketing/automations` directory has 3 child routes
 * (monitoring, roi, segments) but no root page.tsx, so AdmissionNav's
 * "Automations" entry 404'd. Nav-config audit (PR #876) gated this.
 * Mirrors the pattern used by /admission/marketing/page.tsx.
 */
export default function AutomationsIndex() {
  redirect('/admission/marketing/automations/monitoring');
}
