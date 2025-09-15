import { LearnerAttendanceExportService } from './learner-attendance-export-service';
import type { LearnerAttendanceDetails } from '@/types/learner-attendance';

interface ShareOptions {
  includeOverview?: boolean;
  includeCourseStats?: boolean;
  includeDetailedRecords?: boolean;
  dateRange?: { from: string; to: string };
  shareMethod: 'email' | 'link' | 'download';
}

interface EmailShareOptions extends ShareOptions {
  recipientEmail?: string;
  recipientName?: string;
  message?: string;
  parentEmail?: string;
  advisorEmail?: string;
}

export class LearnerAttendanceShareService {
  /**
   * Share attendance report via email
   */
  static async shareViaEmail(
    attendanceData: LearnerAttendanceDetails,
    options: EmailShareOptions
  ): Promise<void> {
    const {
      recipientEmail,
      recipientName,
      message,
      parentEmail,
      advisorEmail,
      includeOverview = true,
      includeCourseStats = true,
      includeDetailedRecords = false,
      dateRange
    } = options;

    // Generate a summary for the email body
    const summary = this.generateAttendanceSummary(attendanceData);

    // Create email content
    const subject = `Attendance Report - ${attendanceData.student_name} (${attendanceData.roll_number})`;

    const emailBody = this.generateEmailBody({
      attendanceData,
      summary,
      message,
      recipientName,
      dateRange
    });

    // For now, we'll use mailto link as a fallback
    // In production, you would integrate with an email service like SendGrid, AWS SES, etc.
    const recipients = [recipientEmail, parentEmail, advisorEmail].filter(Boolean).join(',');

    const mailtoLink = `mailto:${recipients}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(emailBody)}`;

    // Try to open default email client
    try {
      window.open(mailtoLink);
    } catch (error) {
      console.error('Error opening email client:', error);
      // Fallback: copy email content to clipboard
      await navigator.clipboard.writeText(`Subject: ${subject}\n\n${emailBody}`);
      throw new Error('Email client not available. Email content copied to clipboard.');
    }
  }

  /**
   * Share attendance link with others
   */
  static async shareAttendanceLink(
    attendanceData: LearnerAttendanceDetails,
    options: {
      platform?: 'whatsapp' | 'telegram' | 'generic';
      includeStats?: boolean;
    } = {}
  ): Promise<void> {
    const { platform = 'generic', includeStats = true } = options;

    const baseUrl = window.location.origin;
    const shareUrl = `${baseUrl}/learner/attendance`;

    let shareText = `📊 Attendance Report for ${attendanceData.student_name}`;

    if (includeStats) {
      shareText += `\n📈 Overall Attendance: ${attendanceData.attendance_stats.overall_percentage.toFixed(1)}%`;
      shareText += `\n📚 Total Periods: ${attendanceData.attendance_stats.total_periods}`;
      shareText += `\n✅ Attended: ${attendanceData.attendance_stats.attended_periods}`;
    }

    shareText += `\n🔗 View Report: ${shareUrl}`;

    switch (platform) {
      case 'whatsapp':
        const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(shareText)}`;
        window.open(whatsappUrl, '_blank');
        break;

      case 'telegram':
        const telegramUrl = `https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(shareText)}`;
        window.open(telegramUrl, '_blank');
        break;

      default:
        if (navigator.share) {
          await navigator.share({
            title: 'Attendance Report',
            text: shareText,
            url: shareUrl
          });
        } else {
          await navigator.clipboard.writeText(shareText);
          throw new Error('Link and details copied to clipboard');
        }
    }
  }

  /**
   * Generate attendance summary for email
   */
  private static generateAttendanceSummary(attendanceData: LearnerAttendanceDetails): string {
    const stats = attendanceData.attendance_stats;

    let summary = `📊 ATTENDANCE SUMMARY\n`;
    summary += `Student: ${attendanceData.student_name}\n`;
    summary += `Roll Number: ${attendanceData.roll_number}\n`;
    summary += `Program: ${attendanceData.program_name}\n`;
    summary += `Department: ${attendanceData.department_name}\n\n`;

    summary += `📈 OVERALL STATISTICS\n`;
    summary += `Overall Attendance: ${stats.overall_percentage.toFixed(1)}% (${stats.present_days}/${stats.total_days} days)\n`;
    summary += `Period Attendance: ${stats.period_percentage.toFixed(1)}% (${stats.attended_periods}/${stats.total_periods} periods)\n\n`;

    // Status indicator
    const status = stats.overall_percentage >= 75 ? '✅ Good Standing' :
                   stats.overall_percentage >= 60 ? '⚠️ Warning - Needs Improvement' :
                   '🚨 Critical - Below Required Standard';
    summary += `Status: ${status}\n\n`;

    // Course-wise breakdown (top 5 courses)
    if (stats.course_wise_stats.length > 0) {
      summary += `📚 TOP COURSES\n`;
      stats.course_wise_stats.slice(0, 5).forEach(course => {
        const courseStatus = course.percentage >= 75 ? '✅' : course.percentage >= 60 ? '⚠️' : '🚨';
        summary += `${courseStatus} ${course.course_code || course.course_name}: ${course.percentage.toFixed(1)}%\n`;
      });
      summary += '\n';
    }

    // Alerts
    if (stats.alerts.length > 0) {
      summary += `🚨 ALERTS\n`;
      stats.alerts.forEach(alert => {
        summary += `• ${alert.title}: ${alert.message}\n`;
      });
      summary += '\n';
    }

    return summary;
  }

  /**
   * Generate email body content
   */
  private static generateEmailBody(params: {
    attendanceData: LearnerAttendanceDetails;
    summary: string;
    message?: string;
    recipientName?: string;
    dateRange?: { from: string; to: string };
  }): string {
    const { attendanceData, summary, message, recipientName, dateRange } = params;

    let emailBody = '';

    if (recipientName) {
      emailBody += `Dear ${recipientName},\n\n`;
    } else {
      emailBody += `Dear Sir/Madam,\n\n`;
    }

    if (message) {
      emailBody += `${message}\n\n`;
    } else {
      emailBody += `Please find below the attendance report for ${attendanceData.student_name}.\n\n`;
    }

    if (dateRange) {
      emailBody += `Report Period: ${dateRange.from} to ${dateRange.to}\n\n`;
    }

    emailBody += summary;

    emailBody += `This report was generated on ${new Date().toLocaleString()}.\n\n`;
    emailBody += `For detailed records and analytics, please visit the student portal.\n\n`;
    emailBody += `Best regards,\n`;
    emailBody += `MyJKKN Student Portal\n`;
    emailBody += `https://my.jkkn.ac.in`;

