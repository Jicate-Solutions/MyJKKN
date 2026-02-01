/**
 * EXAMPLE API ROUTE WITH COMPREHENSIVE ERROR HANDLING
 *
 * This is a template demonstrating proper error handling in Next.js API routes.
 * Use this as a reference when updating existing routes.
 */

import { NextRequest, NextResponse } from 'next/server';
import { handleApiError, successResponse } from '@/lib/utils/api-error-handler';
import { ValidationError } from '@/lib/errors/app-errors';
import { ExampleService } from '@/lib/services/examples/service-with-error-handling.example';

/**
 * GET /api/examples/resources
 * List resources with filters
 */
export async function GET(req: NextRequest) {
  try {
    // 1. EXTRACT QUERY PARAMETERS
    const searchParams = req.nextUrl.searchParams;
    const institutionId = searchParams.get('institution_id');
    const search = searchParams.get('search') || undefined;
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '10', 10);

    // 2. VALIDATE REQUIRED PARAMETERS
    if (!institutionId) {
      throw new ValidationError('institution_id parameter is required');
    }

    // 3. CALL SERVICE
    const result = await ExampleService.listResources({
      institution_id: institutionId,
      search,
      page,
      limit,
    });

    // 4. RETURN SUCCESS RESPONSE
    return successResponse(result);
  } catch (error) {
    // 5. HANDLE ERROR
    return handleApiError(error, {
      route: '/api/examples/resources',
      method: 'GET',
      params: {
        institution_id: req.nextUrl.searchParams.get('institution_id'),
        search: req.nextUrl.searchParams.get('search'),
      },
    });
  }
}

/**
 * POST /api/examples/resources
 * Create a new resource
 */
export async function POST(req: NextRequest) {
  try {
    // 1. PARSE REQUEST BODY
    const body = await req.json();

    // 2. VALIDATE REQUEST BODY EXISTS
    if (!body || typeof body !== 'object') {
      throw new ValidationError('Request body is required');
    }

    // 3. CALL SERVICE (service handles validation)
    const resource = await ExampleService.createResource({
      name: body.name,
      description: body.description,
      institution_id: body.institution_id,
    });

    // 4. RETURN SUCCESS RESPONSE (201 Created)
    return successResponse(
      resource,
      'Resource created successfully',
      201
    );
  } catch (error) {
    // 5. HANDLE ERROR
    return handleApiError(error, {
      route: '/api/examples/resources',
      method: 'POST',
    });
  }
}

/**
 * GET /api/examples/resources/[id]
 * Get a single resource
 */
export async function GET_BY_ID(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // 1. EXTRACT PARAMETERS
    const { id } = params;
    const institutionId = req.nextUrl.searchParams.get('institution_id') || undefined;

    // 2. VALIDATE ID
    if (!id) {
      throw new ValidationError('Resource ID is required');
    }

    // 3. CALL SERVICE
    const resource = await ExampleService.getResource(id, institutionId);

    // 4. RETURN SUCCESS
    return successResponse(resource);
  } catch (error) {
    // 5. HANDLE ERROR
    return handleApiError(error, {
      route: `/api/examples/resources/${params.id}`,
      method: 'GET',
      params: { id: params.id },
    });
  }
}

/**
 * PATCH /api/examples/resources/[id]
 * Update a resource
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // 1. EXTRACT PARAMETERS
    const { id } = params;
    const body = await req.json();
    const institutionId = req.nextUrl.searchParams.get('institution_id') || undefined;

    // 2. VALIDATE
    if (!id) {
      throw new ValidationError('Resource ID is required');
    }

    if (!body || typeof body !== 'object') {
      throw new ValidationError('Request body is required');
    }

    // 3. CALL SERVICE
    const updated = await ExampleService.updateResource(
      id,
      {
        name: body.name,
        description: body.description,
      },
      institutionId
    );

    // 4. RETURN SUCCESS
    return successResponse(updated, 'Resource updated successfully');
  } catch (error) {
    // 5. HANDLE ERROR
    return handleApiError(error, {
      route: `/api/examples/resources/${params.id}`,
      method: 'PATCH',
      params: { id: params.id },
    });
  }
}

/**
 * DELETE /api/examples/resources/[id]
 * Delete a resource
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // 1. EXTRACT PARAMETERS
    const { id } = params;
    const institutionId = req.nextUrl.searchParams.get('institution_id') || undefined;

    // 2. VALIDATE
    if (!id) {
      throw new ValidationError('Resource ID is required');
    }

    // 3. CALL SERVICE
    await ExampleService.deleteResource(id, institutionId);

    // 4. RETURN SUCCESS (204 No Content)
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    // 5. HANDLE ERROR
    return handleApiError(error, {
      route: `/api/examples/resources/${params.id}`,
      method: 'DELETE',
      params: { id: params.id },
    });
  }
}

/**
 * KEY PRINCIPLES FOR API ROUTES:
 *
 * 1. USE TRY-CATCH - Wrap all route handlers
 * 2. VALIDATE EARLY - Check parameters before calling services
 * 3. USE handleApiError - Standardized error response
 * 4. USE successResponse - Standardized success response
 * 5. LOG CONTEXT - Route path, method, parameters (no sensitive data)
 * 6. PROPER STATUS CODES:
 *    - 200: Success (GET, PATCH)
 *    - 201: Created (POST)
 *    - 204: No Content (DELETE)
 *    - 400: Validation Error
 *    - 401: Authentication Error
 *    - 403: Authorization Error
 *    - 404: Not Found
 *    - 409: Conflict
 *    - 500: Internal Server Error
 * 7. RETURN STRUCTURED JSON:
 *    Success: { success: true, data: {...}, message?: "..." }
 *    Error: { success: false, error: "...", code: "..." }
 */
