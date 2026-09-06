'use client';

// school-fees-breadcrumb.tsx — shared trail for every school-fees screen.

import Link from 'next/link';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';

interface SchoolFeesBreadcrumbProps {
  /** Omit on the plan-list page itself, where "School Fees" is the leaf. */
  leaf?: string;
}

export function SchoolFeesBreadcrumb({ leaf }: SchoolFeesBreadcrumbProps) {
  return (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbLink asChild>
            <Link href="/">Dashboard</Link>
          </BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem>
          <BreadcrumbLink asChild>
            <Link href="/billing">Billing</Link>
          </BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem>
          {leaf ? (
            <BreadcrumbLink asChild>
              <Link href="/billing/school-fees">School Fees</Link>
            </BreadcrumbLink>
          ) : (
            <BreadcrumbPage>School Fees</BreadcrumbPage>
          )}
        </BreadcrumbItem>
        {leaf ? (
          <>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>{leaf}</BreadcrumbPage>
            </BreadcrumbItem>
          </>
        ) : null}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
