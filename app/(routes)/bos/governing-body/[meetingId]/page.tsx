import { redirect } from 'next/navigation';

interface Props {
  params: Promise<{ meetingId: string }>;
}

// Hub for /bos/governing-body/[meetingId] — the meeting DETAIL view lives at
// /bos/meetings/[id] (see ../page.tsx); this segment only has ./edit
// (schedule/venue edit). A bare hit here previously 404'd in the App Router
// because the segment had children but no page.tsx of its own. Bounce to the
// edit page so the URL never 404s.
export default async function GoverningBodyMeetingHubRedirect({ params }: Props) {
  const { meetingId } = await params;
  redirect(`/bos/governing-body/${meetingId}/edit`);
}
