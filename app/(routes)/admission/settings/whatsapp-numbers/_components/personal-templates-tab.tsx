'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Plus, Pencil, Trash2, Eye, Loader2, MessageSquareText } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  usePersonalWATemplates,
  usePersonalWATemplateMutations,
} from '@/hooks/admission/use-personal-wa-templates';
import type {
  PersonalMessageTemplate,
  PersonalTemplateCategory,
  CreatePersonalTemplateInput,
  TEMPLATE_VARIABLES,
} from '@/types/whatsapp-personal';

interface PersonalTemplatesTabProps {
  institutionId: string;
}

const CATEGORY_LABELS: Record<PersonalTemplateCategory, { label: string; color: string }> = {
  expo_welcome: { label: 'Expo Welcome', color: 'bg-green-100 text-green-700' },
  followup: { label: 'Follow-up', color: 'bg-blue-100 text-blue-700' },
  reminder: { label: 'Reminder', color: 'bg-orange-100 text-orange-700' },
  general: { label: 'General', color: 'bg-gray-100 text-gray-700' },
};

const AVAILABLE_VARIABLES = [
  { key: 'lead_name', description: 'Student/lead name' },
  { key: 'parent_name', description: 'Parent/guardian name' },
  { key: 'event_name', description: 'Expo/event name' },
  { key: 'institution_name', description: 'Institution name' },
  { key: 'program_interest', description: 'Interested programs' },
  { key: 'counselor_name', description: 'Assigned counselor name' },
  { key: 'counselor_phone', description: 'Counselor phone number' },
  { key: 'phone', description: 'Lead phone number' },
  { key: 'date', description: 'Current date' },
];

export function PersonalTemplatesTab({ institutionId }: PersonalTemplatesTabProps) {
  const { data: templates, isLoading } = usePersonalWATemplates(institutionId);
  const { createTemplate, updateTemplate, deleteTemplate } =
    usePersonalWATemplateMutations(institutionId);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<PersonalMessageTemplate | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewContent, setPreviewContent] = useState('');

  // Form state
  const [name, setName] = useState('');
  const [category, setCategory] = useState<PersonalTemplateCategory>('expo_welcome');
  const [content, setContent] = useState('');
  const [isDefault, setIsDefault] = useState(false);

  const openCreate = () => {
    setEditingTemplate(null);
    setName('');
    setCategory('expo_welcome');
    setContent('');
    setIsDefault(false);
    setDialogOpen(true);
  };

  const openEdit = (t: PersonalMessageTemplate) => {
    setEditingTemplate(t);
    setName(t.name);
    setCategory(t.category);
    setContent(t.content);
    setIsDefault(t.is_default);
    setDialogOpen(true);
  };

  const handlePreview = (templateContent: string) => {
    // Replace variables with sample values
    const preview = templateContent
      .replace(/\{\{lead_name\}\}/g, 'Arjun Kumar')
      .replace(/\{\{parent_name\}\}/g, 'Rajesh Kumar')
      .replace(/\{\{event_name\}\}/g, 'Chennai Education Fair 2026')
      .replace(/\{\{institution_name\}\}/g, 'JKKN Institutions')
      .replace(/\{\{program_interest\}\}/g, 'B.Tech Computer Science')
      .replace(/\{\{counselor_name\}\}/g, 'Priya S')
      .replace(/\{\{counselor_phone\}\}/g, '+91 98765 43210')
      .replace(/\{\{phone\}\}/g, '+91 74486 88572')
      .replace(/\{\{date\}\}/g, new Date().toLocaleDateString('en-IN'));
    setPreviewContent(preview);
    setPreviewOpen(true);
  };

  const insertVariable = (varKey: string) => {
    setContent((prev) => prev + `{{${varKey}}}`);
  };

  const handleSave = async () => {
    if (!name.trim() || !content.trim()) {
      toast.error('Name and content are required');
      return;
    }

    if (editingTemplate) {
      updateTemplate.mutate(
        { id: editingTemplate.id, name, category, content, is_default: isDefault },
        { onSuccess: () => setDialogOpen(false) }
      );
    } else {
      createTemplate.mutate(
        { institution_id: institutionId, name, category, content, is_default: isDefault },
        { onSuccess: () => setDialogOpen(false) }
      );
    }
  };

  const isSaving = createTemplate.isPending || updateTemplate.isPending;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <MessageSquareText className="h-5 w-5 text-green-600" />
            Personal WhatsApp Templates
          </h2>
          <p className="text-sm text-muted-foreground">
            Create message templates with variables for auto-triggered personal WhatsApp messages.
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4 mr-2" />
          New Template
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : !templates?.length ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <MessageSquareText className="h-12 w-12 mx-auto mb-3 opacity-20" />
            <p>No templates created yet</p>
            <p className="text-sm mt-1">Create your first template to enable auto-messaging</p>
            <Button variant="outline" className="mt-4" onClick={openCreate}>
              <Plus className="h-4 w-4 mr-2" />
              Create Template
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {templates.map((t) => (
            <Card key={t.id} className="relative">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-base">{t.name}</CardTitle>
                    <Badge className={CATEGORY_LABELS[t.category]?.color || ''}>
                      {CATEGORY_LABELS[t.category]?.label || t.category}
                    </Badge>
                    {t.is_default && (
                      <Badge variant="outline" className="text-xs">Default</Badge>
                    )}
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handlePreview(t.content)}>
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(t)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => deleteTemplate.mutate(t.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap line-clamp-3">
                  {t.content}
                </p>
                {t.variables.length > 0 && (
                  <div className="flex gap-1 mt-2 flex-wrap">
                    {t.variables.map((v) => (
                      <Badge key={v} variant="secondary" className="text-xs">
                        {`{{${v}}}`}
                      </Badge>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>
              {editingTemplate ? 'Edit Template' : 'Create Template'}
            </DialogTitle>
            <DialogDescription>
              Use {'{{variable_name}}'} syntax to insert dynamic values.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Template Name *</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g., Expo Welcome Message"
                />
              </div>
              <div className="space-y-2">
                <Label>Category</Label>
                <Select value={category} onValueChange={(v) => setCategory(v as PersonalTemplateCategory)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(CATEGORY_LABELS).map(([key, val]) => (
                      <SelectItem key={key} value={key}>{val.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Message Content *</Label>
              <Textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Hello {{lead_name}}! Thank you for visiting us at {{event_name}}..."
                className="min-h-[120px]"
              />
              <p className="text-xs text-muted-foreground">
                {content.length}/4096 characters
              </p>
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Insert Variable</Label>
              <div className="flex flex-wrap gap-1">
                {AVAILABLE_VARIABLES.map((v) => (
                  <Button
                    key={v.key}
                    variant="outline"
                    size="sm"
                    className="text-xs h-7"
                    onClick={() => insertVariable(v.key)}
                    title={v.description}
                  >
                    {`{{${v.key}}}`}
                  </Button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Switch checked={isDefault} onCheckedChange={setIsDefault} />
              <Label className="text-sm">Set as default for {CATEGORY_LABELS[category]?.label}</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => handlePreview(content)}>
              <Eye className="h-4 w-4 mr-2" />
              Preview
            </Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editingTemplate ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preview Dialog */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Message Preview</DialogTitle>
            <DialogDescription>How the message will appear with sample data</DialogDescription>
          </DialogHeader>
          <div className="bg-[#DCF8C6] rounded-lg p-3 text-sm whitespace-pre-wrap">
            {previewContent}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreviewOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
