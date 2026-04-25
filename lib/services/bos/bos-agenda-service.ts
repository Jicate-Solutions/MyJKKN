import {
  BosAgendaItem,
  CreateBosAgendaItemDto,
  UpdateBosAgendaItemDto,
} from '@/types/bos';

export class BosAgendaService {
  static async getAgendaItems(meetingId: string): Promise<BosAgendaItem[]> {
    const res = await fetch(`/api/bos/meetings/${meetingId}/agenda`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to fetch agenda' }));
      throw new Error(err.error ?? 'Failed to fetch agenda');
    }
    return res.json();
  }

  static async createAgendaItem(
    meetingId: string,
    data: Omit<CreateBosAgendaItemDto, 'meeting_id' | 'item_number' | 'sort_order'>
  ): Promise<BosAgendaItem> {
    const res = await fetch(`/api/bos/meetings/${meetingId}/agenda`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to create agenda item' }));
      throw new Error(err.error ?? 'Failed to create agenda item');
    }
    return res.json();
  }

  static async updateAgendaItem(
    id: string,
    data: UpdateBosAgendaItemDto
  ): Promise<BosAgendaItem> {
    const res = await fetch(`/api/bos/agenda/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to update agenda item' }));
      throw new Error(err.error ?? 'Failed to update agenda item');
    }
    return res.json();
  }

  static async deleteAgendaItem(id: string): Promise<void> {
    const res = await fetch(`/api/bos/agenda/${id}`, { method: 'DELETE' });
    if (!res.ok && res.status !== 204) {
      const err = await res.json().catch(() => ({ error: 'Failed to delete agenda item' }));
      throw new Error(err.error ?? 'Failed to delete agenda item');
    }
  }
}
