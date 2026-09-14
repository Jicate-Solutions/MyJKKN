'use client';

// components/service-requests/certificate-download-dialog.tsx
// ============================================================================
// Office-staff dialog on an APPROVED service request:
//   Select certificate type → adjust date / purpose → live PDF preview →
//   Download (logged on the request timeline) or Print.
//
// The preview iframe and the download both hit
// GET /api/service-requests/[id]/certificate — the same render, so what the
// office sees is exactly what prints.
// ============================================================================

import { useEffect, useMemo, useRef, useState } from 'react';
import { Award, Download, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  CERTIFICATE_TEMPLATES,
  getCertificateTemplate,
  type CertificateTemplateKey,
} from '@/lib/certificates/registry';
import { purposeFromFormData } from '@/lib/certificates/derive';
import type { ServiceRequest } from '@/types/service-request';

interface CertificateDownloadDialogProps {
  request: ServiceRequest;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Purpose captured on the request form (field key or label mentions purpose/reason). */
function purposeFromRequest(request: ServiceRequest): string {
  return purposeFromFormData(request.form_data, request.service_type?.fields ?? []);
}

export function CertificateDownloadDialog({ request, open, onOpenChange }: CertificateDownloadDialogProps) {
  const enabledKeys = (request.service_type?.certificate_template_keys ?? []) as CertificateTemplateKey[];
  const templates = CERTIFICATE_TEMPLATES.filter((t) => enabledKeys.includes(t.key));

  const [templateKey, setTemplateKey] = useState<CertificateTemplateKey | ''>(templates[0]?.key ?? '');
  const [issueDate, setIssueDate] = useState(todayIso());
  const [purpose, setPurpose] = useState(() => purposeFromRequest(request));
  const [completionMonth, setCompletionMonth] = useState('');
  const [yearOfStudy, setYearOfStudy] = useState('');
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // The request can refetch (React Query) after this dialog first mounted —
  // keep the purpose in step with what is actually on the form.
  useEffect(() => {
    setPurpose(purposeFromRequest(request));
  }, [request]);

  const meta = templateKey ? getCertificateTemplate(templateKey) : null;

  const buildUrl = (download: boolean) => {
    if (!templateKey) return '';
    const params = new URLSearchParams({ template: templateKey });
    if (issueDate) params.set('date', issueDate);
    if (meta?.inputs.includes('purpose') && purpose) params.set('purpose', purpose);
    if (meta?.inputs.includes('completionMonth') && completionMonth) params.set('completion_month', completionMonth);
    if (meta?.inputs.includes('yearOfStudy') && yearOfStudy) params.set('year_of_study', yearOfStudy);
    if (download) params.set('download', '1');
    return `/api/service-requests/${request.id}/certificate?${params.toString()}`;
  };

  // Recomputed only when an input changes, so the iframe does not reload on
  // every unrelated re-render of the parent page.
  const previewUrl = useMemo(
    () => buildUrl(false),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [templateKey, issueDate, purpose, completionMonth, yearOfStudy, request.id]
  );

  const handlePrint = () => {
    const win = iframeRef.current?.contentWindow;
    if (win) {
      win.focus();
      win.print();
    } else {
      window.open(previewUrl, '_blank', 'noopener');
    }
  };

  const handleDownload = () => {
    const a = document.createElement('a');
    a.href = buildUrl(true);
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl w-[96vw] p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-4 border-b">
          <DialogTitle className="flex items-center gap-2">
            <Award className="h-5 w-5" />
            Generate Certificate
          </DialogTitle>
          <DialogDescription>
            Request {request.request_number} · {request.requester?.full_name ?? 'Requester'}. The preview
            is laid out for the pre-printed letterhead; print on letterhead paper at 100% scale.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] max-h-[80vh]">
          {/* ── Inputs ─────────────────────────────── */}
          <div className="p-6 space-y-4 border-b lg:border-b-0 lg:border-r overflow-y-auto">
            {templates.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No certificate is enabled for this service type. An administrator can enable one under
                Service Requests → Types → Edit → Certificates.
              </p>
            ) : (
              <>
                <div className="space-y-2">
                  <Label>Certificate type</Label>
                  <Select value={templateKey} onValueChange={(v) => setTemplateKey(v as CertificateTemplateKey)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select certificate" />
                    </SelectTrigger>
                    <SelectContent>
                      {templates.map((t) => (
                        <SelectItem key={t.key} value={t.key}>
                          {t.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {meta && <p className="text-xs text-muted-foreground">{meta.description}</p>}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="cert-date">Date on certificate</Label>
                  <Input
                    id="cert-date"
                    type="date"
                    value={issueDate}
                    onChange={(e) => setIssueDate(e.target.value)}
                  />
                </div>

                {meta?.inputs.includes('yearOfStudy') && (
                  <div className="space-y-2">
                    <Label htmlFor="cert-year">Year of study</Label>
                    <Input
                      id="cert-year"
                      placeholder="Auto from semester (e.g. I, II)"
                      value={yearOfStudy}
                      onChange={(e) => setYearOfStudy(e.target.value)}
                    />
                  </div>
                )}

                {meta?.inputs.includes('purpose') && (
                  <div className="space-y-2">
                    <Label htmlFor="cert-purpose">Purpose</Label>
                    <Input
                      id="cert-purpose"
                      placeholder="e.g. Scholarship, Bank loan, Passport"
                      value={purpose}
                      onChange={(e) => setPurpose(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                      Prints as “issued only for the purpose of availing …”.
                    </p>
                  </div>
                )}

                {meta?.inputs.includes('completionMonth') && (
                  <div className="space-y-2">
                    <Label htmlFor="cert-completion">Completed in</Label>
                    <Input
                      id="cert-completion"
                      placeholder="Auto from batch end (e.g. April 2026)"
                      value={completionMonth}
                      onChange={(e) => setCompletionMonth(e.target.value)}
                    />
                  </div>
                )}

                <div className="flex flex-col gap-2 pt-2">
                  <Button onClick={handleDownload} disabled={!templateKey} className="gap-2">
                    <Download className="h-4 w-4" />
                    Download PDF
                  </Button>
                  <Button variant="outline" onClick={handlePrint} disabled={!templateKey} className="gap-2">
                    <Printer className="h-4 w-4" />
                    Print
                  </Button>
                </div>
              </>
            )}
          </div>

          {/* ── Preview ────────────────────────────── */}
          <div className="bg-muted/40 min-h-[420px] lg:min-h-[70vh]">
            {previewUrl ? (
              <iframe
                ref={iframeRef}
                key={previewUrl}
                src={previewUrl}
                title="Certificate preview"
                className="w-full h-full min-h-[420px] lg:min-h-[70vh] border-0"
              />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                Select a certificate to preview
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
