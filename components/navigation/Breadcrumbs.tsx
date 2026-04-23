'use client';

/**
 * PageBreadcrumb — DEPRECATED no-op shim.
 *
 * The global <AutoBreadcrumbs /> renderer in app/(routes)/layout.tsx (added
 * by PR #364 on 2026-04-23) derives the breadcrumb trail from the current
 * pathname + the generated route manifest. Pages no longer need to hand-craft
 * their own breadcrumb items.
 *
 * Until PR #364, this component was the primary renderer (298 call sites).
 * After #364, both rendered simultaneously — producing a visible duplicate
 * on every page with a hand-crafted trail (most visibly on mobile, where
 * the two trails wasted ~8% of viewport height each).
 *
 * This shim makes PageBreadcrumb a no-op so the duplicate vanishes without
 * needing a 298-file caller-side sweep. Call sites keep compiling (import +
 * JSX shape preserved) but render nothing. A follow-up sweep PR can delete
 * the dead call sites at leisure.
 *
 * The BreadcrumbItem type is preserved — some call sites use it for their
 * own internal arrays.
 *
 * @deprecated Use AutoBreadcrumbs (auto-renders once at the root layout).
 *             This no-op shim exists only to neutralize the 298 legacy
 *             <PageBreadcrumb items={...} /> call sites across the app.
 */

export interface BreadcrumbItem {
  label: string;
  href?: string;
  isCurrent?: boolean;
}

interface PageBreadcrumbProps {
  items: BreadcrumbItem[];
  className?: string;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function PageBreadcrumb(_props: PageBreadcrumbProps) {
  return null;
}

export default PageBreadcrumb;
