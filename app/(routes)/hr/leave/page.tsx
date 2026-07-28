import { redirect } from 'next/navigation';

/**
 * The hub of six tiles is superseded by the Time Off workspace, where Leave,
 * Compensatory Off, Short Time Off and Approvals are tabs on one surface.
 * Calendar and Encashment remain their own routes and are reachable from the
 * HR nav.
 */
export default function Page() {
  redirect('/hr/leave/requests');
}
