import { createContext, useContext, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Route, Switch, Redirect, Link, useLocation, Router as WouterRouter } from 'wouter';
import { QRCodeSVG } from 'qrcode.react';
import {
  Activity, Archive, ArchiveRestore, ArrowLeft, ArrowRight, ArrowUpRight, BarChart3, Bell, BookOpen,
  CalendarDays, Check, CheckCircle2, Clock3, Copy, Download, Edit3, ExternalLink, Eye, EyeOff, FileSpreadsheet, FileText,
  GraduationCap, KeyRound, LayoutDashboard, LoaderCircle, LogOut, Maximize2, Menu, Minimize2, Moon, Pin, PinOff, Plus, Printer, QrCode, Radio,
  RotateCcw, Search, Settings, ShieldCheck, Smartphone, Sun, Trash2, UserCheck, UserPlus, Users, X,
  AlertTriangle, ClipboardList, RefreshCw,
} from 'lucide-react';
import {
  getGetAttendanceOverviewQueryKey, getGetClassQueryKey,
  getGetClassRosterQueryKey, getGetReviewQueueQueryKey,
  getGetSessionCodeQueryKey, getGetSessionQueryKey, getListClassesQueryKey,
  getListClassSessionsQueryKey, useCloseSession, useCreateClass,
  useCreateManualMark, useCreateSession, useDecideAttendanceRecord, useFinalizeSession,
  useGetAttendanceActivity, useGetAttendanceOverview, useGetClass,
  useGetClassRoster, useGetReviewQueue, useGetSession, useGetSessionCode, useListClasses,
  useListClassSessions, useUpdateClass,
} from '@workspace/api-client-react';
import type { AttendanceRecord, ClassItem, SessionInput } from '@workspace/api-client-react';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useToast } from '@/hooks/use-toast';
import {
  claimAdminPassword, confirmLecturerPasswordReset, downloadApiFile, fetchAuthStatus, lecturerKeys, loginUnified, logoutUnified,
  requestLecturerPasswordReset, useAllClasses, useAllSessions, useBulkDecideRecords, useCopyClass, useExtendSession,
  useLearnedAcademic, useLearnedCourses, useLearnedDepartments, useLearnedLocations,
  useLearnedProgrammeRecords, useLecturerNotifications, useLecturerProfile, useOpenSession, useRegisterLecturer,
  useReopenSession, useSessionActivity, useSubmitReferenceRequest, verifyTwoFactor,
} from '@/lib/lecturerApi';
import { getStudentPhotoUrl } from '@/lib/studentPhotos';
import { exportClassRosterPdf, exportSessionSheetPdf } from '@/lib/reportPdf';
import { LocationPinPicker, type LocationPinValue } from '@/components/lecturer/LocationPinPicker';
import { RemoveStudentModal, RosterImportModal, SingleStudentModal } from '@/components/lecturer/RosterTools';
import { IdentityCheckTab } from '@/components/lecturer/IdentityCheckTab';
import { SessionsPageContent } from '@/components/lecturer/SessionsPage';
import { SettingsPageContent } from '@/components/lecturer/SettingsPage';
import { ReportCardEnhanced, ReportsControls } from '@/components/lecturer/ReportsSection';
import { ReviewQueuePanel } from '@/components/lecturer/ReviewQueuePanel';
import { SessionActivityTimeline } from '@/components/lecturer/SessionActivityTimeline';
import { SessionProgressChart } from '@/components/lecturer/SessionProgressChart';
import { StudentCheckinPage } from '@/components/student/StudentCheckinPage';
import { AdminLoginPage } from '@/components/admin/AdminLoginPage';
import {
  AdminAuthProvider,
  AdminGuard,
  AdminPortal,
  setMemoryAuthToken,
  useAdminAuth,
} from '@/components/admin/AdminPortal';
import NotFound from '@/pages/not-found';
import './index.css';

const queryClient = new QueryClient();
const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');

interface MockUser {
  id: string;
  fullName: string;
  firstName: string;
  primaryEmailAddress: { emailAddress: string };
}

interface MockAuthValue {
  isSignedIn: boolean;
  user: MockUser;
  setUser: (user: MockUser) => void;
  signOut: () => void;
  signIn: () => void;
}

const defaultUser: MockUser = {
  id: 'user_mock_lecturer',
  fullName: 'Dr. Kwesi Mensah',
  firstName: 'Kwesi',
  primaryEmailAddress: { emailAddress: 'mensah@school.edu.gh' },
};

const MockAuthContext = createContext<MockAuthValue>({
  isSignedIn: true,
  user: defaultUser,
  setUser: () => {},
  signOut: () => {},
  signIn: () => {},
});

export function useUser() {
  return useContext(MockAuthContext);
}

export function useClerk() {
  const ctx = useContext(MockAuthContext);
  return {
    signOut: ctx.signOut,
    addListener: () => () => {},
  };
}

export function Show({ when, children }: { when: 'signed-in' | 'signed-out'; children: ReactNode }) {
  const { isSignedIn } = useUser();
  if (when === 'signed-in' && isSignedIn) return <>{children}</>;
  if (when === 'signed-out' && !isSignedIn) return <>{children}</>;
  return null;
}

function SignInPage() {
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const { signIn, setUser } = useUser();
  const { adminSignIn } = useAdminAuth();

  const [accountType, setAccountType] = useState<'lecturer' | 'admin'>('lecturer');
  const [email, setEmail] = useState('mensah@school.edu.gh');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState('');
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [previewCodeHint, setPreviewCodeHint] = useState('');
  const [resetMode, setResetMode] = useState<'request' | 'confirm' | null>(null);
  const [resetCode, setResetCode] = useState('');
  const [resetNewPassword, setResetNewPassword] = useState('');
  const [resetHint, setResetHint] = useState('');
  const [resetSuccessMsg, setResetSuccessMsg] = useState('');

  const authStatusQuery = useQuery({
    queryKey: ['auth-status'],
    queryFn: fetchAuthStatus,
  });

  const authStatus = authStatusQuery.data;
  const normalizedEmail = email.trim().toLowerCase();
  const looksLikeAdminEmail =
    normalizedEmail === 'admin@school.edu.gh' ||
    normalizedEmail === 'dept.admin@school.edu.gh' ||
    (Boolean(authStatus?.claimedAdminEmail) &&
      authStatus?.claimedAdminEmail?.toLowerCase() === normalizedEmail);
  const effectiveType: 'lecturer' | 'admin' = looksLikeAdminEmail ? 'admin' : accountType;
  const needsAdminSetup =
    effectiveType === 'admin' && Boolean(authStatus && !authStatus.adminPasswordConfigured);
  const previewDemoAvailable = Boolean(authStatus?.previewDemoAvailable);

  const handleAuthSuccess = (res: Awaited<ReturnType<typeof loginUnified>>) => {
    if ('challengeId' in res) {
      setChallengeId(res.challengeId);
      setPreviewCodeHint(res.previewTwoFactorCode ?? '');
      setTwoFactorCode(res.previewTwoFactorCode ?? '');
      setFormError('');
      return;
    }

    qc.invalidateQueries({ queryKey: ['auth-status'] });
    if (res.accountType === 'admin') {
      const role = res.user.role === 'department_admin' ? 'department_admin' : 'super_admin';
      adminSignIn(
        {
          id: res.user.id,
          fullName: res.user.fullName,
          email: res.user.email,
          role,
          departments: res.user.departments,
        },
        res.token,
        res.sessionTimeoutMinutes,
      );
      setLocation('/admin/dashboard');
      return;
    }

    setMemoryAuthToken(res.token);
    setUser({
      id: res.user.id,
      fullName: res.user.fullName,
      firstName: res.user.fullName.split(/\s+/)[0] || 'Lecturer',
      primaryEmailAddress: { emailAddress: res.user.email },
    });
    signIn();
    qc.invalidateQueries({ queryKey: lecturerKeys.profile });
    setLocation('/app');
  };

  const loginMutation = useMutation({
    mutationFn: loginUnified,
    onSuccess: handleAuthSuccess,
    onError: (err) => {
      setFormError(err instanceof Error ? err.message : 'Unable to sign in.');
    },
  });

  const verifyMutation = useMutation({
    mutationFn: verifyTwoFactor,
    onSuccess: handleAuthSuccess,
    onError: (err) => {
      setFormError(err instanceof Error ? err.message : 'Invalid verification code.');
    },
  });

  const claimMutation = useMutation({
    mutationFn: claimAdminPassword,
    onSuccess: handleAuthSuccess,
    onError: (err) => {
      setFormError(err instanceof Error ? err.message : 'Unable to configure admin password.');
    },
  });

  const resetRequestMutation = useMutation({
    mutationFn: requestLecturerPasswordReset,
    onSuccess: (res) => {
      setFormError('');
      setResetHint(res.previewResetCode ?? '');
      if (res.previewResetCode) {
        setResetCode(res.previewResetCode);
      }
      setResetMode('confirm');
    },
    onError: (err) => {
      setFormError(err instanceof Error ? err.message : 'Unable to send password reset code.');
    },
  });

  const resetConfirmMutation = useMutation({
    mutationFn: confirmLecturerPasswordReset,
    onSuccess: () => {
      setFormError('');
      setPassword(resetNewPassword);
      setResetSuccessMsg('Password updated. Sign in with your new password below.');
      setResetMode(null);
      setResetCode('');
      setResetNewPassword('');
      setResetHint('');
    },
    onError: (err) => {
      setFormError(err instanceof Error ? err.message : 'Could not verify reset code.');
    },
  });

  const isBusy =
    loginMutation.isPending ||
    claimMutation.isPending ||
    verifyMutation.isPending ||
    resetRequestMutation.isPending ||
    resetConfirmMutation.isPending;

  const switchRole = (role: 'lecturer' | 'admin') => {
    setFormError('');
    setPassword('');
    setChallengeId(null);
    setTwoFactorCode('');
    setResetMode(null);
    setResetCode('');
    setResetNewPassword('');
    setResetHint('');
    setResetSuccessMsg('');
    setAccountType(role);
    if (role === 'admin') {
      if (!looksLikeAdminEmail) {
        setEmail(authStatus?.claimedAdminEmail || 'admin@school.edu.gh');
      }
    } else if (looksLikeAdminEmail) {
      setEmail('mensah@school.edu.gh');
    }
  };

  const handleSignIn = (e: FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (challengeId) {
      if (!twoFactorCode.trim()) {
        setFormError('Enter your 6-digit verification code.');
        return;
      }
      verifyMutation.mutate({ challengeId, code: twoFactorCode.trim() });
      return;
    }

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setFormError('Enter your institutional email.');
      return;
    }

    if (needsAdminSetup) {
      if (password.length < 6) {
        setFormError('Create an admin password (6+ characters), or use Super Admin Demo below.');
        return;
      }
      claimMutation.mutate({ email: trimmedEmail, password });
      return;
    }

    if (effectiveType === 'admin' && !password) {
      setFormError('Enter your administrator password.');
      return;
    }

    loginMutation.mutate({
      email: trimmedEmail,
      password: password || undefined,
      accountType: effectiveType,
    });
  };

  return (
    <AuthFrame>
      <div className="w-full max-w-md rounded-2xl border bg-card p-7 shadow-sm sm:p-8">
        <div className="eyebrow">Institutional Sign In</div>
        <h2 className="mt-1 font-serif text-xl font-bold">
          {challengeId ? 'Two-factor verification' : 'Welcome back'}
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          {challengeId
            ? 'Enter the 6-digit verification code for your administrator account.'
            : 'Use your institutional email to sign in to the Lecturer Workspace or Admin Portal.'}
        </p>

        {!challengeId && (
          <div className="mt-4 grid grid-cols-2 gap-1.5 rounded-xl bg-muted/60 p-1">
            <button
              type="button"
              onClick={() => switchRole('lecturer')}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition cursor-pointer ${
                effectiveType === 'lecturer'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              data-testid="button-role-lecturer"
            >
              Lecturer
            </button>
            <button
              type="button"
              onClick={() => switchRole('admin')}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition cursor-pointer ${
                effectiveType === 'admin'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              data-testid="button-role-admin"
            >
              Administrator
            </button>
          </div>
        )}

        {!challengeId && needsAdminSetup && (
          <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-900 dark:text-emerald-200">
            <KeyRound size={15} className="mt-0.5 shrink-0 text-emerald-700 dark:text-emerald-400" />
            <div>
              <strong className="block font-semibold">First-run Admin setup</strong>
              <span>Choose a password (6+ chars) to claim admin access, or click Demo below.</span>
            </div>
          </div>
        )}

        {resetSuccessMsg && (
          <div className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-900 dark:text-emerald-200">
            {resetSuccessMsg}
          </div>
        )}

        {formError && <div className="mt-4"><InlineError text={formError} /></div>}

        {!challengeId && effectiveType === 'lecturer' && resetMode ? (
          <div className="mt-5 space-y-4">
            <div className="rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground">
              {resetMode === 'request'
                ? 'Enter your institutional lecturer email to generate a 6-digit password reset code.'
                : 'Enter the 6-digit reset code and choose a new password (6+ characters).'}
              {resetHint && (
                <span className="mt-1.5 block font-mono text-[11px] font-semibold text-primary">
                  Preview reset code: {resetHint}
                </span>
              )}
            </div>

            {resetMode === 'request' ? (
              <>
                <label className="block text-xs font-semibold">
                  Institutional email
                  <input
                    className="field mt-1.5"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="mensah@school.edu.gh"
                    required
                    data-testid="input-reset-email"
                  />
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setResetMode(null);
                      setFormError('');
                    }}
                    className="btn btn-outline flex-1"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    disabled={isBusy || !email.trim()}
                    onClick={() => {
                      setFormError('');
                      resetRequestMutation.mutate(email.trim());
                    }}
                    className="btn btn-primary flex-1"
                    data-testid="button-send-reset-code"
                  >
                    {resetRequestMutation.isPending ? <LoaderCircle size={15} className="animate-spin" /> : null}
                    Send reset code
                  </button>
                </div>
              </>
            ) : (
              <>
                <label className="block text-xs font-semibold">
                  6-digit reset code
                  <input
                    className="field mt-1.5 font-mono text-center tracking-widest"
                    value={resetCode}
                    onChange={(e) => setResetCode(e.target.value)}
                    maxLength={6}
                    placeholder="123456"
                    data-testid="input-reset-code"
                  />
                </label>
                <label className="block text-xs font-semibold">
                  New password (6+ characters)
                  <input
                    className="field mt-1.5"
                    type="password"
                    value={resetNewPassword}
                    onChange={(e) => setResetNewPassword(e.target.value)}
                    placeholder="Enter new password"
                    data-testid="input-reset-new-password"
                  />
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setResetMode(null);
                      setFormError('');
                    }}
                    className="btn btn-outline flex-1"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={isBusy || !resetCode.trim() || resetNewPassword.length < 6}
                    onClick={() => {
                      setFormError('');
                      resetConfirmMutation.mutate({
                        email: email.trim(),
                        code: resetCode.trim(),
                        newPassword: resetNewPassword,
                      });
                    }}
                    className="btn btn-primary flex-1"
                    data-testid="button-confirm-reset-password"
                  >
                    {resetConfirmMutation.isPending ? <LoaderCircle size={15} className="animate-spin" /> : null}
                    Update password
                  </button>
                </div>
              </>
            )}
          </div>
        ) : (
        <form onSubmit={handleSignIn} className="mt-5 space-y-4">
          {challengeId ? (
            <>
              <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs text-foreground">
                A verification challenge was issued for <strong>{email}</strong>.
                {previewCodeHint && (
                  <span className="mt-1 block font-mono text-[11px] text-primary">
                    Preview verification code: {previewCodeHint}
                  </span>
                )}
              </div>
              <label className="block text-xs font-semibold">
                6-digit verification code
                <input
                  className="field mt-1.5 font-mono text-center tracking-widest"
                  value={twoFactorCode}
                  onChange={(e) => setTwoFactorCode(e.target.value)}
                  placeholder="123456"
                  maxLength={6}
                  required
                  data-testid="input-signin-2fa"
                />
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setChallengeId(null);
                    setTwoFactorCode('');
                    setFormError('');
                  }}
                  className="btn btn-outline flex-1"
                >
                  Back
                </button>
                <button
                  type="submit"
                  disabled={isBusy}
                  className="btn btn-primary flex-1"
                  data-testid="button-verify-2fa-submit"
                >
                  {isBusy ? <LoaderCircle size={15} className="animate-spin" /> : null}
                  Verify & Sign in
                </button>
              </div>
            </>
          ) : (
            <>
              <label className="block text-xs font-semibold">
                Institutional email
                <input
                  className="field mt-1.5"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={effectiveType === 'admin' ? 'admin@school.edu.gh' : 'mensah@school.edu.gh'}
                  required
                  data-testid="input-signin-email"
                />
              </label>
              <div className="block text-xs font-semibold">
                <div className="flex items-center justify-between gap-2">
                  <span>
                    {needsAdminSetup
                      ? 'Create admin password (6+ chars)'
                      : effectiveType === 'admin'
                        ? 'Administrator password'
                        : 'Password (optional for demo lecturer)'}
                  </span>
                  {effectiveType === 'lecturer' && (
                    <button
                      type="button"
                      onClick={() => {
                        setFormError('');
                        setResetSuccessMsg('');
                        setResetMode('request');
                      }}
                      className="text-[11px] font-semibold text-primary hover:underline cursor-pointer"
                      data-testid="button-forgot-password"
                    >
                      Forgot / reset password?
                    </button>
                  )}
                </div>
                <div className="relative mt-1.5">
                  <input
                    className="field pr-10"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={
                      needsAdminSetup
                        ? 'Choose password (6+ characters)'
                        : effectiveType === 'lecturer'
                          ? 'Enter password or leave blank for demo'
                          : 'Enter your password'
                    }
                    required={effectiveType === 'admin' && !needsAdminSetup}
                    data-testid="input-signin-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>
              <button
                type="submit"
                disabled={isBusy}
                className="btn btn-primary w-full"
                data-testid="button-sign-in-submit"
              >
                {isBusy ? <LoaderCircle size={15} className="animate-spin" /> : null}
                {needsAdminSetup
                  ? 'Set Password & Open Admin Portal'
                  : effectiveType === 'admin'
                    ? 'Sign in to Admin Portal'
                    : 'Sign in'}
                <ArrowRight size={15} />
              </button>
            </>
          )}
        </form>
        )}

        {!challengeId && (
          <div className="mt-4 border-t pt-4 space-y-2.5">
            <button
              type="button"
              disabled={isBusy}
              className="btn btn-outline w-full"
              onClick={() => {
                setFormError('');
                loginMutation.mutate({
                  email: 'mensah@school.edu.gh',
                  accountType: 'lecturer',
                  demo: true,
                });
              }}
              data-testid="button-mock-sign-in"
            >
              Continue as Dr. Kwesi Mensah (Lecturer) <ArrowRight size={15} />
            </button>

            {previewDemoAvailable && (
              <button
                type="button"
                disabled={isBusy}
                className="btn btn-outline w-full"
                onClick={() => {
                  setFormError('');
                  loginMutation.mutate({
                    email: 'admin@school.edu.gh',
                    accountType: 'admin',
                    demo: true,
                  });
                }}
                data-testid="button-mock-admin-from-signin"
              >
                Continue as Super Admin (Demo) <ArrowRight size={15} />
              </button>
            )}

            <p className="pt-1 text-center text-xs text-muted-foreground">
              New lecturer?{' '}
              <Link href="/sign-up" className="font-semibold text-primary underline">
                Create your account
              </Link>
            </p>
          </div>
        )}
      </div>
    </AuthFrame>
  );
}

