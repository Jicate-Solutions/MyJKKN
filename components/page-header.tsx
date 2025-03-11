'use client';

import React from 'react';

interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  children?: React.ReactNode;
}

export function PageHeader({
  title,
  description,
  actions,
  children
}: PageHeaderProps) {
  return (
    <div className='flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-6'>
      <div>
        <h1 className='text-2xl font-bold tracking-tight'>{title}</h1>
        {description && (
          <p className='text-muted-foreground mt-1'>{description}</p>
        )}
      </div>
      {actions && (
        <div className='flex items-center gap-2 flex-wrap'>{actions}</div>
      )}
      {children}
    </div>
  );
}
