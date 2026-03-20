// lib/services/admission/data-quality-service.ts
// Service for phone validation, data profiling, and deduplication

import { createClientSupabaseClient } from '@/lib/supabase/client';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface PhoneValidationStats {
  total: number;
  valid: number;
  invalid: number;
  missing: number;
  validPercentage: number;
}

export interface InvalidPhoneRecord {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  issue: string;
  source: string | null;
  created_at: string;
}

export interface PhoneIssueBreakdown {
  issue: string;
  count: number;
  percentage: number;
}

export interface DataProfilingMetrics {
  overall: number;
  completeness: number;
  validity: number;
  totalLeads: number;
}

export interface FieldAnalysis {
  field: string;
  completeness: number;
  validity: number;
  issues: number;
  status: 'good' | 'warning' | 'critical';
}

export interface DataIssue {
  type: string;
  count: number;
  severity: 'critical' | 'warning' | 'low';
  affectedPercentage: number;
}

export interface DeduplicationStats {
  totalLeads: number;
  duplicateGroups: number;
  totalDuplicates: number;
  duplicatePercentage: number;
}

export interface DuplicateGroup {
  matchType: string;
  matchValue: string;
  confidence: number;
  records: Array<{
    id: string;
    full_name: string;
    phone: string | null;
    email: string | null;
    source: string | null;
    created_at: string;
    score: number | null;
  }>;
}

// ═══════════════════════════════════════════════════════════════════════════
// SERVICE
// ═══════════════════════════════════════════════════════════════════════════

export class DataQualityService {
  // Indian mobile phone regex: starts with 6-9, exactly 10 digits
  private static VALID_PHONE_REGEX = /^[6-9]\d{9}$/;
  private static REPEATED_DIGITS_REGEX = /^(\d)\1{9}$/;

