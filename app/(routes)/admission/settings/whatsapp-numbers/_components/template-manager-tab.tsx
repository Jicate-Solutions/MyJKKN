'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, Plus, Trash2, RefreshCw } from 'lucide-react';

// =============================================================================
// Types
// =============================================================================

interface MetaTemplate {
  id: string;
  name: string;
  category: string;
  status: string;
  language: string;
  components?: Array<{
    type: string;
    text?: string;
  }>;
}

// =============================================================================
// API functions
// =============================================================================

async function fetchTemplates(institutionId: string): Promise<MetaTemplate[]> {
  const res = await fetch(
    `/api/admission/settings/whatsapp-templates?institution_id=${institutionId}`
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to fetch templates');
  }
  const json = await res.json();
  return json.data || [];
}

async function createTemplate(data: {
  institution_id: string;
  name: string;
  category: string;
  language: string;
  body: string;
}): Promise<MetaTemplate> {
  const res = await fetch('/api/admission/settings/whatsapp-templates', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to create template');
  }
  const json = await res.json();
  return json.data;
}

async function deleteTemplate(data: {
  institution_id: string;
  template_name: string;
}): Promise<void> {
  const res = await fetch('/api/admission/settings/whatsapp-templates', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to delete template');
  }
}

// =============================================================================
// Status badge helper
// =============================================================================

function TemplatStatusBadge({ status }: { status: string }) {
  const config: Record<string, { className: string; label: string }> = {
    APPROVED: { className: 'bg-green-100 text-green-700 border-green-200', label: 'Approved' },
    PENDING: { className: 'bg-yellow-100 text-yellow-700 border-yellow-200', label: 'Pending' },
    REJECTED: { className: 'bg-red-100 text-red-700 border-red-200', label: 'Rejected' },
  };
  const c = config[status] || { className: 'bg-gray-100 text-gray-700 border-gray-200', label: status };
  return (
    <Badge variant="outline" className={c.className}>
      {c.label}
    </Badge>
  );
}

// =============================================================================
// Category badge helper
// =============================================================================

function CategoryBadge({ category }: { category: string }) {
  const config: Record<string, { className: string; label: string }> = {
    MARKETING: { className: 'bg-purple-100 text-purple-700', label: 'Marketing' },
    UTILITY: { className: 'bg-blue-100 text-blue-700', label: 'Utility' },
    AUTHENTICATION: { className: 'bg-orange-100 text-orange-700', label: 'Authentication' },
  };
  const c = config[category] || { className: 'bg-gray-100 text-gray-700', label: category };
  return (
    <Badge variant="secondary" className={c.className}>
      {c.label}
    </Badge>
  );
}

// =============================================================================
// Create Template Dialog
// =============================================================================

