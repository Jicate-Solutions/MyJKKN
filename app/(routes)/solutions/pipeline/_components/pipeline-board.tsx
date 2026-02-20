'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  DndContext,
  DragOverlay,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Plus,
  List,
  ChevronDown,
  ChevronRight,
  GripVertical,
  AlertTriangle,
} from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

import { usePipelineBoard, useUpdatePipelineStage } from '@/hooks/solutions/use-prospects';
import { ProspectCard } from '@/components/solutions/pipeline/prospect-card';
import { PipelineStats } from '@/components/solutions/pipeline/pipeline-stats';
import { OverdueAlertBanner } from '@/components/solutions/pipeline/overdue-alert-banner';
import { PipelineStageBadge } from '@/components/solutions/pipeline/pipeline-stage-badge';
import { LostReasonDialog } from '@/components/solutions/pipeline/lost-reason-dialog';
import { ConvertToClientDialog } from '@/components/solutions/pipeline/convert-to-client-dialog';
import type { Prospect, PipelineStage } from '@/lib/services/solutions/types';
import {
  PIPELINE_STAGE_LABELS,
  PIPELINE_STAGE_COLORS,
  ACTIVE_STAGES,
} from '@/lib/services/solutions/prospects-service';

// ============================================
// HELPERS
// ============================================

function formatCurrency(amount: number): string {
  if (amount >= 10000000) return `${(amount / 10000000).toFixed(1)}Cr`;
  if (amount >= 100000) return `${(amount / 100000).toFixed(1)}L`;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
}

// ============================================
// SORTABLE PROSPECT CARD
// ============================================

function SortableProspectCard({
  prospect,
  onClick,
}: {
  prospect: Prospect;
  onClick: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: prospect.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="relative group">
      <div
        {...attributes}
        {...listeners}
        className="absolute left-1 top-1/2 -translate-y-1/2 z-10 opacity-0 group-hover:opacity-60 cursor-grab active:cursor-grabbing p-1"
      >
        <GripVertical className="h-4 w-4 text-muted-foreground" />
      </div>
      <ProspectCard prospect={prospect} onClick={onClick} compact />
    </div>
  );
}

// ============================================
// PIPELINE COLUMN
// ============================================

function PipelineColumn({
  stage,
  prospects,
  onCardClick,
}: {
  stage: PipelineStage;
  prospects: Prospect[];
  onCardClick: (id: string) => void;
}) {
  const colors = PIPELINE_STAGE_COLORS[stage];
  const totalValue = prospects.reduce(
    (sum, p) => sum + (p.expected_deal_size || 0),
    0
  );

  return (
    <div className="flex flex-col min-w-[280px] w-[280px] shrink-0">
      {/* Column Header */}
      <div className={cn('rounded-t-lg border px-3 py-2', colors.bg, colors.border)}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className={cn('text-sm font-semibold', colors.text)}>
              {PIPELINE_STAGE_LABELS[stage]}
            </span>
            <Badge variant="outline" className="text-xs h-5 px-1.5">
              {prospects.length}
            </Badge>
          </div>
        </div>
        {totalValue > 0 && (
          <p className="text-xs text-muted-foreground mt-0.5">
            {formatCurrency(totalValue)}
          </p>
        )}
      </div>

      {/* Column Body */}
      <SortableContext
        items={prospects.map((p) => p.id)}
        strategy={verticalListSortingStrategy}
      >
        <div
          className="flex-1 rounded-b-lg border border-t-0 bg-muted/30 p-2 space-y-2 min-h-[200px] overflow-y-auto max-h-[calc(100vh-380px)]"
          data-stage={stage}
        >
          {prospects.length === 0 ? (
            <div className="flex items-center justify-center h-24 text-xs text-muted-foreground">
              No prospects
            </div>
          ) : (
            prospects.map((prospect) => (
              <SortableProspectCard
                key={prospect.id}
                prospect={prospect}
                onClick={() => onCardClick(prospect.id)}
              />
            ))
          )}
        </div>
      </SortableContext>
    </div>
  );
}

// ============================================
// COLLAPSED SECTION (Lost / Dormant)
// ============================================

