'use client';

/**
 * Announcements Client Component
 * Handles interactive announcement list, create form, and read tracking
 */

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Megaphone,
  Plus,
  Eye,
  Clock,
  Filter,
  AlertTriangle,
  Bell,
  Info,
  FileText
} from 'lucide-react';
import {
  useAnnouncements,
  useCreateAnnouncement,
  usePublishAnnouncement,
  useMarkAnnouncementRead
} from '@/hooks/learners-council/use-lc-communication';
import type {
  LCAnnouncement,
  AnnouncementScope,
  AnnouncementStatus,
  AnnouncementType,
  AnnouncementUrgency,
  CreateAnnouncementDto
} from '@/types/learners-council';

const urgencyConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; icon: typeof AlertTriangle }> = {
  urgent: { label: 'Urgent', variant: 'destructive', icon: AlertTriangle },
  high: { label: 'High', variant: 'destructive', icon: Bell },
  normal: { label: 'Normal', variant: 'secondary', icon: Info },
  low: { label: 'Low', variant: 'outline', icon: Info }
};

const scopeLabels: Record<string, string> = {
  lc_wide: 'LC Wide',
  institution: 'Institution',
  chapter: 'Chapter',
  vertical: 'Vertical'
};

const typeLabels: Record<string, string> = {
  general: 'General',
  event: 'Event',
  urgent: 'Urgent',
  circular: 'Circular'
};

interface AnnouncementsClientProps {
  initialAnnouncements: LCAnnouncement[];
  userId: string;
  canCreate: boolean;
}

