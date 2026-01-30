# Personalized Dashboard System Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a role-based personalized dashboard system with customizable widgets, celebration cards (birthdays/work anniversaries), responsive charts, and hide/show preferences for Student, Faculty, HOD/Principal, and Admin roles.

**Architecture:** Component-based routing with separate dashboard components per role. Server Components fetch initial data, React Query handles client-side updates and caching. Widget visibility managed via database preferences table with optimistic updates. Recharts for mobile-responsive data visualization.

**Tech Stack:** Next.js 14 App Router, React Query, Framer Motion, Recharts, Supabase (PostgreSQL), shadcn/ui, TypeScript, Zod

---

## Phase 1: Database Schema & Migrations

### Task 1.1: Create Dashboard Tables Migration

**Files:**
- Create: `supabase/migrations/20260130140000_create_dashboard_tables.sql`

**Step 1: Write migration for dashboard tables**

```sql
-- Create user_dashboard_preferences table
CREATE TABLE IF NOT EXISTS user_dashboard_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  widget_id TEXT NOT NULL,
  is_visible BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(user_id, role, widget_id)
);

-- Create index for fast lookups
CREATE INDEX idx_dashboard_prefs_user_role ON user_dashboard_preferences(user_id, role);

-- Create dashboard_widgets registry table
CREATE TABLE IF NOT EXISTS dashboard_widgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  widget_id TEXT UNIQUE NOT NULL,
  role TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL,
  default_visible BOOLEAN DEFAULT true,
  display_order INTEGER DEFAULT 0,
  required_permission TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Create index for filtering by role
CREATE INDEX idx_widgets_role ON dashboard_widgets(role);

-- Enable RLS
ALTER TABLE user_dashboard_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE dashboard_widgets ENABLE ROW LEVEL SECURITY;

-- RLS Policies for user_dashboard_preferences
CREATE POLICY "Users can view own preferences"
  ON user_dashboard_preferences
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own preferences"
  ON user_dashboard_preferences
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own preferences"
  ON user_dashboard_preferences
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own preferences"
  ON user_dashboard_preferences
  FOR DELETE
  USING (auth.uid() = user_id);

-- RLS Policies for dashboard_widgets (read-only for all authenticated users)
CREATE POLICY "Authenticated users can view widgets"
  ON dashboard_widgets
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- Add updated_at trigger
CREATE TRIGGER update_dashboard_preferences_updated_at
  BEFORE UPDATE ON user_dashboard_preferences
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
```

**Step 2: Apply migration**

Run: `cd supabase && npx supabase db push`
Expected: Migration applied successfully

**Step 3: Commit**

```bash
git add supabase/migrations/20260130140000_create_dashboard_tables.sql
git commit -m "feat(dashboard): add dashboard preferences and widgets tables

- Create user_dashboard_preferences for widget visibility
- Create dashboard_widgets registry
- Add RLS policies for secure access
- Add indexes for performance"
```

---

### Task 1.2: Seed Dashboard Widgets Data

**Files:**
- Create: `supabase/seed/dashboard_widgets_seed.sql`

**Step 1: Write seed data for all role widgets**

```sql
-- Student Widgets
INSERT INTO dashboard_widgets (widget_id, role, title, description, category, default_visible, display_order) VALUES
  ('student_attendance', 'student', 'My Attendance', 'Overall attendance percentage and stats', 'Academic', true, 1),
  ('student_timetable_today', 'student', 'Today''s Classes', 'Your class schedule for today', 'Academic', true, 2),
  ('student_billing', 'student', 'Fee Summary', 'Your fee payment status and outstanding balance', 'Finance', true, 3),
  ('celebrations_today', 'student', 'Today''s Celebrations', 'Birthdays and work anniversaries today', 'Community', true, 4),
  ('my_celebration_countdown', 'student', 'My Next Milestone', 'Countdown to your next birthday', 'Personal', true, 5)
ON CONFLICT (widget_id) DO NOTHING;

-- Faculty Widgets
INSERT INTO dashboard_widgets (widget_id, role, title, description, category, default_visible, display_order) VALUES
  ('faculty_classes_today', 'faculty', 'Today''s Teaching Schedule', 'Classes you are teaching today', 'Academic', true, 1),
  ('faculty_pending_attendance', 'faculty', 'Pending Attendance', 'Classes where attendance needs to be marked', 'Academic', true, 2),
  ('faculty_students_overview', 'faculty', 'My Students', 'Overview of students you teach', 'Academic', true, 3),
  ('faculty_leave_approvals', 'faculty', 'Pending Approvals', 'Leave requests awaiting your approval', 'Management', true, 4),
  ('celebrations_today', 'faculty', 'Today''s Celebrations', 'Birthdays and work anniversaries today', 'Community', true, 5),
  ('celebrations_upcoming', 'faculty', 'Upcoming Celebrations', 'Celebrations in the next 7 days', 'Community', true, 6),
  ('my_celebration_countdown', 'faculty', 'My Next Milestone', 'Countdown to your next celebration', 'Personal', true, 7)
ON CONFLICT (widget_id) DO NOTHING;

-- HOD Widgets
INSERT INTO dashboard_widgets (widget_id, role, title, description, category, default_visible, display_order) VALUES
  ('leadership_overview', 'hod', 'Department Overview', 'Total students, staff, and sections', 'Overview', true, 1),
  ('leadership_attendance_today', 'hod', 'Today''s Attendance', 'Department-wide attendance summary for today', 'Academic', true, 2),
  ('leadership_pending_approvals', 'hod', 'Pending Approvals', 'All pending approvals across modules', 'Management', true, 3),
  ('celebrations_today', 'hod', 'Today''s Celebrations', 'Birthdays and work anniversaries today', 'Community', true, 4),
  ('celebrations_upcoming', 'hod', 'Upcoming Celebrations', 'Celebrations in the next 7 days', 'Community', true, 5)
ON CONFLICT (widget_id) DO NOTHING;

-- Principal Widgets
INSERT INTO dashboard_widgets (widget_id, role, title, description, category, default_visible, display_order) VALUES
  ('leadership_overview', 'principal', 'Institution Overview', 'Total students, staff, and sections', 'Overview', true, 1),
  ('leadership_attendance_today', 'principal', 'Today''s Attendance', 'Institution-wide attendance summary for today', 'Academic', true, 2),
  ('leadership_pending_approvals', 'principal', 'Pending Approvals', 'All pending approvals across modules', 'Management', true, 3),
  ('celebrations_today', 'principal', 'Today''s Celebrations', 'Birthdays and work anniversaries today', 'Community', true, 4),
  ('celebrations_upcoming', 'principal', 'Upcoming Celebrations', 'Celebrations in the next 7 days', 'Community', true, 5)
ON CONFLICT (widget_id) DO NOTHING;

-- Admin Widgets
INSERT INTO dashboard_widgets (widget_id, role, title, description, category, default_visible, display_order) VALUES
  ('admin_system_overview', 'super_admin', 'System Overview', 'Total institutions, users, students, and staff', 'System', true, 1),
  ('admin_recent_activity', 'super_admin', 'Recent Activity', 'Latest system activities and events', 'System', true, 2),
  ('admin_at_risk_students', 'super_admin', 'At-Risk Students', 'Students requiring attention system-wide', 'Analytics', true, 3),
  ('celebrations_today', 'super_admin', 'Today''s Celebrations', 'Birthdays and work anniversaries across all institutions', 'Community', true, 4),
  ('celebrations_upcoming', 'super_admin', 'Upcoming Celebrations', 'Celebrations in the next 7 days', 'Community', true, 5)
ON CONFLICT (widget_id) DO NOTHING;

-- Administrator role (same as super_admin)
INSERT INTO dashboard_widgets (widget_id, role, title, description, category, default_visible, display_order)
SELECT widget_id, 'administrator', title, description, category, default_visible, display_order
FROM dashboard_widgets WHERE role = 'super_admin'
ON CONFLICT (widget_id) DO NOTHING;
```

**Step 2: Run seed script**

Run: `psql -h <supabase-host> -U postgres -d postgres -f supabase/seed/dashboard_widgets_seed.sql`
Expected: INSERT statements execute successfully

**Step 3: Commit**

```bash
git add supabase/seed/dashboard_widgets_seed.sql
git commit -m "feat(dashboard): seed dashboard widget registry

- Add student widgets (5 widgets)
- Add faculty widgets (7 widgets)
- Add leadership widgets for HOD/Principal (5 widgets each)
- Add admin widgets (5 widgets)"
```

---

## Phase 2: Service Layer - Celebrations

### Task 2.1: Create Celebration Service

**Files:**
- Create: `lib/services/dashboard/celebration-service.ts`

**Step 1: Write celebration service with TypeScript types**

