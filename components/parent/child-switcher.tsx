'use client';

/**
 * Parent Portal — child (sibling) switcher bottom sheet.
 * Lists every verified-linked learner across institutions; selecting one sets
 * the active child (cookie + cache invalidation, handled by the session ctx).
 */
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Check, UserPlus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useParentSession } from '@/hooks/parent/use-parent-session';

function initials(name: string) {
  return name
    .split(' ')
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

export function ChildSwitcher({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { children, activeLearnerId, setActiveLearner } = useParentSession();

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      {/* Portals to <body>, so cap + center to match the shell's mobile column. */}
      <DrawerContent className="mx-auto max-w-md">
        <DrawerHeader className="text-left">
          <DrawerTitle>Switch student</DrawerTitle>
        </DrawerHeader>

        <div className="max-h-[55vh] space-y-1 overflow-y-auto px-4 pb-2">
          {children.map((child) => {
            const isActive = child.learnerProfileId === activeLearnerId;
            return (
              <button
                key={child.learnerProfileId}
                type="button"
                onClick={() => {
                  setActiveLearner(child.learnerProfileId);
                  onOpenChange(false);
                }}
                className={cn(
                  'flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors',
                  isActive
                    ? 'border-[#0b6d41] bg-[#0b6d41]/5'
                    : 'border-transparent hover:bg-black/5 dark:hover:bg-white/5'
                )}
              >
                <Avatar className="h-11 w-11">
                  <AvatarImage src={child.photoUrl} alt={child.fullName} />
                  <AvatarFallback className="bg-[#0b6d41]/10 text-[#0b6d41]">
                    {initials(child.fullName)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{child.fullName}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {[child.className, child.institutionName].filter(Boolean).join(' · ') ||
                      child.admissionNumber}
                  </p>
                </div>
                {isActive && <Check className="h-5 w-5 shrink-0 text-[#0b6d41]" />}
              </button>
            );
          })}
        </div>

        <div className="px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-2">
          <button
            type="button"
            onClick={() => toast.info('Add Sibling is coming soon')}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-[#0b6d41]/40 py-3 text-sm font-medium text-[#0b6d41]"
          >
            <UserPlus className="h-4 w-4" />
            Add Sibling
          </button>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
