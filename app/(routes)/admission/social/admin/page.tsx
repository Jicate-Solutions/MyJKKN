import { redirect } from 'next/navigation';

/**
 * /admission/social/admin landing — redirects to its only child page.
 *
 * Without a page.tsx here, /admission/social/admin would 404 in prod: the
 * social/admin directory has a child route (policies/) but no parent page
 * (the hub-page-404 class flagged by the PR-scoped reachability gate).
 * Hub-redirect to the policies editor, mirroring the faculty/page.tsx
 * landing pattern. NAV_EXCLUDE'd as a redirect-to-first-child landing.
 */
export default function SocialAdminIndex() {
  redirect('/admission/social/admin/policies');
}