```typescript
import { createClientSupabaseClient } from '@/lib/supabase/client';

export interface Celebration {
  id: string;
  name: string;
  type: 'birthday' | 'work_anniversary';
  date: string;
  age?: number;
  years?: number;
  role: string;
  department?: string;
  institution?: string;
  avatar_url?: string;
  days_until: number;
}

export interface TodayCelebrations {
  birthdays: Celebration[];
  workAnniversaries: Celebration[];
}

export class CelebrationService {
  /**
   * Get today's celebrations (birthdays + work anniversaries)
   * Scoped by institution for multi-tenancy
   */
  static async getTodayCelebrations(
    userId: string,
    role: string
  ): Promise<TodayCelebrations> {
    const supabase = createClientSupabaseClient();

    // Get user's institution for scoping
    const { data: userProfile } = await supabase
      .from('profiles')
      .select('institution_id, department_id')
      .eq('id', userId)
      .single();

    if (!userProfile) {
      return { birthdays: [], workAnniversaries: [] };
    }

    const today = new Date();
    const todayMonth = today.getMonth() + 1;
    const todayDay = today.getDate();

    const birthdays: Celebration[] = [];

    // Get staff birthdays
    const { data: staffBirthdays } = await supabase
      .from('staff')
      .select('id, full_name, date_of_birth, avatar_url, department_id, staff_category')
      .eq('institution_id', userProfile.institution_id)
      .not('date_of_birth', 'is', null);

    if (staffBirthdays) {
      staffBirthdays.forEach((staff) => {
        const dob = new Date(staff.date_of_birth!);
        if (dob.getMonth() + 1 === todayMonth && dob.getDate() === todayDay) {
          const age = today.getFullYear() - dob.getFullYear();
          birthdays.push({
            id: staff.id,
            name: staff.full_name,
            type: 'birthday',
            date: staff.date_of_birth!,
            age,
            role: staff.staff_category || 'Staff',
            avatar_url: staff.avatar_url,
            days_until: 0
          });
        }
      });
    }

    // Get student birthdays (only if faculty/admin)
    if (role !== 'student') {
      const { data: studentBirthdays } = await supabase
        .from('learners_profiles')
        .select('id, full_name, date_of_birth, avatar_url, section_id')
        .eq('institution_id', userProfile.institution_id)
        .eq('lifecycle_status', 'active')
        .not('date_of_birth', 'is', null);

      if (studentBirthdays) {
        studentBirthdays.forEach((student) => {
          const dob = new Date(student.date_of_birth!);
          if (dob.getMonth() + 1 === todayMonth && dob.getDate() === todayDay) {
            const age = today.getFullYear() - dob.getFullYear();
            birthdays.push({
              id: student.id,
              name: student.full_name,
              type: 'birthday',
              date: student.date_of_birth!,
              age,
              role: 'Student',
              avatar_url: student.avatar_url,
              days_until: 0
            });
          }
        });
      }
    }

    // Get work anniversaries (staff only)
    const workAnniversaries: Celebration[] = [];

    const { data: staffAnniversaries } = await supabase
      .from('staff')
      .select('id, full_name, joining_date, avatar_url, staff_category')
      .eq('institution_id', userProfile.institution_id)
      .not('joining_date', 'is', null);

    if (staffAnniversaries) {
      staffAnniversaries.forEach((staff) => {
        const joinDate = new Date(staff.joining_date!);
        if (joinDate.getMonth() + 1 === todayMonth && joinDate.getDate() === todayDay) {
          const years = today.getFullYear() - joinDate.getFullYear();
          if (years > 0) {
            workAnniversaries.push({
              id: staff.id,
              name: staff.full_name,
              type: 'work_anniversary',
              date: staff.joining_date!,
              years,
              role: staff.staff_category || 'Staff',
              avatar_url: staff.avatar_url,
              days_until: 0
            });
          }
        }
      });
    }

    return { birthdays, workAnniversaries };
  }

  /**
   * Get upcoming celebrations in next N days
   */
  static async getUpcomingCelebrations(
    institutionId: string,
    days: number = 7
  ): Promise<Celebration[]> {
    const supabase = createClientSupabaseClient();
    const celebrations: Celebration[] = [];
    const today = new Date();

    const { data: staff } = await supabase
      .from('staff')
      .select('id, full_name, date_of_birth, joining_date, avatar_url, staff_category')
      .eq('institution_id', institutionId);

    if (staff) {
      staff.forEach((person) => {
        // Check birthday
        if (person.date_of_birth) {
          const dob = new Date(person.date_of_birth);
          const thisYearBirthday = new Date(today.getFullYear(), dob.getMonth(), dob.getDate());
          const daysUntil = Math.ceil((thisYearBirthday.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

          if (daysUntil > 0 && daysUntil <= days) {
            celebrations.push({
              id: person.id,
              name: person.full_name,
              type: 'birthday',
              date: person.date_of_birth,
              age: today.getFullYear() - dob.getFullYear(),
              role: person.staff_category || 'Staff',
              avatar_url: person.avatar_url,
              days_until: daysUntil
            });
          }
        }

        // Check work anniversary
        if (person.joining_date) {
          const joinDate = new Date(person.joining_date);
          const thisYearAnniversary = new Date(today.getFullYear(), joinDate.getMonth(), joinDate.getDate());
          const daysUntil = Math.ceil((thisYearAnniversary.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
          const years = today.getFullYear() - joinDate.getFullYear();

          if (daysUntil > 0 && daysUntil <= days && years > 0) {
            celebrations.push({
              id: person.id,
              name: person.full_name,
              type: 'work_anniversary',
              date: person.joining_date,
              years,
              role: person.staff_category || 'Staff',
              avatar_url: person.avatar_url,
              days_until: daysUntil
            });
          }
        }
      });
    }

    return celebrations.sort((a, b) => a.days_until - b.days_until);
  }

  /**
   * Get user's next celebration
   */
  static async getMyNextCelebration(userId: string): Promise<Celebration | null> {
    const supabase = createClientSupabaseClient();

    const { data: profile } = await supabase
      .from('profiles')
      .select('role, institution_id')
      .eq('id', userId)
      .single();

    if (!profile) return null;

    const today = new Date();
    const celebrations: Celebration[] = [];

    if (profile.role === 'student') {
      const { data: student } = await supabase
        .from('learners_profiles')
        .select('id, full_name, date_of_birth')
        .eq('profile_id', userId)
        .single();

      if (student?.date_of_birth) {
        const dob = new Date(student.date_of_birth);
        const thisYearBirthday = new Date(today.getFullYear(), dob.getMonth(), dob.getDate());
        let daysUntil = Math.ceil((thisYearBirthday.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

        if (daysUntil < 0) {
          const nextYearBirthday = new Date(today.getFullYear() + 1, dob.getMonth(), dob.getDate());
          daysUntil = Math.ceil((nextYearBirthday.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        }

        celebrations.push({
          id: student.id,
          name: student.full_name,
          type: 'birthday',
          date: student.date_of_birth,
          age: today.getFullYear() - dob.getFullYear(),
          role: 'Student',
          days_until: daysUntil
        });
      }
    } else {
      const { data: staff } = await supabase
        .from('staff')
        .select('id, full_name, date_of_birth, joining_date, staff_category')
        .eq('profile_id', userId)
        .single();

      if (staff) {
        if (staff.date_of_birth) {
          const dob = new Date(staff.date_of_birth);
          const thisYearBirthday = new Date(today.getFullYear(), dob.getMonth(), dob.getDate());
          let daysUntil = Math.ceil((thisYearBirthday.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

          if (daysUntil < 0) {
            const nextYearBirthday = new Date(today.getFullYear() + 1, dob.getMonth(), dob.getDate());
            daysUntil = Math.ceil((nextYearBirthday.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
          }

          celebrations.push({
            id: staff.id,
            name: staff.full_name,
            type: 'birthday',
            date: staff.date_of_birth,
            age: today.getFullYear() - dob.getFullYear(),
            role: staff.staff_category || 'Staff',
            days_until: daysUntil
          });
        }

        if (staff.joining_date) {
          const joinDate = new Date(staff.joining_date);
          const thisYearAnniversary = new Date(today.getFullYear(), joinDate.getMonth(), joinDate.getDate());
          let daysUntil = Math.ceil((thisYearAnniversary.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
          const years = today.getFullYear() - joinDate.getFullYear();

          if (daysUntil < 0) {
            const nextYearAnniversary = new Date(today.getFullYear() + 1, joinDate.getMonth(), joinDate.getDate());
            daysUntil = Math.ceil((nextYearAnniversary.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
          }

          if (years > 0) {
            celebrations.push({
              id: staff.id,
              name: staff.full_name,
              type: 'work_anniversary',
              date: staff.joining_date,
              years,
              role: staff.staff_category || 'Staff',
              days_until: daysUntil
            });
          }
        }
      }
    }

    if (celebrations.length === 0) return null;
    return celebrations.sort((a, b) => a.days_until - b.days_until)[0];
  }
}
```

