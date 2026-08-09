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
} from '@/components/ui/breadcrumb';
import { cn } from '@/lib/utils';
import { deriveBreadcrumbs } from '@/lib/navigation/derive-breadcrumbs';
import { useInstitutionType } from '@/hooks/use-institution-type';
import { adaptLabel } from '@/lib/utils/school-label-adapter';

interface AutoBreadcrumbsProps {
  className?: string;
}

export function AutoBreadcrumbs({ className }: AutoBreadcrumbsProps) {
  const pathname = usePathname() ?? '/';
  const { institutionType } = useInstitutionType();
  // Crumb labels are derived from the raw route manifest, so adapt each one to
  // the institution type (e.g. "Degrees" → "Streams" for schools) to stay in
  // sync with the navbar title, sidebar, and page body.
  const items = deriveBreadcrumbs(pathname).map((item) => ({
    ...item,
    label: adaptLabel(item.label, institutionType),
  }));

  // Skip root, /auth/*, /api/*, and any pathname with no crumbs.
  // Also skip 1-item trails (just "Home") — adds no value.
  if (items.length < 2) return null;

  const lastIndex = items.length - 1;
  // Narrow screens show the parent and the current page only. Everything
  // earlier in the trail is hidden below md. The previous mobile treatment
  // kept "Home" plus an ellipsis and dropped the middle, which spent the
  // available width on the two crumbs that say the least about where you are.
  const firstShownOnMobile = lastIndex - 1;

  const renderLeaf = (
    item: { href: string; label: string },
    index: number,
    itemClassName?: string
  ) => {
    const isCurrent = index === lastIndex;
    return (
      <BreadcrumbItem key={`${item.href}-${index}`} className={itemClassName}>
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
        {items.map((item, index) => {
          // Below md only the last two crumbs are shown, so a crumb earlier
          // than the parent — and the separator that follows it — is hidden.
          const hiddenOnMobile = index < firstShownOnMobile;
          return (
            <React.Fragment key={`${item.href}-${index}`}>
              {renderLeaf(
                item,
                index,
                hiddenOnMobile ? 'hidden md:inline-flex' : undefined
              )}
              {index < lastIndex && (
                <BreadcrumbSeparator
                  className={hiddenOnMobile ? 'hidden md:block' : undefined}
                />
              )}
            </React.Fragment>
          );
        })}
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
