import { redirect } from 'next/navigation';

/**
 * Superseded by the Time Off workspace. Kept as a redirect so existing
 * bookmarks, nav entries and notification deep-links keep working.
 */
export default function Page() {
  redirect('/hr/leave/requests');
}
