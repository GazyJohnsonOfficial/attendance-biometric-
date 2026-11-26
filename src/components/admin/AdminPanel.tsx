import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ShieldCheck, Users, BookOpen, Radio, AlertTriangle, CheckCircle2, RefreshCw,
  Settings, Activity, Search, Building2, Sliders, Check, X, Lock, Unlock, Download, Terminal, Info, ShieldAlert, BarChart3
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { customFetch } from '@/api-client-react/custom-fetch';
import { useToast } from '@/hooks/use-toast';
import { Shell } from '@/App';

interface AdminOverview {
  totalClasses: number;
  totalLecturers: number;
  totalStudents: number;
  totalSessions: number;
  openSessions: number;
  reviewQueueCount: number;
  geofenceViolationCount: number;
  departmentStats: Array<{
    department: string;
    classesCount: number;
    studentsCount: number;
    sessionsCount: number;
  }>;
  systemSettings: {
    defaultRadiusM: number;
    rotatingCodeSeconds: number;
    strictGeofence: boolean;
    allowStaticCodes: boolean;
  };
}

interface LecturerProfileItem {
  userId: string;
  staffId: string;
  fullName: string;
  email: string;
  phone: string;
  departments: string[];
  reviewStatus: 'not_yet_reviewed' | 'kept' | 'removed';
  emailVerified: boolean;
  classesCount: number;
  activeSessionsCount: number;
}

interface AuditEvent {
  id: string;
  actorUserId: string;
  entityType: string;
  entityId: string;
  action: string;
  details: Record<string, unknown>;
  createdAt: string;
}

interface SystemLogItem {
  id: string;
  level: 'info' | 'warn' | 'error' | 'auth';
  category: string;
  message: string;
  details?: Record<string, unknown>;
  timestamp: string;
}

