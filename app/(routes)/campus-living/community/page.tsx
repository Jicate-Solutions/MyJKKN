'use client';

import { Users2 } from 'lucide-react';
import { CampusLivingComingSoon } from '../_components/coming-soon';

export default function CampusLivingCommunityPage() {
  return (
    <CampusLivingComingSoon
      title="Hostel Community"
      description="Noticeboard, community events, polls, and peer-to-peer messaging for hostellers and wardens."
      feature="campus_living.community"
      icon={Users2}
      bullets={[
        'Per-block noticeboards with pinned announcements',
        'Event RSVPs (movie night, inter-block sports, clean-up drives)',
        'Moderated polls for mess menu voting and facility feedback',
        'Peer mentor channels auto-created on allocation',
        'Moderation queue for flagged posts with audit trail',
      ]}
    />
  );
}
