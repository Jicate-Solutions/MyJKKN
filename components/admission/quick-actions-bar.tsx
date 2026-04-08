'use client';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Phone,
  MessageCircle,
  MessageSquare,
  Mail,
  StickyNote,
  CalendarClock,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

// ═══════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════

interface PhoneEntry {
  label: string;
  number: string;
}

interface QuickActionsBarProps {
  lead: {
    phone: string;
    alternate_phone?: string | null;
    parent_phone?: string | null;
    parent_name?: string | null;
    email?: string | null;
  };
  onLogCall: () => void;
  onWhatsApp: () => void;
  onSMS: () => void;
  onEmail?: () => void;
  onNote: () => void;
  onFollowUp: () => void;
  isWAConnected?: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// Component
// ═══════════════════════════════════════════════════════════════════════════

export function QuickActionsBar({
  lead,
  onLogCall,
  onWhatsApp,
  onSMS,
  onEmail,
  onNote,
  onFollowUp,
  isWAConnected = true,
}: QuickActionsBarProps) {
  // Build available phone numbers
  const phones: PhoneEntry[] = [
    lead.phone ? { label: 'Primary', number: lead.phone } : null,
    lead.alternate_phone ? { label: 'Alternate', number: lead.alternate_phone } : null,
    lead.parent_phone
      ? { label: lead.parent_name ? `Parent (${lead.parent_name})` : 'Parent', number: lead.parent_phone }
      : null,
  ].filter(Boolean) as PhoneEntry[];

  return (
    <div className="flex flex-wrap items-center gap-1.5 py-2">
      {/* Call — opens phone dialer via tel: link */}
      {phones.length > 1 ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1.5 h-8 text-xs">
              <Phone className="h-3.5 w-3.5" /> Call
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {phones.map((p) => (
              <DropdownMenuItem key={p.number} asChild>
                <a href={`tel:${p.number}`} className="cursor-pointer">
                  <span className="text-muted-foreground text-xs mr-2">{p.label}:</span>
                  {p.number}
                </a>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : phones.length === 1 ? (
        <Button variant="outline" size="sm" className="gap-1.5 h-8 text-xs" asChild>
          <a href={`tel:${phones[0].number}`}>
            <Phone className="h-3.5 w-3.5" /> Call
          </a>
        </Button>
      ) : null}

      {/* Log Call — opens the disposition dialog */}
      <Button
        variant="outline"
        size="sm"
        className="gap-1.5 h-8 text-xs bg-green-50 border-green-200 text-green-700 hover:bg-green-100"
        onClick={onLogCall}
      >
        <Phone className="h-3.5 w-3.5" /> Log Call
      </Button>

      {/* WhatsApp */}
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 h-8 text-xs"
                onClick={onWhatsApp}
                disabled={!isWAConnected}
              >
                <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
              </Button>
            </span>
          </TooltipTrigger>
          {!isWAConnected && (
            <TooltipContent>Connect Personal WhatsApp in Settings</TooltipContent>
          )}
        </Tooltip>
      </TooltipProvider>

      {/* SMS */}
      <Button variant="outline" size="sm" className="gap-1.5 h-8 text-xs" onClick={onSMS}>
        <MessageSquare className="h-3.5 w-3.5" /> SMS
      </Button>

      {/* Email */}
      {onEmail && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 h-8 text-xs"
                  onClick={onEmail}
                  disabled={!lead.email}
                >
                  <Mail className="h-3.5 w-3.5" /> Email
                </Button>
              </span>
            </TooltipTrigger>
            {!lead.email && (
              <TooltipContent>No email on record — add one first</TooltipContent>
            )}
          </Tooltip>
        </TooltipProvider>
      )}

      <div className="h-4 border-l mx-0.5 hidden sm:block" />

      {/* Note */}
      <Button variant="ghost" size="sm" className="gap-1.5 h-8 text-xs" onClick={onNote}>
        <StickyNote className="h-3.5 w-3.5" /> Note
      </Button>

      {/* Follow-up */}
      <Button variant="ghost" size="sm" className="gap-1.5 h-8 text-xs" onClick={onFollowUp}>
        <CalendarClock className="h-3.5 w-3.5" /> Follow-up
      </Button>
    </div>
  );
}
