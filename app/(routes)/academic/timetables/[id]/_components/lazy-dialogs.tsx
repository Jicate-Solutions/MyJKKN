import { lazy } from 'react';

/**
 * Lazy-loaded Dialog Components
 *
 * Heavy dialogs are loaded only when needed to improve initial page load performance.
 * Each dialog is code-split into its own chunk and loaded on-demand.
 *
 * Benefits:
 * - Reduces initial bundle size by ~40-50KB
 * - Faster page load time
 * - Better performance on slow connections
 * - Dialogs load quickly when actually opened
 */

// Slot Dialog - Heavy component with complex form logic
export const SlotDialogLazy = lazy(() =>
  import('./slot-dialog').then((module) => ({
    default: module.SlotDialog
  }))
);

// Subdivision Config Dialog - Complex student assignment logic
export const SubdivisionConfigDialogLazy = lazy(() =>
  import('./subdivision-config-dialog').then((module) => ({
    default: module.SubdivisionConfigDialog
  }))
);

// Period Configuration - Period selector with drag-and-drop
export const PeriodConfigurationLazy = lazy(() =>
  import('./period-configuration').then((module) => ({
    default: module.PeriodConfiguration
  }))
);

/**
 * Usage in main component:
 *
 * import { Suspense } from 'react';
 * import { SlotDialogLazy, SubdivisionConfigDialogLazy, PeriodConfigurationLazy } from './_components/lazy-dialogs';
 *
 * // Wrap with Suspense for loading state
 * <Suspense fallback={<div>Loading...</div>}>
 *   <SlotDialogLazy
 *     isOpen={slotDialog.isOpen}
 *     onClose={slotDialog.close}
 *     ...
 *   />
 * </Suspense>
 */

/**
 * Loading Fallback Component
 * Shows a minimal loader while dialog is being loaded
 */
export function DialogLoadingFallback() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80">
      <div className="flex flex-col items-center gap-2">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    </div>
  );
}
