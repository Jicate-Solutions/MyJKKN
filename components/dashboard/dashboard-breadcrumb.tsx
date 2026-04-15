/**
 * Dashboard v2 — Breadcrumb navigator
 * JKKN > Institution > Department > Staff drill-down.
 * Server component — takes resolved names, renders Link chain.
 *
 * Spec: specs/myjkkn-dashboard-v2-spec.md §7.5 (multi-institution hierarchy drill-down)
 */

import Link from 'next/link';

export type BreadcrumbCrumb = {
  label: string;
  href?: string;
  /** true = current/active crumb (not a link) */
  active?: boolean;
};

type DashboardBreadcrumbProps = {
  crumbs: BreadcrumbCrumb[];
};

export function DashboardBreadcrumb({ crumbs }: DashboardBreadcrumbProps) {
  return (
    <nav aria-label='Dashboard hierarchy' className='flex items-center flex-wrap gap-1.5 text-xs'>
      {crumbs.map((crumb, i) => {
        const isLast = i === crumbs.length - 1;
        const content = crumb.active ? (
          <span
            className='px-2.5 py-1 rounded-full bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 font-medium'
            aria-current='page'
          >
            {crumb.label}
          </span>
        ) : crumb.href ? (
          <Link
            href={crumb.href}
            className='px-2.5 py-1 rounded-full bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors'
          >
            {crumb.label}
          </Link>
        ) : (
          <span className='px-2.5 py-1 text-neutral-500'>{crumb.label}</span>
        );
        return (
          <div key={`${crumb.label}-${i}`} className='flex items-center gap-1.5'>
            {content}
            {!isLast && (
              <span className='text-neutral-400 dark:text-neutral-600' aria-hidden>
                ›
              </span>
            )}
          </div>
        );
      })}
    </nav>
  );
}