function SignUpPage() {
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const { signIn, setUser } = useUser();
  const learnedDepts = useLearnedDepartments();
  const register = useRegisterLecturer();

  const [staffId, setStaffId] = useState('');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [selectedDepartments, setSelectedDepartments] = useState<string[]>([]);
  const [formError, setFormError] = useState('');

  const availableDepartments = learnedDepts.data ?? [];

  useEffect(() => {
    if (selectedDepartments.length === 0 && availableDepartments.length > 0) {
      setSelectedDepartments([availableDepartments[0]]);
    }
  }, [availableDepartments, selectedDepartments.length]);

  const toggleDepartment = (dept: string) => {
    setSelectedDepartments((prev) =>
      prev.includes(dept) ? prev.filter((item) => item !== dept) : [...prev, dept],
    );
  };

  const handleRegister = (e: FormEvent) => {
    e.preventDefault();
    setFormError('');
    if (selectedDepartments.length === 0) {
      setFormError('Select at least one active department from the institutional list.');
      return;
    }

    if (password.trim().length > 0 && password.trim().length < 6) {
      setFormError('Password must be at least 6 characters (or leave blank).');
      return;
    }

    register.mutate(
      {
        staffId: staffId.trim(),
        fullName: fullName.trim(),
        email: email.trim(),
        phone: phone.trim(),
        departments: selectedDepartments,
        ...(password.trim() ? { password: password.trim() } : {}),
      },
      {
        onSuccess: (created) => {
          qc.invalidateQueries({ queryKey: lecturerKeys.profile });
          qc.invalidateQueries({ queryKey: lecturerKeys.lists('departments') });
          setUser({
            id: created.userId,
            fullName: created.fullName,
            firstName: created.fullName.split(/\s+/)[0] || 'Lecturer',
            primaryEmailAddress: { emailAddress: created.email },
          });
          signIn();
          setLocation('/app');
        },
        onError: (err) => {
          setFormError(err instanceof Error ? err.message : 'Could not create lecturer account.');
        },
      },
    );
  };

  return (
    <AuthFrame>
      <div className="w-full max-w-lg rounded-2xl border bg-card p-6 shadow-sm sm:p-8">
        <div className="eyebrow">Lecturer onboarding</div>
        <h2 className="mt-1 font-serif text-xl font-bold">Create your lecturer account</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Access is instant. Your institution admin reviews lecturer accounts later.
        </p>

        <form onSubmit={handleRegister} className="mt-5 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs font-semibold">
              Staff ID
              <input
                className="field mt-1.5 font-mono"
                value={staffId}
                onChange={(e) => setStaffId(e.target.value)}
                placeholder="TTU-0412"
                required
                data-testid="input-register-staff-id"
              />
            </label>
            <label className="block text-xs font-semibold">
              Phone number
              <input
                className="field mt-1.5"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+233 24 555 0198"
                required
                data-testid="input-register-phone"
              />
            </label>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs font-semibold">
              Full name
              <input
                className="field mt-1.5"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Dr. Kwesi Mensah"
                required
                data-testid="input-register-fullname"
              />
            </label>
            <label className="block text-xs font-semibold">
              Institutional email
              <input
                className="field mt-1.5"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="mensah@school.edu.gh"
                required
                data-testid="input-register-email"
              />
            </label>
          </div>
          <div>
            <span className="block text-xs font-semibold">Departments (admin-managed active list)</span>
            {learnedDepts.isLoading ? (
              <div className="mt-2 h-8 animate-pulse rounded bg-muted" />
            ) : (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {availableDepartments.map((dept) => {
                  const selected = selectedDepartments.includes(dept);
                  return (
                    <button
                      key={dept}
                      type="button"
                      onClick={() => toggleDepartment(dept)}
                      className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition cursor-pointer ${
                        selected
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'bg-background text-muted-foreground hover:text-foreground'
                      }`}
                      data-testid={`button-dept-${dept.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
                    >
                      {dept}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <label className="block text-xs font-semibold">
            Password (optional, 6+ characters)
            <input
              className="field mt-1.5"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Set a sign-in password"
              data-testid="input-register-password"
            />
          </label>

          {formError && <InlineError text={formError} />}

          <button
            type="submit"
            disabled={register.isPending}
            className="btn btn-primary w-full"
            data-testid="button-register-submit"
          >
            {register.isPending ? <LoaderCircle size={15} className="animate-spin" /> : null}
            Create account and start <ArrowRight size={15} />
          </button>
        </form>

        <div className="mt-4 border-t pt-4">
          <button
            type="button"
            className="btn btn-outline w-full"
            onClick={() => {
              setUser(defaultUser);
              signIn();
              setLocation('/app');
            }}
            data-testid="button-mock-sign-up"
          >
            Continue with demo account <ArrowRight size={15} />
          </button>
          <p className="mt-4 text-center text-xs text-muted-foreground">
            Already registered?{' '}
            <Link href="/sign-in" className="font-semibold text-primary underline">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </AuthFrame>
  );
}

function AuthFrame({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-[100dvh] bg-background flex flex-col items-center justify-center px-4 py-12">
      <Link href="/" className="mb-7 flex items-center gap-2 text-sm font-bold">
        <Mark /> Attendance desk
      </Link>
      {children}
      <p className="mt-7 text-xs text-muted-foreground">A clear record for every lecture.</p>
    </div>
  );
}

function Mark({ light = false }: { light?: boolean }) {
  return (
    <span className={`grid h-9 w-9 place-items-center rounded-xl ${light ? 'bg-accent text-sidebar' : 'bg-primary text-primary-foreground'}`}>
      <GraduationCap size={19} strokeWidth={2.1} />
    </span>
  );
}

function Home() {
  return (
    <main className="min-h-[100dvh] overflow-hidden bg-background">
      <header className="mx-auto flex max-w-7xl items-center justify-between px-5 py-5 lg:px-10">
        <Link href="/" className="flex items-center gap-3">
          <Mark />
          <span className="font-bold tracking-tight">Attendance desk</span>
        </Link>
        <div className="flex items-center gap-2">
          <Link href="/admin/login" className="btn btn-outline !text-xs" data-testid="link-admin-login">Admin Portal</Link>
          <Link href="/sign-in" className="btn btn-outline" data-testid="link-sign-in">Sign in</Link>
          <Link href="/sign-up" className="btn btn-primary" data-testid="link-sign-up">Create account <ArrowRight size={15} /></Link>
        </div>
      </header>
      <section className="mx-auto grid max-w-7xl items-center gap-12 px-5 pb-20 pt-10 lg:grid-cols-[1.08fr_.92fr] lg:px-10 lg:pb-28 lg:pt-20">
        <div className="rise-in">
          <div className="eyebrow mb-5 flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-primary" /> Built for Ghana's lecture day
          </div>
          <h1 className="max-w-3xl font-serif text-5xl font-extrabold leading-[1.03] tracking-[-.055em] sm:text-6xl lg:text-[76px]">
            Attendance, with a clear record.
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-8 text-muted-foreground">
            A focused workspace for lecturers to run class, resolve uncertain marks and understand who may need a check-in.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/sign-up" className="btn btn-primary px-5 py-3" data-testid="link-get-started">Get started <ArrowRight size={16} /></Link>
            <Link href="/sign-in" className="btn btn-outline px-5 py-3" data-testid="link-home-sign-in">I already have an account</Link>
          </div>
          <div className="mt-9 flex items-center gap-4 text-xs text-muted-foreground">
            <ShieldCheck size={17} className="text-primary" /> Clear decisions. Accountable records. Lecturer-led review.
          </div>
        </div>
        <div className="relative rise-in stagger-1">
          <div className="absolute -right-16 -top-16 h-72 w-72 rounded-full bg-accent/30 blur-3xl" />
          <div className="relative rotate-[1deg] rounded-[2rem] border border-border bg-card p-3 shadow-xl shadow-slate-900/5">
            <div className="rounded-[1.4rem] bg-[#263a43] p-6 text-white sm:p-8">
              <div className="flex items-start justify-between">
                <div>
                  <div className="eyebrow !text-white/60">EXAMPLE SESSION · ILLUSTRATIVE</div>
                  <h2 className="mt-3 text-2xl font-bold">CS 305 · Computer Networks</h2>
                  <p className="mt-1 text-sm text-white/65">Lecture Theatre 2 · 10:00 am</p>
                </div>
                <span className="rounded-full bg-emerald-300/15 px-3 py-1 text-xs font-semibold text-emerald-200">Open</span>
              </div>
              <div className="mt-8 grid grid-cols-3 gap-3">
                <MiniMetric label="Checked in" value="62" />
                <MiniMetric label="On roster" value="96" />
                <MiniMetric label="Needs review" value="3" />
              </div>
              <div className="mt-7 rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="flex justify-between text-sm">
                  <span className="font-semibold">Attendance progress</span>
                  <span className="font-mono text-amber-200">65%</span>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
                  <div className="h-full w-[65%] rounded-full bg-[#e7bd62]" />
                </div>
                <div className="mt-4 flex items-center gap-2 text-xs text-white/60">
                  <Clock3 size={13} /> Live roster updates as marks arrive
                </div>
              </div>
              <div className="mt-4 divide-y divide-white/10">
                {[['Ama Boateng', '5231001', 'Present'], ['Yaw Darko', '5231003', 'Needs review']].map(([n, i, s]) => (
                  <div className="flex items-center justify-between py-3" key={i}>
                    <div>
                      <div className="text-sm font-semibold">{n}</div>
                      <div className="mt-1 font-mono text-[10px] text-white/45">{i}</div>
                    </div>
                    <span className={`text-xs font-semibold ${s === 'Present' ? 'text-emerald-200' : 'text-amber-200'}`}>{s}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="absolute -bottom-6 -left-5 flex items-center gap-3 rounded-xl border bg-card px-4 py-3 shadow-lg">
            <div className="grid h-9 w-9 place-items-center rounded-lg bg-accent/30 text-foreground"><Check size={18} /></div>
            <div>
              <div className="text-sm font-bold">Every mark has context</div>
              <div className="text-xs text-muted-foreground">Review before finalising</div>
            </div>
          </div>
        </div>
      </section>
      <section className="border-y border-border/70 bg-[#f2f0e9]">
        <div className="mx-auto grid max-w-7xl gap-8 px-5 py-12 sm:grid-cols-3 lg:px-10">
          {[
            ['01', 'Run the room', 'Open a session, display a rotating QR & typed code, and keep a clear class record.'],
            ['02', 'Resolve uncertainty', 'Review flagged marks and record manual decisions with a mandatory reason.'],
            ['03', 'Know where to look', 'Spot attendance patterns and students below your 75% class threshold.'],
          ].map(([n, t, d]) => (
            <div className="flex gap-4" key={n}>
              <span className="font-mono text-sm text-primary">{n}</span>
              <div>
                <h3 className="font-bold">{t}</h3>
                <p className="mt-2 max-w-xs text-sm leading-6 text-muted-foreground">{d}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
      <footer className="mx-auto flex max-w-7xl flex-col justify-between gap-3 px-5 py-7 text-xs text-muted-foreground sm:flex-row lg:px-10">
        <span>Attendance desk · Lecturer pilot · Example data is illustrative, not live.</span>
        <span>Lecturer-led verification and review.</span>
      </footer>
    </main>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-3">
      <div className="font-mono text-2xl font-bold">{value}</div>
      <div className="mt-1 text-[10px] text-white/55">{label}</div>
    </div>
  );
}

const navItems = [
  { href: '/app', title: 'Overview', icon: LayoutDashboard },
  { href: '/classes', title: 'Classes', icon: BookOpen },
  { href: '/sessions', title: 'Sessions', icon: Radio },
  { href: '/reports', title: 'Reports', icon: BarChart3 },
  { href: '/settings', title: 'Settings', icon: Settings },
];

export function Shell({ children, title }: { children: ReactNode; title: string }) {
  const [location, setLocation] = useLocation();
  const [open, setOpen] = useState(false);
  const { user } = useUser();
  const { signOut } = useClerk();
  const profile = useLecturerProfile();
  const displayName = profile.data?.fullName || user?.fullName || user?.primaryEmailAddress?.emailAddress || 'Lecturer';

  return (
    <div className="min-h-[100dvh] bg-background">
      <aside className={`fixed inset-y-0 left-0 z-40 flex w-[248px] flex-col bg-sidebar px-4 py-5 text-sidebar-foreground transition-transform md:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'}`}>
        <Link href="/app" className="flex items-center gap-3 px-2">
          <Mark light />
          <span>
            <strong className="block text-sm tracking-tight">Attendance desk</strong>
            <span className="text-[10px] text-white/45">LECTURER WORKSPACE</span>
          </span>
        </Link>
        <div className="eyebrow mt-10 px-3 !text-white/40">Workspace</div>
        <nav className="mt-3 space-y-1">
          {navItems.map(({ href, title: label, icon: Icon }) => {
            const active =
              location === href ||
              (href === '/classes' && location.startsWith('/classes/')) ||
              (href === '/sessions' && location.startsWith('/sessions/'));
            return (
              <Link
                key={href}
                href={href}
                data-testid={`nav-${label.toLowerCase()}`}
                onClick={() => setOpen(false)}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                  active
                    ? 'bg-sidebar-accent text-white'
                    : 'text-white/65 hover:bg-white/5 hover:text-white'
                }`}
              >
                <Icon size={17} />
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="flex items-center gap-2 text-xs font-semibold">
            <ShieldCheck size={15} className="text-accent" /> Pilot boundaries
          </div>
          <p className="mt-2 text-[11px] leading-5 text-white/55">
            Lecturer-reviewed attendance with audit trail and 45s rotating codes.
          </p>
        </div>
        <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-4">
          <div className="min-w-0">
            <div className="truncate text-xs font-semibold">{displayName}</div>
            <div className="mt-1 font-mono text-[10px] text-white/45">{profile.data?.staffId ?? 'Lecturer account'}</div>
          </div>
          <button
            className="rounded-lg p-2 text-white/55 hover:bg-white/10 hover:text-white cursor-pointer"
            aria-label="Sign out"
            data-testid="button-sign-out"
            onClick={() => {
              void logoutUnified();
              setMemoryAuthToken(null);
              signOut();
              setLocation('/');
            }}
          >
            <LogOut size={16} />
          </button>
        </div>
      </aside>
      {open && <button className="fixed inset-0 z-30 bg-black/30 md:hidden" onClick={() => setOpen(false)} aria-label="Close navigation" />}
      <div className="md:pl-[248px]">
        <header className="sticky top-0 z-20 flex h-[68px] items-center justify-between border-b border-border/80 bg-background/90 px-5 backdrop-blur-md lg:px-9">
          <div className="flex items-center gap-3">
            <button className="rounded-lg p-2 hover:bg-muted md:hidden" onClick={() => setOpen(true)} aria-label="Open navigation" data-testid="button-open-navigation">
              <Menu size={19} />
            </button>
            <span className="text-sm font-semibold">{title}</span>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/settings" className="hidden items-center gap-2 rounded-lg border bg-card px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground sm:flex">
              <span className="h-1.5 w-1.5 rounded-full bg-primary" /> {profile.data?.staffId ?? 'Lecturer workspace'}
            </Link>
            <span className="grid h-8 w-8 place-items-center rounded-full bg-secondary text-xs font-bold">
              {displayName.slice(0, 1).toUpperCase()}
            </span>
          </div>
        </header>
        <main className="mx-auto max-w-[1440px] px-5 py-7 lg:px-9 lg:py-9">{children}</main>
      </div>
    </div>
  );
}

function Guard({ children }: { children: ReactNode }) {
  return (
    <>
      <Show when="signed-in">{children}</Show>
      <Show when="signed-out"><Redirect to="/" /></Show>
    </>
  );
}

function PageHeading({ eyebrow, title, subtitle, action }: { eyebrow: string; title: string; subtitle: string; action?: ReactNode }) {
  return (
    <div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
      <div>
        <div className="eyebrow mb-3">{eyebrow}</div>
        <h1 className="font-serif text-3xl font-extrabold tracking-[-.04em] sm:text-4xl">{title}</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{subtitle}</p>
      </div>
      {action}
    </div>
  );
}

function LoadingBlock({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-3" aria-label="Loading">
      <div className="h-5 w-44 animate-pulse rounded bg-muted" />
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="h-14 animate-pulse rounded-xl bg-muted/70" />
      ))}
    </div>
  );
}

function ErrorState({ retry }: { retry: () => void }) {
  return (
    <div className="surface flex flex-col items-start gap-3 p-6">
      <span className="grid h-10 w-10 place-items-center rounded-xl bg-destructive/10 text-destructive"><AlertTriangle size={19} /></span>
      <div>
        <h3 className="font-bold">We couldn’t load this view</h3>
        <p className="mt-1 text-sm text-muted-foreground">Check your connection, then try again.</p>
      </div>
      <button className="btn btn-outline" onClick={retry} data-testid="button-retry"><RefreshCw size={15} /> Try again</button>
    </div>
  );
}

function EmptyState({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="surface flex flex-col items-center px-5 py-12 text-center">
      <span className="grid h-12 w-12 place-items-center rounded-2xl bg-secondary text-primary"><ClipboardList size={21} /></span>
      <h3 className="mt-4 font-bold">{title}</h3>
      <p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">{body}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

function StatCard({ label, value, note, icon: Icon, accent }: { label: string; value: string | number; note: string; icon: typeof Users; accent?: boolean }) {
  return (
    <div className="surface p-5">
      <div className="flex items-start justify-between">
        <span className="eyebrow">{label}</span>
        <span className={`grid h-9 w-9 place-items-center rounded-xl ${accent ? 'bg-accent/30 text-foreground' : 'bg-secondary text-primary'}`}>
          <Icon size={17} />
        </span>
      </div>
      <div className="mt-4 font-serif text-3xl font-extrabold tracking-tight" data-testid={`value-${label.toLowerCase().replaceAll(' ', '-')}`}>{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{note}</div>
    </div>
  );
}

function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: string }) {
  const cls = tone === 'good'
    ? 'bg-emerald-50 text-emerald-800'
    : tone === 'warn'
      ? 'bg-amber-50 text-amber-800'
      : tone === 'bad'
        ? 'bg-red-50 text-red-800'
        : 'bg-secondary text-muted-foreground';
  return <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ${cls}`}>{children}</span>;
}

function formatDate(value?: string | Date | null) {
  if (!value) return 'No session yet';
  return new Intl.DateTimeFormat('en-GH', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }).format(new Date(value));
}

function StatusBadge({ status }: { status: string }) {
  return <Badge tone={status === 'open' ? 'good' : status === 'finalized' ? 'neutral' : status === 'closed' ? 'warn' : 'neutral'}>{status.replace('_', ' ')}</Badge>;
}

function Dashboard() {
  const overview = useGetAttendanceOverview();
  const activity = useGetAttendanceActivity();
  const notifications = useLecturerNotifications();
  if (overview.isLoading) return <Shell title="Overview"><LoadingBlock /></Shell>;
  if (overview.isError) return <Shell title="Overview"><ErrorState retry={() => overview.refetch()} /></Shell>;
  const data = overview.data;

  return (
    <Shell title="Overview">
      <PageHeading
        eyebrow="Your teaching day"
        title="Good to see you."
        subtitle="A clear view of your classes, active sessions and the marks that need your attention."
        action={<Link href="/classes" className="btn btn-primary" data-testid="button-manage-classes"><BookOpen size={16} /> Manage classes</Link>}
      />
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ['Classes', data?.classCount ?? 0, 'Teaching this semester', BookOpen, false],
          ['Students', data?.rosterCount ?? 0, 'Across your class rosters', Users, false],
          ['Sessions this week', data?.sessionsThisWeek ?? 0, 'Attendance sessions', CalendarDays, false],
          ['Review queue', data?.reviewCount ?? 0, 'Marks awaiting a decision', Activity, true],
        ].map(([l, v, n, I, a]) => (
          <StatCard key={String(l)} label={String(l)} value={v as number} note={String(n)} icon={I as typeof Users} accent={Boolean(a)} />
        ))}
      </section>
      <div className="mt-6 grid gap-5 xl:grid-cols-[1.45fr_.8fr]">
        <section className="surface overflow-hidden">
          <div className="flex items-center justify-between border-b px-5 py-4">
            <div>
              <div className="eyebrow">Live now</div>
              <h2 className="mt-1 font-bold">Active sessions</h2>
            </div>
            <span className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="h-2 w-2 animate-pulse rounded-full bg-primary" /> Updates as marks arrive
            </span>
          </div>
          {data?.activeSessions?.length ? (
            <div className="divide-y">
              {data.activeSessions.map(s => (
                <Link
                  href={`/sessions/${s.id}`}
                  key={s.id}
                  data-testid={`link-session-${s.id}`}
                  className="flex flex-col gap-3 px-5 py-4 transition hover:bg-muted/40 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex items-start gap-3">
                    <span className="mt-1 grid h-9 w-9 place-items-center rounded-xl bg-primary/10 text-primary"><Radio size={17} /></span>
                    <div>
                      <div className="font-semibold">{s.topic}</div>
                      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <span>{s.venue}</span>
                        <span>{formatDate(s.startsAt)}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 pl-12 sm:pl-0">
                    <div className="text-right">
                      <div className="font-mono text-sm font-bold">{s.checkedInCount}<span className="text-muted-foreground"> / {s.rosterCount}</span></div>
                      <div className="text-[10px] text-muted-foreground">checked in</div>
                    </div>
                    {s.reviewCount > 0 && <Badge tone="warn">{s.reviewCount} review</Badge>}
                    <ArrowRight size={15} className="text-muted-foreground" />
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="p-5">
              <EmptyState
                title="No active sessions"
                body="Start a session from a class when you are ready to take attendance."
                action={<Link href="/classes" className="btn btn-primary">Open classes <ArrowRight size={15} /></Link>}
              />
            </div>
          )}
        </section>
        <section className="surface p-5">
          <div className="flex items-center justify-between">
            <div>
              <div className="eyebrow">Attendance pulse</div>
              <h2 className="mt-1 font-bold">Class average</h2>
            </div>
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-accent/30"><BarChart3 size={17} /></span>
          </div>
          <div className="mt-7 flex items-end gap-2">
            <strong className="font-serif text-5xl tracking-tight">{data?.attendanceRate ?? 0}<span className="text-2xl">%</span></strong>
            <span className="mb-2 text-xs text-muted-foreground">overall attendance</span>
          </div>
          <div className="mt-5 flex h-32 items-end gap-2 border-b border-border pb-2">
            {(data?.attendanceByWeek || []).map((w) => {
              const height = w.expected ? Math.max(8, Math.round((w.attended / w.expected) * 100)) : 8;
              return (
                <div key={w.week} className="group flex flex-1 flex-col items-center gap-2">
                  <div
                    className="relative w-full rounded-t-md bg-primary/80 transition-all group-hover:bg-primary"
                    style={{ height: `${height}%` }}
                    title={`${w.week}: ${w.attended} of ${w.expected}`}
                  />
                  <span className="font-mono text-[9px] text-muted-foreground">{w.week}</span>
                </div>
              );
            })}
          </div>
          <div className="mt-4 flex justify-between text-[11px] text-muted-foreground">
            <span>Weekly attendance</span>
            <span>Recent weeks</span>
          </div>
        </section>
      </div>
      <div className="mt-6 grid gap-5 xl:grid-cols-2">
        <section className="surface overflow-hidden">
          <div className="flex items-center justify-between border-b px-5 py-4">
            <div>
              <div className="eyebrow">Action needed</div>
              <h2 className="mt-1 font-bold">Alerts & notifications</h2>
            </div>
            <Bell size={17} className="text-muted-foreground" />
          </div>
          {notifications.isLoading ? (
            <div className="p-5"><LoadingBlock rows={2} /></div>
          ) : notifications.isError ? (
            <div className="p-5"><ErrorState retry={() => notifications.refetch()} /></div>
          ) : notifications.data?.length ? (
            <div className="divide-y">
              {notifications.data.slice(0, 6).map((n) => (
                <Link
                  key={n.id}
                  href={n.href}
                  data-testid={`notification-${n.id}`}
                  className="flex items-start justify-between gap-3 px-5 py-3.5 transition hover:bg-muted/35"
                >
                  <div className="flex min-w-0 items-start gap-3">
                    <span
                      className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                        n.tone === 'warning'
                          ? 'bg-amber-500'
                          : n.tone === 'success'
                            ? 'bg-emerald-600'
                            : 'bg-slate-400'
                      }`}
                    />
                    <div className="min-w-0">
                      <div className="text-sm font-semibold">{n.title}</div>
                      <div className="mt-0.5 text-xs text-muted-foreground">{n.detail}</div>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                    <time>{formatDate(n.createdAt)}</time>
                    <ArrowRight size={13} />
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <p className="p-5 text-sm text-muted-foreground">
              You are up to date — no unfinalised sessions, open disputes, or pending requests.
            </p>
          )}
        </section>

        <section className="surface">
          <div className="flex items-center justify-between border-b px-5 py-4">
            <div>
              <div className="eyebrow">Recent activity</div>
              <h2 className="mt-1 font-bold">A reliable audit trail</h2>
            </div>
            <Activity size={17} className="text-muted-foreground" />
          </div>
          {activity.isLoading ? (
            <div className="p-5"><LoadingBlock rows={2} /></div>
          ) : activity.isError ? (
            <div className="p-5"><ErrorState retry={() => activity.refetch()} /></div>
          ) : activity.data?.length ? (
            <div className="divide-y">
              {activity.data.slice(0, 5).map(a => (
                <div key={a.id} data-testid={`activity-${a.id}`} className="flex gap-3 px-5 py-3.5">
                  <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${a.tone === 'success' ? 'bg-primary' : a.tone === 'warning' ? 'bg-amber-500' : 'bg-slate-400'}`} />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold">{a.action}</div>
                    <div className="mt-0.5 text-xs text-muted-foreground">{a.detail}</div>
                  </div>
                  <time className="shrink-0 text-[10px] text-muted-foreground">{formatDate(a.occurredAt)}</time>
                </div>
              ))}
            </div>
          ) : (
            <p className="p-5 text-sm text-muted-foreground">Activity will appear here as you manage sessions.</p>
          )}
        </section>
      </div>

      <div className="mt-5 flex flex-col justify-between gap-4 rounded-xl bg-[#263a43] p-6 text-white sm:flex-row sm:items-center">
        <div>
          <div className="eyebrow !text-white/50">Accountable by design</div>
          <h2 className="mt-2 font-serif text-2xl font-bold">A decision is only useful when its story is clear.</h2>
          <p className="mt-1.5 max-w-2xl text-sm leading-6 text-white/65">
            Review uncertain marks, capture reasons for manual attendance and finalise each class session when the record is ready.
          </p>
        </div>
        <Link href="/reports" className="inline-flex shrink-0 items-center gap-2 text-sm font-semibold text-accent whitespace-nowrap" data-testid="link-dashboard-reports">
          View attendance reports <ArrowRight size={15} />
        </Link>
      </div>
    </Shell>
  );
}

function ClassesPage() {
  const { toast } = useToast();
  const [showArchived, setShowArchived] = useState(false);
  const list = useAllClasses(showArchived);
  const allSessions = useAllSessions();
  const learnedDepts = useLearnedDepartments();
  const learnedProgRecords = useLearnedProgrammeRecords();
  const learnedCourses = useLearnedCourses();
  const learnedAcademic = useLearnedAcademic();
  const submitRefRequest = useSubmitReferenceRequest();
  const qc = useQueryClient();
  const create = useCreateClass();
  const [show, setShow] = useState(false);
  const [search, setSearch] = useState('');

  const [department, setDepartment] = useState('');
  const [programme, setProgramme] = useState('');
  const [courseCode, setCourseCode] = useState('');
  const [courseTitle, setCourseTitle] = useState('');
  const [level, setLevel] = useState<number>(300);
  const [semester, setSemester] = useState('Semester 1');
  const [academicYear, setAcademicYear] = useState('2026/2027');

  const [requestCourseOpen, setRequestCourseOpen] = useState(false);
  const [reqCourseCode, setReqCourseCode] = useState('');
  const [reqCourseTitle, setReqCourseTitle] = useState('');
  const [reqCourseNote, setReqCourseNote] = useState('');

  const activeDepartments = learnedDepts.data ?? [];
  const filteredProgrammes = (learnedProgRecords.data ?? []).filter(
    (p) => !department || p.departmentName === department,
  );
  const filteredCourses = (learnedCourses.data ?? []).filter((c) => {
    if (department && c.department !== department) return false;
    if (!programme) return true;
    return c.programmeNames?.includes(programme) || c.programme === programme;
  });

  useEffect(() => {
    if (!show) return;
    if (!department && activeDepartments.length > 0) {
      setDepartment(activeDepartments[0]);
    }
  }, [show, department, activeDepartments]);

  useEffect(() => {
    if (!show || !department) return;
    const validProg = filteredProgrammes.some((p) => p.name === programme);
    if (!validProg) {
      setProgramme(filteredProgrammes[0]?.name ?? '');
    }
  }, [show, department, programme, filteredProgrammes]);

  useEffect(() => {
    if (!show || !programme) return;
    const match = filteredCourses.find((c) => c.courseCode === courseCode);
    if (!match) {
      const first = filteredCourses[0];
      if (first) {
        setCourseCode(first.courseCode);
        setCourseTitle(first.courseTitle);
        if (first.level) setLevel(first.level);
      } else {
        setCourseCode('');
        setCourseTitle('');
      }
    }
  }, [show, programme, courseCode, filteredCourses]);

  useEffect(() => {
    if (!learnedAcademic.data) return;
    if (!semester && learnedAcademic.data.semesters.length) {
      setSemester(learnedAcademic.data.semesters[0]);
    }
    if (learnedAcademic.data.currentAcademicYear) {
      setAcademicYear(learnedAcademic.data.currentAcademicYear);
    }
    if (learnedAcademic.data.levels.length && !learnedAcademic.data.levels.includes(level)) {
      setLevel(learnedAcademic.data.levels[0]);
    }
  }, [learnedAcademic.data]);

  const handleSelectCourse = (code: string) => {
    setCourseCode(code);
    const match = filteredCourses.find((c) => c.courseCode === code);
    if (match) {
      setCourseTitle(match.courseTitle);
      if (match.level) setLevel(match.level);
    } else {
      setCourseTitle('');
    }
  };

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!department || !programme || !courseCode || !courseTitle) return;
    create.mutate(
      {
        data: {
          department: department.trim(),
          programme: programme.trim(),
          level: Number(level),
          courseCode: courseCode.trim(),
          courseTitle: courseTitle.trim(),
          semester: semester.trim(),
          academicYear: academicYear.trim(),
        },
      },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: getListClassesQueryKey() });
          qc.invalidateQueries({ queryKey: lecturerKeys.classesFiltered(false) });
          qc.invalidateQueries({ queryKey: lecturerKeys.classesFiltered(true) });
          qc.invalidateQueries({ queryKey: getGetAttendanceOverviewQueryKey() });
          setShow(false);
          setRequestCourseOpen(false);
          setCourseCode('');
          setCourseTitle('');
        },
      },
    );
  };

  const handleRequestMissingCourse = () => {
    if (!reqCourseCode.trim() || !reqCourseTitle.trim()) {
      toast({
        title: 'Course details required',
        description: 'Enter both the missing course code and course title.',
        variant: 'destructive',
      });
      return;
    }
    submitRefRequest.mutate(
      {
        type: 'course',
        departmentName: department || activeDepartments[0],
        programmeName: programme,
        level,
        courseCode: reqCourseCode.trim(),
        courseTitle: reqCourseTitle.trim(),
        note: reqCourseNote.trim() || undefined,
      },
      {
        onSuccess: () => {
          toast({
            title: 'Course request submitted',
            description: 'Sent to the Admin Requests Inbox for approval.',
          });
          setRequestCourseOpen(false);
          setReqCourseCode('');
          setReqCourseTitle('');
          setReqCourseNote('');
        },
        onError: (err) => {
          toast({
            title: 'Could not submit request',
            description: err instanceof Error ? err.message : 'Please try again.',
            variant: 'destructive',
          });
        },
      },
    );
  };

  const classes = (list.data || []).filter((c) => {
    const matchArchive = showArchived ? Boolean(c.archived) : !c.archived;
    const matchSearch = `${c.courseCode} ${c.courseTitle} ${c.programme}`
      .toLowerCase()
      .includes(search.toLowerCase());
    return matchArchive && matchSearch;
  });

  const allLoadedClasses = list.data || [];
  const activeClassCount = allLoadedClasses.filter((c) => !c.archived).length;
  const totalOnRosters = allLoadedClasses
    .filter((c) => !c.archived)
    .reduce((sum, c) => sum + c.rosterCount, 0);
  const openSessionsCount = (allSessions.data || []).filter((s) => s.status === 'open').length;

  const levelsList = learnedAcademic.data?.levels ?? [100, 200, 300, 400];
  const semestersList = learnedAcademic.data?.semesters ?? ['Semester 1', 'Semester 2'];
  const yearsList = learnedAcademic.data?.academicYears ?? ['2026/2027'];

  return (
    <Shell title="Classes">
      <PageHeading
        eyebrow="Your teaching"
        title="Classes"
        subtitle="Keep course rosters and attendance sessions together, semester by semester."
        action={
          <button className="btn btn-primary" onClick={() => setShow(true)} data-testid="button-create-class">
            <Plus size={16} /> Add a class
          </button>
        }
      />
      <section className="mb-6 grid gap-3 sm:grid-cols-3">
        <div className="surface flex items-center justify-between px-5 py-4 tabular-nums">
          <div>
            <div className="eyebrow">Classes</div>
            <div className="mt-1 font-serif text-2xl font-extrabold">{activeClassCount}</div>
            <div className="text-xs text-muted-foreground">Active this semester</div>
          </div>
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-secondary text-primary">
            <BookOpen size={17} />
          </span>
        </div>
        <div className="surface flex items-center justify-between px-5 py-4 tabular-nums">
          <div>
            <div className="eyebrow">On rosters</div>
            <div className="mt-1 font-serif text-2xl font-extrabold">{totalOnRosters}</div>
            <div className="text-xs text-muted-foreground">Enrolled across active classes</div>
          </div>
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-secondary text-primary">
            <Users size={17} />
          </span>
        </div>
        <div className="surface flex items-center justify-between px-5 py-4 tabular-nums">
          <div>
            <div className="eyebrow">Sessions open</div>
            <div className="mt-1 font-serif text-2xl font-extrabold">{openSessionsCount}</div>
            <div className="text-xs text-muted-foreground">Live check-in rooms</div>
          </div>
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-accent/30 text-foreground">
            <Radio size={17} />
          </span>
        </div>
      </section>
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            className="field pl-9"
            placeholder="Search course or programme"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            data-testid="input-search-classes"
          />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex rounded-lg border bg-card p-1">
            <button
              type="button"
              onClick={() => setShowArchived(false)}
              className={`rounded-md px-3 py-1 text-xs font-semibold transition cursor-pointer ${
                !showArchived ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
              data-testid="filter-classes-active"
            >
              Active
            </button>
            <button
              type="button"
              onClick={() => setShowArchived(true)}
              className={`rounded-md px-3 py-1 text-xs font-semibold transition cursor-pointer ${
                showArchived ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
              data-testid="filter-classes-archived"
            >
              Archived
            </button>
          </div>
          <span className="text-xs text-muted-foreground tabular-nums" data-testid="text-class-count">
            {classes.length} {classes.length === 1 ? 'class' : 'classes'}
          </span>
        </div>
      </div>
      {list.isLoading ? (
        <LoadingBlock rows={5} />
      ) : list.isError ? (
        <ErrorState retry={() => list.refetch()} />
      ) : classes.length === 0 ? (
        <EmptyState
          title={showArchived ? 'No archived classes' : search ? 'No matching classes' : 'Your class list starts here'}
          body={
            showArchived
              ? 'Classes you archive at the end of a semester appear here.'
              : search
                ? 'Try a different course code or programme.'
                : 'Add the courses you teach to build a roster and run attendance sessions.'
          }
          action={
            !search &&
            !showArchived && (
              <button className="btn btn-primary" onClick={() => setShow(true)} data-testid="button-empty-add-class">
                <Plus size={15} /> Add a class
              </button>
            )
          }
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {classes.map((c, i) => (
            <ClassCard key={c.id} item={c} index={i} />
          ))}
        </div>
      )}
      {show && (
        <Modal title="Add a class" close={() => setShow(false)}>
          <form className="space-y-4" onSubmit={submit}>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-xs font-semibold text-foreground">
                Department
                <select
                  className="field mt-1.5"
                  name="department"
                  value={department}
                  onChange={(e) => {
                    setDepartment(e.target.value);
                    setProgramme('');
                    setCourseCode('');
                    setCourseTitle('');
                  }}
                  required
                  data-testid="input-department"
                >
                  {activeDepartments.map((dept) => (
                    <option key={dept} value={dept}>
                      {dept}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-xs font-semibold text-foreground">
                Programme
                <select
                  className="field mt-1.5"
                  name="programme"
                  value={programme}
                  onChange={(e) => {
                    setProgramme(e.target.value);
                    setCourseCode('');
                    setCourseTitle('');
                  }}
                  required
                  data-testid="input-programme"
                >
                  {filteredProgrammes.length === 0 ? (
                    <option value="">No active programmes in department</option>
                  ) : (
                    filteredProgrammes.map((p) => (
                      <option key={p.id} value={p.name}>
                        {p.name}
                      </option>
                    ))
                  )}
                </select>
              </label>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-xs font-semibold text-foreground">
                Course (filtered by programme)
                <select
                  className="field mt-1.5"
                  name="courseCode"
                  value={courseCode}
                  onChange={(e) => handleSelectCourse(e.target.value)}
                  required
                  data-testid="input-courseCode"
                >
                  {filteredCourses.length === 0 ? (
                    <option value="">No courses listed for this programme</option>
                  ) : (
                    filteredCourses.map((c) => (
                      <option key={c.courseCode} value={c.courseCode}>
                        {c.courseCode} — {c.courseTitle}
                      </option>
                    ))
                  )}
                </select>
              </label>
              <label className="block text-xs font-semibold text-foreground">
                Course title
                <input
                  className="field mt-1.5 bg-muted/40"
                  name="courseTitle"
                  value={courseTitle}
                  readOnly
                  placeholder="Auto-filled from selected course"
                  required
                  data-testid="input-courseTitle"
                />
              </label>
            </div>

            <div className="flex items-center justify-between rounded-lg border bg-muted/30 px-3 py-2 text-xs">
              <span className="text-muted-foreground">Can&apos;t find your course on the institutional list?</span>
              <button
                type="button"
                onClick={() => setRequestCourseOpen((prev) => !prev)}
                className="font-semibold text-primary underline cursor-pointer whitespace-nowrap"
                data-testid="button-toggle-request-course"
              >
                {requestCourseOpen ? 'Close request' : 'Request missing course'}
              </button>
            </div>

            {requestCourseOpen && (
              <div className="rounded-xl border border-primary/25 bg-primary/5 p-3.5 space-y-2.5">
                <div className="text-xs font-bold text-foreground">Request missing course for admin approval</div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <input
                    className="field"
                    placeholder="Course code (e.g. CS 412)"
                    value={reqCourseCode}
                    onChange={(e) => setReqCourseCode(e.target.value)}
                  />
                  <input
                    className="field"
                    placeholder="Course title"
                    value={reqCourseTitle}
                    onChange={(e) => setReqCourseTitle(e.target.value)}
                  />
                </div>
                <input
                  className="field"
                  placeholder="Optional note for admin (e.g. taught in Level 400)"
                  value={reqCourseNote}
                  onChange={(e) => setReqCourseNote(e.target.value)}
                />
                <div className="flex justify-end">
                  <button
                    type="button"
                    disabled={submitRefRequest.isPending}
                    onClick={handleRequestMissingCourse}
                    className="btn btn-primary !py-1.5 !px-3 text-xs"
                  >
                    {submitRefRequest.isPending ? 'Sending…' : 'Send request to Admin'}
                  </button>
                </div>
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-3">
              <label className="block text-xs font-semibold text-foreground">
                Level
                <select
                  className="field mt-1.5"
                  name="level"
                  value={level}
                  onChange={(e) => setLevel(Number(e.target.value))}
                  required
                  data-testid="input-level"
                >
                  {levelsList.map((lv) => (
                    <option key={lv} value={lv}>
                      Level {lv}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-xs font-semibold text-foreground">
                Semester
                <select
                  className="field mt-1.5"
                  name="semester"
                  value={semester}
                  onChange={(e) => setSemester(e.target.value)}
                  required
                  data-testid="input-semester"
                >
                  {semestersList.map((sem) => (
                    <option key={sem} value={sem}>
                      {sem}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-xs font-semibold text-foreground">
                Academic year
                <select
                  className="field mt-1.5"
                  name="academicYear"
                  value={academicYear}
                  onChange={(e) => setAcademicYear(e.target.value)}
                  required
                  data-testid="input-academicYear"
                >
                  {yearsList.map((yr) => (
                    <option key={yr} value={yr}>
                      {yr}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {create.isError && <InlineError text="We couldn’t create this class. Check the details and try again." />}
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" className="btn btn-outline" onClick={() => setShow(false)} data-testid="button-cancel-create-class">
                Cancel
              </button>
              <button
                disabled={create.isPending || !courseCode || !programme}
                className="btn btn-primary"
                data-testid="button-submit-create-class"
              >
                {create.isPending ? <LoaderCircle size={15} className="animate-spin" /> : <Plus size={15} />} Create class
              </button>
            </div>
          </form>
        </Modal>
      )}
    </Shell>
  );
}

function ClassCard({ item: c, index }: { item: ClassItem; index: number }) {
  return (
    <Link
      href={`/classes/${c.id}`}
      data-testid={`card-class-${c.id}`}
      className={`surface group p-5 transition hover:-translate-y-0.5 hover:border-primary/40 rise-in stagger-${Math.min(index % 4, 3)}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="eyebrow">{c.department}</div>
          <h2 className="mt-2 truncate font-serif text-xl font-extrabold">{c.courseCode}</h2>
          <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{c.courseTitle}</p>
        </div>
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-secondary text-primary transition group-hover:bg-primary group-hover:text-white">
          <ArrowUpRight size={18} />
        </span>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">{c.programme}</span>
        <span>·</span>
        <span>Level {c.level}</span>
        <span>·</span>
        <span>{c.semester}</span>
        {c.archived && <span className="font-semibold text-amber-700">· Archived</span>}
      </div>
      <div className="mt-5 grid grid-cols-3 border-t pt-4 tabular-nums">
        <div>
          <div className="font-mono text-lg font-bold">{c.rosterCount}</div>
          <div className="text-[10px] text-muted-foreground">students</div>
        </div>
        <div>
          <div className="font-mono text-lg font-bold">{c.averageAttendance}%</div>
          <div className="text-[10px] text-muted-foreground">avg attendance</div>
        </div>
        <div>
          <div className="font-mono text-xs font-bold">{formatDate(c.lastSessionAt)}</div>
          <div className="mt-1 text-[10px] text-muted-foreground">last session</div>
        </div>
      </div>
    </Link>
  );
}

function Field({
  label, name, placeholder, type = 'text', required = false, min, max, defaultValue,
}: {
  label: string; name: string; placeholder?: string; type?: string; required?: boolean; min?: string; max?: string; defaultValue?: string;
}) {
  return (
    <label className="block text-xs font-semibold text-foreground">
      {label}
      <input
        className="field mt-1.5"
        name={name}
        type={type}
        placeholder={placeholder}
        required={required}
        min={min}
        max={max}
        defaultValue={defaultValue}
        data-testid={`input-${name}`}
      />
    </label>
  );
}

function Modal({ title, close, children }: { title: string; close: () => void; children: ReactNode }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-[#182630]/45 p-0 backdrop-blur-[2px] sm:items-center sm:p-5"
      onMouseDown={e => { if (e.target === e.currentTarget) close(); }}
    >
      <section className="max-h-[92dvh] w-full max-w-xl overflow-y-auto rounded-t-2xl border bg-card p-5 shadow-2xl sm:rounded-2xl sm:p-6">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="font-serif text-xl font-extrabold">{title}</h2>
          <button className="rounded-lg p-2 hover:bg-muted cursor-pointer" onClick={close} aria-label="Close" data-testid="button-close-modal">
            <X size={17} />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}

function InlineError({ text }: { text: string }) {
  return <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs text-destructive" role="alert">{text}</div>;
}

function ClassPage({ classId }: { classId: string }) {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const detail = useGetClass(classId);
  const roster = useGetClassRoster(classId);
  const sessions = useListClassSessions(classId, { query: { queryKey: getListClassSessionsQueryKey(classId) } });
  const learnedLocations = useLearnedLocations();
  const learnedAcademic = useLearnedAcademic();
  const learnedDepts = useLearnedDepartments();
  const learnedProgRecords = useLearnedProgrammeRecords();
  const learnedCourses = useLearnedCourses();
  const submitRefRequest = useSubmitReferenceRequest();
  const createSession = useCreateSession();
  const updateClass = useUpdateClass();
  const copyClass = useCopyClass();
  const qc = useQueryClient();

  const [activeTab, setActiveTab] = useState<'roster' | 'identity' | 'sessions' | 'reports'>('roster');
  const [reportThreshold, setReportThreshold] = useState(75);
  const [createOpen, setCreateOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [studentModal, setStudentModal] = useState<{ open: boolean; target?: typeof roster.data extends { rows: Array<infer R> } ? R | null : never }>({ open: false });
  const [removeTarget, setRemoveTarget] = useState<NonNullable<typeof roster.data>['rows'][number] | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [copyOpen, setCopyOpen] = useState(false);
  const [copySemester, setCopySemester] = useState('Semester 2');
  const [copyAcademicYear, setCopyAcademicYear] = useState('2026/2027');
  const [copyIncludeRoster, setCopyIncludeRoster] = useState(true);
  const [archiveConfirmOpen, setArchiveConfirmOpen] = useState(false);
  const [exportingExcel, setExportingExcel] = useState(false);

  const [venueInput, setVenueInput] = useState('');
  const [radiusM, setRadiusM] = useState(100);
  const [requestLocOpen, setRequestLocOpen] = useState(false);
  const [reqLocName, setReqLocName] = useState('');
  const [reqLocBuilding, setReqLocBuilding] = useState('');
  const [reqLocNote, setReqLocNote] = useState('');
  const [pinState, setPinState] = useState<LocationPinValue>({
    lat: 4.9016,
    lng: -1.7831,
    accuracyM: 25,
    pinMoved: false,
    locationSkipped: false,
  });

  const policyDefaults = learnedAcademic.data?.defaults;
  const maxRadiusAllowed = policyDefaults?.maxRadiusM ?? 500;
  const defaultRadiusPolicy = policyDefaults?.defaultRadiusM ?? 100;
  const allowStaticCodes = policyDefaults?.allowStaticCodes !== false;
  const allowLateStatus = policyDefaults?.allowLateStatus !== false;
  const rotatingCodeSeconds = policyDefaults?.rotatingCodeSeconds ?? 45;

  useEffect(() => {
    if (policyDefaults?.attendanceThresholdPct) {
      setReportThreshold(policyDefaults.attendanceThresholdPct);
    }
    if (policyDefaults?.defaultRadiusM) {
      setRadiusM(Math.min(policyDefaults.defaultRadiusM, policyDefaults.maxRadiusM || 500));
    }
  }, [policyDefaults?.attendanceThresholdPct, policyDefaults?.defaultRadiusM, policyDefaults?.maxRadiusM]);

  useEffect(() => {
    const locs = learnedLocations.data ?? [];
    if (!venueInput && locs.length > 0) {
      const first = locs[0];
      setVenueInput(first.name);
      if (first.lat != null && first.lng != null) {
        setRadiusM(Math.min(first.radiusM || defaultRadiusPolicy, maxRadiusAllowed));
        setPinState({
          lat: first.lat,
          lng: first.lng,
          accuracyM: 20,
          pinMoved: false,
          locationSkipped: false,
        });
      }
    }
  }, [learnedLocations.data, venueInput, defaultRadiusPolicy, maxRadiusAllowed]);

  const handleVenueChange = (val: string) => {
    setVenueInput(val);
    const match = (learnedLocations.data ?? []).find(
      (loc) => loc.name.toLowerCase() === val.trim().toLowerCase(),
    );
    if (match && match.lat != null && match.lng != null) {
      setRadiusM(Math.min(match.radiusM || defaultRadiusPolicy, maxRadiusAllowed));
      setPinState({
        lat: match.lat,
        lng: match.lng,
        accuracyM: 20,
        pinMoved: false,
        locationSkipped: false,
      });
    }
  };

  const handleRequestMissingLocation = () => {
    if (!reqLocName.trim()) {
      toast({
        title: 'Location name required',
        description: 'Enter the missing room or lecture theatre name.',
        variant: 'destructive',
      });
      return;
    }
    submitRefRequest.mutate(
      {
        type: 'location',
        locationName: reqLocName.trim(),
        building: reqLocBuilding.trim() || undefined,
        note: reqLocNote.trim() || undefined,
      },
      {
        onSuccess: () => {
          toast({
            title: 'Location request submitted',
            description: 'Sent to the Admin Requests Inbox for approval.',
          });
          setRequestLocOpen(false);
          setReqLocName('');
          setReqLocBuilding('');
          setReqLocNote('');
        },
        onError: (err) => {
          toast({
            title: 'Could not submit request',
            description: err instanceof Error ? err.message : 'Please try again.',
            variant: 'destructive',
          });
        },
      },
    );
  };

  const newSession = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const starts = new Date(String(f.get('startsAt')));
    const endsRaw = String(f.get('endsAt') || '');
    const ends = endsRaw ? new Date(endsRaw) : new Date(starts.getTime() + 90 * 60000);
    const lateRaw = String(f.get('lateAfterMinutes') || '').trim();

    const data: SessionInput = {
      topic: String(f.get('topic')),
      startsAt: starts.toISOString(),
      endsAt: ends.toISOString(),
      lateAfterMinutes: lateRaw ? Number(lateRaw) : null,
      venue: venueInput.trim(),
      expectedStudents: Number(f.get('expectedStudents')),
      codeMode: String(f.get('codeMode')) as SessionInput['codeMode'],
      radiusM,
      location: pinState,
      openImmediately: f.get('openImmediately') === 'on',
    };

    createSession.mutate(
      { classId, data },
      {
        onSuccess: (session) => {
          qc.invalidateQueries({ queryKey: getListClassSessionsQueryKey(classId) });
          qc.invalidateQueries({ queryKey: getGetAttendanceOverviewQueryKey() });
          qc.invalidateQueries({ queryKey: lecturerKeys.allSessions });
          qc.invalidateQueries({ queryKey: lecturerKeys.lists('locations') });
          if (session.warnings?.includes('LOW_ACCURACY')) {
            toast({
              title: 'Low GPS accuracy recorded',
              description: 'Check-ins will be monitored with relaxed geofence review.',
            });
          }
          setCreateOpen(false);
          setLocation(`/sessions/${session.id}`);
        },
      },
    );
  };

  const submitEditClass = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    updateClass.mutate(
      {
        classId,
        data: {
          courseCode: String(f.get('courseCode')),
          courseTitle: String(f.get('courseTitle')),
          department: String(f.get('department')),
          programme: String(f.get('programme')),
          level: Number(f.get('level')),
          semester: String(f.get('semester')),
          academicYear: String(f.get('academicYear')),
        },
      },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: getGetClassQueryKey(classId) });
          qc.invalidateQueries({ queryKey: lecturerKeys.classesFiltered(false) });
          qc.invalidateQueries({ queryKey: lecturerKeys.classesFiltered(true) });
          setEditOpen(false);
          toast({ title: 'Class updated' });
        },
      },
    );
  };

  const toggleArchiveClass = () => {
    if (!detail.data) return;
    const nextArchived = !detail.data.classroom.archived;
    updateClass.mutate(
      { classId, data: { archived: nextArchived } },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: getGetClassQueryKey(classId) });
          qc.invalidateQueries({ queryKey: lecturerKeys.classesFiltered(false) });
          qc.invalidateQueries({ queryKey: lecturerKeys.classesFiltered(true) });
          qc.invalidateQueries({ queryKey: getGetAttendanceOverviewQueryKey() });
          setArchiveConfirmOpen(false);
          toast({
            title: nextArchived ? 'Class archived' : 'Class restored',
            description: nextArchived
              ? 'Moved to your Archived classes filter.'
              : 'Returned to your Active classes list.',
          });
        },
      },
    );
  };

  if (detail.isLoading) return <Shell title="Class details"><LoadingBlock rows={5} /></Shell>;
  if (detail.isError || !detail.data) return <Shell title="Class details"><ErrorState retry={() => detail.refetch()} /></Shell>;

  const c = detail.data.classroom;
  const toLocalInput = (d: Date) =>
    new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  const defaultLocalStart = toLocalInput(new Date());
  const defaultLocalEnd = toLocalInput(new Date(Date.now() + 90 * 60000));

  const openCopyModal = () => {
    const semesters = learnedAcademic.data?.semesters ?? ['Semester 1', 'Semester 2'];
    const altSemester = semesters.find((item) => item !== c.semester) ?? c.semester;
    setCopySemester(altSemester);
    setCopyAcademicYear(learnedAcademic.data?.currentAcademicYear || c.academicYear);
    setCopyIncludeRoster(true);
    setCopyOpen(true);
  };

  const handleCopyClass = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    copyClass.mutate(
      {
        classId,
        semester: copySemester,
        academicYear: copyAcademicYear,
        includeRoster: copyIncludeRoster,
      },
      {
        onSuccess: (copied) => {
          qc.invalidateQueries({ queryKey: lecturerKeys.classesFiltered(false) });
          qc.invalidateQueries({ queryKey: lecturerKeys.classesFiltered(true) });
          qc.invalidateQueries({ queryKey: getGetAttendanceOverviewQueryKey() });
          setCopyOpen(false);
          toast({
            title: 'Class copied to new semester',
            description: `${copied.courseCode} created for ${copied.semester} · ${copied.academicYear}.`,
          });
          setLocation(`/classes/${copied.id}`);
        },
        onError: (err) => {
          toast({
            title: 'Could not copy class',
            description: err instanceof Error ? err.message : 'Check the target semester and academic year.',
            variant: 'destructive',
          });
        },
      },
    );
  };

  return (
    <Shell title="Class details">
      <Link href="/classes" className="mb-5 inline-flex items-center gap-2 text-xs font-semibold text-muted-foreground hover:text-foreground">
        <ArrowLeft size={14} /> All classes
      </Link>
      <PageHeading
        eyebrow={`${c.department} · ${c.programme}`}
        title={`${c.courseCode} — ${c.courseTitle}`}
        subtitle={`${c.semester} · ${c.academicYear} · Level ${c.level}${c.archived ? ' · Archived' : ''}`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="btn btn-outline !px-3 whitespace-nowrap shrink-0"
              onClick={openCopyModal}
              data-testid="button-copy-class"
            >
              <Copy size={15} /> Copy to new semester
            </button>
            <button
              type="button"
              className="btn btn-outline !px-3 whitespace-nowrap shrink-0"
              onClick={() => setEditOpen(true)}
              data-testid="button-edit-class"
            >
              <Edit3 size={15} /> Edit class
            </button>
            <button
              type="button"
              className="btn btn-outline !px-3 whitespace-nowrap shrink-0"
              onClick={() => setArchiveConfirmOpen(true)}
              data-testid="button-archive-class"
            >
              {c.archived ? <ArchiveRestore size={15} /> : <Archive size={15} />}
              {c.archived ? 'Restore' : 'Archive'}
            </button>
            {!c.archived && (
              <button className="btn btn-primary whitespace-nowrap shrink-0" onClick={() => setCreateOpen(true)} data-testid="button-start-session">
                <Plus size={16} /> Start session
              </button>
            )}
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Class roster" value={roster.data?.rosterCount ?? c.rosterCount} note="Enrolled students" icon={Users} />
        <StatCard label="Registered" value={roster.data?.registeredCount ?? c.registeredCount} note="Linked to an account" icon={CheckCircle2} />
        <StatCard label="Face enrolled" value={roster.data?.faceEnrolledCount ?? c.faceEnrolledCount} note="Ready for verification" icon={ShieldCheck} />
        <StatCard label="To confirm" value={roster.data?.toConfirmCount ?? c.toConfirmCount ?? 0} note="Photos awaiting check" icon={UserCheck} accent />
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-b pb-3">
        <div className="flex max-w-full gap-1 overflow-x-auto rounded-lg border bg-card p-1">
          {(
            [
              ['roster', 'Roster'],
              ['identity', 'Identity check'],
              ['sessions', 'Sessions'],
              ['reports', 'Reports'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setActiveTab(key)}
              className={`rounded-md px-3.5 py-1.5 text-xs font-semibold transition whitespace-nowrap shrink-0 cursor-pointer ${
                activeTab === key ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
              data-testid={`tab-class-${key}`}
            >
              {label}
            </button>
          ))}
        </div>
        <span className="text-xs text-muted-foreground tabular-nums">
          Average attendance: <b className="font-mono text-foreground">{c.averageAttendance}%</b>
        </span>
      </div>

      {activeTab === 'roster' && (
        <section className="surface mt-5 overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
            <div>
              <div className="eyebrow">Class roster</div>
              <h2 className="mt-1 font-bold">Students</h2>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="btn btn-outline !px-3"
                onClick={async () => {
                  try {
                    setExportingExcel(true);
                    const safeName = c.courseCode.toLowerCase().replace(/[^a-z0-9_-]+/g, '-');
                    await downloadApiFile(
                      `/api/classes/${c.id}/roster/export`,
                      `${safeName}-roster-attendance.xlsx`,
                    );
                  } catch {
                    toast({
                      title: 'Export failed',
                      description: 'Could not export the roster workbook. Please try again.',
                      variant: 'destructive',
                    });
                  } finally {
                    setExportingExcel(false);
                  }
                }}
                disabled={!roster.data?.rows.length || exportingExcel}
                data-testid="button-export-class-excel"
              >
                <FileSpreadsheet size={15} /> {exportingExcel ? 'Exporting…' : 'Export to Excel'}
              </button>
              <button
                type="button"
                className="btn btn-outline !px-3"
                onClick={() => exportClassRosterPdf(c, roster.data?.rows ?? [])}
                disabled={!roster.data?.rows.length}
                data-testid="button-print-student-list"
              >
                <Printer size={15} /> Print Student List
              </button>
              <button className="btn btn-outline !px-3" onClick={() => setImportOpen(true)} data-testid="button-import-roster">
                <Download size={15} /> Import roster
              </button>
              <button
                className="btn btn-primary !px-3"
                onClick={() => setStudentModal({ open: true, target: null })}
                data-testid="button-add-student"
              >
                <UserPlus size={15} /> Add student
              </button>
            </div>
          </div>
          {roster.isLoading ? (
            <div className="p-5"><LoadingBlock rows={4} /></div>
          ) : roster.isError ? (
            <div className="p-5"><ErrorState retry={() => roster.refetch()} /></div>
          ) : roster.data?.rows.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px]">
                <thead>
                  <tr className="table-head border-b text-left">
                    <th className="px-5 py-3">Student</th>
                    <th className="px-3 py-3">Index number</th>
                    <th className="px-3 py-3">Face profile</th>
                    <th className="px-3 py-3">Account link</th>
                    <th className="px-5 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {roster.data.rows.map((r) => (
                    <tr key={r.id} data-testid={`row-student-${r.id}`} className="text-sm">
                      <td className="px-5 py-3.5">
                        <div className="font-semibold">{r.fullName}</div>
                        <div className="mt-0.5 text-xs text-muted-foreground">{r.email}</div>
                      </td>
                      <td className="px-3 py-3.5 font-mono text-xs">{r.indexNumber}</td>
                      <td className="px-3 py-3.5 text-xs text-muted-foreground">
                        {r.faceEnrolled ? 'Enrolled' : 'Pending'}
                        {r.verificationStatus === 'confirmed' && ' · Confirmed'}
                        {r.verificationStatus === 'disputed' && ' · Disputed'}
                      </td>
                      <td className="px-3 py-3.5">
                        <Badge tone={r.linkStatus === 'matched' ? 'good' : r.linkStatus === 'conflict' ? 'bad' : 'warn'}>
                          {r.linkStatus.replace('_', ' ')}
                        </Badge>
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => setStudentModal({ open: true, target: r })}
                            className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer"
                            title="Edit student"
                            data-testid={`button-edit-student-${r.indexNumber}`}
                          >
                            <Edit3 size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => setRemoveTarget(r)}
                            className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-destructive cursor-pointer"
                            title="Remove student"
                            data-testid={`button-remove-student-${r.indexNumber}`}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-5">
              <EmptyState
                title="No students on the roster"
                body="Import a class list or add students individually to prepare for attendance."
                action={
                  <button className="btn btn-primary" onClick={() => setImportOpen(true)} data-testid="button-empty-import-roster">
                    <Download size={15} /> Import roster
                  </button>
                }
              />
            </div>
          )}
        </section>
      )}

      {activeTab === 'identity' && (
        <div className="mt-5">
          <IdentityCheckTab classId={classId} />
        </div>
      )}

      {activeTab === 'sessions' && (
        <section className="surface mt-5 overflow-hidden">
          <div className="flex items-center justify-between border-b px-5 py-4">
            <div>
              <div className="eyebrow">Class history</div>
              <h2 className="mt-1 font-bold">Attendance sessions</h2>
            </div>
            <CalendarDays size={17} className="text-muted-foreground" />
          </div>
          {sessions.isLoading ? (
            <div className="p-5"><LoadingBlock rows={3} /></div>
          ) : sessions.isError ? (
            <div className="p-5"><ErrorState retry={() => sessions.refetch()} /></div>
          ) : sessions.data?.length ? (
            <div className="divide-y">
              {sessions.data.map((s) => (
                <Link href={`/sessions/${s.id}`} key={s.id} data-testid={`link-class-session-${s.id}`} className="block px-5 py-4 hover:bg-muted/30">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-semibold">{s.topic}</div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {formatDate(s.startsAt)} · {s.venue}
                      </div>
                    </div>
                    <StatusBadge status={s.status} />
                  </div>
                  <div className="mt-3 flex items-center justify-between text-xs tabular-nums">
                    <span className="text-muted-foreground">
                      {s.checkedInCount} of {s.rosterCount} checked in
                    </span>
                    {s.reviewCount > 0 && <Badge tone="warn">{s.reviewCount} review</Badge>}
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="p-5">
              <EmptyState title="No sessions yet" body="Start an attendance session when your class is ready." />
            </div>
          )}
        </section>
      )}

      {activeTab === 'reports' && (
        <div className="mt-5 space-y-4">
          <div className="surface flex flex-wrap items-center justify-between gap-3 px-5 py-4">
            <div>
              <div className="eyebrow">Course analytics</div>
              <h2 className="mt-1 font-bold">{c.courseCode} attendance summary</h2>
            </div>
            <ReportsControls threshold={reportThreshold} onThresholdChange={setReportThreshold} />
          </div>
          <ReportCardEnhanced item={c} threshold={reportThreshold} />
        </div>
      )}

      {createOpen && (
        <Modal title="Start an attendance session" close={() => setCreateOpen(false)}>
          <form onSubmit={newSession} className="space-y-4">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border bg-muted/30 px-3.5 py-2.5 text-xs tabular-nums">
              <span>
                Roster: <b className="font-mono">{roster.data?.rosterCount ?? c.rosterCount}</b>
              </span>
              <span className="text-muted-foreground">·</span>
              <span>
                Registered: <b className="font-mono">{roster.data?.registeredCount ?? c.registeredCount}</b>
              </span>
              <span className="text-muted-foreground">·</span>
              <span>
                Face-enrolled: <b className="font-mono">{roster.data?.faceEnrolledCount ?? c.faceEnrolledCount}</b>
              </span>
            </div>
            <Field label="Session topic" name="topic" placeholder="Week 6 · Routing Protocols" required />
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Start time" name="startsAt" type="datetime-local" defaultValue={defaultLocalStart} required />
              <Field label="End time" name="endsAt" type="datetime-local" defaultValue={defaultLocalEnd} required />
            </div>
            <div className={`grid gap-3 ${allowLateStatus ? 'sm:grid-cols-2' : ''}`}>
              <label className="block text-xs font-semibold text-foreground">
                Venue / lecture hall (admin-managed)
                <select
                  className="field mt-1.5"
                  name="venue"
                  value={venueInput}
                  onChange={(e) => handleVenueChange(e.target.value)}
                  required
                  data-testid="input-venue"
                >
                  {(learnedLocations.data ?? []).length === 0 ? (
                    <option value="">No approved venues available</option>
                  ) : (
                    (learnedLocations.data ?? []).map((loc) => (
                      <option key={loc.name} value={loc.name}>
                        {loc.name}{loc.building ? ` · ${loc.building}` : ''}
                      </option>
                    ))
                  )}
                </select>
              </label>
              {allowLateStatus && (
                <Field
                  label="Late cut-off (minutes after start, optional)"
                  name="lateAfterMinutes"
                  type="number"
                  min="5"
                  max="180"
                  placeholder={String(policyDefaults?.lateAfterMinutesDefault ?? 20)}
                />
              )}
            </div>

            <div className="flex items-center justify-between rounded-lg border bg-muted/30 px-3 py-2 text-xs">
              <span className="text-muted-foreground">Room missing? Request an admin-approved venue name.</span>
              <button
                type="button"
                onClick={() => setRequestLocOpen((prev) => !prev)}
                className="font-semibold text-primary underline cursor-pointer whitespace-nowrap"
                data-testid="button-toggle-request-location"
              >
                {requestLocOpen ? 'Close request' : 'Request missing location'}
              </button>
            </div>

            {requestLocOpen && (
              <div className="rounded-xl border border-primary/25 bg-primary/5 p-3.5 space-y-2.5">
                <div className="text-xs font-bold text-foreground">Request missing venue name</div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <input
                    className="field"
                    placeholder="Location name (e.g. Engineering Block 4)"
                    value={reqLocName}
                    onChange={(e) => setReqLocName(e.target.value)}
                  />
                  <input
                    className="field"
                    placeholder="Building (optional)"
                    value={reqLocBuilding}
                    onChange={(e) => setReqLocBuilding(e.target.value)}
                  />
                </div>
                <input
                  className="field"
                  placeholder="Optional note for admin"
                  value={reqLocNote}
                  onChange={(e) => setReqLocNote(e.target.value)}
                />
                <div className="flex justify-end">
                  <button
                    type="button"
                    disabled={submitRefRequest.isPending}
                    onClick={handleRequestMissingLocation}
                    className="btn btn-primary !py-1.5 !px-3 text-xs"
                  >
                    {submitRefRequest.isPending ? 'Sending…' : 'Send request to Admin'}
                  </button>
                </div>
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Expected students" name="expectedStudents" type="number" min="1" defaultValue={String(Math.max(1, c.rosterCount))} required />
              <label className="block text-xs font-semibold">
                Geofence radius (max {maxRadiusAllowed} m)
                <select
                  name="radiusM"
                  className="field mt-1.5"
                  value={radiusM}
                  onChange={(e) => setRadiusM(Number(e.target.value))}
                  data-testid="select-radius"
                >
                  {[50, 100, 150, 200, 300, 500]
                    .filter((v) => v <= maxRadiusAllowed)
                    .map((v) => {
                      const presetLabel =
                        v === 50
                          ? 'Classroom'
                          : v === 100
                            ? 'Building'
                            : v === 300
                              ? 'Campus'
                              : v === 500
                                ? 'Campus Max'
                                : '';
                      return (
                        <option key={v} value={v}>
                          {v} m{presetLabel ? ` (${presetLabel})` : ''}
                          {v === defaultRadiusPolicy ? ' · Policy default' : ''}
                        </option>
                      );
                    })}
                </select>
              </label>
            </div>

            <LocationPinPicker value={pinState} radiusM={radiusM} onChange={setPinState} />

            <label className="flex items-start gap-3 rounded-lg border bg-muted/35 p-3 text-xs">
              <input name="openImmediately" type="checkbox" defaultChecked className="mt-0.5 accent-primary" />
              <span>
                <b>Open session immediately</b>
                <span className="mt-1 block text-muted-foreground">Display the live rotating QR and typed code as soon as it is created.</span>
              </span>
            </label>
            <label className="block text-xs font-semibold">
              Check-in code behavior
              <select name="codeMode" className="field mt-1.5">
                <option value="rotating">Rotating code ({rotatingCodeSeconds}s refresh — recommended)</option>
                {allowStaticCodes && <option value="static">Static code (lower security)</option>}
              </select>
            </label>
            {createSession.isError && <InlineError text="Couldn’t start this session. Please check the details." />}
            <div className="flex justify-end gap-2">
              <button type="button" className="btn btn-outline" onClick={() => setCreateOpen(false)}>Cancel</button>
              <button className="btn btn-primary" disabled={createSession.isPending || !venueInput} data-testid="button-confirm-start-session">
                {createSession.isPending ? <LoaderCircle size={15} className="animate-spin" /> : <Radio size={15} />} Create session
              </button>
            </div>
          </form>
        </Modal>
      )}

      {editOpen && (
        <Modal title="Edit class details" close={() => setEditOpen(false)}>
          <form onSubmit={submitEditClass} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-xs font-semibold">
                Course code (institutional catalog)
                <select className="field mt-1.5" name="courseCode" defaultValue={c.courseCode} required>
                  {Array.from(
                    new Set([c.courseCode, ...(learnedCourses.data ?? []).map((item) => item.courseCode)]),
                  ).map((code) => (
                    <option key={code} value={code}>
                      {code}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-xs font-semibold">
                Course title
                <select className="field mt-1.5" name="courseTitle" defaultValue={c.courseTitle} required>
                  {Array.from(
                    new Set([c.courseTitle, ...(learnedCourses.data ?? []).map((item) => item.courseTitle)]),
                  ).map((title) => (
                    <option key={title} value={title}>
                      {title}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-xs font-semibold">
                Department
                <select className="field mt-1.5" name="department" defaultValue={c.department} required>
                  {Array.from(new Set([c.department, ...(learnedDepts.data ?? [])])).map((dept) => (
                    <option key={dept} value={dept}>
                      {dept}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-xs font-semibold">
                Programme
                <select className="field mt-1.5" name="programme" defaultValue={c.programme} required>
                  {Array.from(
                    new Set([c.programme, ...(learnedProgRecords.data ?? []).map((p) => p.name)]),
                  ).map((prog) => (
                    <option key={prog} value={prog}>
                      {prog}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="block text-xs font-semibold">
                Level
                <select className="field mt-1.5" name="level" defaultValue={String(c.level)} required>
                  {Array.from(
                    new Set([c.level, ...(learnedAcademic.data?.levels ?? [100, 200, 300, 400])]),
                  )
                    .sort((a, b) => a - b)
                    .map((lv) => (
                      <option key={lv} value={String(lv)}>
                        Level {lv}
                      </option>
                    ))}
                </select>
              </label>
              <label className="block text-xs font-semibold">
                Semester
                <select className="field mt-1.5" name="semester" defaultValue={c.semester} required>
                  {Array.from(
                    new Set([c.semester, ...(learnedAcademic.data?.semesters ?? ['Semester 1', 'Semester 2'])]),
                  ).map((sem) => (
                    <option key={sem} value={sem}>
                      {sem}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-xs font-semibold">
                Academic year
                <select className="field mt-1.5" name="academicYear" defaultValue={c.academicYear} required>
                  {Array.from(
                    new Set([c.academicYear, ...(learnedAcademic.data?.academicYears ?? [c.academicYear])]),
                  ).map((yr) => (
                    <option key={yr} value={yr}>
                      {yr}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" className="btn btn-outline" onClick={() => setEditOpen(false)}>Cancel</button>
              <button type="submit" disabled={updateClass.isPending} className="btn btn-primary" data-testid="button-save-edit-class">
                {updateClass.isPending ? <LoaderCircle size={15} className="animate-spin" /> : <Check size={15} />} Save changes
              </button>
            </div>
          </form>
        </Modal>
      )}

      {archiveConfirmOpen && (
        <Modal title={c.archived ? 'Restore class?' : 'Archive class?'} close={() => setArchiveConfirmOpen(false)}>
          <p className="text-sm leading-6 text-muted-foreground">
            {c.archived
              ? `Restore ${c.courseCode} to your active teaching workspace.`
              : `Archive ${c.courseCode} (${c.courseTitle}). Past sessions and attendance reports remain preserved in read-only history.`}
          </p>
          <div className="mt-5 flex justify-end gap-2">
            <button type="button" className="btn btn-outline" onClick={() => setArchiveConfirmOpen(false)}>Cancel</button>
            <button
              type="button"
              disabled={updateClass.isPending}
              onClick={toggleArchiveClass}
              className="btn btn-primary"
              data-testid="button-confirm-archive-class"
            >
              {updateClass.isPending ? 'Saving…' : c.archived ? 'Restore class' : 'Archive class'}
            </button>
          </div>
        </Modal>
      )}

      {copyOpen && (
        <Modal title="Copy class to new semester" close={() => setCopyOpen(false)}>
          <form onSubmit={handleCopyClass} className="space-y-4">
            <p className="text-xs leading-5 text-muted-foreground">
              Create a new offering of <strong>{c.courseCode} — {c.courseTitle}</strong> using the same programme and level.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-xs font-semibold">
                Target semester
                <select
                  className="field mt-1.5"
                  value={copySemester}
                  onChange={(e) => setCopySemester(e.target.value)}
                  required
                  data-testid="select-copy-semester"
                >
                  {Array.from(
                    new Set([c.semester, ...(learnedAcademic.data?.semesters ?? ['Semester 1', 'Semester 2'])]),
                  ).map((sem) => (
                    <option key={sem} value={sem}>
                      {sem}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-xs font-semibold">
                Academic year
                <select
                  className="field mt-1.5"
                  value={copyAcademicYear}
                  onChange={(e) => setCopyAcademicYear(e.target.value)}
                  required
                  data-testid="select-copy-academic-year"
                >
                  {Array.from(
                    new Set([c.academicYear, ...(learnedAcademic.data?.academicYears ?? [c.academicYear])]),
                  ).map((yr) => (
                    <option key={yr} value={yr}>
                      {yr}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="flex items-start gap-3 rounded-lg border bg-muted/35 p-3 text-xs">
              <input
                type="checkbox"
                checked={copyIncludeRoster}
                onChange={(e) => setCopyIncludeRoster(e.target.checked)}
                className="mt-0.5 accent-primary"
                data-testid="checkbox-copy-include-roster"
              />
              <span>
                <b>Carry over class roster ({roster.data?.rosterCount ?? c.rosterCount} students)</b>
                <span className="mt-1 block text-muted-foreground">
                  Copies enrolled student entries into the new semester class without duplicating past sessions.
                </span>
              </span>
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" className="btn btn-outline" onClick={() => setCopyOpen(false)}>Cancel</button>
              <button
                type="submit"
                disabled={copyClass.isPending}
                className="btn btn-primary"
                data-testid="button-confirm-copy-class"
              >
                {copyClass.isPending ? <LoaderCircle size={15} className="animate-spin" /> : <Copy size={15} />}
                Copy class
              </button>
            </div>
          </form>
        </Modal>
      )}

      {importOpen && <RosterImportModal classId={classId} onClose={() => setImportOpen(false)} />}
      {studentModal.open && (
        <SingleStudentModal
          classId={classId}
          existing={studentModal.target}
          onClose={() => setStudentModal({ open: false })}
        />
      )}
      {removeTarget && (
        <RemoveStudentModal
          classId={classId}
          student={removeTarget}
          onClose={() => setRemoveTarget(null)}
        />
      )}
    </Shell>
  );
}

function SessionPage({ sessionId }: { sessionId: string }) {
  const { toast } = useToast();
  const detail = useGetSession(sessionId, {
    query: {
      queryKey: getGetSessionQueryKey(sessionId),
      refetchInterval: 4000,
    },
  });
  const code = useGetSessionCode(sessionId, {
    query: {
      queryKey: getGetSessionCodeQueryKey(sessionId),
      enabled: detail.data?.session.status === 'open',
      refetchInterval: 5000,
    },
  });
  const review = useGetReviewQueue(sessionId, { query: { queryKey: getGetReviewQueueQueryKey(sessionId) } });
  const activity = useSessionActivity(
    sessionId,
    detail.data?.session.status === 'open' ? 4000 : undefined,
  );
  const openSession = useOpenSession();
  const extendSession = useExtendSession();
  const closeSession = useCloseSession();
  const reopenSession = useReopenSession();
  const finalize = useFinalizeSession();
  const manual = useCreateManualMark();
  const decide = useDecideAttendanceRecord();
  const bulkDecide = useBulkDecideRecords();
  const qc = useQueryClient();

  const [manualOpen, setManualOpen] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [confirmFinalize, setConfirmFinalize] = useState(false);
  const [reopenOpen, setReopenOpen] = useState(false);
  const [reopenReason, setReopenReason] = useState('');
  const [projectorFullscreen, setProjectorFullscreen] = useState(false);
  const [projectorPinned, setProjectorPinned] = useState(false);
  const [qrMode, setQrMode] = useState<'url' | 'payload'>('url');
  const [qrSize, setQrSize] = useState<'normal' | 'large'>('normal');
  const [projectorTheme, setProjectorTheme] = useState<'dark' | 'light'>('dark');
  const [selectedRecordIds, setSelectedRecordIds] = useState<string[]>([]);
  const [studentSearch, setStudentSearch] = useState('');
  const [exportingFormat, setExportingFormat] = useState<'xlsx' | 'csv' | null>(null);
  const [secondsLeft, setSecondsLeft] = useState<number>(0);

  // Screen Wake Lock API to prevent projector display from sleeping during lecture
  useEffect(() => {
    let wakeLockSentinel: { release: () => Promise<void> } | null = null;
    if (projectorFullscreen && 'wakeLock' in navigator) {
      (navigator as unknown as { wakeLock: { request: (type: string) => Promise<{ release: () => Promise<void> }> } }).wakeLock
        .request('screen')
        .then((lock) => {
          wakeLockSentinel = lock;
        })
        .catch(() => {
          // Ignore wake lock denials
        });
    }
    return () => {
      if (wakeLockSentinel) {
        wakeLockSentinel.release().catch(() => {});
      }
    };
  }, [projectorFullscreen]);

  useEffect(() => {
    const serverSeconds = code.data?.rotatesInSeconds ?? 0;
    setSecondsLeft(serverSeconds);
  }, [code.data?.code, code.data?.rotatesInSeconds]);

  const refetchCode = code.refetch;
  useEffect(() => {
    if (detail.data?.session.status !== 'open' || detail.data?.session.codeMode !== 'rotating') {
      return undefined;
    }
    const timer = window.setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          void refetchCode();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [detail.data?.session.status, detail.data?.session.codeMode, refetchCode]);

  const formatCountdown = (sec: number) => {
    const clamped = Math.max(0, sec);
    const mins = Math.floor(clamped / 60);
    const rem = clamped % 60;
    return `${mins}:${String(rem).padStart(2, '0')}`;
  };

  const refresh = () => {
    qc.invalidateQueries({ queryKey: getGetSessionQueryKey(sessionId) });
    qc.invalidateQueries({ queryKey: getGetReviewQueueQueryKey(sessionId) });
    qc.invalidateQueries({ queryKey: getGetSessionCodeQueryKey(sessionId) });
    qc.invalidateQueries({ queryKey: getGetAttendanceOverviewQueryKey() });
    qc.invalidateQueries({ queryKey: lecturerKeys.allSessions });
    qc.invalidateQueries({ queryKey: lecturerKeys.sessionActivity(sessionId) });
  };

  if (detail.isLoading) return <Shell title="Live attendance"><LoadingBlock rows={6} /></Shell>;
  if (detail.isError || !detail.data) return <Shell title="Live attendance"><ErrorState retry={() => detail.refetch()} /></Shell>;

  const { session: s, records } = detail.data;
  const searchQuery = studentSearch.trim().toLowerCase();
  const filteredRecords = searchQuery
    ? records.filter(
        (r) =>
          r.studentName.toLowerCase().includes(searchQuery) ||
          r.indexNumber.toLowerCase().includes(searchQuery),
      )
    : records;

  const activeSelectedIds =
    s.status === 'finalized'
      ? []
      : selectedRecordIds.filter((id) => records.some((r) => r.id === id));
  const allFilteredSelected =
    filteredRecords.length > 0 && filteredRecords.every((r) => activeSelectedIds.includes(r.id));
  const someFilteredSelected =
    filteredRecords.some((r) => activeSelectedIds.includes(r.id)) && !allFilteredSelected;

  const toggleSelectAll = () => {
    const visibleIds = filteredRecords.map((r) => r.id);
    if (allFilteredSelected) {
      setSelectedRecordIds((prev) => prev.filter((id) => !visibleIds.includes(id)));
    } else {
      setSelectedRecordIds((prev) => [...new Set([...prev, ...visibleIds])]);
    }
  };

  const toggleSelectRow = (recordId: string) => {
    setSelectedRecordIds((prev) =>
      prev.includes(recordId) ? prev.filter((id) => id !== recordId) : [...prev, recordId],
    );
  };

  const handleBulkDecision = (status: 'present' | 'absent') => {
    if (!activeSelectedIds.length) return;
    bulkDecide.mutate(
      { sessionId, recordIds: activeSelectedIds, status },
      {
        onSuccess: (res) => {
          setSelectedRecordIds([]);
          refresh();
          toast({
            title: `Marked ${res.updatedCount} ${res.updatedCount === 1 ? 'student' : 'students'} ${status}`,
          });
        },
        onError: () => {
          toast({
            title: 'Bulk update failed',
            description: 'Could not update selected records. Please try again.',
            variant: 'destructive',
          });
        },
      },
    );
  };

  const decideRecord = (record: AttendanceRecord, status: 'present' | 'absent' | 'excused', note?: string) =>
    decide.mutate({ recordId: record.id, data: { status, note: note ?? record.note ?? 'Reviewed by lecturer' } }, { onSuccess: refresh });

  const manualSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    manual.mutate(
      {
        sessionId,
        data: {
          indexNumber: String(f.get('indexNumber')),
          status: String(f.get('status')) as 'present' | 'absent' | 'excused',
          reason: String(f.get('reason')),
        },
      },
      {
        onSuccess: () => {
          refresh();
          setManualOpen(false);
        },
      },
    );
  };

  const handleExtend = (minutes: number) => {
    extendSession.mutate(
      { sessionId, minutes },
      {
        onSuccess: () => {
          refresh();
          toast({ title: `Session extended by ${minutes} minutes` });
        },
      },
    );
  };

  const handleReopen = (e: FormEvent) => {
    e.preventDefault();
    reopenSession.mutate(
      { sessionId, reason: reopenReason.trim() },
      {
        onSuccess: () => {
          refresh();
          setReopenOpen(false);
          setReopenReason('');
          toast({ title: 'Session reopened', description: 'Check-in and mark reviews are active again.' });
        },
      },
    );
  };

  const copySessionLink = async () => {
    const shareUrl = `${window.location.origin}${basePath}/check-in?session=${s.id}`;
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast({
        title: 'Student session link copied',
        description: 'Carries the session ID only — no check-in code included.',
      });
    } catch {
      toast({ title: 'Student session link ready', description: shareUrl });
    }
  };

  const quickAttendanceUrl = `${window.location.origin}${basePath}/check-in?session=${s.id}${
    code.data?.code ? `&code=${encodeURIComponent(code.data.code)}` : ''
  }`;

  const activeQrValue =
    qrMode === 'url'
      ? quickAttendanceUrl
      : (code.data?.qrPayload || code.data?.code || quickAttendanceUrl);

  const downloadQrSvg = (svgId: string, filename: string) => {
    const svgEl = document.getElementById(svgId);
    if (!svgEl) {
      toast({ title: 'QR code graphic not found', variant: 'destructive' });
      return;
    }
    const serializer = new XMLSerializer();
    const source = serializer.serializeToString(svgEl);
    const blob = new Blob([source], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast({ title: 'QR Code downloaded', description: `Saved ${filename}` });
  };

  const copyQuickScanLink = async () => {
    try {
      await navigator.clipboard.writeText(quickAttendanceUrl);
      toast({
        title: 'Quick check-in link copied',
        description: 'Students can open this link directly in their mobile browser to verify attendance.',
      });
    } catch {
      toast({ title: 'Quick check-in link ready', description: quickAttendanceUrl });
    }
  };

  const triggerExport = async (format: 'xlsx' | 'csv') => {
    try {
      setExportingFormat(format);
      await downloadApiFile(
        `/api/sessions/${sessionId}/export?format=${format}`,
        `session-${sessionId.slice(0, 8)}-attendance.${format}`,
      );
    } catch {
      toast({ title: 'Export failed', description: 'Could not download session sheet.', variant: 'destructive' });
    } finally {
      setExportingFormat(null);
    }
  };

  return (
    <Shell title="Live attendance">
      <Link href={`/classes/${s.classId}`} className="mb-5 inline-flex items-center gap-2 text-xs font-semibold text-muted-foreground hover:text-foreground">
        <ArrowLeft size={14} /> Back to class
      </Link>
      <PageHeading
        eyebrow={`${s.venue} · Session ${s.id.slice(0, 8).toUpperCase()} · ${formatDate(s.startsAt)} — ${formatDate(s.endsAt)}`}
        title={s.topic}
        subtitle="Review the roster, resolve uncertain marks, project check-in codes and finalize the record."
        action={
          <div className="flex flex-wrap items-center gap-2">
            {s.status === 'scheduled' && (
              <button
                type="button"
                className="btn btn-primary"
                disabled={openSession.isPending}
                onClick={() => openSession.mutate(sessionId, { onSuccess: refresh })}
                data-testid="button-open-session"
              >
                <Radio size={15} /> {openSession.isPending ? 'Opening…' : 'Open check-in'}
              </button>
            )}
            {(s.status === 'open' || s.status === 'closed') && (
              <button className="btn btn-outline" onClick={() => setManualOpen(true)} data-testid="button-manual-mark">
                <Plus size={15} /> Manual mark
              </button>
            )}
            {(s.status === 'open' || s.status === 'scheduled') && (
              <button
                type="button"
                className="btn btn-outline"
                disabled={extendSession.isPending}
                onClick={() => handleExtend(15)}
                data-testid="button-extend-session"
              >
                <Clock3 size={15} /> +15m
              </button>
            )}
            {s.status === 'open' && (
              <button
                className="btn btn-outline"
                onClick={() => setConfirmClose(true)}
                data-testid="button-close-session"
              >
                Close check-in
              </button>
            )}
            {s.status === 'closed' && (
              <button className="btn btn-primary" onClick={() => setConfirmFinalize(true)} data-testid="button-finalize-session">
                Finalize session <Check size={15} />
              </button>
            )}
            {(s.status === 'closed' || s.status === 'finalized') && (
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => setReopenOpen(true)}
                data-testid="button-reopen-session"
              >
                <RotateCcw size={15} /> Reopen
              </button>
            )}
            <StatusBadge status={s.status} />
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Checked in"
          value={s.checkedInCount}
          note={`of ${s.rosterCount} rostered · ${s.registeredCount ?? s.rosterCount} registered · ${s.faceEnrolledCount ?? 0} face-enrolled`}
          icon={Users}
        />
        <StatCard label="Needs review" value={s.reviewCount} note="Lecturer decision required" icon={Activity} accent />
        <StatCard
          label="Expected"
          value={s.expectedStudents}
          note={s.locationSkipped ? 'Geofence skipped' : `Geofence backup: ${s.radiusM} m`}
          icon={CalendarDays}
        />
        <StatCard
          label="Session Activity"
          value={activity.data?.length ?? 0}
          note="Live audit events recorded"
          icon={Clock3}
        />
      </div>

      <div className="mt-5">
        <SessionProgressChart session={s} records={records} />
      </div>

      <div className="mt-6 grid gap-5 xl:grid-cols-[1fr_.42fr]">
        <section className="surface overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
            <div>
              <div className="eyebrow">Attendance record</div>
              <h2 className="mt-1 font-bold">Session roster</h2>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => exportSessionSheetPdf(s, records)}
                className="btn btn-outline !px-2.5 !py-1.5 !text-xs whitespace-nowrap shrink-0"
                data-testid="button-export-session-pdf"
              >
                <FileText size={13} /> PDF
              </button>
              <button
                type="button"
                disabled={exportingFormat === 'xlsx'}
                onClick={() => void triggerExport('xlsx')}
                className="btn btn-outline !px-2.5 !py-1.5 !text-xs whitespace-nowrap shrink-0"
                data-testid="button-export-session-xlsx"
              >
                <FileSpreadsheet size={13} /> {exportingFormat === 'xlsx' ? 'Exporting…' : 'Excel'}
              </button>
              <button
                type="button"
                disabled={exportingFormat === 'csv'}
                onClick={() => void triggerExport('csv')}
                className="btn btn-outline !px-2.5 !py-1.5 !text-xs whitespace-nowrap shrink-0"
                data-testid="button-export-session-csv"
              >
                <Download size={13} /> {exportingFormat === 'csv' ? 'Downloading…' : 'Download Attendance CSV'}
              </button>
            </div>
          </div>
          {records.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-muted/20 px-5 py-3">
              <div className="relative w-full sm:max-w-xs">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  className="field !py-1.5 pl-9 pr-8 !text-xs"
                  placeholder="Search student name or index…"
                  value={studentSearch}
                  onChange={(e) => setStudentSearch(e.target.value)}
                  data-testid="input-search-session-students"
                />
                {studentSearch && (
                  <button
                    type="button"
                    onClick={() => setStudentSearch('')}
                    aria-label="Clear search"
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground cursor-pointer"
                    data-testid="button-clear-session-search"
                  >
                    <X size={13} />
                  </button>
                )}
              </div>
              <span className="text-xs text-muted-foreground tabular-nums" data-testid="text-session-roster-count">
                {searchQuery
                  ? `Showing ${filteredRecords.length} of ${records.length} students`
                  : `${records.length} ${records.length === 1 ? 'student' : 'students'}`}
              </span>
            </div>
          )}
          {records.length > 0 && activeSelectedIds.length > 0 && s.status !== 'finalized' && (
            <div
              className="flex flex-wrap items-center justify-between gap-3 border-b bg-primary/5 px-5 py-3"
              data-testid="bulk-selection-bar"
            >
              <div className="flex items-center gap-3 text-xs font-semibold">
                <span className="font-mono tabular-nums" data-testid="text-bulk-selected-count">
                  {activeSelectedIds.length} selected
                </span>
                <button
                  type="button"
                  onClick={() => setSelectedRecordIds([])}
                  className="text-muted-foreground underline hover:text-foreground cursor-pointer"
                  data-testid="button-bulk-clear"
                >
                  Clear
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={bulkDecide.isPending}
                  onClick={() => handleBulkDecision('present')}
                  className="btn btn-primary !px-3 !py-1.5 !text-xs whitespace-nowrap"
                  data-testid="button-bulk-mark-present"
                >
                  {bulkDecide.isPending ? <LoaderCircle size={13} className="animate-spin" /> : <Check size={13} />}
                  Mark Present
                </button>
                <button
                  type="button"
                  disabled={bulkDecide.isPending}
                  onClick={() => handleBulkDecision('absent')}
                  className="btn btn-outline !px-3 !py-1.5 !text-xs whitespace-nowrap"
                  data-testid="button-bulk-mark-absent"
                >
                  <X size={13} /> Mark Absent
                </button>
              </div>
            </div>
          )}
          {records.length ? (
            filteredRecords.length ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[740px]">
                  <thead>
                    <tr className="table-head border-b text-left">
                      {s.status !== 'finalized' && (
                        <th className="w-10 pl-5 pr-2 py-3">
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-border accent-primary cursor-pointer"
                            checked={allFilteredSelected}
                            ref={(el) => {
                              if (el) {
                                el.indeterminate = someFilteredSelected;
                              }
                            }}
                            onChange={toggleSelectAll}
                            aria-label="Select all visible students"
                            data-testid="checkbox-select-all-records"
                          />
                        </th>
                      )}
                      <th className={s.status !== 'finalized' ? 'px-3 py-3' : 'px-5 py-3'}>Student</th>
                      <th className="px-3 py-3">Status</th>
                      <th className="px-3 py-3">Match</th>
                      <th className="px-3 py-3">Marked</th>
                      <th className="px-3 py-3">Flags & Notes</th>
                      <th className="px-5 py-3">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {filteredRecords.map((r) => {
                      const isChecked = activeSelectedIds.includes(r.id);
                      const photoSrc = getStudentPhotoUrl(r.photoKey ?? r.portraitKey);
                      const contactParts = [r.studentEmail, r.studentPhone].filter(Boolean);
                      const scoreNum = r.faceScore != null ? Number(r.faceScore) : NaN;
                      return (
                        <tr
                          key={r.id}
                          data-testid={`row-record-${r.id}`}
                        className={isChecked ? 'bg-primary/[0.03]' : undefined}
                      >
                        {s.status !== 'finalized' && (
                          <td className="w-10 pl-5 pr-2 py-3">
                            <input
                              type="checkbox"
                              className="h-4 w-4 rounded border-border accent-primary cursor-pointer"
                              checked={isChecked}
                              onChange={() => toggleSelectRow(r.id)}
                              aria-label={`Select ${r.studentName}`}
                              data-testid={`checkbox-record-${r.id}`}
                            />
                          </td>
                        )}
                        <td className={s.status !== 'finalized' ? 'px-3 py-3' : 'px-5 py-3'}>
                          <div className="flex items-center gap-2.5">
                            {photoSrc ? (
                              <img
                                src={photoSrc}
                                alt={r.studentName}
                                className="h-9 w-9 shrink-0 rounded-lg border object-cover"
                              />
                            ) : (
                              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border bg-muted text-xs font-bold text-muted-foreground">
                                {r.studentName.slice(0, 1).toUpperCase()}
                              </span>
                            )}
                            <div className="min-w-0">
                              <div className="text-sm font-semibold">{r.studentName}</div>
                              <div className="font-mono text-[10px] text-muted-foreground">{r.indexNumber}</div>
                              {contactParts.length > 0 && (
                                <div className="truncate text-[11px] text-muted-foreground">
                                  {contactParts.join(' · ')}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                      <td className="px-3 py-3">
                        <Badge tone={r.status === 'present' ? 'good' : r.status === 'needs_review' ? 'warn' : r.status === 'absent' ? 'bad' : 'neutral'}>
                          {r.status.replace('_', ' ')}
                        </Badge>
                        {s.lateAfterMinutes != null &&
                          r.status === 'present' &&
                          r.markedAt != null &&
                          new Date(r.markedAt).getTime() - new Date(s.startsAt).getTime() > s.lateAfterMinutes * 60000 && (
                            <span className="ml-1.5 inline-flex items-center rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
                              Late
                            </span>
                          )}
                        {r.markedManually && <span className="ml-1.5 text-[10px] text-muted-foreground">manual</span>}
                      </td>
                      <td className="px-3 py-3 font-mono text-xs tabular-nums">
                        {!Number.isNaN(scoreNum) && scoreNum > 0 ? `${Math.round(scoreNum * 100)}%` : '—'}
                      </td>
                      <td className="px-3 py-3 text-xs text-muted-foreground">{r.markedAt ? formatDate(r.markedAt) : '—'}</td>
                      <td className="px-3 py-3 text-xs text-muted-foreground">
                        {r.flags.length > 0 && (
                          <div className="mb-1 flex flex-wrap gap-1">
                            {r.flags.map((flag) => (
                              <span key={flag} className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-foreground">
                                {flag}
                              </span>
                            ))}
                          </div>
                        )}
                        <span>{r.note || (r.flags.length ? '' : '—')}</span>
                      </td>
                      <td className="px-5 py-3">
                        {s.status !== 'finalized' ? (
                          <div className="flex flex-wrap gap-1">
                            <button
                              title="Confirm present"
                              className="rounded-md border px-2 py-1 text-[10px] font-semibold hover:bg-primary/10 cursor-pointer"
                              onClick={() => decideRecord(r, 'present')}
                              data-testid={`button-review-present-${r.id}`}
                            >
                              Present
                            </button>
                            <button
                              title="Mark absent"
                              className="rounded-md border px-2 py-1 text-[10px] font-semibold hover:bg-muted cursor-pointer"
                              onClick={() => decideRecord(r, 'absent')}
                              data-testid={`button-review-absent-${r.id}`}
                            >
                              Absent
                            </button>
                            <button
                              title="Mark excused"
                              className="rounded-md border px-2 py-1 text-[10px] font-semibold hover:bg-muted cursor-pointer"
                              onClick={() => decideRecord(r, 'excused')}
                              data-testid={`button-review-excused-${r.id}`}
                            >
                              Excused
                            </button>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">Locked</span>
                        )}
                      </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            ) : (
              <div className="p-5">
                <EmptyState
                  title="No matching students"
                  body="Try a different student name or index number."
                  action={
                    <button
                      type="button"
                      className="btn btn-outline"
                      onClick={() => setStudentSearch('')}
                    >
                      Clear search
                    </button>
                  }
                />
              </div>
            )
          ) : (
            <div className="p-5">
              <EmptyState title="No attendance marks yet" body="Once this session opens, check-ins will appear here for lecturer review." />
            </div>
          )}
        </section>

        <aside className="space-y-5">
          <section className="surface p-5">
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="eyebrow">Session code & QR</div>
                <h2 className="mt-1 font-bold">Projector display</h2>
              </div>
              <div className="flex items-center gap-1.5">
                {s.status === 'open' && (
                  <>
                    <button
                      type="button"
                      className={`btn !px-2.5 !py-1.5 !text-xs whitespace-nowrap ${projectorPinned ? 'btn-primary' : 'btn-outline'}`}
                      onClick={() => setProjectorPinned((prev) => !prev)}
                      title={projectorPinned ? 'Unpin QR dock from screen' : 'Pin QR dock to screen while working'}
                      data-testid="button-pin-projector"
                    >
                      {projectorPinned ? <PinOff size={13} /> : <Pin size={13} />}
                      {projectorPinned ? 'Pinned' : 'Pin dock'}
                    </button>
                    <button
                      type="button"
                      className="btn btn-outline !px-2.5 !py-1.5 !text-xs whitespace-nowrap"
                      onClick={() => setProjectorFullscreen(true)}
                      data-testid="button-projector-fullscreen"
                    >
                      <Maximize2 size={13} /> Fullscreen
                    </button>
                  </>
                )}
                <button
                  type="button"
                  className="btn btn-outline !px-2.5 !py-1.5 !text-xs whitespace-nowrap"
                  onClick={() => void copySessionLink()}
                  title="Copy student session link (no check-in code)"
                  data-testid="button-share-session-link"
                >
                  <Copy size={13} /> Copy student link
                </button>
              </div>
            </div>
            {s.status !== 'open' ? (
              <p className="mt-4 rounded-lg bg-muted/40 p-3 text-xs leading-5 text-muted-foreground">
                The session is {s.status}, so the check-in code and QR are hidden.
              </p>
            ) : code.isLoading ? (
              <div className="mt-4 h-44 animate-pulse rounded-xl bg-muted" />
            ) : code.isError ? (
              <div className="mt-4"><ErrorState retry={() => code.refetch()} /></div>
            ) : (
              <>
                {/* QR Generation Mode Selector */}
                <div className="mt-4 flex rounded-lg border bg-muted/40 p-0.5 text-xs">
                  <button
                    type="button"
                    onClick={() => setQrMode('url')}
                    className={`flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 font-medium transition-colors ${
                      qrMode === 'url' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                    }`}
                    data-testid="tab-qr-url"
                  >
                    <Smartphone size={13} /> Camera Quick Scan
                  </button>
                  <button
                    type="button"
                    onClick={() => setQrMode('payload')}
                    className={`flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 font-medium transition-colors ${
                      qrMode === 'payload' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                    }`}
                    data-testid="tab-qr-token"
                  >
                    <QrCode size={13} /> Student App Token
                  </button>
                </div>

                <div className="my-4 flex flex-col items-center rounded-xl bg-[#263a43] px-4 py-5 text-center text-white shadow-inner">
                  <div className="relative mb-3 rounded-2xl bg-white p-3.5 shadow-md">
                    <QRCodeSVG
                      id="session-card-qr"
                      value={activeQrValue}
                      size={qrSize === 'large' ? 180 : 144}
                      level="M"
                    />
                  </div>
                  <div className="font-mono text-3xl font-extrabold tracking-[.22em] text-[#f5c556]" data-testid="value-session-code">
                    {code.data?.code || '——'}
                  </div>
                  <div className="mt-1.5 flex items-center gap-1.5 font-mono text-[11px] text-white/70">
                    <span>SESSION · {s.id.slice(0, 8).toUpperCase()}</span>
                    <span>•</span>
                    <span>{qrMode === 'url' ? 'Mobile Camera Scan' : 'App Token'}</span>
                  </div>
                  <div className="mt-2 text-[11px] text-white/80">
                    {qrMode === 'url'
                      ? 'Point phone camera to open fast student check-in'
                      : 'Scan inside the mobile student companion app'}
                  </div>
                </div>

                {/* Quick actions for QR */}
                <div className="flex flex-wrap items-center gap-1.5 text-xs">
                  <button
                    type="button"
                    onClick={() => void copyQuickScanLink()}
                    className="btn btn-outline flex-1 !py-1 !text-xs whitespace-nowrap"
                    title="Copy direct web check-in link"
                    data-testid="button-copy-qr-link"
                  >
                    <ExternalLink size={12} /> Copy link
                  </button>
                  <button
                    type="button"
                    onClick={() => downloadQrSvg('session-card-qr', `session-${s.id.slice(0, 8)}-qr.svg`)}
                    className="btn btn-outline flex-1 !py-1 !text-xs whitespace-nowrap"
                    title="Download vector SVG QR code for slides"
                    data-testid="button-download-qr-svg"
                  >
                    <Download size={12} /> Save SVG
                  </button>
                  <button
                    type="button"
                    onClick={() => setQrSize((prev) => (prev === 'normal' ? 'large' : 'normal'))}
                    className="btn btn-outline !px-2.5 !py-1 !text-xs whitespace-nowrap"
                    title="Toggle QR Code size"
                  >
                    {qrSize === 'normal' ? 'Enlarge' : 'Normal'}
                  </button>
                </div>

                <div className="mt-3.5 flex items-center justify-between text-xs text-muted-foreground tabular-nums">
                  <span>{code.data?.mode === 'rotating' ? 'Rotating 45s code' : 'Static code (lower security)'}</span>
                  {code.data?.mode === 'rotating' && (
                    <span className="font-mono font-semibold text-foreground" data-testid="value-code-countdown">
                      {formatCountdown(secondsLeft)} remaining
                    </span>
                  )}
                </div>
                {s.codeMode === 'static' && (
                  <div className="mt-3 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-medium text-amber-900">
                    <AlertTriangle size={14} className="shrink-0 text-amber-700" />
                    <span>Static code · Lower security (students outside room may share this code)</span>
                  </div>
                )}
                <p className="mt-3 rounded-lg bg-accent/20 p-3 text-[11px] leading-5">
                  {code.data?.securityNotice}
                </p>
              </>
            )}
          </section>

          <section className="surface p-5">
            <div className="eyebrow">Review queue</div>
            <h2 className="mt-1 font-bold">Needs your decision</h2>
            {review.isLoading ? (
              <div className="mt-4"><LoadingBlock rows={2} /></div>
            ) : review.isError ? (
              <div className="mt-4"><ErrorState retry={() => review.refetch()} /></div>
            ) : (
              <ReviewQueuePanel
                records={review.data ?? []}
                sessionStatus={s.status}
                isPending={decide.isPending}
                onDecide={decideRecord}
              />
            )}
          </section>
        </aside>
      </div>

      <div className="mt-6" id="session-activity">
        <SessionActivityTimeline
          events={activity.data ?? []}
          isLoading={activity.isLoading}
          isError={activity.isError}
          onRetry={() => activity.refetch()}
          sessionTopic={s.topic}
          sessionVenue={s.venue}
        />
      </div>

      {/* Pinned Projector View: Remains visible floating on screen while lecturer reviews roster or activity */}
      {projectorPinned && s.status === 'open' && code.data && !projectorFullscreen && (
        <aside
          aria-label="Pinned Projector View"
          className="fixed bottom-5 right-5 z-40 w-72 sm:w-80 rounded-2xl border-2 border-primary/30 bg-background/95 p-4 shadow-2xl backdrop-blur-md transition-all duration-200 animate-in fade-in slide-in-from-bottom-5"
          data-testid="pinned-projector-dock"
        >
          <div className="flex items-center justify-between pb-2 border-b">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
              </span>
              <span className="text-xs font-bold uppercase tracking-wider text-primary">Live QR Dock</span>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setProjectorFullscreen(true)}
                className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                title="Expand to Fullscreen"
              >
                <Maximize2 size={14} />
              </button>
              <button
                type="button"
                onClick={() => setProjectorPinned(false)}
                className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                title="Unpin dock"
              >
                <PinOff size={14} />
              </button>
            </div>
          </div>

          <div className="mt-3 flex items-center gap-3">
            <div className="shrink-0 rounded-xl bg-white p-2 shadow-sm border">
              <QRCodeSVG id="dock-qr-svg" value={activeQrValue} size={90} level="M" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[10px] uppercase font-semibold text-muted-foreground">Session Code</div>
              <div className="font-mono text-2xl font-black tracking-widest text-primary leading-tight">
                {code.data.code}
              </div>
              <div className="mt-1 flex items-center justify-between text-[11px] text-muted-foreground tabular-nums">
                <span>{code.data.mode === 'rotating' ? 'Refreshes' : 'Static'}</span>
                {code.data.mode === 'rotating' && (
                  <span className="font-mono font-semibold text-foreground">{formatCountdown(secondsLeft)}</span>
                )}
              </div>
            </div>
          </div>

          {/* Progress bar */}
          <div className="mt-3 pt-2.5 border-t">
            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
              <span>Attendance</span>
              <span className="font-semibold text-foreground">{s.checkedInCount} / {s.rosterCount} checked in</span>
            </div>
            <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-primary transition-all duration-300"
                style={{ width: `${Math.min(100, Math.round((s.checkedInCount / Math.max(1, s.rosterCount)) * 100))}%` }}
              />
            </div>
            <div className="mt-2.5 flex items-center justify-between gap-2 text-[11px]">
              <button
                type="button"
                onClick={() => void copyQuickScanLink()}
                className="inline-flex items-center gap-1 text-primary hover:underline"
              >
                <Copy size={11} /> Copy scan link
              </button>
              <button
                type="button"
                onClick={() => downloadQrSvg('dock-qr-svg', `session-${s.id.slice(0, 8)}-dock-qr.svg`)}
                className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
              >
                <Download size={11} /> Save SVG
              </button>
            </div>
          </div>
        </aside>
      )}

      {/* Fullscreen Projector Mode */}
      {projectorFullscreen && s.status === 'open' && code.data && (
        <div
          className={`fixed inset-0 z-50 flex flex-col justify-between p-6 sm:p-10 transition-colors duration-200 overflow-y-auto ${
            projectorTheme === 'dark' ? 'bg-[#141f26] text-white' : 'bg-slate-50 text-slate-900'
          }`}
        >
          {/* Top Control Bar */}
          <div className="flex w-full max-w-6xl mx-auto items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="relative flex h-3 w-3">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex h-3 w-3 rounded-full bg-emerald-500" />
                </span>
                <span className={`font-mono text-xs uppercase tracking-widest font-semibold ${projectorTheme === 'dark' ? 'text-emerald-400' : 'text-emerald-600'}`}>
                  Live Projector Mode · {s.venue}
                </span>
              </div>
              <h2 className="mt-1 font-serif text-2xl font-extrabold sm:text-4xl">{s.topic}</h2>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {/* QR Mode switch in fullscreen */}
              <div className={`flex rounded-lg border p-0.5 text-xs ${projectorTheme === 'dark' ? 'border-white/20 bg-white/10 text-white' : 'border-slate-300 bg-white text-slate-800'}`}>
                <button
                  type="button"
                  onClick={() => setQrMode('url')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium transition-colors ${
                    qrMode === 'url'
                      ? (projectorTheme === 'dark' ? 'bg-white/20 text-white' : 'bg-slate-900 text-white')
                      : 'opacity-70 hover:opacity-100'
                  }`}
                >
                  <Smartphone size={13} /> Camera Quick Scan
                </button>
                <button
                  type="button"
                  onClick={() => setQrMode('payload')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium transition-colors ${
                    qrMode === 'payload'
                      ? (projectorTheme === 'dark' ? 'bg-white/20 text-white' : 'bg-slate-900 text-white')
                      : 'opacity-70 hover:opacity-100'
                  }`}
                >
                  <QrCode size={13} /> App Token
                </button>
              </div>

              {/* Theme toggle */}
              <button
                type="button"
                onClick={() => setProjectorTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))}
                className={`btn !px-3 !py-2 !text-xs ${projectorTheme === 'dark' ? 'bg-white/10 text-white hover:bg-white/20' : 'bg-slate-200 text-slate-900 hover:bg-slate-300'}`}
                title={projectorTheme === 'dark' ? 'Switch to High Contrast Light' : 'Switch to Dark Mode'}
              >
                {projectorTheme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
              </button>

              {/* Pin to Page & Exit Fullscreen */}
              <button
                type="button"
                onClick={() => {
                  setProjectorPinned(true);
                  setProjectorFullscreen(false);
                }}
                className={`btn !px-3 !py-2 !text-xs ${projectorTheme === 'dark' ? 'bg-white/10 text-white hover:bg-white/20' : 'bg-slate-200 text-slate-900 hover:bg-slate-300'}`}
                title="Pin QR code dock to Session Page and exit fullscreen"
              >
                <Pin size={15} /> Pin to page
              </button>

              {/* Exit Fullscreen */}
              <button
                type="button"
                onClick={() => setProjectorFullscreen(false)}
                className={`btn font-semibold !px-3.5 !py-2 !text-xs ${projectorTheme === 'dark' ? 'bg-white/20 text-white hover:bg-white/30' : 'bg-slate-900 text-white hover:bg-slate-800'}`}
                data-testid="button-exit-projector"
              >
                <Minimize2 size={15} /> Exit projector
              </button>
            </div>
          </div>

          {/* Main Centered Stage */}
          <div className="my-auto flex flex-col items-center justify-center gap-6 py-6 text-center">
            <div className="relative group rounded-3xl bg-white p-6 shadow-2xl ring-8 ring-white/10">
              <QRCodeSVG
                id="fullscreen-projector-qr"
                value={activeQrValue}
                size={280}
                level="M"
              />
            </div>

            <div>
              <div className="text-xs uppercase font-mono tracking-widest opacity-70 mb-1">
                {qrMode === 'url' ? 'Scan QR with phone camera OR enter 6-digit code' : 'Scan in student app'}
              </div>
              <div className={`font-mono text-6xl font-black tracking-[.25em] sm:text-8xl ${projectorTheme === 'dark' ? 'text-[#f5c556]' : 'text-amber-600'}`}>
                {code.data.code}
              </div>
            </div>

            {/* Attendance & Countdown Bar */}
            <div className={`flex flex-wrap items-center justify-center gap-6 rounded-2xl px-6 py-3 text-sm tabular-nums shadow-lg ${
              projectorTheme === 'dark' ? 'bg-white/5 border border-white/10 text-white/85' : 'bg-white border border-slate-200 text-slate-800'
            }`}>
              <span className="font-mono">
                SESSION ID: <strong className="font-bold">{s.id.slice(0, 8).toUpperCase()}</strong>
              </span>
              <span className="h-4 w-px bg-current opacity-20" />
              <span>
                Checked in: <strong>{s.checkedInCount}</strong> of <strong>{s.rosterCount}</strong> ({Math.min(100, Math.round((s.checkedInCount / Math.max(1, s.rosterCount)) * 100))}%)
              </span>
              <span className="h-4 w-px bg-current opacity-20" />
              {code.data.mode === 'rotating' ? (
                <div className="flex items-center gap-2">
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-500" />
                  </span>
                  <span className="font-mono font-bold">
                    Code refreshes in {formatCountdown(secondsLeft)}
                  </span>
                </div>
              ) : (
                <span className="rounded-md bg-amber-400/20 px-2.5 py-0.5 text-xs font-semibold text-amber-500">
                  Static code · Lower security
                </span>
              )}
            </div>

            {/* Step-by-step student instructions */}
            <div className={`max-w-xl rounded-xl p-4 text-xs leading-relaxed ${
              projectorTheme === 'dark' ? 'bg-white/5 border border-white/10 text-white/70' : 'bg-white border border-slate-200 text-slate-600'
            }`}>
              <div className="font-bold mb-1 uppercase tracking-wider text-[10px]">How to submit attendance:</div>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4 text-left sm:text-center">
                <span>1. Point phone camera at QR code</span>
                <span className="hidden sm:inline">→</span>
                <span>2. Open browser and type student index</span>
                <span className="hidden sm:inline">→</span>
                <span>3. Submit to record verified presence</span>
              </div>
            </div>
          </div>

          {/* Bottom Bar */}
          <div className="flex w-full max-w-6xl mx-auto flex-wrap items-center justify-between gap-3 pt-4 border-t border-current/10 text-xs opacity-75">
            <div className="flex items-center gap-4">
              <span>Direct Link: <code className="font-mono">{window.location.origin}{basePath}/check-in?session={s.id.slice(0, 8)}…</code></span>
              <button
                type="button"
                onClick={() => void copyQuickScanLink()}
                className="underline hover:opacity-100"
              >
                Copy link
              </button>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => downloadQrSvg('fullscreen-projector-qr', `session-${s.id.slice(0, 8)}-projector-qr.svg`)}
                className="inline-flex items-center gap-1.5 hover:opacity-100"
              >
                <Download size={13} /> Download SVG for slides
              </button>
              <span>•</span>
              <span>Screen Wake Lock active</span>
            </div>
          </div>
        </div>
      )}

      {manualOpen && (
        <Modal title="Record a manual mark" close={() => setManualOpen(false)}>
          <form onSubmit={manualSubmit} className="space-y-4">
            <Field label="Student index number" name="indexNumber" placeholder="5231007" required />
            <label className="block text-xs font-semibold">
              Attendance decision
              <select className="field mt-1.5" name="status">
                <option value="present">Present</option>
                <option value="absent">Absent</option>
                <option value="excused">Excused</option>
              </select>
            </label>
            <label className="block text-xs font-semibold">
              Reason for manual mark
              <textarea
                className="field mt-1.5 min-h-24"
                name="reason"
                placeholder="Briefly record why this mark is being entered manually (e.g. dead phone battery, verified student ID)."
                minLength={3}
                maxLength={500}
                required
                data-testid="input-manual-reason"
              />
            </label>
            {manual.isError && <InlineError text="Manual mark could not be saved. Verify the index number is on the roster and has no existing mark." />}
            <div className="flex justify-end gap-2">
              <button type="button" className="btn btn-outline" onClick={() => setManualOpen(false)}>Cancel</button>
              <button className="btn btn-primary" disabled={manual.isPending} data-testid="button-submit-manual-mark">
                {manual.isPending ? 'Saving…' : 'Save manual mark'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {confirmClose && (
        <Modal title="Close check-in window?" close={() => setConfirmClose(false)}>
          <p className="text-sm leading-6 text-muted-foreground">
            Closing check-in hides the QR and typed code so new students can no longer submit self check-ins. You can still review flagged records or add manual marks before finalization.
          </p>
          <div className="mt-5 flex justify-end gap-2">
            <button type="button" className="btn btn-outline" onClick={() => setConfirmClose(false)}>Keep open</button>
            <button
              type="button"
              disabled={closeSession.isPending}
              onClick={() =>
                closeSession.mutate(
                  { sessionId },
                  {
                    onSuccess: () => {
                      refresh();
                      setConfirmClose(false);
                    },
                  },
                )
              }
              className="btn btn-primary"
              data-testid="button-confirm-close-session"
            >
              {closeSession.isPending ? 'Closing…' : 'Close check-in'}
            </button>
          </div>
        </Modal>
      )}

      {confirmFinalize && (
        <Modal title="Finalize attendance" close={() => setConfirmFinalize(false)}>
          <p className="text-sm leading-6 text-muted-foreground">
            Finalising locks this session’s attendance record and marks any unmarked roster student as Absent.
          </p>
          <div className="mt-4 rounded-lg bg-accent/20 p-3 text-xs">
            Current review queue: <b>{s.reviewCount}</b>. Resolve any uncertain marks first where possible.
          </div>
          {finalize.isError && <div className="mt-3"><InlineError text="The session could not be finalised." /></div>}
          <div className="mt-5 flex justify-end gap-2">
            <button className="btn btn-outline" onClick={() => setConfirmFinalize(false)}>Not yet</button>
            <button
              className="btn btn-primary"
              disabled={finalize.isPending}
              onClick={() => finalize.mutate({ sessionId }, { onSuccess: () => { refresh(); setConfirmFinalize(false); } })}
              data-testid="button-confirm-finalize"
            >
              {finalize.isPending ? 'Finalising…' : 'Finalize session'} <Check size={15} />
            </button>
          </div>
        </Modal>
      )}

      {reopenOpen && (
        <Modal title="Reopen attendance session" close={() => setReopenOpen(false)}>
          <p className="text-xs leading-5 text-muted-foreground">
            Reopening unlocks attendance reviews and extends check-in if needed. Enter a brief reason for the audit log.
          </p>
          <form onSubmit={handleReopen} className="mt-4 space-y-4">
            <label className="block text-xs font-semibold">
              Reason for reopening
              <textarea
                className="field mt-1.5 min-h-24"
                value={reopenReason}
                onChange={(e) => setReopenReason(e.target.value)}
                placeholder="e.g. Late arrival batch from lab overflow or unresolved review record."
                required
                minLength={3}
                data-testid="input-reopen-reason"
              />
            </label>
            {reopenSession.isError && <InlineError text="Could not reopen this session." />}
            <div className="flex justify-end gap-2">
              <button type="button" className="btn btn-outline" onClick={() => setReopenOpen(false)}>Cancel</button>
              <button type="submit" disabled={reopenSession.isPending} className="btn btn-primary" data-testid="button-confirm-reopen">
                {reopenSession.isPending ? 'Reopening…' : 'Reopen session'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </Shell>
  );
}

function SessionsPage() {
  return (
    <Shell title="Sessions">
      <PageHeading
        eyebrow="Live & scheduled"
        title="Attendance sessions"
        subtitle="Jump into an open check-in room, resolve review queues or inspect finalized records across classes."
      />
      <SessionsPageContent />
    </Shell>
  );
}

function SettingsPage() {
  return (
    <Shell title="Settings">
      <PageHeading
        eyebrow="Account"
        title="Lecturer settings"
        subtitle="Manage your institutional profile, staff ID and teaching departments."
      />
      <SettingsPageContent />
    </Shell>
  );
}

function ReportsPage() {
  const classes = useListClasses();
  const [threshold, setThreshold] = useState(75);
  return (
    <Shell title="Reports">
      <PageHeading
        eyebrow="Patterns worth a closer look"
        title="Attendance reports"
        subtitle="Review student attendance trends, flag those below your threshold and export PDF, Excel or CSV sheets."
        action={<ReportsControls threshold={threshold} onThresholdChange={setThreshold} />}
      />
      {classes.isLoading ? (
        <div className="grid gap-4 xl:grid-cols-2"><LoadingBlock /><LoadingBlock /></div>
      ) : classes.isError ? (
        <ErrorState retry={() => classes.refetch()} />
      ) : classes.data?.length ? (
        <div className="grid gap-5 xl:grid-cols-2">
          {classes.data.map(c => <ReportCardEnhanced key={c.id} item={c} threshold={threshold} />)}
        </div>
      ) : (
        <EmptyState
          title="No class reports yet"
          body="Create a class and record attendance sessions before reports can show patterns."
          action={<Link href="/classes" className="btn btn-primary">Open classes <ArrowRight size={15} /></Link>}
        />
      )}
    </Shell>
  );
}

function Router() {
  const [location] = useLocation();
  return (
    <ErrorBoundary resetKey={location}>
      <Switch>
        <Route path="/">
          <Show when="signed-in"><Redirect to="/app" /></Show>
          <Show when="signed-out"><Home /></Show>
        </Route>
        <Route path="/sign-in/*?" component={SignInPage} />
        <Route path="/sign-up/*?" component={SignUpPage} />
        <Route path="/check-in" component={StudentCheckinPage} />
        <Route path="/app"><Guard><Dashboard /></Guard></Route>
        <Route path="/classes"><Guard><ClassesPage /></Guard></Route>
        <Route path="/classes/:classId">{(params: { classId?: string } | undefined) => <Guard><ClassPage classId={params ? (params.classId ?? '') : ''} /></Guard>}</Route>
        <Route path="/sessions"><Guard><SessionsPage /></Guard></Route>
        <Route path="/sessions/:sessionId">{(params: { sessionId?: string } | undefined) => <Guard><SessionPage sessionId={params ? (params.sessionId ?? '') : ''} /></Guard>}</Route>
        <Route path="/reports"><Guard><ReportsPage /></Guard></Route>
        <Route path="/settings"><Guard><SettingsPage /></Guard></Route>
        <Route path="/admin/login" component={AdminLoginPage} />
        <Route path="/admin/dashboard">
          <AdminGuard><AdminPortal /></AdminGuard>
        </Route>
        <Route path="/admin">
          <AdminGuard><AdminPortal /></AdminGuard>
        </Route>
        <Route component={NotFound} />
      </Switch>
    </ErrorBoundary>
  );
}

function App() {
  const [isSignedIn, setIsSignedIn] = useState(true);
  const [user, setUser] = useState<MockUser>(defaultUser);

  return (
    <TooltipProvider>
      <MockAuthContext.Provider
        value={{
          isSignedIn,
          user,
          setUser,
          signOut: () => setIsSignedIn(false),
          signIn: () => setIsSignedIn(true),
        }}
      >
        <WouterRouter base={basePath}>
          <QueryClientProvider client={queryClient}>
            <AdminAuthProvider>
              <Router />
            </AdminAuthProvider>
          </QueryClientProvider>
        </WouterRouter>
        <Toaster />
      </MockAuthContext.Provider>
    </TooltipProvider>
  );
}

export default App;