**Step 2: Commit**

```bash
git add lib/services/dashboard/celebration-service.ts
git commit -m "feat(dashboard): add celebration service

- Get today's birthdays and work anniversaries
- Get upcoming celebrations (next N days)
- Get user's next celebration
- Multi-tenant scoping by institution
- Support for both staff and students"
```

---

### Task 2.2: Create Student Dashboard Service

**Files:**
- Create: `lib/services/dashboard/student-dashboard-service.ts`

**Step 1: Write student dashboard service**

```typescript
import { createClientSupabaseClient } from '@/lib/supabase/client';

export interface StudentAttendanceSummary {
  percentage: number;
  present: number;
  absent: number;
  late: number;
  total: number;
}

export interface StudentTimetableToday {
  period_id: string;
  period_name: string;
  course_name: string;
  course_code: string;
  faculty_name: string;
  room: string;
  start_time: string;
  end_time: string;
}

export interface StudentBillingSummary {
  total_fees: number;
  paid_amount: number;
  outstanding_balance: number;
  overdue_count: number;
  next_due_date?: string;
}

export class StudentDashboardService {
  /**
   * Get student attendance summary
   */
  static async getAttendanceSummary(studentId: string): Promise<StudentAttendanceSummary> {
    const supabase = createClientSupabaseClient();

    const { data, error } = await supabase
      .from('daily_attendance')
      .select('status')
      .eq('student_id', studentId);

    if (error || !data) {
      return { percentage: 0, present: 0, absent: 0, late: 0, total: 0 };
    }

    const stats = {
      present: data.filter(d => d.status === 'present').length,
      absent: data.filter(d => d.status === 'absent').length,
      late: data.filter(d => d.status === 'late').length,
      total: data.length
    };

    const percentage = stats.total > 0 ? (stats.present / stats.total) * 100 : 0;

    return { ...stats, percentage };
  }

  /**
   * Get today's timetable for student
   */
  static async getTimetableToday(
    studentId: string,
    sectionId: string
  ): Promise<StudentTimetableToday[]> {
    const supabase = createClientSupabaseClient();
    const today = new Date().toLocaleDateString('en-US', { weekday: 'long' });

    const { data, error } = await supabase
      .from('timetable_slots')
      .select(`
        period_id,
        periods (name, start_time, end_time),
        courses (name, code),
        staff (full_name),
        room
      `)
      .eq('section_id', sectionId)
      .eq('day_of_week', today)
      .order('periods(start_time)');

    if (error || !data) return [];

    return data.map(slot => ({
      period_id: slot.period_id,
      period_name: (slot.periods as any)?.name || '',
      course_name: (slot.courses as any)?.name || '',
      course_code: (slot.courses as any)?.code || '',
      faculty_name: (slot.staff as any)?.full_name || 'TBA',
      room: slot.room || 'TBA',
      start_time: (slot.periods as any)?.start_time || '',
      end_time: (slot.periods as any)?.end_time || ''
    }));
  }

  /**
   * Get student billing summary
   */
  static async getBillingSummary(studentId: string): Promise<StudentBillingSummary> {
    const supabase = createClientSupabaseClient();

    const { data: bills } = await supabase
      .from('billing_student_bills')
      .select('total_amount, paid_amount, due_date, status')
      .eq('student_id', studentId);

    if (!bills || bills.length === 0) {
      return {
        total_fees: 0,
        paid_amount: 0,
        outstanding_balance: 0,
        overdue_count: 0
      };
    }

    const total_fees = bills.reduce((sum, bill) => sum + (bill.total_amount || 0), 0);
    const paid_amount = bills.reduce((sum, bill) => sum + (bill.paid_amount || 0), 0);
    const outstanding_balance = total_fees - paid_amount;

    const today = new Date();
    const overdue_count = bills.filter(bill =>
      bill.status === 'pending' &&
      bill.due_date &&
      new Date(bill.due_date) < today
    ).length;

    const upcomingBill = bills
      .filter(bill => bill.status === 'pending' && bill.due_date)
      .sort((a, b) => new Date(a.due_date!).getTime() - new Date(b.due_date!).getTime())[0];

    return {
      total_fees,
      paid_amount,
      outstanding_balance,
      overdue_count,
      next_due_date: upcomingBill?.due_date
    };
  }
}
```

**Step 2: Commit**

```bash
git add lib/services/dashboard/student-dashboard-service.ts
git commit -m "feat(dashboard): add student dashboard service

- Get attendance summary with percentage calculation
- Get today's timetable with period details
- Get billing summary with outstanding balance
- Support for overdue detection and next due date"
```

---

### Task 2.3: Create Dashboard Preferences Service

**Files:**
- Create: `lib/services/dashboard/dashboard-preferences-service.ts`

**Step 1: Write preferences service**

```typescript
import { createClientSupabaseClient } from '@/lib/supabase/client';

export interface DashboardPreference {
  widget_id: string;
  is_visible: boolean;
}

export class DashboardPreferencesService {
  /**
   * Get user's dashboard preferences for their current role
   */
  static async getPreferences(
    userId: string,
    role: string
  ): Promise<Record<string, boolean>> {
    const supabase = createClientSupabaseClient();

    const { data, error } = await supabase
      .from('user_dashboard_preferences')
      .select('widget_id, is_visible')
      .eq('user_id', userId)
      .eq('role', role);

    if (error || !data) return {};

    return data.reduce((acc, pref) => {
      acc[pref.widget_id] = pref.is_visible;
      return acc;
    }, {} as Record<string, boolean>);
  }

  /**
   * Update widget visibility preference
   */
  static async updatePreference(
    userId: string,
    role: string,
    widgetId: string,
    isVisible: boolean
  ): Promise<void> {
    const supabase = createClientSupabaseClient();

    const { error } = await supabase
      .from('user_dashboard_preferences')
      .upsert({
        user_id: userId,
        role,
        widget_id: widgetId,
        is_visible: isVisible,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'user_id,role,widget_id'
      });

    if (error) {
      console.error('[DashboardPreferences] Update failed:', error);
      throw error;
    }
  }

  /**
   * Reset all preferences to default
   */
  static async resetPreferences(userId: string, role: string): Promise<void> {
    const supabase = createClientSupabaseClient();

    const { error } = await supabase
      .from('user_dashboard_preferences')
      .delete()
      .eq('user_id', userId)
      .eq('role', role);

    if (error) {
      console.error('[DashboardPreferences] Reset failed:', error);
      throw error;
    }
  }
}
```

**Step 2: Commit**

```bash
git add lib/services/dashboard/dashboard-preferences-service.ts
git commit -m "feat(dashboard): add preferences service

- Get user widget visibility preferences
- Update individual widget visibility
- Reset all preferences to defaults
- Upsert logic for preference updates"
```

---

## Phase 3: React Query Hooks

### Task 3.1: Create Celebration Hooks

**Files:**
- Create: `hooks/dashboard/use-celebrations.ts`

**Step 1: Write celebration hooks**

```typescript
import { useQuery, UseQueryResult } from '@tanstack/react-query';
import {
  Celebration,
  TodayCelebrations,
  CelebrationService
} from '@/lib/services/dashboard/celebration-service';

/**
 * Get today's celebrations (birthdays + work anniversaries)
 */
export function useCelebrationsToday(
  userId: string | null,
  role: string | null
): UseQueryResult<TodayCelebrations, Error> {
  return useQuery({
    queryKey: ['celebrations-today', userId, role],
    queryFn: async () => {
      if (!userId || !role) throw new Error('User ID and role required');
      return CelebrationService.getTodayCelebrations(userId, role);
    },
    enabled: !!userId && !!role,
    staleTime: 15 * 60 * 1000, // 15 minutes
    refetchOnMount: true,
  });
}

/**
 * Get upcoming celebrations in next N days
 */
export function useUpcomingCelebrations(
  institutionId: string | null,
  days: number = 7
): UseQueryResult<Celebration[], Error> {
  return useQuery({
    queryKey: ['celebrations-upcoming', institutionId, days],
    queryFn: async () => {
      if (!institutionId) throw new Error('Institution ID required');
      return CelebrationService.getUpcomingCelebrations(institutionId, days);
    },
    enabled: !!institutionId,
    staleTime: 30 * 60 * 1000, // 30 minutes
  });
}

/**
 * Get user's next celebration
 */
export function useMyCelebration(
  userId: string | null
): UseQueryResult<Celebration | null, Error> {
  return useQuery({
    queryKey: ['my-celebration', userId],
    queryFn: async () => {
      if (!userId) throw new Error('User ID required');
      return CelebrationService.getMyNextCelebration(userId);
    },
    enabled: !!userId,
    staleTime: 60 * 60 * 1000, // 1 hour
  });
}
```

