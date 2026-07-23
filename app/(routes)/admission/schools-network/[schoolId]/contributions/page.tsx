import { redirect } from 'next/navigation';

interface Props {
  params: Promise<{ schoolId: string }>;
}

// Hub for /admission/schools-network/[schoolId]/contributions — there is no
// standalone contributions index; contributions live in the school detail
// page's Contributions tab. Bounce a bare hit here to the detail page so the
// URL never 404s. (Log-contribution lives at ./contributions/new.)
export default async function SchoolContributionsHubRedirect({ params }: Props) {
  const { schoolId } = await params;
  redirect(`/admission/schools-network/${schoolId}`);
}
