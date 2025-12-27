// ============================================
// Student Widget Service
// Created: 2025-12-27
// Purpose: Fetch student-specific widget data for student portal dashboard
// ============================================

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { WidgetData } from '@/types/dashboard';

export class StudentWidgetService {
  /**
   * Get student profile widget data
   * Shows student name, roll number, and current status
   */
  static async getMyProfile(userId: string, config: Record<string, any>): Promise<WidgetData> {
    try {
      const supabase = await createServerSupabaseClient();

      // Get learner_id from profile
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('learner_id, full_name')
        .eq('id', userId)
        .single();

      if (profileError || !profile?.learner_id) {
        console.error('[StudentWidget] Profile query error:', profileError);
        return {
          value: 'No Profile',
          label: 'Student Profile',
          additionalInfo: {}
        };
      }

      // Get learner profile details
      const { data: learnerProfile, error: learnerError } = await supabase
        .from('learners_profiles')
        .select('first_name, last_name, roll_number, lifecycle_status, is_profile_complete')
        .eq('id', profile.learner_id)
        .single();

      if (learnerError || !learnerProfile) {
        console.error('[StudentWidget] Learner profile query error:', learnerError);
        return {
          value: profile.full_name || 'Unknown',
          label: 'Student Profile',
          additionalInfo: {}
        };
      }

      const fullName = `${learnerProfile.first_name} ${learnerProfile.last_name}`;
      const statusLabel = learnerProfile.lifecycle_status.charAt(0).toUpperCase() + learnerProfile.lifecycle_status.slice(1);

      return {
        value: fullName,
        label: learnerProfile.roll_number ? `Roll No: ${learnerProfile.roll_number}` : 'No Roll Number',
        additionalInfo: {
          'Status': statusLabel,
          'Profile Complete': learnerProfile.is_profile_complete ? 'Yes' : 'No'
        }
      };
    } catch (error) {
      console.error('[StudentWidget] getMyProfile error:', error);
      return {
        value: 'Error',
        label: 'Failed to load profile',
        additionalInfo: {}
      };
    }
  }

  /**
   * Get student attendance widget data
   * Shows attendance percentage for configurable period
   */
  static async getMyAttendance(userId: string, config: Record<string, any>): Promise<WidgetData> {
    try {
      const supabase = await createServerSupabaseClient();

      // Get learner_id from profile
      const { data: profile } = await supabase
        .from('profiles')
        .select('learner_id')
        .eq('id', userId)
        .single();

      if (!profile?.learner_id) {
        return {
          value: '0%',
          label: 'Attendance',
          additionalInfo: { 'Error': 'No student profile found' }
        };
      }

      // Calculate date range based on config (default: last 30 days)
      const period = config.period || 'last_30_days';
      const daysAgo = period === 'last_30_days' ? 30 : period === 'current_month' ? 30 : 30;

      const startDate = new Date();
      startDate.setDate(startDate.getDate() - daysAgo);

      // Query attendance records
      const { data: attendance, error } = await supabase
        .from('daily_attendance')
        .select('status, attendance_date')
        .eq('student_id', profile.learner_id)
        .gte('attendance_date', startDate.toISOString().split('T')[0]);

      if (error) {
        console.error('[StudentWidget] Attendance query error:', error);
        return {
          value: 'N/A',
          label: 'Attendance',
          additionalInfo: { 'Error': 'Failed to fetch attendance' }
        };
      }

      const total = attendance?.length || 0;
      const present = attendance?.filter(a => a.status === 'present').length || 0;
      const absent = attendance?.filter(a => a.status === 'absent').length || 0;
      const percentage = total > 0 ? Math.round((present / total) * 100) : 0;

      return {
        value: `${percentage}%`,
        label: `Attendance (Last ${daysAgo} Days)`,
        additionalInfo: {
          'Total Days': total,
          'Present': present,
          'Absent': absent
        },
        trend: percentage >= 75 ? { direction: 'up', percentage, period: `${daysAgo} days` } : { direction: 'down', percentage, period: `${daysAgo} days` }
      };
    } catch (error) {
      console.error('[StudentWidget] getMyAttendance error:', error);
      return {
        value: 'Error',
        label: 'Attendance',
        additionalInfo: {}
      };
    }
  }

  /**
   * Get student billing widget data
   * Shows pending fee amount and bill count
   */
  static async getMyFees(userId: string, config: Record<string, any>): Promise<WidgetData> {
    try {
      const supabase = await createServerSupabaseClient();

      // Get learner_id from profile
      const { data: profile } = await supabase
        .from('profiles')
        .select('learner_id')
        .eq('id', userId)
        .single();

      if (!profile?.learner_id) {
        return {
          value: '₹0',
          label: 'Fees Pending',
          additionalInfo: { 'Error': 'No student profile found' }
        };
      }

      // Query student bills
      const { data: bills, error } = await supabase
        .from('billing_student_bills')
        .select('bill_amount, bill_balance, bill_status')
        .eq('student_id', profile.learner_id);

      if (error) {
        console.error('[StudentWidget] Billing query error:', error);
        return {
          value: 'N/A',
          label: 'Fees',
          additionalInfo: { 'Error': 'Failed to fetch billing data' }
        };
      }

      const pendingBills = bills?.filter(b => b.bill_status === 'pending' || b.bill_status === 'partially_paid') || [];
      const totalPending = pendingBills.reduce((sum, bill) => sum + (bill.bill_balance || 0), 0);
      const totalAmount = bills?.reduce((sum, bill) => sum + (bill.bill_amount || 0), 0) || 0;
      const paidAmount = totalAmount - totalPending;

      const currency = config.currency || 'INR';
      const currencySymbol = currency === 'INR' ? '₹' : currency;

      return {
        value: `${currencySymbol}${totalPending.toLocaleString('en-IN')}`,
        label: 'Fees Pending',
        additionalInfo: {
          'Pending Bills': pendingBills.length,
          'Total Amount': `${currencySymbol}${totalAmount.toLocaleString('en-IN')}`,
          'Paid': `${currencySymbol}${paidAmount.toLocaleString('en-IN')}`
        }
      };
    } catch (error) {
      console.error('[StudentWidget] getMyFees error:', error);
      return {
        value: 'Error',
        label: 'Fees',
        additionalInfo: {}
      };
    }
  }

