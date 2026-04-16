'use client';

// ============================================================================
// OKR Reaction Picker Component
// Slack-style reaction picker with fixed reaction set
// ============================================================================

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Smile, ThumbsUp, PartyPopper, Heart, Lightbulb, AlertCircle, HelpCircle } from 'lucide-react';
import { useOKRReactions, useToggleOKRReaction } from '@/hooks/okr';
import type { OKREntityType, OKRReactionType, OKRReactionSummary } from '@/types/okr';

// Reaction definitions with icons and labels
const REACTIONS: {
  type: OKRReactionType;
  icon: React.ReactNode;
  label: string;
  color: string;
}[] = [
  { type: 'like', icon: <ThumbsUp className="h-4 w-4" />, label: 'Like', color: 'text-blue-500' },
  { type: 'celebrate', icon: <PartyPopper className="h-4 w-4" />, label: 'Celebrate', color: 'text-yellow-500' },
  { type: 'support', icon: <Heart className="h-4 w-4" />, label: 'Support', color: 'text-red-500' },
  { type: 'insightful', icon: <Lightbulb className="h-4 w-4" />, label: 'Insightful', color: 'text-amber-500' },
  { type: 'concern', icon: <AlertCircle className="h-4 w-4" />, label: 'Concern', color: 'text-orange-500' },
  { type: 'question', icon: <HelpCircle className="h-4 w-4" />, label: 'Question', color: 'text-purple-500' },
];

interface ReactionPickerProps {
  entityType: OKREntityType | 'comment';
  entityId: string;
  className?: string;
  compact?: boolean;
}

export function ReactionPicker({
  entityType,
  entityId,
  className,
  compact = false,
}: ReactionPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const { data: reactions, isLoading } = useOKRReactions(entityType, entityId);
  const toggleReaction = useToggleOKRReaction();

  const handleReaction = async (reactionType: OKRReactionType) => {
    await toggleReaction.mutateAsync({
      entityType,
      entityId,
      reactionType,
    });
    setIsOpen(false);
  };

  // Get reaction icon for display
  const getReactionIcon = (type: OKRReactionType) => {
    const reaction = REACTIONS.find(r => r.type === type);
    return reaction?.icon;
  };

  // Get reaction color
  const getReactionColor = (type: OKRReactionType) => {
    const reaction = REACTIONS.find(r => r.type === type);
    return reaction?.color || 'text-gray-500';
  };

  return (
    <div className={cn('flex items-center gap-1 flex-wrap', className)}>
      {/* Existing reactions */}
      <TooltipProvider>
        {reactions?.map((reaction: OKRReactionSummary) => (
          <Tooltip key={reaction.reaction_type}>
            <TooltipTrigger asChild>
              <Button
                variant={reaction.user_has_reacted ? 'secondary' : 'ghost'}
                size="sm"
                className={cn(
                  'h-7 px-2 gap-1',
                  reaction.user_has_reacted && 'bg-primary/10 border border-primary/20',
                  getReactionColor(reaction.reaction_type)
                )}
                onClick={() => handleReaction(reaction.reaction_type)}
                disabled={toggleReaction.isPending}
              >
                {getReactionIcon(reaction.reaction_type)}
                <span className="text-xs font-medium">{reaction.count}</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>
                {REACTIONS.find(r => r.type === reaction.reaction_type)?.label}
                {reaction.user_has_reacted && ' (you reacted)'}
              </p>
            </TooltipContent>
          </Tooltip>
        ))}
      </TooltipProvider>

      {/* Add reaction button */}
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              'h-7 px-2',
              compact ? 'w-7' : 'gap-1'
            )}
            disabled={isLoading}
          >
            <Smile className="h-4 w-4 text-muted-foreground" />
            {!compact && <span className="text-xs text-muted-foreground">React</span>}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-2" align="start">
          <div className="flex gap-1">
            {REACTIONS.map((reaction) => {
              const hasReacted = reactions?.find(
                (r: OKRReactionSummary) => r.reaction_type === reaction.type
              )?.user_has_reacted;

              return (
                <TooltipProvider key={reaction.type}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant={hasReacted ? 'secondary' : 'ghost'}
                        size="sm"
                        className={cn(
                          'h-8 w-8 p-0',
                          hasReacted && 'bg-primary/10',
                          reaction.color
                        )}
                        onClick={() => handleReaction(reaction.type)}
                        disabled={toggleReaction.isPending}
                      >
                        {reaction.icon}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{reaction.label}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

// Compact version for inline use
export function ReactionBadges({
  entityType,
  entityId,
  className,
}: Omit<ReactionPickerProps, 'compact'>) {
  const { data: reactions } = useOKRReactions(entityType, entityId);

  if (!reactions?.length) return null;

  return (
    <div className={cn('flex items-center gap-0.5', className)}>
      {reactions.slice(0, 3).map((reaction: OKRReactionSummary) => (
        <div
          key={reaction.reaction_type}
          className={cn(
            'flex items-center gap-0.5 text-xs',
            REACTIONS.find(r => r.type === reaction.reaction_type)?.color
          )}
        >
          {REACTIONS.find(r => r.type === reaction.reaction_type)?.icon}
          <span>{reaction.count}</span>
        </div>
      ))}
      {reactions.length > 3 && (
        <span className="text-xs text-muted-foreground">
          +{reactions.length - 3}
        </span>
      )}
    </div>
  );
}
