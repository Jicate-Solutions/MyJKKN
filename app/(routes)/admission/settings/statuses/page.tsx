import { Metadata } from 'next';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { StatusesDataTable } from './_components/statuses-data-table';

export const metadata: Metadata = { title: 'Admission Statuses | Settings' };

export default function AdmissionStatusesPage() {
  return (
    <PermissionGuard module="admission.settings.statuses" action="view">
      <div className="container mx-auto py-6 space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Admission Statuses</h1>
          <p className="text-sm text-muted-foreground">
            Define lead funnel stages and learner lifecycle statuses. Configure the fee-paid threshold
            that gates the <code>account → active</code> transition and the dashboard's "Seat Filled" KPI.
          </p>
        </div>
        <StatusesDataTable />
      </div>
    </PermissionGuard>
  );
}
