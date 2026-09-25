import { redirect } from 'next/navigation';

interface Props {
  params: Promise<{ id: string }>;
}

// Hub for /cdc/drives/[id]/documents — there is no standalone documents index;
// the only screen under it is ./bulk-upload. Bounce a bare hit there so the URL
// never 404s.
export default async function DriveDocumentsHubRedirect({ params }: Props) {
  const { id } = await params;
  redirect(`/cdc/drives/${id}/documents/bulk-upload`);
}
