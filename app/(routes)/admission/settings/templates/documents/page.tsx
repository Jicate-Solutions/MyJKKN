'use client';

import { useState } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList,
  BreadcrumbPage, BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { useAuth } from '@/hooks/use-auth';
import {
  useWADocumentCatalog,
  useWADocumentMutations,
  type CatalogDocument,
} from '@/hooks/admission/use-wa-document-catalog';
import {
  FolderOpen, Plus, Trash2, Share2, FileText, Image, Video,
  Link2, RefreshCw, Search,
} from 'lucide-react';
import { AdmissionErrorBoundary } from '@/components/admission';

const CATEGORIES = [
  { value: 'all', label: 'All' },
  { value: 'brochure', label: 'Brochures' },
  { value: 'fee_structure', label: 'Fee Structure' },
  { value: 'virtual_tour', label: 'Virtual Tours' },
  { value: 'campus_map', label: 'Campus Map' },
  { value: 'placement', label: 'Placement' },
  { value: 'other', label: 'Other' },
];

const DOC_TYPES = [
  { value: 'pdf', label: 'PDF', icon: FileText },
  { value: 'image', label: 'Image', icon: Image },
  { value: 'video', label: 'Video', icon: Video },
  { value: 'link', label: 'Link', icon: Link2 },
];

const TYPE_BADGE_COLORS: Record<string, string> = {
  pdf: 'bg-red-100 text-red-800',
  image: 'bg-blue-100 text-blue-800',
  video: 'bg-purple-100 text-purple-800',
  link: 'bg-green-100 text-green-800',
};

const CATEGORY_LABELS: Record<string, string> = {
  brochure: 'Brochure',
  fee_structure: 'Fee Structure',
  virtual_tour: 'Virtual Tour',
  campus_map: 'Campus Map',
  placement: 'Placement',
  other: 'Other',
};

