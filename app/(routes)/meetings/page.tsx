import { redirect } from 'next/navigation';

// /meetings has no first-class landing — redirect to the inbox view that
// counselors and staff actually use. Required by sidebar-health gate
// because lib/sidebarMenuLink.ts (commit 8b2e4d7) links the sidebar to
// /meetings; without this file the link 404s and the build fails.
export default function MeetingsIndexPage() {
  redirect('/meetings/inbox');
}