**Step 2: Commit**

```bash
git add hooks/dashboard/use-celebrations.ts
git commit -m "feat(dashboard): add celebration React Query hooks

- useCelebrationsToday for birthdays/anniversaries today
- useUpcomingCelebrations for next N days
- useMyCelebration for user's next milestone
- Appropriate stale times for caching"
```

---

### Task 3.2: Create Student Dashboard Hooks

**Files:**
- Create: `hooks/dashboard/use-student-dashboard.ts`

**Step 1: Write student dashboard hooks**

```typescript
import { useQuery, UseQueryResult } from '@tanstack/react-query';
import {
  StudentAttendanceSummary,
  StudentTimetableToday,
  StudentBillingSummary,
  StudentDashboardService
} from '@/lib/services/dashboard/student-dashboard-service';

/**
 * Get student attendance summary
 */
export function useStudentAttendance(
  studentId: string | null
): UseQueryResult<StudentAttendanceSummary, Error> {
  return useQuery({
    queryKey: ['student-attendance-summary', studentId],
    queryFn: async () => {
      if (!studentId) throw new Error('Student ID required');
      return StudentDashboardService.getAttendanceSummary(studentId);
    },
    enabled: !!studentId,
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: true,
  });
}

/**
 * Get today's timetable for student
 */
export function useStudentTimetableToday(
  studentId: string | null,
  sectionId: string | null
): UseQueryResult<StudentTimetableToday[], Error> {
  return useQuery({
    queryKey: ['student-timetable-today', studentId, sectionId],
    queryFn: async () => {
      if (!studentId || !sectionId) throw new Error('Student ID and Section ID required');
      return StudentDashboardService.getTimetableToday(studentId, sectionId);
    },
    enabled: !!studentId && !!sectionId,
    staleTime: 1 * 60 * 1000, // 1 minute
    refetchInterval: 5 * 60 * 1000, // Auto-refresh every 5 minutes
  });
}

/**
 * Get student billing summary
 */
export function useStudentBilling(
  studentId: string | null
): UseQueryResult<StudentBillingSummary, Error> {
  return useQuery({
    queryKey: ['student-billing-summary', studentId],
    queryFn: async () => {
      if (!studentId) throw new Error('Student ID required');
      return StudentDashboardService.getBillingSummary(studentId);
    },
    enabled: !!studentId,
    staleTime: 10 * 60 * 1000, // 10 minutes
  });
}
```

**Step 2: Commit**

```bash
git add hooks/dashboard/use-student-dashboard.ts
git commit -m "feat(dashboard): add student dashboard hooks

- useStudentAttendance with auto-refetch on focus
- useStudentTimetableToday with 5min auto-refresh
- useStudentBilling with 10min stale time
- Proper enabled/disabled logic based on params"
```

---

### Task 3.3: Create Dashboard Preferences Hooks

**Files:**
- Create: `hooks/dashboard/use-dashboard-preferences.ts`

**Step 1: Write preferences hooks with optimistic updates**

```typescript
import { useQuery, useMutation, useQueryClient, UseQueryResult } from '@tanstack/react-query';
import { DashboardPreferencesService } from '@/lib/services/dashboard/dashboard-preferences-service';
import { toast } from 'react-hot-toast';

/**
 * Get user's dashboard widget preferences
 */
export function useDashboardPreferences(
  userId: string | null,
  role: string | null
): UseQueryResult<Record<string, boolean>, Error> {
  return useQuery({
    queryKey: ['dashboard-preferences', userId, role],
    queryFn: async () => {
      if (!userId || !role) throw new Error('User ID and role required');
      return DashboardPreferencesService.getPreferences(userId, role);
    },
    enabled: !!userId && !!role,
    staleTime: Infinity, // Preferences rarely change
  });
}

/**
 * Update widget visibility preference
 */
export function useUpdatePreference() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      userId,
      role,
      widgetId,
      isVisible
    }: {
      userId: string;
      role: string;
      widgetId: string;
      isVisible: boolean;
    }) => {
      return DashboardPreferencesService.updatePreference(
        userId,
        role,
        widgetId,
        isVisible
      );
    },
    onMutate: async ({ userId, role, widgetId, isVisible }) => {
      // Optimistic update
      const queryKey = ['dashboard-preferences', userId, role];
      await queryClient.cancelQueries({ queryKey });

      const previousPreferences = queryClient.getQueryData<Record<string, boolean>>(queryKey);

      queryClient.setQueryData<Record<string, boolean>>(queryKey, (old) => ({
        ...old,
        [widgetId]: isVisible
      }));

      return { previousPreferences };
    },
    onError: (err, variables, context) => {
      // Rollback on error
      if (context?.previousPreferences) {
        queryClient.setQueryData(
          ['dashboard-preferences', variables.userId, variables.role],
          context.previousPreferences
        );
      }
      toast.error('Failed to update preference');
    },
    onSuccess: () => {
      toast.success('Dashboard updated');
    },
  });
}

/**
 * Reset all preferences to default
 */
export function useResetPreferences() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: string }) => {
      return DashboardPreferencesService.resetPreferences(userId, role);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['dashboard-preferences', variables.userId, variables.role]
      });
      toast.success('Dashboard reset to defaults');
    },
    onError: () => {
      toast.error('Failed to reset preferences');
    },
  });
}
```

**Step 2: Commit**

```bash
git add hooks/dashboard/use-dashboard-preferences.ts
git commit -m "feat(dashboard): add preferences hooks with optimistic updates

- useDashboardPreferences for fetching preferences
- useUpdatePreference with optimistic UI updates
- useResetPreferences for resetting to defaults
- Rollback on error with toast notifications"
```

---

## Phase 4: Widget Components

### Task 4.1: Create Widget Container Component

**Files:**
- Create: `app/(routes)/dashboard/_components/widgets/shared/widget-container.tsx`

**Step 1: Write reusable widget container**

```typescript
'use client';

import { motion } from 'framer-motion';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { LucideIcon } from 'lucide-react';

interface WidgetContainerProps {
  widgetId: string;
  title: string;
  description?: string;
  icon?: LucideIcon;
  iconColor?: string;
  isVisible?: boolean;
  className?: string;
  children: React.ReactNode;
  onClick?: () => void;
  loading?: boolean;
  span?: 'single' | 'double';
}

export function WidgetContainer({
  widgetId,
  title,
  description,
  icon: Icon,
  iconColor = 'text-primary',
  isVisible = true,
  className,
  children,
  onClick,
  loading,
  span = 'single'
}: WidgetContainerProps) {
  if (!isVisible) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={cn(
        'h-full',
        span === 'double' && 'col-span-1 sm:col-span-2',
        className
      )}
    >
      <Card
        className={cn(
          'h-full hover:shadow-lg transition-all duration-300 group',
          'glass-card glass-card-hover border-l-4 border-l-primary/50',
          onClick && 'cursor-pointer hover:border-l-primary'
        )}
        onClick={onClick}
      >
        <CardHeader className='pb-2 sm:pb-4'>
          <div className='flex items-start justify-between gap-2'>
            <div className='flex items-center gap-2 flex-1 min-w-0'>
              {Icon && (
                <div className={cn('p-2 rounded-lg bg-primary/10 flex-shrink-0', iconColor)}>
                  <Icon className='h-4 w-4 sm:h-5 sm:w-5' />
                </div>
              )}
              <div className='flex-1 min-w-0'>
                <CardTitle className='text-sm sm:text-base lg:text-lg truncate'>
                  {title}
                </CardTitle>
                {description && (
                  <CardDescription className='text-xs sm:text-sm mt-1 line-clamp-1'>
                    {description}
                  </CardDescription>
                )}
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className='pt-0'>
          {loading ? (
            <div className='flex items-center justify-center py-8'>
              <div className='animate-spin rounded-full h-8 w-8 border-b-2 border-primary' />
            </div>
          ) : (
            children
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
```

**Step 2: Commit**

```bash
git add app/(routes)/dashboard/_components/widgets/shared/widget-container.tsx
git commit -m "feat(dashboard): add reusable widget container

- Framer Motion animations
- Mobile-responsive with glassmorphism
- Support for single/double span in grid
- Loading state support
- Optional click handler for navigation"
```

---

### Task 4.2: Create Student Attendance Widget

**Files:**
- Create: `app/(routes)/dashboard/_components/widgets/student/attendance-widget.tsx`

**Step 1: Write attendance widget with pie chart**

