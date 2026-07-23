'use client';

import { Button } from '@/components/ui/button';
import { Phone, MessageCircle } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
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
    /**
     * Optional: when present, the primary Call button reads
     * "Call <first name>" so the user knows who they're dialing.
     * Falls back to the phone number when absent — page.tsx call
     * site is unchanged (file-disjoint with sibling PRs).
     */
    full_name?: string | null;
  };
  onLogCall: () => void;
  onWhatsApp: () => void;
  // ── Phase 2 consolidation (2026-05-12) ──
  // SMS / Note / Follow-up / Email used to live in a "⋯ More" dropdown here.
  // Note + Follow-up are now inside the Log Call modal (Phase 1); SMS was
  // never wired (TODO). The More button was removed. These props are kept
  // as optional so callers don't need to be updated, but they're no-ops.
  onSMS?: () => void;
  onEmail?: () => void;
  onNote?: () => void;
  onFollowUp?: () => void;
  isWAConnected?: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// Component
// ═══════════════════════════════════════════════════════════════════════════
//
// Action hierarchy (post Phase-2 consolidation — 2026-05-12):
//
//   ┌──────────────────────────────────────────────┐
//   │  📞 Call <first name>                         │   PRIMARY (full-width)
//   └──────────────────────────────────────────────┘
//   ┌──────────────────────┬───────────────────────┐
//   │      Log Call        │       WhatsApp        │   SECONDARY ROW
//   └──────────────────────┴───────────────────────┘
//
// The ⋯ More button (SMS / Note / Follow-up / Email) was removed because
// Note + Follow-up are now inside the Log Call modal (Phase 1) and SMS was
// never wired up. Email re-entry can come back as a dedicated icon later if
// needed.
//
// The user comes to this page to CALL the lead. Promote that.

export function QuickActionsBar({
  lead,
  onLogCall,
  onWhatsApp,
  isWAConnected = true,
}: QuickActionsBarProps) {
  // Build available phone numbers (preserved from prior implementation)
  const phones: PhoneEntry[] = [
    lead.phone ? { label: 'Primary', number: lead.phone } : null,
    lead.alternate_phone ? { label: 'Alternate', number: lead.alternate_phone } : null,
    lead.parent_phone
      ? {
          label: lead.parent_name ? `Parent (${lead.parent_name})` : 'Parent',
          number: lead.parent_phone,
        }
      : null,
  ].filter(Boolean) as PhoneEntry[];

  const hasPhone = phones.length > 0;
  const firstName = lead.full_name?.split(' ')[0]?.trim();
  const primaryLabel = firstName
    ? `Call ${firstName}`
    : hasPhone
      ? `Call ${phones[0].number}`
      : 'Call';

  return (
    <div className="flex flex-col gap-2 py-2">
      {/* ──────────────────────────────────────────────────────────────────
          PRIMARY: Call (full-width, dial-blue)
          - 1 phone:   <a href="tel:..."> direct
          - 2+ phones: dropdown to pick (Primary / Alternate / Parent)
          - 0 phones:  disabled with tooltip
          ────────────────────────────────────────────────────────────────── */}
      {!hasPhone ? (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="block">
                <Button
                  size="lg"
                  disabled
                  className="w-full gap-2 bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  <Phone className="h-5 w-5" />
                  Call
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent>No phone on file.</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ) : phones.length === 1 ? (
        <Button
          size="lg"
          asChild
          className="w-full gap-2 bg-blue-600 text-white hover:bg-blue-700 shadow-sm"
        >
          <a href={`tel:${phones[0].number}`} aria-label={`${primaryLabel} on ${phones[0].number}`}>
            <Phone className="h-5 w-5" />
            <span className="truncate">{primaryLabel}</span>
          </a>
        </Button>
      ) : (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="lg"
              className="w-full gap-2 bg-blue-600 text-white hover:bg-blue-700 shadow-sm"
            >
              <Phone className="h-5 w-5" />
              <span className="truncate">{primaryLabel}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-[var(--radix-dropdown-menu-trigger-width)] min-w-[14rem]">
            <DropdownMenuLabel className="text-xs">Choose number</DropdownMenuLabel>
            <DropdownMenuSeparator />
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
      )}

      {/* ──────────────────────────────────────────────────────────────────
          SECONDARY ROW: Log Call · WhatsApp (2 equal columns)
          More menu removed in Phase 2 (2026-05-12).
          ────────────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-2">
        {/* Log Call — disposition + lead-update dialog (unified counselor modal) */}
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 h-9 text-xs bg-green-50 border-green-200 text-green-700 hover:bg-green-100 hover:text-green-800"
          onClick={onLogCall}
        >
          <Phone className="h-3.5 w-3.5" />
          <span className="truncate">Log Call</span>
        </Button>

        {/* WhatsApp — brand-green icon, neutral chrome */}
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="block">
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full gap-1.5 h-9 text-xs"
                  onClick={onWhatsApp}
                  disabled={!isWAConnected}
                >
                  <MessageCircle className="h-3.5 w-3.5 text-[#25D366]" />
                  <span className="truncate">WhatsApp</span>
                </Button>
              </span>
            </TooltipTrigger>
            {!isWAConnected && (
              <TooltipContent>Connect Personal WhatsApp in Settings</TooltipContent>
            )}
          </Tooltip>
        </TooltipProvider>
      </div>
    </div>
  );
}
