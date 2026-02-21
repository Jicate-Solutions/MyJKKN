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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
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
import { PermissionGuard } from '@/components/auth/permission-guard';
import { useUserInstitutionAccess } from '@/hooks/use-user-institution-access';
import { useChatbotConfig } from '@/hooks/admission/use-chatbot-config';
import { useChatbotKnowledge, useChatbotKnowledgeMutations } from '@/hooks/admission/use-chatbot-knowledge';
import { AdmissionErrorBoundary } from '@/components/admission';
import {
  BookOpen,
  Plus,
  Globe,
  FileText,
  MessageCircle,
  Trash2,
  Loader2,
  AlertCircle,
} from 'lucide-react';

function KnowledgeBaseContent() {
  const { selectedInstitutionId, loading: accessLoading } = useUserInstitutionAccess();
  const { config, isLoading: configLoading } = useChatbotConfig(selectedInstitutionId || undefined);
  const { documents, total, isLoading: docsLoading } = useChatbotKnowledge(config?.id || undefined);
  const { addDocument, deleteDocument } = useChatbotKnowledgeMutations();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [newDoc, setNewDoc] = useState({
    title: '',
    source_type: 'manual' as 'url' | 'document' | 'manual',
    source_url: '',
    content: '',
  });

  const isLoading = accessLoading || configLoading || docsLoading;

  const handleAdd = async () => {
    if (!config?.id || !newDoc.title || !newDoc.content) return;

    await addDocument.mutateAsync({
      chatbot_id: config.id,
      title: newDoc.title,
      source_type: newDoc.source_type,
      source_url: newDoc.source_url || undefined,
      content: newDoc.content,
    });

    setNewDoc({ title: '', source_type: 'manual', source_url: '', content: '' });
    setIsDialogOpen(false);
  };

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this document?')) {
      await deleteDocument.mutateAsync(id);
    }
  };

  const getSourceIcon = (type: string) => {
    switch (type) {
      case 'url': return <Globe className="h-4 w-4" />;
      case 'document': return <FileText className="h-4 w-4" />;
      case 'manual': return <MessageCircle className="h-4 w-4" />;
      default: return <FileText className="h-4 w-4" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'default';
      case 'processing': return 'secondary';
      case 'failed': return 'destructive';
      default: return 'outline' as const;
    }
  };

  if (isLoading) {
    return (
      <ContentLayout title="Knowledge Base">
        <div className="space-y-4">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-64" />
        </div>
      </ContentLayout>
    );
  }

  if (!config) {
    return (
      <ContentLayout title="Knowledge Base">
        <Card>
          <CardContent className="py-12 text-center">
            <AlertCircle className="h-8 w-8 mx-auto mb-4 text-muted-foreground" />
            <p className="text-muted-foreground">
              Please configure the chatbot first before managing the knowledge base.
            </p>
            <Button variant="outline" className="mt-4" asChild>
              <a href="/admission/chatbot">Go to Chatbot Settings</a>
            </Button>
          </CardContent>
        </Card>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title="Knowledge Base">
      <div className="space-y-6">
        {/* Breadcrumb */}
        <div className="flex items-center justify-between">
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink href="/admission/dashboard">Admission</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink href="/admission/chatbot">AI Chatbot</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>Knowledge Base</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>

          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" /> Add Document
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Add Knowledge Document</DialogTitle>
                <DialogDescription>
                  Add a document, URL, or Q&A pair for the chatbot to reference.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="doc-title">Title</Label>
                  <Input
                    id="doc-title"
                    value={newDoc.title}
                    onChange={(e) => setNewDoc({ ...newDoc, title: e.target.value })}
                    placeholder="e.g., B.Tech Program Details"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="doc-type">Source Type</Label>
                  <Select
                    value={newDoc.source_type}
                    onValueChange={(val) => setNewDoc({ ...newDoc, source_type: val as any })}
                  >
                    <SelectTrigger id="doc-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="manual">Manual Q&A / Text</SelectItem>
                      <SelectItem value="url">URL Reference</SelectItem>
                      <SelectItem value="document">Uploaded Document</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {newDoc.source_type === 'url' && (
                  <div className="space-y-2">
                    <Label htmlFor="doc-url">Source URL</Label>
                    <Input
                      id="doc-url"
                      value={newDoc.source_url}
                      onChange={(e) => setNewDoc({ ...newDoc, source_url: e.target.value })}
                      placeholder="https://jkkn.ac.in/programs/btech"
                    />
                  </div>
                )}
                <div className="space-y-2">
                  <Label htmlFor="doc-content">Content</Label>
                  <Textarea
                    id="doc-content"
                    value={newDoc.content}
                    onChange={(e) => setNewDoc({ ...newDoc, content: e.target.value })}
                    placeholder="Enter the information the chatbot should know..."
                    rows={8}
                  />
                  <p className="text-xs text-muted-foreground">
                    For Q&A pairs, format as: Q: [question]\nA: [answer]
                  </p>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
                <Button
                  onClick={handleAdd}
                  disabled={!newDoc.title || !newDoc.content || addDocument.isPending}
                >
                  {addDocument.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                  Add Document
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Documents</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{total}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Active</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">
                {documents.filter((d: any) => d.status === 'active').length}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Failed</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">
                {documents.filter((d: any) => d.status === 'failed').length}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Documents List */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="h-5 w-5" /> Knowledge Documents
            </CardTitle>
            <CardDescription>
              Documents the chatbot references when answering questions
            </CardDescription>
          </CardHeader>
          <CardContent>
            {documents.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <BookOpen className="h-10 w-10 mx-auto mb-4 opacity-50" />
                <p className="text-lg font-medium mb-2">No documents yet</p>
                <p className="text-sm mb-4">Add program details, FAQs, and other information for the chatbot.</p>
                <Button onClick={() => setIsDialogOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" /> Add First Document
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {documents.map((doc: any) => (
                  <div
                    key={doc.id}
                    className="flex items-start justify-between p-4 border rounded-lg"
                  >
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <div className="mt-1 text-muted-foreground">
                        {getSourceIcon(doc.source_type)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-sm truncate">{doc.title}</p>
                          <Badge variant={getStatusColor(doc.status) as any} className="text-xs shrink-0">
                            {doc.status}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          {doc.source_type} &middot; {doc.content?.length || 0} chars &middot;{' '}
                          {new Date(doc.created_at).toLocaleDateString()}
                        </p>
                        {doc.source_url && (
                          <p className="text-xs text-blue-600 truncate mt-1">{doc.source_url}</p>
                        )}
                        <p className="text-xs text-muted-foreground mt-2 line-clamp-2">
                          {doc.content?.substring(0, 200)}...
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="shrink-0 text-muted-foreground hover:text-destructive"
                      onClick={() => handleDelete(doc.id)}
                      disabled={deleteDocument.isPending}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}

export default function KnowledgeBasePage() {
  return (
    <PermissionGuard module="admission" action="view">
      <AdmissionErrorBoundary>
        <KnowledgeBaseContent />
      </AdmissionErrorBoundary>
    </PermissionGuard>
  );
}
