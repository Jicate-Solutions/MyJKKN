'use client';

import React, { useState } from 'react';
import { usePdfExport } from '@/hooks/bos/use-bos-revision';
import { exportHtmlToPdf, printHtmlToPdf } from '@/lib/utils/pdf-export';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { AlertCircle, Download, Printer } from 'lucide-react';

interface PdfExportDialogProps {
  open: boolean;
  syllabusId: string;
  courseCode: string;
  courseName: string;
  onOpenChange: (open: boolean) => void;
}

export function PdfExportDialog({
  open,
  syllabusId,
  courseCode,
  courseName,
  onOpenChange,
}: PdfExportDialogProps) {
  const [format, setFormat] = useState<'official' | 'meeting_summary' | 'obe'>('official');
  const [includeMappings, setIncludeMappings] = useState(true);
  const [includeReferences, setIncludeReferences] = useState(true);
  const [includePedagogy, setIncludePedagogy] = useState(true);
  const [exportMethod, setExportMethod] = useState<'download' | 'print'>('download');
  const pdfExport = usePdfExport(syllabusId);

  const handleExport = async () => {
    if (!syllabusId) return;

    try {
      // Fetch HTML from API
      const html = await pdfExport.mutateAsync({
        format,
        include_mappings: includeMappings,
        include_references: includeReferences,
        include_pedagogy: includePedagogy,
      });

      // Generate filename
      const timestamp = new Date().toISOString().split('T')[0];
      const filename = `${courseCode}_${format}_${timestamp}.pdf`;

      // Export based on selected method
      if (exportMethod === 'download') {
        await exportHtmlToPdf(html, filename);
      } else {
        printHtmlToPdf(html, `${courseCode} - ${courseName}`);
      }

      onOpenChange(false);
    } catch (error) {
      console.error('Export failed:', error);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Export Syllabus to PDF</DialogTitle>
          <DialogDescription>
            {courseCode}: {courseName}
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="format" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="format">Format</TabsTrigger>
            <TabsTrigger value="options">Options</TabsTrigger>
            <TabsTrigger value="method">Export Method</TabsTrigger>
          </TabsList>

          {/* Format Selection */}
          <TabsContent value="format" className="space-y-4">
            <div className="space-y-3">
              {[
                {
                  value: 'official',
                  label: 'Official Syllabus',
                  description: 'Complete syllabus with all sections (objectives, CLOs, content, mappings, resources)',
                  pages: '5-8',
                },
                {
                  value: 'meeting_summary',
                  label: 'Meeting Summary',
                  description: 'Focused on learning outcomes and meeting notes. Ideal for board review.',
                  pages: '2-3',
                },
                {
                  value: 'obe',
                  label: 'OBE Format',
                  description: 'Optimized for lesson planning. Includes outcome mappings and delivery plan.',
                  pages: '3-5',
                },
              ].map((option) => (
                <div
                  key={option.value}
                  className={`p-4 border rounded-lg cursor-pointer transition ${
                    format === option.value ? 'border-blue-500 bg-blue-50' : 'border-gray-200'
                  }`}
                  onClick={() => setFormat(option.value as any)}
                >
                  <div className="flex items-start gap-3">
                    <input
                      type="radio"
                      name="format"
                      value={option.value}
                      checked={format === option.value}
                      onChange={(e) => setFormat(e.target.value as any)}
                      className="mt-1"
                    />
                    <div>
                      <div className="font-semibold">{option.label}</div>
                      <div className="text-sm text-gray-600">{option.description}</div>
                      <div className="text-xs text-gray-500 mt-1">~{option.pages} pages</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>

          {/* Options */}
          <TabsContent value="options" className="space-y-4">
            <div className="space-y-3">
              <div>
                <Label className="text-base font-semibold">Include Sections</Label>
                <p className="text-sm text-gray-600 mb-3">Choose what to include in the PDF</p>
              </div>

              <div className="space-y-2 pl-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <Checkbox
                    checked={includeMappings}
                    onCheckedChange={setIncludeMappings}
                  />
                  <span className="text-sm">
                    Programme Outcome Mappings
                    <span className="text-xs text-gray-500 block">PO alignment (H/M/L ratings)</span>
                  </span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <Checkbox
                    checked={includeReferences}
                    onCheckedChange={setIncludeReferences}
                  />
                  <span className="text-sm">
                    Textbooks & Web Resources
                    <span className="text-xs text-gray-500 block">References and online materials</span>
                  </span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <Checkbox
                    checked={includePedagogy}
                    onCheckedChange={setIncludePedagogy}
                  />
                  <span className="text-sm">
                    Pedagogical Methods
                    <span className="text-xs text-gray-500 block">Teaching and learning approaches</span>
                  </span>
                </label>
              </div>
            </div>
          </TabsContent>

          {/* Export Method */}
          <TabsContent value="method" className="space-y-4">
            <div className="space-y-3">
              {[
                {
                  value: 'download',
                  label: 'Download PDF',
                  description: 'Save as PDF file to your computer (requires html2pdf library)',
                  icon: Download,
                },
                {
                  value: 'print',
                  label: 'Print to PDF',
                  description: 'Open in browser for printing or saving via print dialog',
                  icon: Printer,
                },
              ].map((option) => {
                const Icon = option.icon;
                return (
                  <div
                    key={option.value}
                    className={`p-4 border rounded-lg cursor-pointer transition ${
                      exportMethod === option.value ? 'border-blue-500 bg-blue-50' : 'border-gray-200'
                    }`}
                    onClick={() => setExportMethod(option.value as any)}
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="radio"
                        name="method"
                        value={option.value}
                        checked={exportMethod === option.value}
                        onChange={(e) => setExportMethod(e.target.value as any)}
                        className="mt-1"
                      />
                      <div className="flex items-start gap-2 flex-1">
                        <Icon className="h-5 w-5 text-gray-600 mt-0.5" />
                        <div>
                          <div className="font-semibold">{option.label}</div>
                          <div className="text-sm text-gray-600">{option.description}</div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {exportMethod === 'download' && (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription className="text-sm">
                  To use direct PDF download, install html2pdf: <code className="bg-gray-100 px-1 rounded text-xs">npm install html2pdf.js</code>
                </AlertDescription>
              </Alert>
            )}
          </TabsContent>
        </Tabs>

        {pdfExport.error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{pdfExport.error.message}</AlertDescription>
          </Alert>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleExport}
            disabled={pdfExport.isPending}
          >
            {pdfExport.isPending ? 'Exporting...' : 'Export PDF'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
