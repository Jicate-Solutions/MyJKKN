'use client';

/**
 * DownloadCardButton
 * Created: 2026-04-21
 *
 * Triggers a browser-level PDF download for the caller's Privilege Card.
 * One card bundles ALL the learner's active privilege memberships — so the
 * button only needs ONE valid member_id to render the full card.
 *
 * Philosophy note (Vijay's TVK Citizen Privilege Card, bundled):
 *   physical card > digital badge · bundling > fragmentation · visibility > invisibility.
 */

import { Download, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useState } from 'react';

interface DownloadCardButtonProps {
  memberId: string;
  className?: string;
  label?: string;
}

export function DownloadCardButton({
  memberId,
  className,
  label = 'Download Privilege Card',
}: DownloadCardButtonProps) {
  const [isDownloading, setIsDownloading] = useState(false);

  const handleDownload = () => {
    if (!memberId || isDownloading) return;
    setIsDownloading(true);
    // Browser handles the download via Content-Disposition on the response.
    window.location.href = `/api/academic/privileges/card/${memberId}`;
    // Reset after a short delay — navigation to a download endpoint does NOT
    // change page state, so we clear the spinner ourselves.
    window.setTimeout(() => setIsDownloading(false), 2500);
  };

  return (
    <Button
      type="button"
      onClick={handleDownload}
      disabled={isDownloading || !memberId}
      className={className}
      variant="default"
    >
      {isDownloading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Download className="h-4 w-4" />
      )}
      <span className="ml-2">{label}</span>
    </Button>
  );
}
