'use client';

/**
 * Polls Client Component
 * Interactive poll list, voting, creation, and results
 */

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import {
  Vote,
  Plus,
  BarChart3,
  Clock,
  Users,
  CheckCircle2,
  X,
  Trash2
} from 'lucide-react';
import {
  usePolls,
  useCreatePoll,
  useVotePoll,
  useClosePoll,
  useUserVote
} from '@/hooks/learners-council/use-lc-communication';
import type {
  LCPoll,
  LCPollOption,
  PollScope,
  PollType,
  CreatePollDto
} from '@/types/learners-council';

const statusConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  draft: { label: 'Draft', variant: 'outline' },
  active: { label: 'Active', variant: 'default' },
  paused: { label: 'Paused', variant: 'secondary' },
  closed: { label: 'Closed', variant: 'destructive' }
};

interface PollsClientProps {
  initialPolls: LCPoll[];
  userId: string;
  canCreate: boolean;
}

export function PollsClient({ initialPolls, userId, canCreate }: PollsClientProps) {
  const [statusFilter, setStatusFilter] = useState<string>('active');
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [selectedPollId, setSelectedPollId] = useState<string | null>(null);

  // Create form state
  const [formTitle, setFormTitle] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formType, setFormType] = useState<PollType>('multiple_choice');
  const [formScope, setFormScope] = useState<PollScope>('lc_wide');
  const [formOptions, setFormOptions] = useState<string[]>(['', '']);
  const [formStartsAt, setFormStartsAt] = useState('');
  const [formEndsAt, setFormEndsAt] = useState('');

  const filters = {
    status: statusFilter !== 'all' ? (statusFilter as any) : undefined,
    page: 1,
    limit: 20
  };

  const { data: pollsData, isLoading } = usePolls(filters);
  const createMutation = useCreatePoll();
  const closeMutation = useClosePoll();

  const polls = pollsData?.data || initialPolls;

  const addOption = () => setFormOptions([...formOptions, '']);
  const removeOption = (idx: number) => {
    if (formOptions.length <= 2) return;
    setFormOptions(formOptions.filter((_, i) => i !== idx));
  };
  const updateOption = (idx: number, val: string) => {
    const updated = [...formOptions];
    updated[idx] = val;
    setFormOptions(updated);
  };

  const handleCreate = () => {
    const validOptions = formOptions.filter((o) => o.trim());
    if (!formTitle.trim() || validOptions.length < 2 || !formStartsAt || !formEndsAt) return;

    const dto: CreatePollDto = {
      title: formTitle.trim(),
      description: formDescription.trim() || undefined,
      type: formType,
      scope: formScope,
      starts_at: new Date(formStartsAt).toISOString(),
      ends_at: new Date(formEndsAt).toISOString(),
      options: validOptions.map((label) => ({ label: label.trim() }))
    };

    createMutation.mutate(
      { data: dto, userId },
      {
        onSuccess: () => {
          setShowCreateDialog(false);
          setFormTitle('');
          setFormDescription('');
          setFormOptions(['', '']);
          setFormStartsAt('');
          setFormEndsAt('');
        }
      }
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Vote className="h-6 w-6 text-indigo-600" />
            Polls
          </h2>
          <p className="text-muted-foreground text-sm mt-1">
            Vote on topics and see what the community thinks
          </p>
        </div>
        {canCreate && (
          <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="h-4 w-4" />
                Create Poll
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Create Poll</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div>
                  <label className="text-sm font-medium mb-1 block">Question / Title</label>
                  <Input
                    placeholder="What do you want to ask?"
                    value={formTitle}
                    onChange={(e) => setFormTitle(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium mb-1 block">Description (optional)</label>
                  <Textarea
                    placeholder="Add context..."
                    rows={2}
                    value={formDescription}
                    onChange={(e) => setFormDescription(e.target.value)}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm font-medium mb-1 block">Type</label>
                    <Select value={formType} onValueChange={(v) => setFormType(v as PollType)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="yes_no">Yes / No</SelectItem>
                        <SelectItem value="multiple_choice">Multiple Choice</SelectItem>
                        <SelectItem value="survey">Survey</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-1 block">Scope</label>
                    <Select value={formScope} onValueChange={(v) => setFormScope(v as PollScope)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="lc_wide">LC Wide</SelectItem>
                        <SelectItem value="institution">Institution</SelectItem>
                        <SelectItem value="chapter">Chapter</SelectItem>
                        <SelectItem value="vertical">Vertical</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm font-medium mb-1 block">Starts At</label>
                    <Input
                      type="datetime-local"
                      value={formStartsAt}
                      onChange={(e) => setFormStartsAt(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-1 block">Ends At</label>
                    <Input
                      type="datetime-local"
                      value={formEndsAt}
                      onChange={(e) => setFormEndsAt(e.target.value)}
                    />
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium mb-1 block">Options</label>
                  <div className="space-y-2">
                    {formOptions.map((opt, idx) => (
                      <div key={idx} className="flex gap-2">
                        <Input
                          placeholder={`Option ${idx + 1}`}
                          value={opt}
                          onChange={(e) => updateOption(idx, e.target.value)}
                        />
                        {formOptions.length > 2 && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => removeOption(idx)}
                          >
                            <Trash2 className="h-4 w-4 text-red-500" />
                          </Button>
                        )}
                      </div>
                    ))}
                    <Button variant="outline" size="sm" onClick={addOption} className="gap-1">
                      <Plus className="h-3 w-3" />
                      Add Option
                    </Button>
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={handleCreate}
                  disabled={
                    createMutation.isPending ||
                    !formTitle.trim() ||
                    formOptions.filter((o) => o.trim()).length < 2 ||
                    !formStartsAt ||
                    !formEndsAt
                  }
                >
                  {createMutation.isPending ? 'Creating...' : 'Create Poll'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Filter */}
      <div className="flex gap-3 items-center">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="closed">Closed</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Poll List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      ) : polls.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Vote className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No polls found</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {polls.map((poll) => (
            <PollCard
              key={poll.id}
              poll={poll}
              userId={userId}
              canCreate={canCreate}
              onClose={() => closeMutation.mutate(poll.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// PollCard Sub-component
// ============================================================================

function PollCard({
  poll,
  userId,
  canCreate,
  onClose
}: {
  poll: LCPoll;
  userId: string;
  canCreate: boolean;
  onClose: () => void;
}) {
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const voteMutation = useVotePoll();
  const { data: userVote } = useUserVote(poll.id, userId);

  const hasVoted = !!userVote;
  const isActive = poll.status === 'active';
  const isClosed = poll.status === 'closed';
  const totalVotes = poll.total_votes || 0;
  const options = (poll.options || []) as LCPollOption[];
  const status = statusConfig[poll.status] || statusConfig.draft;

  const handleVote = () => {
    if (!selectedOption || hasVoted) return;
    voteMutation.mutate({
      pollId: poll.id,
      optionId: selectedOption,
      userId
    });
  };

  const isExpired = new Date(poll.ends_at) < new Date();

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <Badge variant={status.variant}>{status.label}</Badge>
              {isExpired && isActive && (
                <Badge variant="outline" className="text-orange-600 border-orange-300">Expired</Badge>
              )}
            </div>
            <CardTitle className="text-base">{poll.title}</CardTitle>
          </div>
          {canCreate && isActive && (
            <Button variant="ghost" size="sm" onClick={onClose} className="text-muted-foreground">
              Close
            </Button>
          )}
        </div>
        {poll.description && (
          <p className="text-sm text-muted-foreground mt-1">{poll.description}</p>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Options */}
        {options.map((option) => {
          const percentage = totalVotes > 0 ? Math.round((option.vote_count / totalVotes) * 100) : 0;
          const isSelected = selectedOption === option.id;
          const isVotedOption = userVote?.option_id === option.id;

          // Show results if voted or closed
          if (hasVoted || isClosed) {
            return (
              <div key={option.id} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className={`flex items-center gap-1 ${isVotedOption ? 'font-semibold text-primary' : ''}`}>
                    {isVotedOption && <CheckCircle2 className="h-3.5 w-3.5" />}
                    {option.label}
                  </span>
                  <span className="text-muted-foreground">
                    {option.vote_count} ({percentage}%)
                  </span>
                </div>
                <Progress value={percentage} className="h-2" />
              </div>
            );
          }

          // Show vote buttons
          return (
            <button
              key={option.id}
              onClick={() => setSelectedOption(option.id)}
              className={`w-full text-left p-3 rounded-lg border-2 transition-colors text-sm ${
                isSelected
                  ? 'border-primary bg-primary/5'
                  : 'border-muted hover:border-primary/50'
              }`}
              disabled={!isActive}
            >
              {option.label}
            </button>
          );
        })}

        {/* Vote Button */}
        {!hasVoted && isActive && !isExpired && (
          <Button
            className="w-full mt-2"
            onClick={handleVote}
            disabled={!selectedOption || voteMutation.isPending}
          >
            {voteMutation.isPending ? 'Voting...' : 'Cast Vote'}
          </Button>
        )}

        {/* Meta info */}
        <div className="flex items-center gap-4 text-xs text-muted-foreground pt-2 border-t">
          <div className="flex items-center gap-1">
            <Users className="h-3 w-3" />
            <span>{totalVotes} vote{totalVotes !== 1 ? 's' : ''}</span>
          </div>
          <div className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            <span>
              {isClosed
                ? 'Closed'
                : isExpired
                  ? 'Expired'
                  : `Ends ${new Date(poll.ends_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`}
            </span>
          </div>
          {poll.creator && (
            <span>by {poll.creator.full_name}</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
