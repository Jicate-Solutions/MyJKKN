'use client';

/**
 * LC-006: Issues Kanban Board Client Component
 * Kanban columns: New | In Progress | Resolved | Closed
 * With stats summary, filters, create dialog, and card interactions
 */

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import {
  Kanban,
  Plus,
  AlertCircle,
  Clock,
  CheckCircle2,
  Archive,
  ArrowRight,
  TrendingUp,
  Filter,
  UserPlus
} from 'lucide-react';
import {
  useKanbanBoard,
  useIssueStats,
  useCreateLCIssue,
  useUpdateIssueStatus,
  useAssignIssue,
  useEscalateIssue,
  useAddComment
} from '@/hooks/learners-council/use-lc-issues';
import type { GrievanceTicket } from '@/types/grievance';

/** Priority badge colors */
function getPriorityBadge(priority: string) {
  const config: Record<string, { color: string; label: string }> = {
    urgent: { color: 'bg-red-100 text-red-800 border-red-200', label: 'Urgent' },
    high: { color: 'bg-orange-100 text-orange-800 border-orange-200', label: 'High' },
    medium: { color: 'bg-yellow-100 text-yellow-800 border-yellow-200', label: 'Medium' },
    low: { color: 'bg-green-100 text-green-800 border-green-200', label: 'Low' }
  };
  const c = config[priority] || config.medium;
  return <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium border ${c.color}`}>{c.label}</span>;
}

/** Column icon and color config */
const columnConfig: Record<string, { icon: typeof AlertCircle; color: string; bgColor: string }> = {
  open: { icon: AlertCircle, color: 'text-blue-600', bgColor: 'bg-blue-50' },
  in_progress: { icon: Clock, color: 'text-amber-600', bgColor: 'bg-amber-50' },
  resolved: { icon: CheckCircle2, color: 'text-green-600', bgColor: 'bg-green-50' },
  closed: { icon: Archive, color: 'text-gray-600', bgColor: 'bg-gray-50' }
};

interface IssuesKanbanClientProps {
  userId: string;
  userName: string;
  institutionId: string;
  categories: { id: string; name: string }[];
  lcMembers: { id: string; full_name: string; email: string; avatar_url: string | null }[];
}

export function IssuesKanbanClient({
  userId,
  userName,
  institutionId,
  categories,
  lcMembers
}: IssuesKanbanClientProps) {
  const { data: kanban, isLoading: kanbanLoading } = useKanbanBoard(institutionId);
  const { data: stats } = useIssueStats(institutionId);

  const createIssue = useCreateLCIssue();
  const updateStatus = useUpdateIssueStatus();
  const assignIssue = useAssignIssue();

  // Create dialog state
  const [createOpen, setCreateOpen] = useState(false);
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [priority, setPriority] = useState('medium');

  // Filter state
  const [filterAssignee, setFilterAssignee] = useState<string>('all');
  const [filterPriority, setFilterPriority] = useState<string>('all');

  // Assign dialog state
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignIssueId, setAssignIssueId] = useState('');
  const [assigneeId, setAssigneeId] = useState('');

  // Detail view state
  const [detailTicket, setDetailTicket] = useState<GrievanceTicket | null>(null);

  const handleCreate = () => {
    if (!subject || !description || !category) return;
    createIssue.mutate(
      {
        data: {
          institution_id: institutionId,
          subject,
          description,
          category,
          priority
        },
        userId
      },
      {
        onSuccess: () => {
          setCreateOpen(false);
          setSubject('');
          setDescription('');
          setCategory('');
          setPriority('medium');
        }
      }
    );
  };

  const handleStatusChange = (issueId: string, newStatus: string) => {
    updateStatus.mutate({
      issueId,
      status: newStatus,
      institutionId
    });
  };

  const handleAssign = () => {
    if (!assignIssueId || !assigneeId) return;
    assignIssue.mutate(
      { issueId: assignIssueId, assigneeId },
      {
        onSuccess: () => {
          setAssignOpen(false);
          setAssignIssueId('');
          setAssigneeId('');
        }
      }
    );
  };

  // Filter the kanban columns
  const filteredColumns = kanban?.columns.map(col => ({
    ...col,
    items: col.items.filter(item => {
      if (filterAssignee !== 'all' && item.assigned_to !== filterAssignee) return false;
      if (filterPriority !== 'all' && item.priority !== filterPriority) return false;
      return true;
    })
  })) || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Kanban className="h-6 w-6 text-primary" />
            Issue Management
          </h1>
          <p className="text-muted-foreground mt-1">
            Track and manage learner issues through the Kanban board
          </p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Report Issue
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Report New Issue</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>Subject</Label>
                <Input
                  placeholder="Brief description of the issue..."
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea
                  placeholder="Detailed description of the issue, including any relevant context..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={4}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Category</Label>
                  <Select value={category} onValueChange={setCategory}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select category..." />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.map(c => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                      {categories.length === 0 && (
                        <SelectItem value="general" disabled>No categories available</SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Priority</Label>
                  <Select value={priority} onValueChange={setPriority}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="urgent">Urgent</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline">Cancel</Button>
              </DialogClose>
              <Button
                onClick={handleCreate}
                disabled={!subject || !description || !category || createIssue.isPending}
              >
                {createIssue.isPending ? 'Creating...' : 'Create Issue'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats Summary */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Card>
            <CardContent className="p-3">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded bg-blue-50">
                  <AlertCircle className="h-4 w-4 text-blue-600" />
                </div>
                <div>
                  <p className="text-xl font-bold">{stats.open}</p>
                  <p className="text-xs text-muted-foreground">Open</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded bg-amber-50">
                  <Clock className="h-4 w-4 text-amber-600" />
                </div>
                <div>
                  <p className="text-xl font-bold">{stats.in_progress}</p>
                  <p className="text-xs text-muted-foreground">In Progress</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded bg-green-50">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                </div>
                <div>
                  <p className="text-xl font-bold">{stats.resolved}</p>
                  <p className="text-xs text-muted-foreground">Resolved</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded bg-gray-50">
                  <Archive className="h-4 w-4 text-gray-600" />
                </div>
                <div>
                  <p className="text-xl font-bold">{stats.closed}</p>
                  <p className="text-xs text-muted-foreground">Closed</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded bg-emerald-50">
                  <TrendingUp className="h-4 w-4 text-emerald-600" />
                </div>
                <div>
                  <p className="text-xl font-bold">{stats.resolved_this_month}</p>
                  <p className="text-xs text-muted-foreground">Resolved (Month)</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-3">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <Select value={filterAssignee} onValueChange={setFilterAssignee}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Filter by assignee..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Assignees</SelectItem>
            <SelectItem value={userId}>Assigned to Me</SelectItem>
            {lcMembers.map(m => (
              <SelectItem key={m.id} value={m.id}>{m.full_name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterPriority} onValueChange={setFilterPriority}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Filter by priority..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Priorities</SelectItem>
            <SelectItem value="urgent">Urgent</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="low">Low</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Kanban Board */}
      {kanbanLoading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {filteredColumns.map(col => {
            const config = columnConfig[col.id] || columnConfig.open;
            const Icon = config.icon;

            // Determine next status for quick-move
            const nextStatus: Record<string, string> = {
              open: 'in_progress',
              in_progress: 'resolved',
              resolved: 'closed'
            };

            return (
              <div key={col.id} className="space-y-3">
                {/* Column Header */}
                <div className={`flex items-center justify-between p-3 rounded-lg ${config.bgColor}`}>
                  <div className="flex items-center gap-2">
                    <Icon className={`h-4 w-4 ${config.color}`} />
                    <span className="font-medium text-sm">{col.title}</span>
                  </div>
                  <Badge variant="secondary" className="text-xs">
                    {col.items.length}
                  </Badge>
                </div>

                {/* Cards */}
                <div className="space-y-2 min-h-[100px]">
                  {col.items.length === 0 ? (
                    <div className="text-center py-6 text-sm text-muted-foreground border-2 border-dashed rounded-lg">
                      No issues
                    </div>
                  ) : (
                    col.items.map((ticket: GrievanceTicket) => (
                      <Card
                        key={ticket.id}
                        className="hover:shadow-sm transition-shadow cursor-pointer"
                        onClick={() => setDetailTicket(ticket)}
                      >
                        <CardContent className="p-3 space-y-2">
                          {/* Subject + Priority */}
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-sm font-medium leading-tight line-clamp-2">
                              {ticket.subject}
                            </p>
                            {getPriorityBadge(ticket.priority)}
                          </div>

                          {/* Category */}
                          {(ticket as any).category?.name && (
                            <Badge variant="outline" className="text-xs">
                              {(ticket as any).category.name}
                            </Badge>
                          )}

                          {/* Assignee + Date */}
                          <div className="flex items-center justify-between pt-1">
                            {(ticket as any).assignee ? (
                              <div className="flex items-center gap-1.5">
                                <Avatar className="h-5 w-5">
                                  <AvatarImage src={(ticket as any).assignee.avatar_url || ''} />
                                  <AvatarFallback className="text-[10px]">
                                    {((ticket as any).assignee.full_name || 'U').charAt(0)}
                                  </AvatarFallback>
                                </Avatar>
                                <span className="text-xs text-muted-foreground truncate max-w-[80px]">
                                  {(ticket as any).assignee.full_name}
                                </span>
                              </div>
                            ) : (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 text-xs px-2"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setAssignIssueId(ticket.id);
                                  setAssignOpen(true);
                                }}
                              >
                                <UserPlus className="h-3 w-3 mr-1" />
                                Assign
                              </Button>
                            )}
                            <span className="text-xs text-muted-foreground">
                              {new Date(ticket.created_at).toLocaleDateString()}
                            </span>
                          </div>

                          {/* Quick move button */}
                          {nextStatus[col.id] && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="w-full h-7 text-xs mt-1"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleStatusChange(ticket.id, nextStatus[col.id]);
                              }}
                              disabled={updateStatus.isPending}
                            >
                              Move to {
                                nextStatus[col.id] === 'in_progress' ? 'In Progress' :
                                nextStatus[col.id] === 'resolved' ? 'Resolved' :
                                'Closed'
                              }
                              <ArrowRight className="h-3 w-3 ml-1" />
                            </Button>
                          )}
                        </CardContent>
                      </Card>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Assign Dialog */}
      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign Issue</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Assign to LC Member</Label>
              <Select value={assigneeId} onValueChange={setAssigneeId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select member..." />
                </SelectTrigger>
                <SelectContent>
                  {lcMembers.map(m => (
                    <SelectItem key={m.id} value={m.id}>
                      <div className="flex items-center gap-2">
                        <Avatar className="h-5 w-5">
                          <AvatarImage src={m.avatar_url || ''} />
                          <AvatarFallback className="text-[10px]">
                            {m.full_name.charAt(0)}
                          </AvatarFallback>
                        </Avatar>
                        {m.full_name}
                      </div>
                    </SelectItem>
                  ))}
                  {lcMembers.length === 0 && (
                    <SelectItem value="none" disabled>No active LC members</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button
              onClick={handleAssign}
              disabled={!assigneeId || assignIssue.isPending}
            >
              {assignIssue.isPending ? 'Assigning...' : 'Assign'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail Dialog */}
      <Dialog open={!!detailTicket} onOpenChange={(open) => !open && setDetailTicket(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{detailTicket?.subject}</DialogTitle>
          </DialogHeader>
          {detailTicket && (
            <div className="space-y-4 py-2">
              <div className="flex items-center gap-2 flex-wrap">
                {getPriorityBadge(detailTicket.priority)}
                <Badge variant="outline">
                  {detailTicket.status.replace(/_/g, ' ')}
                </Badge>
                {(detailTicket as any).category?.name && (
                  <Badge variant="secondary">
                    {(detailTicket as any).category.name}
                  </Badge>
                )}
              </div>

              <div>
                <Label className="text-xs text-muted-foreground">Description</Label>
                <p className="text-sm mt-1">{detailTicket.description}</p>
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <Label className="text-xs text-muted-foreground">Raised By</Label>
                  <p>{detailTicket.raised_by_name}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Created</Label>
                  <p>{new Date(detailTicket.created_at).toLocaleString()}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Assigned To</Label>
                  <p>{(detailTicket as any).assignee?.full_name || 'Unassigned'}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">SLA Status</Label>
                  <p>{detailTicket.sla_status?.replace(/_/g, ' ') || 'N/A'}</p>
                </div>
              </div>

              {detailTicket.resolution && (
                <div>
                  <Label className="text-xs text-muted-foreground">Resolution</Label>
                  <p className="text-sm mt-1">{detailTicket.resolution}</p>
                </div>
              )}

              <div className="flex gap-2 pt-2 border-t">
                {detailTicket.status === 'open' && (
                  <Button
                    size="sm"
                    onClick={() => {
                      handleStatusChange(detailTicket.id, 'in_progress');
                      setDetailTicket(null);
                    }}
                  >
                    Start Working
                  </Button>
                )}
                {detailTicket.status === 'in_progress' && (
                  <Button
                    size="sm"
                    className="bg-green-600 hover:bg-green-700"
                    onClick={() => {
                      handleStatusChange(detailTicket.id, 'resolved');
                      setDetailTicket(null);
                    }}
                  >
                    Mark Resolved
                  </Button>
                )}
                {detailTicket.status === 'resolved' && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      handleStatusChange(detailTicket.id, 'closed');
                      setDetailTicket(null);
                    }}
                  >
                    Close Issue
                  </Button>
                )}
                {!detailTicket.assigned_to && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setAssignIssueId(detailTicket.id);
                      setAssignOpen(true);
                      setDetailTicket(null);
                    }}
                  >
                    <UserPlus className="h-3.5 w-3.5 mr-1" />
                    Assign
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
