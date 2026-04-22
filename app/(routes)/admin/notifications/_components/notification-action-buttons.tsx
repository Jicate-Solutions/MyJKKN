'use client';

/**
 * NotificationActionButtons
 *
 * Renders action buttons at the bottom of a NotificationCard when the
 * notification has action_type set ('tracked' | 'urgent') and action_config
 * is present.
 *
 * Usage:
 *   <NotificationActionButtons
 *     notificationId={notification.id}
 *     actionType={notification.action_type}
 *     actionConfig={notification.action_config}
 *   />
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  MessageSquare,
  Paperclip,
  FileText,
  ExternalLink
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import type { ActionType, ActionConfig, ResponseType } from '@/types/notifications';

interface NotificationActionButtonsProps {
  notificationId: string;
  actionType?: ActionType;
  actionConfig?: ActionConfig;
  /** Additional class names for the wrapper */
  className?: string;
}

function getResponseIcon(responseType: ResponseType) {
  switch (responseType) {
    case 'text':
      return <MessageSquare className="h-4 w-4" />;
    case 'file':
      return <Paperclip className="h-4 w-4" />;
    case 'form':
      return <FileText className="h-4 w-4" />;
    case 'link':
      return <ExternalLink className="h-4 w-4" />;
  }
}

function getDefaultLabel(responseType: ResponseType): string {
  switch (responseType) {
    case 'text':
      return 'Respond';
    case 'file':
      return 'Upload file';
    case 'form':
      return 'Fill form';
    case 'link':
      return 'Open link';
  }
}

export function NotificationActionButtons({
  notificationId,
  actionType,
  actionConfig,
  className
}: NotificationActionButtonsProps) {
  const router = useRouter();
  const [placeholderOpen, setPlaceholderOpen] = useState(false);

  // Only render when there is a meaningful action
  if (!actionType || !actionConfig) {
    return null;
  }

  const { response_type, response_label, link_url } = actionConfig;
  const isUrgent = actionType === 'urgent';
  const buttonLabel = response_label || getDefaultLabel(response_type);

  function handleClick(e: React.MouseEvent) {
    // Prevent the parent card's Link/onClick from firing
    e.stopPropagation();
    e.preventDefault();

    if (response_type === 'link' && link_url) {
      window.open(link_url, '_blank', 'noopener,noreferrer');
      return;
    }

    // text / file / form: open placeholder dialog
    // The full response-collection UI is a follow-up PR
    setPlaceholderOpen(true);
  }

  function handleViewDetails(e: React.MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
    router.push(`/notifications/${notificationId}`);
  }

  return (
    <>
      {/* Action buttons row */}
      <div
        className={cn(
          'flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-3 mt-3 border-t border-border',
          className
        )}
      >
        {/* Primary action button */}
        <Button
          variant="default"
          size="sm"
          className="w-full sm:w-auto gap-2"
          onClick={handleClick}
        >
          {getResponseIcon(response_type)}
          {buttonLabel}
        </Button>

        {/* Urgent pill — shown next to the button when action_type is 'urgent' */}
        {isUrgent && (
          <Badge
            variant="destructive"
            className="self-center text-xs font-semibold uppercase tracking-wide px-2 py-0.5"
          >
            Urgent
          </Badge>
        )}

        {/* Secondary link to full detail view */}
        <Button
          variant="ghost"
          size="sm"
          className="w-full sm:w-auto text-muted-foreground hover:text-foreground"
          onClick={handleViewDetails}
        >
          View details
        </Button>
      </div>

      {/* Placeholder dialog for text / file / form response types */}
      <Dialog open={placeholderOpen} onOpenChange={setPlaceholderOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Response submission</DialogTitle>
            <DialogDescription>
              Response submission — coming soon. Full response collection will
              be available in the next update.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPlaceholderOpen(false)}
            >
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
