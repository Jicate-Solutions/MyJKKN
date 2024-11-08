'use client';

import React, { useEffect, useState } from 'react';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import axios from 'axios';

const DashboardOverview: React.FC = () => {
  return (
    <ContentLayout title='Dashboard'>
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href='/'>Home</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage >Dashboard</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <div className='space-y-6 mt-2'>
        <h1 className='text-3xl font-bold'>Dashboard</h1>
      </div>
    </ContentLayout>
  );
};

export default DashboardOverview;
