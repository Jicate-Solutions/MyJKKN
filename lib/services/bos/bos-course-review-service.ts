import { BosCourseReview, BosCourseReviewAction } from '@/types/bos';

export interface CreateCourseReviewDto {
  institutions_id: string;
  agenda_item_id?: string;
  course_id?: string;
  course_code: string;
  course_name: string;
  review_action: BosCourseReviewAction;
  changes_suggested?: string;
  remarks?: string;
  regulation_code?: string;
}

export class BosCourseReviewService {
  static async getCourseReviews(meetingId: string): Promise<BosCourseReview[]> {
    const res = await fetch(`/api/bos/meetings/${meetingId}/courses`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to fetch reviews' }));
      throw new Error(err.error ?? 'Failed to fetch reviews');
    }
    return res.json();
  }

  static async addCourseReview(
    meetingId: string,
    data: CreateCourseReviewDto
  ): Promise<BosCourseReview> {
    const res = await fetch(`/api/bos/meetings/${meetingId}/courses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to add review' }));
      throw new Error(err.error ?? 'Failed to add review');
    }
    return res.json();
  }

  static async deleteCourseReview(id: string): Promise<void> {
    const res = await fetch(`/api/bos/courses/${id}`, { method: 'DELETE' });
    if (!res.ok && res.status !== 204) {
      const err = await res.json().catch(() => ({ error: 'Failed to delete review' }));
      throw new Error(err.error ?? 'Failed to delete review');
    }
  }
}

export class BosResolutionActionService {
  static async getActions(agendaItemId: string): Promise<any[]> {
    const res = await fetch(`/api/bos/agenda/${agendaItemId}/actions`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to fetch actions' }));
      throw new Error(err.error ?? 'Failed to fetch actions');
    }
    return res.json();
  }

  static async addAction(
    agendaItemId: string,
    data: {
      institutions_id: string;
      action_description: string;
      action_date?: string;
      action_by?: string;
      remarks?: string;
      status?: 'pending' | 'in_progress' | 'completed';
    }
  ): Promise<any> {
    const res = await fetch(`/api/bos/agenda/${agendaItemId}/actions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to add action' }));
      throw new Error(err.error ?? 'Failed to add action');
    }
    return res.json();
  }

  static async updateAction(id: string, data: Record<string, unknown>): Promise<any> {
    const res = await fetch(`/api/bos/actions/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to update action' }));
      throw new Error(err.error ?? 'Failed to update action');
    }
    return res.json();
  }

  static async deleteAction(id: string): Promise<void> {
    const res = await fetch(`/api/bos/actions/${id}`, { method: 'DELETE' });
    if (!res.ok && res.status !== 204) {
      const err = await res.json().catch(() => ({ error: 'Failed to delete action' }));
      throw new Error(err.error ?? 'Failed to delete action');
    }
  }
}
