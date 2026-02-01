'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import { Plus, MoreHorizontal, Check, Clock, AlertCircle, Ban } from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import type {
  MaturityProgressItem,
  ProgressStatus,
  MaturityDimensionName,
  MaturityStage
} from '@/types/maturity-assessment';
import { MATURITY_DIMENSIONS, MATURITY_STAGE_NAMES } from '@/types/maturity-assessment';
import {
  useMaturityProgressByAssessment,
  useCreateMaturityProgress,
  useUpdateMaturityProgress,
  useCompleteMaturityProgress,
  useDeleteMaturityProgress
} from '@/hooks/maturity-assessment';

interface ProgressTrackerProps {
  assessmentId: string;
  isReadOnly?: boolean;
}

const statusConfig: Record<
  ProgressStatus,
  { label: string; color: string; icon: React.ElementType }
> = {
  pending: { label: 'Pending', color: 'bg-gray-100 text-gray-800', icon: Clock },
  in_progress: {
    label: 'In Progress',
    color: 'bg-blue-100 text-blue-800',
    icon: Clock
  },
  completed: {
    label: 'Completed',
    color: 'bg-green-100 text-green-800',
    icon: Check
  },
  blocked: {
    label: 'Blocked',
    color: 'bg-red-100 text-red-800',
    icon: Ban
  }
};