export function AnnouncementsClient({
  initialAnnouncements,
  userId,
  canCreate
}: AnnouncementsClientProps) {
  const [scopeFilter, setScopeFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('published');
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [selectedAnnouncement, setSelectedAnnouncement] = useState<LCAnnouncement | null>(null);

  // Form state
  const [formTitle, setFormTitle] = useState('');
  const [formContent, setFormContent] = useState('');
  const [formType, setFormType] = useState<AnnouncementType>('general');
  const [formUrgency, setFormUrgency] = useState<AnnouncementUrgency>('normal');
  const [formScope, setFormScope] = useState<AnnouncementScope>('lc_wide');

  const filters = {
    scope: scopeFilter !== 'all' ? (scopeFilter as AnnouncementScope) : undefined,
    status: statusFilter !== 'all' ? (statusFilter as AnnouncementStatus) : undefined,
    page: 1,
    limit: 20
  };

  const { data: announcementsData, isLoading } = useAnnouncements(filters);
  const createMutation = useCreateAnnouncement();
  const publishMutation = usePublishAnnouncement();
  const markReadMutation = useMarkAnnouncementRead();

  const announcements = announcementsData?.data || initialAnnouncements;

  const handleCreate = () => {
    if (!formTitle.trim() || !formContent.trim()) return;

    const dto: CreateAnnouncementDto = {
      title: formTitle.trim(),
      content: formContent.trim(),
      type: formType,
      urgency: formUrgency,
      scope: formScope
    };

    createMutation.mutate(
      { data: dto, userId },
      {
        onSuccess: () => {
          setShowCreateDialog(false);
          setFormTitle('');
          setFormContent('');
          setFormType('general');
          setFormUrgency('normal');
          setFormScope('lc_wide');
        }
      }
    );
  };

  const handleView = (announcement: LCAnnouncement) => {
    setSelectedAnnouncement(announcement);
    markReadMutation.mutate({ announcementId: announcement.id, userId });
  };

  const handlePublish = (announcementId: string) => {
    publishMutation.mutate({ id: announcementId, reviewerId: userId });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Megaphone className="h-6 w-6 text-purple-600" />
            Announcements
          </h2>
          <p className="text-muted-foreground text-sm mt-1">
            Stay updated with the latest from the Learners Council
          </p>
        </div>
        {canCreate && (
          <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="h-4 w-4" />
                New Announcement
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Create Announcement</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div>
                  <label className="text-sm font-medium mb-1 block">Title</label>
                  <Input
                    placeholder="Announcement title..."
                    value={formTitle}
                    onChange={(e) => setFormTitle(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium mb-1 block">Content</label>
                  <Textarea
                    placeholder="Write your announcement..."
                    rows={5}
                    value={formContent}
                    onChange={(e) => setFormContent(e.target.value)}
                  />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="text-sm font-medium mb-1 block">Type</label>
                    <Select value={formType} onValueChange={(v) => setFormType(v as AnnouncementType)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="general">General</SelectItem>
                        <SelectItem value="event">Event</SelectItem>
                        <SelectItem value="urgent">Urgent</SelectItem>
                        <SelectItem value="circular">Circular</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-1 block">Urgency</label>
                    <Select value={formUrgency} onValueChange={(v) => setFormUrgency(v as AnnouncementUrgency)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="low">Low</SelectItem>
                        <SelectItem value="normal">Normal</SelectItem>
                        <SelectItem value="high">High</SelectItem>
                        <SelectItem value="urgent">Urgent</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-1 block">Scope</label>
                    <Select value={formScope} onValueChange={(v) => setFormScope(v as AnnouncementScope)}>
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
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={handleCreate}
                  disabled={createMutation.isPending || !formTitle.trim() || !formContent.trim()}
                >
                  {createMutation.isPending ? 'Creating...' : 'Create Draft'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <Select value={scopeFilter} onValueChange={setScopeFilter}>
          <SelectTrigger className="w-[140px]"><SelectValue placeholder="Scope" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Scopes</SelectItem>
            <SelectItem value="lc_wide">LC Wide</SelectItem>
            <SelectItem value="institution">Institution</SelectItem>
            <SelectItem value="chapter">Chapter</SelectItem>
            <SelectItem value="vertical">Vertical</SelectItem>
          </SelectContent>
        </Select>
        {canCreate && (
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[140px]"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="draft">Drafts</SelectItem>
              <SelectItem value="pending_review">Pending Review</SelectItem>
              <SelectItem value="published">Published</SelectItem>
              <SelectItem value="archived">Archived</SelectItem>
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Announcement List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      ) : announcements.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Megaphone className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No announcements found</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {announcements.map((announcement) => {
            const urgency = urgencyConfig[announcement.urgency] || urgencyConfig.normal;
            const UrgencyIcon = urgency.icon;

            return (
              <Card
                key={announcement.id}
                className="hover:shadow-md transition-shadow cursor-pointer"
                onClick={() => handleView(announcement)}
              >
                <CardContent className="p-5">
                  <div className="flex items-start gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-2">
                        <Badge variant={urgency.variant} className="gap-1">
                          <UrgencyIcon className="h-3 w-3" />
                          {urgency.label}
                        </Badge>
                        <Badge variant="outline">{scopeLabels[announcement.scope] || announcement.scope}</Badge>
                        <Badge variant="secondary">{typeLabels[announcement.type] || announcement.type}</Badge>
                        {announcement.status === 'draft' && (
                          <Badge variant="outline" className="text-yellow-600 border-yellow-300 bg-yellow-50">
                            Draft
                          </Badge>
                        )}
                      </div>
                      <h3 className="font-semibold text-lg mb-1 truncate">{announcement.title}</h3>
                      <p className="text-muted-foreground text-sm line-clamp-2">
                        {announcement.content}
                      </p>
                      <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <Avatar className="h-5 w-5">
                            <AvatarFallback className="text-[10px]">
                              {announcement.creator?.full_name?.charAt(0) || '?'}
                            </AvatarFallback>
                          </Avatar>
                          <span>{announcement.creator?.full_name || 'Unknown'}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          <span>
                            {new Date(announcement.published_at || announcement.created_at).toLocaleDateString('en-IN', {
                              day: 'numeric',
                              month: 'short',
                              year: 'numeric'
                            })}
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Eye className="h-3 w-3" />
                          <span>{announcement.read_count} reads</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Detail Dialog */}
      <Dialog
        open={!!selectedAnnouncement}
        onOpenChange={(open) => !open && setSelectedAnnouncement(null)}
      >
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          {selectedAnnouncement && (
            <>
              <DialogHeader>
                <div className="flex items-center gap-2 flex-wrap mb-2">
                  <Badge variant={urgencyConfig[selectedAnnouncement.urgency]?.variant || 'secondary'}>
                    {urgencyConfig[selectedAnnouncement.urgency]?.label || selectedAnnouncement.urgency}
                  </Badge>
                  <Badge variant="outline">
                    {scopeLabels[selectedAnnouncement.scope] || selectedAnnouncement.scope}
                  </Badge>
                </div>
                <DialogTitle className="text-xl">{selectedAnnouncement.title}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="flex items-center gap-3 text-sm text-muted-foreground">
                  <Avatar className="h-8 w-8">
                    <AvatarFallback>
                      {selectedAnnouncement.creator?.full_name?.charAt(0) || '?'}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-medium text-foreground">
                      {selectedAnnouncement.creator?.full_name || 'Unknown'}
                    </p>
                    <p>
                      {new Date(
                        selectedAnnouncement.published_at || selectedAnnouncement.created_at
                      ).toLocaleDateString('en-IN', {
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </p>
                  </div>
                </div>
                <div className="prose prose-sm max-w-none whitespace-pre-wrap border-t pt-4">
                  {selectedAnnouncement.content}
                </div>
                {selectedAnnouncement.attachments && selectedAnnouncement.attachments.length > 0 && (
                  <div className="border-t pt-4">
                    <p className="font-medium text-sm mb-2">Attachments</p>
                    <div className="space-y-1">
                      {selectedAnnouncement.attachments.map((att, idx) => (
                        <a
                          key={idx}
                          href={att.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 text-sm text-blue-600 hover:underline"
                        >
                          <FileText className="h-4 w-4" />
                          {att.name}
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              {canCreate && selectedAnnouncement.status === 'draft' && (
                <DialogFooter>
                  <Button
                    onClick={() => {
                      handlePublish(selectedAnnouncement.id);
                      setSelectedAnnouncement(null);
                    }}
                    disabled={publishMutation.isPending}
                  >
                    {publishMutation.isPending ? 'Publishing...' : 'Publish Now'}
                  </Button>
                </DialogFooter>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
