import { redirect } from 'next/navigation';

/**
 * Academic Leave/OnDuty landing — redirects to the default sub-page.
 *
 * /academic/leave-onduty previously 404'd because no page.tsx existed.
 * The 3-tab SectionSubNav (Approvals / Settings / Reports) now lands here
 * and is forwarded to Approvals (the most-used entry point).
 */
export default function LeaveOnDutyIndex() {
  redirect('/academic/leave-onduty/approvals');
}
