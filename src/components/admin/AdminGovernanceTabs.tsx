import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { jsPDF } from 'jspdf';
import {
  Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import {
  Bell, Check, CheckCircle2, Database, Download, FileText, History, Lock, Megaphone,
  Save, Search, ShieldCheck, Trash2, Users, X,
} from 'lucide-react';
import { customFetch } from '@/api-client-react/custom-fetch';
import { downloadApiFile } from '@/lib/lecturerApi';
import { useToast } from '@/hooks/use-toast';

type RequireReauthFn = (label: string, onVerified: (reauthToken: string) => void | Promise<void>) => void;

export function AdminReportsTab({ requireReauth }: { requireReauth: RequireReauthFn }) {
  const { toast } = useToast();
  const reportsQuery = useQuery({
    queryKey: ['admin-reports'],
    queryFn: () => customFetch<any>('/api/admin/reports'),
  });

  const data = reportsQuery.data;
  const rows = data?.byDepartment ?? [];

  const exportAggregatePdf = () => {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
    doc.setFontSize(16);
    doc.text('Institutional Aggregate Attendance Report', 40, 50);
    doc.setFontSize(10);
    doc.text(`Generated: ${new Date().toLocaleString()} · Aggregate totals only (No Student PII)`, 40, 70);
    doc.text(
      `Institution Average: ${data?.overallAvgAttendancePct ?? 0}% | Sessions Held: ${data?.totalSessionsHeld ?? 0} | Open Disputes: ${data?.totalOpenDisputes ?? 0}`,
      40,
      90,
    );

    let y = 130;
    doc.setFont('helvetica', 'bold');
    doc.text('Department', 40, y);
    doc.text('Classes', 220, y);
    doc.text('Sessions', 280, y);
    doc.text('Avg %', 350, y);
    doc.text('Adoption %', 410, y);
    doc.text('Disputes (O/R)', 490, y);
    doc.setFont('helvetica', 'normal');
    y += 18;

    for (const d of rows) {
      doc.text(String(d.department).slice(0, 26), 40, y);
      doc.text(String(d.classesCount), 220, y);
      doc.text(String(d.sessionsHeld), 280, y);
      doc.text(`${d.avgAttendancePct}%`, 350, y);
      doc.text(`${d.adoptionPct}%`, 410, y);
      doc.text(`${d.disputesOpen} / ${d.disputesResolved}`, 490, y);
      y += 20;
    }

    doc.save('institutional-aggregate-report.pdf');
    toast({ title: 'Aggregate PDF exported', description: 'Zero student names or personal photos included.' });
  };

  return (
    <div className="space-y-6" data-testid="section-admin-reports">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 tabular-nums">
        <div className="surface p-5">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Overall Attendance</div>
          <div className="mt-2 font-serif text-3xl font-extrabold">{data?.overallAvgAttendancePct ?? 0}%</div>
        </div>
        <div className="surface p-5">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Sessions Held</div>
          <div className="mt-2 font-serif text-3xl font-extrabold">{data?.totalSessionsHeld ?? 0}</div>
        </div>
        <div className="surface p-5">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Open Disputes</div>
          <div className="mt-2 font-serif text-3xl font-extrabold text-amber-700">{data?.totalOpenDisputes ?? 0}</div>
        </div>
        <div className="surface p-5">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Resolved Disputes</div>
          <div className="mt-2 font-serif text-3xl font-extrabold text-emerald-700">{data?.totalResolvedDisputes ?? 0}</div>
        </div>
      </div>

      <div className="surface p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-4">
          <div>
            <h2 className="font-serif text-lg font-bold">Institution &amp; Department Usage, Adoption &amp; Attendance</h2>
            <p className="text-xs text-muted-foreground">Aggregate metrics only. Exports require administrator re-authentication.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() =>
                requireReauth('Export Aggregate Excel Report (.xlsx)', async (reauthToken) => {
                  await downloadApiFile('/api/admin/reports/export?format=xlsx', 'institutional-aggregate-report.xlsx', {
                    'X-Admin-Reauth': reauthToken,
                  });
                  toast({ title: 'Excel report downloaded' });
                })
              }
              className="btn btn-outline !px-3 !py-1.5 !text-xs whitespace-nowrap shrink-0"
              data-testid="button-export-reports-xlsx"
            >
              <Download size={13} /> Excel (.xlsx)
            </button>
            <button
              type="button"
              onClick={() =>
                requireReauth('Export Aggregate CSV Report', async (reauthToken) => {
                  await downloadApiFile('/api/admin/reports/export?format=csv', 'institutional-aggregate-report.csv', {
                    'X-Admin-Reauth': reauthToken,
                  });
                  toast({ title: 'CSV report downloaded' });
                })
              }
              className="btn btn-outline !px-3 !py-1.5 !text-xs whitespace-nowrap shrink-0"
            >
              <Download size={13} /> CSV
            </button>
            <button
              type="button"
              onClick={() => requireReauth('Export Aggregate PDF Report', exportAggregatePdf)}
              className="btn btn-primary !px-3 !py-1.5 !text-xs whitespace-nowrap shrink-0"
              data-testid="button-export-reports-pdf"
            >
              <FileText size={13} /> PDF Report
            </button>
          </div>
        </div>

        <div className="mt-5 h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis dataKey="department" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Legend />
              <Bar dataKey="avgAttendancePct" name="Avg Attendance %" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              <Bar dataKey="adoptionPct" name="Lecturer Adoption %" fill="#0d9488" radius={[4, 4, 0, 0]} />
              <Bar dataKey="sessionsHeld" name="Sessions Held" fill="#f59e0b" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="mt-6 overflow-x-auto border-t pt-4">
          <table className="w-full text-left text-xs">
            <thead className="border-b bg-muted/40 font-semibold uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5">Department</th>
                <th className="px-4 py-2.5">Classes</th>
                <th className="px-4 py-2.5">Sessions</th>
                <th className="px-4 py-2.5">Avg Attendance</th>
                <th className="px-4 py-2.5">Lecturer Adoption</th>
                <th className="px-4 py-2.5">Disputes (Open / Resolved)</th>
              </tr>
            </thead>
            <tbody className="divide-y tabular-nums">
              {rows.map((d: any) => (
                <tr key={d.department}>
                  <td className="px-4 py-3 font-semibold">{d.department}</td>
                  <td className="px-4 py-3 font-mono">{d.classesCount}</td>
                  <td className="px-4 py-3 font-mono">{d.sessionsHeld}</td>
                  <td className="px-4 py-3 font-mono font-bold">{d.avgAttendancePct}%</td>
                  <td className="px-4 py-3 font-mono">{d.adoptionPct}%</td>
                  <td className="px-4 py-3 font-mono">
                    {d.disputesOpen} / {d.disputesResolved}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export function AdminSettingsTab({
  isSuperAdmin,
  requireReauth,
}: {
  isSuperAdmin: boolean;
  requireReauth: RequireReauthFn;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const settingsQuery = useQuery({
    queryKey: ['admin-settings'],
    queryFn: () => customFetch<any>('/api/admin/settings'),
  });
  const dataRequestsQuery = useQuery({
    queryKey: ['admin-data-requests'],
    queryFn: () => customFetch<any[]>('/api/admin/data-requests'),
  });
  const announcementsQuery = useQuery({
    queryKey: ['admin-announcements'],
    queryFn: () => customFetch<any[]>('/api/admin/announcements'),
  });

  const [form, setForm] = useState<any>(null);
  const [reason, setReason] = useState('');
  const [annAudience, setAnnAudience] = useState<'all_lecturers' | 'all_students'>('all_lecturers');
  const [annTitle, setAnnTitle] = useState('');
  const [annMessage, setAnnMessage] = useState('');

  useEffect(() => {
    if (settingsQuery.data && !form) {
      setForm({
        ...settingsQuery.data,
        allowedStaffDomainsText: (settingsQuery.data.allowedStaffDomains ?? []).join(', '),
        ipAllowListText: (settingsQuery.data.ipAllowList ?? []).join(', '),
      });
    }
  }, [settingsQuery.data, form]);

  const saveSettingsMutation = useMutation({
    mutationFn: ({ payload, reauthToken }: { payload: any; reauthToken: string }) =>
      customFetch<any>('/api/admin/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Reauth': reauthToken,
        },
        body: JSON.stringify(payload),
      }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['admin-settings'] });
      qc.invalidateQueries({ queryKey: ['admin-approvals'] });
      qc.invalidateQueries({ queryKey: ['admin-audit'] });
      qc.invalidateQueries({ queryKey: ['admin-security-status'] });
      setReason('');
      if (res.pendingTwoPersonApproval) {
        toast({
          title: 'Two-person approval queued',
          description: 'Lowering a security or attendance threshold requires second administrator confirmation.',
        });
      } else {
        toast({
          title: res.reconsentTriggered ? 'Settings saved · Re-consent triggered' : 'Global policy settings saved',
        });
      }
    },
    onError: (err) => {
      toast({ title: 'Could not save settings', description: err instanceof Error ? err.message : '', variant: 'destructive' });
    },
  });

  const purgeMutation = useMutation({
    mutationFn: () => customFetch<any>('/api/admin/purge/run', { method: 'POST' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-audit'] });
      toast({ title: 'Photo retention purge completed & logged' });
    },
  });

  const dataReqDecisionMutation = useMutation({
    mutationFn: ({ id, decision }: { id: string; decision: 'fulfilled' | 'rejected' }) =>
      customFetch(`/api/admin/data-requests/${id}/decide`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-data-requests'] });
      qc.invalidateQueries({ queryKey: ['admin-audit'] });
      toast({ title: 'Privacy data request updated' });
    },
  });

  const sendAnnouncementMutation = useMutation({
    mutationFn: (payload: { audience: 'all_lecturers' | 'all_students'; title: string; message: string }) =>
      customFetch('/api/admin/announcements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-announcements'] });
      qc.invalidateQueries({ queryKey: ['admin-audit'] });
      setAnnTitle('');
      setAnnMessage('');
      toast({ title: 'Announcement broadcast sent' });
    },
  });

  if (!form) return <div className="p-8 text-xs text-muted-foreground">Loading policy configuration…</div>;

  const handleSave = (e: FormEvent) => {
    e.preventDefault();
    const payload = {
      attendanceThresholdPct: Number(form.attendanceThresholdPct),
      defaultRadiusM: Number(form.defaultRadiusM),
      maxRadiusM: Number(form.maxRadiusM),
      rotatingCodeSeconds: Number(form.rotatingCodeSeconds),
      strictGeofence: Boolean(form.strictGeofence),
      allowStaticCodes: Boolean(form.allowStaticCodes),
      sessionGraceBeforeMin: Number(form.sessionGraceBeforeMin),
      sessionGraceAfterMin: Number(form.sessionGraceAfterMin),
      allowLateStatus: Boolean(form.allowLateStatus),
      lateAfterMinutesDefault: Number(form.lateAfterMinutesDefault),
      faceAutoPassMin: Number(form.faceAutoPassMin),
      faceMiddleBandMin: Number(form.faceMiddleBandMin),
      middleBandPolicy: form.middleBandPolicy,
      registrationPhotoRetentionDays: Number(form.registrationPhotoRetentionDays),
      attendancePhotoRetentionDays: Number(form.attendancePhotoRetentionDays),
      purgeSchedule: form.purgeSchedule,
      allowedStaffDomains: String(form.allowedStaffDomainsText)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      apiRateLimitPerMin: Number(form.apiRateLimitPerMin),
      ipAllowList: String(form.ipAllowListText)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      failedLoginLockoutAttempts: Number(form.failedLoginLockoutAttempts),
      sessionTimeoutMinutes: Number(form.sessionTimeoutMinutes),
      twoFactorRequiredForAdmins: Boolean(form.twoFactorRequiredForAdmins),
      privacyPolicyVersion: String(form.privacyPolicyVersion),
      privacyPolicyText: String(form.privacyPolicyText),
      consentNoticeText: String(form.consentNoticeText),
      requireReconsentOnUpdate: Boolean(form.requireReconsentOnUpdate),
      emailTemplateInvite: String(form.emailTemplateInvite),
      pushTemplateSessionOpen: String(form.pushTemplateSessionOpen),
      ...(reason.trim() ? { reason: reason.trim() } : {}),
    };

    requireReauth('Update Institutional Policy & Security Thresholds', (reauthToken) => {
      saveSettingsMutation.mutate({ payload, reauthToken });
    });
  };

  return (
    <div className="space-y-6" data-testid="section-admin-settings">
      <form onSubmit={handleSave} className="surface space-y-6 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-4">
          <div>
            <div className="eyebrow">Institutional Policy Engine</div>
            <h2 className="mt-1 font-serif text-lg font-bold">Defaults, Face Thresholds, Retention &amp; Templates</h2>
            <p className="text-xs text-muted-foreground">
              Changes require re-authentication. Lowering any attendance, geofence, or face-match threshold triggers two-person approval.
            </p>
          </div>
          {isSuperAdmin && (
            <button type="submit" className="btn btn-primary whitespace-nowrap shrink-0" data-testid="button-save-settings">
              <Save size={14} /> Save Policy Settings
            </button>
          )}
        </div>

        {/* Attendance, Radius & Session Window Defaults */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block text-xs font-semibold">
            Attendance threshold (%)
            <input
              type="number"
              className="field mt-1.5 font-mono"
              value={form.attendanceThresholdPct}
              onChange={(e) => setForm({ ...form, attendanceThresholdPct: Number(e.target.value) })}
              disabled={!isSuperAdmin}
              data-testid="input-setting-threshold"
            />
          </label>
          <label className="block text-xs font-semibold">
            Default radius (m)
            <input
              type="number"
              className="field mt-1.5 font-mono"
              value={form.defaultRadiusM}
              onChange={(e) => setForm({ ...form, defaultRadiusM: Number(e.target.value) })}
              disabled={!isSuperAdmin}
            />
          </label>
          <label className="block text-xs font-semibold">
            Maximum radius (m)
            <input
              type="number"
              className="field mt-1.5 font-mono"
              value={form.maxRadiusM}
              onChange={(e) => setForm({ ...form, maxRadiusM: Number(e.target.value) })}
              disabled={!isSuperAdmin}
            />
          </label>
          <label className="block text-xs font-semibold">
            Code rotation interval (sec)
            <input
              type="number"
              className="field mt-1.5 font-mono"
              value={form.rotatingCodeSeconds}
              onChange={(e) => setForm({ ...form, rotatingCodeSeconds: Number(e.target.value) })}
              disabled={!isSuperAdmin}
            />
          </label>
          <label className="block text-xs font-semibold">
            Grace before start (min)
            <input
              type="number"
              className="field mt-1.5 font-mono"
              value={form.sessionGraceBeforeMin}
              onChange={(e) => setForm({ ...form, sessionGraceBeforeMin: Number(e.target.value) })}
              disabled={!isSuperAdmin}
            />
          </label>
          <label className="block text-xs font-semibold">
            Grace after end (min)
            <input
              type="number"
              className="field mt-1.5 font-mono"
              value={form.sessionGraceAfterMin}
              onChange={(e) => setForm({ ...form, sessionGraceAfterMin: Number(e.target.value) })}
              disabled={!isSuperAdmin}
            />
          </label>
          <label className="block text-xs font-semibold">
            Default late cut-off (min)
            <input
              type="number"
              className="field mt-1.5 font-mono"
              value={form.lateAfterMinutesDefault}
              onChange={(e) => setForm({ ...form, lateAfterMinutesDefault: Number(e.target.value) })}
              disabled={!isSuperAdmin}
            />
          </label>
          <div className="flex flex-col justify-end gap-2 text-xs">
            <label className="inline-flex items-center gap-2 font-medium cursor-pointer">
              <input
                type="checkbox"
                checked={form.allowLateStatus}
                onChange={(e) => setForm({ ...form, allowLateStatus: e.target.checked })}
                className="accent-primary"
              />
              Allow optional late status
            </label>
            <label className="inline-flex items-center gap-2 font-medium cursor-pointer">
              <input
                type="checkbox"
                checked={form.allowStaticCodes}
                onChange={(e) => setForm({ ...form, allowStaticCodes: e.target.checked })}
                className="accent-primary"
              />
              Allow static fallback codes
            </label>
          </div>
        </div>

        {/* Face-Match Thresholds & Retention */}
        <div className="grid gap-4 border-t pt-5 sm:grid-cols-2 lg:grid-cols-3">
          <label className="block text-xs font-semibold">
            Face auto-pass threshold (0–1)
            <input
              type="number"
              step="0.01"
              className="field mt-1.5 font-mono"
              value={form.faceAutoPassMin}
              onChange={(e) => setForm({ ...form, faceAutoPassMin: Number(e.target.value) })}
              disabled={!isSuperAdmin}
            />
          </label>
          <label className="block text-xs font-semibold">
            Face middle-band min (0–1)
            <input
              type="number"
              step="0.01"
              className="field mt-1.5 font-mono"
              value={form.faceMiddleBandMin}
              onChange={(e) => setForm({ ...form, faceMiddleBandMin: Number(e.target.value) })}
              disabled={!isSuperAdmin}
            />
          </label>
          <label className="block text-xs font-semibold">
            Middle-band policy
            <select
              className="field mt-1.5"
              value={form.middleBandPolicy}
              onChange={(e) => setForm({ ...form, middleBandPolicy: e.target.value })}
              disabled={!isSuperAdmin}
            >
              <option value="lecturer_review">Route to Lecturer Review Queue</option>
              <option value="require_recapture">Require Photo Re-capture</option>
              <option value="flag_only">Accept with Audit Flag Only</option>
            </select>
          </label>
          <label className="block text-xs font-semibold">
            Registration photo retention (days)
            <input
              type="number"
              className="field mt-1.5 font-mono"
              value={form.registrationPhotoRetentionDays}
              onChange={(e) => setForm({ ...form, registrationPhotoRetentionDays: Number(e.target.value) })}
              disabled={!isSuperAdmin}
            />
          </label>
          <label className="block text-xs font-semibold">
            Attendance photo retention (days)
            <input
              type="number"
              className="field mt-1.5 font-mono"
              value={form.attendancePhotoRetentionDays}
              onChange={(e) => setForm({ ...form, attendancePhotoRetentionDays: Number(e.target.value) })}
              disabled={!isSuperAdmin}
            />
          </label>
          <div className="flex items-end gap-2">
            <label className="block flex-1 text-xs font-semibold">
              Purge schedule
              <select
                className="field mt-1.5"
                value={form.purgeSchedule}
                onChange={(e) => setForm({ ...form, purgeSchedule: e.target.value })}
                disabled={!isSuperAdmin}
              >
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
                <option value="end_of_semester">End of Semester</option>
              </select>
            </label>
            {isSuperAdmin && (
              <button
                type="button"
                onClick={() => purgeMutation.mutate()}
                className="btn btn-outline !py-2 !text-xs whitespace-nowrap shrink-0"
              >
                <Trash2 size={13} /> Run Purge
              </button>
            )}
          </div>
        </div>

        {/* Staff Email Domains, Rate Limits & Versioned Consent / Privacy */}
        <div className="grid gap-4 border-t pt-5 sm:grid-cols-2">
          <label className="block text-xs font-semibold">
            Allowed staff email domains (comma-separated)
            <input
              className="field mt-1.5 font-mono"
              value={form.allowedStaffDomainsText}
              onChange={(e) => setForm({ ...form, allowedStaffDomainsText: e.target.value })}
              disabled={!isSuperAdmin}
            />
          </label>
          <label className="block text-xs font-semibold">
            API rate limit (requests / min)
            <input
              type="number"
              className="field mt-1.5 font-mono"
              value={form.apiRateLimitPerMin}
              onChange={(e) => setForm({ ...form, apiRateLimitPerMin: Number(e.target.value) })}
              disabled={!isSuperAdmin}
            />
          </label>
          <label className="block text-xs font-semibold">
            Privacy policy version (triggers re-consent on change)
            <input
              className="field mt-1.5 font-mono"
              value={form.privacyPolicyVersion}
              onChange={(e) => setForm({ ...form, privacyPolicyVersion: e.target.value })}
              disabled={!isSuperAdmin}
            />
          </label>
          <label className="flex items-end pb-2 text-xs font-medium gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.requireReconsentOnUpdate}
              onChange={(e) => setForm({ ...form, requireReconsentOnUpdate: e.target.checked })}
              className="accent-primary"
            />
            Require fresh student/lecturer re-consent whenever policy version increments
          </label>
          <label className="block text-xs font-semibold">
            Consent notice text
            <textarea
              className="field mt-1.5 min-h-[76px] text-xs"
              value={form.consentNoticeText}
              onChange={(e) => setForm({ ...form, consentNoticeText: e.target.value })}
              disabled={!isSuperAdmin}
            />
          </label>
          <label className="block text-xs font-semibold">
            Privacy policy text
            <textarea
              className="field mt-1.5 min-h-[76px] text-xs"
              value={form.privacyPolicyText}
              onChange={(e) => setForm({ ...form, privacyPolicyText: e.target.value })}
              disabled={!isSuperAdmin}
            />
          </label>
          <label className="block text-xs font-semibold">
            Email invite template
            <textarea
              className="field mt-1.5 min-h-[72px] text-xs font-mono"
              value={form.emailTemplateInvite}
              onChange={(e) => setForm({ ...form, emailTemplateInvite: e.target.value })}
              disabled={!isSuperAdmin}
            />
          </label>
          <label className="block text-xs font-semibold">
            Push notification template (session open)
            <textarea
              className="field mt-1.5 min-h-[72px] text-xs font-mono"
              value={form.pushTemplateSessionOpen}
              onChange={(e) => setForm({ ...form, pushTemplateSessionOpen: e.target.value })}
              disabled={!isSuperAdmin}
            />
          </label>
        </div>

        {isSuperAdmin && (
          <div className="flex flex-wrap items-end justify-between gap-3 border-t pt-4">
            <label className="block flex-1 min-w-[240px] text-xs font-semibold">
              Audit reason for policy update (optional)
              <input
                className="field mt-1.5"
                placeholder="e.g. Senate approved retention alignment"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </label>
            <button type="submit" className="btn btn-primary whitespace-nowrap shrink-0">
              <Save size={14} /> Apply Policy Changes
            </button>
          </div>
        )}
      </form>

      {/* Data-Deletion / Data-Access Requests & Announcements */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="surface overflow-hidden">
          <div className="border-b px-5 py-4">
            <h3 className="font-serif text-base font-bold">Data-Deletion &amp; Student Data-Access Requests</h3>
          </div>
          <div className="divide-y">
            {(dataRequestsQuery.data ?? []).map((dr) => (
              <div key={dr.id} className="flex items-center justify-between gap-3 px-5 py-4 text-xs">
                <div>
                  <div className="font-semibold">
                    {dr.requestType === 'data_access' ? 'Data Access Export' : 'Data Deletion'} ·{' '}
                    <span className="font-mono">{dr.requesterIndex}</span>
                  </div>
                  <div className="text-muted-foreground">
                    {dr.requesterEmail} · {dr.department}
                  </div>
                </div>
                {dr.status === 'pending' ? (
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => dataReqDecisionMutation.mutate({ id: dr.id, decision: 'fulfilled' })}
                      className="btn btn-primary !px-2.5 !py-1 !text-xs whitespace-nowrap shrink-0"
                    >
                      Fulfill
                    </button>
                    <button
                      type="button"
                      onClick={() => dataReqDecisionMutation.mutate({ id: dr.id, decision: 'rejected' })}
                      className="btn btn-outline !px-2.5 !py-1 !text-xs whitespace-nowrap shrink-0"
                    >
                      Reject
                    </button>
                  </div>
                ) : (
                  <span className={dr.status === 'fulfilled' ? 'font-semibold text-emerald-700' : 'font-semibold text-rose-700'}>
                    {dr.status}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="surface p-5 space-y-4">
          <div className="border-b pb-3">
            <h3 className="flex items-center gap-2 font-serif text-base font-bold">
              <Megaphone size={16} className="text-primary" /> Broadcast Announcements
            </h3>
          </div>
          <form
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              if (!annTitle.trim() || !annMessage.trim()) return;
              sendAnnouncementMutation.mutate({
                audience: annAudience,
                title: annTitle.trim(),
                message: annMessage.trim(),
              });
            }}
            className="space-y-3"
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-xs font-semibold">
                Target audience
                <select
                  className="field mt-1.5"
                  value={annAudience}
                  onChange={(e) => setAnnAudience(e.target.value as typeof annAudience)}
                >
                  <option value="all_lecturers">All Lecturers</option>
                  <option value="all_students">All Students</option>
                </select>
              </label>
              <label className="block text-xs font-semibold">
                Subject
                <input
                  className="field mt-1.5"
                  placeholder="Announcement title"
                  value={annTitle}
                  onChange={(e) => setAnnTitle(e.target.value)}
                  required
                />
              </label>
            </div>
            <textarea
              className="field min-h-[70px] text-xs"
              placeholder="Write institutional announcement…"
              value={annMessage}
              onChange={(e) => setAnnMessage(e.target.value)}
              required
            />
            <div className="flex justify-end">
              <button type="submit" className="btn btn-primary !text-xs whitespace-nowrap shrink-0">
                <Bell size={13} /> Send Announcement
              </button>
            </div>
          </form>

          <div className="divide-y border-t pt-3">
            {(announcementsQuery.data ?? []).slice(0, 4).map((a) => (
              <div key={a.id} className="py-2.5 text-xs">
                <div className="flex items-center justify-between font-semibold">
                  <span>{a.title}</span>
                  <span className="font-mono text-[11px] text-muted-foreground">
                    {a.audience === 'all_lecturers' ? 'All Lecturers' : 'All Students'}
                  </span>
                </div>
                <p className="mt-0.5 text-muted-foreground">{a.message}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function AdminSecurityTab({
  isSuperAdmin,
  requireReauth,
}: {
  isSuperAdmin: boolean;
  requireReauth: RequireReauthFn;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [auditSearch, setAuditSearch] = useState('');
  const [auditActionFilter, setAuditActionFilter] = useState('');
  const [coApproverEmail, setCoApproverEmail] = useState('co.admin@school.edu.gh');

  const securityQuery = useQuery({
    queryKey: ['admin-security-status'],
    queryFn: () => customFetch<any>('/api/admin/security/status'),
  });
  const approvalsQuery = useQuery({
    queryKey: ['admin-approvals'],
    queryFn: () => customFetch<any[]>('/api/admin/approvals'),
  });
  const auditQuery = useQuery({
    queryKey: ['admin-audit', auditSearch, auditActionFilter],
    queryFn: () =>
      customFetch<any[]>(
        `/api/admin/audit?q=${encodeURIComponent(auditSearch)}&action=${encodeURIComponent(auditActionFilter)}`,
      ),
  });
  const settingsQuery = useQuery({
    queryKey: ['admin-settings'],
    queryFn: () => customFetch<any>('/api/admin/settings'),
  });

  const decideApprovalMutation = useMutation({
    mutationFn: ({ id, decision }: { id: string; decision: 'approved' | 'rejected' }) =>
      customFetch(`/api/admin/approvals/${id}/decide`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision, coApproverEmail }),
      }),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['admin-approvals'] });
      qc.invalidateQueries({ queryKey: ['admin-security-status'] });
      qc.invalidateQueries({ queryKey: ['admin-disputes'] });
      qc.invalidateQueries({ queryKey: ['admin-settings'] });
      qc.invalidateQueries({ queryKey: ['admin-audit'] });
      toast({ title: vars.decision === 'approved' ? 'Two-person approval executed' : 'Approval rejected' });
    },
    onError: (err) => {
      toast({ title: 'Decision failed', description: err instanceof Error ? err.message : '', variant: 'destructive' });
    },
  });

  const backupMutation = useMutation({
    mutationFn: () => customFetch('/api/admin/backups/run', { method: 'POST' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-security-status'] });
      qc.invalidateQueries({ queryKey: ['admin-audit'] });
      toast({ title: 'Encrypted backup snapshot verified' });
    },
  });

  const toggle2faMutation = useMutation({
    mutationFn: ({ nextEnabled, reauthToken }: { nextEnabled: boolean; reauthToken: string }) =>
      customFetch('/api/admin/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Reauth': reauthToken,
        },
        body: JSON.stringify({
          ...(settingsQuery.data ?? {}),
          twoFactorRequiredForAdmins: nextEnabled,
          reason: nextEnabled ? 'Enabled mandatory 2FA for administrators' : 'Disabled admin 2FA requirement',
        }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-settings'] });
      qc.invalidateQueries({ queryKey: ['admin-security-status'] });
      qc.invalidateQueries({ queryKey: ['auth-status'] });
      qc.invalidateQueries({ queryKey: ['admin-audit'] });
      toast({ title: 'Admin 2FA policy updated' });
    },
  });

  const security = securityQuery.data;
  const approvals = approvalsQuery.data ?? [];
  const audits = auditQuery.data ?? [];

  return (
    <div className="space-y-6" data-testid="section-admin-security">
      {/* Role & Security Posture */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 tabular-nums">
        <div className="surface p-5">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Active Admin Role</div>
          <div className="mt-2 font-serif text-xl font-bold">
            {security?.currentRole === 'department_admin' ? 'Department Admin' : 'Super Admin'}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            Scope: {security?.scopedDepartments ? security.scopedDepartments.join(', ') : 'All departments'}
          </div>
        </div>
        <div className="surface p-5">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">2FA Requirement</div>
          <div className="mt-2 font-serif text-xl font-bold">
            {security?.twoFactorRequiredForAdmins ? 'Enforced (6-digit)' : 'Optional / Off'}
          </div>
          {isSuperAdmin && settingsQuery.data && (
            <button
              type="button"
              onClick={() => {
                const nextEnabled = !security?.twoFactorRequiredForAdmins;
                requireReauth(nextEnabled ? 'Enable Mandatory Admin 2FA' : 'Disable Mandatory Admin 2FA', (reauthToken) => {
                  toggle2faMutation.mutate({ nextEnabled, reauthToken });
                });
              }}
              className="mt-2 text-xs font-semibold text-primary hover:underline cursor-pointer"
              data-testid="button-toggle-admin-2fa"
            >
              {security?.twoFactorRequiredForAdmins ? 'Disable 2FA requirement' : 'Enable 2FA for admins'}
            </button>
          )}
        </div>
        <div className="surface p-5">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Session Timeout</div>
          <div className="mt-2 font-serif text-xl font-bold">{security?.sessionTimeoutMinutes ?? 30} min</div>
          <div className="mt-1 text-xs text-muted-foreground">
            Lockout after {security?.failedLoginLockoutAttempts ?? 5} failed attempts
          </div>
        </div>
        <div className="surface p-5">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Two-Person Approvals</div>
          <div className="mt-2 font-serif text-xl font-bold text-amber-700">
            {security?.pendingApprovalsCount ?? 0} pending
          </div>
          <div className="mt-1 text-xs text-muted-foreground">Reassign index &amp; lower threshold</div>
        </div>
      </div>

      {/* Two-Person Approval Queue & Backups */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="surface overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b px-5 py-4">
            <div>
              <h3 className="flex items-center gap-2 font-serif text-base font-bold">
                <Users size={16} className="text-primary" /> Two-Person Approval Queue
              </h3>
              <p className="text-xs text-muted-foreground">Required for reassigning an index number or lowering security thresholds.</p>
            </div>
            <input
              className="field !py-1 !text-xs w-48 font-mono"
              value={coApproverEmail}
              onChange={(e) => setCoApproverEmail(e.target.value)}
              aria-label="Co-approver administrator email"
              title="Co-approver email"
            />
          </div>
          <div className="divide-y">
            {approvals.length === 0 ? (
              <div className="p-6 text-xs text-muted-foreground">No two-person approvals queued.</div>
            ) : (
              approvals.map((a) => (
                <div key={a.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 text-xs">
                  <div className="space-y-1 max-w-md">
                    <div className="font-bold">{a.summary}</div>
                    <div className="text-muted-foreground">
                      Requested by <span className="font-mono">{a.requestedByEmail}</span> · Reason: “{a.reason}”
                    </div>
                  </div>
                  {a.status === 'pending' && isSuperAdmin ? (
                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        onClick={() => decideApprovalMutation.mutate({ id: a.id, decision: 'approved' })}
                        className="btn btn-primary !px-2.5 !py-1 !text-xs whitespace-nowrap shrink-0"
                        data-testid={`button-approve-2pa-${a.id}`}
                      >
                        <Check size={12} /> Co-Approve
                      </button>
                      <button
                        type="button"
                        onClick={() => decideApprovalMutation.mutate({ id: a.id, decision: 'rejected' })}
                        className="btn btn-outline !px-2.5 !py-1 !text-xs whitespace-nowrap shrink-0"
                      >
                        <X size={12} /> Reject
                      </button>
                    </div>
                  ) : (
                    <span className={a.status === 'approved' ? 'font-semibold text-emerald-700' : 'font-semibold text-rose-700'}>
                      {a.status}
                    </span>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Backup & Restore Status (Super Admin Only) + Login Alerts */}
        <div className="space-y-6">
          {isSuperAdmin && (
            <div className="surface overflow-hidden">
              <div className="flex items-center justify-between border-b px-5 py-4">
                <h3 className="flex items-center gap-2 font-serif text-base font-bold">
                  <Database size={16} className="text-primary" /> Backup &amp; Restore Status
                </h3>
                <button
                  type="button"
                  onClick={() => backupMutation.mutate()}
                  className="btn btn-outline !px-3 !py-1 !text-xs whitespace-nowrap shrink-0"
                  data-testid="button-run-backup"
                >
                  Create Snapshot
                </button>
              </div>
              <div className="divide-y">
                {(security?.backups ?? []).map((b: any) => (
                  <div key={b.id} className="flex items-center justify-between px-5 py-3 text-xs tabular-nums">
                    <div>
                      <div className="font-semibold">{b.label}</div>
                      <div className="font-mono text-[11px] text-muted-foreground">
                        {b.sizeKb} KB · {b.triggeredBy}
                      </div>
                    </div>
                    <span className="inline-flex items-center gap-1 font-semibold text-emerald-700">
                      <CheckCircle2 size={13} /> {b.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="surface overflow-hidden">
            <div className="border-b px-5 py-4">
              <h3 className="flex items-center gap-2 font-serif text-base font-bold">
                <ShieldCheck size={16} className="text-primary" /> Login &amp; Device Alerts
              </h3>
            </div>
            <div className="divide-y max-h-60 overflow-y-auto">
              {(security?.loginAlerts ?? []).slice(0, 6).map((alert: any) => (
                <div key={alert.id} className="px-5 py-3 text-xs">
                  <div className="font-semibold">{alert.message}</div>
                  <div className="font-mono text-[11px] text-muted-foreground">
                    {new Date(alert.timestamp).toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Append-Only Audit Log (Search & Export Only — Never Editable) */}
      <div className="surface overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-6 py-4">
          <div>
            <h3 className="flex items-center gap-2 font-serif text-lg font-bold">
              <History size={17} className="text-primary" /> Append-Only Audit Log
            </h3>
            <p className="text-xs text-muted-foreground">
              Every admin change, photo inspection, and correction is recorded with actor, IP, reason, and before/after values. Read-only.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-52">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                className="field !py-1.5 pl-8 !text-xs"
                placeholder="Search actor, action, reason…"
                value={auditSearch}
                onChange={(e) => setAuditSearch(e.target.value)}
                data-testid="input-search-audit"
              />
            </div>
            <input
              className="field !py-1.5 !text-xs w-40 font-mono"
              placeholder="Filter action…"
              value={auditActionFilter}
              onChange={(e) => setAuditActionFilter(e.target.value)}
            />
            <button
              type="button"
              onClick={() =>
                requireReauth('Export Append-Only Audit Log (CSV)', async (reauthToken) => {
                  await downloadApiFile('/api/admin/audit/export', 'append-only-audit-log.csv', {
                    'X-Admin-Reauth': reauthToken,
                  });
                  toast({ title: 'Audit log CSV exported' });
                })
              }
              className="btn btn-outline !px-3 !py-1.5 !text-xs whitespace-nowrap shrink-0"
              data-testid="button-export-audit"
            >
              <Lock size={12} /> Export CSV
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b bg-muted/40 font-semibold uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-5 py-3">Time &amp; IP</th>
                <th className="px-5 py-3">Actor</th>
                <th className="px-5 py-3">Action</th>
                <th className="px-5 py-3">Reason &amp; Before/After Diff</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {audits.map((a) => (
                <tr key={a.id} className="hover:bg-muted/20">
                  <td className="px-5 py-3 align-top font-mono text-[11px] text-muted-foreground tabular-nums">
                    <div>{new Date(a.createdAt).toLocaleString()}</div>
                    <div>IP: {a.ip ?? '127.0.0.1'}</div>
                  </td>
                  <td className="px-5 py-3 align-top">
                    <div className="font-semibold">{a.actorEmail ?? a.actorUserId}</div>
                    <div className="font-mono text-[11px] text-muted-foreground">{a.actorRole ?? 'staff'}</div>
                  </td>
                  <td className="px-5 py-3 align-top font-mono font-bold text-primary">{a.action}</td>
                  <td className="px-5 py-3 align-top space-y-1 text-[11px]">
                    {a.reason && <div className="font-medium text-foreground">Reason: {a.reason}</div>}
                    {(a.before || a.after) && (
                      <div className="font-mono text-muted-foreground break-all">
                        {a.before ? `Before: ${JSON.stringify(a.before)} ` : ''}
                        {a.after ? `→ After: ${JSON.stringify(a.after)}` : ''}
                      </div>
                    )}
                    {!a.before && !a.after && Object.keys(a.details ?? {}).length > 0 && (
                      <div className="font-mono text-muted-foreground break-all">{JSON.stringify(a.details)}</div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
