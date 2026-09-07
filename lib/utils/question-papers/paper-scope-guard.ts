import { CoeRestClient } from '@/lib/services/coe/coe-rest-client';
import {
  resolveCoeInstitutionCode,
  resolveCoeInstitutionById,
  type InternalMarksAccessScope,
} from '@/lib/utils/internal-marks/internal-marks-access';
import type { IaQuestionPaperDetail } from '@/types/ia-question-paper';

/**
 * SERVER-ONLY. Cross-institution guard for a single question paper.
 *
 * The COE `/api/v1/ia/*` endpoints only check the APP's API key — which is scoped
 * to a set of institutions, not to the MyJKKN user holding the session. Any signed-in
 * MyJKKN user could otherwise read or write another college's paper simply by
 * knowing its id. Every per-paper proxy route therefore re-guards here.
 *
 * CAS-safe by construction: MyJKKN's SF and Aided institutions both resolve to the
 * single COE `institution_code` ("CAS"), so a comparison on the CODE lets the two
 * sibling institutions share papers while still rejecting a different college.
 *
 * NEVER import this from a client component — it pulls in CoeRestClient, which
 * reads the COE API secret from the environment.
 */
export async function guardPaperScope(
  scope: InternalMarksAccessScope,
  coePaperInstitutionsId: string | null | undefined
): Promise<boolean> {
  if (scope.isSuperAdmin) return true;
  if (!scope.institutionId || !coePaperInstitutionsId) return false;
  const [userCode, paperInst] = await Promise.all([
    resolveCoeInstitutionCode(scope.institutionId),
    resolveCoeInstitutionById(coePaperInstitutionsId),
  ]);
  return (
    !!userCode &&
    !!paperInst &&
    userCode.toUpperCase() === paperInst.institution_code.toUpperCase()
  );
}

/**
 * Fetch a paper from COE and verify the caller may touch it.
 *
 * Returns the paper on success, or `null` when it does not exist / is out of the
 * caller's scope — callers should answer 404 for BOTH, so a probe cannot
 * distinguish "wrong id" from "another college's paper".
 */
export async function loadPaperInScope(
  scope: InternalMarksAccessScope,
  paperId: string
): Promise<IaQuestionPaperDetail | null> {
  const client = CoeRestClient.create();
  const coe = await client.get<{ data: IaQuestionPaperDetail }>(
    `/api/v1/ia/question-papers/${paperId}`
  );
  const paper = coe?.data;
  if (!paper) return null;
  return (await guardPaperScope(scope, paper.institutions_id)) ? paper : null;
}

/** COE credentials for the routes that must bypass the JSON-only CoeRestClient. */
export function coeDirectFetchConfig():
  | { baseUrl: string; headers: Record<string, string> }
  | null {
  const baseUrl = process.env.COE_API_URL;
  const keyId = process.env.COE_API_KEY_ID;
  const secret = process.env.COE_API_SECRET;
  if (!baseUrl || !keyId || !secret) return null;
  return { baseUrl, headers: { 'X-API-Key-Id': keyId, 'X-API-Secret': secret } };
}
