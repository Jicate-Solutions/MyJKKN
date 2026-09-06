'use client';

/**
 * Parent Portal — dashboard "What's new" banner. Surfaces the latest
 * announcement as a tappable card with a NEW badge + date. Hidden when there
 * are no announcements.
 */
import Link from 'next/link';
import { Megaphone, ChevronRight } from 'lucide-react';
import { formatDate } from '@/lib/utils';
import { useParentAnnouncements } from '@/hooks/parent/use-parent-announcements';

export function WhatsNewBanner() {
  const { data } = useParentAnnouncements();
  const latest = data?.data?.[0];
  if (!latest) return null;

  return (
    <Link
      href="/parent/announcements"
      className="group block overflow-hidden rounded-2xl border border-black/5 bg-gradient-to-b from-white to-neutral-50/80 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_-16px_rgba(0,0,0,0.25)] transition-all duration-300 ease-out hover:-translate-y-0.5 hover:shadow-[0_12px_28px_-14px_rgba(0,0,0,0.22)] active:scale-[0.99] dark:border-white/10 dark:from-neutral-900 dark:to-neutral-900"
    >
      <div className="flex items-center gap-3 p-4">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-blue-400 to-blue-600 text-white shadow-lg shadow-blue-500/30 ring-1 ring-inset ring-white/40">
          <Megaphone className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-[#0b6d41]/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-[#0b6d41]">
              New
            </span>
            <span className="text-[10px] text-muted-foreground">{formatDate(latest.publishedAt)}</span>
          </div>
          <p className="mt-0.5 truncate text-sm font-bold">
            New announcement: {latest.title}
          </p>
        </div>
        <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground transition-transform duration-300 group-hover:translate-x-0.5" />
      </div>
    </Link>
  );
}
