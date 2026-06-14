import { redirect } from 'next/navigation';

// RCLTP admin hub. The only admin surface so far is the policy editor.
export default function RcltpAdminHubPage() {
  redirect('/rcltp/admin/policies');
}
