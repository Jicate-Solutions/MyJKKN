import { ResourceStatsDashboard } from './_components/resource-stats-dashboard';
import { Suspense } from 'react';

// Simple test component to check if the page is rendering
function TestComponent() {
  return (
    <div className='p-4 bg-red-100 mb-4 rounded-md'>
      <h2 className='text-lg font-bold'>Test Component</h2>
      <p>If you can see this, the page is rendering correctly.</p>
    </div>
  );
}

export default function ResourcesPage() {
  return (
    <div className='container mx-auto py-6'>
      <TestComponent />
      <Suspense fallback={<div>Loading dashboard...</div>}>
        <ResourceStatsDashboard />
      </Suspense>
    </div>
  );
}
