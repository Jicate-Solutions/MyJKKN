import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';
import type {
  HostelAlertRule,
  HostelRiskAlert,
  AlertType,
  AlertSeverity,
  AlertStatus,
} from '@/types/campus-living';

export class HostelAlertService {
  // ══════════════════════════════════════════════════════════════════
  // Alert Rules CRUD
  // ══════════════════════════════════════════════════════════════════

  // ── List alert rules ──────────────────────────────────────────────
  static async getAlertRules(
    institutionId: string,
    filters?: { alert_type?: AlertType; is_active?: boolean }
  ) {
    try {
      const supabase = createClientSupabaseClient();
      let query = supabase
        .from('hostel_alert_rules')
        .select('*')
        .eq('institution_id', institutionId);

      if (filters?.alert_type) query = query.eq('alert_type', filters.alert_type);
      if (filters?.is_active !== undefined) query = query.eq('is_active', filters.is_active);

      query = query.order('alert_type').order('name');

      const { data, error } = await query;
      if (error) {
        logger.error('campus-living/alerts', 'Failed to fetch alert rules', error);
        throw error;
      }
      return data as HostelAlertRule[];
    } catch (error) {
      logger.error('campus-living/alerts', 'Unexpected error in getAlertRules', error);
      throw error;
    }
  }

  // ── Single alert rule ─────────────────────────────────────────────
  static async getAlertRule(id: string) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('hostel_alert_rules')
        .select('*')
        .eq('id', id)
        .single();

