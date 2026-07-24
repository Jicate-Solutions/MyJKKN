'use client';

/**
 * Page chrome shared by every Time Off tab: breadcrumb, title, tab bar.
 * Keeps the four pages to their own table and drawer.
 */

import Link from 'next/link';
import type { ReactNode } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { TimeOffTabs, type TimeOffSubTab } from './time-off-tabs';

export function TimeOffShell({
  title,
  subTabs,
  children,
}: {
  title: string;
  subTabs?: TimeOffSubTab[];
  children: ReactNode;
}) {
  return (
    <ContentLayout title={title}>
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild><Link href="/hr">HR</Link></BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild><Link href="/hr/leave/requests">Time Off</Link></BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem><BreadcrumbPage>{title}</BreadcrumbPage></BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="mt-4">
        <TimeOffTabs subTabs={subTabs} />
      </div>

      <div className="mt-4">{children}</div>
    </ContentLayout>
  );
}