function CollapsedSection({
  stage,
  prospects,
  onCardClick,
}: {
  stage: PipelineStage;
  prospects: Prospect[];
  onCardClick: (id: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const colors = PIPELINE_STAGE_COLORS[stage];

  if (prospects.length === 0) return null;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger asChild>
        <Button
          variant="ghost"
          className={cn('w-full justify-between', colors.text)}
        >
          <div className="flex items-center gap-2">
            {isOpen ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
            <PipelineStageBadge stage={stage} />
            <span className="text-sm text-muted-foreground">
              ({prospects.length})
            </span>
          </div>
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 pt-2 pb-4">
          {prospects.map((prospect) => (
            <ProspectCard
              key={prospect.id}
              prospect={prospect}
              onClick={() => onCardClick(prospect.id)}
              compact
            />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

// ============================================
// MAIN BOARD
// ============================================

export function PipelineBoard() {
  const router = useRouter();
  const { data: boardData, isLoading } = usePipelineBoard();
  const updateStage = useUpdatePipelineStage();

  const [activeProspect, setActiveProspect] = useState<Prospect | null>(null);
  const [lostDialogOpen, setLostDialogOpen] = useState(false);
  const [pendingLostProspect, setPendingLostProspect] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [wonDialogOpen, setWonDialogOpen] = useState(false);
  const [pendingWonProspect, setPendingWonProspect] = useState<Prospect | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(KeyboardSensor)
  );

  // Build a flat lookup of all prospects across stages
  const allProspects = useMemo(() => {
    if (!boardData) return new Map<string, Prospect>();
    const map = new Map<string, Prospect>();
    for (const stage of Object.keys(boardData) as PipelineStage[]) {
      for (const p of boardData[stage]) {
        map.set(p.id, p);
      }
    }
    return map;
  }, [boardData]);

  const handleDragStart = (event: DragStartEvent) => {
    const prospect = allProspects.get(event.active.id as string);
    if (prospect) setActiveProspect(prospect);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveProspect(null);
    const { active, over } = event;

    if (!over) return;

    const prospectId = active.id as string;
    const prospect = allProspects.get(prospectId);
    if (!prospect) return;

    // Determine the target stage from the droppable container
    // The over.id could be another prospect id or the container itself
    let targetStage: PipelineStage | null = null;

    // Check if dropped over a stage container
    if (ACTIVE_STAGES.includes(over.id as PipelineStage)) {
      targetStage = over.id as PipelineStage;
    } else {
      // Dropped over another prospect card - find which stage it belongs to
      const overProspect = allProspects.get(over.id as string);
      if (overProspect) {
        targetStage = overProspect.pipeline_stage;
      }
    }

    if (!targetStage || targetStage === prospect.pipeline_stage) return;

    // If target is 'lost', show the lost reason dialog
    if (targetStage === 'lost') {
      setPendingLostProspect({
        id: prospectId,
        name: prospect.company_name,
      });
      setLostDialogOpen(true);
      return;
    }

    // If target is 'won', show the convert to client dialog
    if (targetStage === 'won') {
      setPendingWonProspect(prospect);
      setWonDialogOpen(true);
      return;
    }

    // Otherwise, update the stage directly
    updateStage.mutate(
      { id: prospectId, stage: targetStage },
      {
        onSuccess: () => {
          toast.success(
            `Moved "${prospect.company_name}" to ${PIPELINE_STAGE_LABELS[targetStage!]}`
          );
        },
        onError: () => {
          toast.error('Failed to update pipeline stage');
        },
      }
    );
  };

  const handleLostConfirm = (reason: string) => {
    if (!pendingLostProspect) return;

    updateStage.mutate(
      {
        id: pendingLostProspect.id,
        stage: 'lost',
        lostReason: reason,
      },
      {
        onSuccess: () => {
          toast.success(`"${pendingLostProspect.name}" marked as lost`);
          setLostDialogOpen(false);
          setPendingLostProspect(null);
        },
        onError: () => {
          toast.error('Failed to update pipeline stage');
        },
      }
    );
  };

  const handleCardClick = (id: string) => {
    router.push(`/solutions/pipeline/${id}`);
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
        <div className="flex gap-4 overflow-hidden">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-96 w-[280px] shrink-0" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Overdue Follow-up Reminders */}
      <OverdueAlertBanner />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold py-1">Pipeline Board</h1>
          <p className="text-sm text-muted-foreground">
            Drag prospects between stages to update their pipeline status
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href="/solutions/pipeline/list">
              <List className="h-4 w-4 mr-1" />
              List View
            </Link>
          </Button>
          <Button size="sm" asChild>
            <Link href="/solutions/pipeline/new">
              <Plus className="h-4 w-4 mr-1" />
              Add Prospect
            </Link>
          </Button>
        </div>
      </div>

      {/* Stats */}
      <PipelineStats />

      {/* Board */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="flex gap-4 overflow-x-auto pb-4">
          {ACTIVE_STAGES.map((stage) => (
            <PipelineColumn
              key={stage}
              stage={stage}
              prospects={boardData?.[stage] || []}
              onCardClick={handleCardClick}
            />
          ))}
        </div>

        <DragOverlay>
          {activeProspect ? (
            <div className="w-[280px] rotate-2 opacity-90">
              <ProspectCard prospect={activeProspect} compact />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {/* Collapsed Lost/Dormant */}
      <div className="space-y-2 border-t pt-4">
        <CollapsedSection
          stage="lost"
          prospects={boardData?.lost || []}
          onCardClick={handleCardClick}
        />
        <CollapsedSection
          stage="dormant"
          prospects={boardData?.dormant || []}
          onCardClick={handleCardClick}
        />
      </div>

      {/* Lost Reason Dialog */}
      <LostReasonDialog
        open={lostDialogOpen}
        onOpenChange={(open) => {
          setLostDialogOpen(open);
          if (!open) setPendingLostProspect(null);
        }}
        onConfirm={handleLostConfirm}
        isLoading={updateStage.isPending}
        prospectName={pendingLostProspect?.name}
      />

      {/* Convert to Client Dialog */}
      <ConvertToClientDialog
        open={wonDialogOpen}
        onOpenChange={(open) => {
          setWonDialogOpen(open);
          if (!open) setPendingWonProspect(null);
        }}
        prospect={pendingWonProspect}
      />
    </div>
  );
}
