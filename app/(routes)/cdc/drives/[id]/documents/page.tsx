import { redirect } from 'next/navigation';

interface Props {
  params: Promise<{ id: string }>;
}

// Hub for /cdc/drives/[id]/documents. The only child route is bulk-upload; a
// drive's documents are listed and managed per learner on the Selected page.
export default async function CdcDriveDocumentsRedirect({ params }: Props) {
  const { id } = await params;
  redirect(`/cdc/drives/${id}/selected`);
}