  /**
   * Get student timetable widget data
   * Shows today's classes
   */
  static async getMyTimetable(userId: string, config: Record<string, any>): Promise<WidgetData> {
    try {
      const supabase = await createServerSupabaseClient();

      // Get learner_id from profile
      const { data: profile } = await supabase
        .from('profiles')
        .select('learner_id')
        .eq('id', userId)
        .single();

      if (!profile?.learner_id) {
        return {
          value: 0,
          label: "Today's Classes",
          additionalInfo: { 'Error': 'No student profile found' }
        };
      }

      // Get student's section
      const { data: student } = await supabase
        .from('students')
        .select('section_id')
        .eq('learner_id', profile.learner_id)
        .single();

      if (!student?.section_id) {
        return {
          value: 0,
          label: "Today's Classes",
          additionalInfo: { 'Info': 'No section assigned' }
        };
      }

      // Get today's day of week (0 = Sunday, 1 = Monday, etc.)
      const today = new Date();
      const dayOfWeek = today.getDay();
      const dayName = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][dayOfWeek];

      // Query timetable for today
      const { data: timetable, error } = await supabase
        .from('timetable_slots')
        .select(`
          *,
          course:courses(course_name, course_code),
          staff:staff_profiles(first_name, last_name)
        `)
        .eq('section_id', student.section_id)
        .eq('day_of_week', dayName);

      if (error) {
        console.error('[StudentWidget] Timetable query error:', error);
        return {
          value: 0,
          label: "Today's Classes",
          additionalInfo: { 'Error': 'Failed to fetch timetable' }
        };
      }

      const classCount = timetable?.length || 0;

      // Find next class
      const currentTime = today.getHours() * 60 + today.getMinutes();
      const nextClass = timetable?.find(slot => {
        const [hours, minutes] = slot.start_time.split(':').map(Number);
        const slotTime = hours * 60 + minutes;
        return slotTime > currentTime;
      });

      return {
        value: classCount,
        label: "Today's Classes",
        additionalInfo: {
          'Next Class': nextClass ? `${nextClass.course?.course_name} at ${nextClass.start_time}` : 'No more classes',
          'Day': dayName.charAt(0).toUpperCase() + dayName.slice(1)
        },
        tableData: timetable?.map(slot => ({
          time: `${slot.start_time} - ${slot.end_time}`,
          course: slot.course?.course_name || 'N/A',
          code: slot.course?.course_code || 'N/A',
          staff: slot.staff ? `${slot.staff.first_name} ${slot.staff.last_name}` : 'TBA'
        }))
      };
    } catch (error) {
      console.error('[StudentWidget] getMyTimetable error:', error);
      return {
        value: 0,
        label: "Today's Classes",
        additionalInfo: {}
      };
    }
  }

  /**
   * Get student results widget data
   * Shows latest exam results
   */
  static async getMyResults(userId: string, config: Record<string, any>): Promise<WidgetData> {
    try {
      const supabase = await createServerSupabaseClient();

      // Get learner_id from profile
      const { data: profile } = await supabase
        .from('profiles')
        .select('learner_id')
        .eq('id', userId)
        .single();

      if (!profile?.learner_id) {
        return {
          value: 'N/A',
          label: 'Results',
          additionalInfo: { 'Error': 'No student profile found' }
        };
      }

      // Placeholder - would query actual results table when available
      return {
        value: 'Coming Soon',
        label: 'Exam Results',
        additionalInfo: {
          'Info': 'Results module under development'
        }
      };
    } catch (error) {
      console.error('[StudentWidget] getMyResults error:', error);
      return {
        value: 'Error',
        label: 'Results',
        additionalInfo: {}
      };
    }
  }

  /**
   * Get student announcements widget data
   * Shows recent announcements
   */
  static async getAnnouncements(userId: string, config: Record<string, any>): Promise<WidgetData> {
    try {
      const supabase = await createServerSupabaseClient();

      // Get learner_id and institution_id from profile
      const { data: profile } = await supabase
        .from('profiles')
        .select('learner_id, institution_id')
        .eq('id', userId)
        .single();

      if (!profile) {
        return {
          value: 0,
          label: 'Announcements',
          additionalInfo: { 'Error': 'No profile found' }
        };
      }

      // Placeholder - would query actual announcements table when available
      return {
        value: 0,
        label: 'Announcements',
        additionalInfo: {
          'Info': 'No new announcements'
        },
        tableData: []
      };
    } catch (error) {
      console.error('[StudentWidget] getAnnouncements error:', error);
      return {
        value: 0,
        label: 'Announcements',
        additionalInfo: {}
      };
    }
  }
}
