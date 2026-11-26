import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation, Link } from 'wouter';
import { ShieldCheck, ArrowRight, Lock, Mail, Eye, EyeOff, LoaderCircle, KeyRound, Smartphone } from 'lucide-react';
import {
  claimAdminPassword,
  fetchAuthStatus,
  loginUnified,
  verifyTwoFactor,
  type AuthLoginSuccessResponse,
} from '@/lib/lecturerApi';
import { useAdminAuth } from './AdminPortal';

export function AdminLoginPage() {
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const { adminSignIn } = useAdminAuth();

  const [email, setEmail] = useState('admin@school.edu.gh');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');

  // 2FA challenge state
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [previewCodeHint, setPreviewCodeHint] = useState<string | null>(null);

  const authStatusQuery = useQuery({
    queryKey: ['auth-status'],
    queryFn: fetchAuthStatus,
  });

  const authStatus = authStatusQuery.data;
  const needsFirstRunSetup = Boolean(authStatus && !authStatus.adminPasswordConfigured);
  const previewDemoAvailable = Boolean(authStatus?.previewDemoAvailable);

  const completeSignIn = (res: AuthLoginSuccessResponse) => {
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
    qc.invalidateQueries({ queryKey: ['auth-status'] });
    setLocation('/admin/dashboard');
  };

  const loginMutation = useMutation({
    mutationFn: loginUnified,
    onSuccess: (res) => {
      if ('challengeId' in res) {
        setChallengeId(res.challengeId);
        setPreviewCodeHint(res.previewTwoFactorCode ?? null);
        setTwoFactorCode(res.previewTwoFactorCode ?? '');
        return;
      }
      completeSignIn(res);
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : 'Unable to sign in.');
    },
  });

  const twoFactorMutation = useMutation({
    mutationFn: verifyTwoFactor,
    onSuccess: completeSignIn,
    onError: (err) => {
      setError(err instanceof Error ? err.message : 'Invalid verification code.');
    },
  });

  const claimMutation = useMutation({
    mutationFn: claimAdminPassword,
    onSuccess: completeSignIn,
    onError: (err) => {
      setError(err instanceof Error ? err.message : 'Could not set admin password.');
    },
  });

  const isBusy = loginMutation.isPending || claimMutation.isPending || twoFactorMutation.isPending;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (challengeId) {
      twoFactorMutation.mutate({ challengeId, code: twoFactorCode.trim() });
      return;
    }

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setError('Enter your administrator email address.');
      return;
    }

    if (needsFirstRunSetup) {
      if (password.length < 6) {
        setError('Create an admin password of at least 6 characters (or click Demo Sign In below).');
        return;
      }
      claimMutation.mutate({ email: trimmedEmail, password });
      return;
    }

    if (!password) {
      setError('Enter your administrator password.');
      return;
    }

    loginMutation.mutate({
      email: trimmedEmail,
      password,
      accountType: 'admin',
    });
  };

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-md rounded-2xl border bg-card p-8 shadow-lg">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary text-primary-foreground shadow-sm">
            <ShieldCheck size={22} />
          </div>
          <div>
            <div className="eyebrow">Institutional Administration</div>
            <h1 className="font-serif text-xl font-extrabold">
              {challengeId
                ? 'Two-Factor Verification'
                : needsFirstRunSetup
                  ? 'Set Admin Password & Sign In'
                  : 'Admin Portal Sign In'}
            </h1>
          </div>
        </div>

        <p className="mt-3 text-xs text-muted-foreground leading-relaxed">
          {challengeId
            ? 'Enter the 6-digit verification code from your authenticator app or email.'
            : needsFirstRunSetup
              ? 'No admin password is set yet. Choose a password (at least 6 characters) to claim administrator access, or continue directly in preview demo mode.'
              : 'Authorized campus administrators only. Sign in with your administrative credentials to manage reference data, lecturer approvals, and system oversight.'}
        </p>

        {needsFirstRunSetup && !challengeId && (
          <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-900 dark:text-emerald-200">
            <KeyRound size={15} className="mt-0.5 shrink-0 text-emerald-700 dark:text-emerald-400" />
            <div>
              <strong className="block font-semibold">First-run setup ready</strong>
              <span>
                Use <code className="font-mono font-semibold">admin@school.edu.gh</code> (Super Admin) or{' '}
                <code className="font-mono font-semibold">dept.admin@school.edu.gh</code> (CS Dept Admin).
              </span>
            </div>
          </div>
        )}

        {challengeId && previewCodeHint && (
          <div className="mt-4 rounded-xl border border-primary/25 bg-primary/5 p-3 text-xs">
            Preview 2FA verification code: <strong className="font-mono">{previewCodeHint}</strong>
          </div>
        )}

        {error && (
          <div className="mt-4 rounded-lg bg-destructive/10 p-3 text-xs font-semibold text-destructive" role="alert">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          {challengeId ? (
            <label className="block text-xs font-semibold">
              6-digit verification code
              <div className="relative mt-1.5">
                <Smartphone size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  className="field pl-9 font-mono tracking-widest"
                  value={twoFactorCode}
                  onChange={(e) => setTwoFactorCode(e.target.value)}
                  placeholder="123456"
                  required
                  autoFocus
                  data-testid="input-admin-2fa-code"
                />
              </div>
            </label>
          ) : (
            <>
              <label className="block text-xs font-semibold">
                Admin Email
                <div className="relative mt-1.5">
                  <Mail size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="email"
                    className="field pl-9"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="admin@school.edu.gh"
                    required
                    data-testid="input-admin-email"
                  />
                </div>
              </label>

              <label className="block text-xs font-semibold">
                {needsFirstRunSetup ? 'Create Admin Password (min 6 chars)' : 'Admin Password'}
                <div className="relative mt-1.5">
                  <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    className="field pl-9 pr-10"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={needsFirstRunSetup ? 'Choose a password (6+ characters)' : 'Enter your password'}
                    required={!previewDemoAvailable}
                    data-testid="input-admin-password"
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
              </label>
            </>
          )}

          <button
            type="submit"
            disabled={isBusy}
            className="btn btn-primary w-full whitespace-nowrap shrink-0"
            data-testid="button-admin-signin"
          >
            {isBusy ? <LoaderCircle size={15} className="animate-spin" /> : null}
            {challengeId
              ? 'Verify 2FA & Open Portal'
              : needsFirstRunSetup
                ? 'Set Password & Sign In'
                : 'Sign in to Admin Portal'}{' '}
            <ArrowRight size={15} />
          </button>

          {challengeId && (
            <button
              type="button"
              className="btn btn-outline w-full"
              onClick={() => {
                setChallengeId(null);
                setTwoFactorCode('');
                setPreviewCodeHint(null);
              }}
            >
              Back to password sign-in
            </button>
          )}
        </form>

        <div className="mt-6 border-t pt-5 space-y-2.5">
          {previewDemoAvailable && !challengeId && (
            <button
              type="button"
              disabled={isBusy}
              className="btn btn-outline w-full"
              onClick={() => {
                setError('');
                loginMutation.mutate({
                  email: email.trim() || 'admin@school.edu.gh',
                  accountType: 'admin',
                  demo: true,
                });
              }}
              data-testid="button-mock-admin-signin"
            >
              Continue as Super Admin (Demo · No Password) <ArrowRight size={15} />
            </button>
          )}

          <div className="pt-2 text-center space-y-2">
            <div>
              <Link href="/sign-in" className="text-xs font-semibold text-primary hover:underline">
                Use shared Staff &amp; Admin Sign In →
              </Link>
            </div>
            <div>
              <Link href="/" className="text-xs font-semibold text-muted-foreground hover:text-foreground">
                ← Return to Lecturer Workspace &amp; Student Portal
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
