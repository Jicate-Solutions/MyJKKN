// lib/services/solutions/publications-service.ts
// CRUD operations for sh_publications, sh_publication_contributors, sh_accreditation_metrics

import { BaseService, type BaseListResponse } from '../base-service';
import type {
  Publication,
  PublicationContributor,
  AccreditationMetric,
  PaperType,
  JournalType,
  PublicationStatus,
  PaginationParams,
} from './types';

// ============================================
// TYPES
// ============================================

export interface PublicationWithSolution extends Publication {
  solution?: {
    id: string;
    title: string;
    solution_code: string;
    solution_type: string;
  };
}

export interface PublicationFilters extends PaginationParams {
  [key: string]: unknown;
  solution_id?: string;
  paper_type?: PaperType;
  journal_type?: JournalType;
  status?: PublicationStatus;
  nirf_category?: string;
  naac_criterion?: string;
}

export interface CreatePublicationInput {
  solution_id: string;
  phase_id?: string;
  paper_type?: PaperType;
  title: string;
  authors?: Array<{ name: string; affiliation?: string }>;
  abstract?: string;
  journal_name?: string;
  journal_type?: JournalType;
  submission_date?: string;
  nirf_category?: string;
  naac_criterion?: string;
  created_by: string;
}

export interface UpdatePublicationInput {
  paper_type?: PaperType;
  title?: string;
  authors?: Array<{ name: string; affiliation?: string }>;
  abstract?: string;
  journal_name?: string;
  journal_type?: JournalType;
  status?: PublicationStatus;
  submission_date?: string;
  publication_date?: string;
  doi?: string;
  url?: string;
  nirf_category?: string;
  naac_criterion?: string;
}

export interface AddContributorInput {
  publication_id: string;
  builder_id?: string;
  cohort_member_id?: string;
  learner_id?: string;
  contribution_type: string;
  credit_type?: 'coauthor' | 'acknowledgment';
}

export interface PublicationStats {
  total: number;
  byPaperType: Record<PaperType, number>;
  byJournalType: Record<JournalType, number>;
  byStatus: Record<PublicationStatus, number>;
  byNirfCategory: Record<string, number>;
  byNaacCriterion: Record<string, number>;
  publishedCount: number;
  inProgressCount: number;
}

// NIRF and NAAC metrics interfaces
export interface NIRFMetrics {
  RP: {
    totalPublications: number;
    scopusPublications: number;
    wosPublications: number;
    ugcPublications: number;
    consultancyProjects: number;
    score: number;
    maxScore: number;
  };
  totalScore: number;
  maxTotalScore: number;
}

export interface NAACCriteria {
  C3: {
    publications: number;
    consultancy: number;
    extension: number;
    collaboration: number;
    score: number;
    maxScore: number;
  };
  totalScore: number;
  maxTotalScore: number;
  cgpa: number;
  grade: string;
}

// ============================================
// HELPER FUNCTIONS
// ============================================

function escapeSearchString(str: string): string {
  return str.replace(/[%_\\]/g, '\\$&');
}

// ============================================
// SERVICE CLASS
// ============================================

export class PublicationsService extends BaseService {
  /**
   * Get all publications with optional filters
   */
  static async getPublications(
    filters?: PublicationFilters
  ): Promise<BaseListResponse<PublicationWithSolution>> {
    const { page, limit } = this.validate(filters?.page, filters?.limit);

    let query = this.supabase.from('sh_publications')
      .select(
        `
        *,
        solution:sh_solutions(id, title, solution_code, solution_type)
      `,
        { count: 'exact' }
      )
      .order('created_at', { ascending: false });

    // Apply filters
    if (filters?.solution_id) {
      query = query.eq('solution_id', filters.solution_id);
    }

    if (filters?.paper_type) {
      query = query.eq('paper_type', filters.paper_type);
    }

    if (filters?.journal_type) {
      query = query.eq('journal_type', filters.journal_type);
    }

    if (filters?.status) {
      query = query.eq('status', filters.status);
    }

    if (filters?.nirf_category) {
      query = query.eq('nirf_category', filters.nirf_category);
    }

    if (filters?.naac_criterion) {
      query = query.eq('naac_criterion', filters.naac_criterion);
    }

    if (filters?.search) {
      const escaped = escapeSearchString(filters.search);
      query = query.or(`title.ilike.%${escaped}%,journal_name.ilike.%${escaped}%`);
    }

    // Apply pagination
    const start = (page - 1) * limit;
    const end = start + limit - 1;
    query = query.range(start, end);

    const { data, count, error } = await query;

    if (error) throw new Error(`Failed to fetch publications: ${error.message}`);

    const total = count || 0;
    return {
      data: (data || []) as PublicationWithSolution[],
      metadata: {
        total,
        page,
        limit,
        totalPages: total > 0 ? Math.ceil(total / limit) : 0,
      },
    };
  }

