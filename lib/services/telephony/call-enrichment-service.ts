import { SupabaseClient } from '@supabase/supabase-js';

interface EnrichmentResult {
  name?: string;
  location?: string;
  course?: string;
  applied: boolean;
}

/**
 * Extract name, course, and location from call transcription text
 * using deterministic keyword patterns (not AI).
 * Fast and predictable — regex for "my name is X", "B.Pharm", "from Chennai".
 */
export class CallEnrichmentService {
  // Course patterns: pharmacy, nursing, engineering, arts, etc.
  private static readonly COURSE_PATTERNS: { pattern: RegExp; course: string }[] = [
    { pattern: /\bb\.?\s*pharm(?:acy)?\b/i, course: 'B.Pharm' },
    { pattern: /\bd\.?\s*pharm(?:acy)?\b/i, course: 'D.Pharm' },
    { pattern: /\bm\.?\s*pharm(?:acy)?\b/i, course: 'M.Pharm' },
    { pattern: /\bpharm\.?\s*d\b/i, course: 'Pharm.D' },
    { pattern: /\bb\.?\s*sc\b.*\bnurs/i, course: 'B.Sc Nursing' },
    { pattern: /\bm\.?\s*sc\b.*\bnurs/i, course: 'M.Sc Nursing' },
    { pattern: /\bgnm\b/i, course: 'GNM' },
    { pattern: /\bb\.?\s*tech\b/i, course: 'B.Tech' },
    { pattern: /\bm\.?\s*tech\b/i, course: 'M.Tech' },
    { pattern: /\bb\.?\s*e\.?\b/i, course: 'B.E' },
    { pattern: /\bmba\b/i, course: 'MBA' },
    { pattern: /\bmca\b/i, course: 'MCA' },
    { pattern: /\bb\.?\s*com\b/i, course: 'B.Com' },
    { pattern: /\bb\.?\s*sc\b/i, course: 'B.Sc' },
    { pattern: /\bb\.?\s*a\.?\b/i, course: 'B.A' },
    { pattern: /\bbpt\b/i, course: 'BPT' },
    { pattern: /\bmlsc\b|medical lab/i, course: 'BMLS' },
    { pattern: /\bradio(?:graphy|logy)\b/i, course: 'B.Sc Radiography' },
    { pattern: /\boptometr/i, course: 'B.Sc Optometry' },
    { pattern: /\banesthe/i, course: 'B.Sc Anesthesia' },
    { pattern: /\bdialysis\b/i, course: 'B.Sc Dialysis' },
    { pattern: /\bphysio/i, course: 'BPT' },
  ];

  // Tamil Nadu cities and districts
  private static readonly LOCATION_PATTERNS: string[] = [
    'Chennai', 'Coimbatore', 'Madurai', 'Trichy', 'Tiruchirappalli',
    'Salem', 'Tirunelveli', 'Erode', 'Namakkal', 'Karur',
    'Thanjavur', 'Dindigul', 'Vellore', 'Thoothukudi', 'Tirupur',
    'Cuddalore', 'Kanchipuram', 'Tiruvallur', 'Villupuram',
    'Ramanathapuram', 'Sivaganga', 'Virudhunagar', 'Theni',
    'Perambalur', 'Ariyalur', 'Krishnagiri', 'Dharmapuri',
    'Nilgiris', 'Pudukkottai', 'Nagapattinam', 'Thiruvarur',
    'Kovilpatti', 'Kumarapalayam', 'Rasipuram', 'Tiruchengode',
    'Paramathi', 'Velur', 'Bangalore', 'Bengaluru', 'Hyderabad',
    'Kerala', 'Kochi', 'Calicut', 'Pondicherry', 'Puducherry',
  ];

  /**
   * Extract structured data from transcription text.
   */
  static extractFromTranscription(text: string): EnrichmentResult {
    if (!text || text.trim().length < 10) {
      return { applied: false };
    }

    const name = this.extractName(text);
    const course = this.extractCourse(text);
    const location = this.extractLocation(text);

    return {
      name: name ?? undefined,
      course: course ?? undefined,
      location: location ?? undefined,
      applied: !!(name || course || location),
    };
  }

  /**
   * Apply extracted data to a lead record.
   * Only updates fields that are currently empty/generic.
   */
  static async applyToLead(
    leadId: string,
    enrichment: EnrichmentResult,
    intelligenceId: string,
    supabase: SupabaseClient
  ): Promise<boolean> {
    if (!enrichment.applied) return false;

    // Fetch current lead
    const { data: lead } = await supabase
      .from('admission_leads')
      .select('first_name, city, interested_course')
      .eq('id', leadId)
      .single();

    if (!lead) return false;

    const updates: Record<string, string> = {};

    // Only overwrite if current value is generic (Caller XXXX) or empty
    if (enrichment.name && (!lead.first_name || /^Caller\s+\d+$/i.test(lead.first_name))) {
      updates.first_name = enrichment.name;
    }
    if (enrichment.location && !lead.city) {
      updates.city = enrichment.location;
    }
    if (enrichment.course && !lead.interested_course) {
      updates.interested_course = enrichment.course;
    }

    if (Object.keys(updates).length === 0) return false;

    const { error } = await supabase
      .from('admission_leads')
      .update(updates)
      .eq('id', leadId);

    if (!error) {
      // Mark enrichment as applied
      await supabase
        .from('admission_call_intelligence')
        .update({
          enrichment_applied: true,
          enrichment_applied_at: new Date().toISOString(),
        })
        .eq('id', intelligenceId);
    }

    return !error;
  }

  private static extractName(text: string): string | null {
    // "my name is X", "I am X", "this is X calling"
    const patterns = [
      /my name is\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i,
      /(?:I am|I'm)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i,
      /this is\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+(?:calling|speaking|here)/i,
      /(?:call me|name)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i,
    ];

    for (const p of patterns) {
      const match = text.match(p);
      if (match?.[1]) {
        const name = match[1].trim();
        // Skip generic words
        if (!['Sir', 'Madam', 'Hello', 'Please', 'Thank', 'Good'].includes(name)) {
          return name;
        }
      }
    }
    return null;
  }

  private static extractCourse(text: string): string | null {
    for (const { pattern, course } of this.COURSE_PATTERNS) {
      if (pattern.test(text)) return course;
    }
    return null;
  }

  private static extractLocation(text: string): string | null {
    const lowerText = text.toLowerCase();
    // "from X", "in X", "at X", or just the city name
    for (const city of this.LOCATION_PATTERNS) {
      const fromPattern = new RegExp(`(?:from|in|at|near)\\s+${city}`, 'i');
      if (fromPattern.test(text)) return city;
    }
    // Fallback: just check if city name appears
    for (const city of this.LOCATION_PATTERNS) {
      if (lowerText.includes(city.toLowerCase())) return city;
    }
    return null;
  }
}