    return emailBody;
  }

  /**
   * Generate shareable attendance card (for social media, etc.)
   */
  static async generateShareableCard(
    attendanceData: LearnerAttendanceDetails
  ): Promise<string> {
    const stats = attendanceData.attendance_stats;

    let card = `🎓 ${attendanceData.student_name}\n`;
    card += `📋 ${attendanceData.roll_number}\n`;
    card += `🏫 ${attendanceData.program_name}\n\n`;

    card += `📊 ATTENDANCE OVERVIEW\n`;
    card += `═══════════════════\n`;
    card += `📈 Overall: ${stats.overall_percentage.toFixed(1)}%\n`;
    card += `📚 Periods: ${stats.attended_periods}/${stats.total_periods}\n`;
    card += `📅 Days: ${stats.present_days}/${stats.total_days}\n\n`;

    const statusEmoji = stats.overall_percentage >= 75 ? '🟢' :
                        stats.overall_percentage >= 60 ? '🟡' : '🔴';
    card += `${statusEmoji} Status: ${stats.overall_percentage >= 75 ? 'Good' : stats.overall_percentage >= 60 ? 'Warning' : 'Critical'}\n\n`;

    card += `🔗 MyJKKN Student Portal`;

    return card;
  }

  /**
   * Share with parent/guardian via SMS/WhatsApp
   */
  static async shareWithParent(
    attendanceData: LearnerAttendanceDetails,
    parentContact: string,
    method: 'sms' | 'whatsapp' = 'whatsapp'
  ): Promise<void> {
    const stats = attendanceData.attendance_stats;

    let message = `📚 MyJKKN Attendance Update\n\n`;
    message += `Student: ${attendanceData.student_name}\n`;
    message += `Roll No: ${attendanceData.roll_number}\n\n`;
    message += `📊 Current Attendance: ${stats.overall_percentage.toFixed(1)}%\n`;
    message += `📅 Present Days: ${stats.present_days}/${stats.total_days}\n`;

    if (stats.overall_percentage < 75) {
      message += `\n⚠️ Attention: Attendance below required 75%`;
      if (stats.alerts.length > 0) {
        message += `\n📢 ${stats.alerts[0].message}`;
      }
    } else {
      message += `\n✅ Good attendance maintained`;
    }

    message += `\n\nFor detailed report, visit MyJKKN portal.`;

    if (method === 'whatsapp') {
      const whatsappUrl = `https://wa.me/${parentContact}?text=${encodeURIComponent(message)}`;
      window.open(whatsappUrl, '_blank');
    } else {
      const smsUrl = `sms:${parentContact}?body=${encodeURIComponent(message)}`;
      window.open(smsUrl);
    }
  }

  /**
   * Create downloadable attendance summary
   */
  static async createDownloadableSummary(
    attendanceData: LearnerAttendanceDetails,
    format: 'txt' | 'json' = 'txt'
  ): Promise<void> {
    let content: string;
    let fileName: string;
    let mimeType: string;

    if (format === 'json') {
      content = JSON.stringify(attendanceData, null, 2);
      fileName = `attendance_data_${attendanceData.roll_number}_${new Date().toISOString().split('T')[0]}.json`;
      mimeType = 'application/json';
    } else {
      content = this.generateAttendanceSummary(attendanceData);
      fileName = `attendance_summary_${attendanceData.roll_number}_${new Date().toISOString().split('T')[0]}.txt`;
      mimeType = 'text/plain';
    }

    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.click();

    URL.revokeObjectURL(url);
  }
}