```typescript
'use client';

import { useStudentAttendance } from '@/hooks/dashboard/use-student-dashboard';
import { WidgetContainer } from '../shared/widget-container';
import { Calendar, TrendingUp, TrendingDown } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';

interface AttendanceWidgetProps {
  studentId: string;
  isVisible?: boolean;
}

export function AttendanceWidget({ studentId, isVisible = true }: AttendanceWidgetProps) {
  const router = useRouter();
  const { data, isLoading } = useStudentAttendance(studentId);

  const percentage = data?.percentage || 0;
  const status = percentage >= 75 ? 'good' : percentage >= 65 ? 'warning' : 'critical';

  const chartData = [
    { name: 'Present', value: data?.present || 0, color: '#10b981' },
    { name: 'Absent', value: data?.absent || 0, color: '#ef4444' },
    { name: 'Late', value: data?.late || 0, color: '#f59e0b' }
  ];

  const statusConfig = {
    good: {
      color: 'text-green-600',
      bg: 'bg-green-50 dark:bg-green-900/20',
      border: 'border-green-200 dark:border-green-800',
      icon: TrendingUp
    },
    warning: {
      color: 'text-yellow-600',
      bg: 'bg-yellow-50 dark:bg-yellow-900/20',
      border: 'border-yellow-200 dark:border-yellow-800',
      icon: TrendingDown
    },
    critical: {
      color: 'text-red-600',
      bg: 'bg-red-50 dark:bg-red-900/20',
      border: 'border-red-200 dark:border-red-800',
      icon: TrendingDown
    }
  };

  const config = statusConfig[status];
  const StatusIcon = config.icon;

  return (
    <WidgetContainer
      widgetId='student_attendance'
      title='My Attendance'
      description='Overall attendance percentage'
      icon={Calendar}
      iconColor='text-blue-600'
      isVisible={isVisible}
      loading={isLoading}
      onClick={() => router.push('/learners/my-attendance')}
    >
      <div className='space-y-3 sm:space-y-4'>
        {/* Percentage Badge */}
        <div className={cn(
          'flex items-center justify-center gap-2 p-3 sm:p-4 rounded-xl border-2',
          config.bg,
          config.border
        )}>
          <StatusIcon className={cn('h-5 w-5 sm:h-6 sm:w-6', config.color)} />
          <span className={cn('text-3xl sm:text-4xl font-bold', config.color)}>
            {percentage.toFixed(1)}%
          </span>
        </div>

        {/* Pie Chart - Mobile Responsive */}
        <div className='h-32 sm:h-40'>
          <ResponsiveContainer width='100%' height='100%'>
            <PieChart>
              <Pie
                data={chartData}
                cx='50%'
                cy='50%'
                innerRadius='40%'
                outerRadius='70%'
                paddingAngle={2}
                dataKey='value'
              >
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  backgroundColor: 'rgba(255, 255, 255, 0.95)',
                  borderRadius: '8px',
                  fontSize: '12px'
                }}
              />
              <Legend
                iconSize={8}
                wrapperStyle={{ fontSize: '11px' }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Stats Grid */}
        <div className='grid grid-cols-3 gap-2 sm:gap-3'>
          <div className='text-center p-2 sm:p-3 bg-green-50 dark:bg-green-900/20 rounded-lg'>
            <p className='text-lg sm:text-2xl font-bold text-green-600'>
              {data?.present || 0}
            </p>
            <p className='text-[10px] sm:text-xs text-muted-foreground'>Present</p>
          </div>
          <div className='text-center p-2 sm:p-3 bg-red-50 dark:bg-red-900/20 rounded-lg'>
            <p className='text-lg sm:text-2xl font-bold text-red-600'>
              {data?.absent || 0}
            </p>
            <p className='text-[10px] sm:text-xs text-muted-foreground'>Absent</p>
          </div>
          <div className='text-center p-2 sm:p-3 bg-gray-50 dark:bg-gray-900/20 rounded-lg'>
            <p className='text-lg sm:text-2xl font-bold text-gray-600'>
              {data?.total || 0}
            </p>
            <p className='text-[10px] sm:text-xs text-muted-foreground'>Total</p>
          </div>
        </div>

        {/* Warning Message */}
        {percentage < 75 && (
          <div className={cn(
            'text-xs sm:text-sm text-center p-2 sm:p-3 rounded-lg border-l-4',
            'bg-red-50 dark:bg-red-900/20 border-red-500 text-red-700 dark:text-red-300'
          )}>
            <div className='flex items-center justify-center gap-2'>
              <TrendingDown className='h-4 w-4 flex-shrink-0' />
              <span>Below 75% requirement</span>
            </div>
          </div>
        )}
      </div>
    </WidgetContainer>
  );
}
```

**Step 2: Install recharts dependency**

Run: `npm install recharts`
Expected: recharts installed successfully

**Step 3: Commit**

```bash
git add app/(routes)/dashboard/_components/widgets/student/attendance-widget.tsx package.json package-lock.json
git commit -m "feat(dashboard): add student attendance widget

- Pie chart visualization with Recharts
- Color-coded percentage badge (green/yellow/red)
- Mobile-responsive grid layout
- Warning message for <75% attendance
- Click to navigate to detailed attendance page"
```

---

### Task 4.3: Create Celebrations Today Widget

**Files:**
- Create: `app/(routes)/dashboard/_components/widgets/shared/celebrations-today-widget.tsx`

**Step 1: Write celebrations widget with animations**

```typescript
'use client';

import { useCelebrationsToday } from '@/hooks/dashboard/use-celebrations';
import { WidgetContainer } from './widget-container';
import { Cake, Award, PartyPopper, Sparkles } from 'lucide-react';
import { motion } from 'framer-motion';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';

interface CelebrationsTodayWidgetProps {
  userId: string;
  role: string;
  isVisible?: boolean;
}

export function CelebrationsTodayWidget({
  userId,
  role,
  isVisible = true
}: CelebrationsTodayWidgetProps) {
  const { data, isLoading } = useCelebrationsToday(userId, role);

  const totalCelebrations = (data?.birthdays?.length || 0) + (data?.workAnniversaries?.length || 0);

  if (totalCelebrations === 0 && !isLoading) return null;

  return (
    <WidgetContainer
      widgetId='celebrations_today'
      title="Today's Celebrations"
      description={`${totalCelebrations} celebration${totalCelebrations !== 1 ? 's' : ''} today`}
      icon={PartyPopper}
      iconColor='text-pink-600'
      isVisible={isVisible}
      loading={isLoading}
      span='double'
    >
      <div className='space-y-4'>
        {/* Birthdays Section */}
        {data?.birthdays && data.birthdays.length > 0 && (
          <div className='space-y-2'>
            <div className='flex items-center gap-2 text-sm font-semibold text-pink-600'>
              <Cake className='h-4 w-4' />
              <span>Birthdays ({data.birthdays.length})</span>
            </div>

            <div className='space-y-2 max-h-32 sm:max-h-40 overflow-y-auto custom-scrollbar'>
              {data.birthdays.map((person, idx) => (
                <motion.div
                  key={person.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.1 }}
                  className='flex items-center gap-3 p-2 sm:p-3 bg-gradient-to-r from-pink-50 to-purple-50 dark:from-pink-900/20 dark:to-purple-900/20 rounded-lg border border-pink-200 dark:border-pink-800'
                >
                  <Avatar className='h-8 w-8 sm:h-10 sm:w-10 border-2 border-pink-300'>
                    <AvatarImage src={person.avatar_url || ''} />
                    <AvatarFallback className='bg-pink-200 text-pink-700 text-xs'>
                      {person.name.slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>

                  <div className='flex-1 min-w-0'>
                    <p className='font-medium text-sm sm:text-base truncate'>
                      {person.name}
                    </p>
                    <p className='text-xs text-muted-foreground'>
                      {person.role} {person.age && `· ${person.age} years`}
                    </p>
                  </div>

                  <Sparkles className='h-4 w-4 text-pink-500 flex-shrink-0 animate-pulse' />
                </motion.div>
              ))}
            </div>
          </div>
        )}

        {/* Work Anniversaries Section */}
        {data?.workAnniversaries && data.workAnniversaries.length > 0 && (
          <div className='space-y-2'>
            <div className='flex items-center gap-2 text-sm font-semibold text-amber-600'>
              <Award className='h-4 w-4' />
              <span>Work Anniversaries ({data.workAnniversaries.length})</span>
            </div>

            <div className='space-y-2 max-h-32 sm:max-h-40 overflow-y-auto custom-scrollbar'>
              {data.workAnniversaries.map((person, idx) => (
                <motion.div
                  key={person.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.1 }}
                  className='flex items-center gap-3 p-2 sm:p-3 bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 rounded-lg border border-amber-200 dark:border-amber-800'
                >
                  <Avatar className='h-8 w-8 sm:h-10 sm:w-10 border-2 border-amber-300'>
                    <AvatarImage src={person.avatar_url || ''} />
                    <AvatarFallback className='bg-amber-200 text-amber-700 text-xs'>
                      {person.name.slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>

                  <div className='flex-1 min-w-0'>
                    <p className='font-medium text-sm sm:text-base truncate'>
                      {person.name}
                    </p>
                    <p className='text-xs text-muted-foreground'>
                      {person.years} {person.years === 1 ? 'year' : 'years'} at JKKN
                    </p>
                  </div>

                  <Award className='h-4 w-4 text-amber-500 flex-shrink-0' />
                </motion.div>
              ))}
            </div>
          </div>
        )}

        {/* Send Wishes Button */}
        <Button
          variant='outline'
          size='sm'
          className='w-full bg-gradient-to-r from-pink-50 to-purple-50 dark:from-pink-900/20 dark:to-purple-900/20 border-pink-200 dark:border-pink-800 hover:from-pink-100 hover:to-purple-100'
        >
          <Sparkles className='h-4 w-4 mr-2' />
          Send Wishes
        </Button>
      </div>
    </WidgetContainer>
  );
}
```

