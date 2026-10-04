'use client';

// Read-only photograph thumbnails with a full-size viewer.

import { useState } from 'react';
import Image from 'next/image';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

export function PhotoStrip({ urls, label = 'Photograph' }: { urls: string[]; label?: string }) {
  const [open, setOpen] = useState<number | null>(null);
  if (!urls?.length) return null;
  const current = open ?? 0;

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {urls.map((url, i) => (
          <button
            key={url}
            type="button"
            onClick={() => setOpen(i)}
            className="relative h-20 w-20 overflow-hidden rounded-md border bg-muted focus:outline-none focus:ring-2 focus:ring-ring"
            aria-label={`Open ${label.toLowerCase()} ${i + 1}`}
          >
            <Image src={url} alt={`${label} ${i + 1}`} fill sizes="80px" className="object-cover" />
          </button>
        ))}
      </div>
      <Dialog open={open !== null} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="max-w-3xl p-2 sm:p-4">
          <DialogTitle className="sr-only">
            {label} {current + 1} of {urls.length}
          </DialogTitle>
          <div className="relative aspect-[4/3] w-full bg-muted">
            <Image src={urls[current]} alt={`${label} ${current + 1}`} fill sizes="(max-width: 768px) 100vw, 768px" className="object-contain" />
          </div>
          {urls.length > 1 && (
            <div className="flex items-center justify-between">
              <Button variant="ghost" size="sm" onClick={() => setOpen((current - 1 + urls.length) % urls.length)}>
                <ChevronLeft className="mr-1 h-4 w-4" /> Previous
              </Button>
              <span className="text-xs text-muted-foreground">
                {current + 1} / {urls.length}
              </span>
              <Button variant="ghost" size="sm" onClick={() => setOpen((current + 1) % urls.length)}>
                Next <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
