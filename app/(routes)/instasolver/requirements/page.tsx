import { Suspense } from 'react';
import { RequirementsClient } from './_components/requirements-client';

export default function RequirementsPage() {
  return (
    <Suspense fallback={null}>
      <RequirementsClient />
    </Suspense>
  );
}
