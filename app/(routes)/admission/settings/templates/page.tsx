'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { useUserInstitutionAccess } from '@/hooks/use-user-institution-access';
import {
  useCommunicationTemplates,
  useTemplateMutations,
  useTemplateStats,
  useTemplateVariables
} from '@/hooks/admission';
import type { TemplateChannel, CreateTemplateInput } from '@/lib/services/admission/communication-templates-service';
import {
  MessageSquare,
  Search,
  Filter,
  Plus,
  MoreHorizontal,
  Eye,
  Edit,
  Copy,
  Trash2,
  RefreshCw,
  X,
  Mail,
  Phone,
  MessageCircle,
  Loader2,
  Power,
  PowerOff,
  FileText,
  Variable,
  Smile,
  Upload,
  Link2,
  Image as ImageIcon,
  Film,
  FileText as DocIcon,
  X as XIcon
} from 'lucide-react';

// Dynamic import prevents SSR crash — emoji-mart accesses window during init
const EmojiPicker = dynamic(() => import('@emoji-mart/react'), { ssr: false });
// eslint-disable-next-line @typescript-eslint/no-require-imports
const emojiData = require('@emoji-mart/data');
import { toast } from 'sonner';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog';
import { AdmissionErrorBoundary } from '@/components/admission';

const TEMPLATE_TYPES: { value: TemplateChannel; label: string; icon: React.ElementType }[] = [
  { value: 'email', label: 'Email', icon: Mail },
  { value: 'sms', label: 'SMS', icon: Phone },
  { value: 'whatsapp', label: 'WhatsApp', icon: MessageCircle }
];

function getTypeIcon(type: TemplateChannel | null) {
  const templateType = TEMPLATE_TYPES.find((t) => t.value === type);
  const Icon = templateType?.icon || MessageSquare;
  return <Icon className="h-4 w-4" />;
}

function TemplatesSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex gap-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-10 w-40" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-4 w-24" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-16 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function AdmissionTemplatesPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { selectedInstitutionId, loading: accessLoading } = useUserInstitutionAccess();

  const [searchTerm, setSearchTerm] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [editingTemplate, setEditingTemplate] = useState<string | null>(null);
  const [previewTemplateId, setPreviewTemplateId] = useState<string | null>(null);
  const [isEmojiOpen, setIsEmojiOpen] = useState(false);
  const [isEditEmojiOpen, setIsEditEmojiOpen] = useState(false);
  const [mediaInputMode, setMediaInputMode] = useState<'url' | 'upload'>('url');
  const [isUploadingMedia, setIsUploadingMedia] = useState(false);
  const contentRef = useRef<HTMLTextAreaElement>(null);
  const editContentRef = useRef<HTMLTextAreaElement>(null);

  // Form state
  const [formData, setFormData] = useState<Partial<CreateTemplateInput>>({
    name: '',
    channel: 'email',
    subject: '',
    content: '',
    is_active: true
  });

  const typeFilter = searchParams.get('type') as TemplateChannel | null;

  const filters = {
    institutionId: selectedInstitutionId || '',
    channel: typeFilter || undefined,
    isActive: undefined, // Show all (active and inactive)
    search: searchTerm || undefined
  };

  const {
    templates,
    total,
    isLoading: templatesLoading,
    refetch
  } = useCommunicationTemplates(filters);

  const { stats, isLoading: statsLoading } = useTemplateStats(selectedInstitutionId);
  const { leadVariables } = useTemplateVariables();

  const {
    createTemplate,
    updateTemplate,
    deleteTemplate,
    toggleStatus,
    duplicateTemplate,
    isCreating,
    isUpdating,
    isDeleting,
    isToggling,
    isDuplicating
  } = useTemplateMutations();

  const isLoading = accessLoading || templatesLoading;

  const updateParams = useCallback(
    (key: string, value: string | undefined) => {
      const params = new URLSearchParams(searchParams);
      if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
      router.push(`/admission/settings/templates?${params.toString()}`);
    },
    [router, searchParams]
  );

  const clearFilters = useCallback(() => {
    router.push('/admission/settings/templates');
    setSearchTerm('');
  }, [router]);

  const activeFilterCount = [typeFilter].filter(Boolean).length;

  const resetForm = () => {
    setFormData({
      name: '',
      channel: 'email',
      subject: '',
      content: '',
      is_active: true,
      attachment_type: null,
      attachment_url: null,
    });
    setMediaInputMode('url');
  };

  const insertEmoji = (
    emoji: { native: string },
    ref: React.RefObject<HTMLTextAreaElement | null>,
    closeEmojiState: () => void
  ) => {
    const textarea = ref.current;
    if (!textarea) return;
    const start = textarea.selectionStart ?? (formData.content || '').length;
    const end = textarea.selectionEnd ?? start;
    const current = formData.content || '';
    const updated = current.substring(0, start) + emoji.native + current.substring(end);
    setFormData({ ...formData, content: updated });
    closeEmojiState();
    setTimeout(() => {
      textarea.selectionStart = start + emoji.native.length;
      textarea.selectionEnd = start + emoji.native.length;
      textarea.focus();
    }, 0);
  };

  const handleMediaUpload = async (file: File) => {
    if (!selectedInstitutionId) {
      toast.error('No institution selected');
      return;
    }
    setIsUploadingMedia(true);
    try {
      const supabase = createClientSupabaseClient();
      const ext = file.name.split('.').pop();
      const path = `${selectedInstitutionId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from('admission-template-media')
        .upload(path, file, { upsert: false });
      if (uploadError) throw uploadError;
      const { data: urlData } = supabase.storage
        .from('admission-template-media')
        .getPublicUrl(path);
      setFormData((prev) => ({ ...prev, attachment_url: urlData.publicUrl }));
      toast.success('Media uploaded successfully');
    } catch (err) {
      console.error('[admission/templates] Media upload failed:', err);
      toast.error('Failed to upload media');
    } finally {
      setIsUploadingMedia(false);
    }
  };

  const handleCreateTemplate = async () => {
    if (!selectedInstitutionId) {
      toast.error('No institution selected');
      return;
    }

    try {
      await createTemplate.mutateAsync({
        institution_id: selectedInstitutionId,
        name: formData.name || '',
        channel: formData.channel || 'email',
        subject: formData.subject,
        content: formData.content || '',
        is_active: formData.is_active ?? true,
        attachment_type: formData.attachment_type ?? null,
        attachment_url: formData.attachment_url ?? null,
      });
      setIsCreateDialogOpen(false);
      resetForm();
    } catch {
      // Error handled by mutation
    }
  };

  const handleDeleteTemplate = async () => {
    if (!deleteConfirmId || !selectedInstitutionId) return;
    try {
      await deleteTemplate.mutateAsync({ id: deleteConfirmId, institutionId: selectedInstitutionId });
      setDeleteConfirmId(null);
    } catch {
      // Error handled by mutation
    }
  };

  const handleDuplicate = async (id: string) => {
    try {
      await duplicateTemplate.mutateAsync(id);
    } catch {
      // Error handled by mutation
    }
  };

  const handleToggleStatus = async (id: string, currentStatus: boolean) => {
    try {
      await toggleStatus.mutateAsync({ id, isActive: !currentStatus });
    } catch {
      // Error handled by mutation
    }
  };

  const handleUpdateTemplate = async () => {
    if (!editingTemplate) return;
    try {
      await updateTemplate.mutateAsync({
        id: editingTemplate,
        input: {
          name: formData.name,
          channel: formData.channel,
          subject: formData.subject || null,
          content: formData.content,
          is_active: formData.is_active ?? true,
          attachment_type: formData.attachment_type ?? null,
          attachment_url: formData.attachment_url ?? null,
        }
      });
      setEditingTemplate(null);
      resetForm();
    } catch {
      // Error handled by mutation
    }
  };

  if (isLoading) {
    return (
      <PermissionGuard module="admission" action="view">
        <ContentLayout title="Communication Templates">
          <TemplatesSkeleton />
        </ContentLayout>
      </PermissionGuard>
    );
  }

  return (
    <PermissionGuard module="admission" action="view">
      <ContentLayout title="Communication Templates">
        <div className="space-y-6">
          {/* Breadcrumb */}
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
                  <BreadcrumbPage>Templates</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>

            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={isRefreshing}
                onClick={async () => {
                  setIsRefreshing(true);
                  try {
                    await refetch();
                    toast.success('Templates refreshed');
                  } finally {
                    setIsRefreshing(false);
                  }
                }}
              >
                {isRefreshing ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-2" />
                )}
                Refresh
              </Button>

              <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
                <DialogTrigger asChild>
                  <Button onClick={() => resetForm()}>
                    <Plus className="h-4 w-4 mr-2" />
                    New Template
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Create Communication Template</DialogTitle>
                    <DialogDescription>
                      Create a reusable template for WhatsApp, SMS, or Email messages.
                    </DialogDescription>
                  </DialogHeader>

                  <div className="space-y-4 py-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="name">Template Name *</Label>
                        <Input
                          id="name"
                          placeholder="e.g., Welcome Message"
                          value={formData.name}
                          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="type">Channel Type *</Label>
                        <Select
                          value={formData.channel}
                          onValueChange={(value) =>
                            setFormData({ ...formData, channel: value as TemplateChannel })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select channel" />
                          </SelectTrigger>
                          <SelectContent>
                            {TEMPLATE_TYPES.map((type) => (
                              <SelectItem key={type.value} value={type.value}>
                                <div className="flex items-center gap-2">
                                  <type.icon className="h-4 w-4" />
                                  {type.label}
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    {formData.channel === 'email' && (
                      <div className="space-y-2">
                        <Label htmlFor="subject">Email Subject *</Label>
                        <Input
                          id="subject"
                          placeholder="e.g., Welcome to {{institution_name}}"
                          value={formData.subject}
                          onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                        />
                      </div>
                    )}

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="content">Message Content *</Label>
                        <div className="flex items-center gap-2">
                          {formData.channel === 'sms' && formData.content && (
                            <span className="text-xs text-muted-foreground">
                              {formData.content.length}/160 characters
                            </span>
                          )}
                          <Popover open={isEmojiOpen} onOpenChange={setIsEmojiOpen}>
                            <PopoverTrigger asChild>
                              <Button variant="ghost" size="sm" type="button" className="h-7 px-2">
                                <Smile className="h-4 w-4 mr-1" />
                                Emoji
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0 border-0" align="end">
                              <EmojiPicker
                                data={emojiData}
                                onEmojiSelect={(emoji: { native: string }) =>
                                  insertEmoji(emoji, contentRef, () => setIsEmojiOpen(false))
                                }
                                theme="light"
                                previewPosition="none"
                                skinTonePosition="none"
                              />
                            </PopoverContent>
                          </Popover>
                        </div>
                      </div>
                      <Textarea
                        id="content"
                        ref={contentRef}
                        placeholder="Enter your message content. Use {{variable_name}} for dynamic values."
                        rows={6}
                        value={formData.content}
                        onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                      />
                    </div>

                    {/* WhatsApp Media Attachment — only shown for WhatsApp channel */}
                    {formData.channel === 'whatsapp' && (
                      <div className="space-y-3 p-3 border rounded-md bg-muted/30">
                        <Label className="flex items-center gap-2 text-sm font-medium">
                          <ImageIcon className="h-4 w-4" />
                          Media Attachment
                          <span className="text-xs font-normal text-muted-foreground">(Optional)</span>
                        </Label>

                        {/* Attachment type selector */}
                        <div className="flex gap-2 flex-wrap">
                          {([
                            { value: null, label: 'None' },
                            { value: 'image' as const, label: 'Image', icon: ImageIcon },
                            { value: 'video' as const, label: 'Video', icon: Film },
                            { value: 'document' as const, label: 'Document', icon: DocIcon },
                          ] as const).map((opt) => (
                            <Button
                              key={String(opt.value)}
                              type="button"
                              variant={formData.attachment_type === opt.value ? 'default' : 'outline'}
                              size="sm"
                              onClick={() =>
                                setFormData({ ...formData, attachment_type: opt.value, attachment_url: null })
                              }
                            >
                              {('icon' in opt && opt.icon) ? <opt.icon className="h-3 w-3 mr-1" /> : null}
                              {opt.label}
                            </Button>
                          ))}
                        </div>

                        {/* URL / Upload tabs */}
                        {formData.attachment_type && (
                          <div className="space-y-2">
                            <div className="flex gap-1 border-b">
                              <button
                                type="button"
                                className={`px-3 py-1.5 text-sm border-b-2 transition-colors ${
                                  mediaInputMode === 'url'
                                    ? 'border-primary text-primary font-medium'
                                    : 'border-transparent text-muted-foreground hover:text-foreground'
                                }`}
                                onClick={() => setMediaInputMode('url')}
                              >
                                <Link2 className="h-3 w-3 inline mr-1" />
                                Paste URL
                              </button>
                              <button
                                type="button"
                                className={`px-3 py-1.5 text-sm border-b-2 transition-colors ${
                                  mediaInputMode === 'upload'
                                    ? 'border-primary text-primary font-medium'
                                    : 'border-transparent text-muted-foreground hover:text-foreground'
                                }`}
                                onClick={() => setMediaInputMode('upload')}
                              >
                                <Upload className="h-3 w-3 inline mr-1" />
                                Upload File
                              </button>
                            </div>

                            {mediaInputMode === 'url' && (
                              <div className="flex gap-2">
                                <Input
                                  placeholder={
                                    formData.attachment_type === 'image'
                                      ? 'https://example.com/photo.jpg'
                                      : formData.attachment_type === 'video'
                                      ? 'https://example.com/video.mp4'
                                      : 'https://example.com/brochure.pdf'
                                  }
                                  value={formData.attachment_url || ''}
                                  onChange={(e) =>
                                    setFormData({ ...formData, attachment_url: e.target.value || null })
                                  }
                                />
                                {formData.attachment_url && (
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => setFormData({ ...formData, attachment_url: null })}
                                  >
                                    <XIcon className="h-4 w-4" />
                                  </Button>
                                )}
                              </div>
                            )}

                            {mediaInputMode === 'upload' && (
                              <div className="space-y-2">
                                <div className="flex items-center gap-2">
                                  <label className="cursor-pointer">
                                    <input
                                      type="file"
                                      className="hidden"
                                      accept={
                                        formData.attachment_type === 'image'
                                          ? 'image/jpeg,image/png,image/gif,image/webp'
                                          : formData.attachment_type === 'video'
                                          ? 'video/mp4,video/quicktime'
                                          : 'application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document'
                                      }
                                      onChange={(e) => {
                                        const file = e.target.files?.[0];
                                        if (file) handleMediaUpload(file);
                                      }}
                                      disabled={isUploadingMedia}
                                    />
                                    <Button type="button" variant="outline" size="sm" asChild disabled={isUploadingMedia}>
                                      <span>
                                        {isUploadingMedia ? (
                                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                        ) : (
                                          <Upload className="h-4 w-4 mr-2" />
                                        )}
                                        {isUploadingMedia ? 'Uploading…' : 'Choose File'}
                                      </span>
                                    </Button>
                                  </label>
                                  {formData.attachment_url && !isUploadingMedia && (
                                    <span className="text-xs text-green-600">✓ Uploaded</span>
                                  )}
                                </div>
                                {formData.attachment_url && (
                                  <p className="text-xs text-muted-foreground truncate max-w-sm">
                                    {formData.attachment_url}
                                  </p>
                                )}
                              </div>
                            )}

                            {formData.attachment_type === 'image' && formData.attachment_url && (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={formData.attachment_url}
                                alt="Attachment preview"
                                className="rounded border max-h-32 object-contain mt-1"
                                onError={(e) => {
                                  (e.currentTarget as HTMLImageElement).style.display = 'none';
                                }}
                              />
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    <div className="space-y-2">
                      <Label className="flex items-center gap-2">
                        <Variable className="h-4 w-4" />
                        Available Variables
                      </Label>
                      <div className="flex flex-wrap gap-2">
                        {leadVariables.slice(0, 6).map((variable) => (
                          <Badge
                            key={variable.name}
                            variant="outline"
                            className="cursor-pointer hover:bg-muted"
                            onClick={() =>
                              setFormData({
                                ...formData,
                                content: (formData.content || '') + `{{${variable.name}}}`
                              })
                            }
                          >
                            {`{{${variable.name}}}`}
                          </Badge>
                        ))}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Click to insert variable into content
                      </p>
                    </div>

                    <div className="flex items-center space-x-2">
                      <Switch
                        id="is_active"
                        checked={formData.is_active}
                        onCheckedChange={(checked) =>
                          setFormData({ ...formData, is_active: checked })
                        }
                      />
                      <Label htmlFor="is_active">Active (available for use)</Label>
                    </div>
                  </div>

                  <DialogFooter>
                    <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                      Cancel
                    </Button>
                    <Button onClick={handleCreateTemplate} disabled={isCreating}>
                      {isCreating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                      Create Template
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Total Templates
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.totalTemplates}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Active Templates
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">{stats.activeTemplates}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  By Channel
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex gap-2 text-sm">
                  <span className="flex items-center gap-1">
                    <Mail className="h-3 w-3" /> {stats.byType.email}
                  </span>
                  <span className="flex items-center gap-1">
                    <Phone className="h-3 w-3" /> {stats.byType.sms}
                  </span>
                  <span className="flex items-center gap-1">
                    <MessageCircle className="h-3 w-3" /> {stats.byType.whatsapp}
                  </span>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Quick Actions
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Button size="sm" variant="outline" onClick={() => setIsCreateDialogOpen(true)}>
                  <Plus className="h-3 w-3 mr-1" /> Add Template
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* Filters */}
          <Card>
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <Filter className="h-4 w-4" />
                  Filters
                  {activeFilterCount > 0 && (
                    <Badge variant="secondary">{activeFilterCount}</Badge>
                  )}
                </CardTitle>
                {activeFilterCount > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={isClearing}
                    onClick={() => {
                      setIsClearing(true);
                      clearFilters();
                      toast.success('Filters cleared');
                      setTimeout(() => setIsClearing(false), 300);
                    }}
                  >
                    {isClearing ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <X className="h-4 w-4 mr-2" />
                    )}
                    Clear All
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-4">
                <div className="flex gap-2 flex-1 min-w-[200px]">
                  <Input
                    placeholder="Search templates..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="max-w-sm"
                  />
                  <Button variant="outline" onClick={() => refetch()}>
                    <Search className="h-4 w-4" />
                  </Button>
                </div>

                <Select
                  value={typeFilter || '_all'}
                  onValueChange={(value) =>
                    updateParams('type', value === '_all' ? undefined : value)
                  }
                >
                  <SelectTrigger className="w-[150px]">
                    <SelectValue placeholder="All Types" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_all">All Types</SelectItem>
                    {TEMPLATE_TYPES.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        <div className="flex items-center gap-2">
                          <type.icon className="h-4 w-4" />
                          {type.label}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Results Summary */}
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>
              Showing {templates.length} of {total} templates
            </span>
          </div>

          {/* Templates Grid */}
          {templates.length === 0 ? (
            <Card>
              <CardContent className="py-16 text-center">
                <FileText className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                <h2 className="text-xl font-semibold mb-2">No Templates Found</h2>
                <p className="text-muted-foreground mb-4">
                  {total === 0
                    ? 'Get started by creating your first communication template.'
                    : 'Try adjusting your filters to find templates.'}
                </p>
                <Button onClick={() => setIsCreateDialogOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Template
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {templates.map((template) => (
                <Card
                  key={template.id}
                  className={`hover:shadow-md transition-shadow ${
                    !template.is_active ? 'opacity-60' : ''
                  }`}
                >
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        {getTypeIcon(template.channel)}
                        <CardTitle className="text-base">{template.name}</CardTitle>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => setPreviewTemplateId(template.id)}
                          >
                            <Eye className="h-4 w-4 mr-2" />
                            Preview
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => {
                              setEditingTemplate(template.id);
                              setFormData({
                                name: template.name,
                                channel: template.channel,
                                subject: template.subject || '',
                                content: template.content,
                                is_active: template.is_active,
                                attachment_type: template.attachment_type ?? null,
                                attachment_url: template.attachment_url ?? null,
                              });
                              setMediaInputMode('url');
                            }}
                          >
                            <Edit className="h-4 w-4 mr-2" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => handleDuplicate(template.id)}
                            disabled={isDuplicating}
                          >
                            <Copy className="h-4 w-4 mr-2" />
                            Duplicate
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => handleToggleStatus(template.id, template.is_active)}
                            disabled={isToggling}
                          >
                            {template.is_active ? (
                              <>
                                <PowerOff className="h-4 w-4 mr-2" />
                                Deactivate
                              </>
                            ) : (
                              <>
                                <Power className="h-4 w-4 mr-2" />
                                Activate
                              </>
                            )}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => setDeleteConfirmId(template.id)}
                            className="text-destructive"
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                    <div className="flex gap-2 mt-1">
                      <Badge variant="outline" className="text-xs">
                        {template.channel}
                      </Badge>
                      {template.category && (
                        <Badge variant="secondary" className="text-xs">
                          {template.category}
                        </Badge>
                      )}
                      {!template.is_active && (
                        <Badge variant="destructive" className="text-xs">
                          Inactive
                        </Badge>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground line-clamp-3">
                      {template.content || 'No content preview available'}
                    </p>
                    {template.subject && (
                      <p className="text-xs text-muted-foreground mt-2 truncate">
                        <strong>Subject:</strong> {template.subject}
                      </p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* Edit Template Dialog */}
        <Dialog
          open={editingTemplate !== null}
          onOpenChange={(open) => { if (!open) { setEditingTemplate(null); resetForm(); } }}
        >
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Edit Template</DialogTitle>
              <DialogDescription>Update the template content and settings.</DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-name">Template Name *</Label>
                  <Input
                    id="edit-name"
                    placeholder="e.g., Welcome Message"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-type">Channel Type *</Label>
                  <Select
                    value={formData.channel}
                    onValueChange={(value) =>
                      setFormData({ ...formData, channel: value as TemplateChannel })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select channel" />
                    </SelectTrigger>
                    <SelectContent>
                      {TEMPLATE_TYPES.map((type) => (
                        <SelectItem key={type.value} value={type.value}>
                          <div className="flex items-center gap-2">
                            <type.icon className="h-4 w-4" />
                            {type.label}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {formData.channel === 'email' && (
                <div className="space-y-2">
                  <Label htmlFor="edit-subject">Email Subject *</Label>
                  <Input
                    id="edit-subject"
                    placeholder="e.g., Welcome to {{institution_name}}"
                    value={formData.subject}
                    onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                  />
                </div>
              )}

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="edit-content">Message Content *</Label>
                  <div className="flex items-center gap-2">
                    {formData.channel === 'sms' && formData.content && (
                      <span className="text-xs text-muted-foreground">
                        {formData.content.length}/160 characters
                      </span>
                    )}
                    <Popover open={isEditEmojiOpen} onOpenChange={setIsEditEmojiOpen}>
                      <PopoverTrigger asChild>
                        <Button variant="ghost" size="sm" type="button" className="h-7 px-2">
                          <Smile className="h-4 w-4 mr-1" />
                          Emoji
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0 border-0" align="end">
                        <EmojiPicker
                          data={emojiData}
                          onEmojiSelect={(emoji: { native: string }) =>
                            insertEmoji(emoji, editContentRef, () => setIsEditEmojiOpen(false))
                          }
                          theme="light"
                          previewPosition="none"
                          skinTonePosition="none"
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>
                <Textarea
                  id="edit-content"
                  ref={editContentRef}
                  placeholder="Enter your message content. Use {{variable_name}} for dynamic values."
                  rows={6}
                  value={formData.content}
                  onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                />
              </div>

              {/* WhatsApp Media Attachment — only shown for WhatsApp channel */}
              {formData.channel === 'whatsapp' && (
                <div className="space-y-3 p-3 border rounded-md bg-muted/30">
                  <Label className="flex items-center gap-2 text-sm font-medium">
                    <ImageIcon className="h-4 w-4" />
                    Media Attachment
                    <span className="text-xs font-normal text-muted-foreground">(Optional)</span>
                  </Label>

                  {/* Attachment type selector */}
                  <div className="flex gap-2 flex-wrap">
                    {([
                      { value: null, label: 'None' },
                      { value: 'image' as const, label: 'Image', icon: ImageIcon },
                      { value: 'video' as const, label: 'Video', icon: Film },
                      { value: 'document' as const, label: 'Document', icon: DocIcon },
                    ] as const).map((opt) => (
                      <Button
                        key={String(opt.value)}
                        type="button"
                        variant={formData.attachment_type === opt.value ? 'default' : 'outline'}
                        size="sm"
                        onClick={() =>
                          setFormData({ ...formData, attachment_type: opt.value, attachment_url: null })
                        }
                      >
                        {('icon' in opt && opt.icon) ? <opt.icon className="h-3 w-3 mr-1" /> : null}
                        {opt.label}
                      </Button>
                    ))}
                  </div>

                  {/* URL / Upload tabs */}
                  {formData.attachment_type && (
                    <div className="space-y-2">
                      <div className="flex gap-1 border-b">
                        <button
                          type="button"
                          className={`px-3 py-1.5 text-sm border-b-2 transition-colors ${
                            mediaInputMode === 'url'
                              ? 'border-primary text-primary font-medium'
                              : 'border-transparent text-muted-foreground hover:text-foreground'
                          }`}
                          onClick={() => setMediaInputMode('url')}
                        >
                          <Link2 className="h-3 w-3 inline mr-1" />
                          Paste URL
                        </button>
                        <button
                          type="button"
                          className={`px-3 py-1.5 text-sm border-b-2 transition-colors ${
                            mediaInputMode === 'upload'
                              ? 'border-primary text-primary font-medium'
                              : 'border-transparent text-muted-foreground hover:text-foreground'
                          }`}
                          onClick={() => setMediaInputMode('upload')}
                        >
                          <Upload className="h-3 w-3 inline mr-1" />
                          Upload File
                        </button>
                      </div>

                      {mediaInputMode === 'url' && (
                        <div className="flex gap-2">
                          <Input
                            placeholder={
                              formData.attachment_type === 'image'
                                ? 'https://example.com/photo.jpg'
                                : formData.attachment_type === 'video'
                                ? 'https://example.com/video.mp4'
                                : 'https://example.com/brochure.pdf'
                            }
                            value={formData.attachment_url || ''}
                            onChange={(e) =>
                              setFormData({ ...formData, attachment_url: e.target.value || null })
                            }
                          />
                          {formData.attachment_url && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => setFormData({ ...formData, attachment_url: null })}
                            >
                              <XIcon className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      )}

                      {mediaInputMode === 'upload' && (
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <label className="cursor-pointer">
                              <input
                                type="file"
                                className="hidden"
                                accept={
                                  formData.attachment_type === 'image'
                                    ? 'image/jpeg,image/png,image/gif,image/webp'
                                    : formData.attachment_type === 'video'
                                    ? 'video/mp4,video/quicktime'
                                    : 'application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document'
                                }
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) handleMediaUpload(file);
                                }}
                                disabled={isUploadingMedia}
                              />
                              <Button type="button" variant="outline" size="sm" asChild disabled={isUploadingMedia}>
                                <span>
                                  {isUploadingMedia ? (
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                  ) : (
                                    <Upload className="h-4 w-4 mr-2" />
                                  )}
                                  {isUploadingMedia ? 'Uploading…' : 'Choose File'}
                                </span>
                              </Button>
                            </label>
                            {formData.attachment_url && !isUploadingMedia && (
                              <span className="text-xs text-green-600">✓ Uploaded</span>
                            )}
                          </div>
                          {formData.attachment_url && (
                            <p className="text-xs text-muted-foreground truncate max-w-sm">
                              {formData.attachment_url}
                            </p>
                          )}
                        </div>
                      )}

                      {formData.attachment_type === 'image' && formData.attachment_url && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={formData.attachment_url}
                          alt="Attachment preview"
                          className="rounded border max-h-32 object-contain mt-1"
                          onError={(e) => {
                            (e.currentTarget as HTMLImageElement).style.display = 'none';
                          }}
                        />
                      )}
                    </div>
                  )}
                </div>
              )}

              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Variable className="h-4 w-4" />
                  Available Variables
                </Label>
                <div className="flex flex-wrap gap-2">
                  {leadVariables.slice(0, 6).map((variable) => (
                    <Badge
                      key={variable.name}
                      variant="outline"
                      className="cursor-pointer hover:bg-muted"
                      onClick={() =>
                        setFormData({
                          ...formData,
                          content: (formData.content || '') + `{{${variable.name}}}`
                        })
                      }
                    >
                      {`{{${variable.name}}}`}
                    </Badge>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">Click to insert variable into content</p>
              </div>

              <div className="flex items-center space-x-2">
                <Switch
                  id="edit-is_active"
                  checked={formData.is_active}
                  onCheckedChange={(checked) =>
                    setFormData({ ...formData, is_active: checked })
                  }
                />
                <Label htmlFor="edit-is_active">Active (available for use)</Label>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => { setEditingTemplate(null); resetForm(); }}>
                Cancel
              </Button>
              <Button onClick={handleUpdateTemplate} disabled={isUpdating}>
                {isUpdating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Save Changes
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Preview Template Dialog */}
        {(() => {
          const previewTemplate = templates.find((t) => t.id === previewTemplateId) || null;
          return (
            <Dialog
              open={previewTemplateId !== null}
              onOpenChange={(open) => { if (!open) setPreviewTemplateId(null); }}
            >
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    {previewTemplate && getTypeIcon(previewTemplate.channel)}
                    {previewTemplate?.name || 'Preview'}
                  </DialogTitle>
                  <DialogDescription>
                    Template preview — variables shown as placeholders.
                  </DialogDescription>
                </DialogHeader>

                {previewTemplate && (
                  <div className="space-y-4 py-2">
                    <div className="flex gap-2">
                      <Badge variant="outline">{previewTemplate.channel}</Badge>
                      {previewTemplate.category && (
                        <Badge variant="secondary">{previewTemplate.category}</Badge>
                      )}
                      {!previewTemplate.is_active && (
                        <Badge variant="destructive">Inactive</Badge>
                      )}
                    </div>

                    {previewTemplate.subject && (
                      <div className="space-y-1">
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Subject</p>
                        <p className="text-sm border rounded-md px-3 py-2 bg-muted">{previewTemplate.subject}</p>
                      </div>
                    )}

                    <div className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Content</p>
                      <pre className="text-sm border rounded-md px-3 py-2 bg-muted whitespace-pre-wrap font-sans leading-relaxed">
                        {previewTemplate.content || 'No content'}
                      </pre>
                    </div>

                    {previewTemplate.variables && previewTemplate.variables.length > 0 && (
                      <div className="space-y-1">
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Variables used</p>
                        <div className="flex flex-wrap gap-1">
                          {previewTemplate.variables.map((v) => (
                            <Badge key={v.name} variant="outline" className="text-xs font-mono">
                              {`{{${v.name}}}`}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <DialogFooter>
                  <Button variant="outline" onClick={() => setPreviewTemplateId(null)}>Close</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          );
        })()}

        {/* Delete Confirmation Dialog */}
        <AlertDialog
          open={!!deleteConfirmId}
          onOpenChange={() => setDeleteConfirmId(null)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Template</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete this template? This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDeleteTemplate}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {isDeleting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </ContentLayout>
    </PermissionGuard>
  );
}

export default function AdmissionTemplatesPage() {
  return (
    <AdmissionErrorBoundary>
      <AdmissionTemplatesPageContent />
    </AdmissionErrorBoundary>
  );
}
