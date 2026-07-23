'use client';

/**
 * HR Template Library Page — /hr/templates
 *
 * Grid of template cards organized by category with search and filters.
 * Admin users can create/upload templates; all HR users can browse/download.
 */

import { Suspense, useState, useMemo } from 'react';
import {
  FileText,
  FileSpreadsheet,
  FileType,
  Link2,
  Download,
  Plus,
  Search,
  Upload,
  Clock,
} from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useTemplates, useCreateTemplate, useIncrementDownload } from '@/hooks/hr/recruitment-need/use-templates';
import type { HRTemplate, TemplateCategory, TemplateFileType } from '@/types/hr-templates';
import { TEMPLATE_CATEGORIES } from '@/types/hr-templates';
import { useTabParam } from '@/hooks/use-tab-param';

// Tab values: 'all' plus each template category value (from TEMPLATE_CATEGORIES).
const HR_TEMPLATE_TABS = [
  'all',
  ...TEMPLATE_CATEGORIES.map((c) => c.value),
] as const;

// ─── File type icon mapping ─────────────────────────────────────────────────────

function FileIcon({ fileType }: { fileType: TemplateFileType | null }) {
  switch (fileType) {
    case 'pdf':
      return <FileText className="h-5 w-5 text-red-500" />;
    case 'docx':
      return <FileType className="h-5 w-5 text-blue-500" />;
    case 'xlsx':
      return <FileSpreadsheet className="h-5 w-5 text-green-500" />;
    case 'md':
      return <FileText className="h-5 w-5 text-gray-500" />;
    case 'link':
      return <Link2 className="h-5 w-5 text-purple-500" />;
    default:
      return <FileText className="h-5 w-5 text-gray-400" />;
  }
}

// ─── Category badge color mapping ───────────────────────────────────────────────

function categoryVariant(
  cat: TemplateCategory
): 'default' | 'secondary' | 'outline' | 'destructive' {
  switch (cat) {
    case 'interview_questions':
    case 'evaluation_forms':
      return 'default';
    case 'email_templates':
    case 'policy_templates':
      return 'secondary';
    case 'checklists':
    case 'process_guides':
      return 'outline';
    case 'onboarding_docs':
    case 'offboarding_docs':
    case 'report_templates':
      return 'destructive';
    default:
      return 'default';
  }
}

function getCategoryLabel(cat: TemplateCategory): string {
  return TEMPLATE_CATEGORIES.find((c) => c.value === cat)?.label ?? cat;
}

// ─── Template Card ──────────────────────────────────────────────────────────────