  private static classifyPhoneIssue(phone: string | null): string | null {
    if (!phone || phone.trim() === '') return 'Missing phone';
    const cleaned = phone.replace(/[\s\-+()]/g, '');
    // Remove +91 prefix
    const normalized = cleaned.replace(/^91/, '').replace(/^0/, '');
    if (/[a-zA-Z]/.test(normalized)) return 'Contains letters';
    if (normalized.length < 10) return 'Too short';
    if (normalized.length > 10) return 'Too long';
    if (this.REPEATED_DIGITS_REGEX.test(normalized)) return 'Repeated digits';
    if (!/^[6-9]/.test(normalized)) return 'Invalid pattern';
    return null; // Valid
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PHONE VALIDATION
  // ─────────────────────────────────────────────────────────────────────────

  static async getPhoneValidationStats(institutionId: string): Promise<PhoneValidationStats> {
    const supabase = createClientSupabaseClient();
    const { data, error } = await (supabase as any)
      .from('admission_leads')
      .select('id, phone')
      .eq('institution_id', institutionId);

    if (error) throw error;
    const leads = data || [];
    const total = leads.length;
    let valid = 0;
    let invalid = 0;
    let missing = 0;

    for (const lead of leads) {
      const issue = this.classifyPhoneIssue(lead.phone);
      if (!issue) {
        valid++;
      } else if (issue === 'Missing phone') {
        missing++;
      } else {
        invalid++;
      }
    }

    return {
      total,
      valid,
      invalid,
      missing,
      validPercentage: total > 0 ? Math.round((valid / total) * 1000) / 10 : 0,
    };
  }

  static async getInvalidPhones(
    institutionId: string,
    options?: { search?: string; issueFilter?: string }
  ): Promise<InvalidPhoneRecord[]> {
    const supabase = createClientSupabaseClient();
    const { data, error } = await (supabase as any)
      .from('admission_leads')
      .select('id, full_name, phone, email, source, created_at')
      .eq('institution_id', institutionId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    const invalidRecords: InvalidPhoneRecord[] = [];
    for (const lead of data || []) {
      const issue = this.classifyPhoneIssue(lead.phone);
      if (issue) {
        invalidRecords.push({
          id: lead.id,
          full_name: lead.full_name || '',
          phone: lead.phone,
          email: lead.email,
          issue,
          source: lead.source,
          created_at: lead.created_at,
        });
      }
    }

    // Apply filters
    let filtered = invalidRecords;
    if (options?.search) {
      const s = options.search.toLowerCase();
      filtered = filtered.filter(
        (r) =>
          r.full_name.toLowerCase().includes(s) ||
          (r.phone || '').includes(s) ||
          (r.email || '').toLowerCase().includes(s)
      );
    }
    if (options?.issueFilter && options.issueFilter !== 'all') {
      filtered = filtered.filter((r) => r.issue === options.issueFilter);
    }

    return filtered;
  }

  static async getPhoneIssueBreakdown(institutionId: string): Promise<PhoneIssueBreakdown[]> {
    const supabase = createClientSupabaseClient();
    const { data, error } = await (supabase as any)
      .from('admission_leads')
      .select('phone')
      .eq('institution_id', institutionId);

    if (error) throw error;

    const issueCounts: Record<string, number> = {};
    let totalInvalid = 0;

    for (const lead of data || []) {
      const issue = this.classifyPhoneIssue(lead.phone);
      if (issue) {
        issueCounts[issue] = (issueCounts[issue] || 0) + 1;
        totalInvalid++;
      }
    }

    return Object.entries(issueCounts)
      .map(([issue, count]) => ({
        issue,
        count,
        percentage: totalInvalid > 0 ? Math.round((count / totalInvalid) * 1000) / 10 : 0,
      }))
      .sort((a, b) => b.count - a.count);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // DATA PROFILING
  // ─────────────────────────────────────────────────────────────────────────

  private static readonly PROFILED_FIELDS = [
    'full_name',
    'email',
    'phone',
    'city',
    'state',
    'date_of_birth',
    'interested_programs',
    'source',
    'counselor_id',
    'gender',
  ];

  static async getDataProfilingMetrics(institutionId: string): Promise<DataProfilingMetrics> {
    const supabase = createClientSupabaseClient();
    const { data, error } = await (supabase as any)
      .from('admission_leads')
      .select('*')
      .eq('institution_id', institutionId);

    if (error) throw error;
    const leads = data || [];
    const totalLeads = leads.length;

    if (totalLeads === 0) {
      return { overall: 0, completeness: 0, validity: 0, totalLeads: 0 };
    }

    // Calculate completeness: % of non-null fields across all leads
    let totalFields = 0;
    let filledFields = 0;
    let validFields = 0;

    for (const lead of leads) {
      for (const field of this.PROFILED_FIELDS) {
        totalFields++;
        const val = lead[field];
        if (val !== null && val !== undefined && val !== '') {
          filledFields++;
          // Basic validity checks
          if (field === 'email' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) validFields++;
          else if (field === 'phone' && !this.classifyPhoneIssue(val)) validFields++;
          else if (field !== 'email' && field !== 'phone') validFields++;
        }
      }
    }

    const completeness = totalFields > 0 ? Math.round((filledFields / totalFields) * 100) : 0;
    const validity = filledFields > 0 ? Math.round((validFields / filledFields) * 100) : 0;
    const overall = Math.round((completeness + validity) / 2);

    return { overall, completeness, validity, totalLeads };
  }

  static async getFieldAnalysis(institutionId: string): Promise<FieldAnalysis[]> {
    const supabase = createClientSupabaseClient();
    const { data, error } = await (supabase as any)
      .from('admission_leads')
      .select('*')
      .eq('institution_id', institutionId);

    if (error) throw error;
    const leads = data || [];
    const totalLeads = leads.length;

    if (totalLeads === 0) return [];

    return this.PROFILED_FIELDS.map((field) => {
      let filled = 0;
      let valid = 0;

      for (const lead of leads) {
        const val = lead[field];
        if (val !== null && val !== undefined && val !== '') {
          filled++;
          if (field === 'email') {
            if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) valid++;
          } else if (field === 'phone') {
            if (!this.classifyPhoneIssue(val)) valid++;
          } else {
            valid++;
          }
        }
      }

      const completeness = Math.round((filled / totalLeads) * 100);
      const validity = filled > 0 ? Math.round((valid / filled) * 100) : 0;
      const issues = totalLeads - filled + (filled - valid);
      const status: 'good' | 'warning' | 'critical' =
        completeness >= 80 && validity >= 80 ? 'good' :
        completeness >= 50 ? 'warning' : 'critical';

      return { field, completeness, validity, issues, status };
    });
  }

  static async getDataIssues(institutionId: string): Promise<DataIssue[]> {
    const supabase = createClientSupabaseClient();
    const { data, error } = await (supabase as any)
      .from('admission_leads')
      .select('phone, email, city, state, address_line1, interested_programs, source')
      .eq('institution_id', institutionId);

    if (error) throw error;
    const leads = data || [];
    const total = leads.length;
    if (total === 0) return [];

    let invalidPhone = 0;
    let missingEmail = 0;
    let incompleteAddress = 0;
    let missingProgram = 0;
    let invalidSource = 0;

    for (const lead of leads) {
      if (this.classifyPhoneIssue(lead.phone)) invalidPhone++;
      if (!lead.email || lead.email.trim() === '') missingEmail++;
      if (!lead.city && !lead.state && !lead.address_line1) incompleteAddress++;
      if (!lead.interested_programs || (Array.isArray(lead.interested_programs) && lead.interested_programs.length === 0)) missingProgram++;
      if (!lead.source || lead.source.trim() === '') invalidSource++;
    }

    const issues: DataIssue[] = [];
    if (invalidPhone > 0)
      issues.push({ type: 'Invalid Phone', count: invalidPhone, severity: invalidPhone > total * 0.1 ? 'critical' : 'warning', affectedPercentage: Math.round((invalidPhone / total) * 1000) / 10 });
    if (missingEmail > 0)
      issues.push({ type: 'Missing Email', count: missingEmail, severity: missingEmail > total * 0.1 ? 'warning' : 'low', affectedPercentage: Math.round((missingEmail / total) * 1000) / 10 });
    if (incompleteAddress > 0)
      issues.push({ type: 'Incomplete Address', count: incompleteAddress, severity: incompleteAddress > total * 0.2 ? 'critical' : 'warning', affectedPercentage: Math.round((incompleteAddress / total) * 1000) / 10 });
    if (missingProgram > 0)
      issues.push({ type: 'Missing Program Interest', count: missingProgram, severity: 'low', affectedPercentage: Math.round((missingProgram / total) * 1000) / 10 });
    if (invalidSource > 0)
      issues.push({ type: 'Missing Source', count: invalidSource, severity: 'low', affectedPercentage: Math.round((invalidSource / total) * 1000) / 10 });

    return issues.sort((a, b) => b.count - a.count);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // DEDUPLICATION
  // ─────────────────────────────────────────────────────────────────────────

  static async getDeduplicationStats(institutionId: string): Promise<DeduplicationStats> {
    const groups = await this.findDuplicates(institutionId);
    const totalDuplicates = groups.reduce((sum, g) => sum + g.records.length - 1, 0);

    const supabase = createClientSupabaseClient();
    const { count, error } = await (supabase as any)
      .from('admission_leads')
      .select('id', { count: 'exact', head: true })
      .eq('institution_id', institutionId);

    if (error) throw error;
    const totalLeads = count || 0;

    return {
      totalLeads,
      duplicateGroups: groups.length,
      totalDuplicates,
      duplicatePercentage: totalLeads > 0 ? Math.round((totalDuplicates / totalLeads) * 1000) / 10 : 0,
    };
  }

  static async findDuplicates(institutionId: string): Promise<DuplicateGroup[]> {
    const supabase = createClientSupabaseClient();
    const { data, error } = await (supabase as any)
      .from('admission_leads')
      .select('id, full_name, phone, email, source, created_at, score')
      .eq('institution_id', institutionId)
      .order('created_at', { ascending: true });

    if (error) throw error;
    const leads = data || [];

    const groups: DuplicateGroup[] = [];
    const processedIds = new Set<string>();

    // Find duplicates by email
    const emailMap = new Map<string, typeof leads>();
    for (const lead of leads) {
      if (lead.email && lead.email.trim() !== '') {
        const email = lead.email.toLowerCase().trim();
        if (!emailMap.has(email)) emailMap.set(email, []);
        emailMap.get(email)!.push(lead);
      }
    }
    for (const [email, records] of emailMap) {
      if (records.length > 1) {
        for (const r of records) processedIds.add(r.id);
        groups.push({
          matchType: 'Email',
          matchValue: email,
          confidence: 95,
          records: records.map((r: any) => ({
            id: r.id,
            full_name: r.full_name || '',
            phone: r.phone,
            email: r.email,
            source: r.source,
            created_at: r.created_at,
            score: r.score,
          })),
        });
      }
    }

    // Find duplicates by phone (excluding already grouped by email)
    const phoneMap = new Map<string, typeof leads>();
    for (const lead of leads) {
      if (processedIds.has(lead.id)) continue;
      if (lead.phone && lead.phone.trim() !== '') {
        const phone = lead.phone.replace(/[\s\-+()]/g, '').replace(/^91/, '').replace(/^0/, '');
        if (phone.length >= 10) {
          const key = phone.slice(-10);
          if (!phoneMap.has(key)) phoneMap.set(key, []);
          phoneMap.get(key)!.push(lead);
        }
      }
    }
    for (const [phone, records] of phoneMap) {
      if (records.length > 1) {
        groups.push({
          matchType: 'Phone',
          matchValue: phone,
          confidence: 90,
          records: records.map((r: any) => ({
            id: r.id,
            full_name: r.full_name || '',
            phone: r.phone,
            email: r.email,
            source: r.source,
            created_at: r.created_at,
            score: r.score,
          })),
        });
      }
    }

    return groups.sort((a, b) => b.confidence - a.confidence);
  }
}