**Step 2: Commit**

```bash
git add app/(routes)/dashboard/_components/widgets/shared/celebrations-today-widget.tsx
git commit -m "feat(dashboard): add celebrations today widget

- Display birthdays and work anniversaries
- Framer Motion staggered animations
- Gradient backgrounds for visual appeal
- Avatar display with fallback initials
- Send wishes button
- Auto-hide when no celebrations"
```

---

## Phase 5: Dashboard Pages & Routing

### Task 5.1: Create Widget Registry

**Files:**
- Create: `app/(routes)/dashboard/_components/widget-registry.ts`

**Step 1: Write widget registry for all roles**

```typescript
export const STUDENT_WIDGETS = [
  {
    id: 'student_attendance',
    title: 'My Attendance',
    description: 'Overall attendance percentage and stats',
    category: 'Academic'
  },
  {
    id: 'student_timetable_today',
    title: "Today's Classes",
    description: 'Your class schedule for today',
    category: 'Academic'
  },
  {
    id: 'student_billing',
    title: 'Fee Summary',
    description: 'Your fee payment status and outstanding balance',
    category: 'Finance'
  },
  {
    id: 'celebrations_today',
    title: "Today's Celebrations",
    description: 'Birthdays and work anniversaries today',
    category: 'Community'
  },
  {
    id: 'my_celebration_countdown',
    title: 'My Next Milestone',
    description: 'Countdown to your next birthday',
    category: 'Personal'
  }
];

export const FACULTY_WIDGETS = [
  {
    id: 'faculty_classes_today',
    title: "Today's Teaching Schedule",
    description: 'Classes you are teaching today',
    category: 'Academic'
  },
  {
    id: 'faculty_pending_attendance',
    title: 'Pending Attendance',
    description: 'Classes where attendance needs to be marked',
    category: 'Academic'
  },
  {
    id: 'faculty_students_overview',
    title: 'My Students',
    description: 'Overview of students you teach',
    category: 'Academic'
  },
  {
    id: 'faculty_leave_approvals',
    title: 'Pending Approvals',
    description: 'Leave requests awaiting your approval (HOD/Principal only)',
    category: 'Management'
  },
  {
    id: 'celebrations_today',
    title: "Today's Celebrations",
    description: 'Birthdays and work anniversaries today',
    category: 'Community'
  },
  {
    id: 'celebrations_upcoming',
    title: 'Upcoming Celebrations',
    description: 'Celebrations in the next 7 days',
    category: 'Community'
  },
  {
    id: 'my_celebration_countdown',
    title: 'My Next Milestone',
    description: 'Countdown to your next celebration',
    category: 'Personal'
  }
];

export const LEADERSHIP_WIDGETS = [
  {
    id: 'leadership_overview',
    title: 'Institution Overview',
    description: 'Total students, staff, and sections',
    category: 'Overview'
  },
  {
    id: 'leadership_attendance_today',
    title: "Today's Attendance",
    description: 'Institution-wide attendance summary for today',
    category: 'Academic'
  },
  {
    id: 'leadership_pending_approvals',
    title: 'Pending Approvals',
    description: 'All pending approvals across modules',
    category: 'Management'
  },
  {
    id: 'celebrations_today',
    title: "Today's Celebrations",
    description: 'Birthdays and work anniversaries today',
    category: 'Community'
  },
  {
    id: 'celebrations_upcoming',
    title: 'Upcoming Celebrations',
    description: 'Celebrations in the next 7 days',
    category: 'Community'
  }
];

export const ADMIN_WIDGETS = [
  {
    id: 'admin_system_overview',
    title: 'System Overview',
    description: 'Total institutions, users, students, and staff',
    category: 'System'
  },
  {
    id: 'admin_recent_activity',
    title: 'Recent Activity',
    description: 'Latest system activities and events',
    category: 'System'
  },
  {
    id: 'admin_at_risk_students',
    title: 'At-Risk Students',
    description: 'Students requiring attention system-wide',
    category: 'Analytics'
  },
  {
    id: 'celebrations_today',
    title: "Today's Celebrations",
    description: 'Birthdays and work anniversaries across all institutions',
    category: 'Community'
  },
  {
    id: 'celebrations_upcoming',
    title: 'Upcoming Celebrations',
    description: 'Celebrations in the next 7 days',
    category: 'Community'
  }
];
```

**Step 2: Commit**

```bash
git add app/(routes)/dashboard/_components/widget-registry.ts
git commit -m "feat(dashboard): add widget registry for all roles

- Student widgets (5 total)
- Faculty widgets (7 total)
- Leadership widgets (5 total)
- Admin widgets (5 total)
- Categorized for settings UI"
```

---

### Task 5.2: Create Student Dashboard Component

**Files:**
- Create: `app/(routes)/dashboard/_components/dashboards/student-dashboard.tsx`

**Step 1: Write student dashboard component**

```typescript
'use client';

import { AttendanceWidget } from '../widgets/student/attendance-widget';
import { CelebrationsTodayWidget } from '../widgets/shared/celebrations-today-widget';

interface StudentDashboardProps {
  userId: string;
  studentId: string;
  sectionId: string;
  role: string;
  visibilityMap: Record<string, boolean>;
}

export default function StudentDashboard({
  userId,
  studentId,
  sectionId,
  role,
  visibilityMap
}: StudentDashboardProps) {
  return (
    <div className='space-y-4 sm:space-y-6'>
      {/* Mobile: 1 column, Tablet: 2 columns, Desktop: 3 columns */}
      <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 lg:gap-6'>
        <AttendanceWidget
          studentId={studentId}
          isVisible={visibilityMap.student_attendance ?? true}
        />

        {/* TODO: Add remaining widgets in subsequent tasks */}
        {/* - TimetableTodayWidget */}
        {/* - BillingWidget */}
        {/* - MyCelebrationWidget */}

        {/* This spans 2 columns on tablet+ */}
        <CelebrationsTodayWidget
          userId={userId}
          role={role}
          isVisible={visibilityMap.celebrations_today ?? true}
        />
      </div>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add app/(routes)/dashboard/_components/dashboards/student-dashboard.tsx
git commit -m "feat(dashboard): add student dashboard component

- Responsive grid layout (1/2/3 columns)
- AttendanceWidget integration
- CelebrationsTodayWidget with double span
- Visibility map for show/hide preferences
- TODO placeholders for remaining widgets"
```

---

### Task 5.3: Update Main Dashboard Page

**Files:**
- Modify: `app/(routes)/dashboard/page.tsx`

**Step 1: Update dashboard page with role routing**

