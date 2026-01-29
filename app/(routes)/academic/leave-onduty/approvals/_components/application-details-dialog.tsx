'use client';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  CheckCircle, 
  XCircle, 
  User, 
  Calendar, 
  FileText, 
  Clock, 
  Building2, 
  GraduationCap, 
  BookOpen,
  MapPin
} from 'lucide-react';
import { format } from 'date-fns';
import { AttachmentLink } from '@/components/academic/leave-onduty/attachment-link';
import { ApprovalTimeline } from '@/components/academic/leave-onduty/approval-timeline';
import { cn } from '@/lib/utils';

interface ApplicationDetailsDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  application: any; // Using any for now to match the flexible structure from page.tsx
  onApprove: () => void;
  onReject: () => void;
  isSuperAdmin?: boolean;
}

export function ApplicationDetailsDialog({
  isOpen,
  onOpenChange,
  application,
  onApprove,
  onReject,
  isSuperAdmin = false,
}: ApplicationDetailsDialogProps) {
  if (!application) return null;

  // Extract learner details
  const learner = application.learners_profiles || application.learner;
  const section = application.sections || application.section;
  const degree = section?.degrees || section?.degree;
  const department = application.departments || application.department;
  const semester = application.semesters || application.semester;
  const institution = application.institutions || application.institution;

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'leave':
        return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 border-blue-200 dark:border-blue-800';
      case 'onduty':
        return 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300 border-purple-200 dark:border-purple-800';
      default:
        return 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300 border-gray-200 dark:border-gray-700';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'approved':
        return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300 border-green-200 dark:border-green-800';
      case 'rejected':
        return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300 border-red-200 dark:border-red-800';
      case 'pending':
        return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300 border-yellow-200 dark:border-yellow-800';
      default:
        return 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300 border-gray-200 dark:border-gray-700';
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] p-0 gap-0 overflow-hidden flex flex-col">
        <DialogHeader className="px-6 py-4 border-b flex flex-row items-center justify-between space-y-0 bg-muted/20">
          <div className="space-y-1">
            <DialogTitle className="text-xl font-semibold flex items-center gap-2">
              Application Details
              <Badge variant="outline" className={cn("ml-2 capitalize border font-normal", getStatusColor(application.status))}>
                {application.status}
              </Badge>
            </DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground flex items-center gap-2">
              Applied on {format(new Date(application.application_date), 'MMMM dd, yyyy')}
            </DialogDescription>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className={cn("capitalize font-normal border", getCategoryColor(application.category))}>
              {application.category === 'leave' ? 'Leave Application' : 'On-Duty Application'}
            </Badge>
          </div>
        </DialogHeader>

        <ScrollArea className="flex-1 overflow-y-auto">
          <div className="p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
            
            {/* Left Column - Applicant & Application Info */}
            <div className="lg:col-span-7 space-y-6">
              
              {/* Student Information Card */}
              <Card>
                <CardHeader className="pb-3 bg-muted/10">
                  <CardTitle className="text-base font-medium flex items-center gap-2">
                    <User className="h-4 w-4 text-primary" />
                    Applicant Information
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-4 grid grid-cols-2 gap-4">
                  <div className="col-span-2 sm:col-span-1">
                    <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Name</p>
                    <p className="text-sm font-medium mt-1">{learner?.first_name} {learner?.last_name}</p>
                  </div>
                  
                  <div className="col-span-2 sm:col-span-1">
                    <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Register / Roll No</p>
                    <div className="flex flex-col mt-1">
                      {learner?.register_number && <span className="text-sm">{learner.register_number}</span>}
                      {learner?.roll_number && <span className="text-xs text-muted-foreground">{learner.roll_number}</span>}
                    </div>
                  </div>

                  <Separator className="col-span-2 my-1" />

                  {degree && (
                    <div className="col-span-2">
                      <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Degree & Department</p>
                      <div className="flex items-start gap-2 mt-1">
                        <GraduationCap className="h-4 w-4 text-muted-foreground mt-0.5" />
                        <div>
                          <p className="text-sm font-medium">{degree.degree_name} {degree.degree_id && `(${degree.degree_id})`}</p>
                          {department && <p className="text-xs text-muted-foreground">{department.department_name}</p>}
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="col-span-2 sm:col-span-1">
                    <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Semester & Section</p>
                    <p className="text-sm mt-1">
                      {semester?.semester_name || 'N/A'}
                      {section && <span className="text-muted-foreground ml-1">• {section.section_name}</span>}
                    </p>
                  </div>

                  {isSuperAdmin && institution && (
                    <div className="col-span-2 sm:col-span-1">
                      <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Institution</p>
                      <div className="flex items-center gap-1.5 mt-1">
                        <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                        <p className="text-sm truncate" title={institution.name}>{institution.name}</p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Leave Details Card */}
              <Card>
                <CardHeader className="pb-3 bg-muted/10">
                  <CardTitle className="text-base font-medium flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-primary" />
                    {application.category === 'leave' ? 'Leave' : 'On-Duty'} Details
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-4 space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">From</p>
                      <p className="text-sm font-semibold mt-1 flex items-center gap-2">
                        {format(new Date(application.start_date), 'MMM dd, yyyy')}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">To</p>
                      <p className="text-sm font-semibold mt-1 flex items-center gap-2">
                        {format(new Date(application.end_date), 'MMM dd, yyyy')}
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-4">
                     <div className="bg-muted/50 rounded-md px-3 py-2 flex-1">
                        <p className="text-xs text-muted-foreground font-medium">Sub Category</p>
                        <p className="text-sm font-medium capitalize mt-0.5">
                          {application.sub_category?.replace('_', ' ')}
                        </p>
                     </div>
                     <div className="bg-muted/50 rounded-md px-3 py-2 flex-1">
                        <p className="text-xs text-muted-foreground font-medium">Period Type</p>
                        <p className="text-sm font-medium capitalize mt-0.5">
                          {application.period_type}
                        </p>
                     </div>
                  </div>

                  <div>
                    <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-2">Reason</p>
                    <div className="bg-muted/30 p-3 rounded-md border text-sm text-foreground/90 whitespace-pre-wrap leading-relaxed">
                      {application.reason}
                    </div>
                  </div>

                  {application.attachment_url && (
                    <div className="pt-2">
                      <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-2">Attachment</p>
                      <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900 rounded-md p-3">
                         <AttachmentLink attachmentUrl={application.attachment_url} className="text-blue-600 dark:text-blue-400" />
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

            </div>

            {/* Right Column - Approval Flow */}
            <div className="lg:col-span-5 space-y-6">
              <Card className="h-full flex flex-col">
                <CardHeader className="pb-3 bg-muted/10">
                  <CardTitle className="text-base font-medium flex items-center gap-2">
                    <Clock className="h-4 w-4 text-primary" />
                    Approval Status
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-4 flex-1">
                  <ApprovalTimeline applicationId={application.id} />
                </CardContent>
              </Card>
            </div>

          </div>
        </ScrollArea>

        {/* Footer Actions */}
        <DialogFooter className="p-4 border-t bg-muted/10 sm:justify-between flex-row items-center gap-4">
           <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="hidden sm:flex"
          >
            Close
          </Button>
          <div className="flex gap-3 w-full sm:w-auto">
            <Button
              variant="destructive"
              className="flex-1 sm:flex-none gap-2"
              onClick={onReject}
            >
              <XCircle className="h-4 w-4" />
              Reject
            </Button>
            <Button
              variant="default"
              className="flex-1 sm:flex-none gap-2 bg-green-600 hover:bg-green-700 text-white"
              onClick={onApprove}
            >
              <CheckCircle className="h-4 w-4" />
              Approve
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
