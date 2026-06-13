/**
 * Email Service for BoS Notifications
 * Handles sending email notifications for syllabus revisions, approvals, and meetings
 */

interface EmailNotificationPayload {
  recipientEmail: string;
  recipientName?: string;
  subject: string;
  body: string;
  htmlBody?: string;
  notificationType: 'syllabus_revised' | 'syllabus_approved' | 'meeting_scheduled' | 'course_ready_review';
  relatedSyllabusId?: string;
  relatedMeetingId?: string;
  relatedBoardId?: string;
  institutionsId: string;
}

/**
 * Send email notification through API
 * Queues in database for async processing
 */
export async function sendEmailNotification(payload: EmailNotificationPayload) {
  try {
    const response = await fetch('/api/notifications/email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Failed to queue email: ${response.statusText}`);
    }

    return response.json();
  } catch (error) {
    console.error('Email notification failed:', error);
    throw error;
  }
}

/**
 * Generate HTML email for syllabus revision
 */
export function generateRevisionEmailHtml(
  courseCode: string,
  courseName: string,
  versionNumber: number,
  editUrl: string
) {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
        .header h1 { margin: 0; font-size: 24px; }
        .content { background: #f9fafb; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
        .field { margin-bottom: 15px; }
        .label { font-weight: 600; color: #667eea; font-size: 12px; text-transform: uppercase; }
        .value { font-size: 16px; color: #333; }
        .action-button {
          display: inline-block;
          padding: 12px 24px;
          background: #667eea;
          color: white;
          text-decoration: none;
          border-radius: 6px;
          margin-top: 10px;
        }
        .footer { text-align: center; font-size: 12px; color: #999; margin-top: 20px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Course Syllabus Revision</h1>
        </div>

        <div class="content">
          <p>A course syllabus has been revised in the Board of Studies system.</p>

          <div class="field">
            <div class="label">Course Code</div>
            <div class="value">${courseCode}</div>
          </div>

          <div class="field">
            <div class="label">Course Name</div>
            <div class="value">${courseName}</div>
          </div>

          <div class="field">
            <div class="label">New Version</div>
            <div class="value">v${versionNumber}</div>
          </div>

          <p style="margin-top: 20px; font-size: 14px; color: #666;">
            Review the updated syllabus and approve or request further changes.
          </p>

          <a href="${editUrl}" class="action-button">Review Syllabus</a>
        </div>

        <div class="footer">
          <p>This is an automated notification from the MyJKKN Board of Studies module.</p>
        </div>
      </div>
    </body>
    </html>
  `;
}

/**
 * Generate HTML email for syllabus approval
 */
export function generateApprovalEmailHtml(
  courseCode: string,
  courseName: string,
  meetingTitle: string,
  viewUrl: string
) {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
        .header h1 { margin: 0; font-size: 24px; }
        .content { background: #f0fdf4; padding: 20px; border-radius: 8px; margin-bottom: 20px; border-left: 4px solid #10b981; }
        .field { margin-bottom: 15px; }
        .label { font-weight: 600; color: #10b981; font-size: 12px; text-transform: uppercase; }
        .value { font-size: 16px; color: #333; }
        .badge { display: inline-block; background: #10b981; color: white; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 600; }
        .action-button {
          display: inline-block;
          padding: 12px 24px;
          background: #10b981;
          color: white;
          text-decoration: none;
          border-radius: 6px;
          margin-top: 10px;
        }
        .footer { text-align: center; font-size: 12px; color: #999; margin-top: 20px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Syllabus Approved ✓</h1>
        </div>

        <div class="content">
          <p>The following course syllabus has been approved by the Board of Studies:</p>

          <div class="field">
            <div class="label">Course Code</div>
            <div class="value">${courseCode}</div>
          </div>

          <div class="field">
            <div class="label">Course Name</div>
            <div class="value">${courseName}</div>
          </div>

          <div class="field">
            <div class="label">Approved In</div>
            <div class="value">${meetingTitle}</div>
          </div>

          <div class="field">
            <span class="badge">APPROVED</span>
          </div>

          <p style="margin-top: 20px; font-size: 14px; color: #666;">
            The approved syllabus is now active in the system.
          </p>

          <a href="${viewUrl}" class="action-button">View Approved Syllabus</a>
        </div>

        <div class="footer">
          <p>This is an automated notification from the MyJKKN Board of Studies module.</p>
        </div>
      </div>
    </body>
    </html>
  `;
}

/**
 * Generate HTML email for meeting scheduled
 */
export function generateMeetingScheduledEmailHtml(
  meetingTitle: string,
  meetingDate: string,
  syllabusCount: number,
  meetingUrl: string
) {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); color: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
        .header h1 { margin: 0; font-size: 24px; }
        .content { background: #eff6ff; padding: 20px; border-radius: 8px; margin-bottom: 20px; border-left: 4px solid #3b82f6; }
        .field { margin-bottom: 15px; }
        .label { font-weight: 600; color: #3b82f6; font-size: 12px; text-transform: uppercase; }
        .value { font-size: 16px; color: #333; }
        .action-button {
          display: inline-block;
          padding: 12px 24px;
          background: #3b82f6;
          color: white;
          text-decoration: none;
          border-radius: 6px;
          margin-top: 10px;
        }
        .footer { text-align: center; font-size: 12px; color: #999; margin-top: 20px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Board of Studies Meeting Scheduled</h1>
        </div>

        <div class="content">
          <p>A new Board of Studies meeting has been scheduled with syllabi for review.</p>

          <div class="field">
            <div class="label">Meeting Title</div>
            <div class="value">${meetingTitle}</div>
          </div>

          <div class="field">
            <div class="label">Scheduled Date</div>
            <div class="value">${meetingDate}</div>
          </div>

          <div class="field">
            <div class="label">Syllabi for Review</div>
            <div class="value">${syllabusCount} course${syllabusCount !== 1 ? 's' : ''}</div>
          </div>

          <p style="margin-top: 20px; font-size: 14px; color: #666;">
            Review the scheduled syllabi and prepare for the meeting.
          </p>

          <a href="${meetingUrl}" class="action-button">View Meeting Details</a>
        </div>

        <div class="footer">
          <p>This is an automated notification from the MyJKKN Board of Studies module.</p>
        </div>
      </div>
    </body>
    </html>
  `;
}

/**
 * Generate plain text email for revision
 */
export function generateRevisionEmailText(
  courseCode: string,
  courseName: string,
  versionNumber: number,
  editUrl: string
) {
  return `
Course Syllabus Revision

A course syllabus has been revised in the Board of Studies system.

Course Code: ${courseCode}
Course Name: ${courseName}
New Version: v${versionNumber}

Review the updated syllabus and approve or request further changes:
${editUrl}

---
This is an automated notification from the MyJKKN Board of Studies module.
  `.trim();
}
