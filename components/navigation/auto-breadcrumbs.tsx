'use client';

/**
 * AutoBreadcrumbs — self-discovering breadcrumb trail.
 *
 * Reads the current pathname and walks the generated route manifest to emit a
 * Home › Module › Section › Page trail with zero per-page wiring. Drop-in
 * replacement for the hand-built `<PageBreadcrumb items={[...]} />` calls
 * scattered throughout the app.
 *
 * Coexists with existing PageBreadcrumb usages — a future sweep PR can remove
 * those once this is verified in production. This component purely adds a
 * crumb trail at the top of the main content area; it does not touch any
 * page.tsx.
 *
 * Rendered using the same shadcn Breadcrumb primitives as PageBreadcrumb for
 * visual consistency.
 */

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
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
import { deriveBreadcrumbs } from '@/lib/navigation/derive-breadcrumbs';

interface AutoBreadcrumbsProps {
  className?: string;
}

export function AutoBreadcrumbs({ className }: AutoBreadcrumbsProps) {
  const pathname = usePathname() ?? '/';
  const items = deriveBreadcrumbs(pathname);

  // Skip root, /auth/*, /api/*, and any pathname with no crumbs.
  // Also skip 1-item trails (just "Home") — adds no value.
  if (items.length < 2) return null;

  const lastIndex = items.length - 1;
  // Mobile collapse threshold: same pattern as PageBreadcrumb.
  const shouldCollapse = items.length > 3;

  const renderLeaf = (item: { href: string; label: string }, index: number) => {
    const isCurrent = index === lastIndex;
    return (
      <BreadcrumbItem key={`${item.href}-${index}`}>
        {isCurrent ? (
          <BreadcrumbPage className='max-w-[160px] sm:max-w-[250px] md:max-w-none truncate'>
            {item.label}
          </BreadcrumbPage>
        ) : (
          <BreadcrumbLink asChild>
            <Link
              href={item.href}
              className='max-w-[120px] sm:max-w-[200px] md:max-w-none truncate inline-block'
            >
              {item.label}
            </Link>
          </BreadcrumbLink>
        )}
      </BreadcrumbItem>
    );
  };

  return (
    <Breadcrumb className={className}>
      <BreadcrumbList className='text-xs sm:text-sm'>
        {shouldCollapse ? (
          <>
            {/* First (Home) — always visible */}
            {renderLeaf(items[0]!, 0)}
            <BreadcrumbSeparator />

            {/* Middle items — hidden on mobile, visible on desktop */}
            {items.slice(1, -2).map((item, idx) => {
              const absoluteIdx = idx + 1;
              return (
                <React.Fragment key={`mid-${item.href}-${idx}`}>
                  <BreadcrumbItem className='hidden md:inline-flex'>
                    <BreadcrumbLink asChild>
                      <Link
                        href={item.href}
                        className='max-w-[200px] truncate inline-block'
                      >
                        {item.label}
                      </Link>
                    </BreadcrumbLink>
                  </BreadcrumbItem>
                  <BreadcrumbSeparator className='hidden md:block' />
                  {/* Keep absoluteIdx used for key correctness if labels repeat */}
                  <span className='hidden' aria-hidden data-idx={absoluteIdx} />
                </React.Fragment>
              );
            })}

            {/* Ellipsis — visible only on mobile */}
            <BreadcrumbItem className='md:hidden'>
              <BreadcrumbEllipsis className='h-4 w-4' />
            </BreadcrumbItem>
            <BreadcrumbSeparator className='md:hidden' />

            {/* Second-to-last */}
            {renderLeaf(items[items.length - 2]!, items.length - 2)}
            <BreadcrumbSeparator />

            {/* Last (current page) */}
            {renderLeaf(items[lastIndex]!, lastIndex)}
          </>
        ) : (
          items.map((item, index) => (
            <React.Fragment key={`${item.href}-${index}`}>
              {renderLeaf(item, index)}
              {index < lastIndex && <BreadcrumbSeparator />}
            </React.Fragment>
          ))
        )}
      </BreadcrumbList>
    </Breadcrumb>
  );
}

export default AutoBreadcrumbs;

/**
 * Utility wrapper that applies the standard class used when AutoBreadcrumbs is
 * mounted globally in the routes layout. Keeps layout.tsx tidy while allowing
 * callers to drop <AutoBreadcrumbs /> inline with a custom className.
 */
export function GlobalAutoBreadcrumbs({ className }: AutoBreadcrumbsProps) {
  return (
    <AutoBreadcrumbs
      className={cn('px-4 md:px-8 pt-2', className)}
    />
  );
}
