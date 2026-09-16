// app/api/service-requests/[id]/gate-pass/route.ts
//
// The gate pass issued for an approved Gate Pass service request.
//
// Who may read it: the requester (it is THEIR pass — they show the QR at the
// gate), super admins, office staff (service_requests.manage), anyone who
// recorded an approval on the request, and gate security. RLS on
// hostel_gate_passes has no lane for a non-hosteler learner, so the read is
// done with the service-role client AFTER the authorisation above.
//
// Also self-heals: an approved request of a gate-pass type with no pass yet
// (e.g. the RPC failed at approval time) is issued here when the caller may
// approve requests — so the office can recover without re-approving.

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/utils/parent-admin-auth';
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const user = await currentUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = createServiceRoleClient() as any;
  const { data: sr, error } = await db
    .from('service_requests')
    .select(
      'id, request_number, requester_id, status, service_type:service_types(id, name, issues_gate_pass)'
    )
    .eq('id', id)
    .maybeSingle();
  if (error || !sr) {
    return NextResponse.json({ error: 'Service request not found' }, { status: 404 });
  }
  if (!sr.service_type?.issues_gate_pass) {
    return NextResponse.json({ error: 'This request type does not issue a gate pass' }, { status: 400 });
  }

  const perms = user.permissions ?? {};
  let allowed =
    user.isSuperAdmin ||
    sr.requester_id === user.id ||
    perms['service_requests.manage'] === true ||
    perms['service_requests.approve'] === true ||
    perms['gate_security.scan.view'] === true ||
    perms['campus_living.gate_passes.edit'] === true;
  if (!allowed) {
    const { data: myApproval } = await db
      .from('service_request_approvals')
      .select('id')
      .eq('service_request_id', id)
      .eq('approver_id', user.id)
      .eq('action', 'approved')
      .limit(1)
      .maybeSingle();
    allowed = Boolean(myApproval);
  }
  if (!allowed) {
    return NextResponse.json({ error: 'You cannot view this gate pass' }, { status: 403 });
  }

  const PASS_SELECT =
    'id, pass_number, qr_code, status, valid_date, expected_exit, expected_return, out_time, actual_return, reason, destination, alternate_mobile, approved_at, approved_by';

  let { data: pass } = await db
    .from('hostel_gate_passes')
    .select(PASS_SELECT)
    .eq('service_request_id', id)
    .maybeSingle();

  // Self-heal: approved but never issued. Only someone who may approve can
  // trigger the issue; the RPC re-checks that under the caller's session.
  if (!pass && ['approved', 'fulfilled'].includes(sr.status)) {
    const canIssue = user.isSuperAdmin || perms['service_requests.approve'] === true;
    if (canIssue) {
      const session = await createServerSupabaseClient();
      const { error: rpcError } = await (session as any).rpc('issue_gate_pass_for_service_request', {
        p_request_id: id,
      });
      if (rpcError) {
        console.error('[service-requests/gate-pass] issue failed:', rpcError);
      } else {
        ({ data: pass } = await db
          .from('hostel_gate_passes')
          .select(PASS_SELECT)
          .eq('service_request_id', id)
          .maybeSingle());
      }
    }
  }

  // Team-member requester: the pass lives in gate_staff_passes and is issued
  // at submit time (no approval needed).
  if (!pass) {
    let { data: staffPass } = await db
      .from('gate_staff_passes')
      .select('id, pass_number, qr_code, status, reason, out_time, in_time, created_at')
      .eq('service_request_id', id)
      .maybeSingle();
    if (
      !staffPass &&
      ['submitted', 'in_review', 'approved', 'fulfilled'].includes(sr.status) &&
      sr.requester_id === user.id
    ) {
      const session = await createServerSupabaseClient();
      const { error: rpcError } = await (session as any).rpc('issue_gate_pass_for_service_request', {
        p_request_id: id,
      });
      if (rpcError) {
        console.error('[service-requests/gate-pass] team-member issue failed:', rpcError);
      } else {
        ({ data: staffPass } = await db
          .from('gate_staff_passes')
          .select('id, pass_number, qr_code, status, reason, out_time, in_time, created_at')
          .eq('service_request_id', id)
          .maybeSingle());
      }
    }
    if (staffPass) {
      return NextResponse.json({
        issued: true,
        kind: 'staff',
        request_status: sr.status,
        request_number: sr.request_number,
        pass: {
          id: staffPass.id,
          pass_number: staffPass.pass_number,
          qr_code: staffPass.qr_code,
          status: staffPass.status,
          valid_date: null,
          expected_exit: null,
          expected_return: null,
          out_time: staffPass.out_time,
          actual_return: staffPass.in_time,
          reason: staffPass.reason,
          destination: null,
          alternate_mobile: null,
          approved_at: staffPass.created_at,
          approved_by_name: null,
        },
      });
    }
  }

  if (!pass) {
    return NextResponse.json({
      issued: false,
      request_status: sr.status,
      request_number: sr.request_number,
    });
  }

  // The qr_code is the ONLY thing that goes into the QR image (requirement
  // §15). It is handed to the requester and to security; nobody else.
  // approved_by has no FK to profiles, so no embed — one small lookup.
  const { approved_by: approvedBy, ...rest } = pass;
  let approvedByName: string | null = null;
  if (approvedBy) {
    const { data: approver } = await db
      .from('profiles')
      .select('full_name')
      .eq('id', approvedBy)
      .maybeSingle();
    approvedByName = approver?.full_name ?? null;
  }
  return NextResponse.json({
    issued: true,
    kind: 'learner',
    request_status: sr.status,
    request_number: sr.request_number,
    pass: { ...rest, approved_by_name: approvedByName },
  });
}
