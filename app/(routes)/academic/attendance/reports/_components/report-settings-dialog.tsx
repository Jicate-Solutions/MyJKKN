'use client';

import { useCallback, useEffect, useState } from 'react';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle, Loader2, Settings2 } from 'lucide-react';
import { toast } from 'sonner';
import {
	AttendanceReportAggregates,
	FALLBACK_SETTINGS,
	type AttendanceReportSettings
} from '@/lib/services/academic/attendance-report-aggregates';
import { usePermissions } from '@/hooks/use-permissions';
import { useAuth } from '@/hooks/use-auth';

/**
 * Editor for one institution's attendance rules.
 *
 * Write is admin-only at the database level, so the trigger is hidden for
 * everyone else rather than offered and then rejected — these values decide who
 * sits an examination.
 */
export function ReportSettingsDialog({
	institutionId,
	onSaved
}: {
	institutionId: string | undefined;
	onSaved?: (s: AttendanceReportSettings) => void;
}) {
	const { isSuperAdmin } = usePermissions();
	const { profile } = useAuth();
	const canEdit = isSuperAdmin || profile?.role === 'admin';

	const [open, setOpen] = useState(false);
	const [loading, setLoading] = useState(false);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [form, setForm] = useState({
		attendance_threshold: String(FALLBACK_SETTINGS.attendance_threshold),
		condonation_floor: String(FALLBACK_SETTINGS.condonation_floor),
		include_od: FALLBACK_SETTINGS.include_od,
		include_leave: FALLBACK_SETTINGS.include_leave
	});
	const [configured, setConfigured] = useState(false);

	useEffect(() => {
		if (!open || !institutionId) return;
		let alive = true;
		setLoading(true);
		setError(null);
		AttendanceReportAggregates.getSettings(institutionId)
			.then((s) => {
				if (!alive) return;
				setForm({
					attendance_threshold: String(s.attendance_threshold),
					condonation_floor: String(s.condonation_floor),
					include_od: s.include_od,
					include_leave: s.include_leave
				});
				setConfigured(s.configured);
			})
			.finally(() => alive && setLoading(false));
		return () => {
			alive = false;
		};
	}, [open, institutionId]);

	const save = useCallback(async () => {
		if (!institutionId) return;
		const threshold = Number(form.attendance_threshold);
		const floor = Number(form.condonation_floor);

		// Mirrors the database CHECK constraints so a mistake is caught here with a
		// sentence rather than surfacing as an opaque 23514.
		if (!Number.isFinite(threshold) || threshold < 0 || threshold > 100) {
			setError('Eligibility threshold must be between 0 and 100.');
			return;
		}
		if (!Number.isFinite(floor) || floor < 0 || floor > 100) {
			setError('Condonation floor must be between 0 and 100.');
			return;
		}
		if (floor > threshold) {
			setError(
				'The condonation floor cannot be above the eligibility threshold — there would be no band between them.'
			);
			return;
		}

		setSaving(true);
		setError(null);
		try {
			const next = {
				attendance_threshold: threshold,
				condonation_floor: floor,
				include_od: form.include_od,
				include_leave: form.include_leave
			};
			await AttendanceReportAggregates.saveSettings(institutionId, next);
			toast.success('Attendance rules saved');
			setConfigured(true);
			onSaved?.({ ...next, configured: true });
			setOpen(false);
		} catch (e) {
			setError(e instanceof Error ? e.message : 'Could not save the rules.');
		} finally {
			setSaving(false);
		}
	}, [institutionId, form, onSaved]);

	if (!canEdit || !institutionId) return null;

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button variant='outline' size='sm'>
					<Settings2 className='mr-2 h-4 w-4' />
					Attendance rules
				</Button>
			</DialogTrigger>
			<DialogContent className='sm:max-w-md'>
				<DialogHeader>
					<DialogTitle>Attendance rules</DialogTitle>
					<DialogDescription>
						{configured
							? 'These rules apply to every attendance report for this institution.'
							: 'This institution has no rules set, so reports use the defaults below. Saving makes them explicit.'}
					</DialogDescription>
				</DialogHeader>

				{loading ? (
					<div className='flex items-center gap-2 py-6 text-sm text-muted-foreground'>
						<Loader2 className='h-4 w-4 animate-spin' /> Loading…
					</div>
				) : (
					<div className='space-y-4 py-2'>
						<div className='grid grid-cols-2 gap-3'>
							<div className='space-y-1.5'>
								<Label htmlFor='ars-threshold'>Eligible at (%)</Label>
								<Input
									id='ars-threshold'
									inputMode='decimal'
									value={form.attendance_threshold}
									onChange={(e) =>
										setForm((f) => ({
											...f,
											attendance_threshold: e.target.value
										}))
									}
								/>
							</div>
							<div className='space-y-1.5'>
								<Label htmlFor='ars-floor'>Condonation from (%)</Label>
								<Input
									id='ars-floor'
									inputMode='decimal'
									value={form.condonation_floor}
									onChange={(e) =>
										setForm((f) => ({
											...f,
											condonation_floor: e.target.value
										}))
									}
								/>
							</div>
						</div>
						<p className='text-xs text-muted-foreground'>
							At or above the threshold is eligible. Between the floor and the
							threshold, condonation is required. Below the floor is not
							eligible.
						</p>

						<div className='flex items-center justify-between rounded-md border p-3'>
							<div className='space-y-0.5'>
								<Label htmlFor='ars-od'>Count On Duty as attended</Label>
								<p className='text-xs text-muted-foreground'>
									Applies to the OD-adjusted percentage.
								</p>
							</div>
							<Switch
								id='ars-od'
								checked={form.include_od}
								onCheckedChange={(v) =>
									setForm((f) => ({ ...f, include_od: v }))
								}
							/>
						</div>

						<div className='flex items-center justify-between rounded-md border p-3'>
							<div className='space-y-0.5'>
								<Label htmlFor='ars-leave'>Count approved Leave as attended</Label>
								<p className='text-xs text-muted-foreground'>
									Most ordinances do not. Off by default.
								</p>
							</div>
							<Switch
								id='ars-leave'
								checked={form.include_leave}
								onCheckedChange={(v) =>
									setForm((f) => ({ ...f, include_leave: v }))
								}
							/>
						</div>

						{error && (
							<Alert variant='destructive'>
								<AlertCircle className='h-4 w-4' />
								<AlertDescription>{error}</AlertDescription>
							</Alert>
						)}
					</div>
				)}

				<DialogFooter>
					<Button
						variant='outline'
						onClick={() => setOpen(false)}
						disabled={saving}
					>
						Cancel
					</Button>
					<Button onClick={save} disabled={saving || loading}>
						{saving && <Loader2 className='mr-2 h-4 w-4 animate-spin' />}
						Save rules
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
