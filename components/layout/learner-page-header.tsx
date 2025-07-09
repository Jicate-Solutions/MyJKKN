'use client';

import React from 'react';

interface LearnerPageHeaderProps {
  title: string;
  subtitle?: string;
}

export function LearnerPageHeader({ title, subtitle }: LearnerPageHeaderProps) {
  return (
    <div className='px-4 py-6 md:px-6 md:py-8'>
      <div className='max-w-7xl mx-auto'>
        <h1 className='text-2xl md:text-3xl font-bold text-gray-900 tracking-tight'>
          {title}
        </h1>
        {subtitle && (
          <p className='mt-2 text-md md:text-lg text-gray-600 max-w-2xl'>
            {subtitle}
          </p>
        )}
      </div>
    </div>
  );
}
