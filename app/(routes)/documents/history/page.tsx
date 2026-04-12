'use client';

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { FileText, Search, Download, XCircle, ChevronLeft, ChevronRight } from 'lucide-react';
import { useDocumentHistory } from '@/hooks/documents/use-documents';
import { DOCUMENT_TYPE_INFO, type DocumentCategory, type DocumentStatus } from '@/types/documents';

const STATUS_COLORS: Record<DocumentStatus, string> = {
  generated: 'bg-green-100 text-green-700',
  printed: 'bg-blue-100 text-blue-700',
  revoked: 'bg-red-100 text-red-700',
  superseded: 'bg-gray-100 text-gray-700',
};

export default function DocumentHistoryPage() {
  const {
    documents, metadata, loading, filters, updateFilters, changePage,
  } = useDocumentHistory();

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString('en-IN', {
        day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
      });
    } catch { return dateStr; }
  };

  return (
    <ContentLayout title="Document History">
      <PageBreadcrumb
        items={[
          { label: 'Dashboard', href: '/' },
          { label: 'Document Center', href: '/documents' },
          { label: 'History', href: '/documents/history' },
        ]}
      />

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold tracking-tight">Document History</h1>
          <Badge variant="outline">{metadata.total} documents</Badge>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="pt-4">
            <div className="flex flex-wrap gap-3">
              <div className="flex-1 min-w-[200px]">
                <Input
                  placeholder="Search by name or document number..."
                  value={filters.search || ''}
                  onChange={(e) => updateFilters({ search: e.target.value })}
                  className="h-9"
                />
              </div>
              <Select
                value={filters.category || 'all'}
                onValueChange={(v) => updateFilters({ category: v === 'all' ? undefined : v as DocumentCategory })}
              >
                <SelectTrigger className="w-[160px] h-9">
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  <SelectItem value="certificate">Certificates</SelectItem>
                  <SelectItem value="letter">Letters</SelectItem>
                  <SelectItem value="administrative">Administrative</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={filters.status || 'all'}
                onValueChange={(v) => updateFilters({ status: v === 'all' ? undefined : v as DocumentStatus })}
              >
                <SelectTrigger className="w-[140px] h-9">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="generated">Generated</SelectItem>
                  <SelectItem value="printed">Printed</SelectItem>
                  <SelectItem value="revoked">Revoked</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Table */}
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Document</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Student</TableHead>
                  <TableHead>Number</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Generated</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      Loading...
                    </TableCell>
                  </TableRow>
                ) : documents.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8">
                      <FileText className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
                      <p className="text-muted-foreground">No documents found</p>
                    </TableCell>
                  </TableRow>
                ) : (
                  documents.map((doc) => {
                    const typeInfo = DOCUMENT_TYPE_INFO[doc.document_type];
                    return (
                      <TableRow key={doc.id}>
                        <TableCell className="font-medium max-w-[250px] truncate">
                          {doc.title}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">
                            {typeInfo?.displayName || doc.document_type}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {doc.learner
                            ? `${doc.learner.first_name} ${doc.learner.last_name}`
                            : '—'}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {doc.document_number}
                        </TableCell>
                        <TableCell>
                          <Badge className={`text-xs ${STATUS_COLORS[doc.status]}`}>
                            {doc.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {formatDate(doc.generated_at)}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Pagination */}
        {metadata.totalPages > 1 && (
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Page {metadata.page} of {metadata.totalPages}
            </p>
            <div className="flex gap-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => changePage(metadata.page - 1)}
                disabled={metadata.page <= 1}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => changePage(metadata.page + 1)}
                disabled={metadata.page >= metadata.totalPages}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </ContentLayout>
  );
}