export function AdminPanel() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<'overview' | 'lecturers' | 'departments' | 'analytics' | 'audit' | 'logs' | 'settings'>('overview');
  const [searchQuery, setSearchQuery] = useState('');
  const [logLevelFilter, setLogLevelFilter] = useState<string>('all');

  // Queries
  const overviewQuery = useQuery<AdminOverview>({
    queryKey: ['admin-overview'],
    queryFn: () => customFetch<AdminOverview>('/api/admin/overview'),
    refetchInterval: 10000,
  });

  const lecturersQuery = useQuery<LecturerProfileItem[]>({
    queryKey: ['admin-lecturers'],
    queryFn: () => customFetch<LecturerProfileItem[]>('/api/admin/lecturers'),
  });

  const auditQuery = useQuery<AuditEvent[]>({
    queryKey: ['admin-audit'],
    queryFn: () => customFetch<AuditEvent[]>('/api/admin/audit'),
  });

  const systemLogsQuery = useQuery<SystemLogItem[]>({
    queryKey: ['admin-system-logs'],
    queryFn: () => customFetch<SystemLogItem[]>('/api/admin/system-logs'),
    refetchInterval: 5000,
  });

  const updateStatusMutation = useMutation({
    mutationFn: ({ userId, reviewStatus }: { userId: string; reviewStatus: 'kept' | 'removed' | 'not_yet_reviewed' }) =>
      customFetch(`/api/admin/lecturers/${userId}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reviewStatus }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-lecturers'] });
      qc.invalidateQueries({ queryKey: ['admin-overview'] });
      toast({ title: 'Lecturer status updated successfully' });
    },
    onError: () => {
      toast({ title: 'Failed to update lecturer status', variant: 'destructive' });
    },
  });

  const updateSettingsMutation = useMutation({
    mutationFn: (settings: AdminOverview['systemSettings']) =>
      customFetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-overview'] });
      toast({ title: 'System settings saved successfully' });
    },
    onError: () => {
      toast({ title: 'Failed to save system settings', variant: 'destructive' });
    },
  });

  const [settingsForm, setSettingsForm] = useState<AdminOverview['systemSettings'] | null>(null);

  const overview = overviewQuery.data;
  const lecturers = lecturersQuery.data ?? [];
  const audits = auditQuery.data ?? [];
  const systemLogs = systemLogsQuery.data ?? [];

  const filteredLecturers = lecturers.filter(
    (l) =>
      l.fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      l.staffId.toLowerCase().includes(searchQuery.toLowerCase()) ||
      l.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      l.departments.some((d) => d.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const filteredLogs = systemLogs.filter((log) => {
    const matchLevel = logLevelFilter === 'all' || log.level === logLevelFilter;
    const matchQuery =
      !searchQuery ||
      `${log.message} ${log.category} ${JSON.stringify(log.details ?? {})}`
        .toLowerCase()
        .includes(searchQuery.toLowerCase());
    return matchLevel && matchQuery;
  });

  return (
    <Shell title="Institutional Admin Portal">
      <div className="space-y-6 pb-12">
        {/* Header & Mode Badge */}
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border bg-card p-6 shadow-xs">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">
                <ShieldCheck size={14} /> Super Administrator
              </span>
              <span className="text-xs text-muted-foreground">• Institution Management Console</span>
            </div>
            <h1 className="mt-2 font-serif text-2xl font-extrabold sm:text-3xl">Campus Attendance Control</h1>
            <p className="mt-1 text-xs text-muted-foreground">
              Monitor institution-wide attendance metrics, review and approve lecturer accounts, inspect department usage analytics, and server logs.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                overviewQuery.refetch();
                lecturersQuery.refetch();
                auditQuery.refetch();
                systemLogsQuery.refetch();
                toast({ title: 'Admin data refreshed' });
              }}
              className="btn btn-outline !px-3 !py-2 !text-xs"
              data-testid="button-refresh-admin"
            >
              <RefreshCw size={14} className={overviewQuery.isFetching ? 'animate-spin' : ''} />
              Refresh
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex flex-wrap gap-1 rounded-xl border bg-muted/40 p-1.5 text-xs font-semibold">
          {[
            { key: 'overview', label: 'System Overview', icon: Activity },
            { key: 'lecturers', label: `Lecturer Directory (${lecturers.length})`, icon: Users },
            { key: 'departments', label: 'Departments & Courses', icon: Building2 },
            { key: 'analytics', label: 'Usage Analytics', icon: BarChart3 },
            { key: 'audit', label: `Global Audit Trail (${audits.length})`, icon: ShieldCheck },
            { key: 'logs', label: `System Logs (${systemLogs.length})`, icon: Terminal },
            { key: 'settings', label: 'System Settings', icon: Sliders },
          ].map(({ key, label, icon: Icon }) => {
            const active = activeTab === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => {
                  setActiveTab(key as typeof activeTab);
                  setSearchQuery('');
                }}
                className={`flex items-center gap-2 rounded-lg px-3 py-2.5 transition cursor-pointer ${
                  active
                    ? 'bg-background text-foreground shadow-xs font-bold'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
                data-testid={`tab-admin-${key}`}
              >
                <Icon size={15} /> {label}
              </button>
            );
          })}
        </div>

        {/* Tab Content: Overview */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="surface p-5">
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Active Sessions</div>
                <div className="mt-2 font-serif text-3xl font-extrabold text-primary">
                  {overview?.openSessions ?? 0}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">Out of {overview?.totalSessions ?? 0} scheduled sessions</div>
              </div>
              <div className="surface p-5">
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Review Queue</div>
                <div className="mt-2 font-serif text-3xl font-extrabold text-amber-600">
                  {overview?.reviewQueueCount ?? 0}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">Uncertain marks needing review</div>
              </div>
              <div className="surface p-5">
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Rostered Students</div>
                <div className="mt-2 font-serif text-3xl font-extrabold text-foreground">
                  {overview?.totalStudents ?? 0}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">Across {overview?.totalClasses ?? 0} active classes</div>
              </div>
              <div className="surface p-5">
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Geofence Flags</div>
                <div className="mt-2 font-serif text-3xl font-extrabold text-rose-600">
                  {overview?.geofenceViolationCount ?? 0}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">Check-ins outside permitted radius</div>
              </div>
            </div>

            <div className="surface p-6">
              <h2 className="font-serif text-lg font-bold">Department Breakdown</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">Active classes and student enrollments across academic departments.</p>
              <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {overview?.departmentStats?.map((stat) => (
                  <div key={stat.department} className="rounded-xl border bg-muted/20 p-4">
                    <div className="font-bold text-sm text-foreground">{stat.department}</div>
                    <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                      <span>Classes: <strong className="text-foreground">{stat.classesCount}</strong></span>
                      <span>Students: <strong className="text-foreground">{stat.studentsCount}</strong></span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Tab Content: Lecturers */}
        {activeTab === 'lecturers' && (
          <div className="surface overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b px-6 py-4">
              <div>
                <h2 className="font-serif text-lg font-bold">Lecturer Directory</h2>
                <p className="text-xs text-muted-foreground">Manage lecturer accounts, staff IDs, departments, and review clearances.</p>
              </div>
              <div className="relative w-full sm:w-64">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  className="field !py-1.5 pl-9 pr-3 !text-xs"
                  placeholder="Search lecturers or staff ID…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  data-testid="input-search-admin-lecturers"
                />
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b bg-muted/40 font-semibold text-muted-foreground uppercase tracking-wider">
                  <tr>
                    <th className="px-6 py-3">Lecturer</th>
                    <th className="px-6 py-3">Staff ID</th>
                    <th className="px-6 py-3">Departments</th>
                    <th className="px-6 py-3">Classes</th>
                    <th className="px-6 py-3">Status</th>
                    <th className="px-6 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filteredLecturers.map((lecturer) => (
                    <tr key={lecturer.userId} className="hover:bg-muted/30">
                      <td className="px-6 py-4">
                        <div className="font-bold text-foreground">{lecturer.fullName}</div>
                        <div className="text-muted-foreground font-mono text-[11px]">{lecturer.email}</div>
                      </td>
                      <td className="px-6 py-4 font-mono">{lecturer.staffId}</td>
                      <td className="px-6 py-4">
                        <div className="flex flex-wrap gap-1">
                          {lecturer.departments.map((d) => (
                            <span key={d} className="rounded bg-secondary px-2 py-0.5 text-[10px] font-medium text-secondary-foreground">
                              {d}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-6 py-4 font-mono">{lecturer.classesCount}</td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                            lecturer.reviewStatus === 'kept'
                              ? 'bg-emerald-100 text-emerald-800'
                              : lecturer.reviewStatus === 'removed'
                                ? 'bg-rose-100 text-rose-800'
                                : 'bg-amber-100 text-amber-900'
                          }`}
                        >
                          {lecturer.reviewStatus === 'kept' ? 'Active / Approved' : lecturer.reviewStatus === 'removed' ? 'Suspended' : 'Pending Review'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {lecturer.reviewStatus !== 'kept' ? (
                            <button
                              type="button"
                              onClick={() => updateStatusMutation.mutate({ userId: lecturer.userId, reviewStatus: 'kept' })}
                              className="btn btn-outline !px-2.5 !py-1 !text-xs text-emerald-700 hover:bg-emerald-50"
                              disabled={updateStatusMutation.isPending}
                            >
                              <Check size={13} /> Approve
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => updateStatusMutation.mutate({ userId: lecturer.userId, reviewStatus: 'removed' })}
                              className="btn btn-outline !px-2.5 !py-1 !text-xs text-rose-700 hover:bg-rose-50"
                              disabled={updateStatusMutation.isPending}
                            >
                              <Lock size={13} /> Suspend
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Tab Content: Departments */}
        {activeTab === 'departments' && (
          <div className="surface p-6">
            <h2 className="font-serif text-lg font-bold">Academic Departments &amp; Course Mapping</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">Institution-wide distribution of academic departments and active attendance monitoring.</p>
            <div className="mt-6 space-y-4">
              {overview?.departmentStats?.map((dept) => (
                <div key={dept.department} className="flex flex-wrap items-center justify-between gap-4 rounded-xl border p-4 bg-card shadow-2xs">
                  <div>
                    <div className="font-bold text-sm text-foreground">{dept.department}</div>
                    <div className="mt-1 text-xs text-muted-foreground font-mono">Department Code: {dept.department.slice(0, 3).toUpperCase()}-DEPT</div>
                  </div>
                  <div className="flex items-center gap-6 text-xs tabular-nums">
                    <div>Classes: <strong className="text-foreground">{dept.classesCount}</strong></div>
                    <div>Students: <strong className="text-foreground">{dept.studentsCount}</strong></div>
                    <span className="rounded bg-emerald-100 px-2.5 py-1 font-bold text-emerald-800">Operational</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tab Content: Usage Analytics */}
        {activeTab === 'analytics' && (
          <div className="surface p-6" data-testid="section-usage-analytics">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-4">
              <div>
                <h2 className="font-serif text-lg font-bold flex items-center gap-2">
                  <BarChart3 size={18} className="text-primary" /> Department Usage Analytics
                </h2>
                <p className="text-xs text-muted-foreground">Distribution of active classes and sessions across academic departments.</p>
              </div>
            </div>

            <div className="mt-6 h-[380px] w-full" data-testid="chart-department-usage">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={overview?.departmentStats ?? []}
                  margin={{ top: 20, right: 30, left: 0, bottom: 40 }}
                >
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis
                    dataKey="department"
                    tick={{ fontSize: 11 }}
                    interval={0}
                    angle={-15}
                    textAnchor="end"
                  />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      borderColor: 'hsl(var(--border))',
                      borderRadius: '0.75rem',
                      fontSize: '12px',
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                  <Bar dataKey="classesCount" name="Active Classes" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="sessionsCount" name="Total Sessions" fill="#f5c556" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="studentsCount" name="Rostered Students" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Tab Content: Audit Trail */}
        {activeTab === 'audit' && (
          <div className="surface overflow-hidden">
            <div className="border-b px-6 py-4">
              <h2 className="font-serif text-lg font-bold">System-Wide Audit Log</h2>
              <p className="text-xs text-muted-foreground">Immutable audit trail of all actions, logins, check-in flags, and review decisions.</p>
            </div>
            <div className="divide-y">
              {audits.map((audit) => (
                <div key={audit.id} className="p-4 sm:p-5 hover:bg-muted/20 transition">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-primary uppercase">{audit.action}</span>
                      <span className="rounded bg-muted px-2 py-0.5 font-mono text-[11px] text-muted-foreground">
                        Entity: {audit.entityType} ({audit.entityId.slice(0, 8)})
                      </span>
                    </div>
                    <div className="font-mono text-xs text-muted-foreground">
                      {new Date(audit.createdAt).toLocaleString()}
                    </div>
                  </div>
                  <div className="mt-2 font-mono text-[11px] bg-muted/50 p-2.5 rounded-lg text-foreground overflow-x-auto">
                    {JSON.stringify(audit.details, null, 2)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tab Content: System Logs */}
        {activeTab === 'logs' && (
          <div className="surface overflow-hidden" data-testid="section-system-logs">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b px-6 py-4">
              <div>
                <h2 className="font-serif text-lg font-bold flex items-center gap-2">
                  <Terminal size={18} className="text-primary" /> Server Activity &amp; Error Logs
                </h2>
                <p className="text-xs text-muted-foreground">Real-time server logs including failed logins, API validation errors, and geofence warnings.</p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="flex rounded-lg border bg-muted/40 p-1 text-xs">
                  {['all', 'error', 'warn', 'auth', 'info'].map((lvl) => (
                    <button
                      key={lvl}
                      type="button"
                      onClick={() => setLogLevelFilter(lvl)}
                      className={`rounded-md px-2.5 py-1 font-semibold uppercase tracking-wider transition cursor-pointer ${
                        logLevelFilter === lvl
                          ? 'bg-background text-foreground shadow-xs'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                      data-testid={`filter-log-level-${lvl}`}
                    >
                      {lvl}
                    </button>
                  ))}
                </div>
                <div className="relative w-full sm:w-56">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    className="field !py-1.5 pl-8 pr-3 !text-xs"
                    placeholder="Search server logs…"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    data-testid="input-search-system-logs"
                  />
                </div>
              </div>
            </div>

            <div className="divide-y font-mono text-xs">
              {filteredLogs.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground font-sans">
                  <Terminal size={24} className="mx-auto mb-2 opacity-50" />
                  <p className="font-semibold text-foreground">No matching system logs found</p>
                  <p className="text-xs mt-1">Try clearing the level filter or search query.</p>
                </div>
              ) : (
                filteredLogs.map((log) => {
                  const isError = log.level === 'error';
                  const isWarn = log.level === 'warn';
                  const isAuth = log.level === 'auth';
                  const badgeColor = isError
                    ? 'bg-rose-100 text-rose-800 border-rose-200'
                    : isWarn
                      ? 'bg-amber-100 text-amber-900 border-amber-200'
                      : isAuth
                        ? 'bg-purple-100 text-purple-900 border-purple-200'
                        : 'bg-sky-100 text-sky-800 border-sky-200';

                  return (
                    <div key={log.id} className="p-4 sm:p-5 hover:bg-muted/30 transition">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className={`inline-flex items-center rounded border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${badgeColor}`}>
                            {log.level}
                          </span>
                          <span className="rounded bg-secondary px-2 py-0.5 text-[11px] font-semibold text-secondary-foreground">
                            {log.category}
                          </span>
                        </div>
                        <time className="text-[11px] text-muted-foreground tabular-nums">
                          {new Date(log.timestamp).toLocaleString()}
                        </time>
                      </div>
                      <div className="mt-2 font-sans text-xs font-semibold text-foreground">{log.message}</div>
                      {log.details && Object.keys(log.details).length > 0 && (
                        <div className="mt-2 rounded-lg bg-background border p-2.5 text-[11px] text-muted-foreground overflow-x-auto">
                          {JSON.stringify(log.details, null, 2)}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* Tab Content: Settings */}
        {activeTab === 'settings' && (
          <div className="surface p-6 max-w-2xl">
            <h2 className="font-serif text-lg font-bold">Institution Attendance Settings</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">Global policy defaults for geofence enforcement and code rotation.</p>

            {overview?.systemSettings && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (settingsForm) {
                    updateSettingsMutation.mutate(settingsForm);
                  }
                }}
                className="mt-6 space-y-5"
              >
                <label className="block text-xs font-semibold">
                  Default Geofence Radius (meters)
                  <input
                    type="number"
                    className="field mt-1.5"
                    value={settingsForm?.defaultRadiusM ?? overview.systemSettings.defaultRadiusM}
                    onChange={(e) =>
                      setSettingsForm((prev) => ({
                        ...(prev ?? overview.systemSettings),
                        defaultRadiusM: Number(e.target.value),
                      }))
                    }
                    min={10}
                    max={1000}
                    required
                  />
                  <span className="mt-1 text-[11px] font-normal text-muted-foreground">Standard proximity radius for session venue check-ins.</span>
                </label>

                <label className="block text-xs font-semibold">
                  Rotating Code Validity Period (seconds)
                  <input
                    type="number"
                    className="field mt-1.5"
                    value={settingsForm?.rotatingCodeSeconds ?? overview.systemSettings.rotatingCodeSeconds}
                    onChange={(e) =>
                      setSettingsForm((prev) => ({
                        ...(prev ?? overview.systemSettings),
                        rotatingCodeSeconds: Number(e.target.value),
                      }))
                    }
                    min={15}
                    max={120}
                    required
                  />
                  <span className="mt-1 text-[11px] font-normal text-muted-foreground">How often projector check-in codes automatically rotate.</span>
                </label>

                <div className="flex items-center gap-3 pt-2">
                  <input
                    type="checkbox"
                    id="strictGeofence"
                    className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                    checked={settingsForm?.strictGeofence ?? overview.systemSettings.strictGeofence}
                    onChange={(e) =>
                      setSettingsForm((prev) => ({
                        ...(prev ?? overview.systemSettings),
                        strictGeofence: e.target.checked,
                      }))
                    }
                  />
                  <label htmlFor="strictGeofence" className="text-xs font-semibold cursor-pointer">
                    Enforce strict geofence validation (flag any check-in outside venue radius)
                  </label>
                </div>

                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    id="allowStaticCodes"
                    className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                    checked={settingsForm?.allowStaticCodes ?? overview.systemSettings.allowStaticCodes}
                    onChange={(e) =>
                      setSettingsForm((prev) => ({
                        ...(prev ?? overview.systemSettings),
                        allowStaticCodes: e.target.checked,
                      }))
                    }
                  />
                  <label htmlFor="allowStaticCodes" className="text-xs font-semibold cursor-pointer">
                    Allow lecturers to use static check-in codes for accessibility
                  </label>
                </div>

                <div className="pt-4 border-t flex justify-end">
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={updateSettingsMutation.isPending}
                    data-testid="button-save-admin-settings"
                  >
                    {updateSettingsMutation.isPending ? 'Saving…' : 'Save policy settings'}
                  </button>
                </div>
              </form>
            )}
          </div>
        )}
      </div>
    </Shell>
  );
}
