import { useMutation, useQuery } from '@tanstack/react-query';
import {
  sendEmailNotification,
  generateRevisionEmailHtml,
  generateApprovalEmailHtml,
  generateMeetingScheduledEmailHtml,
  generateRevisionEmailText
} from '@/lib/services/email-service';

/**
 * Hook for sending email notification on syllabus revision
 */
export function useSyllabusRevisionNotification() {
  return useMutation({
    mutationFn: async (params: {
      courseCode: string;
      courseName: string;
      versionNumber: number;
      recipientEmails: string[];
      syllabusId: string;
      institutionsId: string;
      editUrl: string;
    }) => {
      const promises = params.recipientEmails.map((email) =>
        sendEmailNotification({
          recipientEmail: email,
          subject: `Course Syllabus Revised: ${params.courseCode}`,
          body: generateRevisionEmailText(
            params.courseCode,
            params.courseName,
            params.versionNumber,
            params.editUrl
          ),
          htmlBody: generateRevisionEmailHtml(
            params.courseCode,
            params.courseName,
            params.versionNumber,
            params.editUrl
          ),
          notificationType: 'syllabus_revised',
          relatedSyllabusId: params.syllabusId,
          institutionsId: params.institutionsId,
        })
      );

      return Promise.all(promises);
    },
  });
}

/**
 * Hook for sending email notification on syllabus approval
 */
export function useSyllabusApprovalNotification() {
  return useMutation({
    mutationFn: async (params: {
      courseCode: string;
      courseName: string;
      meetingTitle: string;
      recipientEmails: string[];
      syllabusId: string;
      meetingId: string;
      institutionsId: string;
      viewUrl: string;
    }) => {
      const promises = params.recipientEmails.map((email) =>
        sendEmailNotification({
          recipientEmail: email,
          subject: `Syllabus Approved: ${params.courseCode}`,
          htmlBody: generateApprovalEmailHtml(
            params.courseCode,
            params.courseName,
            params.meetingTitle,
            params.viewUrl
          ),
          notificationType: 'syllabus_approved',
          relatedSyllabusId: params.syllabusId,
          relatedMeetingId: params.meetingId,
          institutionsId: params.institutionsId,
        })
      );

      return Promise.all(promises);
    },
  });
}

/**
 * Hook for sending email notification on meeting scheduled
 */
export function useMeetingScheduledNotification() {
  return useMutation({
    mutationFn: async (params: {
      meetingTitle: string;
      meetingDate: string;
      syllabusCount: number;
      recipientEmails: string[];
      meetingId: string;
      boardId: string;
      institutionsId: string;
      meetingUrl: string;
    }) => {
      const promises = params.recipientEmails.map((email) =>
        sendEmailNotification({
          recipientEmail: email,
          subject: `Board Meeting Scheduled: ${params.meetingTitle}`,
          htmlBody: generateMeetingScheduledEmailHtml(
            params.meetingTitle,
            params.meetingDate,
            params.syllabusCount,
            params.meetingUrl
          ),
          notificationType: 'meeting_scheduled',
          relatedMeetingId: params.meetingId,
          relatedBoardId: params.boardId,
          institutionsId: params.institutionsId,
        })
      );

      return Promise.all(promises);
    },
  });
}

/**
 * Hook for fetching email notification preferences
 */
export function useEmailNotificationPreferences(userId?: string, institutionsId?: string) {
  return useQuery({
    queryKey: ['email-prefs', userId, institutionsId],
    queryFn: async () => {
      const response = await fetch(
        `/api/notifications/preferences?user_id=${userId}&institutions_id=${institutionsId}`
      );

      if (!response.ok) {
        throw new Error('Failed to fetch preferences');
      }

      return response.json();
    },
    enabled: !!userId && !!institutionsId,
  });
}

/**
 * Hook for updating email notification preferences
 */
export function useUpdateEmailNotificationPreferences() {
  return useMutation({
    mutationFn: async (params: {
      userId: string;
      institutionsId: string;
      preferences: {
        syllabi_revised?: boolean;
        syllabi_approved?: boolean;
        meeting_scheduled?: boolean;
        course_ready_review?: boolean;
        email_frequency?: 'immediate' | 'daily_digest' | 'weekly_digest' | 'never';
      };
    }) => {
      const response = await fetch('/api/notifications/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });

      if (!response.ok) {
        throw new Error('Failed to update preferences');
      }

      return response.json();
    },
  });
}
