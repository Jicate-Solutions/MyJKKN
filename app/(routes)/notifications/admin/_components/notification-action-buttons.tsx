'use client';

/**
 * NotificationActionButtons
 *
 * Renders action buttons at the bottom of a NotificationCard. Three action
 * shapes are supported:
 *
 *   1. action_type='open_url'   → emitted by the dashboard cron
 *      (fn_create_dashboard_work_item). action_config carries `{ url, ... }`
 *      with the destination link. Renders a single context-aware "Open"
 *      button that navigates to that URL.
 *
 *   2. action_type='urgent' | 'tracked' → emitted by the admin Send
 *      Notification form. action_config has `response_type` ('text', 'file',
 *      'form', 'link'). Renders a Respond/Upload/Fill/Open button.
 *
 *   3. No action_type or no action_config → returns null (no buttons).
 *
 * The component intentionally accepts `actionType` and `actionConfig` as
 * loose strings/any to handle the DB's reality (action_type='open_url') —
 * the TypeScript ActionType union is narrower than what the database emits.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  MessageSquare,
  Paperclip,
  FileText,
  ExternalLink,
  ArrowRight,
  Phone,
  CreditCard,
  ClipboardList,
  CheckCircle2,
  AlertCircle
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

// Props use loose strings/any to accommodate dashboard-cron payloads that
// don't conform to the narrow TypeScript ActionType / ActionConfig contract.
interface NotificationActionButtonsProps {
  notificationId: string;
  actionType?: string | null;
  actionConfig?: Record<string, any> | null;
  /** Notification category — used to pick a context-aware label/icon for open_url */
  category?: string;
  className?: string;
}

// ─── Form-style response (response_type pattern) ──────────────────────────────

function getResponseIcon(responseType: string) {
  switch (responseType) {
    case 'text':
      return <MessageSquare className='h-4 w-4' />;
    case 'file':
      return <Paperclip className='h-4 w-4' />;
    case 'form':
      return <FileText className='h-4 w-4' />;
    case 'link':
      return <ExternalLink className='h-4 w-4' />;
    default:
      return <ArrowRight className='h-4 w-4' />;
  }
}

function getResponseLabel(responseType: string): string {
  switch (responseType) {
    case 'text':
      return 'Respond';
    case 'file':
      return 'Upload file';
    case 'form':
      return 'Fill form';
    case 'link':
      return 'Open link';
    default:
      return 'Open';
  }
}

// ─── Open-URL style (dashboard cron pattern) ──────────────────────────────────

function getOpenButtonForCategory(category: string | undefined): {
  label: string;
  icon: React.ReactNode;
} {
  const lc = (category || '').toLowerCase();
  if (lc.startsWith('dashboard:rescue'))
    return { label: 'Open Lead', icon: <Phone className='h-4 w-4' /> };
  if (lc.startsWith('dashboard:escalation'))
    return { label: 'Open Invoice', icon: <CreditCard className='h-4 w-4' /> };
  if (lc.startsWith('dashboard:approval'))
    return {
      label: 'Review Request',
      icon: <ClipboardList className='h-4 w-4' />
    };
  if (lc.startsWith('dashboard:anomaly'))
    return { label: 'Investigate', icon: <AlertCircle className='h-4 w-4' /> };
  return { label: 'Open', icon: <ArrowRight className='h-4 w-4' /> };
}

export function NotificationActionButtons({
  notificationId,
  actionType,
  actionConfig,
  category,
  className
}: NotificationActionButtonsProps) {
  const router = useRouter();
  const [placeholderOpen, setPlaceholderOpen] = useState(false);

  // Three branches, in priority order:
  //   1. open_url + url  → render single "Open Lead/Invoice/..." button
  //   2. tracked/urgent + response_type → render the form-response button
  //   3. otherwise → render nothing
  const isOpenUrl = actionType === 'open_url';
  const openUrl =
    typeof actionConfig?.url === 'string' && actionConfig.url.length > 0
      ? actionConfig.url
      : null;
  const responseType =
    typeof actionConfig?.response_type === 'string'
      ? actionConfig.response_type
      : null;

  // Bail out when there's nothing actionable
  if (!actionType || !actionConfig) return null;
  if (!isOpenUrl && !responseType) return null;
  if (isOpenUrl && !openUrl) return null;

  const isUrgent = actionType === 'urgent';

  function navigate(e: React.MouseEvent, url: string) {
    e.stopPropagation();
    e.preventDefault();
    // Internal app URLs use router.push for client-nav; external open in new tab
    if (url.startsWith('/')) {
      router.push(url);
    } else if (url.startsWith('http')) {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  }

  function handleResponseClick(e: React.MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
    if (responseType === 'link' && actionConfig?.link_url) {
      window.open(actionConfig.link_url, '_blank', 'noopener,noreferrer');
      return;
    }
    setPlaceholderOpen(true);
  }

  function handleViewDetails(e: React.MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
    router.push(`/notifications/${notificationId}`);
  }

  // ── Render: open_url path ──────────────────────────────────────────────────
  if (isOpenUrl && openUrl) {
    const { label, icon } = getOpenButtonForCategory(category);
    return (
      <div
        className={cn(
          'flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-3 mt-3 border-t border-border',
          className
        )}
      >
        <Button
          variant='default'
          size='sm'
          className='w-full sm:w-auto gap-2'
          onClick={(e) => navigate(e, openUrl)}
        >
          {icon}
          {label}
        </Button>

        <Button
          variant='ghost'
          size='sm'
          className='w-full sm:w-auto text-muted-foreground hover:text-foreground gap-1.5'
          onClick={handleViewDetails}
        >
          <CheckCircle2 className='h-3.5 w-3.5' />
          Mark seen
        </Button>
      </div>
    );
  }

  // ── Render: form-response path ─────────────────────────────────────────────
  const responseLabel = actionConfig?.response_label || getResponseLabel(responseType!);
  return (
    <>
      <div
        className={cn(
          'flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-3 mt-3 border-t border-border',
          className
        )}
      >
        <Button
          variant='default'
          size='sm'
          className='w-full sm:w-auto gap-2'
          onClick={handleResponseClick}
        >
          {getResponseIcon(responseType!)}
          {responseLabel}
        </Button>

        {isUrgent && (
          <Badge
            variant='destructive'
            className='self-center text-xs font-semibold uppercase tracking-wide px-2 py-0.5'
          >
            Urgent
          </Badge>
        )}

        <Button
          variant='ghost'
          size='sm'
          className='w-full sm:w-auto text-muted-foreground hover:text-foreground'
          onClick={handleViewDetails}
        >
          View details
        </Button>
      </div>

      <Dialog open={placeholderOpen} onOpenChange={setPlaceholderOpen}>
        <DialogContent className='sm:max-w-md'>
          <DialogHeader>
            <DialogTitle>Response submission</DialogTitle>
            <DialogDescription>
              Response submission — coming soon. Full response collection will
              be available in the next update.
            </DialogDescription>
          </DialogHeader>
          <div className='flex justify-end pt-2'>
            <Button
              variant='outline'
              size='sm'
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
