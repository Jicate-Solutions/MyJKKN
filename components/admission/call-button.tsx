'use client';

import { useState } from 'react';
import { Phone, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useCallMutations } from '@/hooks/admission/use-call-mutations';
import {
  normalizeIndianPhone,
  maskPhone,
  isValidIndianMobile,
} from '@/lib/utils/phone-number';
import { cn } from '@/lib/utils';

// ============================================================================
// TYPES
// ============================================================================

interface CallButtonProps {
  institutionId: string;
  prospectPhone: string;
  prospectName?: string;
  leadId?: string;
  counselorPhone: string;
  variant?: 'default' | 'ghost' | 'outline' | 'icon';
  size?: 'default' | 'sm' | 'lg' | 'icon';
  iconOnly?: boolean;
  onCallInitiated?: (callLogId: string) => void;
  skipConfirmation?: boolean;
  className?: string;
}

// ============================================================================
// COMPONENT
// ============================================================================

export function CallButton({
  institutionId,
  prospectPhone,
  prospectName,
  leadId,
  counselorPhone,
  variant = 'outline',
  size = 'sm',
  iconOnly = false,
  onCallInitiated,
  skipConfirmation = false,
  className,
}: CallButtonProps) {
  const [open, setOpen] = useState(false);
  const { initiateCall, isInitiating } = useCallMutations();

  const isValid = isValidIndianMobile(prospectPhone);
  const maskedPhone = maskPhone(prospectPhone);

  const handleInitiateCall = () => {
    initiateCall.mutate(
      {
        institution_id: institutionId,
        counselor_phone: normalizeIndianPhone(counselorPhone),
        prospect_phone: normalizeIndianPhone(prospectPhone),
        lead_id: leadId,
      },
      {
        onSuccess: (data) => {
          setOpen(false);
          onCallInitiated?.(data.call_log_id);
        },
      }
    );
  };

  const handleTriggerClick = () => {
    if (skipConfirmation) {
      handleInitiateCall();
    } else {
      setOpen(true);
    }
  };

  const triggerButton = (
    <Button
      variant={variant === 'icon' ? 'ghost' : variant}
      size={size === 'icon' ? 'icon' : size}
      disabled={isInitiating || !isValid}
      onClick={skipConfirmation ? handleTriggerClick : undefined}
      className={cn(className)}
      aria-label={`Call ${prospectName ?? maskedPhone}`}
      title={!isValid ? 'Invalid phone number' : undefined}
    >
      {isInitiating ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Phone className="h-4 w-4" />
      )}
      {!iconOnly && (
        <span className="ml-2">
          {isInitiating ? 'Connecting...' : 'Call'}
        </span>
      )}
    </Button>
  );

  if (skipConfirmation) {
    return triggerButton;
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{triggerButton}</PopoverTrigger>
      <PopoverContent className="w-72 p-4" side="top" align="center">
        <div className="space-y-3">
          {/* Header */}
          <div className="space-y-1">
            {prospectName && (
              <p className="text-sm font-semibold text-foreground leading-none">
                {prospectName}
              </p>
            )}
            <p className="text-sm text-muted-foreground font-mono">{maskedPhone}</p>
          </div>

          {/* Info message */}
          <p className="text-xs text-muted-foreground">
            Your phone will ring first, then connect you to the prospect.
          </p>

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            <Button
              variant="ghost"
              size="sm"
              className="flex-1"
              onClick={() => setOpen(false)}
              disabled={isInitiating}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              className="flex-1"
              onClick={handleInitiateCall}
              disabled={isInitiating}
            >
              {isInitiating ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                  Connecting...
                </>
              ) : (
                <>
                  <Phone className="h-3.5 w-3.5 mr-1.5" />
                  Call Now
                </>
              )}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
