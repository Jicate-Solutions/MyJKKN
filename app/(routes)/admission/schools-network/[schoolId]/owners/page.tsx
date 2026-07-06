import { redirect } from 'next/navigation';

interface Props {
  params: Promise<{ schoolId: string }>;
}

// Hub for /admission/schools-network/[schoolId]/owners — there is no
// standalone owners index; owners live in the school detail page's JKKN Owners
// tab. Bounce a bare hit here to the detail page so the URL never 404s.
// (Assign-owner lives at ./owners/assign.)
export default async function SchoolOwnersHubRedirect({ params }: Props) {
  const { schoolId } = await params;
  redirect(`/admission/schools-network/${schoolId}`);
}
