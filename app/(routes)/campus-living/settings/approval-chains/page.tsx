'use client';

// Approval-chain rules admin page — rewritten from mock JSX (PR-0, 2026-04-22).
// Reads rules from DB via ApprovalChainService. Shows each rule's stages as
// a read-only stepper. Admins can toggle `is_active`, edit name / description /
// priority, and delete rules with no active runs. Creating new rules and
// editing stages is deferred (complex JSON UX for a later PR).
//
// The editor body now lives in <ApprovalChainsSection /> (chrome-less) so it can
// be embedded inside the unified Campus Living config sections. This page keeps
// only the outer ContentLayout chrome and renders identically to before.

import { ContentLayout } from '@/components/layout/content-layout';
import { ApprovalChainsSection } from './_components/-approval-chains-section';

export default function ApprovalChainsPage() {
  return (
    <ContentLayout title='Approval Chains'>
      <ApprovalChainsSection />
    </ContentLayout>
  );
}
