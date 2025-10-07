import { use } from 'react';
import { CourseMappingDetailView } from '../_components/course-mapping-detail-view';

interface CourseMappingDetailPageProps {
  params: Promise<{
    id: string;
  }>;
}

export default function CourseMappingDetailPage({
  params
}: CourseMappingDetailPageProps) {
  const { id } = use(params);
  return <CourseMappingDetailView mappingId={id} />;
}
