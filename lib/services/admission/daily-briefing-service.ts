// lib/services/admission/daily-briefing-service.ts
// Daily Briefing Service - Generates personalized daily briefings for admission team members

import { createClientSupabaseClient } from '@/lib/supabase/client';

// Types for briefing content
export interface BriefingPriority {
  title: string;
  lead_id: string;
  reason: string;
}

export interface BriefingHotLead {
  id: string;
  name: string;
  score: number;
  reason: string;
  phone?: string;
}

export interface BriefingScheduledItem {
  time: string;
  lead_name: string;
  action: string;
  lead_id: string;
}

export interface BriefingMetrics {
  new_leads: number;
  follow_ups_due: number;
  conversions: number;
  total_leads: number;
  conversion_rate: number;
}

export interface BriefingYesterdayRecap {
  contacts_made: number;
  conversions: number;
  new_leads: number;
  meetings_held: number;
}

export interface TeamPerformance {
  top_performers: Array<{ name: string; conversions: number; leads_handled: number }>;
  escalations: number;
  pending_reviews: number;
}

export interface InstitutionMetrics {
  total_conversions: number;
  pipeline_value: number;
  growth_rate: number;
}

export interface BriefingContent {
  summary: string;
  priorities: BriefingPriority[];
  metrics: BriefingMetrics;
  hot_leads: BriefingHotLead[];
  scheduled: BriefingScheduledItem[];
  yesterday_recap: BriefingYesterdayRecap;
  team_performance?: TeamPerformance;
  institution_metrics?: InstitutionMetrics;
}

export interface DailyBriefing {
  id: string;
  institution_id: string;
  user_id: string;
  role: 'counselor' | 'manager' | 'admin';
  date: string;
  content: BriefingContent;
  is_read: boolean;
  read_at: string | null;
  created_at: string;
  updated_at: string;
}

export type BriefingRole = 'counselor' | 'manager' | 'admin';

export class DailyBriefingService {
  private static supabase = createClientSupabaseClient();

  /**
   * Generate a personalized daily briefing for a user
   */
  static async generateBriefing(
    userId: string,
    institutionId: string,
    role: BriefingRole,
    date?: string
  ): Promise<DailyBriefing> {
    const briefingDate = date || new Date().toISOString().split('T')[0];

    // Check if briefing already exists
    const existing = await this.getBriefingForUser(userId, briefingDate);
    if (existing) {
      return existing;
    }

    // Generate content based on role
    const content = await this.generateBriefingContent(userId, institutionId, role, briefingDate);

    // Insert the briefing
    const { data, error } = await (this.supabase as any)
      .from('admission_daily_briefings')
      .insert({
        institution_id: institutionId,
        user_id: userId,
        role,
        date: briefingDate,
        content,
        is_read: false
      })
      .select('*')
      .single();

    if (error) {
      console.error('[DailyBriefingService] Error generating briefing:', error);
      throw new Error(`Failed to generate briefing: ${error.message}`);
    }

    return data as DailyBriefing;
  }

