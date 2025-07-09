'use client';

import LearnerLayout from '@/components/layout/learner-layout';
import { LearnerPageHeader } from '@/components/layout/learner-page-header';
import { Construction } from 'lucide-react';

export default function AppsPage() {
  return (
    <LearnerLayout>
      <LearnerPageHeader
        title='My Apps'
        subtitle='Access various integrated applications and services.'
      />
      <div className='p-4 md:p-6'>
        <div className='flex flex-col items-center justify-center text-center p-8 bg-gray-50 rounded-lg shadow-sm border border-dashed'>
          <Construction className='h-16 w-16 text-yellow-500 mb-4' />
          <h2 className='text-2xl font-bold text-gray-800'>Coming Soon!</h2>
          <p className='text-gray-600 mt-2 max-w-md'>
            The applications hub is under construction and will be available
            soon.
          </p>
        </div>
      </div>
    </LearnerLayout>
  );
}
