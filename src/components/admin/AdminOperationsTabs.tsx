import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle, Check, Edit3, Eye, KeyRound, LockOpen, RefreshCw, ShieldAlert,
  Smartphone, UserCheck, UserX, X, Camera,
} from 'lucide-react';
import { customFetch } from '@/api-client-react/custom-fetch';
import { getStudentPhotoUrl } from '@/lib/studentPhotos';
import { useToast } from '@/hooks/use-toast';
import type { DepartmentReferenceItem } from './AdminPortal';

type RequireReauthFn = (label: string, onVerified: (reauthToken: string) => void | Promise<void>) => void;

export function AdminLecturersTab({
  departments,
  requireReauth,
}: {
  departments: DepartmentReferenceItem[];
  requireReauth: RequireReauthFn;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [editingDeptsUserId, setEditingDeptsUserId] = useState<string | null>(null);
  const [selectedDepts, setSelectedDepts] = useState<string[]>([]);

  const lecturersQuery = useQuery({
    queryKey: ['admin-lecturers'],
    queryFn: () => customFetch<any[]>('/api/admin/lecturers'),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['admin-lecturers'] });
    qc.invalidateQueries({ queryKey: ['admin-overview'] });
    qc.invalidateQueries({ queryKey: ['admin-audit'] });
  };

  const updateStatusMutation = useMutation({
    mutationFn: ({
      userId,
      reviewStatus,
      reauthToken,
    }: {
      userId: string;
      reviewStatus: 'kept' | 'suspended' | 'removed';
      reauthToken?: string;
    }) =>
      customFetch(`/api/admin/lecturers/${userId}/status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(reauthToken ? { 'X-Admin-Reauth': reauthToken } : {}),
        },
        body: JSON.stringify({ reviewStatus }),
      }),
    onSuccess: () => {
      invalidate();
      toast({ title: 'Lecturer account status updated' });
    },
    onError: (err) => {
      toast({ title: 'Status update failed', description: err instanceof Error ? err.message : '', variant: 'destructive' });
    },
  });

  const resetSignInMutation = useMutation({
    mutationFn: (userId: string) =>
      customFetch(`/api/admin/lecturers/${userId}/reset-signin`, { method: 'POST' }),
    onSuccess: () => {
      invalidate();
      toast({ title: 'Sign-in reset', description: 'Active sessions revoked and password hash cleared for re-setup.' });
    },
  });

  const updateDeptsMutation = useMutation({
    mutationFn: ({ userId, depts }: { userId: string; depts: string[] }) =>
      customFetch(`/api/admin/lecturers/${userId}/departments`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ departments: depts }),
      }),
    onSuccess: () => {
      invalidate();
      setEditingDeptsUserId(null);
      toast({ title: 'Lecturer departments updated' });
    },
  });

  const lecturers = lecturersQuery.data ?? [];
  const activeDepts = departments.filter((d) => d.active);

  return (
    <div className="space-y-6" data-testid="section-admin-lecturers">
      <div className="surface overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-6 py-4">
          <div>
            <h2 className="font-serif text-lg font-bold">Lecturer Management &amp; Activity Totals</h2>
            <p className="text-xs text-muted-foreground">
              Accounts awaiting review appear first. Displays per-lecturer activity totals only (no student names).
            </p>
          </div>
          <button
            type="button"
            onClick={() => lecturersQuery.refetch()}
            className="btn btn-outline !px-3 !py-1.5 !text-xs whitespace-nowrap shrink-0"
          >
            <RefreshCw size={13} /> Refresh
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b bg-muted/40 font-semibold uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-5 py-3">Lecturer &amp; Contact</th>
                <th className="px-5 py-3">Departments</th>
                <th className="px-5 py-3">Activity Totals</th>
                <th className="px-5 py-3">Status &amp; Alerts</th>
                <th className="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {lecturers.map((l) => {
                const statusLabel =
                  l.reviewStatus === 'not_yet_reviewed'
                    ? 'Not reviewed'
                    : l.reviewStatus === 'kept'
                      ? 'Active (Kept)'
                      : l.reviewStatus === 'suspended'
                        ? 'Suspended'
                        : 'Removed';
                const statusTone =
                  l.reviewStatus === 'not_yet_reviewed'
                    ? 'text-amber-700'
                    : l.reviewStatus === 'kept'
                      ? 'text-emerald-700'
                      : 'text-rose-700';

                return (
                  <tr key={l.userId} className="hover:bg-muted/20" data-testid={`row-lecturer-${l.userId}`}>
                    <td className="px-5 py-4 align-top">
                      <div className="font-bold text-foreground">{l.fullName}</div>
                      <div className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                        {l.staffId} · {l.email}
                      </div>
                      <div className="font-mono text-[11px] text-muted-foreground">{l.phone}</div>
                    </td>
                    <td className="px-5 py-4 align-top">
                      {editingDeptsUserId === l.userId ? (
                        <div className="space-y-2">
                          <div className="flex flex-wrap gap-1.5 max-w-xs">
                            {activeDepts.map((d) => {
                              const checked = selectedDepts.includes(d.name);
                              return (
                                <label key={d.id} className="inline-flex items-center gap-1 text-[11px] cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() =>
                                      setSelectedDepts((prev) =>
                                        prev.includes(d.name) ? prev.filter((x) => x !== d.name) : [...prev, d.name],
                                      )
                                    }
                                    className="accent-primary"
                                  />
                                  {d.name}
                                </label>
                              );
                            })}
                          </div>
                          <div className="flex gap-1.5">
                            <button
                              type="button"
                              className="btn btn-primary !px-2 !py-1 !text-[11px] whitespace-nowrap shrink-0"
                              onClick={() => updateDeptsMutation.mutate({ userId: l.userId, depts: selectedDepts })}
                            >
                              Save
                            </button>
                            <button
                              type="button"
                              className="btn btn-outline !px-2 !py-1 !text-[11px] whitespace-nowrap shrink-0"
                              onClick={() => setEditingDeptsUserId(null)}
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-1">
                          <div>{l.departments.join(' · ')}</div>
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline cursor-pointer"
                            onClick={() => {
                              setEditingDeptsUserId(l.userId);
                              setSelectedDepts(l.departments);
                            }}
                          >
                            <Edit3 size={11} /> Edit departments
                          </button>
                        </div>
                      )}
                    </td>
                    <td className="px-5 py-4 align-top font-mono text-[11px] tabular-nums space-y-0.5">
                      <div>
                        {l.classesCount} classes · {l.sessionsRunCount} sessions run
                      </div>
                      <div className={l.unfinalisedSessionsCount > 0 ? 'text-amber-700 font-semibold' : 'text-muted-foreground'}>
                        {l.unfinalisedSessionsCount} unfinalised
                      </div>
                      <div className="text-muted-foreground">
                        Last active: {new Date(l.lastActiveAt).toLocaleDateString()}
                      </div>
                    </td>
                    <td className="px-5 py-4 align-top space-y-1.5">
                      <div className={`font-semibold ${statusTone}`}>{statusLabel}</div>
                      {(l.alerts ?? []).map((alert: string, idx: number) => (
                        <div key={idx} className="flex items-start gap-1.5 text-[11px] font-medium text-rose-700">
                          <AlertTriangle size={12} className="mt-0.5 shrink-0" />
                          <span>{alert}</span>
                        </div>
                      ))}
                    </td>
                    <td className="px-5 py-4 align-top text-right">
                      <div className="flex flex-wrap justify-end gap-1.5">
                        {l.reviewStatus !== 'kept' && (
                          <button
                            type="button"
                            onClick={() => updateStatusMutation.mutate({ userId: l.userId, reviewStatus: 'kept' })}
                            className="btn btn-primary !px-2.5 !py-1 !text-xs whitespace-nowrap shrink-0"
                            data-testid={`button-keep-lecturer-${l.userId}`}
                          >
                            <UserCheck size={12} /> {l.reviewStatus === 'suspended' ? 'Reactivate' : 'Keep'}
                          </button>
                        )}
                        {l.reviewStatus === 'kept' && (
                          <button
                            type="button"
                            onClick={() => updateStatusMutation.mutate({ userId: l.userId, reviewStatus: 'suspended' })}
                            className="btn btn-outline !px-2.5 !py-1 !text-xs whitespace-nowrap shrink-0"
                          >
                            Suspend
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => resetSignInMutation.mutate(l.userId)}
                          className="btn btn-outline !px-2.5 !py-1 !text-xs whitespace-nowrap shrink-0"
                        >
                          <KeyRound size={12} /> Reset Sign-in
                        </button>
                        {l.reviewStatus !== 'removed' && (
                          <button
                            type="button"
                            onClick={() =>
                              requireReauth(`Remove lecturer ${l.fullName}`, (reauthToken) => {
                                updateStatusMutation.mutate({
                                  userId: l.userId,
                                  reviewStatus: 'removed',
                                  reauthToken,
                                });
                              })
                            }
                            className="btn btn-outline !px-2.5 !py-1 !text-xs text-rose-700 hover:bg-rose-50 whitespace-nowrap shrink-0"
                            data-testid={`button-remove-lecturer-${l.userId}`}
                          >
                            <UserX size={12} /> Remove
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export function AdminDisputesTab({ requireReauth }: { requireReauth: RequireReauthFn }) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [activeCaseId, setActiveCaseId] = useState<string | null>(null);
  const [casePhotos, setCasePhotos] = useState<{
    disputeId: string;
    registrationPhotoKey: string;
    checkinPhotoKey: string;
    photoViewsCount: number;
  } | null>(null);
  const [resolution, setResolution] = useState<'keep' | 'reset' | 'reassign'>('keep');
  const [reassignedIndex, setReassignedIndex] = useState('');
  const [reason, setReason] = useState('');
  const [unlockOnResolve, setUnlockOnResolve] = useState(true);

  const disputesQuery = useQuery({
    queryKey: ['admin-disputes'],
    queryFn: () =>
      customFetch<{ disputes: any[]; recaptures: any[]; devices: any[] }>('/api/admin/disputes'),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['admin-disputes'] });
    qc.invalidateQueries({ queryKey: ['admin-overview'] });
    qc.invalidateQueries({ queryKey: ['admin-audit'] });
    qc.invalidateQueries({ queryKey: ['admin-approvals'] });
    qc.invalidateQueries({ queryKey: ['admin-security-status'] });
  };

  const inspectPhotosMutation = useMutation({
    mutationFn: (disputeId: string) =>
      customFetch<{
        disputeId: string;
        registrationPhotoKey: string;
        checkinPhotoKey: string;
        photoViewsCount: number;
      }>(`/api/admin/disputes/${disputeId}/view-photos`, { method: 'POST' }),
    onSuccess: (data) => {
      setActiveCaseId(data.disputeId);
      setCasePhotos(data);
      invalidate();
      toast({
        title: 'Case photos unlocked & view logged',
        description: `Audit entry #${data.photoViewsCount} recorded.`,
      });
    },
  });

  const resolveDisputeMutation = useMutation({
    mutationFn: ({
      disputeId,
      reauthToken,
    }: {
      disputeId: string;
      reauthToken: string;
    }) =>
      customFetch<any>(`/api/admin/disputes/${disputeId}/resolve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Reauth': reauthToken,
        },
        body: JSON.stringify({
          resolution,
          ...(resolution === 'reassign' ? { reassignedIndex } : {}),
          reason,
          unlockAccount: unlockOnResolve,
        }),
      }),
    onSuccess: (res) => {
      invalidate();
      setActiveCaseId(null);
      setCasePhotos(null);
      setReason('');
      setReassignedIndex('');
      if (res.pendingTwoPersonApproval) {
        toast({
          title: 'Two-person approval required',
          description: 'Index reassignment queued for second administrator approval in Security & Audit.',
        });
      } else {
        toast({ title: 'Identity dispute resolved' });
      }
    },
    onError: (err) => {
      toast({ title: 'Resolution failed', description: err instanceof Error ? err.message : '', variant: 'destructive' });
    },
  });

  const unlockStudentMutation = useMutation({
    mutationFn: (disputeId: string) =>
      customFetch(`/api/admin/disputes/${disputeId}/unlock-student`, { method: 'POST' }),
    onSuccess: () => {
      invalidate();
      toast({ title: 'Student account unlocked' });
    },
  });

  const recaptureMutation = useMutation({
    mutationFn: ({ id, decision }: { id: string; decision: 'approved' | 'rejected' }) =>
      customFetch(`/api/admin/recaptures/${id}/decide`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision }),
      }),
    onSuccess: () => {
      invalidate();
      toast({ title: 'Photo re-capture request updated' });
    },
  });

  const deviceMutation = useMutation({
    mutationFn: ({
      id,
      decision,
      unlockAccount,
    }: {
      id: string;
      decision: 'approved' | 'denied' | 'revoked';
      unlockAccount?: boolean;
    }) =>
      customFetch(`/api/admin/devices/${id}/decide`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision, unlockAccount: Boolean(unlockAccount) }),
      }),
    onSuccess: () => {
      invalidate();
      toast({ title: 'Device request updated' });
    },
  });

  const disputes = disputesQuery.data?.disputes ?? [];
  const recaptures = disputesQuery.data?.recaptures ?? [];
  const devices = disputesQuery.data?.devices ?? [];
  const activeCase = disputes.find((d) => d.id === activeCaseId);

  return (
    <div className="space-y-6" data-testid="section-admin-disputes">
      {/* Identity Disputes Queue */}
      <div className="surface overflow-hidden">
        <div className="border-b px-6 py-4">
          <div className="eyebrow">Privacy-Scoped Resolution</div>
          <h2 className="mt-1 font-serif text-lg font-bold">Identity Disputes &amp; Ownership Claims</h2>
          <p className="text-xs text-muted-foreground">
            Student photos remain hidden until you open a specific case, and every inspection is permanently audit-logged. Account unlocks operate directly from each case (no global student search).
          </p>
        </div>

        <div className="divide-y">
          {disputes.map((d) => (
            <div key={d.id} className="flex flex-wrap items-center justify-between gap-4 px-6 py-4 text-xs">
              <div className="space-y-1 max-w-2xl">
                <div className="flex flex-wrap items-center gap-2 font-semibold">
                  <span className="font-mono text-primary">
                    {d.caseType === 'student_claim' ? 'Index Claim' : 'Lecturer Dispute'}
                  </span>
                  <span className="text-muted-foreground">·</span>
                  <span>
                    {d.studentName} ({d.studentIndex})
                  </span>
                  <span className="text-muted-foreground">·</span>
                  <span className="font-mono">{d.courseCode}</span>
                  <span className="text-muted-foreground">·</span>
                  <span className={d.status === 'open' ? 'text-amber-700' : 'text-emerald-700'}>
                    {d.status === 'open' ? 'Open Case' : `Resolved (${d.resolution})`}
                  </span>
                  {d.accountLocked && (
                    <span className="text-rose-700">· Account Locked</span>
                  )}
                </div>
                <p className="text-muted-foreground">{d.claimReason}</p>
                <div className="font-mono text-[11px] text-muted-foreground tabular-nums">
                  Photo views logged: {d.photoViewsCount} · Opened {new Date(d.createdAt).toLocaleDateString()}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => inspectPhotosMutation.mutate(d.id)}
                  className="btn btn-primary !px-3 !py-1.5 !text-xs whitespace-nowrap shrink-0"
                  data-testid={`button-inspect-dispute-${d.id}`}
                >
                  <Eye size={13} /> Inspect Photos &amp; Resolve
                </button>
                {d.accountLocked && (
                  <button
                    type="button"
                    onClick={() => unlockStudentMutation.mutate(d.id)}
                    className="btn btn-outline !px-3 !py-1.5 !text-xs whitespace-nowrap shrink-0"
                    data-testid={`button-unlock-dispute-${d.id}`}
                  >
                    <LockOpen size={13} /> Unlock Account
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Photo Re-capture Requests & New-Phone Device Queue */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="surface overflow-hidden">
          <div className="border-b px-5 py-4">
            <h3 className="flex items-center gap-2 font-serif text-base font-bold">
              <Camera size={16} className="text-primary" /> Pending Photo Re-capture Requests
            </h3>
          </div>
          <div className="divide-y">
            {recaptures.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-3 px-5 py-4 text-xs">
                <div className="space-y-1">
                  <div className="font-semibold">
                    Index <span className="font-mono">{r.studentIndex}</span> · {r.courseCode}
                  </div>
                  <p className="text-muted-foreground">{r.reason}</p>
                </div>
                {r.status === 'pending' ? (
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => recaptureMutation.mutate({ id: r.id, decision: 'approved' })}
                      className="btn btn-primary !px-2.5 !py-1 !text-xs whitespace-nowrap shrink-0"
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      onClick={() => recaptureMutation.mutate({ id: r.id, decision: 'rejected' })}
                      className="btn btn-outline !px-2.5 !py-1 !text-xs whitespace-nowrap shrink-0"
                    >
                      Reject
                    </button>
                  </div>
                ) : (
                  <span className={r.status === 'approved' ? 'font-semibold text-emerald-700' : 'font-semibold text-rose-700'}>
                    {r.status}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="surface overflow-hidden">
          <div className="border-b px-5 py-4">
            <h3 className="flex items-center gap-2 font-serif text-base font-bold">
              <Smartphone size={16} className="text-primary" /> New-Phone Requests &amp; Device Revocation
            </h3>
          </div>
          <div className="divide-y">
            {devices.map((dev) => (
              <div key={dev.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 text-xs">
                <div className="space-y-1 max-w-sm">
                  <div className="font-semibold">
                    Index <span className="font-mono">{dev.studentIndex}</span> ·{' '}
                    <span className={dev.status === 'approved' ? 'text-emerald-700' : dev.status === 'pending' ? 'text-amber-700' : 'text-rose-700'}>
                      {dev.status}
                    </span>
                  </div>
                  <div className="text-muted-foreground">
                    Old: {dev.currentDevice} → New: <span className="text-foreground font-medium">{dev.newDevice}</span>
                  </div>
                  <p className="text-muted-foreground">{dev.reason}</p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {dev.status === 'pending' && (
                    <>
                      <button
                        type="button"
                        onClick={() => deviceMutation.mutate({ id: dev.id, decision: 'approved', unlockAccount: true })}
                        className="btn btn-primary !px-2.5 !py-1 !text-xs whitespace-nowrap shrink-0"
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        onClick={() => deviceMutation.mutate({ id: dev.id, decision: 'denied' })}
                        className="btn btn-outline !px-2.5 !py-1 !text-xs whitespace-nowrap shrink-0"
                      >
                        Deny
                      </button>
                    </>
                  )}
                  {dev.status !== 'revoked' && (
                    <button
                      type="button"
                      onClick={() => deviceMutation.mutate({ id: dev.id, decision: 'revoked' })}
                      className="btn btn-outline !px-2.5 !py-1 !text-xs text-rose-700 whitespace-nowrap shrink-0"
                    >
                      Revoke Device
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Case Photo Inspection & Resolution Modal */}
      {activeCase && casePhotos && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-[2px]"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) {
              setActiveCaseId(null);
              setCasePhotos(null);
            }
          }}
        >
          <section className="max-h-[92dvh] w-full max-w-2xl overflow-y-auto rounded-2xl border bg-card p-6 shadow-2xl space-y-5">
            <div className="flex items-start justify-between border-b pb-3">
              <div>
                <div className="eyebrow">Audit-Logged Case Inspection · View #{casePhotos.photoViewsCount}</div>
                <h3 className="mt-1 font-serif text-lg font-bold">
                  {activeCase.studentName} ({activeCase.studentIndex}) · {activeCase.courseCode}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setActiveCaseId(null);
                  setCasePhotos(null);
                }}
                className="rounded p-1.5 hover:bg-muted cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <div className="text-xs font-semibold text-muted-foreground">Registration Reference Portrait</div>
                <div className="overflow-hidden rounded-xl border bg-muted aspect-[4/3]">
                  <img
                    src={getStudentPhotoUrl(casePhotos.registrationPhotoKey) ?? ''}
                    alt="Registration portrait"
                    className="h-full w-full object-cover"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <div className="text-xs font-semibold text-muted-foreground">Flagged Session Check-in Capture</div>
                <div className="overflow-hidden rounded-xl border bg-muted aspect-[4/3]">
                  <img
                    src={getStudentPhotoUrl(casePhotos.checkinPhotoKey) ?? ''}
                    alt="Session check-in capture"
                    className="h-full w-full object-cover"
                  />
                </div>
              </div>
            </div>

            <form
              onSubmit={(e: FormEvent) => {
                e.preventDefault();
                if (!reason.trim()) return;
                requireReauth(
                  `Resolve dispute ${activeCase.studentIndex} (${resolution})`,
                  (reauthToken) => {
                    resolveDisputeMutation.mutate({ disputeId: activeCase.id, reauthToken });
                  },
                );
              }}
              className="space-y-4 border-t pt-4"
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-xs font-semibold">
                  In-person resolution decision
                  <select
                    className="field mt-1.5"
                    value={resolution}
                    onChange={(e) => setResolution(e.target.value as typeof resolution)}
                    data-testid="select-dispute-resolution"
                  >
                    <option value="keep">Keep existing identity (Confirm)</option>
                    <option value="reset">Reset &amp; require fresh photo capture</option>
                    <option value="reassign">Reassign index number (Two-person approval)</option>
                  </select>
                </label>

                {resolution === 'reassign' && (
                  <label className="block text-xs font-semibold">
                    Target index number
                    <input
                      className="field mt-1.5 font-mono uppercase"
                      placeholder="e.g. 5231099"
                      value={reassignedIndex}
                      onChange={(e) => setReassignedIndex(e.target.value.toUpperCase())}
                      required
                      data-testid="input-reassign-index"
                    />
                  </label>
                )}
              </div>

              <label className="block text-xs font-semibold">
                Mandatory audit reason (verified with student ID)
                <input
                  className="field mt-1.5"
                  placeholder="e.g. Verified student physical ID card in Academic Registry"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  required
                  data-testid="input-dispute-reason"
                />
              </label>

              <label className="flex items-center gap-2 text-xs font-medium cursor-pointer">
                <input
                  type="checkbox"
                  checked={unlockOnResolve}
                  onChange={(e) => setUnlockOnResolve(e.target.checked)}
                  className="accent-primary"
                />
                Unlock student account when this decision completes
              </label>

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  className="btn btn-outline whitespace-nowrap shrink-0"
                  onClick={() => {
                    setActiveCaseId(null);
                    setCasePhotos(null);
                  }}
                >
                  Close
                </button>
                <button
                  type="submit"
                  className="btn btn-primary whitespace-nowrap shrink-0"
                  data-testid="button-submit-dispute-resolution"
                >
                  <Check size={14} /> {resolution === 'reassign' ? 'Submit for 2-Person Approval' : 'Resolve Case'}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}

export function AdminIntegrityTab() {
  const integrityQuery = useQuery({
    queryKey: ['admin-integrity'],
    queryFn: () =>
      customFetch<{
        sessionAnomalies: any[];
        overrideByLecturer: any[];
        reopenLog: any[];
      }>('/api/admin/integrity'),
  });

  const anomalies = integrityQuery.data?.sessionAnomalies ?? [];
  const overrides = integrityQuery.data?.overrideByLecturer ?? [];
  const reopenLog = integrityQuery.data?.reopenLog ?? [];

  return (
    <div className="space-y-6" data-testid="section-admin-integrity">
      <div className="surface overflow-hidden">
        <div className="border-b px-6 py-4">
          <div className="eyebrow">Session-Level Integrity Signals</div>
          <h2 className="mt-1 font-serif text-lg font-bold">Anomaly Summaries by Session &amp; Lecturer</h2>
          <p className="text-xs text-muted-foreground">
            Aggregated by session and lecturer only — zero individual student names or profiles are exposed.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b bg-muted/40 font-semibold uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-5 py-3">Course &amp; Department</th>
                <th className="px-5 py-3">Lecturer</th>
                <th className="px-5 py-3">Session Date</th>
                <th className="px-5 py-3">Mock / Geo Outside</th>
                <th className="px-5 py-3">Face Mismatches</th>
                <th className="px-5 py-3">Shared Devices</th>
                <th className="px-5 py-3">Manual Overrides</th>
              </tr>
            </thead>
            <tbody className="divide-y font-mono tabular-nums">
              {anomalies.map((row) => (
                <tr key={row.sessionId} className="hover:bg-muted/20">
                  <td className="px-5 py-3.5 font-sans">
                    <strong className="font-bold">{row.courseCode}</strong>
                    <div className="text-[11px] text-muted-foreground">{row.department}</div>
                  </td>
                  <td className="px-5 py-3.5 font-sans">{row.lecturerName}</td>
                  <td className="px-5 py-3.5 text-muted-foreground">{new Date(row.startsAt).toLocaleDateString()}</td>
                  <td className={`px-5 py-3.5 ${row.mockLocationCount > 0 ? 'font-bold text-amber-700' : 'text-muted-foreground'}`}>
                    {row.mockLocationCount}
                  </td>
                  <td className={`px-5 py-3.5 ${row.faceMismatchCount > 0 ? 'font-bold text-rose-700' : 'text-muted-foreground'}`}>
                    {row.faceMismatchCount}
                  </td>
                  <td className="px-5 py-3.5 text-muted-foreground">{row.sharedDeviceCount}</td>
                  <td className="px-5 py-3.5">{row.manualOverridesCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="surface overflow-hidden">
          <div className="border-b px-5 py-4">
            <h3 className="font-serif text-base font-bold">Override Statistics per Lecturer</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b bg-muted/40 font-semibold uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-5 py-3">Lecturer</th>
                  <th className="px-5 py-3">Manual</th>
                  <th className="px-5 py-3">Reviewed</th>
                  <th className="px-5 py-3">Override %</th>
                </tr>
              </thead>
              <tbody className="divide-y tabular-nums">
                {overrides.map((o) => (
                  <tr key={o.userId}>
                    <td className="px-5 py-3">
                      <div className="font-semibold">{o.fullName}</div>
                      <div className="font-mono text-[11px] text-muted-foreground">{o.staffId}</div>
                    </td>
                    <td className="px-5 py-3 font-mono">{o.manualOverrides}</td>
                    <td className="px-5 py-3 font-mono">{o.reviewOverrides}</td>
                    <td className={`px-5 py-3 font-mono font-bold ${o.overrideRatePct >= 20 ? 'text-amber-700' : 'text-foreground'}`}>
                      {o.overrideRatePct}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="surface overflow-hidden">
          <div className="border-b px-5 py-4">
            <h3 className="flex items-center gap-2 font-serif text-base font-bold">
              <ShieldAlert size={16} className="text-amber-700" /> Finalised Session Reopen Log
            </h3>
          </div>
          <div className="divide-y">
            {reopenLog.length === 0 ? (
              <div className="p-6 text-xs text-muted-foreground">No finalised sessions have been reopened.</div>
            ) : (
              reopenLog.map((r) => (
                <div key={r.id} className="px-5 py-3.5 text-xs space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">
                      {r.courseCode} · {r.lecturerName}
                    </span>
                    <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
                      {new Date(r.reopenedAt).toLocaleDateString()}
                    </span>
                  </div>
                  <p className="text-muted-foreground">Reason: “{r.reason}”</p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
