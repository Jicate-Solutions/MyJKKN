import { createClientSupabaseClient } from '@/lib/supabase/client';

export interface Notice {
  id: string;
  title: string;
  description: string;
  author_name: string;
  created_at: string;
  notice_type: string;
  priority: 'high' | 'medium' | 'low';
  is_active: boolean;
}

export interface CourseProgress {
  totalCourses: number;
  completedCourses: number;
  inProgressCourses: number;
  progressPercentage: number;
}

export class LearnerNoticesService {
  /**
   * Get recent notices for the student
   * Note: Uses mock data until notices module is implemented
   */
  static async getRecentNotices(
    profileId: string,
    limit: number = 5
  ): Promise<{ data: Notice[]; error: string | null }> {
    try {
      // Return mock notices since the notices module hasn't been built yet
      // This will be replaced with real database queries when notices module is implemented
      return { data: this.getMockNotices().slice(0, limit), error: null };
    } catch (error) {
      console.error('Error in getRecentNotices:', error);
      return { data: this.getMockNotices(), error: null };
    }
  }

  /**
   * Get student's course progress
   * Note: Uses mock data until course progress tracking is implemented
   */
  static async getCourseProgress(
    profileId: string
  ): Promise<{ data: CourseProgress | null; error: string | null }> {
    try {
      // Return mock data as course progress tracking needs more complex schema
      // This would typically involve checking enrollment records, course completion status, etc.
      const mockProgress: CourseProgress = {
        totalCourses: 15,
        completedCourses: 11,
        inProgressCourses: 4,
        progressPercentage: Math.round((11 / 15) * 100)
      };

      return { data: mockProgress, error: null };
    } catch (error) {
      console.error('Error in getCourseProgress:', error);
      return {
        data: {
          totalCourses: 15,
          completedCourses: 11,
          inProgressCourses: 4,
          progressPercentage: 73
        },
        error: null
      };
    }
  }

  /**
   * Mock notices for fallback
   */
  private static getMockNotices(): Notice[] {
    return [
      {
        id: '1',
        title: 'Mid-semester examination schedule released',
        description: 'Check your examination timetable on the portal',
        author_name: 'Academic Office',
        created_at: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(), // 2 hours ago
        notice_type: 'examination',
        priority: 'high',
        is_active: true
      },
      {
        id: '2',
        title: 'Library hours extended during exam period',
        description: 'Library will remain open until 10 PM',
        author_name: 'Library Administration',
        created_at: new Date(Date.now() - 1000 * 60 * 60 * 6).toISOString(), // 6 hours ago
        notice_type: 'general',
        priority: 'medium',
        is_active: true
      },
      {
        id: '3',
        title: 'Fee payment deadline reminder',
        description: 'Last date for semester fee payment is approaching',
        author_name: 'Accounts Department',
        created_at: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(), // 1 day ago
        notice_type: 'fee',
        priority: 'high',
        is_active: true
      },
      {
        id: '4',
        title: 'Cultural fest registration open',
        description: 'Register for annual cultural festival events',
        author_name: 'Student Affairs',
        created_at: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString(), // 2 days ago
        notice_type: 'event',
        priority: 'low',
        is_active: true
      },
      {
        id: '5',
        title: 'Workshop on emerging technologies',
        description: 'Free workshop on AI and Machine Learning',
        author_name: 'CSE Department',
        created_at: new Date(Date.now() - 1000 * 60 * 60 * 72).toISOString(), // 3 days ago
        notice_type: 'workshop',
        priority: 'medium',
        is_active: true
      }
    ];
  }

  /**
   * Format date for display
   */
  static formatNoticeDate(dateString: string): string {
    const date = new Date(dateString);
    const now = new Date();
    const diffInHours = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60));

    if (diffInHours < 1) {
      return 'Just now';
    } else if (diffInHours < 24) {
      return `${diffInHours}h ago`;
    } else if (diffInHours < 48) {
      return '1 day ago';
    } else {
      const diffInDays = Math.floor(diffInHours / 24);
      return `${diffInDays} days ago`;
    }
  }

  /**
   * Get notice type icon and color
   */
  static getNoticeTypeConfig(noticeType: string) {
    const configs = {
      examination: {
        icon: 'BookOpen',
        color: 'bg-blue-100 text-blue-600',
        label: 'Exam'
      },
      fee: {
        icon: 'CreditCard',
        color: 'bg-red-100 text-red-600',
        label: 'Fee'
      },
      general: {
        icon: 'Bell',
        color: 'bg-gray-100 text-gray-600',
        label: 'General'
      },
      event: {
        icon: 'Calendar',
        color: 'bg-green-100 text-green-600',
        label: 'Event'
      },
      workshop: {
        icon: 'Users',
        color: 'bg-purple-100 text-purple-600',
        label: 'Workshop'
      }
    };

    return configs[noticeType as keyof typeof configs] || configs.general;
  }
}