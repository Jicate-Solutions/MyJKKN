'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, XCircle, Shield, FileText } from 'lucide-react';
import { DocumentGenerationService } from '@/lib/services/documents/document-generation-service';
import { DOCUMENT_TYPE_INFO } from '@/types/documents';
import type { GeneratedDocument } from '@/types/documents';

export default function DocumentVerifyPage() {
  const params = useParams();
  const code = params.code as string;
  const [document, setDocument] = useState<GeneratedDocument | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    async function verify() {
      setLoading(true);
      try {
        const result = await DocumentGenerationService.verifyDocument(code);
        if (result) {
          setDocument(result);
        } else {
          setNotFound(true);
        }
      } catch {
        setNotFound(true);
      } finally {
        setLoading(false);
      }
    }
    if (code) verify();
  }, [code]);

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString('en-IN', {
        day: 'numeric', month: 'long', year: 'numeric',
      });
    } catch { return dateStr; }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 to-amber-50">
        <Card className="w-full max-w-md">
          <CardContent className="py-12 text-center">
            <Shield className="mx-auto h-10 w-10 text-muted-foreground animate-pulse mb-4" />
            <p className="text-muted-foreground">Verifying document...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-red-50 to-gray-50">
        <Card className="w-full max-w-md border-red-200">
          <CardContent className="py-12 text-center">
            <XCircle className="mx-auto h-12 w-12 text-red-500 mb-4" />
            <h2 className="text-xl font-bold text-red-700 mb-2">Document Not Found</h2>
            <p className="text-muted-foreground">
              No document matches verification code: <code className="font-mono">{code}</code>
            </p>
            <p className="text-sm text-muted-foreground mt-2">
              This code may be invalid or the document may have been revoked.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const typeInfo = document ? DOCUMENT_TYPE_INFO[document.document_type] : null;
  const isRevoked = document?.status === 'revoked';

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 to-amber-50 p-4">
      <Card className={`w-full max-w-lg ${isRevoked ? 'border-red-200' : 'border-green-200'}`}>
        <CardHeader className="text-center pb-2">
          {isRevoked ? (
            <XCircle className="mx-auto h-12 w-12 text-red-500 mb-2" />
          ) : (
            <CheckCircle2 className="mx-auto h-12 w-12 text-green-600 mb-2" />
          )}
          <CardTitle className={isRevoked ? 'text-red-700' : 'text-green-700'}>
            {isRevoked ? 'Document Revoked' : 'Document Verified'}
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            {isRevoked
              ? 'This document has been revoked and is no longer valid.'
              : 'This document was issued by the institution and is authentic.'}
          </p>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="bg-muted/50 rounded-lg p-4 space-y-3">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">
                {typeInfo?.displayName || document?.document_type}
              </span>
              <Badge variant="outline" className="ml-auto text-xs">
                {typeInfo?.category}
              </Badge>
            </div>

            {document?.learner && (
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-muted-foreground">Student:</span>
                  <p className="font-medium">
                    {document.learner.first_name} {document.learner.last_name}
                  </p>
                </div>
                {document.learner.roll_number && (
                  <div>
                    <span className="text-muted-foreground">Roll No:</span>
                    <p className="font-medium">{document.learner.roll_number}</p>
                  </div>
                )}
              </div>
            )}

            {document?.institution && (
              <div className="text-sm">
                <span className="text-muted-foreground">Institution:</span>
                <p className="font-medium">{document.institution.name}</p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <span className="text-muted-foreground">Document No:</span>
                <p className="font-mono text-xs">{document?.document_number}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Issued:</span>
                <p>{document?.generated_at ? formatDate(document.generated_at) : 'N/A'}</p>
              </div>
            </div>

            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Status:</span>
              <Badge className={`text-xs ${
                isRevoked ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
              }`}>
                {document?.status}
              </Badge>
            </div>

            {isRevoked && document?.revoke_reason && (
              <div className="text-sm border-t pt-2">
                <span className="text-muted-foreground">Reason:</span>
                <p className="text-red-600">{document.revoke_reason}</p>
              </div>
            )}
          </div>

          <p className="text-xs text-center text-muted-foreground">
            Verification code: <code className="font-mono">{code}</code>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
