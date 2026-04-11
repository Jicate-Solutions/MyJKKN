'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
  BreadcrumbEllipsis,
} from '@/components/ui/breadcrumb';
import { cn } from '@/lib/utils';

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
 * On mobile (< 4 items visible), collapses middle items into an ellipsis.
 * Long labels are truncated on small screens.
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
  const currentIndex =
    items.findIndex((item) => item.isCurrent) !== -1
      ? items.findIndex((item) => item.isCurrent)
      : items.length - 1;

  // On mobile: show first item + ellipsis + last 2 items (if > 3 items)
  // On desktop: show all items
  const shouldCollapse = items.length > 3;

  const renderItem = (item: BreadcrumbItem, index: number) => (
    <BreadcrumbItem key={`${item.label}-${index}`}>
      {index === currentIndex ? (
        <BreadcrumbPage className="max-w-[160px] sm:max-w-[250px] md:max-w-none truncate">
          {item.label}
        </BreadcrumbPage>
      ) : item.href ? (
        <BreadcrumbLink asChild>
          <Link href={item.href} className="max-w-[120px] sm:max-w-[200px] md:max-w-none truncate inline-block">
            {item.label}
          </Link>
        </BreadcrumbLink>
      ) : (
        <BreadcrumbLink className="max-w-[120px] sm:max-w-[200px] md:max-w-none truncate">
          {item.label}
        </BreadcrumbLink>
      )}
    </BreadcrumbItem>
  );

  return (
    <Breadcrumb className={className}>
      <BreadcrumbList className="text-xs sm:text-sm">
        {shouldCollapse ? (
          <>
            {/* First item (Home) — always visible */}
            {renderItem(items[0], 0)}
            <BreadcrumbSeparator />

            {/* Middle items — hidden on mobile, visible on desktop */}
            {items.slice(1, -2).map((item, idx) => (
              <React.Fragment key={`mid-${item.label}-${idx}`}>
                <BreadcrumbItem className="hidden md:inline-flex">
                  {item.href ? (
                    <BreadcrumbLink asChild>
                      <Link href={item.href} className="max-w-[200px] truncate inline-block">
                        {item.label}
                      </Link>
                    </BreadcrumbLink>
                  ) : (
                    <BreadcrumbLink className="max-w-[200px] truncate">
                      {item.label}
                    </BreadcrumbLink>
                  )}
                </BreadcrumbItem>
                <BreadcrumbSeparator className="hidden md:block" />
              </React.Fragment>
            ))}

            {/* Ellipsis — visible only on mobile when items are collapsed */}
            <BreadcrumbItem className="md:hidden">
              <BreadcrumbEllipsis className="h-4 w-4" />
            </BreadcrumbItem>
            <BreadcrumbSeparator className="md:hidden" />

            {/* Second-to-last item */}
            {renderItem(items[items.length - 2], items.length - 2)}
            <BreadcrumbSeparator />

            {/* Last item (current page) */}
            {renderItem(items[items.length - 1], items.length - 1)}
          </>
        ) : (
          /* 3 or fewer items — show all */
          items.map((item, index) => (
            <React.Fragment key={`${item.label}-${index}`}>
              {renderItem(item, index)}
              {index < items.length - 1 && <BreadcrumbSeparator />}
            </React.Fragment>
          ))
        )}
      </BreadcrumbList>
    </Breadcrumb>
  );
}

export default PageBreadcrumb;
