import { cn } from '@/lib/utils';

interface ContentLayoutProps {
  title?: string;
  children: React.ReactNode;
  /**
   * When true, the content stretches to the full available width instead of
   * being capped by Tailwind's `container` max-widths. Use for pages that
   * should fill the screen (e.g. data-dense or mobile-first views). Defaults
   * to the capped `container` behavior so existing pages are unaffected.
   */
  fullWidth?: boolean;
}

export function ContentLayout({ children, fullWidth }: ContentLayoutProps) {
  return (
    <div>
      <div
        className={cn(
          'pt-8 pb-8 px-4 sm:px-8 bg-background',
          fullWidth ? 'w-full max-w-full' : 'container'
        )}
      >
        {children}
      </div>
    </div>
  );
}
