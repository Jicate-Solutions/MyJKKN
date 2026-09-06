import { Card, CardContent } from '@/components/ui/card';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { SopList } from './_components/sop-list';

export const metadata = {
  title: 'SOP Documents - Board of Studies',
};

export default function SopListPage() {
  // Super-admin only: no custom_role carries academic.bos-sop.* (see
  // 20260627_bos_taxonomy_sop_superadmin_only.sql). The sidebar/search already
  // hide the link for non-super-admins via MENU_PERMISSIONS; this guard also
  // blocks direct-URL access so the rule holds end-to-end.
  return (
    <PermissionGuard module='academic.bos-sop' action='view'>
      <Card>
        <CardContent className='p-6'>
          <SopList />
        </CardContent>
      </Card>
    </PermissionGuard>
  );
}