function CreateTemplateDialog({
  institutionId,
  onSuccess,
}: {
  institutionId: string;
  onSuccess: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [language, setLanguage] = useState('en_US');
  const [body, setBody] = useState('');

  const mutation = useMutation({
    mutationFn: () =>
      createTemplate({
        institution_id: institutionId,
        name,
        category,
        language,
        body,
      }),
    onSuccess: () => {
      toast.success('Template created and submitted for review');
      setOpen(false);
      resetForm();
      onSuccess();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const resetForm = () => {
    setName('');
    setCategory('');
    setLanguage('en_US');
    setBody('');
  };

  const handleSubmit = () => {
    if (!name.trim()) {
      toast.error('Template name is required');
      return;
    }
    if (!category) {
      toast.error('Please select a category');
      return;
    }
    if (!body.trim()) {
      toast.error('Template body is required');
      return;
    }
    mutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          Create Template
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[550px]">
        <DialogHeader>
          <DialogTitle>Create Message Template</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Template Name *</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'))}
              placeholder="e.g., admission_welcome"
            />
            <p className="text-xs text-muted-foreground">
              Lowercase letters, numbers, and underscores only
            </p>
          </div>

          <div className="space-y-2">
            <Label>Category *</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger>
                <SelectValue placeholder="Select category..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="MARKETING">Marketing</SelectItem>
                <SelectItem value="UTILITY">Utility</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Language</Label>
            <Select value={language} onValueChange={setLanguage}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="en_US">English (US)</SelectItem>
                <SelectItem value="en">English</SelectItem>
                <SelectItem value="ta">Tamil</SelectItem>
                <SelectItem value="hi">Hindi</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Body Text *</Label>
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Hello {{1}}, welcome to {{2}}! We're excited to help you with your admission process."
              rows={5}
            />
            <p className="text-xs text-muted-foreground">
              Use {'{{1}}'}, {'{{2}}'}, etc. for variable placeholders
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={mutation.isPending}>
            {mutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Creating...
              </>
            ) : (
              'Create Template'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =============================================================================
// Template Manager Tab
// =============================================================================

export function TemplateManagerTab({ institutionId }: { institutionId: string }) {
  const queryClient = useQueryClient();
  const [deletingName, setDeletingName] = useState<string | null>(null);

  const { data: templates, isLoading, refetch } = useQuery({
    queryKey: ['meta-templates', institutionId],
    queryFn: () => fetchTemplates(institutionId),
    enabled: !!institutionId,
  });

  const deleteMutation = useMutation({
    mutationFn: (templateName: string) =>
      deleteTemplate({ institution_id: institutionId, template_name: templateName }),
    onSuccess: () => {
      toast.success('Template deleted');
      setDeletingName(null);
      queryClient.invalidateQueries({ queryKey: ['meta-templates', institutionId] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const handleRefresh = () => {
    refetch();
    toast.info('Refreshing templates from Meta...');
  };

  const handleDelete = (templateName: string) => {
    if (deletingName === templateName) {
      // Confirmed — execute delete
      deleteMutation.mutate(templateName);
    } else {
      // First click — ask for confirmation
      setDeletingName(templateName);
      // Auto-reset after 3 seconds if not confirmed
      setTimeout(() => setDeletingName(null), 3000);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Meta Template Manager</h2>
        <p className="text-muted-foreground mt-1">
          Manage WhatsApp message templates on Meta Business Platform. Templates must be approved before use.
        </p>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {(templates || []).length} template{(templates || []).length !== 1 ? 's' : ''} found
        </p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <CreateTemplateDialog
            institutionId={institutionId}
            onSuccess={() =>
              queryClient.invalidateQueries({ queryKey: ['meta-templates', institutionId] })
            }
          />
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (templates || []).length === 0 ? (
        <Card>
          <CardContent className="py-12">
            <div className="text-center text-muted-foreground">
              <p className="text-lg font-medium">No templates found</p>
              <p className="text-sm mt-1">
                Create your first message template to start sending WhatsApp messages.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {(templates || []).map((template) => (
            <Card key={template.id || template.name}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <CardTitle className="text-base font-semibold">
                      {template.name}
                    </CardTitle>
                    <TemplatStatusBadge status={template.status} />
                    <CategoryBadge category={template.category} />
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">
                      {template.language}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="icon"
                      className={`h-8 w-8 ${
                        deletingName === template.name
                          ? 'text-destructive bg-destructive/10'
                          : 'text-muted-foreground hover:text-destructive'
                      }`}
                      onClick={() => handleDelete(template.name)}
                      disabled={deleteMutation.isPending}
                    >
                      {deleteMutation.isPending && deletingName === template.name ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>
              </CardHeader>
              {template.components && template.components.length > 0 && (
                <CardContent className="pt-0">
                  {template.components
                    .filter((c) => c.type === 'BODY' && c.text)
                    .map((c, i) => (
                      <p key={i} className="text-sm text-muted-foreground whitespace-pre-wrap">
                        {c.text}
                      </p>
                    ))}
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
