import { redirect } from 'next/navigation';

interface Props {
  params: Promise<{ schoolId: string }>;
}

// Hub for /admission/schools-network/[schoolId]/contacts — there is no
// standalone contacts index; contacts live in the school detail page's
// Contacts tab. Bounce a bare hit here to the detail page so the URL never
// 404s. (Add-contact lives at ./contacts/new.)
export default async function SchoolContactsHubRedirect({ params }: Props) {
  const { schoolId } = await params;
  redirect(`/admission/schools-network/${schoolId}`);
}
