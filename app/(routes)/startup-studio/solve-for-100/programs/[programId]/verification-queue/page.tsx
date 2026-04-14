import { redirect } from 'next/navigation';

interface Props {
  params: Promise<{ programId: string }>;
}

export default async function SF100VerificationRedirect({ params }: Props) {
  // Verification queue is now a tab in the unified admin dashboard
  const { programId } = await params;
  redirect(`/startup-studio/solve-for-100/admin?tab=verification&program=${programId}`);
}
