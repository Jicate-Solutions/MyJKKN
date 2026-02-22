'use client';

import { useState } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { Plus, Edit2, Trash2, Zap, ArrowLeft, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useQuickReplies, useQuickReplyMutations } from '@/hooks/admission/use-quick-replies';
import { useWASettings, useUpdateWASettings } from '@/hooks/admission/use-wa-settings';
import { useAuth } from '@/hooks/use-auth';

function QuickReplyManager() {
  const { quickReplies, isLoading } = useQuickReplies();
  const { create, update, remove, isCreating, isUpdating, isDeleting } =
    useQuickReplyMutations();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    title: '',
    content: '',
    shortcut: '',
    category: 'general',
  });

  const openCreateDialog = () => {
    setEditingId(null);
    setFormData({ title: '', content: '', shortcut: '', category: 'general' });
    setDialogOpen(true);
  };

  const openEditDialog = (qr: typeof quickReplies[0]) => {
    setEditingId(qr.id);
    setFormData({
      title: qr.title,
      content: qr.content,
      shortcut: qr.shortcut || '',
      category: qr.category || 'general',
    });
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    if (editingId) {
      update.mutate({ id: editingId, ...formData }, { onSuccess: () => setDialogOpen(false) });
    } else {
      create.mutate(formData, { onSuccess: () => setDialogOpen(false) });
    }
  };

  const handleDelete = (id: string) => {
    if (confirm('Are you sure you want to delete this quick reply?')) {
      remove.mutate(id);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5" />
              Quick Replies
            </CardTitle>
            <CardDescription>
              Predefined responses counselors can send with a single click. Type / in chat to use.
            </CardDescription>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" onClick={openCreateDialog}>
                <Plus className="h-4 w-4 mr-1" />
                Add Quick Reply
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>
                  {editingId ? 'Edit Quick Reply' : 'New Quick Reply'}
                </DialogTitle>
                <DialogDescription>
                  Create a canned response that counselors can use in chat conversations.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-2">
                <div className="space-y-2">
                  <Label>Title</Label>
                  <Input
                    placeholder="e.g., Fee Structure"
                    value={formData.title}
                    onChange={(e) =>
                      setFormData({ ...formData, title: e.target.value })
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label>Shortcut</Label>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">/</span>
                    <Input
                      placeholder="fee"
                      value={formData.shortcut}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          shortcut: e.target.value.replace(/\s/g, ''),
                        })
                      }
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Type /{formData.shortcut || 'shortcut'} in chat to quickly insert this reply
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Category</Label>
                  <Select
                    value={formData.category}
                    onValueChange={(val) =>
                      setFormData({ ...formData, category: val })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="greeting">Greeting</SelectItem>
                      <SelectItem value="fee">Fee Related</SelectItem>
                      <SelectItem value="program">Program Info</SelectItem>
                      <SelectItem value="general">General</SelectItem>
                      <SelectItem value="closing">Closing</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Message Content</Label>
                  <Textarea
                    placeholder="Type the message content..."
                    value={formData.content}
                    onChange={(e) =>
                      setFormData({ ...formData, content: e.target.value })
                    }
                    rows={5}
                  />
                </div>
              </div>

              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleSubmit}
                  disabled={
                    !formData.title || !formData.content || isCreating || isUpdating
                  }
                >
                  {isCreating || isUpdating
                    ? 'Saving...'
                    : editingId
                    ? 'Update'
                    : 'Create'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading quick replies...</p>
        ) : quickReplies.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Zap className="h-8 w-8 mx-auto mb-2 opacity-20" />
            <p className="text-sm">No quick replies yet</p>
            <p className="text-xs mt-1">Add your first quick reply to speed up conversations</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Shortcut</TableHead>
                <TableHead>Category</TableHead>
                <TableHead className="text-right">Uses</TableHead>
                <TableHead className="w-[100px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {quickReplies.map((qr) => (
                <TableRow key={qr.id}>
                  <TableCell>
                    <div>
                      <span className="font-medium text-sm">{qr.title}</span>
                      <p className="text-xs text-muted-foreground truncate max-w-xs mt-0.5">
                        {qr.content}
                      </p>
                    </div>
                  </TableCell>
                  <TableCell>
                    {qr.shortcut && (
                      <Badge variant="outline" className="text-xs font-mono">
                        /{qr.shortcut}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="text-xs">
                      {qr.category || 'general'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right text-sm">{qr.usage_count}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => openEditDialog(qr)}
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-red-500 hover:text-red-700"
                        onClick={() => handleDelete(qr.id)}
                        disabled={isDeleting}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function AutoAssignmentSettings() {
  const { profile } = useAuth();
  const institutionId = profile?.institution_id;
  const { settings, isLoading } = useWASettings(institutionId);
  const updateSettings = useUpdateWASettings(institutionId);

  const handleToggle = (field: 'auto_assign_round_robin' | 'auto_assign_by_program' | 'auto_assign_by_source', checked: boolean) => {
    updateSettings.mutate({ [field]: checked });
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Auto-Assignment Rules</CardTitle>
            <CardDescription>
              Automatically assign incoming conversations to counselors.
            </CardDescription>
          </div>
          {updateSettings.isPending && (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          )}
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full" />)}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 border rounded-lg">
              <div>
                <p className="text-sm font-medium">Round Robin</p>
                <p className="text-xs text-muted-foreground">
                  Distribute conversations evenly among available counselors
                </p>
              </div>
              <Switch
                checked={settings?.auto_assign_round_robin ?? false}
                onCheckedChange={(checked) => handleToggle('auto_assign_round_robin', checked)}
                disabled={updateSettings.isPending}
              />
            </div>
            {settings?.auto_assign_round_robin && (
              <div className="ml-4 p-3 bg-muted/50 rounded-lg">
                <p className="text-xs text-muted-foreground">
                  New conversations will be assigned to the counselor with the fewest active conversations.
                </p>
              </div>
            )}

            <div className="flex items-center justify-between p-3 border rounded-lg">
              <div>
                <p className="text-sm font-medium">By Program</p>
                <p className="text-xs text-muted-foreground">
                  Route to counselors based on program interest
                </p>
              </div>
              <Switch
                checked={settings?.auto_assign_by_program ?? false}
                onCheckedChange={(checked) => handleToggle('auto_assign_by_program', checked)}
                disabled={updateSettings.isPending}
              />
            </div>
            {settings?.auto_assign_by_program && (
              <div className="ml-4 p-3 bg-muted/50 rounded-lg">
                <p className="text-xs text-muted-foreground mb-2">
                  Configure program-to-counselor mappings in the routing service.
                  Conversations will be routed based on the lead&apos;s program interest field.
                </p>
                <Badge variant="secondary" className="text-xs">
                  {Object.keys(settings.program_assignments || {}).length} programs mapped
                </Badge>
              </div>
            )}

            <div className="flex items-center justify-between p-3 border rounded-lg">
              <div>
                <p className="text-sm font-medium">By Source</p>
                <p className="text-xs text-muted-foreground">
                  Route based on lead source (website, referral, etc.)
                </p>
              </div>
              <Switch
                checked={settings?.auto_assign_by_source ?? false}
                onCheckedChange={(checked) => handleToggle('auto_assign_by_source', checked)}
                disabled={updateSettings.isPending}
              />
            </div>
            {settings?.auto_assign_by_source && (
              <div className="ml-4 p-3 bg-muted/50 rounded-lg">
                <p className="text-xs text-muted-foreground mb-2">
                  Configure source-to-counselor mappings in the routing service.
                  Conversations will be routed based on how the lead found your institution.
                </p>
                <Badge variant="secondary" className="text-xs">
                  {Object.keys(settings.source_assignments || {}).length} sources mapped
                </Badge>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ChatSettingsContent() {
  return (
    <PermissionGuard module="admission" action="manage">
      <ContentLayout title="Chat Settings">
        <div className="space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem>
                  <BreadcrumbLink href="/">Dashboard</BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbLink href="/admission/dashboard">Admission</BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbLink href="/admission/chat">Chat</BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbPage>Settings</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>

            <Button variant="outline" size="sm" asChild>
              <Link href="/admission/chat">
                <ArrowLeft className="h-4 w-4 mr-1" />
                Back to Chat
              </Link>
            </Button>
          </div>

          {/* Quick Replies */}
          <QuickReplyManager />

          {/* Business Hours (placeholder for future config) */}
          <Card>
            <CardHeader>
              <CardTitle>Business Hours</CardTitle>
              <CardDescription>
                Configure when counselors are available for live chat.
                Outside business hours, the auto-reply message will be sent.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 max-w-md">
                <div className="space-y-2">
                  <Label>Start Time</Label>
                  <Input type="time" defaultValue="09:00" />
                </div>
                <div className="space-y-2">
                  <Label>End Time</Label>
                  <Input type="time" defaultValue="18:00" />
                </div>
              </div>
              <div className="mt-4 space-y-2">
                <Label>Away Message</Label>
                <Textarea
                  placeholder="Thank you for reaching out! Our team is currently unavailable. We'll respond during business hours (9 AM - 6 PM IST)."
                  rows={3}
                />
                <p className="text-xs text-muted-foreground">
                  Sent automatically when a prospect messages outside business hours.
                </p>
              </div>
              <Button className="mt-4" size="sm">
                Save Settings
              </Button>
            </CardContent>
          </Card>

          {/* Auto-Assignment */}
          <AutoAssignmentSettings />
        </div>
      </ContentLayout>
    </PermissionGuard>
  );
}

export default function ChatSettingsPage() {
  return <ChatSettingsContent />;
}
