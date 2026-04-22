import { redirect } from 'next/navigation';

/**
 * Marketing landing — redirects to the default group (Campaigns → Monitor).
 *
 * /admission/marketing previously 404'd because no page.tsx existed at this
 * level. Now that the sidebar is collapsed and AdmissionNav's "Marketing"
 * tab lands here, we forward to the first real page.
 */
export default function MarketingIndex() {
  redirect('/admission/marketing/campaigns/monitoring');
}