function TemplateCard({
  template,
  onDownload,
}: {
  template: HRTemplate;
  onDownload: (t: HRTemplate) => void;
}) {
  return (
    <Card className="flex flex-col justify-between hover:shadow-md transition-shadow">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <FileIcon fileType={template.file_type} />
            <CardTitle className="text-base leading-tight">{template.title}</CardTitle>
          </div>
          <Badge variant={categoryVariant(template.category)} className="shrink-0 text-xs">
            {getCategoryLabel(template.category)}
          </Badge>
        </div>
        {template.description && (
          <CardDescription className="mt-2 line-clamp-2 text-sm">
            {template.description}
          </CardDescription>
        )}
      </CardHeader>

      <CardContent className="pt-0">
        {/* Tags */}
        {template.tags.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-1">
            {template.tags.map((tag) => (
              <Badge key={tag} variant="outline" className="text-xs font-normal">
                {tag}
              </Badge>
            ))}
          </div>
        )}

        {/* Footer: file type + download */}
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <div className="flex items-center gap-3">
            {template.file_type && (
              <span className="uppercase font-medium">{template.file_type}</span>
            )}
            <span className="flex items-center gap-1">
              <Download className="h-3 w-3" />
              {template.download_count}
            </span>
          </div>

          {template.file_url ? (
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={() => onDownload(template)}
            >
              <Download className="mr-1 h-3 w-3" />
              Download
            </Button>
          ) : (
            <Badge variant="outline" className="text-xs text-amber-600 border-amber-300">
              <Clock className="mr-1 h-3 w-3" />
              Upload pending
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Create Template Dialog ─────────────────────────────────────────────────────

function CreateTemplateDialog() {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<TemplateCategory>('interview_questions');
  const [fileType, setFileType] = useState<TemplateFileType>('pdf');
  const [tagsInput, setTagsInput] = useState('');

  const createMutation = useCreateTemplate();

  const handleSubmit = () => {
    if (!title.trim()) return;

    createMutation.mutate(
      {
        title: title.trim(),
        description: description.trim() || null,
        category,
        file_type: fileType,
        tags: tagsInput
          .split(',')
          .map((t) => t.trim().toLowerCase())
          .filter(Boolean),
      },
      {
        onSuccess: () => {
          setOpen(false);
          setTitle('');
          setDescription('');
          setTagsInput('');
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="mr-1 h-4 w-4" />
          Add Template
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Template</DialogTitle>
          <DialogDescription>
            Create a new template entry. You can upload the file later.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="tpl-title">Title</Label>
            <Input
              id="tpl-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Faculty Interview Question Bank"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="tpl-desc">Description</Label>
            <Textarea
              id="tpl-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Brief description of this template"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={category} onValueChange={(v) => setCategory(v as TemplateCategory)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TEMPLATE_CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>File Type</Label>
              <Select value={fileType} onValueChange={(v) => setFileType(v as TemplateFileType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pdf">PDF</SelectItem>
                  <SelectItem value="docx">DOCX</SelectItem>
                  <SelectItem value="xlsx">XLSX</SelectItem>
                  <SelectItem value="md">Markdown</SelectItem>
                  <SelectItem value="link">Link</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="tpl-tags">Tags (comma-separated)</Label>
            <Input
              id="tpl-tags"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              placeholder="e.g. faculty, interview, hiring"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!title.trim() || createMutation.isPending}
          >
            {createMutation.isPending ? 'Creating...' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────────────────

function HRTemplatesPageInner() {
  const [activeTab, setActiveTab] = useTabParam('all', HR_TEMPLATE_TABS);
  const [search, setSearch] = useState('');

  const categoryFilter =
    activeTab === 'all' ? undefined : (activeTab as TemplateCategory);

  const { data: templates = [], isLoading } = useTemplates({
    category: categoryFilter,
    search: search.trim() || undefined,
  });

  const incrementDownload = useIncrementDownload();

  const handleDownload = (template: HRTemplate) => {
    if (template.file_url) {
      incrementDownload.mutate(template.id);
      window.open(template.file_url, '_blank');
    }
  };

  // Group templates by category for the "all" view
  const grouped = useMemo(() => {
    const map = new Map<TemplateCategory, HRTemplate[]>();
    for (const t of templates) {
      const cat = t.category as TemplateCategory;
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(t);
    }
    return map;
  }, [templates]);

  return (
    <ContentLayout title="Template Library">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/hr">HR</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Templates</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="mt-4 space-y-4">
        {/* Header row */}
        <div className="flex items-center justify-between gap-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search templates..."
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <CreateTemplateDialog />
        </div>

        {/* Category tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="flex-wrap h-auto gap-1">
            <TabsTrigger value="all">All</TabsTrigger>
            {TEMPLATE_CATEGORIES.map((c) => (
              <TabsTrigger key={c.value} value={c.value}>
                {c.label}
              </TabsTrigger>
            ))}
          </TabsList>

          {/* Loading state */}
          {isLoading && (
            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Card key={i} className="animate-pulse">
                  <CardHeader>
                    <div className="h-4 bg-muted rounded w-3/4" />
                    <div className="h-3 bg-muted rounded w-full mt-2" />
                  </CardHeader>
                  <CardContent>
                    <div className="h-3 bg-muted rounded w-1/2" />
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* All templates tab */}
          <TabsContent value="all" className="mt-4 space-y-6">
            {!isLoading && templates.length === 0 && (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  <Upload className="mx-auto h-12 w-12 mb-4 opacity-40" />
                  <p className="text-lg font-medium">No templates found</p>
                  <p className="text-sm mt-1">
                    {search ? 'Try a different search term' : 'Add your first template to get started'}
                  </p>
                </CardContent>
              </Card>
            )}

            {!isLoading &&
              Array.from(grouped.entries()).map(([cat, items]) => (
                <div key={cat}>
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                    {getCategoryLabel(cat)} ({items.length})
                  </h3>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {items.map((t) => (
                      <TemplateCard key={t.id} template={t} onDownload={handleDownload} />
                    ))}
                  </div>
                </div>
              ))}
          </TabsContent>

          {/* Individual category tabs */}
          {TEMPLATE_CATEGORIES.map((c) => (
            <TabsContent key={c.value} value={c.value} className="mt-4">
              {!isLoading && templates.length === 0 && (
                <Card>
                  <CardContent className="py-12 text-center text-muted-foreground">
                    <Upload className="mx-auto h-12 w-12 mb-4 opacity-40" />
                    <p className="text-lg font-medium">No {c.label.toLowerCase()} templates</p>
                    <p className="text-sm mt-1">Add a template in this category to get started</p>
                  </CardContent>
                </Card>
              )}

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {templates.map((t) => (
                  <TemplateCard key={t.id} template={t} onDownload={handleDownload} />
                ))}
              </div>
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </ContentLayout>
  );
}

export default function HRTemplatesPage() {
  // Suspense boundary required: useTabParam() reads useSearchParams().
  return (
    <Suspense fallback={null}>
      <HRTemplatesPageInner />
    </Suspense>
  );
}
