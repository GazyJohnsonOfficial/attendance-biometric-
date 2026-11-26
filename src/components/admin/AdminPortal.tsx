import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useLocation } from 'wouter';
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  BookOpen,
  Building2,
  Check,
  Cpu,
  Edit3,
  History,
  LogOut,
  Menu,
  Plus,
  Power,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sliders,
  Terminal,
  Users,
  X,
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
import { customFetch, setAuthTokenGetter } from '@/api-client-react/custom-fetch';
import { lecturerKeys, logoutUnified } from '@/lib/lecturerApi';
import { useToast } from '@/hooks/use-toast';
import { AdminReauthModal, useAdminReauth } from './AdminReauthModal';
import { AdminReferenceTab } from './AdminReferenceTab';
import { AdminDisputesTab, AdminIntegrityTab, AdminLecturersTab } from './AdminOperationsTabs';
import { AdminReportsTab, AdminSecurityTab, AdminSettingsTab } from './AdminGovernanceTabs';

export interface AdminUser {
  id: string;
  fullName: string;
  email: string;
  role: 'super_admin' | 'department_admin';
  departments?: string[];
}

interface AdminAuthValue {
  isAdminSignedIn: boolean;
  adminUser: AdminUser | null;
  adminToken: string | null;
  sessionTimeoutMinutes: number;
  adminSignIn: (user: AdminUser, token: string, timeoutMinutes?: number) => void;
  adminSignOut: () => void;
}

export interface DepartmentReferenceItem {
  id: string;
  name: string;
  code: string;
  active: boolean;
  classesCount: number;
  studentsCount: number;
  lecturersCount: number;
  createdAt: string;
  updatedAt: string;
}

const AdminAuthContext = createContext<AdminAuthValue>({
  isAdminSignedIn: false,
  adminUser: null,
  adminToken: null,
  sessionTimeoutMinutes: 30,
  adminSignIn: () => {},
  adminSignOut: () => {},
});

export function useAdminAuth() {
  return useContext(AdminAuthContext);
}

let memoryAuthToken: string | null = null;

export function setMemoryAuthToken(token: string | null) {
  memoryAuthToken = token;
  setAuthTokenGetter(token ? () => memoryAuthToken : null);
}

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [isAdminSignedIn, setIsAdminSignedIn] = useState(false);
  const [adminUser, setAdminUser] = useState<AdminUser | null>(null);
  const [adminToken, setAdminToken] = useState<string | null>(null);
  const [sessionTimeoutMinutes, setSessionTimeoutMinutes] = useState(30);

  const adminSignOut = useCallback(() => {
    void logoutUnified();
    setMemoryAuthToken(null);
    setAdminToken(null);
    setAdminUser(null);
    setIsAdminSignedIn(false);
  }, []);

  // Automatic short-session logout timer
  useEffect(() => {
    if (!isAdminSignedIn) return undefined;
    const ms = Math.max(5, sessionTimeoutMinutes) * 60_000;
    const timer = window.setTimeout(() => {
      adminSignOut();
    }, ms);
    return () => window.clearTimeout(timer);
  }, [isAdminSignedIn, sessionTimeoutMinutes, adminSignOut]);

  return (
    <AdminAuthContext.Provider
      value={{
        isAdminSignedIn,
        adminUser,
        adminToken,
        sessionTimeoutMinutes,
        adminSignIn: (u, token, timeoutMinutes) => {
          setMemoryAuthToken(token);
          setAdminToken(token);
          setAdminUser(u);
          if (timeoutMinutes) setSessionTimeoutMinutes(timeoutMinutes);
          setIsAdminSignedIn(true);
        },
        adminSignOut,
      }}
    >
      {children}
    </AdminAuthContext.Provider>
  );
}

export function AdminGuard({ children }: { children: ReactNode }) {
  const { isAdminSignedIn } = useAdminAuth();
  const [, setLocation] = useLocation();
  if (!isAdminSignedIn) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4">
        <div className="w-full max-w-sm rounded-2xl border bg-card p-6 text-center shadow-sm">
          <div className="mx-auto grid h-11 w-11 place-items-center rounded-xl bg-primary/10 text-primary">
            <ShieldCheck size={22} />
          </div>
          <h2 className="mt-3 font-serif text-lg font-bold">Administrator sign-in required</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Sign in with your administrator credentials or use the shared Sign In page to open the Admin Portal.
          </p>
          <div className="mt-5 flex flex-col gap-2">
            <button
              type="button"
              className="btn btn-primary w-full"
              onClick={() => setLocation('/admin/login')}
              data-testid="button-goto-admin-login"
            >
              Open Admin Sign In
            </button>
            <button
              type="button"
              className="btn btn-outline w-full"
              onClick={() => setLocation('/sign-in')}
              data-testid="button-goto-shared-signin"
            >
              Use Shared Staff Sign In
            </button>
          </div>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}

