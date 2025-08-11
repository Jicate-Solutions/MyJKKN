import { Suspense } from 'react';
import { Metadata } from 'next';
import { AttendanceDashboard } from './_components/attendance-dashboard';
import { Loader2 } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Attendance Analytics Dashboard',
  description: 'Analytics and statistics dashboard for attendance management'
};

export default function AttendanceDashboardPage() {
  return (
    <div className='flex-1 space-y-4 p-4 pt-6 md:p-8'>
      <div className='flex items-center justify-between space-y-2'>
        <h2 className='text-3xl font-bold tracking-tight'>
          Attendance Analytics
        </h2>
      </div>
      <Suspense
        fallback={
          <div className='flex items-center justify-center h-full'>
            <Loader2 className='w-4 h-4 animate-spin text-primary' />
          </div>
        }
      >
        <AttendanceDashboard />
      </Suspense>
    </div>
  );
}