      if (error) {
        logger.error('campus-living/alerts', 'Failed to fetch alert rule', error);
        throw error;
      }
      return data as HostelAlertRule;
    } catch (error) {
      logger.error('campus-living/alerts', 'Unexpected error in getAlertRule', error);
      throw error;
    }
  }

  // ── Create alert rule ─────────────────────────────────────────────
  static async createAlertRule(payload: Omit<HostelAlertRule, 'id' | 'created_at' | 'updated_at'>) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('hostel_alert_rules')
        .insert(payload)
        .select()
        .single();

      if (error) {
        logger.error('campus-living/alerts', 'Failed to create alert rule', error);
        throw error;
      }
      return data as HostelAlertRule;
    } catch (error) {
      logger.error('campus-living/alerts', 'Unexpected error in createAlertRule', error);
      throw error;
    }
  }

  // ── Update alert rule ─────────────────────────────────────────────
  static async updateAlertRule(id: string, payload: Partial<HostelAlertRule>) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('hostel_alert_rules')
        .update(payload)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        logger.error('campus-living/alerts', 'Failed to update alert rule', error);
        throw error;
      }
      return data as HostelAlertRule;
    } catch (error) {
      logger.error('campus-living/alerts', 'Unexpected error in updateAlertRule', error);
      throw error;
    }
  }

  // ── Delete alert rule ─────────────────────────────────────────────
  static async deleteAlertRule(id: string) {
    try {
      const supabase = createClientSupabaseClient();
      const { error } = await supabase
        .from('hostel_alert_rules')
        .delete()
        .eq('id', id);

      if (error) {
        logger.error('campus-living/alerts', 'Failed to delete alert rule', error);
        throw error;
      }
    } catch (error) {
      logger.error('campus-living/alerts', 'Unexpected error in deleteAlertRule', error);
      throw error;
    }
  }

  // ── Toggle alert rule active/inactive ─────────────────────────────
  static async toggleAlertRule(id: string, isActive: boolean) {
    try {
      return await this.updateAlertRule(id, { is_active: isActive });
    } catch (error) {
      logger.error('campus-living/alerts', 'Unexpected error in toggleAlertRule', error);
      throw error;
    }
  }

  // ══════════════════════════════════════════════════════════════════
  // Risk Alerts (Generated Alerts)
  // ══════════════════════════════════════════════════════════════════

  // ── List risk alerts ──────────────────────────────────────────────
  static async getRiskAlerts(
    institutionId: string,
    filters?: {
      alert_type?: AlertType;
      severity?: AlertSeverity;
      status?: AlertStatus;
      learner_id?: string;
      block_id?: string;
    },
    page = 1,
    pageSize = 50
  ) {
    try {
      const supabase = createClientSupabaseClient();
      let query = supabase
        .from('hostel_risk_alerts')
        .select('*', { count: 'exact' })
        .eq('institution_id', institutionId);

      if (filters?.alert_type) query = query.eq('alert_type', filters.alert_type);
      if (filters?.severity) query = query.eq('severity', filters.severity);
      if (filters?.status) query = query.eq('status', filters.status);
      if (filters?.learner_id) query = query.eq('learner_id', filters.learner_id);
      if (filters?.block_id) query = query.eq('block_id', filters.block_id);

      const from = (page - 1) * pageSize;
      query = query.order('created_at', { ascending: false }).range(from, from + pageSize - 1);

      const { data, error, count } = await query;
      if (error) {
        logger.error('campus-living/alerts', 'Failed to fetch risk alerts', error);
        throw error;
      }
      return { data: data as HostelRiskAlert[], count: count ?? 0 };
    } catch (error) {
      logger.error('campus-living/alerts', 'Unexpected error in getRiskAlerts', error);
      throw error;
    }
  }

  // ── Active risk alerts ────────────────────────────────────────────
  static async getActiveAlerts(institutionId: string) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('hostel_risk_alerts')
        .select('*')
        .eq('institution_id', institutionId)
        .eq('status', 'active')
        .order('severity')
        .order('created_at', { ascending: false });

      if (error) {
        logger.error('campus-living/alerts', 'Failed to fetch active alerts', error);
        throw error;
      }
      return data as HostelRiskAlert[];
    } catch (error) {
      logger.error('campus-living/alerts', 'Unexpected error in getActiveAlerts', error);
      throw error;
    }
  }

  // ── Single risk alert ─────────────────────────────────────────────
  static async getRiskAlert(id: string) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('hostel_risk_alerts')
        .select('*, hostel_alert_rules(*)')
        .eq('id', id)
        .single();

      if (error) {
        logger.error('campus-living/alerts', 'Failed to fetch risk alert', error);
        throw error;
      }
      return data as HostelRiskAlert & { hostel_alert_rules: HostelAlertRule | null };
    } catch (error) {
      logger.error('campus-living/alerts', 'Unexpected error in getRiskAlert', error);
      throw error;
    }
  }

  // ── Generate a risk alert ─────────────────────────────────────────
  static async generateAlert(payload: Omit<HostelRiskAlert, 'id' | 'acknowledged_by' | 'acknowledged_at' | 'resolved_by' | 'resolved_at' | 'resolution_notes' | 'created_at' | 'updated_at'>) {
    try {
      const supabase = createClientSupabaseClient();

      // Check cooldown - don't generate duplicate alerts
      if (payload.alert_rule_id) {
        const { data: rule } = await supabase
          .from('hostel_alert_rules')
          .select('cooldown_hours')
          .eq('id', payload.alert_rule_id)
          .single();

        if (rule) {
          const cooldownTime = new Date(Date.now() - rule.cooldown_hours * 60 * 60 * 1000).toISOString();
          const { data: existing } = await supabase
            .from('hostel_risk_alerts')
            .select('id')
            .eq('alert_rule_id', payload.alert_rule_id)
            .eq('institution_id', payload.institution_id)
            .eq('learner_id', payload.learner_id ?? '')
            .gt('created_at', cooldownTime)
            .limit(1);

          if (existing && existing.length > 0) {
            logger.warn('campus-living/alerts', 'Alert in cooldown period, skipping', {
              rule_id: payload.alert_rule_id,
            });
            return null;
          }
        }
      }

      const { data, error } = await supabase
        .from('hostel_risk_alerts')
        .insert({
          ...payload,
          status: 'active' as AlertStatus,
        })
        .select()
        .single();

      if (error) {
        logger.error('campus-living/alerts', 'Failed to generate alert', error);
        throw error;
      }
      return data as HostelRiskAlert;
    } catch (error) {
      logger.error('campus-living/alerts', 'Unexpected error in generateAlert', error);
      throw error;
    }
  }

  // ── Acknowledge alert ─────────────────────────────────────────────
  static async acknowledgeAlert(id: string, acknowledgedBy: string) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('hostel_risk_alerts')
        .update({
          status: 'acknowledged' as AlertStatus,
          acknowledged_by: acknowledgedBy,
          acknowledged_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single();

      if (error) {
        logger.error('campus-living/alerts', 'Failed to acknowledge alert', error);
        throw error;
      }
      return data as HostelRiskAlert;
    } catch (error) {
      logger.error('campus-living/alerts', 'Unexpected error in acknowledgeAlert', error);
      throw error;
    }
  }

  // ── Resolve alert ─────────────────────────────────────────────────
  static async resolveAlert(id: string, resolvedBy: string, resolutionNotes: string) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('hostel_risk_alerts')
        .update({
          status: 'resolved' as AlertStatus,
          resolved_by: resolvedBy,
          resolved_at: new Date().toISOString(),
          resolution_notes: resolutionNotes,
        })
        .eq('id', id)
        .select()
        .single();

      if (error) {
        logger.error('campus-living/alerts', 'Failed to resolve alert', error);
        throw error;
      }
      return data as HostelRiskAlert;
    } catch (error) {
      logger.error('campus-living/alerts', 'Unexpected error in resolveAlert', error);
      throw error;
    }
  }

  // ── Dismiss alert (false positive) ────────────────────────────────
  static async dismissAlert(id: string, dismissedBy: string, reason: string) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('hostel_risk_alerts')
        .update({
          status: 'false_positive' as AlertStatus,
          resolved_by: dismissedBy,
          resolved_at: new Date().toISOString(),
          resolution_notes: `Dismissed as false positive: ${reason}`,
        })
        .eq('id', id)
        .select()
        .single();

      if (error) {
        logger.error('campus-living/alerts', 'Failed to dismiss alert', error);
        throw error;
      }
      return data as HostelRiskAlert;
    } catch (error) {
      logger.error('campus-living/alerts', 'Unexpected error in dismissAlert', error);
      throw error;
    }
  }

  // ── Bulk acknowledge alerts ───────────────────────────────────────
  static async bulkAcknowledge(ids: string[], acknowledgedBy: string) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('hostel_risk_alerts')
        .update({
          status: 'acknowledged' as AlertStatus,
          acknowledged_by: acknowledgedBy,
          acknowledged_at: new Date().toISOString(),
        })
        .in('id', ids)
        .select();

      if (error) {
        logger.error('campus-living/alerts', 'Failed to bulk acknowledge alerts', error);
        throw error;
      }
      return data as HostelRiskAlert[];
    } catch (error) {
      logger.error('campus-living/alerts', 'Unexpected error in bulkAcknowledge', error);
      throw error;
    }
  }

  // ── Delete risk alert ─────────────────────────────────────────────
  static async deleteRiskAlert(id: string) {
    try {
      const supabase = createClientSupabaseClient();
      const { error } = await supabase
        .from('hostel_risk_alerts')
        .delete()
        .eq('id', id);

      if (error) {
        logger.error('campus-living/alerts', 'Failed to delete risk alert', error);
        throw error;
      }
    } catch (error) {
      logger.error('campus-living/alerts', 'Unexpected error in deleteRiskAlert', error);
      throw error;
    }
  }

  // ── Alert summary ─────────────────────────────────────────────────
  static async getAlertSummary(institutionId: string) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('hostel_risk_alerts')
        .select('alert_type, severity, status')
        .eq('institution_id', institutionId)
        .in('status', ['active', 'acknowledged']);

      if (error) {
        logger.error('campus-living/alerts', 'Failed to fetch alert summary', error);
        throw error;
      }

      const alerts = data ?? [];
      return {
        total_active: alerts.filter((a) => a.status === 'active').length,
        total_acknowledged: alerts.filter((a) => a.status === 'acknowledged').length,
        by_severity: {
          critical: alerts.filter((a) => a.severity === 'critical').length,
          warning: alerts.filter((a) => a.severity === 'warning').length,
          info: alerts.filter((a) => a.severity === 'info').length,
        },
        by_type: alerts.reduce((acc, a) => {
          acc[a.alert_type] = (acc[a.alert_type] ?? 0) + 1;
          return acc;
        }, {} as Record<string, number>),
      };
    } catch (error) {
      logger.error('campus-living/alerts', 'Unexpected error in getAlertSummary', error);
      throw error;
    }
  }
}