  /**
   * Get briefing for a specific user and date
   */
  static async getBriefingForUser(userId: string, date?: string): Promise<DailyBriefing | null> {
    const briefingDate = date || new Date().toISOString().split('T')[0];

    const { data, error } = await (this.supabase as any)
      .from('admission_daily_briefings')
      .select('*')
      .eq('user_id', userId)
      .eq('date', briefingDate)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null; // Not found
      }
      console.error('[DailyBriefingService] Error fetching briefing:', error);
      throw new Error(`Failed to fetch briefing: ${error.message}`);
    }

    return data as DailyBriefing;
  }

  /**
   * Get the latest briefing for a user
   */
  static async getLatestBriefing(userId: string): Promise<DailyBriefing | null> {
    const { data, error } = await (this.supabase as any)
      .from('admission_daily_briefings')
      .select('*')
      .eq('user_id', userId)
      .order('date', { ascending: false })
      .limit(1)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null;
      }
      console.error('[DailyBriefingService] Error fetching latest briefing:', error);
      throw new Error(`Failed to fetch latest briefing: ${error.message}`);
    }

    return data as DailyBriefing;
  }

  /**
   * Get unread briefings for a user
   */
  static async getUnreadBriefings(userId: string): Promise<DailyBriefing[]> {
    const { data, error } = await (this.supabase as any)
      .from('admission_daily_briefings')
      .select('*')
      .eq('user_id', userId)
      .eq('is_read', false)
      .order('date', { ascending: false });

    if (error) {
      console.error('[DailyBriefingService] Error fetching unread briefings:', error);
      throw new Error(`Failed to fetch unread briefings: ${error.message}`);
    }

    return (data || []) as DailyBriefing[];
  }

  /**
   * Get briefing history for a user
   */
  static async getBriefingHistory(
    userId: string,
    limit: number = 30
  ): Promise<DailyBriefing[]> {
    const { data, error } = await (this.supabase as any)
      .from('admission_daily_briefings')
      .select('*')
      .eq('user_id', userId)
      .order('date', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('[DailyBriefingService] Error fetching briefing history:', error);
      throw new Error(`Failed to fetch briefing history: ${error.message}`);
    }

    return (data || []) as DailyBriefing[];
  }

  /**
   * Mark a briefing as read
   */
  static async markAsRead(briefingId: string): Promise<DailyBriefing> {
    const { data, error } = await (this.supabase as any)
      .from('admission_daily_briefings')
      .update({
        is_read: true,
        read_at: new Date().toISOString()
      })
      .eq('id', briefingId)
      .select('*')
      .single();

    if (error) {
      console.error('[DailyBriefingService] Error marking briefing as read:', error);
      throw new Error(`Failed to mark briefing as read: ${error.message}`);
    }

    return data as DailyBriefing;
  }

  /**
   * Generate briefing content based on user role
   */
  private static async generateBriefingContent(
    userId: string,
    institutionId: string,
    role: BriefingRole,
    date: string
  ): Promise<BriefingContent> {
    const yesterday = new Date(date);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];

    // Base content for all roles
    const baseContent = await this.generateBaseContent(userId, institutionId, role, date, yesterdayStr);

    // Add role-specific content
    if (role === 'manager') {
      const teamPerformance = await this.generateTeamPerformance(institutionId, yesterdayStr);
      return { ...baseContent, team_performance: teamPerformance };
    }

    if (role === 'admin') {
      const teamPerformance = await this.generateTeamPerformance(institutionId, yesterdayStr);
      const institutionMetrics = await this.generateInstitutionMetrics(institutionId);
      return { ...baseContent, team_performance: teamPerformance, institution_metrics: institutionMetrics };
    }

    return baseContent;
  }

  /**
   * Generate base content common to all roles
   */
  private static async generateBaseContent(
    userId: string,
    institutionId: string,
    role: BriefingRole,
    date: string,
    yesterdayStr: string
  ): Promise<BriefingContent> {
    // Get metrics
    const metrics = await this.getMetrics(userId, institutionId, role, date);

    // Get priorities
    const priorities = await this.getPriorities(userId, institutionId, role);

    // Get hot leads
    const hotLeads = await this.getHotLeads(userId, institutionId, role);

    // Get scheduled items
    const scheduled = await this.getScheduledItems(userId, institutionId, role, date);

    // Get yesterday recap
    const yesterdayRecap = await this.getYesterdayRecap(userId, institutionId, role, yesterdayStr);

    // Generate summary
    const summary = this.generateSummary(metrics, priorities.length, hotLeads.length);

    return {
      summary,
      priorities,
      metrics,
      hot_leads: hotLeads,
      scheduled,
      yesterday_recap: yesterdayRecap
    };
  }

  /**
   * Get metrics for the user
   */
  private static async getMetrics(
    userId: string,
    institutionId: string,
    role: BriefingRole,
    date: string
  ): Promise<BriefingMetrics> {
    const today = new Date(date);
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString();

    // Build query based on role
    // FIX: next_followup_at does not exist in DB → use last_contact_at instead
    let query = (this.supabase as any)
      .from('admission_leads')
      .select('id, funnel_stage, created_at, last_contact_at')
      .eq('institution_id', institutionId);

    // Counselors only see their assigned leads
    if (role === 'counselor') {
      query = query.eq('counselor_id', userId);
    }

    const { data: leads, error } = await query;

    if (error) {
      console.error('[DailyBriefingService] Error fetching metrics:', error);
      return {
        new_leads: 0,
        follow_ups_due: 0,
        conversions: 0,
        total_leads: 0,
        conversion_rate: 0
      };
    }

    const allLeads = leads || [];
    const totalLeads = allLeads.length;
    const newLeads = allLeads.filter((l: any) =>
      new Date(l.created_at) >= today
    ).length;
    const conversions = allLeads.filter((l: any) =>
      l.funnel_stage === 'enrolled'
    ).length;
    // FIX: next_followup_at doesn't exist → count leads not contacted in 3+ days as needing follow-up
    const threeDaysAgo = new Date(today.getTime() - 3 * 24 * 60 * 60 * 1000);
    const followUpsDue = allLeads.filter((l: any) => {
      if (l.funnel_stage === 'enrolled' || l.funnel_stage === 'lost') return false;
      if (!l.last_contact_at) return true; // Never contacted = needs follow-up
      return new Date(l.last_contact_at) < threeDaysAgo;
    }).length;

    const conversionRate = totalLeads > 0 ? (conversions / totalLeads) * 100 : 0;

    return {
      new_leads: newLeads,
      follow_ups_due: followUpsDue,
      conversions,
      total_leads: totalLeads,
      conversion_rate: Math.round(conversionRate * 10) / 10
    };
  }

  /**
   * Get priority items for the user
   */
  private static async getPriorities(
    userId: string,
    institutionId: string,
    role: BriefingRole
  ): Promise<BriefingPriority[]> {
    // Get overdue follow-ups and hot leads that need attention
    // FIX: priority and next_followup_at do not exist in DB
    // → use is_hot_lead, is_priority, last_contact_at instead
    let query = (this.supabase as any)
      .from('admission_leads')
      .select('id, full_name, is_hot_lead, is_priority, last_contact_at, funnel_stage')
      .eq('institution_id', institutionId)
      .not('funnel_stage', 'in', '(enrolled,lost)')
      .order('is_hot_lead', { ascending: false })
      .limit(5);

    if (role === 'counselor') {
      query = query.eq('counselor_id', userId);
    }

    const { data: leads, error } = await query;

    if (error) {
      console.error('[DailyBriefingService] Error fetching priorities:', error);
      return [];
    }

    return (leads || []).map((lead: any) => {
      let reason = 'Active lead in pipeline';
      // FIX: priority === 'hot' → is_hot_lead boolean
      if (lead.is_hot_lead) {
        reason = 'Hot lead - high conversion potential';
      } else if (lead.last_contact_at && new Date(lead.last_contact_at) < new Date(Date.now() - 3 * 24 * 60 * 60 * 1000)) {
        reason = 'Overdue follow-up - needs immediate attention';
      } else if (lead.funnel_stage === 'offer_sent') {
        reason = 'Pending offer acceptance';
      }

      return {
        title: `Follow up with ${lead.full_name}`,
        lead_id: lead.id,
        reason
      };
    });
  }

  /**
   * Get hot leads for the user
   */
  private static async getHotLeads(
    userId: string,
    institutionId: string,
    role: BriefingRole
  ): Promise<BriefingHotLead[]> {
    // FIX: priority column does not exist → use is_hot_lead boolean instead
    let query = (this.supabase as any)
      .from('admission_leads')
      .select('id, full_name, phone, score, is_hot_lead, funnel_stage')
      .eq('institution_id', institutionId)
      .eq('is_hot_lead', true)
      .not('funnel_stage', 'in', '(enrolled,lost)')
      .order('score', { ascending: false })
      .limit(5);

    if (role === 'counselor') {
      query = query.eq('counselor_id', userId);
    }

    const { data: leads, error } = await query;

    if (error) {
      console.error('[DailyBriefingService] Error fetching hot leads:', error);
      return [];
    }

    return (leads || []).map((lead: any) => {
      let reason = 'Marked as hot lead';
      if (lead.score >= 80) {
        reason = 'High engagement score';
      } else if (lead.funnel_stage === 'qualified') {
        reason = 'Qualified and ready to convert';
      } else if (lead.funnel_stage === 'offer_sent') {
        reason = 'Offer sent - close to conversion';
      }

      return {
        id: lead.id,
        name: lead.full_name,
        score: lead.score || 0,
        reason,
        phone: lead.phone
      };
    });
  }

  /**
   * Get scheduled items for today
   */
  private static async getScheduledItems(
    userId: string,
    institutionId: string,
    role: BriefingRole,
    date: string
  ): Promise<BriefingScheduledItem[]> {
    // FIX: next_followup_at does not exist in DB
    // Instead, find leads that need attention today based on last_contact_at
    // (leads not contacted recently that are in active pipeline stages)
    const threeDaysAgo = new Date(date);
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

    let query = (this.supabase as any)
      .from('admission_leads')
      .select('id, full_name, last_contact_at, funnel_stage')
      .eq('institution_id', institutionId)
      .not('funnel_stage', 'in', '(enrolled,lost)')
      .order('last_contact_at', { ascending: true, nullsFirst: true })
      .limit(10);

    if (role === 'counselor') {
      query = query.eq('counselor_id', userId);
    }

    const { data: leads, error } = await query;

    if (error) {
      console.error('[DailyBriefingService] Error fetching scheduled items:', error);
      return [];
    }

    // Filter to leads needing follow-up (not contacted in 3+ days or never contacted)
    const needsFollowup = (leads || []).filter((lead: any) => {
      if (!lead.last_contact_at) return true;
      return new Date(lead.last_contact_at) < threeDaysAgo;
    });

    return needsFollowup.map((lead: any) => {
      const timeStr = '09:00 AM'; // Default suggested time since no schedule exists

      let action = 'Follow-up call';
      if (lead.funnel_stage === 'interview_scheduled') {
        action = 'Interview';
      } else if (lead.funnel_stage === 'documents_pending') {
        action = 'Document collection';
      } else if (lead.funnel_stage === 'offer_sent') {
        action = 'Offer follow-up';
      }

      return {
        time: timeStr,
        lead_name: lead.full_name,
        action,
        lead_id: lead.id
      };
    });
  }

  /**
   * Get yesterday's recap
   */
  private static async getYesterdayRecap(
    userId: string,
    institutionId: string,
    role: BriefingRole,
    yesterdayStr: string
  ): Promise<BriefingYesterdayRecap> {
    const startOfYesterday = `${yesterdayStr}T00:00:00`;
    const endOfYesterday = `${yesterdayStr}T23:59:59`;

    // Get activities from yesterday
    let activityQuery = (this.supabase as any)
      .from('admission_lead_activities')
      .select('id, activity_type')
      .eq('institution_id', institutionId)
      .gte('created_at', startOfYesterday)
      .lte('created_at', endOfYesterday);

    if (role === 'counselor') {
      activityQuery = activityQuery.eq('performed_by', userId);
    }

    const { data: activities, error: activitiesError } = await activityQuery;

    // Get leads created yesterday
    let leadsQuery = (this.supabase as any)
      .from('admission_leads')
      .select('id')
      .eq('institution_id', institutionId)
      .gte('created_at', startOfYesterday)
      .lte('created_at', endOfYesterday);

    if (role === 'counselor') {
      leadsQuery = leadsQuery.eq('counselor_id', userId);
    }

    const { data: newLeads, error: leadsError } = await leadsQuery;

    // Get conversions (enrollments) yesterday
    let conversionsQuery = (this.supabase as any)
      .from('admission_lead_stage_history')
      .select('id')
      .eq('to_stage', 'enrolled')
      .gte('created_at', startOfYesterday)
      .lte('created_at', endOfYesterday);

    const { data: conversions } = await conversionsQuery;

    const allActivities = activities || [];
    const contactsMade = allActivities.filter((a: any) =>
      ['call', 'email', 'sms', 'whatsapp', 'meeting'].includes(a.activity_type)
    ).length;
    const meetingsHeld = allActivities.filter((a: any) =>
      a.activity_type === 'meeting'
    ).length;

    return {
      contacts_made: contactsMade,
      conversions: (conversions || []).length,
      new_leads: (newLeads || []).length,
      meetings_held: meetingsHeld
    };
  }

  /**
   * Generate team performance metrics (for managers/admins)
   */
  private static async generateTeamPerformance(
    institutionId: string,
    yesterdayStr: string
  ): Promise<TeamPerformance> {
    // Get counselors and their performance
    const { data: counselors } = await (this.supabase as any)
      .from('admission_counselors')
      .select('id, name')
      .eq('institution_id', institutionId)
      .eq('is_active', true);

    const topPerformers: Array<{ name: string; conversions: number; leads_handled: number }> = [];

    for (const counselor of (counselors || []).slice(0, 5)) {
      const { data: leads } = await (this.supabase as any)
        .from('admission_leads')
        .select('id, funnel_stage')
        .eq('counselor_id', counselor.id);

      const allLeads = leads || [];
      const conversions = allLeads.filter((l: any) => l.funnel_stage === 'enrolled').length;

      topPerformers.push({
        name: counselor.name,
        conversions,
        leads_handled: allLeads.length
      });
    }

    // Sort by conversions
    topPerformers.sort((a, b) => b.conversions - a.conversions);

    // Get escalations (leads marked as needing attention or stuck)
    // FIX: priority column does not exist → use is_hot_lead boolean instead
    const { data: escalations } = await (this.supabase as any)
      .from('admission_leads')
      .select('id')
      .eq('institution_id', institutionId)
      .eq('is_hot_lead', true)
      .lt('updated_at', new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString()); // Not updated in 3 days

    return {
      top_performers: topPerformers.slice(0, 3),
      escalations: (escalations || []).length,
      pending_reviews: 0 // Can be extended to track pending reviews
    };
  }

  /**
   * Generate institution-wide metrics (for admins)
   */
  private static async generateInstitutionMetrics(
    institutionId: string
  ): Promise<InstitutionMetrics> {
    // Get total conversions this month
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const { data: conversions } = await (this.supabase as any)
      .from('admission_leads')
      .select('id')
      .eq('institution_id', institutionId)
      .eq('funnel_stage', 'enrolled')
      .gte('updated_at', startOfMonth.toISOString());

    // Get total leads in pipeline
    const { data: pipeline } = await (this.supabase as any)
      .from('admission_leads')
      .select('id')
      .eq('institution_id', institutionId)
      .not('funnel_stage', 'in', '(enrolled,lost)');

    // Calculate growth (compare to last month)
    const lastMonthStart = new Date(startOfMonth);
    lastMonthStart.setMonth(lastMonthStart.getMonth() - 1);
    const lastMonthEnd = new Date(startOfMonth);
    lastMonthEnd.setDate(lastMonthEnd.getDate() - 1);

    const { data: lastMonthConversions } = await (this.supabase as any)
      .from('admission_leads')
      .select('id')
      .eq('institution_id', institutionId)
      .eq('funnel_stage', 'enrolled')
      .gte('updated_at', lastMonthStart.toISOString())
      .lte('updated_at', lastMonthEnd.toISOString());

    const currentConversions = (conversions || []).length;
    const previousConversions = (lastMonthConversions || []).length;
    const growthRate = previousConversions > 0
      ? ((currentConversions - previousConversions) / previousConversions) * 100
      : 0;

    return {
      total_conversions: currentConversions,
      pipeline_value: (pipeline || []).length,
      growth_rate: Math.round(growthRate * 10) / 10
    };
  }

  /**
   * Generate a human-readable summary
   */
  private static generateSummary(
    metrics: BriefingMetrics,
    priorityCount: number,
    hotLeadCount: number
  ): string {
    const parts: string[] = [];

    if (metrics.follow_ups_due > 0) {
      parts.push(`${metrics.follow_ups_due} follow-up${metrics.follow_ups_due > 1 ? 's' : ''} due today`);
    }

    if (metrics.new_leads > 0) {
      parts.push(`${metrics.new_leads} new lead${metrics.new_leads > 1 ? 's' : ''}`);
    }

    if (hotLeadCount > 0) {
      parts.push(`${hotLeadCount} hot lead${hotLeadCount > 1 ? 's' : ''} ready to convert`);
    }

    if (parts.length === 0) {
      return 'Your pipeline is quiet today. Focus on nurturing existing leads.';
    }

    return `Today: ${parts.join(', ')}. Conversion rate: ${metrics.conversion_rate}%.`;
  }
}