function AddProgressItemDialog({
  assessmentId,
  onClose
}: {
  assessmentId: string;
  onClose: () => void;
}) {
  const [formData, setFormData] = useState({
    action_item: '',
    dimension: '' as MaturityDimensionName | '',
    target_stage: 2 as MaturityStage,
    due_date: '',
    notes: ''
  });

  const createMutation = useCreateMaturityProgress();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.action_item || !formData.dimension) return;

    try {
      await createMutation.mutateAsync({
        assessment_id: assessmentId,
        action_item: formData.action_item,
        dimension: formData.dimension as MaturityDimensionName,
        target_stage: formData.target_stage,
        due_date: formData.due_date || undefined,
        notes: formData.notes || undefined
      });
      onClose();
    } catch (error) {
      console.error('Failed to create progress item:', error);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="action_item">Action Item</Label>
        <Textarea
          id="action_item"
          value={formData.action_item}
          onChange={(e) =>
            setFormData({ ...formData, action_item: e.target.value })
          }
          placeholder="Describe the action to be taken..."
          required
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="dimension">Dimension</Label>
          <Select
            value={formData.dimension}
            onValueChange={(v) =>
              setFormData({ ...formData, dimension: v as MaturityDimensionName })
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="Select dimension" />
            </SelectTrigger>
            <SelectContent>
              {MATURITY_DIMENSIONS.map((dim) => (
                <SelectItem key={dim} value={dim}>
                  {dim}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="target_stage">Target Stage</Label>
          <Select
            value={formData.target_stage.toString()}
            onValueChange={(v) =>
              setFormData({ ...formData, target_stage: parseInt(v) as MaturityStage })
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[1, 2, 3, 4].map((stage) => (
                <SelectItem key={stage} value={stage.toString()}>
                  Stage {stage}: {MATURITY_STAGE_NAMES[stage as MaturityStage]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="due_date">Due Date</Label>
          <Input
            id="due_date"
            type="date"
            value={formData.due_date}
            onChange={(e) =>
              setFormData({ ...formData, due_date: e.target.value })
            }
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="notes">Notes</Label>
        <Textarea
          id="notes"
          value={formData.notes}
          onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
          placeholder="Additional notes..."
          rows={2}
        />
      </div>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={createMutation.isPending}>
          Add Action Item
        </Button>
      </div>
    </form>
  );
}

function ProgressItemCard({
  item,
  isReadOnly
}: {
  item: MaturityProgressItem;
  isReadOnly?: boolean;
}) {
  const updateMutation = useUpdateMaturityProgress();
  const completeMutation = useCompleteMaturityProgress();
  const deleteMutation = useDeleteMaturityProgress();

  const config = statusConfig[item.status];
  const StatusIcon = config.icon;
  const isOverdue =
    item.status !== 'completed' &&
    item.due_date &&
    new Date(item.due_date) < new Date();

  const handleStatusChange = async (newStatus: ProgressStatus) => {
    if (newStatus === 'completed') {
      await completeMutation.mutateAsync(item.id);
    } else {
      await updateMutation.mutateAsync({
        id: item.id,
        dto: { status: newStatus }
      });
    }
  };

  return (
    <div
      className={`p-4 rounded-lg border ${
        isOverdue ? 'border-red-300 bg-red-50' : 'border-gray-200'
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 space-y-1">
          <p className="font-medium">{item.action_item}</p>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Badge variant="outline" className="text-xs">
              {item.dimension}
            </Badge>
            <span>Target: Stage {item.target_stage}</span>
            {item.due_date && (
              <>
                <span>|</span>
                <span className={isOverdue ? 'text-red-600' : ''}>
                  Due: {format(new Date(item.due_date), 'MMM d, yyyy')}
                </span>
                {isOverdue && <AlertCircle className="h-4 w-4 text-red-600" />}
              </>
            )}
          </div>
          {item.notes && (
            <p className="text-sm text-muted-foreground mt-2">{item.notes}</p>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Badge className={config.color}>
            <StatusIcon className="h-3 w-3 mr-1" />
            {config.label}
          </Badge>

          {!isReadOnly && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {item.status !== 'pending' && (
                  <DropdownMenuItem onClick={() => handleStatusChange('pending')}>
                    Mark as Pending
                  </DropdownMenuItem>
                )}
                {item.status !== 'in_progress' && (
                  <DropdownMenuItem
                    onClick={() => handleStatusChange('in_progress')}
                  >
                    Mark as In Progress
                  </DropdownMenuItem>
                )}
                {item.status !== 'completed' && (
                  <DropdownMenuItem
                    onClick={() => handleStatusChange('completed')}
                  >
                    Mark as Completed
                  </DropdownMenuItem>
                )}
                {item.status !== 'blocked' && (
                  <DropdownMenuItem onClick={() => handleStatusChange('blocked')}>
                    Mark as Blocked
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem
                  onClick={() => deleteMutation.mutateAsync(item.id)}
                  className="text-red-600"
                >
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>
    </div>
  );
}

export function ProgressTracker({ assessmentId, isReadOnly }: ProgressTrackerProps) {
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const { data, isLoading } = useMaturityProgressByAssessment(assessmentId);

  const items = data?.data || [];

  // Group by dimension
  const groupedItems = items.reduce(
    (acc, item) => {
      if (!acc[item.dimension]) {
        acc[item.dimension] = [];
      }
      acc[item.dimension].push(item);
      return acc;
    },
    {} as Record<string, MaturityProgressItem[]>
  );

  // Stats
  const stats = {
    total: items.length,
    completed: items.filter((i) => i.status === 'completed').length,
    inProgress: items.filter((i) => i.status === 'in_progress').length,
    overdue: items.filter(
      (i) =>
        i.status !== 'completed' && i.due_date && new Date(i.due_date) < new Date()
    ).length
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          Loading progress items...
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Improvement Actions</CardTitle>
            <CardDescription>
              Track progress on improvement initiatives
            </CardDescription>
          </div>
          {!isReadOnly && (
            <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <Plus className="h-4 w-4 mr-1" />
                  Add Action
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add Improvement Action</DialogTitle>
                </DialogHeader>
                <AddProgressItemDialog
                  assessmentId={assessmentId}
                  onClose={() => setIsAddDialogOpen(false)}
                />
              </DialogContent>
            </Dialog>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-4 gap-4">
          <div className="text-center p-3 bg-muted/50 rounded-lg">
            <div className="text-2xl font-bold">{stats.total}</div>
            <div className="text-xs text-muted-foreground">Total</div>
          </div>
          <div className="text-center p-3 bg-green-50 rounded-lg">
            <div className="text-2xl font-bold text-green-600">
              {stats.completed}
            </div>
            <div className="text-xs text-muted-foreground">Completed</div>
          </div>
          <div className="text-center p-3 bg-blue-50 rounded-lg">
            <div className="text-2xl font-bold text-blue-600">
              {stats.inProgress}
            </div>
            <div className="text-xs text-muted-foreground">In Progress</div>
          </div>
          <div className="text-center p-3 bg-red-50 rounded-lg">
            <div className="text-2xl font-bold text-red-600">{stats.overdue}</div>
            <div className="text-xs text-muted-foreground">Overdue</div>
          </div>
        </div>

        {/* Items grouped by dimension */}
        {Object.keys(groupedItems).length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <p>No improvement actions yet.</p>
            {!isReadOnly && (
              <p className="text-sm mt-2">
                Add action items to track progress toward your target stage.
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-6">
            {MATURITY_DIMENSIONS.filter((dim) => groupedItems[dim]?.length > 0).map(
              (dimension) => (
                <div key={dimension}>
                  <h4 className="font-medium mb-3">{dimension}</h4>
                  <div className="space-y-2">
                    {groupedItems[dimension].map((item) => (
                      <ProgressItemCard
                        key={item.id}
                        item={item}
                        isReadOnly={isReadOnly}
                      />
                    ))}
                  </div>
                </div>
              )
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
