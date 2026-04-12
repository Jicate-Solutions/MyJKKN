'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup,
  DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Download, FileText, Award, Mail, ClipboardList, Loader2 } from 'lucide-react';
import { useLearnerDocuments, useGenerateDocument } from '@/hooks/documents/use-documents';
import {
  DOCUMENT_TYPE_INFO, type DocumentType, type DocumentCategory,
} from '@/types/documents';
import { useAuth } from '@/hooks/use-auth';

interface Props {
  learnerId: string;
  institutionId: string;
}

const CATEGORY_ICONS: Record<DocumentCategory, React.ReactNode> = {
  certificate: <Award className="h-4 w-4" />,
  letter: <Mail className="h-4 w-4" />,
  administrative: <ClipboardList className="h-4 w-4" />,
};

const docTypes = Object.values(DOCUMENT_TYPE_INFO);
const certificates = docTypes.filter((d) => d.category === 'certificate');
const letters = docTypes.filter((d) => d.category === 'letter');
const administrative = docTypes.filter((d) => d.category === 'administrative');

export function LearnerDocumentsTab({ learnerId, institutionId }: Props) {
  const { data: documents, isLoading } = useLearnerDocuments(learnerId);
  const generateMutation = useGenerateDocument();
  const { profile } = useAuth();
  const [generatingType, setGeneratingType] = useState<string | null>(null);

  const handleGenerate = async (documentType: DocumentType) => {
    if (!profile) return;
    setGeneratingType(documentType);
    generateMutation.mutate(
      {
        dto: { institutionId, documentType, learnerId },
        userId: profile.id,
      },
      { onSettled: () => setGeneratingType(null) }
    );
  };

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString('en-IN', {
        day: '2-digit', month: 'short', year: 'numeric',
      });
    } catch { return dateStr; }
  };

  return (
    <div className="space-y-4">
      {/* Generate dropdown */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {documents?.length || 0} document(s) generated
        </p>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm">
              <Download className="mr-2 h-4 w-4" />
              Generate Document
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-64" align="end">
            <DropdownMenuLabel className="flex items-center gap-2">
              {CATEGORY_ICONS.certificate} Certificates
            </DropdownMenuLabel>
            {certificates.map((dt) => (
              <DropdownMenuItem
                key={dt.type}
                onClick={() => handleGenerate(dt.type)}
                disabled={generatingType === dt.type}
              >
                {generatingType === dt.type ? (
                  <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                ) : null}
                {dt.displayName}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="flex items-center gap-2">
              {CATEGORY_ICONS.letter} Letters
            </DropdownMenuLabel>
            {letters.map((dt) => (
              <DropdownMenuItem
                key={dt.type}
                onClick={() => handleGenerate(dt.type)}
                disabled={generatingType === dt.type}
              >
                {generatingType === dt.type ? (
                  <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                ) : null}
                {dt.displayName}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="flex items-center gap-2">
              {CATEGORY_ICONS.administrative} Administrative
            </DropdownMenuLabel>
            {administrative.map((dt) => (
              <DropdownMenuItem
                key={dt.type}
                onClick={() => handleGenerate(dt.type)}
                disabled={generatingType === dt.type}
              >
                {generatingType === dt.type ? (
                  <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                ) : null}
                {dt.displayName}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Document history */}
      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground">Loading documents...</div>
      ) : !documents || documents.length === 0 ? (
        <div className="text-center py-8">
          <FileText className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">No documents generated yet</p>
          <p className="text-xs text-muted-foreground mt-1">Use the button above to generate certificates, letters, or administrative documents</p>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Document</TableHead>
              <TableHead>Number</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Date</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {documents.map((doc) => {
              const typeInfo = DOCUMENT_TYPE_INFO[doc.document_type];
              return (
                <TableRow key={doc.id}>
                  <TableCell>
                    <div className="font-medium text-sm">{typeInfo?.displayName || doc.document_type}</div>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{doc.document_number}</TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={`text-xs ${
                        doc.status === 'revoked'
                          ? 'bg-red-50 text-red-700'
                          : 'bg-green-50 text-green-700'
                      }`}
                    >
                      {doc.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatDate(doc.generated_at)}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
