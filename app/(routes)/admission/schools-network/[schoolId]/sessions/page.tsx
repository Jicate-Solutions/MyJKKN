import { redirect } from 'next/navigation';

interface Props {
  params: Promise<{ schoolId: string }>;
}

// Hub for /admission/schools-network/[schoolId]/sessions — there is no
// standalone sessions index; sessions live in the school detail page's
// Sessions tab. Bounce a bare hit here to the detail page so the URL never
// 404s. (Log-session lives at ./sessions/log.)
export default async function SchoolSessionsHubRedirect({ params }: Props) {
  const { schoolId } = await params;
  redirect(`/admission/schools-network/${schoolId}`);
}
