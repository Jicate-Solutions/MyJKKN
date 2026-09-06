// lib/services/billing/transport/transport-collection-service.ts
//
// Read-only service for the /billing/transport collection page. Lists transport (bus) fee
// collectables for bus-requiring dayscholars via fn_list_transport_collectables, which is
// SECURITY DEFINER + gated by billing.transport.view and self-scopes to the caller's
// accessible institutions. MUST be called from within a withAuth() handler so the
// request-scoped client (and thus auth.uid()) is set for the RPC's permission/scope checks.

import { BaseService } from '@/lib/services/base-service';

export interface TransportCollectable {
  student_id: string;
  first_name: string | null;
  last_name: string | null;
  roll_number: string | null;
  institution_id: string;
  route_number: string | null;
  route_name: string | null;
  stop_name: string | null;
  total_billed: number;
  outstanding_amount: number;
  payable_bill_ids: string[];
  bill_count: number;
  /** Term-wise descriptions of this learner's transport bills (excl. cancelled/superseded). */
  bill_descriptions: string[];
  /** Learner-only academic dimensions; always null on a Senior Learner row. */
  degree_name: string | null;
  department_name: string | null;
  program_name: string | null;
  semester_name: string | null;
  /**
   * Which population this row came from (added 2026-08-17).
   *
   * fn_list_transport_collectables UNIONs learners (billing_student_bills under
   * a 'transport' billing category) with Senior Learners (tms_fee_bill,
   * person_type='staff'). It always did, but returned nothing to tell them
   * apart, so the page listed both and could only guess by "degree, programme
   * and semester are all null" — which is also true of a learner whose
   * programme has not been assigned.
   */
  person_type: 'learner' | 'staff';
}

export interface ListTransportCollectablesParams {
  /** Optional narrowing filter; intersected with the user's accessible institutions in SQL. */
  institutionIds?: string[] | null;
  academicYearId?: string | null;
}

export class TransportCollectionService extends BaseService {
  static async listCollectables(
    params: ListTransportCollectablesParams = {},
  ): Promise<TransportCollectable[]> {
    const rows = await this.executeDashboardRPC<TransportCollectable[]>(
      'fn_list_transport_collectables',
      {
        p_institution_ids:
          params.institutionIds && params.institutionIds.length > 0 ? params.institutionIds : null,
        p_academic_year_id: params.academicYearId ?? null,
      },
    );
    return rows ?? [];
  }
}
