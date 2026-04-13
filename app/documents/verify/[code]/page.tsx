/**
 * Public Document Verification Page (Server Component)
 * No client-side Supabase — fetches data via API route server-side.
 * Renders static HTML that works without AuthProvider.
 */

import { CheckCircle2, XCircle, Shield, FileText } from 'lucide-react';
import { DOCUMENT_TYPE_INFO, type DocumentType } from '@/types/documents';

interface PageProps {
  params: Promise<{ code: string }>;
}

async function verifyDocument(code: string) {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const res = await fetch(`${baseUrl}/api/documents/verify?code=${encodeURIComponent(code)}`, {
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.found ? data.document : null;
  } catch {
    return null;
  }
}

function formatDate(dateStr: string) {
  try {
    return new Date(dateStr).toLocaleDateString('en-IN', {
      day: 'numeric', month: 'long', year: 'numeric',
    });
  } catch { return dateStr; }
}

export default async function DocumentVerifyPage({ params }: PageProps) {
  const { code } = await params;
  const doc = await verifyDocument(code);
  const typeInfo = doc ? DOCUMENT_TYPE_INFO[doc.document_type as DocumentType] : null;
  const isRevoked = doc?.status === 'revoked';

  if (!doc) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-red-50 to-gray-50 p-4">
        <div className="w-full max-w-md bg-white rounded-xl shadow-lg border border-red-200 p-8 text-center">
          <XCircle className="mx-auto h-12 w-12 text-red-500 mb-4" />
          <h2 className="text-xl font-bold text-red-700 mb-2">Document Not Found</h2>
          <p className="text-gray-500">
            No document matches verification code:{' '}
            <code className="font-mono bg-gray-100 px-2 py-0.5 rounded">{code}</code>
          </p>
          <p className="text-sm text-gray-400 mt-2">
            This code may be invalid or the document may have been revoked.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 to-amber-50 p-4">
      <div className={`w-full max-w-lg bg-white rounded-xl shadow-lg border ${isRevoked ? 'border-red-200' : 'border-green-200'} overflow-hidden`}>
        <div className="text-center p-6 pb-2">
          {isRevoked ? (
            <XCircle className="mx-auto h-12 w-12 text-red-500 mb-2" />
          ) : (
            <CheckCircle2 className="mx-auto h-12 w-12 text-green-600 mb-2" />
          )}
          <h1 className={`text-xl font-bold ${isRevoked ? 'text-red-700' : 'text-green-700'}`}>
            {isRevoked ? 'Document Revoked' : 'Document Verified'}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {isRevoked
              ? 'This document has been revoked and is no longer valid.'
              : 'This document was issued by the institution and is authentic.'}
          </p>
        </div>

        <div className="px-6 pb-6 space-y-4">
          <div className="bg-gray-50 rounded-lg p-4 space-y-3">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-gray-400" />
              <span className="text-sm font-medium">
                {typeInfo?.displayName || doc.document_type}
              </span>
              <span className="ml-auto text-xs px-2 py-0.5 bg-gray-200 rounded-full">
                {typeInfo?.category || doc.category}
              </span>
            </div>

            {doc.learner && (
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-gray-400">Student:</span>
                  <p className="font-medium">
                    {doc.learner.first_name} {doc.learner.last_name}
                  </p>
                </div>
                {doc.learner.roll_number && (
                  <div>
                    <span className="text-gray-400">Roll No:</span>
                    <p className="font-medium">{doc.learner.roll_number}</p>
                  </div>
                )}
              </div>
            )}

            {doc.institution && (
              <div className="text-sm">
                <span className="text-gray-400">Institution:</span>
                <p className="font-medium">{doc.institution.name}</p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <span className="text-gray-400">Document No:</span>
                <p className="font-mono text-xs">{doc.document_number}</p>
              </div>
              <div>
                <span className="text-gray-400">Issued:</span>
                <p>{doc.generated_at ? formatDate(doc.generated_at) : 'N/A'}</p>
              </div>
            </div>

            <div className="flex items-center gap-2 text-sm">
              <span className="text-gray-400">Status:</span>
              <span className={`text-xs px-2 py-0.5 rounded-full ${
                isRevoked ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
              }`}>
                {doc.status}
              </span>
            </div>

            {isRevoked && doc.revoke_reason && (
              <div className="text-sm border-t pt-2">
                <span className="text-gray-400">Reason:</span>
                <p className="text-red-600">{doc.revoke_reason}</p>
              </div>
            )}
          </div>

          <p className="text-xs text-center text-gray-400">
            Verification code: <code className="font-mono">{code}</code>
          </p>
          <p className="text-xs text-center text-gray-300">
            Powered by MyJKKN Document Engine
          </p>
        </div>
      </div>
    </div>
  );
}
