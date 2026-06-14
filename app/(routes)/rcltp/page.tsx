import { redirect } from 'next/navigation';

// RCLTP module hub. Today the only RCLTP surface is the super-admin policy
// editor, so the module root redirects there. When Phase C adds role-specific
// pages (student/teacher/parent/principal), make this a role-aware landing.
export default function RcltpHubPage() {
  redirect('/rcltp/admin/policies');
}