```typescript
import { Suspense } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { DashboardBentoGrid } from './_components/dashboard-bento-grid';
import { LoadingSkeleton } from '@/components/loading-skeleton';
import { SYSTEM_ROLES } from '@/types/auth';
import { redirect } from 'next/navigation';
import StudentDashboard from './_components/dashboards/student-dashboard';

export default async function DashboardPage() {
  console.log('[Dashboard Page] Dashboard page loaded');

  return (
    <ContentLayout title='Dashboard'>
      {/* Animated glass background */}
      <div className='fixed inset-0 -z-10 overflow-hidden pointer-events-none'>
        <div className='absolute inset-0 bg-gradient-to-br from-green-50/50 via-emerald-50/30 to-green-50/50 dark:from-green-950/30 dark:via-emerald-950/20 dark:to-green-950/30' />
        <div className='absolute -top-1/2 -right-1/2 w-full h-full bg-gradient-to-br from-green-400/10 via-transparent to-emerald-400/10 blur-3xl animate-blob' />
        <div className='absolute -bottom-1/2 -left-1/2 w-full h-full bg-gradient-to-tr from-emerald-400/10 via-transparent to-green-400/10 blur-3xl animate-blob animation-delay-2000' />
      </div>

      <div className='space-y-3 sm:space-y-4 lg:space-y-6 px-1 sm:px-2 lg:px-4'>
        {/* BentoGrid Section - Server rendered with Suspense */}
        <Suspense fallback={<LoadingSkeleton />}>
          <BentoGridSection />
        </Suspense>

        {/* Role-Based Dashboard Section */}
        <Suspense fallback={<LoadingSkeleton />}>
          <RoleBasedDashboard />
        </Suspense>
      </div>
    </ContentLayout>
  );
}

/**
 * BentoGrid Section - Greeting (existing)
 */
async function BentoGridSection() {
  const supabase = await createServerSupabaseClient();

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <DashboardBentoGrid currentUser='Guest' />
    );
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', user.id)
    .single();

  const currentUser = profile?.full_name || user.email?.split('@')[0] || 'User';

  return (
    <div className='w-full'>
      <DashboardBentoGrid currentUser={currentUser} />
    </div>
  );
}

/**
 * Role-Based Dashboard Section
 */
async function RoleBasedDashboard() {
  const supabase = await createServerSupabaseClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role, institution_id, department_id')
    .eq('id', user.id)
    .single();

  if (!profile) redirect('/profile/setup');

  // Fetch dashboard preferences
  const { data: preferences } = await supabase
    .from('user_dashboard_preferences')
    .select('widget_id, is_visible')
    .eq('user_id', user.id)
    .eq('role', profile.role);

  const visibilityMap = preferences?.reduce((acc, pref) => {
    acc[pref.widget_id] = pref.is_visible;
    return acc;
  }, {} as Record<string, boolean>) || {};

  // Route to appropriate dashboard based on role
  if (profile.role === SYSTEM_ROLES.STUDENT) {
    // Get student profile
    const { data: student } = await supabase
      .from('learners_profiles')
      .select('id, section_id')
      .eq('profile_id', user.id)
      .single();

    if (!student) {
      return <div className='text-center py-8'>Student profile not found</div>;
    }

    return (
      <StudentDashboard
        userId={user.id}
        studentId={student.id}
        sectionId={student.section_id}
        role={profile.role}
        visibilityMap={visibilityMap}
      />
    );
  }

  // TODO: Add other role dashboards
  // - FacultyDashboard
  // - LeadershipDashboard
  // - AdminDashboard

  return (
    <div className='text-center py-8 text-muted-foreground'>
      Dashboard for {profile.role} role coming soon
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add app/(routes)/dashboard/page.tsx
git commit -m "feat(dashboard): add role-based routing to main dashboard

- Server-side role detection and routing
- Fetch dashboard preferences from database
- StudentDashboard integration for student role
- Suspense boundaries for async components
- Keep existing BentoGrid greeting section
- TODO placeholders for other role dashboards"
```

---

## Phase 6: Settings UI

### Task 6.1: Create Dashboard Settings Dialog

**Files:**
- Create: `app/(routes)/dashboard/_components/dashboard-settings-dialog.tsx`

**Step 1: Write settings dialog component**

```typescript
'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Settings, RotateCcw } from 'lucide-react';
import { WidgetVisibilitySettings } from './widget-visibility-settings';
import { useResetPreferences } from '@/hooks/dashboard/use-dashboard-preferences';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface DashboardSettingsDialogProps {
  userId: string;
  role: string;
  widgets: Array<{
    id: string;
    title: string;
    description: string;
    category: string;
  }>;
}

export function DashboardSettingsDialog({
  userId,
  role,
  widgets
}: DashboardSettingsDialogProps) {
  const [open, setOpen] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const resetPreferences = useResetPreferences();

  const handleReset = async () => {
    await resetPreferences.mutateAsync({ userId, role });
    setShowResetConfirm(false);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button
            variant='outline'
            size='sm'
            className='gap-2'
          >
            <Settings className='h-4 w-4' />
            <span className='hidden sm:inline'>Customize Dashboard</span>
          </Button>
        </DialogTrigger>

        <DialogContent className='max-w-2xl max-h-[80vh] overflow-y-auto'>
          <DialogHeader>
            <DialogTitle>Dashboard Settings</DialogTitle>
            <DialogDescription>
              Customize which widgets are visible on your dashboard
            </DialogDescription>
          </DialogHeader>

          <div className='py-4'>
            <WidgetVisibilitySettings
              userId={userId}
              role={role}
              widgets={widgets}
            />
          </div>

          <DialogFooter className='gap-2 sm:gap-0'>
            <Button
              variant='outline'
              onClick={() => setShowResetConfirm(true)}
              className='gap-2'
            >
              <RotateCcw className='h-4 w-4' />
              Reset to Defaults
            </Button>
            <Button onClick={() => setOpen(false)}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset Confirmation Dialog */}
      <AlertDialog open={showResetConfirm} onOpenChange={setShowResetConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset Dashboard?</AlertDialogTitle>
            <AlertDialogDescription>
              This will reset all widget visibility settings to their default values.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleReset}
              disabled={resetPreferences.isPending}
            >
              {resetPreferences.isPending ? 'Resetting...' : 'Reset'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
```

**Step 2: Commit**

```bash
git add app/(routes)/dashboard/_components/dashboard-settings-dialog.tsx
git commit -m "feat(dashboard): add settings dialog

- Dialog for customizing widget visibility
- Reset to defaults button with confirmation
- Mobile-responsive with scrollable content
- Loading states for reset operation"
```

---

### Task 6.2: Create Widget Visibility Settings Component

**Files:**
- Create: `app/(routes)/dashboard/_components/widget-visibility-settings.tsx`

**Step 1: Write visibility settings component**

```typescript
'use client';

import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import {
  useDashboardPreferences,
  useUpdatePreference
} from '@/hooks/dashboard/use-dashboard-preferences';
import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';

interface Widget {
  id: string;
  title: string;
  description: string;
  category: string;
}

interface WidgetVisibilitySettingsProps {
  userId: string;
  role: string;
  widgets: Widget[];
}

export function WidgetVisibilitySettings({
  userId,
  role,
  widgets
}: WidgetVisibilitySettingsProps) {
  const { data: preferences, isLoading } = useDashboardPreferences(userId, role);
  const updatePreference = useUpdatePreference();

  // Group widgets by category
  const widgetsByCategory = widgets.reduce((acc, widget) => {
    if (!acc[widget.category]) {
      acc[widget.category] = [];
    }
    acc[widget.category].push(widget);
    return acc;
  }, {} as Record<string, Widget[]>);

  const handleToggle = (widgetId: string, isVisible: boolean) => {
    updatePreference.mutate({
      userId,
      role,
      widgetId,
      isVisible
    });
  };

  if (isLoading) {
    return (
      <div className='flex items-center justify-center py-8'>
        <Loader2 className='h-6 w-6 animate-spin text-muted-foreground' />
      </div>
    );
  }

  return (
    <div className='space-y-6'>
      {Object.entries(widgetsByCategory).map(([category, categoryWidgets]) => (
        <div key={category} className='space-y-4'>
          <div>
            <h3 className='text-sm font-semibold text-foreground'>
              {category}
            </h3>
            <p className='text-xs text-muted-foreground'>
              Toggle widgets in the {category.toLowerCase()} category
            </p>
          </div>

          <div className='space-y-3'>
            {categoryWidgets.map((widget) => {
              const isVisible = preferences?.[widget.id] ?? true;

              return (
                <div
                  key={widget.id}
                  className={cn(
                    'flex items-start justify-between gap-4 p-3 rounded-lg border transition-colors',
                    isVisible
                      ? 'bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-800'
                      : 'bg-gray-50 dark:bg-gray-900/10 border-gray-200 dark:border-gray-800'
                  )}
                >
                  <div className='flex-1 space-y-1'>
                    <Label
                      htmlFor={widget.id}
                      className='text-sm font-medium cursor-pointer'
                    >
                      {widget.title}
                    </Label>
                    <p className='text-xs text-muted-foreground'>
                      {widget.description}
                    </p>
                  </div>

                  <Switch
                    id={widget.id}
                    checked={isVisible}
                    onCheckedChange={(checked) => handleToggle(widget.id, checked)}
                    disabled={updatePreference.isPending}
                  />
                </div>
              );
            })}
          </div>

          <Separator />
        </div>
      ))}
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add app/(routes)/dashboard/_components/widget-visibility-settings.tsx
git commit -m "feat(dashboard): add widget visibility settings UI

- Grouped by category for organization
- Switch component for toggle
- Visual feedback with color coding
- Optimistic UI updates
- Loading and disabled states"
```

