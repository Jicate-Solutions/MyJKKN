// Hub redirect — the /bos/governing-body/[meetingId] level has no detail page of
// its own (only an /edit child), so the bare URL would 404 in production. Redirect
// to the meeting's edit view (its only page), preserving the id. Mirrors the project
// pattern in app/(routes)/audit/findings/[id]/page.tsx.

import { redirect } from 'next/navigation';

interface PageProps {
  params: Promise<{ meetingId: string }>;
}

export default async function GoverningBodyMeetingRedirectPage({ params }: PageProps) {
  const { meetingId } = await params;
  redirect(`/bos/governing-body/${meetingId}/edit`);
}
