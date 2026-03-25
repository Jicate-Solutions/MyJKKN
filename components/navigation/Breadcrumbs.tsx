'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';

export interface BreadcrumbItem {
  label: string;
  href?: string;
  isCurrent?: boolean;
}

interface PageBreadcrumbProps {
  items: BreadcrumbItem[];
  className?: string;
}

/**
 * A reusable breadcrumb component that takes an array of items and renders them as a breadcrumb trail.
 * The last item without a href or with isCurrent=true will be rendered as the current page.
 *
 * @example
 * ```tsx
 * <PageBreadcrumb
 *   items={[
 *     { label: 'Home', href: '/' },
 *     { label: 'Users', href: '/users' },
 *     { label: 'Role Management' } // Current page (no href)
 *   ]}
 * />
 * ```
 */
export function PageBreadcrumb({ items, className }: PageBreadcrumbProps) {
  // Calculate which item is current (last item or item with isCurrent=true)
  const currentIndex =
    items.findIndex((item) => item.isCurrent) !== -1
      ? items.findIndex((item) => item.isCurrent)
      : items.length - 1;

  return (
    <Breadcrumb className={className}>
      <BreadcrumbList>
        {items.map((item, index) => (
          <React.Fragment key={`${item.label}-${index}`}>
            <BreadcrumbItem>
              {index === currentIndex ? (
                <BreadcrumbPage>{item.label}</BreadcrumbPage>
              ) : item.href ? (
                <BreadcrumbLink asChild>
                  <Link href={item.href}>{item.label}</Link>
                </BreadcrumbLink>
              ) : (
                <BreadcrumbLink>{item.label}</BreadcrumbLink>
              )}
            </BreadcrumbItem>
            {index < items.length - 1 && <BreadcrumbSeparator />}
          </React.Fragment>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  );
}

export default PageBreadcrumb;
