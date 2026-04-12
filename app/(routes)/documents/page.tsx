'use client';

import { useState } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Award, Mail, ClipboardList,
  Download, History,
} from 'lucide-react';
import { DOCUMENT_TYPE_INFO, type DocumentType, type DocumentCategory } from '@/types/documents';
import { GenerateDocumentDialog } from './_components/generate-document-dialog';

const CATEGORY_ICONS: Record<DocumentCategory, React.ReactNode> = {
  certificate: <Award className="h-5 w-5" />,
  letter: <Mail className="h-5 w-5" />,
  administrative: <ClipboardList className="h-5 w-5" />,
};

const CATEGORY_COLORS: Record<DocumentCategory, string> = {
  certificate: 'bg-amber-50 border-amber-200 text-amber-700',
  letter: 'bg-blue-50 border-blue-200 text-blue-700',
  administrative: 'bg-green-50 border-green-200 text-green-700',
};

export default function DocumentCenterPage() {
  const [selectedType, setSelectedType] = useState<DocumentType | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const documentTypes = Object.values(DOCUMENT_TYPE_INFO);
  const certificates = documentTypes.filter((d) => d.category === 'certificate');
  const letters = documentTypes.filter((d) => d.category === 'letter');
  const administrative = documentTypes.filter((d) => d.category === 'administrative');

  const handleGenerate = (type: DocumentType) => {
    setSelectedType(type);
    setDialogOpen(true);
  };

  return (
    <ContentLayout title="Document Center">
      <PageBreadcrumb
        items={[
          { label: 'Dashboard', href: '/' },
          { label: 'Document Center', href: '/documents' },
        ]}
      />

      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Document Center</h1>
            <p className="text-muted-foreground">
              Generate certificates, letters, and administrative documents from student data
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" asChild>
              <a href="/documents/history">
                <History className="mr-2 h-4 w-4" />
                History
              </a>
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Certificates</CardTitle>
              <Award className="h-4 w-4 text-amber-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{certificates.length}</div>
              <p className="text-xs text-muted-foreground">document types available</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Letters</CardTitle>
              <Mail className="h-4 w-4 text-blue-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{letters.length}</div>
              <p className="text-xs text-muted-foreground">document types available</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Administrative</CardTitle>
              <ClipboardList className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{administrative.length}</div>
              <p className="text-xs text-muted-foreground">document types available</p>
            </CardContent>
          </Card>
        </div>

        {/* Document Types by Category */}
        <Tabs defaultValue="certificate">
          <TabsList>
            <TabsTrigger value="certificate">
              <Award className="mr-2 h-4 w-4" />
              Certificates ({certificates.length})
            </TabsTrigger>
            <TabsTrigger value="letter">
              <Mail className="mr-2 h-4 w-4" />
              Letters ({letters.length})
            </TabsTrigger>
            <TabsTrigger value="administrative">
              <ClipboardList className="mr-2 h-4 w-4" />
              Administrative ({administrative.length})
            </TabsTrigger>
          </TabsList>

          {(['certificate', 'letter', 'administrative'] as DocumentCategory[]).map((cat) => (
            <TabsContent key={cat} value={cat}>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {documentTypes
                  .filter((d) => d.category === cat)
                  .map((docType) => (
                    <Card
                      key={docType.type}
                      className={`cursor-pointer transition-all hover:shadow-md border ${CATEGORY_COLORS[cat]}`}
                    >
                      <CardHeader className="pb-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            {CATEGORY_ICONS[cat]}
                            <CardTitle className="text-base">{docType.displayName}</CardTitle>
                          </div>
                          {docType.supportsQR && (
                            <Badge variant="outline" className="text-xs">
                              QR
                            </Badge>
                          )}
                        </div>
                        <CardDescription className="text-xs">
                          {docType.description}
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="pt-0">
                        <div className="flex items-center justify-between">
                          <Badge variant="secondary" className="text-xs">
                            {docType.defaultOrientation === 'landscape' ? '↔ Landscape' : '↕ Portrait'}
                          </Badge>
                          <div className="flex gap-1">
                            <Button
                              size="sm"
                              variant="default"
                              onClick={() => handleGenerate(docType.type)}
                            >
                              <Download className="mr-1 h-3 w-3" />
                              Generate
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
              </div>
            </TabsContent>
          ))}
        </Tabs>
      </div>

      {/* Generate Dialog */}
      {selectedType && (
        <GenerateDocumentDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          documentType={selectedType}
        />
      )}
    </ContentLayout>
  );
}
