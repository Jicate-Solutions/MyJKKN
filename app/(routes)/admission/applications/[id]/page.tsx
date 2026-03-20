'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function ApplicationDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  useEffect(() => {
    // Applications are now leads - redirect to lead detail page
    router.replace(`/admission/leads/${id}`);
  }, [id, router]);

  return (
    <div className="flex items-center justify-center min-h-[400px]">
      <p className="text-muted-foreground">Redirecting to lead details...</p>
    </div>
  );
}
