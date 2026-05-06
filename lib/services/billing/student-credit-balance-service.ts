import { createClientSupabaseClient } from '@/lib/supabase/client';
import type { StudentCreditBalance } from '@/types/admission';

export class StudentCreditBalanceService {
  static async listForStudent(studentId: string, includeConsumed = false): Promise<StudentCreditBalance[]> {
    const supabase = createClientSupabaseClient();
    let query = supabase
      .from('student_credit_balances')
      .select('*')
      .eq('student_id', studentId)
      .order('created_at', { ascending: false });
    if (!includeConsumed) query = query.eq('is_consumed', false);
    const { data, error } = await query;
    if (error) throw error;
    return data ?? [];
  }

  static async getUnconsumedTotal(studentId: string): Promise<number> {
    const balances = await this.listForStudent(studentId, false);
    return balances.reduce((sum, b) => sum + Number(b.amount), 0);
  }
}