function formatFileSize(bytes: number | null): string {
  if (!bytes) return '-';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function DocumentCatalogContent() {
  const { profile } = useAuth();
  const institutionId = profile?.institution_id;
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [addDialogOpen, setAddDialogOpen] = useState(false);

  // Form state
  const [formTitle, setFormTitle] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formCategory, setFormCategory] = useState('brochure');
  const [formDocType, setFormDocType] = useState('pdf');
  const [formUrl, setFormUrl] = useState('');
  const [formThumbnailUrl, setFormThumbnailUrl] = useState('');

  const { documents, isLoading, refetch } = useWADocumentCatalog(
    institutionId,
    categoryFilter,
    searchQuery || undefined
  );
  const { create, remove } = useWADocumentMutations();

  const resetForm = () => {
    setFormTitle('');
    setFormDescription('');
    setFormCategory('brochure');
    setFormDocType('pdf');
    setFormUrl('');
    setFormThumbnailUrl('');
  };

  const handleCreate = () => {
    if (!formTitle || !formUrl) return;
    create.mutate(
      {
        title: formTitle,
        description: formDescription || undefined,
        category: formCategory,
        document_type: formDocType,
        url: formUrl,
        thumbnail_url: formThumbnailUrl || undefined,
      },
      {
        onSuccess: () => {
          setAddDialogOpen(false);
          resetForm();
        },
      }
    );
  };

  const handleDelete = (id: string) => {
    remove.mutate(id);
  };

  return (
    <PermissionGuard module="admission" action="view">
      <ContentLayout title="Document Catalog">
        <div className="space-y-6">
          {/* Breadcrumb */}
          <div className="flex items-center justify-between">
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem><BreadcrumbLink href="/">Dashboard</BreadcrumbLink></BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem><BreadcrumbLink href="/admission">Admission</BreadcrumbLink></BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem><BreadcrumbLink href="/admission/settings/templates">Templates</BreadcrumbLink></BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem><BreadcrumbPage>Document Catalog</BreadcrumbPage></BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4 mr-2" />Refresh
            </Button>
          </div>

          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <FolderOpen className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h1 className="text-2xl font-bold">Document Catalog</h1>
                <p className="text-sm text-muted-foreground">
                  Manage shareable documents for WhatsApp conversations
                </p>
              </div>
            </div>

            <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
              <DialogTrigger asChild>
                <Button onClick={() => { resetForm(); setAddDialogOpen(true); }}>
                  <Plus className="h-4 w-4 mr-2" />Add Document
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                  <DialogTitle>Add Document to Catalog</DialogTitle>
                  <DialogDescription>
                    Add a document URL that counselors can share in WhatsApp conversations.
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid gap-2">
                    <Label htmlFor="doc-title">Title</Label>
                    <Input
                      id="doc-title"
                      placeholder="e.g., B.Tech Program Brochure 2026"
                      value={formTitle}
                      onChange={(e) => setFormTitle(e.target.value)}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="doc-desc">Description (optional)</Label>
                    <Textarea
                      id="doc-desc"
                      placeholder="Brief description of the document"
                      rows={2}
                      value={formDescription}
                      onChange={(e) => setFormDescription(e.target.value)}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label>Category</Label>
                      <Select value={formCategory} onValueChange={setFormCategory}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {CATEGORIES.filter(c => c.value !== 'all').map(c => (
                            <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-2">
                      <Label>Document Type</Label>
                      <Select value={formDocType} onValueChange={setFormDocType}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {DOC_TYPES.map(t => (
                            <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="doc-url">URL</Label>
                    <Input
                      id="doc-url"
                      placeholder="https://..."
                      value={formUrl}
                      onChange={(e) => setFormUrl(e.target.value)}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="doc-thumb">Thumbnail URL (optional)</Label>
                    <Input
                      id="doc-thumb"
                      placeholder="https://..."
                      value={formThumbnailUrl}
                      onChange={(e) => setFormThumbnailUrl(e.target.value)}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setAddDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    onClick={handleCreate}
                    disabled={!formTitle || !formUrl || create.isPending}
                  >
                    {create.isPending ? 'Adding...' : 'Add Document'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          {/* Filters */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="relative flex-1 max-w-sm">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search documents..."
                    className="pl-10"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
                <div className="flex gap-1">
                  {CATEGORIES.map(cat => (
                    <Button
                      key={cat.value}
                      variant={categoryFilter === cat.value ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setCategoryFilter(cat.value)}
                    >
                      {cat.label}
                    </Button>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Documents Table */}
          <Card>
            <CardHeader>
              <CardTitle>Documents</CardTitle>
              <CardDescription>
                {documents.length} document{documents.length !== 1 ? 's' : ''} in catalog
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full" />)}
                </div>
              ) : documents.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground">
                  <FolderOpen className="h-12 w-12 mx-auto mb-4 opacity-30" />
                  <p className="text-lg font-medium mb-2">No documents found</p>
                  <p>Add brochures, fee structures, and more for quick sharing.</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Title</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead className="text-right">Shares</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {documents.map((doc: CatalogDocument) => {
                      const TypeIcon = DOC_TYPES.find(t => t.value === doc.document_type)?.icon || FileText;
                      return (
                        <TableRow key={doc.id}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <TypeIcon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                              <div>
                                <p className="font-medium">{doc.title}</p>
                                {doc.description && (
                                  <p className="text-xs text-muted-foreground line-clamp-1">
                                    {doc.description}
                                  </p>
                                )}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">
                              {CATEGORY_LABELS[doc.category] || doc.category}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge className={TYPE_BADGE_COLORS[doc.document_type] || 'bg-gray-100 text-gray-800'}>
                              {doc.document_type.toUpperCase()}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Share2 className="h-3 w-3 text-muted-foreground" />
                              <span>{doc.share_count}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {new Date(doc.created_at).toLocaleDateString()}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => window.open(doc.url, '_blank')}
                              >
                                <Link2 className="h-3 w-3" />
                              </Button>
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button variant="ghost" size="sm" className="text-destructive">
                                    <Trash2 className="h-3 w-3" />
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Delete Document</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      Are you sure you want to remove &quot;{doc.title}&quot; from the catalog?
                                      This action cannot be undone.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction
                                      onClick={() => handleDelete(doc.id)}
                                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                    >
                                      Delete
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      </ContentLayout>
    </PermissionGuard>
  );
}

export default function DocumentCatalogPage() {
  return (
    <AdmissionErrorBoundary>
      <DocumentCatalogContent />
    </AdmissionErrorBoundary>
  );
}
