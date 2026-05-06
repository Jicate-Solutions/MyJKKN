'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { BosCourseSyllabus } from '@/types/bos';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AlertCircle, Book, Download } from 'lucide-react';

interface SyllabusTabProps {
  meetingId: string;
  regulationId?: string;
  institutionsId: string;
  canEdit: boolean;
}

export function SyllabusTab({
  meetingId,
  regulationId,
  institutionsId,
  canEdit,
}: SyllabusTabProps) {
  const router = useRouter();
  const [selectedFormat, setSelectedFormat] = useState<'official' | 'meeting_summary' | 'obe'>('meeting_summary');

  // Fetch syllabi for this meeting's regulation
  const { data: syllabusData, isLoading, error } = useQuery({
    queryKey: ['bos', 'syllabi-for-meeting', meetingId, regulationId],
    queryFn: async () => {
      const params = new URLSearchParams({
        institutionsId,
        ...(regulationId && { regulationId }),
        isLatest: 'true',
        limit: '1000',
      });

      const res = await fetch(`/api/bos/syllabi?${params}`);
      if (!res.ok) throw new Error('Failed to fetch syllabi');
      return res.json();
    },
    enabled: !!regulationId && !!institutionsId,
    staleTime: 5 * 60 * 1000,
  });

  // Fetch meeting syllabi associations (if any)
  const { data: meetingSyllabi } = useQuery({
    queryKey: ['bos', 'meeting-syllabi', meetingId],
    queryFn: async () => {
      const res = await fetch(`/api/bos/meetings/${meetingId}/syllabi`);
      if (!res.ok) return null;
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  const handleExportPdf = async (syllabusId: string, courseCode: string) => {
    try {
      const params = new URLSearchParams({
        format: selectedFormat,
        include_mappings: 'true',
        include_references: 'true',
        include_pedagogy: 'true',
      });

      const res = await fetch(`/api/bos/syllabi/${syllabusId}/export-pdf?${params}`);
      if (!res.ok) throw new Error('Failed to export PDF');

      const html = await res.text();

      // Trigger PDF generation using html2pdf (would need to be installed)
      // For now, open in new window for printing
      const newWindow = window.open('', '_blank');
      if (newWindow) {
        newWindow.document.write(html);
        newWindow.document.close();
      }
    } catch (error) {
      console.error('Failed to export PDF:', error);
    }
  };

  if (isLoading) {
    return <div className="text-center py-8">Loading syllabi...</div>;
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>Failed to load syllabi</AlertDescription>
      </Alert>
    );
  }

  const syllabi = syllabusData?.data || [];

  if (syllabi.length === 0) {
    return (
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          No syllabi found for this meeting's regulation. Create syllabi before the meeting.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      {/* Export Options */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Export Format</CardTitle>
          <CardDescription>Choose how you want to export syllabi</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={selectedFormat} onValueChange={(val) => setSelectedFormat(val as any)}>
            <TabsList>
              <TabsTrigger value="official" className="gap-1">
                <Book className="h-3.5 w-3.5" />
                Official
              </TabsTrigger>
              <TabsTrigger value="meeting_summary" className="gap-1">
                <Book className="h-3.5 w-3.5" />
                Meeting Summary
              </TabsTrigger>
              <TabsTrigger value="obe" className="gap-1">
                <Book className="h-3.5 w-3.5" />
                OBE Format
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="text-xs text-gray-600 mt-2">
            {selectedFormat === 'official' && 'Complete syllabus with all sections'}
            {selectedFormat === 'meeting_summary' && 'Focus on learning outcomes and meeting notes'}
            {selectedFormat === 'obe' && 'Optimized for lesson planning and OBE mapping'}
          </div>
        </CardContent>
      </Card>

      {/* Syllabi Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Course Syllabi ({syllabi.length})</CardTitle>
          <CardDescription>
            Syllabi for this meeting's regulation. Before-meeting versions are marked.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Course Code</TableHead>
                <TableHead>Course Name</TableHead>
                <TableHead>Stream</TableHead>
                <TableHead>Version</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {syllabi.map((syllabus: BosCourseSyllabus) => {
                const isMeetingSyllabus = meetingSyllabi?.some((ms: any) => ms.syllabus_id === syllabus.id);

                return (
                  <TableRow key={syllabus.id}>
                    <TableCell className="font-mono font-semibold">{syllabus.course_code}</TableCell>
                    <TableCell>{syllabus.course_name}</TableCell>
                    <TableCell>
                      {syllabus.stream ? (
                        <Badge variant="outline" className="text-xs">
                          {syllabus.stream}
                        </Badge>
                      ) : (
                        '-'
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={syllabus.is_latest ? 'default' : 'secondary'} className="text-xs">
                        v{syllabus.version_number}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {isMeetingSyllabus && (
                        <Badge variant="default" className="text-xs">
                          In Meeting
                        </Badge>
                      )}
                      {syllabus.is_latest && (
                        <Badge variant="secondary" className="text-xs">
                          Latest
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right space-x-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => router.push(`/bos/syllabi/${syllabus.id}/edit`)}
                      >
                        View
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleExportPdf(syllabus.id, syllabus.course_code)}
                      >
                        <Download className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Before/After Comparison */}
      {meetingSyllabi && meetingSyllabi.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Before & After Versions</CardTitle>
            <CardDescription>
              Compare syllabi before and after the meeting
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-sm text-gray-600">
              {meetingSyllabi.length} course(s) marked for this meeting review
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
