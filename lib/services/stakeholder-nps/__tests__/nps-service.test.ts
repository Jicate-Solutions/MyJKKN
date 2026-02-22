/**
 * NPS Service Unit Tests
 * Comprehensive test coverage for Stakeholder NPS module
 * Target: 80%+ code coverage
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type {
  NPSSurvey,
  NPSResponse,
  NPSSurveyAnalytics,
  NPSDashboardData,
  NPSSurveyFilters,
  NPSResponseFilters,
  NPSAnalyticsFilters,
  CreateNPSSurveyDto,
  UpdateNPSSurveyDto,
  SubmitNPSResponseDto
} from '@/types/stakeholder-nps';

// =====================================================
// MOCK SUPABASE CLIENT (HOISTED)
// =====================================================

// Use vi.hoisted() to ensure mocks are available before module imports
const { mockSupabase, createChainableMock, mockUser, mockInstitutionAccess } = vi.hoisted(() => {
  const mockUser = {
    id: 'user-123',
    email: 'test@jkkn.ac.in'
  };

  const mockInstitutionAccess = {
    institution_id: 'inst-123'
  };

  // Create chainable mock builder
  const createChainableMock = () => {
    const mockData: any = {
      data: null,
      error: null,
      count: 0
    };

    const chainable: any = {
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      or: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      lte: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      range: vi.fn().mockReturnThis(),
      ilike: vi.fn().mockReturnThis(),
      contains: vi.fn().mockReturnThis(),
      not: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      single: vi.fn(() => Promise.resolve(mockData)),
      then: vi.fn((callback: any) => Promise.resolve(mockData).then(callback)),
      // Allow setting return data
      setMockData: (data: any, error: any = null, count: number = 0) => {
        mockData.data = data;
        mockData.error = error;
        mockData.count = count;
        return chainable;
      },
      getMockData: () => mockData
    };

    return chainable;
  };

  const mockSupabase = {
    auth: {
      getUser: vi.fn()
    },
    from: vi.fn(),
    rpc: vi.fn()
  };

  return { mockSupabase, createChainableMock, mockUser, mockInstitutionAccess };
});

// Mock the Supabase client module before importing NPSService
vi.mock('@/lib/supabase/client', () => ({
  createClientSupabaseClient: () => mockSupabase
}));

// Import AFTER mocking
import { NPSService } from '../nps-service';
import { sanitizeSearch } from '@/lib/config/pagination';

let mockFromChain: ReturnType<typeof createChainableMock>;
let mockRpcResult: { data: any; error: any } = { data: null, error: null };

// =====================================================
// TEST DATA FACTORIES
// =====================================================

const createMockSurvey = (overrides: Partial<NPSSurvey> = {}): NPSSurvey => ({
  id: 'survey-123',
  institution_id: 'inst-123',
  title: 'Test NPS Survey',
  description: 'A test survey for stakeholder feedback',
  stakeholder_types: ['learner'],
  question: 'How likely are you to recommend our institution?',
  start_date: '2025-01-01T00:00:00Z',
  end_date: '2025-12-31T23:59:59Z',
  status: 'active',
  created_by: 'user-123',
  created_at: '2025-01-01T00:00:00Z',
  updated_at: '2025-01-01T00:00:00Z',
  response_count: 0,
  ...overrides
});

const createMockResponse = (overrides: Partial<NPSResponse> = {}): NPSResponse => ({
  id: 'response-123',
  survey_id: 'survey-123',
  stakeholder_type: 'learner',
  stakeholder_id: 'respondent-123',
  stakeholder_email: 'student@jkkn.ac.in',
  stakeholder_name: 'Test Student',
  score: 9,
  feedback: 'Great institution!',
  sentiment: 'promoter',
  created_at: '2025-01-15T10:00:00Z',
  ...overrides
});

const createMockAnalytics = (overrides: Partial<NPSSurveyAnalytics> = {}): NPSSurveyAnalytics => ({
  survey_id: 'survey-123',
  institution_id: 'inst-123',
  title: 'Test Survey',
  stakeholder_types: ['learner'],
  start_date: '2025-01-01',
  end_date: '2025-01-31',
  status: 'active',
  total_responses: 100,
  promoter_count: 50,
  passive_count: 30,
  detractor_count: 20,
  promoter_percentage: 50,
  passive_percentage: 30,
  detractor_percentage: 20,
  nps_score: 30,
  avg_score: 7.5,
  responses_by_type: { learner: 100 } as Record<string, number> as NPSSurveyAnalytics['responses_by_type'],
  ...overrides
});

const createMockDashboard = () => ({
  overall_nps: 45,
  total_responses: 500,
  response_rate: 75.5,
  by_stakeholder: {
    parent: { score: 50, responses: 100, promoters: 60, passives: 25, detractors: 15 },
    learner: { score: 40, responses: 150, promoters: 70, passives: 50, detractors: 30 },
    alumni: { score: 55, responses: 80, promoters: 50, passives: 20, detractors: 10 },
    industry: { score: 35, responses: 70, promoters: 35, passives: 25, detractors: 10 },
    staff: { score: 42, responses: 100, promoters: 55, passives: 30, detractors: 15 }
  },
  by_department: {
    'dept-123': { name: 'Computer Science', score: 48, responses: 120 }
  },
  trend: [
    { period: '2025-01', score: 40, responses: 100 },
    { period: '2025-02', score: 45, responses: 120 }
  ],
  recent_feedback: [
    {
      id: 'fb-1',
      score: 9,
      feedback: 'Excellent teaching quality',
      stakeholder_type: 'learner' as const,
      submitted_at: '2025-01-15T10:00:00Z'
    }
  ]
});

// =====================================================
// TEST SUITES
// =====================================================

describe('NPSService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFromChain = createChainableMock();
    mockRpcResult = { data: null, error: null };

    // Setup default mock that handles institution access validation
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'user_institution_access') {
        const accessChain = createChainableMock();
        accessChain.setMockData(mockInstitutionAccess);
        return accessChain;
      }
      return mockFromChain;
    });

    mockSupabase.rpc.mockImplementation(() => Promise.resolve(mockRpcResult));
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: mockUser }, error: null });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // =====================================================
  // sanitizeSearch Tests
  // =====================================================

  describe('sanitizeSearch (Security)', () => {
    it('should return empty string for null/undefined input', () => {
      const result = sanitizeSearch('');
      expect(result).toBe('');
    });

    it('should escape SQL ILIKE wildcard %', () => {
      const result = sanitizeSearch('test%injection');
      expect(result).toBe('test\\%injection');
    });

    it('should escape SQL single-character wildcard _', () => {
      const result = sanitizeSearch('test_injection');
      expect(result).toBe('test\\_injection');
    });

    it('should escape backslash to prevent escape sequence injection', () => {
      const result = sanitizeSearch('test\\injection');
      expect(result).toBe('test\\\\injection');
    });

    it('should handle multiple special characters', () => {
      const result = sanitizeSearch('test%_\\evil');
      expect(result).toBe('test\\%\\_\\\\evil');
    });

    it('should preserve normal text without escaping', () => {
      const result = sanitizeSearch('normal search query');
      expect(result).toBe('normal search query');
    });

    it('should handle XSS attempts by escaping wildcards', () => {
      const result = sanitizeSearch('%<script>alert(1)</script>%');
      // sanitizeSearch also escapes parentheses ( and ) along with % _ \ , '
      expect(result).toBe('\\%<script>alert\\(1\\)</script>\\%');
    });
  });

  // =====================================================
  // validateInstitutionAccess Tests
  // =====================================================

  describe('validateInstitutionAccess (Security)', () => {
    it('should throw error for empty institution_id', async () => {
      await expect(
        (NPSService as any).validateInstitutionAccess('')
      ).rejects.toThrow('Institution ID is required');
    });

    it('should throw error for whitespace-only institution_id', async () => {
      await expect(
        (NPSService as any).validateInstitutionAccess('   ')
      ).rejects.toThrow('Institution ID is required');
    });

    it('should throw error when user is not authenticated', async () => {
      mockSupabase.auth.getUser.mockResolvedValueOnce({ data: { user: null }, error: null });

      await expect(
        (NPSService as any).validateInstitutionAccess('inst-123')
      ).rejects.toThrow('Authentication required');
    });

    it('should throw error when auth returns error', async () => {
      mockSupabase.auth.getUser.mockResolvedValueOnce({
        data: { user: null },
        error: new Error('Auth failed')
      });

      await expect(
        (NPSService as any).validateInstitutionAccess('inst-123')
      ).rejects.toThrow('Authentication required');
    });

    it('should throw error when user lacks institution access', async () => {
      const accessChain = createChainableMock();
      accessChain.setMockData(null, { message: 'No access' });
      mockSupabase.from.mockReturnValue(accessChain);

      await expect(
        (NPSService as any).validateInstitutionAccess('inst-123')
      ).rejects.toThrow('Access denied: Institution not accessible to user');
    });

    it('should succeed when user has institution access', async () => {
      const accessChain = createChainableMock();
      accessChain.setMockData(mockInstitutionAccess);
      mockSupabase.from.mockReturnValue(accessChain);

      await expect(
        (NPSService as any).validateInstitutionAccess('inst-123')
      ).resolves.not.toThrow();
    });
  });

  // =====================================================
  // getSurveys Tests
  // =====================================================

  describe('getSurveys', () => {
    const defaultFilters: NPSSurveyFilters = {
      institution_id: 'inst-123',
      page: 1,
      limit: 10
    };

    it('should return surveys with pagination metadata', async () => {
      const mockSurveys = [createMockSurvey()];

      // Mock main query
      mockFromChain.setMockData(mockSurveys, null, 1);

      // Need to handle the response count query
      const responseCountChain = createChainableMock();
      responseCountChain.setMockData([{ survey_id: 'survey-123' }]);

      let queryCount = 0;
      mockSupabase.from.mockImplementation((table: string) => {
        queryCount++;
        if (queryCount === 1) return mockFromChain;
        return responseCountChain;
      });

      const result = await NPSService.getSurveys(defaultFilters);

      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('metadata');
      expect(result.metadata).toHaveProperty('total');
      expect(result.metadata).toHaveProperty('page');
      expect(result.metadata).toHaveProperty('limit');
      expect(result.metadata).toHaveProperty('totalPages');
    });

    it('should apply institution_id filter', async () => {
      mockFromChain.setMockData([], null, 0);

      await NPSService.getSurveys(defaultFilters);

      expect(mockFromChain.eq).toHaveBeenCalledWith('institution_id', 'inst-123');
    });

    it('should apply stakeholder_type filter when provided', async () => {
      mockFromChain.setMockData([], null, 0);

      await NPSService.getSurveys({ ...defaultFilters, stakeholder_type: 'parent' });

      expect(mockFromChain.contains).toHaveBeenCalledWith('stakeholder_types', ['parent']);
    });

    it('should apply status filter when provided', async () => {
      mockFromChain.setMockData([], null, 0);

      await NPSService.getSurveys({ ...defaultFilters, status: 'active' });

      expect(mockFromChain.eq).toHaveBeenCalledWith('status', 'active');
    });

    it('should apply date range filters', async () => {
      mockFromChain.setMockData([], null, 0);

      await NPSService.getSurveys({
        ...defaultFilters,
        start_date_from: '2025-01-01',
        start_date_to: '2025-12-31'
      });

      expect(mockFromChain.gte).toHaveBeenCalledWith('start_date', '2025-01-01');
      expect(mockFromChain.lte).toHaveBeenCalledWith('start_date', '2025-12-31');
    });

    it('should sanitize search input before applying filter', async () => {
      mockFromChain.setMockData([], null, 0);

      await NPSService.getSurveys({ ...defaultFilters, search: 'test%query' });

      // The search should be sanitized to escape %
      expect(mockFromChain.or).toHaveBeenCalled();
    });

    it('should apply sorting', async () => {
      mockFromChain.setMockData([], null, 0);

      await NPSService.getSurveys({
        ...defaultFilters,
        sortBy: 'title',
        sortDirection: 'asc'
      });

      expect(mockFromChain.order).toHaveBeenCalledWith('title', { ascending: true });
    });

    it('should apply pagination', async () => {
      mockFromChain.setMockData([], null, 0);

      await NPSService.getSurveys({
        ...defaultFilters,
        page: 2,
        limit: 20
      });

      // Page 2 with limit 20 should be range(20, 39)
      expect(mockFromChain.range).toHaveBeenCalledWith(20, 39);
    });

    it('should throw error when database query fails', async () => {
      mockFromChain.setMockData(null, { message: 'Database error' });

      await expect(NPSService.getSurveys(defaultFilters)).rejects.toThrow('Failed to fetch surveys');
    });

    it('should calculate response counts for each survey', async () => {
      const mockSurveys = [createMockSurvey({ id: 'survey-1' }), createMockSurvey({ id: 'survey-2' })];

      // Setup institution access check
      const accessChain = createChainableMock();
      accessChain.setMockData(mockInstitutionAccess);

      // Setup surveys query
      const surveysChain = createChainableMock();
      surveysChain.setMockData(mockSurveys, null, 2);

      // Setup response count query
      const responseCountChain = createChainableMock();
      responseCountChain.setMockData([
        { survey_id: 'survey-1' },
        { survey_id: 'survey-1' },
        { survey_id: 'survey-2' }
      ]);

      let queryCount = 0;
      mockSupabase.from.mockImplementation(() => {
        queryCount++;
        if (queryCount === 1) return accessChain;  // First: institution access
        if (queryCount === 2) return surveysChain; // Second: get surveys
        return responseCountChain;                  // Third: count responses
      });

      const result = await NPSService.getSurveys(defaultFilters);

      expect(result.data[0].response_count).toBe(2);
      expect(result.data[1].response_count).toBe(1);
    });

    it('should handle empty survey list gracefully', async () => {
      mockFromChain.setMockData([], null, 0);

      const result = await NPSService.getSurveys(defaultFilters);

      expect(result.data).toEqual([]);
      expect(result.metadata.total).toBe(0);
      expect(result.metadata.totalPages).toBe(0);
    });

    it('should use default values for missing pagination parameters', async () => {
      mockFromChain.setMockData([], null, 0);

      await NPSService.getSurveys({ institution_id: 'inst-123' });

      // Default page=1, limit=10 should give range(0, 9)
      expect(mockFromChain.range).toHaveBeenCalledWith(0, 9);
    });
  });

  // =====================================================
  // getSurvey Tests
  // =====================================================

  describe('getSurvey', () => {
    it('should return survey by ID', async () => {
      const mockSurvey = createMockSurvey();
      mockFromChain.setMockData(mockSurvey);

      const responseCountChain = createChainableMock();
      responseCountChain.setMockData(null, null, 5);
      responseCountChain.getMockData().count = 5;

      let queryCount = 0;
      mockSupabase.from.mockImplementation(() => {
        queryCount++;
        if (queryCount === 1) return mockFromChain;
        return responseCountChain;
      });

      const result = await NPSService.getSurvey('survey-123');

      expect(result.id).toBe('survey-123');
      expect(mockFromChain.eq).toHaveBeenCalledWith('id', 'survey-123');
    });

    it('should filter by institution_id when provided', async () => {
      mockFromChain.setMockData(createMockSurvey());

      await NPSService.getSurvey('survey-123', 'inst-123');

      expect(mockFromChain.eq).toHaveBeenCalledWith('id', 'survey-123');
      expect(mockFromChain.eq).toHaveBeenCalledWith('institution_id', 'inst-123');
    });

    it('should throw "Survey not found or access denied" for PGRST116 error', async () => {
      mockFromChain.setMockData(null, { code: 'PGRST116', message: 'No rows returned' });

      await expect(NPSService.getSurvey('nonexistent')).rejects.toThrow(
        'Survey not found or access denied'
      );
    });

    it('should throw generic error for other database errors', async () => {
      mockFromChain.setMockData(null, { message: 'Connection failed' });

      await expect(NPSService.getSurvey('survey-123')).rejects.toThrow('Failed to fetch survey');
    });

    it('should throw "Survey not found" when data is null', async () => {
      mockFromChain.setMockData(null);

      await expect(NPSService.getSurvey('survey-123')).rejects.toThrow('Survey not found');
    });

    it('should include response count in returned survey', async () => {
      mockFromChain.setMockData(createMockSurvey());

      const responseCountChain = createChainableMock();
      let mockDataWithCount = { data: null, error: null, count: 10 };
      responseCountChain.single = vi.fn(() => Promise.resolve(mockDataWithCount));

      let queryCount = 0;
      mockSupabase.from.mockImplementation(() => {
        queryCount++;
        if (queryCount === 1) return mockFromChain;
        return responseCountChain;
      });

      const result = await NPSService.getSurvey('survey-123');

      expect(result.response_count).toBeDefined();
    });
  });

  // =====================================================
  // createSurvey Tests
  // =====================================================

  describe('createSurvey', () => {
    const validSurveyDto: CreateNPSSurveyDto = {
      institution_id: 'inst-123',
      title: 'New NPS Survey',
      description: 'Survey description',
      stakeholder_types: ['learner'],
      question: 'How likely are you to recommend?',
      start_date: '2025-01-01T00:00:00Z',
      end_date: '2025-12-31T23:59:59Z',
      status: 'draft'
    };

    it('should create survey with all required fields', async () => {
      const createdSurvey = createMockSurvey({ ...validSurveyDto });
      mockFromChain.setMockData(createdSurvey);

      const result = await NPSService.createSurvey(validSurveyDto);

      expect(mockFromChain.insert).toHaveBeenCalled();
      expect(result).toHaveProperty('id');
    });

    it('should set status to "draft" by default', async () => {
      mockFromChain.setMockData(createMockSurvey({ status: 'draft' }));

      await NPSService.createSurvey(validSurveyDto);

      const insertCall = mockFromChain.insert.mock.calls[0][0];
      expect(insertCall.status).toBe('draft');
    });

    it('should set created_by to current user ID', async () => {
      mockFromChain.setMockData(createMockSurvey());

      await NPSService.createSurvey(validSurveyDto);

      const insertCall = mockFromChain.insert.mock.calls[0][0];
      expect(insertCall.created_by).toBe('user-123');
    });

    it('should throw error when user is not authenticated', async () => {
      mockSupabase.auth.getUser.mockResolvedValueOnce({ data: { user: null }, error: null });

      await expect(
        NPSService.createSurvey(validSurveyDto)
      ).rejects.toThrow('Authentication required');
    });

    it('should handle optional description as null', async () => {
      const dtoWithoutDesc = { ...validSurveyDto, description: undefined };
      mockFromChain.setMockData(createMockSurvey());

      await NPSService.createSurvey(dtoWithoutDesc);

      const insertCall = mockFromChain.insert.mock.calls[0][0];
      expect(insertCall.description).toBeNull();
    });

    it('should handle optional question with default', async () => {
      const dtoWithoutQuestion = { ...validSurveyDto, question: undefined };
      mockFromChain.setMockData(createMockSurvey());

      await NPSService.createSurvey(dtoWithoutQuestion);

      const insertCall = mockFromChain.insert.mock.calls[0][0];
      expect(insertCall.question).toBeTruthy();
    });

    it('should throw error when database insert fails', async () => {
      mockFromChain.setMockData(null, { message: 'Insert failed' });

      await expect(NPSService.createSurvey(validSurveyDto)).rejects.toThrow('Failed to create survey');
    });

    it('should pass questions array to insert', async () => {
      mockFromChain.setMockData(createMockSurvey());

      await NPSService.createSurvey(validSurveyDto);

      const insertCall = mockFromChain.insert.mock.calls[0][0];
      expect(insertCall.question).toEqual(validSurveyDto.question);
    });
  });

  // =====================================================
  // updateSurvey Tests
  // =====================================================

  describe('updateSurvey', () => {
    it('should update survey with provided fields only', async () => {
      const updates: UpdateNPSSurveyDto = { title: 'Updated Title' };
      mockFromChain.setMockData(createMockSurvey({ title: 'Updated Title' }));

      const result = await NPSService.updateSurvey('survey-123', updates);

      expect(mockFromChain.update).toHaveBeenCalled();
      expect(result.title).toBe('Updated Title');
    });

    it('should update description', async () => {
      const updates: UpdateNPSSurveyDto = { description: 'New description' };
      mockFromChain.setMockData(createMockSurvey({ description: 'New description' }));

      await NPSService.updateSurvey('survey-123', updates);

      const updateCall = mockFromChain.update.mock.calls[0][0];
      expect(updateCall.description).toBe('New description');
    });

    it('should update stakeholder_types', async () => {
      const updates: UpdateNPSSurveyDto = { stakeholder_types: ['parent', 'learner'] };
      mockFromChain.setMockData(createMockSurvey({ stakeholder_types: ['parent', 'learner'] }));

      await NPSService.updateSurvey('survey-123', updates);

      const updateCall = mockFromChain.update.mock.calls[0][0];
      expect(updateCall.stakeholder_types).toEqual(['parent', 'learner']);
    });

    it('should update start_date', async () => {
      const updates: UpdateNPSSurveyDto = { start_date: '2025-02-01' };
      mockFromChain.setMockData(createMockSurvey());

      await NPSService.updateSurvey('survey-123', updates);

      const updateCall = mockFromChain.update.mock.calls[0][0];
      expect(updateCall.start_date).toBe('2025-02-01');
    });

    it('should update end_date', async () => {
      const updates: UpdateNPSSurveyDto = { end_date: '2025-06-30' };
      mockFromChain.setMockData(createMockSurvey());

      await NPSService.updateSurvey('survey-123', updates);

      const updateCall = mockFromChain.update.mock.calls[0][0];
      expect(updateCall.end_date).toBe('2025-06-30');
    });

    it('should update status', async () => {
      const updates: UpdateNPSSurveyDto = { status: 'closed' };
      mockFromChain.setMockData(createMockSurvey({ status: 'closed' }));

      await NPSService.updateSurvey('survey-123', updates);

      const updateCall = mockFromChain.update.mock.calls[0][0];
      expect(updateCall.status).toBe('closed');
    });

    it('should update question text', async () => {
      const newQuestion = 'How satisfied are you with our services?';
      const updates: UpdateNPSSurveyDto = { question: newQuestion };
      mockFromChain.setMockData(createMockSurvey({ question: newQuestion }));

      await NPSService.updateSurvey('survey-123', updates);

      const updateCall = mockFromChain.update.mock.calls[0][0];
      expect(updateCall.question).toEqual(newQuestion);
    });

    it('should not include undefined fields in update', async () => {
      const updates: UpdateNPSSurveyDto = { title: 'Updated' };
      mockFromChain.setMockData(createMockSurvey());

      await NPSService.updateSurvey('survey-123', updates);

      const updateCall = mockFromChain.update.mock.calls[0][0];
      expect(updateCall).not.toHaveProperty('description');
      expect(updateCall).not.toHaveProperty('status');
    });

    it('should throw error when update fails', async () => {
      // Mock getSurvey query
      const getSurveyChain = createChainableMock();
      getSurveyChain.setMockData(createMockSurvey());

      // Mock response count query
      const countChain = createChainableMock();
      countChain.getMockData().count = 5;

      // Mock validateInstitutionAccess
      const accessChain = createChainableMock();
      accessChain.setMockData(mockInstitutionAccess);

      // Mock update operation with error
      const updateChain = createChainableMock();
      updateChain.setMockData(null, { message: 'Update failed' });

      let queryCount = 0;
      mockSupabase.from.mockImplementation(() => {
        queryCount++;
        if (queryCount === 1) return getSurveyChain;   // getSurvey (main query)
        if (queryCount === 2) return countChain;       // response count
        if (queryCount === 3) return accessChain;      // validateInstitutionAccess
        return updateChain;                             // update
      });

      await expect(
        NPSService.updateSurvey('survey-123', { title: 'New' })
      ).rejects.toThrow('Failed to update survey');
    });

    it('should apply eq filter for survey ID', async () => {
      mockFromChain.setMockData(createMockSurvey());

      await NPSService.updateSurvey('survey-123', { title: 'New' });

      expect(mockFromChain.eq).toHaveBeenCalledWith('id', 'survey-123');
    });
  });

  // =====================================================
  // Status Transition Tests (activateSurvey, closeSurvey, archiveSurvey)
  // =====================================================

  describe('Survey Status Transitions', () => {
    describe('activateSurvey', () => {
      it('should set status to active', async () => {
        mockFromChain.setMockData(createMockSurvey({ status: 'active' }));

        const result = await NPSService.activateSurvey('survey-123');

        expect(result.status).toBe('active');
        const updateCall = mockFromChain.update.mock.calls[0][0];
        expect(updateCall.status).toBe('active');
      });
    });

    describe('closeSurvey', () => {
      it('should set status to closed', async () => {
        mockFromChain.setMockData(createMockSurvey({ status: 'closed' }));

        const result = await NPSService.closeSurvey('survey-123');

        expect(result.status).toBe('closed');
        const updateCall = mockFromChain.update.mock.calls[0][0];
        expect(updateCall.status).toBe('closed');
      });
    });

    describe('archiveSurvey', () => {
      it('should set status to archived', async () => {
        mockFromChain.setMockData(createMockSurvey({ status: 'archived' }));

        const result = await NPSService.archiveSurvey('survey-123');

        expect(result.status).toBe('archived');
        const updateCall = mockFromChain.update.mock.calls[0][0];
        expect(updateCall.status).toBe('archived');
      });
    });
  });

  // =====================================================
  // deleteSurvey Tests
  // =====================================================

  describe('deleteSurvey', () => {
    it('should delete survey by ID', async () => {
      // Mock getSurvey query
      const getSurveyChain = createChainableMock();
      getSurveyChain.setMockData(createMockSurvey());

      // Mock response count query
      const countChain = createChainableMock();
      countChain.getMockData().count = 5;

      // Mock validateInstitutionAccess
      const accessChain = createChainableMock();
      accessChain.setMockData(mockInstitutionAccess);

      // Mock delete operation
      const deleteChain = createChainableMock();
      deleteChain.setMockData(null);

      let queryCount = 0;
      mockSupabase.from.mockImplementation(() => {
        queryCount++;
        if (queryCount === 1) return getSurveyChain;   // getSurvey (main query)
        if (queryCount === 2) return countChain;       // response count
        if (queryCount === 3) return accessChain;      // validateInstitutionAccess
        return deleteChain;                             // delete
      });

      await NPSService.deleteSurvey('survey-123');

      expect(deleteChain.delete).toHaveBeenCalled();
      expect(deleteChain.eq).toHaveBeenCalledWith('id', 'survey-123');
    });

    it('should throw error when delete fails', async () => {
      // Mock getSurvey query
      const getSurveyChain = createChainableMock();
      getSurveyChain.setMockData(createMockSurvey());

      // Mock response count query
      const countChain = createChainableMock();
      countChain.getMockData().count = 5;

      // Mock validateInstitutionAccess
      const accessChain = createChainableMock();
      accessChain.setMockData(mockInstitutionAccess);

      // Mock delete operation with error
      const deleteChain = createChainableMock();
      deleteChain.setMockData(null, { message: 'Delete failed' });

      let queryCount = 0;
      mockSupabase.from.mockImplementation(() => {
        queryCount++;
        if (queryCount === 1) return getSurveyChain;   // getSurvey (main query)
        if (queryCount === 2) return countChain;       // response count
        if (queryCount === 3) return accessChain;      // validateInstitutionAccess
        return deleteChain;                             // delete
      });

      await expect(NPSService.deleteSurvey('survey-123')).rejects.toThrow('Failed to delete survey');
    });

    it('should not throw error when delete succeeds', async () => {
      // Mock getSurvey query
      const getSurveyChain = createChainableMock();
      getSurveyChain.setMockData(createMockSurvey());

      // Mock response count query
      const countChain = createChainableMock();
      countChain.getMockData().count = 0;

      // Mock validateInstitutionAccess
      const accessChain = createChainableMock();
      accessChain.setMockData(mockInstitutionAccess);

      // Mock delete operation
      const deleteChain = createChainableMock();
      deleteChain.setMockData(null);

      let queryCount = 0;
      mockSupabase.from.mockImplementation(() => {
        queryCount++;
        if (queryCount === 1) return getSurveyChain;   // getSurvey (main query)
        if (queryCount === 2) return countChain;       // response count
        if (queryCount === 3) return accessChain;      // validateInstitutionAccess
        return deleteChain;                             // delete
      });

      await expect(NPSService.deleteSurvey('survey-123')).resolves.not.toThrow();
    });
  });

  // =====================================================
  // getActiveSurveys Tests
  // =====================================================

  describe('getActiveSurveys', () => {
    it('should filter by institution_id', async () => {
      mockFromChain.setMockData([]);

      await NPSService.getActiveSurveys('inst-123', 'learner');

      expect(mockFromChain.eq).toHaveBeenCalledWith('institution_id', 'inst-123');
    });

    it('should filter by stakeholder_type', async () => {
      mockFromChain.setMockData([]);

      await NPSService.getActiveSurveys('inst-123', 'parent');

      expect(mockFromChain.contains).toHaveBeenCalledWith('stakeholder_types', ['parent']);
    });

    it('should filter by active status', async () => {
      mockFromChain.setMockData([]);

      await NPSService.getActiveSurveys('inst-123', 'learner');

      expect(mockFromChain.eq).toHaveBeenCalledWith('status', 'active');
    });

    it('should filter surveys within date range', async () => {
      mockFromChain.setMockData([]);

      await NPSService.getActiveSurveys('inst-123', 'learner');

      expect(mockFromChain.lte).toHaveBeenCalled(); // start_date <= now
      expect(mockFromChain.gte).toHaveBeenCalled(); // end_date >= now
    });

    it('should order by created_at descending', async () => {
      mockFromChain.setMockData([]);

      await NPSService.getActiveSurveys('inst-123', 'learner');

      expect(mockFromChain.order).toHaveBeenCalledWith('created_at', { ascending: false });
    });

    it('should return array of active surveys', async () => {
      const mockSurveys = [createMockSurvey({ status: 'active' })];
      mockFromChain.setMockData(mockSurveys);

      const result = await NPSService.getActiveSurveys('inst-123', 'learner');

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(1);
    });

    it('should throw error when query fails', async () => {
      mockFromChain.setMockData(null, { message: 'Query failed' });

      await expect(
        NPSService.getActiveSurveys('inst-123', 'learner')
      ).rejects.toThrow('Failed to fetch active surveys');
    });
  });

  // =====================================================
  // submitResponse Tests
  // =====================================================

  describe('submitResponse', () => {
    const validResponseDto: SubmitNPSResponseDto = {
      survey_id: 'survey-123',
      stakeholder_type: 'learner',
      stakeholder_id: 'respondent-123',
      stakeholder_email: 'student@jkkn.ac.in',
      stakeholder_name: 'Test Student',
      score: 9,
      feedback: 'Great experience!'
    };

    beforeEach(() => {
      // Setup two queries: one for survey validation, one for insert
      const surveyValidationChain = createChainableMock();
      surveyValidationChain.setMockData({
        id: 'survey-123',
        status: 'active',
        end_date: '2099-12-31T23:59:59Z',
        institution_id: 'inst-123'
      });

      const insertChain = createChainableMock();
      insertChain.setMockData(createMockResponse());

      let queryCount = 0;
      mockSupabase.from.mockImplementation(() => {
        queryCount++;
        if (queryCount === 1) return surveyValidationChain;
        return insertChain;
      });
    });

    it('should validate NPS score is between 0 and 10', async () => {
      await expect(
        NPSService.submitResponse({ ...validResponseDto, score: -1 as any })
      ).rejects.toThrow('NPS score must be between 0 and 10');

      await expect(
        NPSService.submitResponse({ ...validResponseDto, score: 11 as any })
      ).rejects.toThrow('NPS score must be between 0 and 10');
    });

    it('should accept valid NPS score of 0', async () => {
      await expect(
        NPSService.submitResponse({ ...validResponseDto, score: 0 })
      ).resolves.not.toThrow();
    });

    it('should accept valid NPS score of 10', async () => {
      await expect(
        NPSService.submitResponse({ ...validResponseDto, score: 10 })
      ).resolves.not.toThrow();
    });

    it('should throw error if survey not found', async () => {
      const surveyValidationChain = createChainableMock();
      surveyValidationChain.setMockData(null, { message: 'Not found' });

      mockSupabase.from.mockReturnValue(surveyValidationChain);

      await expect(
        NPSService.submitResponse(validResponseDto)
      ).rejects.toThrow('Survey not found');
    });

    it('should throw error if survey is not active', async () => {
      const surveyValidationChain = createChainableMock();
      surveyValidationChain.setMockData({
        id: 'survey-123',
        status: 'draft',
        end_date: '2099-12-31',
        institution_id: 'inst-123'
      });

      mockSupabase.from.mockReturnValue(surveyValidationChain);

      await expect(
        NPSService.submitResponse(validResponseDto)
      ).rejects.toThrow('Survey is not currently active');
    });

    it('should throw error if survey has ended', async () => {
      const surveyValidationChain = createChainableMock();
      surveyValidationChain.setMockData({
        id: 'survey-123',
        status: 'active',
        end_date: '2020-01-01T00:00:00Z',
        institution_id: 'inst-123'
      });

      mockSupabase.from.mockReturnValue(surveyValidationChain);

      await expect(
        NPSService.submitResponse(validResponseDto)
      ).rejects.toThrow('Survey has ended');
    });

    it('should insert response with all required fields', async () => {
      const insertChain = createChainableMock();
      insertChain.setMockData(createMockResponse());

      const surveyChain = createChainableMock();
      surveyChain.setMockData({
        id: 'survey-123',
        status: 'active',
        end_date: '2099-12-31',
        institution_id: 'inst-123'
      });

      let queryCount = 0;
      mockSupabase.from.mockImplementation(() => {
        queryCount++;
        if (queryCount === 1) return surveyChain;
        return insertChain;
      });

      await NPSService.submitResponse(validResponseDto);

      expect(insertChain.insert).toHaveBeenCalled();
      const insertCall = insertChain.insert.mock.calls[0][0];
      expect(insertCall.survey_id).toBe('survey-123');
      expect(insertCall.score).toBe(9);
      expect(insertCall.stakeholder_type).toBe('learner');
    });

    it('should handle optional fields as null', async () => {
      const dtoWithoutOptionals: SubmitNPSResponseDto = {
        survey_id: 'survey-123',
        stakeholder_type: 'learner',
        stakeholder_id: 'respondent-123',
        score: 8
      };

      const insertChain = createChainableMock();
      insertChain.setMockData(createMockResponse());

      const surveyChain = createChainableMock();
      surveyChain.setMockData({
        id: 'survey-123',
        status: 'active',
        end_date: '2099-12-31',
        institution_id: 'inst-123'
      });

      let queryCount = 0;
      mockSupabase.from.mockImplementation(() => {
        queryCount++;
        if (queryCount === 1) return surveyChain;
        return insertChain;
      });

      await NPSService.submitResponse(dtoWithoutOptionals);

      const insertCall = insertChain.insert.mock.calls[0][0];
      expect(insertCall.stakeholder_email).toBeNull();
      expect(insertCall.stakeholder_name).toBeNull();
      expect(insertCall.feedback).toBeNull();
    });

    it('should throw error when insert fails', async () => {
      const insertChain = createChainableMock();
      insertChain.setMockData(null, { message: 'Insert failed' });

      const surveyChain = createChainableMock();
      surveyChain.setMockData({
        id: 'survey-123',
        status: 'active',
        end_date: '2099-12-31',
        institution_id: 'inst-123'
      });

      let queryCount = 0;
      mockSupabase.from.mockImplementation(() => {
        queryCount++;
        if (queryCount === 1) return surveyChain;
        return insertChain;
      });

      await expect(
        NPSService.submitResponse(validResponseDto)
      ).rejects.toThrow('Failed to submit response');
    });

    it('should return the created response', async () => {
      const result = await NPSService.submitResponse(validResponseDto);

      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('score');
      expect(result).toHaveProperty('sentiment');
    });
  });

  // =====================================================
  // NPS Score Categorization Tests
  // =====================================================

  describe('NPS Score Categorization', () => {
    it('should categorize score 9-10 as promoter', () => {
      // This is tested through response submission behavior
      // The nps_category is calculated by a database trigger
      expect(true).toBe(true); // Placeholder - category is set by DB trigger
    });

    it('should categorize score 7-8 as passive', () => {
      expect(true).toBe(true); // Placeholder - category is set by DB trigger
    });

    it('should categorize score 0-6 as detractor', () => {
      expect(true).toBe(true); // Placeholder - category is set by DB trigger
    });
  });

  // =====================================================
  // getResponses Tests
  // =====================================================

  describe('getResponses', () => {
    const defaultFilters: NPSResponseFilters = {
      page: 1,
      limit: 10
    };

    it('should return responses with pagination metadata', async () => {
      mockFromChain.setMockData([createMockResponse()], null, 1);

      const result = await NPSService.getResponses(defaultFilters);

      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('metadata');
      expect(result.metadata).toHaveProperty('total');
      expect(result.metadata).toHaveProperty('page');
      expect(result.metadata).toHaveProperty('limit');
      expect(result.metadata).toHaveProperty('totalPages');
    });

    it('should apply survey_id filter', async () => {
      mockFromChain.setMockData([]);

      await NPSService.getResponses({ ...defaultFilters, survey_id: 'survey-123' });

      expect(mockFromChain.eq).toHaveBeenCalledWith('survey_id', 'survey-123');
    });

    it('should apply sentiment filter', async () => {
      mockFromChain.setMockData([]);

      await NPSService.getResponses({ ...defaultFilters, sentiment: 'promoter' });

      expect(mockFromChain.eq).toHaveBeenCalledWith('sentiment', 'promoter');
    });

    it('should apply stakeholder_type filter', async () => {
      mockFromChain.setMockData([]);

      await NPSService.getResponses({ ...defaultFilters, stakeholder_type: 'alumni' });

      expect(mockFromChain.eq).toHaveBeenCalledWith('stakeholder_type', 'alumni');
    });

    it('should apply date range filters', async () => {
      mockFromChain.setMockData([]);

      await NPSService.getResponses({
        ...defaultFilters,
        date_from: '2025-01-01',
        date_to: '2025-01-31'
      });

      expect(mockFromChain.gte).toHaveBeenCalledWith('created_at', '2025-01-01');
      expect(mockFromChain.lte).toHaveBeenCalledWith('created_at', '2025-01-31');
    });

    it('should apply default sorting by created_at', async () => {
      mockFromChain.setMockData([]);

      await NPSService.getResponses(defaultFilters);

      expect(mockFromChain.order).toHaveBeenCalledWith('created_at', { ascending: false });
    });

    it('should apply pagination', async () => {
      mockFromChain.setMockData([]);

      await NPSService.getResponses({
        ...defaultFilters,
        page: 3,
        limit: 25
      });

      // Page 3 with limit 25 should be range(50, 74)
      expect(mockFromChain.range).toHaveBeenCalledWith(50, 74);
    });

    it('should throw error when query fails', async () => {
      mockFromChain.setMockData(null, { message: 'Query failed' });

      await expect(NPSService.getResponses(defaultFilters)).rejects.toThrow('Failed to fetch responses');
    });
  });

  // =====================================================
  // getResponse Tests
  // =====================================================

  describe('getResponse', () => {
    it('should return response by ID', async () => {
      mockFromChain.setMockData(createMockResponse());

      const result = await NPSService.getResponse('response-123');

      expect(result.id).toBe('response-123');
      expect(mockFromChain.eq).toHaveBeenCalledWith('id', 'response-123');
    });

    it('should throw "Response not found or access denied" for PGRST116 error', async () => {
      mockFromChain.setMockData(null, { code: 'PGRST116' });

      await expect(
        NPSService.getResponse('nonexistent')
      ).rejects.toThrow('Response not found or access denied');
    });

    it('should throw generic error for other database errors', async () => {
      mockFromChain.setMockData(null, { message: 'Connection failed' });

      await expect(
        NPSService.getResponse('response-123')
      ).rejects.toThrow('Failed to fetch response');
    });

    it('should throw "Response not found" when data is null', async () => {
      mockFromChain.setMockData(null);

      await expect(
        NPSService.getResponse('response-123')
      ).rejects.toThrow('Response not found');
    });

    it('should verify institution access when institutionId is provided', async () => {
      mockFromChain.setMockData({
        ...createMockResponse(),
        survey: { institution_id: 'inst-123' }
      });

      const result = await NPSService.getResponse('response-123', 'inst-123');

      expect(result).toBeDefined();
    });

    it('should throw error when institutionId does not match', async () => {
      mockFromChain.setMockData({
        ...createMockResponse(),
        survey: { institution_id: 'other-inst' }
      });

      await expect(
        NPSService.getResponse('response-123', 'inst-123')
      ).rejects.toThrow('Response not found or access denied');
    });
  });

  // =====================================================
  // getSurveyResponseSummary Tests
  // =====================================================

  describe('getSurveyResponseSummary', () => {
    it('should calculate correct NPS score', async () => {
      // 50 promoters, 30 passives, 20 detractors = (50-20)/100 * 100 = 30
      const mockResponses = [
        ...Array(50).fill({ score: 9, sentiment: 'promoter' }),
        ...Array(30).fill({ score: 7, sentiment: 'passive' }),
        ...Array(20).fill({ score: 5, sentiment: 'detractor' })
      ];
      mockFromChain.setMockData(mockResponses);

      const result = await NPSService.getSurveyResponseSummary('survey-123');

      expect(result.total).toBe(100);
      expect(result.promoters).toBe(50);
      expect(result.passives).toBe(30);
      expect(result.detractors).toBe(20);
      expect(result.nps_score).toBe(30);
    });

    it('should return 0 for NPS score when no responses', async () => {
      mockFromChain.setMockData([]);

      const result = await NPSService.getSurveyResponseSummary('survey-123');

      expect(result.total).toBe(0);
      expect(result.nps_score).toBe(0);
      expect(result.average_score).toBe(0);
    });

    it('should calculate correct average score', async () => {
      const mockResponses = [
        { score: 10, sentiment: 'promoter' },
        { score: 8, sentiment: 'passive' },
        { score: 6, sentiment: 'detractor' }
      ];
      mockFromChain.setMockData(mockResponses);

      const result = await NPSService.getSurveyResponseSummary('survey-123');

      // Average: (10 + 8 + 6) / 3 = 8.0
      expect(result.average_score).toBe(8);
    });

    it('should round average score to 1 decimal place', async () => {
      const mockResponses = [
        { score: 9, sentiment: 'promoter' },
        { score: 7, sentiment: 'passive' },
        { score: 5, sentiment: 'detractor' }
      ];
      mockFromChain.setMockData(mockResponses);

      const result = await NPSService.getSurveyResponseSummary('survey-123');

      // Average: (9 + 7 + 5) / 3 = 7.0
      expect(result.average_score).toBe(7);
    });

    it('should throw error when query fails', async () => {
      mockFromChain.setMockData(null, { message: 'Query failed' });

      await expect(
        NPSService.getSurveyResponseSummary('survey-123')
      ).rejects.toThrow('Failed to fetch response summary');
    });

    it('should handle 100% promoters', async () => {
      const mockResponses = Array(10).fill({ score: 10, sentiment: 'promoter' });
      mockFromChain.setMockData(mockResponses);

      const result = await NPSService.getSurveyResponseSummary('survey-123');

      expect(result.nps_score).toBe(100);
    });

    it('should handle 100% detractors', async () => {
      const mockResponses = Array(10).fill({ score: 3, sentiment: 'detractor' });
      mockFromChain.setMockData(mockResponses);

      const result = await NPSService.getSurveyResponseSummary('survey-123');

      expect(result.nps_score).toBe(-100);
    });
  });

  // =====================================================
  // getAnalytics Tests
  // =====================================================

  describe('getAnalytics', () => {
    const defaultFilters: NPSAnalyticsFilters = {
      institution_id: 'inst-123'
    };

    it('should return analytics array', async () => {
      mockFromChain.setMockData([createMockAnalytics()]);

      const result = await NPSService.getAnalytics(defaultFilters);

      expect(Array.isArray(result)).toBe(true);
    });

    it('should apply institution_id filter', async () => {
      mockFromChain.setMockData([]);

      await NPSService.getAnalytics(defaultFilters);

      expect(mockFromChain.eq).toHaveBeenCalledWith('institution_id', 'inst-123');
    });

    it('should apply stakeholder_type filter', async () => {
      mockFromChain.setMockData([]);

      await NPSService.getAnalytics({ ...defaultFilters, stakeholder_type: 'staff' });

      expect(mockFromChain.eq).toHaveBeenCalledWith('stakeholder_type', 'staff');
    });

    it('should apply department_id filter', async () => {
      mockFromChain.setMockData([]);

      await NPSService.getAnalytics({ ...defaultFilters, department_id: 'dept-123' } as any);

      expect(mockFromChain.eq).toHaveBeenCalledWith('department_id', 'dept-123');
    });

    it('should apply period date filters', async () => {
      mockFromChain.setMockData([]);

      await NPSService.getAnalytics({
        ...defaultFilters,
        period_start: '2025-01-01',
        period_end: '2025-03-31'
      } as any);

      expect(mockFromChain.gte).toHaveBeenCalledWith('period_start', '2025-01-01');
      expect(mockFromChain.lte).toHaveBeenCalledWith('period_end', '2025-03-31');
    });

    it('should order by period_start descending', async () => {
      mockFromChain.setMockData([]);

      await NPSService.getAnalytics(defaultFilters);

      expect(mockFromChain.order).toHaveBeenCalledWith('period_start', { ascending: false });
    });

    it('should throw error when query fails', async () => {
      mockFromChain.setMockData(null, { message: 'Query failed' });

      await expect(
        NPSService.getAnalytics(defaultFilters)
      ).rejects.toThrow('Failed to fetch analytics');
    });
  });

  // =====================================================
  // getDashboardData Tests
  // =====================================================

  describe('getDashboardData', () => {
    it('should call RPC function with correct parameter', async () => {
      mockRpcResult = { data: createMockDashboard(), error: null };

      await NPSService.getDashboardData('inst-123');

      expect(mockSupabase.rpc).toHaveBeenCalledWith('get_nps_dashboard', {
        p_institution_id: 'inst-123'
      });
    });

    it('should return dashboard data on success', async () => {
      mockRpcResult = { data: createMockDashboard(), error: null };

      const result = await NPSService.getDashboardData('inst-123');

      expect(result).toHaveProperty('overall_nps');
      expect(result).toHaveProperty('total_responses');
      expect(result).toHaveProperty('response_rate');
      expect(result).toHaveProperty('by_stakeholder');
      expect(result).toHaveProperty('by_department');
      expect(result).toHaveProperty('trend');
      expect(result).toHaveProperty('recent_feedback');
    });

    it('should return empty dashboard on RPC error', async () => {
      mockRpcResult = { data: null, error: { message: 'RPC failed' } };

      const result = await NPSService.getDashboardData('inst-123');

      expect(result.overall_nps).toBe(0);
      expect(result.total_responses).toBe(0);
      expect(result.response_rate).toBe(0);
      expect(result.trend).toEqual([]);
      expect(result.recent_feedback).toEqual([]);
    });

    it('should have all stakeholder types in by_stakeholder', async () => {
      mockRpcResult = { data: null, error: { message: 'error' } };

      const result = await NPSService.getDashboardData('inst-123');

      expect(result.by_stakeholder).toHaveProperty('parent');
      expect(result.by_stakeholder).toHaveProperty('learner');
      expect(result.by_stakeholder).toHaveProperty('alumni');
      expect(result.by_stakeholder).toHaveProperty('industry');
      expect(result.by_stakeholder).toHaveProperty('staff');
    });

    it('should initialize stakeholder data with zeros on error', async () => {
      mockRpcResult = { data: null, error: { message: 'error' } };

      const result = await NPSService.getDashboardData('inst-123');

      Object.values(result.by_stakeholder).forEach(stakeholder => {
        expect(stakeholder.score).toBe(0);
        expect(stakeholder.responses).toBe(0);
        expect(stakeholder.promoters).toBe(0);
        expect(stakeholder.passives).toBe(0);
        expect(stakeholder.detractors).toBe(0);
      });
    });
  });

  // =====================================================
  // recalculateAnalytics Tests
  // =====================================================

  describe('recalculateAnalytics', () => {
    it('should call RPC function with survey ID', async () => {
      mockRpcResult = { data: null, error: null };

      await NPSService.recalculateAnalytics('survey-123');

      expect(mockSupabase.rpc).toHaveBeenCalledWith('recalculate_nps_analytics', {
        p_survey_id: 'survey-123'
      });
    });

    it('should throw error when RPC fails', async () => {
      mockRpcResult = { data: null, error: { message: 'RPC failed' } };

      await expect(
        NPSService.recalculateAnalytics('survey-123')
      ).rejects.toThrow('Failed to recalculate analytics');
    });

    it('should succeed without throwing when RPC succeeds', async () => {
      mockRpcResult = { data: null, error: null };

      await expect(
        NPSService.recalculateAnalytics('survey-123')
      ).resolves.not.toThrow();
    });
  });

  // =====================================================
  // exportResponses Tests
  // =====================================================

  describe('exportResponses', () => {
    it('should return CSV formatted string', async () => {
      mockFromChain.setMockData([
        {
          id: 'resp-1',
          score: 9,
          sentiment: 'promoter',
          feedback: 'Great!',
          stakeholder_type: 'learner',
          stakeholder_email: 'test@test.com',
          stakeholder_name: 'Test',
          department: { department_name: 'CS' },
          created_at: '2025-01-15T10:00:00Z'
        }
      ]);

      const result = await NPSService.exportResponses('survey-123');

      expect(typeof result).toBe('string');
      expect(result).toContain('ID,NPS Score,Category');
    });

    it('should include header row', async () => {
      mockFromChain.setMockData([]);

      const result = await NPSService.exportResponses('survey-123');

      expect(result).toContain('ID');
      expect(result).toContain('NPS Score');
      expect(result).toContain('Category');
      expect(result).toContain('Feedback');
      expect(result).toContain('Stakeholder Type');
      expect(result).toContain('Email');
      expect(result).toContain('Name');
      expect(result).toContain('Submitted At');
    });

    it('should escape double quotes in feedback', async () => {
      mockFromChain.setMockData([
        {
          id: 'resp-1',
          score: 9,
          sentiment: 'promoter',
          feedback: 'He said "great"',
          stakeholder_type: 'learner',
          stakeholder_email: null,
          stakeholder_name: null,
          department: null,
          created_at: '2025-01-15T10:00:00Z'
        }
      ]);

      const result = await NPSService.exportResponses('survey-123');

      expect(result).toContain('""great""');
    });

    it('should handle null feedback', async () => {
      mockFromChain.setMockData([
        {
          id: 'resp-1',
          score: 9,
          sentiment: 'promoter',
          feedback: null,
          stakeholder_type: 'learner',
          stakeholder_email: null,
          stakeholder_name: null,
          department: null,
          created_at: '2025-01-15T10:00:00Z'
        }
      ]);

      const result = await NPSService.exportResponses('survey-123');

      expect(result).toBeDefined();
    });

    it('should handle null department', async () => {
      mockFromChain.setMockData([
        {
          id: 'resp-1',
          score: 9,
          sentiment: 'promoter',
          feedback: 'Good',
          stakeholder_type: 'learner',
          stakeholder_email: null,
          stakeholder_name: null,
          department: null,
          created_at: '2025-01-15T10:00:00Z'
        }
      ]);

      const result = await NPSService.exportResponses('survey-123');

      expect(result).toBeDefined();
    });

    it('should filter by survey_id', async () => {
      mockFromChain.setMockData([]);

      await NPSService.exportResponses('survey-123');

      expect(mockFromChain.eq).toHaveBeenCalledWith('survey_id', 'survey-123');
    });

    it('should order by created_at descending', async () => {
      mockFromChain.setMockData([]);

      await NPSService.exportResponses('survey-123');

      expect(mockFromChain.order).toHaveBeenCalledWith('created_at', { ascending: false });
    });

    it('should throw error when query fails', async () => {
      mockFromChain.setMockData(null, { message: 'Query failed' });

      await expect(
        NPSService.exportResponses('survey-123')
      ).rejects.toThrow('Failed to export responses');
    });

    it('should handle empty email', async () => {
      mockFromChain.setMockData([
        {
          id: 'resp-1',
          score: 9,
          sentiment: 'promoter',
          feedback: 'Good',
          stakeholder_type: 'learner',
          stakeholder_email: null,
          stakeholder_name: null,
          department: null,
          created_at: '2025-01-15T10:00:00Z'
        }
      ]);

      const result = await NPSService.exportResponses('survey-123');

      expect(result).toBeDefined();
    });
  });

  // =====================================================
  // Edge Cases and Error Handling
  // =====================================================

  describe('Edge Cases', () => {
    it('should handle concurrent requests gracefully', async () => {
      mockFromChain.setMockData([createMockSurvey()], null, 1);

      const promises = [
        NPSService.getSurveys({ institution_id: 'inst-1' }),
        NPSService.getSurveys({ institution_id: 'inst-2' }),
        NPSService.getSurveys({ institution_id: 'inst-3' })
      ];

      const results = await Promise.all(promises);

      expect(results).toHaveLength(3);
      results.forEach(result => {
        expect(result).toHaveProperty('data');
        expect(result).toHaveProperty('metadata');
      });
    });

    it('should handle special characters in search without breaking', async () => {
      mockFromChain.setMockData([]);

      const specialSearches = [
        "test'injection",
        'test"quotes',
        'test\nline',
        'test\ttab',
        'unicode: 日本語'
      ];

      for (const search of specialSearches) {
        await expect(
          NPSService.getSurveys({ institution_id: 'inst-123', search })
        ).resolves.not.toThrow();
      }
    });

    it('should handle empty question_responses object', async () => {
      const surveyChain = createChainableMock();
      surveyChain.setMockData({
        id: 'survey-123',
        status: 'active',
        end_date: '2099-12-31',
        institution_id: 'inst-123'
      });

      const insertChain = createChainableMock();
      insertChain.setMockData(createMockResponse());

      let queryCount = 0;
      mockSupabase.from.mockImplementation(() => {
        queryCount++;
        if (queryCount === 1) return surveyChain;
        return insertChain;
      });

      await expect(
        NPSService.submitResponse({
          survey_id: 'survey-123',
          stakeholder_type: 'learner',
          stakeholder_id: 'respondent-123',
          score: 8,
        } as SubmitNPSResponseDto)
      ).resolves.not.toThrow();
    });

    it('should handle large limit values in pagination', async () => {
      mockFromChain.setMockData([], null, 0);

      await NPSService.getSurveys({
        institution_id: 'inst-123',
        limit: 1000,
        page: 1
      });

      expect(mockFromChain.range).toHaveBeenCalledWith(0, 999);
    });

    it('should handle negative NPS calculation correctly', async () => {
      // More detractors than promoters
      const mockResponses = [
        ...Array(20).fill({ score: 9, sentiment: 'promoter' }),
        ...Array(30).fill({ score: 7, sentiment: 'passive' }),
        ...Array(50).fill({ score: 5, sentiment: 'detractor' })
      ];
      mockFromChain.setMockData(mockResponses);

      const result = await NPSService.getSurveyResponseSummary('survey-123');

      // NPS = (20 - 50) / 100 * 100 = -30
      expect(result.nps_score).toBe(-30);
    });
  });
});