  /**
   * Get a single publication by ID
   */
  static async getPublicationById(id: string): Promise<PublicationWithSolution | null> {
    const { data, error } = await this.supabase.from('sh_publications')
      .select(
        `
        *,
        solution:sh_solutions(id, title, solution_code, solution_type, client_id)
      `
      )
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw new Error(`Failed to fetch publication: ${error.message}`);
    }

    return data as PublicationWithSolution;
  }

  /**
   * Create a new publication
   */
  static async createPublication(input: CreatePublicationInput): Promise<Publication> {
    const { data, error } = await this.supabase.from('sh_publications')
      .insert({
        solution_id: input.solution_id,
        phase_id: input.phase_id,
        paper_type: input.paper_type,
        title: input.title,
        authors: input.authors || [],
        abstract: input.abstract,
        journal_name: input.journal_name,
        journal_type: input.journal_type,
        submission_date: input.submission_date,
        nirf_category: input.nirf_category,
        naac_criterion: input.naac_criterion,
        status: 'draft' as PublicationStatus,
        created_by: input.created_by,
      })
      .select()
      .single();

    if (error) throw new Error(`Failed to create publication: ${error.message}`);
    return data as Publication;
  }

  /**
   * Update a publication
   */
  static async updatePublication(id: string, input: UpdatePublicationInput): Promise<Publication> {
    const { data, error } = await this.supabase.from('sh_publications')
      .update({
        ...input,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(`Failed to update publication: ${error.message}`);
    return data as Publication;
  }

  /**
   * Delete a publication
   */
  static async deletePublication(id: string): Promise<void> {
    const { error } = await this.supabase.from('sh_publications').delete().eq('id', id);

    if (error) throw new Error(`Failed to delete publication: ${error.message}`);
  }

  /**
   * Get publications for a specific solution
   */
  static async getPublicationsBySolution(solutionId: string): Promise<Publication[]> {
    const { data, error } = await this.supabase.from('sh_publications')
      .select('*')
      .eq('solution_id', solutionId)
      .order('created_at', { ascending: false });

    if (error) throw new Error(`Failed to fetch publications by solution: ${error.message}`);
    return (data || []) as Publication[];
  }

  // ============================================
  // CONTRIBUTOR OPERATIONS
  // ============================================

  /**
   * Get contributors for a publication
   */
  static async getContributors(publicationId: string): Promise<PublicationContributor[]> {
    const { data, error } = await this.supabase.from('sh_publication_contributors')
      .select('*')
      .eq('publication_id', publicationId)
      .order('created_at', { ascending: true });

    if (error) throw new Error(`Failed to fetch contributors: ${error.message}`);
    return data as PublicationContributor[];
  }

  /**
   * Add a contributor to a publication
   */
  static async addContributor(input: AddContributorInput): Promise<PublicationContributor> {
    const { data, error } = await this.supabase.from('sh_publication_contributors')
      .insert({
        publication_id: input.publication_id,
        builder_id: input.builder_id,
        cohort_member_id: input.cohort_member_id,
        learner_id: input.learner_id,
        contribution_type: input.contribution_type,
        credit_type: input.credit_type || 'coauthor',
      })
      .select()
      .single();

    if (error) throw new Error(`Failed to add contributor: ${error.message}`);
    return data as PublicationContributor;
  }

  /**
   * Remove a contributor
   */
  static async removeContributor(id: string): Promise<void> {
    const { error } = await this.supabase.from('sh_publication_contributors').delete().eq('id', id);

    if (error) throw new Error(`Failed to remove contributor: ${error.message}`);
  }

  // ============================================
  // STATISTICS & ACCREDITATION
  // ============================================

  /**
   * Get publication statistics
   */
  static async getPublicationStats(): Promise<PublicationStats> {
    const { data, error } = await this.supabase.from('sh_publications')
      .select('paper_type, journal_type, status, nirf_category, naac_criterion');

    if (error) throw new Error(`Failed to fetch publication stats: ${error.message}`);

    const stats: PublicationStats = {
      total: data?.length || 0,
      byPaperType: {
        journal: 0,
        conference: 0,
        patent: 0,
        book_chapter: 0,
        case_study: 0,
      },
      byJournalType: {
        scopus: 0,
        wos: 0,
        ugc: 0,
        other: 0,
      },
      byStatus: {
        draft: 0,
        submitted: 0,
        under_review: 0,
        accepted: 0,
        published: 0,
        rejected: 0,
      },
      byNirfCategory: {},
      byNaacCriterion: {},
      publishedCount: 0,
      inProgressCount: 0,
    };

    data?.forEach((pub) => {
      if (pub.paper_type) {
        stats.byPaperType[pub.paper_type as PaperType]++;
      }
      if (pub.journal_type) {
        stats.byJournalType[pub.journal_type as JournalType]++;
      }
      if (pub.status) {
        stats.byStatus[pub.status as PublicationStatus]++;
        if (pub.status === 'published') {
          stats.publishedCount++;
        } else if (['draft', 'submitted', 'under_review'].includes(pub.status)) {
          stats.inProgressCount++;
        }
      }
      if (pub.nirf_category) {
        stats.byNirfCategory[pub.nirf_category] =
          (stats.byNirfCategory[pub.nirf_category] || 0) + 1;
      }
      if (pub.naac_criterion) {
        stats.byNaacCriterion[pub.naac_criterion] =
          (stats.byNaacCriterion[pub.naac_criterion] || 0) + 1;
      }
    });

    return stats;
  }

  /**
   * Calculate NIRF metrics
   */
  static async calculateNIRFMetrics(): Promise<NIRFMetrics> {
    const pubStats = await this.getPublicationStats();

    // Get consultancy projects (completed solutions)
    const { data: solutions } = await this.supabase.from('sh_solutions')
      .select('id')
      .eq('status', 'completed');

    const consultancyProjects = solutions?.length || 0;

    // Calculate RP score
    const rpScore = Math.min(
      100,
      pubStats.byJournalType.scopus * 10 +
        pubStats.byJournalType.wos * 8 +
        pubStats.byJournalType.ugc * 5 +
        pubStats.byJournalType.other * 2 +
        consultancyProjects * 3
    );

    return {
      RP: {
        totalPublications: pubStats.total,
        scopusPublications: pubStats.byJournalType.scopus,
        wosPublications: pubStats.byJournalType.wos,
        ugcPublications: pubStats.byJournalType.ugc,
        consultancyProjects,
        score: rpScore,
        maxScore: 100,
      },
      totalScore: rpScore,
      maxTotalScore: 400,
    };
  }

  /**
   * Calculate NAAC criteria
   */
  static async calculateNAACCriteria(): Promise<NAACCriteria> {
    const pubStats = await this.getPublicationStats();

    // C3 calculation based on publications
    const c3Publications = Math.min(100, pubStats.total * 4);
    const c3Score = Math.round(c3Publications / 4);

    const criteria: NAACCriteria = {
      C3: {
        publications: c3Publications,
        consultancy: 0,
        extension: 0,
        collaboration: 0,
        score: c3Score,
        maxScore: 250,
      },
      totalScore: c3Score,
      maxTotalScore: 1000,
      cgpa: 0,
      grade: 'D',
    };

    // Calculate CGPA
    criteria.cgpa = parseFloat(((criteria.totalScore / criteria.maxTotalScore) * 4).toFixed(2));

    // Determine grade
    if (criteria.cgpa >= 3.51) criteria.grade = 'A++';
    else if (criteria.cgpa >= 3.26) criteria.grade = 'A+';
    else if (criteria.cgpa >= 3.01) criteria.grade = 'A';
    else if (criteria.cgpa >= 2.76) criteria.grade = 'B++';
    else if (criteria.cgpa >= 2.51) criteria.grade = 'B+';
    else if (criteria.cgpa >= 2.01) criteria.grade = 'B';
    else if (criteria.cgpa >= 1.51) criteria.grade = 'C';
    else criteria.grade = 'D';

    return criteria;
  }

  /**
   * Get all accreditation metrics
   */
  static async getAccreditationMetrics(type?: 'nirf' | 'naac'): Promise<AccreditationMetric[]> {
    let query = this.supabase.from('sh_accreditation_metrics')
      .select('*')
      .eq('is_active', true)
      .order('metric_code', { ascending: true });

    if (type) {
      query = query.eq('metric_type', type);
    }

    const { data, error } = await query;

    if (error) throw new Error(`Failed to fetch accreditation metrics: ${error.message}`);
    return data as AccreditationMetric[];
  }
}

// Export singleton instance methods
export const publicationsService = {
  getPublications: PublicationsService.getPublications.bind(PublicationsService),
  getPublicationById: PublicationsService.getPublicationById.bind(PublicationsService),
  createPublication: PublicationsService.createPublication.bind(PublicationsService),
  updatePublication: PublicationsService.updatePublication.bind(PublicationsService),
  deletePublication: PublicationsService.deletePublication.bind(PublicationsService),
  getPublicationsBySolution: PublicationsService.getPublicationsBySolution.bind(PublicationsService),
  getContributors: PublicationsService.getContributors.bind(PublicationsService),
  addContributor: PublicationsService.addContributor.bind(PublicationsService),
  removeContributor: PublicationsService.removeContributor.bind(PublicationsService),
  getPublicationStats: PublicationsService.getPublicationStats.bind(PublicationsService),
  calculateNIRFMetrics: PublicationsService.calculateNIRFMetrics.bind(PublicationsService),
  calculateNAACCriteria: PublicationsService.calculateNAACCriteria.bind(PublicationsService),
  getAccreditationMetrics: PublicationsService.getAccreditationMetrics.bind(PublicationsService),
};