export function AdminPortal() {
  const { adminUser, sessionTimeoutMinutes, adminSignOut } = useAdminAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const { pendingReauth, closeReauth, requireReauth } = useAdminReauth();

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<
    | 'overview'
    | 'departments'
    | 'reference'
    | 'lecturers'
    | 'disputes'
    | 'integrity'
    | 'reports'
    | 'settings'
    | 'security'
    | 'logs'
  >('overview');

  // Departments tab state
  const [deptSearch, setDeptSearch] = useState('');
  const [deptStatusFilter, setDeptStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [newDeptName, setNewDeptName] = useState('');
  const [newDeptCode, setNewDeptCode] = useState('');
  const [deptFormError, setDeptFormError] = useState('');
  const [editingDeptId, setEditingDeptId] = useState<string | null>(null);
  const [editDeptName, setEditDeptName] = useState('');
  const [editDeptCode, setEditDeptCode] = useState('');
  const [confirmDeactivateDeptId, setConfirmDeactivateDeptId] = useState<string | null>(null);

  // Overview sub-view state
  const [oversightView, setOversightView] = useState<'breakdown' | 'classes' | 'sessions' | 'flags'>('breakdown');

  // System logs filter
  const [logLevelFilter, setLogLevelFilter] = useState<'all' | 'auth' | 'warn' | 'error' | 'info'>('all');

  const isSuperAdmin = adminUser?.role === 'super_admin';

  const overviewQuery = useQuery({
    queryKey: ['admin-overview'],
    queryFn: () => customFetch<any>('/api/admin/overview'),
    refetchInterval: 10000,
  });

  const departmentsQuery = useQuery<DepartmentReferenceItem[]>({
    queryKey: ['admin-reference-departments'],
    queryFn: () => customFetch<DepartmentReferenceItem[]>('/api/admin/reference/departments'),
  });

  const systemLogsQuery = useQuery({
    queryKey: ['admin-system-logs'],
    queryFn: () => customFetch<any[]>('/api/admin/system-logs'),
  });

  const invalidateDepartmentQueries = () => {
    qc.invalidateQueries({ queryKey: ['admin-reference-departments'] });
    qc.invalidateQueries({ queryKey: ['admin-overview'] });
    qc.invalidateQueries({ queryKey: ['admin-audit'] });
    qc.invalidateQueries({ queryKey: ['admin-lecturers'] });
    qc.invalidateQueries({ queryKey: lecturerKeys.lists('departments') });
  };

  const createDepartmentMutation = useMutation({
    mutationFn: (payload: { name: string; code?: string }) =>
      customFetch<DepartmentReferenceItem>('/api/admin/reference/departments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }),
    onSuccess: (created) => {
      invalidateDepartmentQueries();
      setNewDeptName('');
      setNewDeptCode('');
      setDeptFormError('');
      toast({
        title: `Department "${created.name}" added`,
        description: `Code ${created.code} is now active for lecturer registration and class setup.`,
      });
    },
    onError: (err) => {
      const message = err instanceof Error ? err.message : 'Could not add department.';
      setDeptFormError(message);
      toast({ title: 'Failed to add department', description: message, variant: 'destructive' });
    },
  });

  const updateDepartmentMutation = useMutation({
    mutationFn: ({
      departmentId,
      data,
    }: {
      departmentId: string;
      data: { name?: string; code?: string; active?: boolean };
    }) =>
      customFetch<DepartmentReferenceItem>(`/api/admin/reference/departments/${departmentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    onSuccess: (updated, vars) => {
      invalidateDepartmentQueries();
      setEditingDeptId(null);
      setConfirmDeactivateDeptId(null);
      if (vars.data.active === false) {
        toast({
          title: `Department "${updated.name}" deactivated`,
          description: 'Preserved in past classes and reports, hidden from new setup lists.',
        });
      } else if (vars.data.active === true) {
        toast({
          title: `Department "${updated.name}" reactivated`,
          description: 'Now available again for new classes and lecturer profiles.',
        });
      } else {
        toast({ title: `Department "${updated.name}" updated` });
      }
    },
    onError: (err) => {
      const message = err instanceof Error ? err.message : 'Could not update department.';
      toast({ title: 'Update failed', description: message, variant: 'destructive' });
    },
  });

  const overview = overviewQuery.data;
  const departments = departmentsQuery.data ?? [];
  const systemLogs = (systemLogsQuery.data ?? []).filter(
    (l) => logLevelFilter === 'all' || l.level === logLevelFilter,
  );

  const activeDeptCount = departments.filter((d) => d.active).length;
  const inactiveDeptCount = departments.length - activeDeptCount;
  const totalDeptClasses = departments.reduce((sum, d) => sum + d.classesCount, 0);

  const filteredDepartments = departments.filter((dept) => {
    const matchesStatus =
      deptStatusFilter === 'all' ||
      (deptStatusFilter === 'active' && dept.active) ||
      (deptStatusFilter === 'inactive' && !dept.active);
    const q = deptSearch.trim().toLowerCase();
    const matchesQuery =
      !q || dept.name.toLowerCase().includes(q) || dept.code.toLowerCase().includes(q);
    return matchesStatus && matchesQuery;
  });

  const handleAddDepartment = (e: FormEvent) => {
    e.preventDefault();
    setDeptFormError('');
    const trimmedName = newDeptName.trim();
    const trimmedCode = newDeptCode.trim();
    if (trimmedName.length < 2) {
      setDeptFormError('Enter a department name of at least 2 characters.');
      return;
    }
    createDepartmentMutation.mutate({
      name: trimmedName,
      ...(trimmedCode ? { code: trimmedCode } : {}),
    });
  };

  const startEditingDept = (dept: DepartmentReferenceItem) => {
    setEditingDeptId(dept.id);
    setEditDeptName(dept.name);
    setEditDeptCode(dept.code);
    setConfirmDeactivateDeptId(null);
  };

  const saveEditingDept = (e: FormEvent, deptId: string) => {
    e.preventDefault();
    const trimmedName = editDeptName.trim();
    const trimmedCode = editDeptCode.trim();
    if (trimmedName.length < 2 || trimmedCode.length < 2) {
      toast({
        title: 'Invalid department details',
        description: 'Both name and code must be at least 2 characters.',
        variant: 'destructive',
      });
      return;
    }
    updateDepartmentMutation.mutate({
      departmentId: deptId,
      data: { name: trimmedName, code: trimmedCode },
    });
  };

  const tabTitles: Record<typeof activeTab, string> = {
    overview: 'System Oversight Dashboard',
    departments: 'Department Management',
    reference: 'Reference Data Management',
    lecturers: 'Lecturer Management & Activity',
    disputes: 'Identity Disputes & Support Queue',
    integrity: 'Attendance Integrity & Anomalies',
    reports: 'Institutional Aggregate Reports',
    settings: 'Settings, Privacy & Announcements',
    security: 'Admin Security, Approvals & Audit Log',
    logs: 'Server Activity & Error Logs',
  };

  return (
    <div className="min-h-[100dvh] bg-background text-foreground flex">
      {/* Admin Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-[#111c24] px-4 py-5 text-white shadow-xl transition-transform md:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between px-2 pb-5 border-b border-white/10">
          <div className="flex items-center gap-2.5">
            <div className="grid h-8 w-8 place-items-center rounded-lg bg-primary text-primary-foreground font-bold">
              <ShieldCheck size={18} />
            </div>
            <div>
              <strong className="block text-sm tracking-tight">Admin Portal</strong>
              <span className="text-[10px] text-emerald-400 font-mono uppercase tracking-widest">
                {isSuperAdmin ? 'Super Admin' : 'Dept Admin · Scoped'}
              </span>
            </div>
          </div>
          <button
            type="button"
            className="rounded p-1 text-white/60 hover:bg-white/10 md:hidden"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close admin sidebar"
          >
            <X size={16} />
          </button>
        </div>

        <div className="eyebrow mt-6 px-3 !text-white/40">Campus Management</div>
        <nav className="mt-2 space-y-1 overflow-y-auto flex-1">
          {[
            { key: 'overview', label: 'System Overview', icon: Activity },
            { key: 'departments', label: `Departments (${departments.length})`, icon: Building2 },
            { key: 'reference', label: 'Reference Data', icon: BookOpen },
            { key: 'lecturers', label: 'Lecturer Management', icon: Users },
            { key: 'disputes', label: 'Disputes & Support', icon: ShieldAlert },
            { key: 'integrity', label: 'Attendance Integrity', icon: Cpu },
            { key: 'reports', label: 'Aggregate Reports', icon: BarChart3 },
            { key: 'settings', label: 'Settings & Policy', icon: Sliders },
            { key: 'security', label: 'Security & Audit Log', icon: History },
            { key: 'logs', label: 'Server System Logs', icon: Terminal },
          ].map(({ key, label, icon: Icon }) => {
            const active = activeTab === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => {
                  setActiveTab(key as typeof activeTab);
                  setSidebarOpen(false);
                }}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-xs font-semibold transition whitespace-nowrap shrink-0 cursor-pointer ${
                  active ? 'bg-primary text-primary-foreground shadow-sm' : 'text-white/70 hover:bg-white/5 hover:text-white'
                }`}
                data-testid={`admin-nav-${key}`}
              >
                <Icon size={16} /> {label}
              </button>
            );
          })}
        </nav>

        <div className="mt-auto border-t border-white/10 pt-4">
          <div className="flex items-center justify-between">
            <div className="min-w-0">
              <div className="truncate text-xs font-bold text-white">{adminUser?.fullName}</div>
              <div className="font-mono text-[10px] text-white/50 truncate">{adminUser?.email}</div>
            </div>
            <button
              type="button"
              className="rounded-lg p-2 text-white/60 hover:bg-white/10 hover:text-white cursor-pointer"
              onClick={() => {
                adminSignOut();
                setLocation('/admin/login');
              }}
              title="Sign out of admin"
              data-testid="button-admin-signout"
            >
              <LogOut size={16} />
            </button>
          </div>
          <div className="mt-3">
            <Link href="/app" className="inline-flex items-center gap-1.5 text-[11px] text-accent hover:underline">
              <ArrowLeft size={13} /> Return to Lecturer Workspace
            </Link>
          </div>
        </div>
      </aside>

      {sidebarOpen && (
        <button
          type="button"
          className="fixed inset-0 z-30 bg-black/40 md:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-label="Close sidebar overlay"
        />
      )}

      {/* Main Content Area */}
      <div className="flex-1 md:pl-64 flex flex-col min-h-[100dvh] w-full">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b bg-background/95 px-4 sm:px-8 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="rounded-lg p-2 hover:bg-muted md:hidden"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open admin navigation"
            >
              <Menu size={18} />
            </button>
            <span className="font-serif text-base sm:text-lg font-bold">{tabTitles[activeTab]}</span>
          </div>
          <div className="flex items-center gap-3 text-xs font-mono text-muted-foreground tabular-nums">
            <span>
              {isSuperAdmin
                ? 'All Departments'
                : `Scoped: ${adminUser?.departments?.join(', ') || 'Department'}`}
            </span>
            <span>·</span>
            <span>Auto-lock {sessionTimeoutMinutes}m</span>
          </div>
        </header>

        <main className="p-4 sm:p-8 space-y-8 flex-1">
          {/* TAB 1: SYSTEM OVERSIGHT */}
          {activeTab === 'overview' && (
            <div className="space-y-6" data-testid="section-admin-overview">
              {/* 8 Key Oversight Counts */}
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 tabular-nums">
                <div className="surface p-5">
                  <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Lecturers</div>
                  <div className="mt-2 font-serif text-3xl font-extrabold">{overview?.totalLecturers ?? 0}</div>
                  <div className="mt-1 text-xs text-muted-foreground">Active institutional staff</div>
                </div>
                <div className="surface p-5">
                  <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Registered Students</div>
                  <div className="mt-2 font-serif text-3xl font-extrabold">{overview?.registeredStudents ?? 0}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{overview?.totalStudents ?? 0} on active rosters</div>
                </div>
                <div className="surface p-5">
                  <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Classes &amp; Sessions Today</div>
                  <div className="mt-2 font-serif text-3xl font-extrabold text-primary">
                    {overview?.sessionsToday ?? 0}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {overview?.totalClasses ?? 0} classes · {overview?.openSessions ?? 0} live now
                  </div>
                </div>
                <div className="surface p-5">
                  <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Check-ins Today</div>
                  <div className="mt-2 font-serif text-3xl font-extrabold">{overview?.checkInsToday ?? 0}</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    Needs-review rate: <span className="font-mono font-bold">{overview?.needsReviewRate ?? 0}%</span> ({overview?.reviewQueueCount ?? 0})
                  </div>
                </div>
                <div className="surface p-5">
                  <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Open Disputes</div>
                  <div className="mt-2 font-serif text-3xl font-extrabold text-amber-700">
                    {overview?.openDisputesCount ?? 0}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">Cases awaiting in-person check</div>
                </div>
                <div className="surface p-5">
                  <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Open / Unfinalised Flags</div>
                  <div className="mt-2 font-serif text-3xl font-extrabold text-rose-700">
                    {(overview?.openSessionFlags?.length ?? 0) + (overview?.unfinalisedLecturerFlags?.length ?? 0)}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {overview?.openSessionFlags?.length ?? 0} sessions · {overview?.unfinalisedLecturerFlags?.length ?? 0} lecturers
                  </div>
                </div>
                <div className="surface p-5">
                  <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Total Sessions Held</div>
                  <div className="mt-2 font-serif text-3xl font-extrabold">{overview?.totalSessions ?? 0}</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {overview?.geofenceViolationCount ?? 0} geofence review flags
                  </div>
                </div>
                <div className="surface p-5">
                  <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">System Health</div>
                  <div className="mt-2 font-serif text-3xl font-extrabold text-emerald-700">
                    {overview?.systemHealth ?? '99.98%'}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">API &amp; Verification Operational</div>
                </div>
              </div>

              {/* Oversight Sub-navigation */}
              <div className="flex flex-wrap gap-1.5">
                {[
                  { key: 'breakdown', label: 'Department & Programme Breakdown' },
                  { key: 'classes', label: `All Classes Metadata (${overview?.allClassesMeta?.length ?? 0})` },
                  { key: 'sessions', label: `All Sessions Metadata (${overview?.allSessionsMeta?.length ?? 0})` },
                  {
                    key: 'flags',
                    label: `Open & Unfinalised Flags (${
                      (overview?.openSessionFlags?.length ?? 0) + (overview?.unfinalisedLecturerFlags?.length ?? 0)
                    })`,
                  },
                ].map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setOversightView(item.key as typeof oversightView)}
                    className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition whitespace-nowrap shrink-0 cursor-pointer ${
                      oversightView === item.key
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'bg-card text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>

              {oversightView === 'breakdown' && (
                <div className="space-y-6">
                  <div className="surface p-6">
                    <h3 className="font-serif text-base font-bold">Department Usage, Attendance &amp; Adoption</h3>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Active classes, sessions held, average attendance, and lecturer adoption by department.
                    </p>
                    <div className="mt-5 h-72 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={overview?.departmentStats ?? []}>
                          <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                          <XAxis dataKey="department" tick={{ fontSize: 11 }} />
                          <YAxis tick={{ fontSize: 11 }} />
                          <Tooltip />
                          <Legend />
                          <Bar dataKey="classesCount" name="Active Classes" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                          <Bar dataKey="sessionsCount" name="Sessions Held" fill="#0d9488" radius={[4, 4, 0, 0]} />
                          <Bar dataKey="averageAttendancePct" name="Avg Attendance %" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  <div className="surface overflow-hidden">
                    <div className="border-b px-6 py-4">
                      <h3 className="font-serif text-base font-bold">Breakdown by Programme</h3>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="border-b bg-muted/40 font-semibold uppercase tracking-wider text-muted-foreground">
                          <tr>
                            <th className="px-5 py-3">Programme</th>
                            <th className="px-5 py-3">Department</th>
                            <th className="px-5 py-3">Classes</th>
                            <th className="px-5 py-3">Sessions Held</th>
                            <th className="px-5 py-3">Avg Attendance</th>
                            <th className="px-5 py-3">Active Lecturers</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y tabular-nums">
                          {(overview?.programmeStats ?? []).map((p: any) => (
                            <tr key={p.programme}>
                              <td className="px-5 py-3 font-semibold">{p.programme}</td>
                              <td className="px-5 py-3 text-muted-foreground">{p.department}</td>
                              <td className="px-5 py-3 font-mono">{p.classesCount}</td>
                              <td className="px-5 py-3 font-mono">{p.sessionsCount}</td>
                              <td className="px-5 py-3 font-mono font-bold">{p.averageAttendancePct}%</td>
                              <td className="px-5 py-3 font-mono">{p.activeLecturersCount}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {oversightView === 'classes' && (
                <div className="surface overflow-hidden">
                  <div className="border-b px-6 py-4">
                    <h3 className="font-serif text-base font-bold">All Classes Across Institution (Metadata Only)</h3>
                    <p className="text-xs text-muted-foreground">Rosters, student names, and photos are never exposed in oversight.</p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="border-b bg-muted/40 font-semibold uppercase tracking-wider text-muted-foreground">
                        <tr>
                          <th className="px-5 py-3">Course</th>
                          <th className="px-5 py-3">Department &amp; Programme</th>
                          <th className="px-5 py-3">Lecturer</th>
                          <th className="px-5 py-3">Term</th>
                          <th className="px-5 py-3">Counts</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y tabular-nums">
                        {(overview?.allClassesMeta ?? []).map((c: any) => (
                          <tr key={c.id}>
                            <td className="px-5 py-3">
                              <div className="font-mono font-bold">{c.courseCode}</div>
                              <div className="text-muted-foreground">{c.courseTitle}</div>
                            </td>
                            <td className="px-5 py-3">
                              <div>{c.department}</div>
                              <div className="text-muted-foreground">{c.programme} · L{c.level}</div>
                            </td>
                            <td className="px-5 py-3 font-semibold">{c.lecturerName}</td>
                            <td className="px-5 py-3 text-muted-foreground">{c.semester}</td>
                            <td className="px-5 py-3 font-mono">
                              {c.rosterCount} enrolled · {c.sessionsCount} sessions
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {oversightView === 'sessions' && (
                <div className="surface overflow-hidden">
                  <div className="border-b px-6 py-4">
                    <h3 className="font-serif text-base font-bold">All Sessions Across Institution (Metadata Only)</h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="border-b bg-muted/40 font-semibold uppercase tracking-wider text-muted-foreground">
                        <tr>
                          <th className="px-5 py-3">Course</th>
                          <th className="px-5 py-3">Lecturer</th>
                          <th className="px-5 py-3">Location &amp; Time</th>
                          <th className="px-5 py-3">Status</th>
                          <th className="px-5 py-3">Aggregate Counts</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y tabular-nums">
                        {(overview?.allSessionsMeta ?? []).map((s: any) => (
                          <tr key={s.id}>
                            <td className="px-5 py-3">
                              <div className="font-mono font-bold">{s.courseCode}</div>
                              <div className="text-muted-foreground">{s.department}</div>
                            </td>
                            <td className="px-5 py-3 font-semibold">{s.lecturerName}</td>
                            <td className="px-5 py-3">
                              <div>{s.location}</div>
                              <div className="font-mono text-[11px] text-muted-foreground">
                                {new Date(s.startsAt).toLocaleString()}
                              </div>
                            </td>
                            <td className="px-5 py-3 font-semibold capitalize">{s.status}</td>
                            <td className="px-5 py-3 font-mono">
                              {s.checkedInCount} / {s.expectedCount} checked in
                              {s.needsReviewCount > 0 ? ` · ${s.needsReviewCount} review` : ''}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {oversightView === 'flags' && (
                <div className="grid gap-6 lg:grid-cols-2">
                  <div className="surface overflow-hidden">
                    <div className="border-b px-5 py-4">
                      <h3 className="flex items-center gap-2 font-serif text-base font-bold">
                        <AlertTriangle size={16} className="text-amber-700" /> Sessions Left Open / Overdue
                      </h3>
                    </div>
                    <div className="divide-y">
                      {(overview?.openSessionFlags ?? []).length === 0 ? (
                        <div className="p-6 text-xs text-muted-foreground">No overdue or unclosed sessions flagged.</div>
                      ) : (
                        (overview?.openSessionFlags ?? []).map((s: any) => (
                          <div key={s.id} className="px-5 py-3.5 text-xs">
                            <div className="flex items-center justify-between font-semibold">
                              <span>
                                {s.courseCode} · {s.lecturerName}
                              </span>
                              <span className="font-mono uppercase text-amber-700">{s.status}</span>
                            </div>
                            <div className="mt-1 font-mono text-[11px] text-muted-foreground">
                              {s.location} · Ended {new Date(s.endsAt).toLocaleString()}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  <div className="surface overflow-hidden">
                    <div className="border-b px-5 py-4">
                      <h3 className="flex items-center gap-2 font-serif text-base font-bold">
                        <AlertTriangle size={16} className="text-rose-700" /> Lecturers With Unfinalised Sessions
                      </h3>
                    </div>
                    <div className="divide-y">
                      {(overview?.unfinalisedLecturerFlags ?? []).length === 0 ? (
                        <div className="p-6 text-xs text-muted-foreground">All lecturers have finalised past sessions.</div>
                      ) : (
                        (overview?.unfinalisedLecturerFlags ?? []).map((l: any) => (
                          <div key={l.userId} className="flex items-center justify-between px-5 py-3.5 text-xs tabular-nums">
                            <div>
                              <div className="font-semibold">
                                {l.fullName} ({l.staffId})
                              </div>
                              <div className="text-muted-foreground">
                                {l.unfinalisedCount} unfinalised of {l.totalSessions} session(s)
                              </div>
                            </div>
                            {l.neverFinalised && (
                              <span className="font-semibold text-rose-700">Never finalised</span>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: DEPARTMENTS */}
          {activeTab === 'departments' && (
            <div className="space-y-6" data-testid="section-admin-departments">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 tabular-nums">
                <div className="surface p-5">
                  <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Total Departments</div>
                  <div className="mt-2 font-serif text-3xl font-extrabold" data-testid="value-total-departments">
                    {departments.length}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">Master reference list</div>
                </div>
                <div className="surface p-5">
                  <div className="text-xs font-semibold uppercase tracking-wider text-emerald-800">Active</div>
                  <div className="mt-2 font-serif text-3xl font-extrabold text-emerald-700" data-testid="value-active-departments">
                    {activeDeptCount}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">Visible for new classes &amp; sign-up</div>
                </div>
                <div className="surface p-5">
                  <div className="text-xs font-semibold uppercase tracking-wider text-amber-800">Deactivated</div>
                  <div className="mt-2 font-serif text-3xl font-extrabold text-amber-700" data-testid="value-inactive-departments">
                    {inactiveDeptCount}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">Preserved for historical reports</div>
                </div>
                <div className="surface p-5">
                  <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Linked Classes</div>
                  <div className="mt-2 font-serif text-3xl font-extrabold text-primary">{totalDeptClasses}</div>
                  <div className="mt-1 text-xs text-muted-foreground">Across all departments</div>
                </div>
              </div>

              <div className="surface p-6">
                <div className="flex flex-wrap items-start justify-between gap-4 border-b pb-4">
                  <div>
                    <div className="eyebrow">Reference data ownership</div>
                    <h2 className="mt-1 font-serif text-lg font-bold">Add a department</h2>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Departments are deactivated rather than deleted so past classes and attendance reports retain their official names.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => departmentsQuery.refetch()}
                    className="btn btn-outline !px-3 !py-1.5 !text-xs whitespace-nowrap shrink-0"
                    disabled={departmentsQuery.isFetching}
                  >
                    <RefreshCw size={13} className={departmentsQuery.isFetching ? 'animate-spin' : ''} />
                    Refresh
                  </button>
                </div>

                {!isSuperAdmin ? (
                  <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs font-medium text-amber-900">
                    Super Administrator role is required to add, edit, or deactivate reference departments.
                  </div>
                ) : (
                  <form onSubmit={handleAddDepartment} className="mt-5 grid gap-3 sm:grid-cols-[1fr_.45fr_auto] sm:items-end">
                    <label className="block text-xs font-semibold">
                      Department name
                      <input
                        className="field mt-1.5"
                        placeholder="e.g. Biomedical Engineering"
                        value={newDeptName}
                        onChange={(e) => setNewDeptName(e.target.value)}
                        required
                        minLength={2}
                        maxLength={120}
                        data-testid="input-new-department-name"
                      />
                    </label>
                    <label className="block text-xs font-semibold">
                      Department code (optional)
                      <input
                        className="field mt-1.5 font-mono uppercase"
                        placeholder="e.g. BME"
                        value={newDeptCode}
                        onChange={(e) => setNewDeptCode(e.target.value.toUpperCase())}
                        maxLength={16}
                        data-testid="input-new-department-code"
                      />
                    </label>
                    <button
                      type="submit"
                      disabled={createDepartmentMutation.isPending}
                      className="btn btn-primary whitespace-nowrap shrink-0"
                      data-testid="button-add-department"
                    >
                      <Plus size={15} />
                      {createDepartmentMutation.isPending ? 'Adding…' : 'Add department'}
                    </button>
                  </form>
                )}

                {deptFormError && (
                  <p className="mt-3 rounded-lg bg-destructive/10 px-3 py-2 text-xs font-semibold text-destructive">
                    {deptFormError}
                  </p>
                )}
              </div>

              <div className="surface overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b px-6 py-4">
                  <div>
                    <h2 className="font-serif text-lg font-bold">Departments Directory</h2>
                    <p className="text-xs text-muted-foreground">
                      Edit names or codes, or deactivate departments that are no longer offered.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex rounded-lg border bg-muted/40 p-1 text-xs">
                      {(['all', 'active', 'inactive'] as const).map((statusKey) => (
                        <button
                          key={statusKey}
                          type="button"
                          onClick={() => setDeptStatusFilter(statusKey)}
                          className={`rounded-md px-2.5 py-1 font-semibold capitalize transition whitespace-nowrap shrink-0 cursor-pointer ${
                            deptStatusFilter === statusKey
                              ? 'bg-background text-foreground shadow-xs'
                              : 'text-muted-foreground hover:text-foreground'
                          }`}
                          data-testid={`filter-dept-${statusKey}`}
                        >
                          {statusKey === 'inactive' ? 'Deactivated' : statusKey}
                        </button>
                      ))}
                    </div>
                    <div className="relative w-full sm:w-56">
                      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                      <input
                        className="field !py-1.5 pl-8 pr-3 !text-xs"
                        placeholder="Search name or code…"
                        value={deptSearch}
                        onChange={(e) => setDeptSearch(e.target.value)}
                        data-testid="input-search-departments"
                      />
                    </div>
                  </div>
                </div>

                {departmentsQuery.isLoading ? (
                  <div className="p-8 text-center text-xs text-muted-foreground">Loading departments…</div>
                ) : departmentsQuery.isError ? (
                  <div className="p-8 text-center text-xs text-destructive">
                    Could not load departments.{' '}
                    <button type="button" className="underline" onClick={() => departmentsQuery.refetch()}>
                      Retry
                    </button>
                  </div>
                ) : filteredDepartments.length === 0 ? (
                  <div className="p-8 text-center text-xs text-muted-foreground">No departments match the current filter.</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="border-b bg-muted/40 font-semibold text-muted-foreground uppercase tracking-wider">
                        <tr>
                          <th className="px-6 py-3">Department</th>
                          <th className="px-6 py-3">Code</th>
                          <th className="px-6 py-3">Linked Activity</th>
                          <th className="px-6 py-3">Status</th>
                          <th className="px-6 py-3">Last Updated</th>
                          <th className="px-6 py-3 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {filteredDepartments.map((dept) => {
                          const isEditing = editingDeptId === dept.id;
                          const isConfirmingDeactivate = confirmDeactivateDeptId === dept.id;

                          return (
                            <tr
                              key={dept.id}
                              className={`hover:bg-muted/30 ${!dept.active ? 'bg-muted/20 opacity-85' : ''}`}
                              data-testid={`row-department-${dept.id}`}
                            >
                              <td className="px-6 py-4">
                                {isEditing ? (
                                  <form id={`edit-dept-form-${dept.id}`} onSubmit={(e) => saveEditingDept(e, dept.id)}>
                                    <input
                                      className="field !py-1 !text-xs"
                                      value={editDeptName}
                                      onChange={(e) => setEditDeptName(e.target.value)}
                                      minLength={2}
                                      maxLength={120}
                                      required
                                      aria-label="Edit department name"
                                      data-testid={`input-edit-dept-name-${dept.id}`}
                                    />
                                  </form>
                                ) : (
                                  <div className="font-bold text-foreground">{dept.name}</div>
                                )}
                              </td>
                              <td className="px-6 py-4">
                                {isEditing ? (
                                  <input
                                    form={`edit-dept-form-${dept.id}`}
                                    className="field !py-1 !text-xs font-mono uppercase w-24"
                                    value={editDeptCode}
                                    onChange={(e) => setEditDeptCode(e.target.value.toUpperCase())}
                                    minLength={2}
                                    maxLength={16}
                                    required
                                    aria-label="Edit department code"
                                    data-testid={`input-edit-dept-code-${dept.id}`}
                                  />
                                ) : (
                                  <span className="font-mono text-[11px] font-bold text-foreground">{dept.code}</span>
                                )}
                              </td>
                              <td className="px-6 py-4 font-mono text-[11px] text-muted-foreground tabular-nums">
                                {dept.classesCount} classes · {dept.lecturersCount} lecturers · {dept.studentsCount} students
                              </td>
                              <td className="px-6 py-4">
                                <span
                                  className={`text-xs font-semibold ${
                                    dept.active ? 'text-emerald-700' : 'text-muted-foreground'
                                  }`}
                                  data-testid={`status-dept-${dept.id}`}
                                >
                                  {dept.active ? 'Active' : 'Deactivated'}
                                </span>
                              </td>
                              <td className="px-6 py-4 font-mono text-[11px] text-muted-foreground tabular-nums">
                                {new Date(dept.updatedAt).toLocaleDateString()}
                              </td>
                              <td className="px-6 py-4 text-right">
                                {isSuperAdmin && (
                                  <div className="flex items-center justify-end gap-1.5">
                                    {isEditing ? (
                                      <>
                                        <button
                                          type="submit"
                                          form={`edit-dept-form-${dept.id}`}
                                          disabled={updateDepartmentMutation.isPending}
                                          className="btn btn-primary !px-2.5 !py-1 !text-xs whitespace-nowrap shrink-0"
                                          data-testid={`button-save-dept-${dept.id}`}
                                        >
                                          <Check size={13} /> Save
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => setEditingDeptId(null)}
                                          className="btn btn-outline !px-2.5 !py-1 !text-xs whitespace-nowrap shrink-0"
                                          data-testid={`button-cancel-edit-dept-${dept.id}`}
                                        >
                                          <X size={13} /> Cancel
                                        </button>
                                      </>
                                    ) : isConfirmingDeactivate ? (
                                      <>
                                        <button
                                          type="button"
                                          disabled={updateDepartmentMutation.isPending}
                                          onClick={() =>
                                            updateDepartmentMutation.mutate({
                                              departmentId: dept.id,
                                              data: { active: false },
                                            })
                                          }
                                          className="btn !bg-rose-600 !text-white hover:!bg-rose-700 !px-2.5 !py-1 !text-xs whitespace-nowrap shrink-0"
                                          data-testid={`button-confirm-deactivate-dept-${dept.id}`}
                                        >
                                          Confirm deactivate
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => setConfirmDeactivateDeptId(null)}
                                          className="btn btn-outline !px-2.5 !py-1 !text-xs whitespace-nowrap shrink-0"
                                        >
                                          Cancel
                                        </button>
                                      </>
                                    ) : (
                                      <>
                                        <button
                                          type="button"
                                          onClick={() => startEditingDept(dept)}
                                          className="btn btn-outline !px-2.5 !py-1 !text-xs whitespace-nowrap shrink-0"
                                          data-testid={`button-edit-dept-${dept.id}`}
                                        >
                                          <Edit3 size={13} /> Edit
                                        </button>
                                        {dept.active ? (
                                          <button
                                            type="button"
                                            onClick={() => setConfirmDeactivateDeptId(dept.id)}
                                            className="btn btn-outline !px-2.5 !py-1 !text-xs text-rose-700 hover:bg-rose-50 whitespace-nowrap shrink-0"
                                            data-testid={`button-deactivate-dept-${dept.id}`}
                                          >
                                            <Power size={13} /> Deactivate
                                          </button>
                                        ) : (
                                          <button
                                            type="button"
                                            disabled={updateDepartmentMutation.isPending}
                                            onClick={() =>
                                              updateDepartmentMutation.mutate({
                                                departmentId: dept.id,
                                                data: { active: true },
                                              })
                                            }
                                            className="btn btn-outline !px-2.5 !py-1 !text-xs text-emerald-700 hover:bg-emerald-50 whitespace-nowrap shrink-0"
                                            data-testid={`button-reactivate-dept-${dept.id}`}
                                          >
                                            <RotateCcw size={13} /> Reactivate
                                          </button>
                                        )}
                                      </>
                                    )}
                                  </div>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: REFERENCE DATA */}
          {activeTab === 'reference' && (
            <AdminReferenceTab isSuperAdmin={isSuperAdmin} departments={departments} />
          )}

          {/* TAB 4: LECTURERS */}
          {activeTab === 'lecturers' && (
            <AdminLecturersTab departments={departments} requireReauth={requireReauth} />
          )}

          {/* TAB 5: IDENTITY DISPUTES & SUPPORT */}
          {activeTab === 'disputes' && <AdminDisputesTab requireReauth={requireReauth} />}

          {/* TAB 6: ATTENDANCE INTEGRITY */}
          {activeTab === 'integrity' && <AdminIntegrityTab />}

          {/* TAB 7: AGGREGATE REPORTS */}
          {activeTab === 'reports' && <AdminReportsTab requireReauth={requireReauth} />}

          {/* TAB 8: SETTINGS & POLICY */}
          {activeTab === 'settings' && (
            <AdminSettingsTab isSuperAdmin={isSuperAdmin} requireReauth={requireReauth} />
          )}

          {/* TAB 9: SECURITY, 2PA & APPEND-ONLY AUDIT LOG */}
          {activeTab === 'security' && (
            <AdminSecurityTab isSuperAdmin={isSuperAdmin} requireReauth={requireReauth} />
          )}

          {/* TAB 10: SERVER SYSTEM LOGS */}
          {activeTab === 'logs' && (
            <div className="surface overflow-hidden" data-testid="section-admin-logs">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b px-6 py-4">
                <div>
                  <h2 className="font-serif text-lg font-bold flex items-center gap-2">
                    <Terminal size={18} className="text-primary" /> Server Activity &amp; Error Logs
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    Real-time server logs including failed login attempts, 2FA events, and API errors.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    className="field !py-1.5 !text-xs w-36"
                    value={logLevelFilter}
                    onChange={(e) => setLogLevelFilter(e.target.value as typeof logLevelFilter)}
                  >
                    <option value="all">All levels</option>
                    <option value="auth">Auth &amp; Security</option>
                    <option value="warn">Warnings</option>
                    <option value="error">Errors</option>
                    <option value="info">Info</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => systemLogsQuery.refetch()}
                    className="btn btn-outline !px-3 !py-1.5 !text-xs whitespace-nowrap shrink-0"
                  >
                    <RefreshCw size={13} /> Refresh
                  </button>
                </div>
              </div>
              <div className="divide-y font-mono text-xs">
                {systemLogs.map((log: any) => (
                  <div key={log.id} className="p-4 sm:p-5 hover:bg-muted/20 transition">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span
                          className={`uppercase font-bold ${
                            log.level === 'error'
                              ? 'text-rose-700'
                              : log.level === 'warn'
                                ? 'text-amber-700'
                                : log.level === 'auth'
                                  ? 'text-primary'
                                  : 'text-muted-foreground'
                          }`}
                        >
                          [{log.level}]
                        </span>
                        <span className="text-muted-foreground">{log.category}</span>
                      </div>
                      <time className="text-[11px] text-muted-foreground tabular-nums">
                        {new Date(log.timestamp).toLocaleString()}
                      </time>
                    </div>
                    <div className="mt-1.5 font-sans text-xs font-semibold text-foreground">{log.message}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </main>
      </div>

      <AdminReauthModal request={pendingReauth} onClose={closeReauth} />
    </div>
  );
}