---

## Phase 7: Testing & Verification

### Task 7.1: Manual Testing Checklist

**Step 1: Test database migrations**

Run: `cd supabase && npx supabase db push`
Expected: All migrations applied successfully

**Step 2: Test student dashboard**

1. Login as a student user
2. Navigate to `/dashboard`
3. Verify:
   - Greeting BentoGrid displays
   - Attendance widget shows with pie chart
   - Celebrations widget appears (if celebrations exist)
   - Charts are responsive on mobile
   - Click attendance widget navigates to `/learners/my-attendance`

**Step 3: Test widget preferences**

1. Click "Customize Dashboard" button
2. Toggle attendance widget off
3. Verify widget disappears from dashboard
4. Toggle widget back on
5. Verify widget reappears
6. Click "Reset to Defaults"
7. Verify all widgets return to default visibility

**Step 4: Test celebrations**

1. Ensure test data has birthdays/anniversaries for today
2. Verify celebrations widget displays
3. Check avatar images load correctly
4. Verify animations on widget render
5. Test "Send Wishes" button (UI only for now)

**Step 5: Mobile responsiveness**

1. Open dashboard in mobile viewport (375px)
2. Verify 1-column grid layout
3. Check chart responsiveness
4. Verify text truncation works
5. Test touch interactions

**Step 6: Commit verification**

```bash
git log --oneline -20
git status
```

Expected: All changes committed, working tree clean

---

## Phase 8: Documentation

### Task 8.1: Update SQL File Index

**Files:**
- Modify: `supabase/SQL_FILE_INDEX.md`

**Step 1: Add dashboard tables to index**

Add to the appropriate section:

```markdown
### Dashboard System

**Tables:**
- `user_dashboard_preferences` - Widget visibility preferences per user/role
- `dashboard_widgets` - Registry of available widgets per role

**Migration:** `20260130140000_create_dashboard_tables.sql`

**Purpose:** Personalized role-based dashboard system with customizable widget visibility
```

**Step 2: Commit**

```bash
git add supabase/SQL_FILE_INDEX.md
git commit -m "docs: update SQL file index with dashboard tables"
```

---

### Task 8.2: Create Implementation Documentation

**Files:**
- Create: `docs/features/2026-01-30-FEATURE-personalized-dashboard.md`

**Step 1: Write feature documentation**

```markdown
# Personalized Dashboard System

**Implementation Date:** 2026-01-30

**Status:** Phase 1 Complete (Student Dashboard)

## Overview

Role-based personalized dashboard system with customizable widgets, celebration cards, and responsive data visualization.

## Features Implemented

### Phase 1: Student Dashboard

1. **Attendance Widget**
   - Pie chart visualization with Recharts
   - Color-coded percentage (green/yellow/red)
   - Present/Absent/Late stats
   - Warning for <75% attendance
   - Click to navigate to detailed view

2. **Celebrations Widget**
   - Today's birthdays display
   - Work anniversaries display
   - Framer Motion animations
   - Avatar support with fallbacks
   - Send wishes button (UI only)

3. **Widget Preferences**
   - Hide/show individual widgets
   - Preferences saved to database
   - Optimistic UI updates
   - Reset to defaults functionality

4. **Settings UI**
   - Settings dialog with widget toggles
   - Categorized widget list
   - Reset confirmation dialog
   - Mobile-responsive

## Database Schema

### Tables

**user_dashboard_preferences**
- Stores widget visibility per user/role
- UNIQUE constraint on (user_id, role, widget_id)
- RLS policies for user-scoped access

**dashboard_widgets**
- Registry of available widgets
- Metadata: title, description, category, default visibility
- Seeded with all role widgets

## Tech Stack

- **Frontend:** Next.js 14, React, TypeScript
- **State:** React Query (TanStack Query)
- **Charts:** Recharts
- **Animations:** Framer Motion
- **UI:** shadcn/ui, Tailwind CSS
- **Database:** Supabase (PostgreSQL)

## File Structure

```
app/(routes)/dashboard/
├── page.tsx                         # Main dashboard with role routing
├── _components/
│   ├── dashboard-bento-grid.tsx     # Greeting section (existing)
│   ├── widget-registry.ts           # Widget definitions
│   ├── dashboard-settings-dialog.tsx
│   ├── widget-visibility-settings.tsx
│   ├── dashboards/
│   │   └── student-dashboard.tsx
│   └── widgets/
│       ├── shared/
│       │   ├── widget-container.tsx
│       │   └── celebrations-today-widget.tsx
│       └── student/
│           └── attendance-widget.tsx

lib/services/dashboard/
├── celebration-service.ts
├── student-dashboard-service.ts
└── dashboard-preferences-service.ts

hooks/dashboard/
├── use-celebrations.ts
├── use-student-dashboard.ts
└── use-dashboard-preferences.ts
```

## Remaining Work (Future Phases)

### Phase 2: Additional Student Widgets
- Timetable Today Widget
- Billing Summary Widget
- My Celebration Countdown Widget

### Phase 3: Faculty Dashboard
- Classes Today Widget
- Pending Attendance Widget
- Students Overview Widget
- Leave Approvals Widget (HOD/Principal)

### Phase 4: Leadership Dashboard
- Institution/Department Overview
- Attendance Summary Today
- Pending Approvals Aggregate

### Phase 5: Admin Dashboard
- System Overview
- Recent Activity Feed
- At-Risk Students

### Phase 6: Advanced Features
- Drag-and-drop widget reordering
- Widget resize functionality
- Export dashboard as PDF
- Email digest of celebrations

## Testing

Manual testing completed for:
- Student dashboard display
- Widget preferences (hide/show/reset)
- Celebrations widget
- Mobile responsiveness
- Chart rendering

## Known Limitations

1. Only Student dashboard implemented (other roles show "coming soon")
2. "Send Wishes" button is UI-only (no email functionality yet)
3. No drag-and-drop reordering (Phase 6)
4. Celebrations require `date_of_birth` and `joining_date` fields populated

## Migration Notes

Run migrations in order:
1. `20260130140000_create_dashboard_tables.sql`
2. Seed widgets: `supabase/seed/dashboard_widgets_seed.sql`

## Performance Considerations

- React Query caching reduces API calls
- Optimistic updates for instant UI feedback
- Recharts renders efficiently for mobile
- Server Components for initial data fetch
```

**Step 2: Commit**

```bash
git add docs/features/2026-01-30-FEATURE-personalized-dashboard.md
git commit -m "docs: add personalized dashboard feature documentation

- Overview of implemented features
- Database schema details
- File structure reference
- Remaining work breakdown
- Testing notes and limitations"
```

---

## Final Commit

**Step 1: Final verification**

```bash
# Check all files are committed
git status

# Review commit history
git log --oneline -30

# Verify build passes
npm run build
```

Expected:
- No uncommitted changes
- ~30 commits in feature
- Build succeeds without errors

**Step 2: Create final summary commit**

```bash
git commit --allow-empty -m "feat(dashboard): complete Phase 1 - Student Dashboard

Summary of implementation:
- Database: 2 tables (preferences, widgets) with RLS
- Services: 3 services (celebrations, student, preferences)
- Hooks: 3 React Query hook files with 8 total hooks
- Widgets: 2 widgets (attendance, celebrations)
- Components: Settings dialog, visibility settings, widget container
- Pages: Role-based routing in main dashboard
- Charts: Recharts integration for pie charts
- Animations: Framer Motion for celebrations
- Mobile: Fully responsive 1/2/3 column grid

Phase 1 Complete: Student Dashboard fully functional
Next: Phase 2 - Additional Student Widgets"
```

---

## Implementation Plan Complete

**Total Estimated Time:** 8-12 hours for full implementation

**Phases:**
1. Database (30 mins)
2. Services (2 hours)
3. Hooks (1 hour)
4. Widgets (3 hours)
5. Dashboard Pages (2 hours)
6. Settings UI (1.5 hours)
7. Testing (1 hour)
8. Documentation (1 hour)

**Key Principles Followed:**
- **DRY:** Reusable WidgetContainer, service base classes
- **YAGNI:** Only implemented Student dashboard (Phase 1)
- **TDD:** Manual testing checklist for verification
- **Mobile-First:** Responsive grid, mobile-optimized charts
- **Type Safety:** Full TypeScript coverage
- **Performance:** React Query caching, optimistic updates

**Next Steps:**
- Implement Phase 2 (remaining student widgets)
- Implement Phase 3 (faculty dashboard)
- Implement Phase 4 (leadership dashboard)
- Implement Phase 5 (admin dashboard)
