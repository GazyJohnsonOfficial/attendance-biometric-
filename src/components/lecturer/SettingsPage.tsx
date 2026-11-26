import { useEffect, useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { Check, KeyRound, LoaderCircle, LogOut, MailCheck, ShieldCheck } from 'lucide-react';
import {
  confirmLecturerPasswordReset,
  lecturerKeys,
  logoutAllDevices,
  requestLecturerPasswordReset,
  useLearnedDepartments,
  useLecturerProfile,
  useUpdateLecturerProfile,
} from '@/lib/lecturerApi';
import { setMemoryAuthToken } from '@/components/admin/AdminPortal';
import { useClerk } from '@/App';
import { useToast } from '@/hooks/use-toast';

export function SettingsPageContent() {
  const qc = useQueryClient();
  const [, setLocation] = useLocation();
  const { signOut } = useClerk();
  const { toast } = useToast();
  const profile = useLecturerProfile();
  const learnedDepts = useLearnedDepartments();
  const update = useUpdateLecturerProfile();

  const [staffId, setStaffId] = useState('');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [selectedDepartments, setSelectedDepartments] = useState<string[]>([]);
  const [loggingOutAll, setLoggingOutAll] = useState(false);

  const [resetOpen, setResetOpen] = useState(false);
  const [resetStep, setResetStep] = useState<'request' | 'confirm'>('request');
  const [resetCode, setResetCode] = useState('');
  const [resetNewPassword, setResetNewPassword] = useState('');
  const [resetBusy, setResetBusy] = useState(false);
  const [resetHint, setResetHint] = useState('');

  useEffect(() => {
    if (!profile.data) return;
    setStaffId(profile.data.staffId);
    setFullName(profile.data.fullName);
    setEmail(profile.data.email);
    setPhone(profile.data.phone);
    setSelectedDepartments(profile.data.departments ?? []);
  }, [profile.data]);

  if (profile.isLoading) {
    return <div className="h-64 animate-pulse rounded-xl bg-muted/70" />;
  }

  if (profile.isError || !profile.data) {
    return (
      <div className="surface p-6 text-sm text-muted-foreground">
        Couldn’t load lecturer profile.{' '}
        <button className="underline text-primary cursor-pointer" onClick={() => profile.refetch()}>
          Retry
        </button>
      </div>
    );
  }

  const availableDepartments = Array.from(
    new Set([...(learnedDepts.data ?? []), ...selectedDepartments]),
  );

  const toggleDepartment = (dept: string) => {
    setSelectedDepartments((prev) =>
      prev.includes(dept) ? prev.filter((item) => item !== dept) : [...prev, dept],
    );
  };

  const handleSave = (e: FormEvent) => {
    e.preventDefault();
    if (selectedDepartments.length === 0) {
      toast({
        title: 'Department required',
        description: 'Select at least one active department.',
        variant: 'destructive',
      });
      return;
    }
    update.mutate(
      {
        staffId: staffId.trim(),
        fullName: fullName.trim(),
        email: email.trim(),
        phone: phone.trim(),
        departments: selectedDepartments,
      },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: lecturerKeys.profile });
          toast({ title: 'Profile updated', description: 'Your lecturer settings have been saved.' });
        },
        onError: (err) => {
          toast({
            title: 'Update failed',
            description: err instanceof Error ? err.message : 'Please check your institutional email and departments.',
            variant: 'destructive',
          });
        },
      },
    );
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[1.2fr_.8fr]">
      <section className="surface p-6">
        <div className="eyebrow">Lecturer profile</div>
        <h2 className="mt-1 font-serif text-xl font-extrabold">Account & teaching details</h2>
        <form onSubmit={handleSave} className="mt-5 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-xs font-semibold">
              Staff ID
              <input
                className="field mt-1.5 font-mono"
                value={staffId}
                onChange={(e) => setStaffId(e.target.value)}
                required
                data-testid="input-profile-staff-id"
              />
            </label>
            <label className="block text-xs font-semibold">
              Full name
              <input
                className="field mt-1.5"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
                data-testid="input-profile-name"
              />
            </label>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-xs font-semibold">
              Institutional email
              <input
                className="field mt-1.5"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                data-testid="input-profile-email"
              />
            </label>
            <label className="block text-xs font-semibold">
              Phone number
              <input
                className="field mt-1.5"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
                data-testid="input-profile-phone"
              />
            </label>
          </div>
          <div>
            <span className="block text-xs font-semibold">Departments (admin-managed list)</span>
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
                  >
                    {dept}
                  </button>
                );
              })}
            </div>
          </div>
          {update.isError && (
            <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs text-destructive">
              {update.error instanceof Error ? update.error.message : 'Could not update profile. Please verify your fields.'}
            </div>
          )}
          <div className="pt-2">
            <button type="submit" disabled={update.isPending} className="btn btn-primary" data-testid="button-save-profile">
              {update.isPending ? <LoaderCircle size={15} className="animate-spin" /> : <Check size={15} />}
              Save profile
            </button>
          </div>
        </form>
      </section>

      <aside className="space-y-4">
        <section className="surface p-5">
          <div className="eyebrow">Verification status</div>
          {(() => {
            const st = profile.data.reviewStatus;
            const isApproved = st === 'kept' || st === 'approved';
            const isRemoved = st === 'removed' || st === 'suspended';
            const title = isApproved
              ? 'Approved'
              : isRemoved
                ? 'Removed'
                : 'Not yet reviewed';
            const subtitle = isApproved
              ? 'Approved for class & session management'
              : isRemoved
                ? 'Access restricted by institution administrator'
                : 'Instant access enabled · Admin reviews accounts later';
            const iconCls = isApproved
              ? 'bg-emerald-50 text-emerald-700'
              : isRemoved
                ? 'bg-red-50 text-red-700'
                : 'bg-amber-50 text-amber-700';
            return (
              <div className="mt-3 flex items-center gap-3">
                <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${iconCls}`}>
                  <ShieldCheck size={19} />
                </span>
                <div>
                  <div className="text-sm font-bold" data-testid="text-review-status">{title}</div>
                  <div className="text-xs text-muted-foreground">{subtitle}</div>
                </div>
              </div>
            );
          })()}
          <div className="mt-4 flex items-center gap-2 border-t pt-3 text-xs text-muted-foreground">
            <MailCheck size={14} className="text-primary" />
            <span>{profile.data.emailVerified ? 'Institutional email verified' : 'Email verification pending'}</span>
          </div>
        </section>

        <section className="surface p-5">
          <div className="eyebrow">Account Security</div>
          <h3 className="mt-1 text-sm font-bold">Password & active sessions</h3>
          <p className="mt-1.5 text-xs leading-5 text-muted-foreground">
            Reset your institutional password or revoke active sign-in sessions across all browsers and devices.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                setResetOpen((prev) => !prev);
                setResetStep('request');
                setResetCode('');
                setResetNewPassword('');
                setResetHint('');
              }}
              className="btn btn-outline !px-3 !py-1.5 !text-xs whitespace-nowrap shrink-0"
              data-testid="button-settings-reset-password"
            >
              <KeyRound size={13} /> Reset password
            </button>
            <button
              type="button"
              disabled={loggingOutAll}
              onClick={async () => {
                setLoggingOutAll(true);
                try {
                  const res = await logoutAllDevices();
                  setMemoryAuthToken(null);
                  signOut();
                  toast({
                    title: 'Signed out of all devices',
                    description: `Revoked ${res.revokedSessions} active session(s).`,
                  });
                  setLocation('/sign-in');
                } catch (err) {
                  toast({
                    title: 'Could not revoke sessions',
                    description: err instanceof Error ? err.message : 'Please try again.',
                    variant: 'destructive',
                  });
                } finally {
                  setLoggingOutAll(false);
                }
              }}
              className="btn btn-outline !px-3 !py-1.5 !text-xs whitespace-nowrap shrink-0"
              data-testid="button-logout-all-devices"
            >
              {loggingOutAll ? <LoaderCircle size={13} className="animate-spin" /> : <LogOut size={13} />}
              Log out of all devices
            </button>
          </div>

          {resetOpen && (
            <div className="mt-4 rounded-xl border bg-muted/30 p-3.5 space-y-3">
              {resetStep === 'request' ? (
                <>
                  <p className="text-xs text-muted-foreground">
                    We will issue a 6-digit verification code for <b className="text-foreground">{email}</b>.
                  </p>
                  <button
                    type="button"
                    disabled={resetBusy || !email.trim()}
                    onClick={async () => {
                      setResetBusy(true);
                      try {
                        const res = await requestLecturerPasswordReset(email.trim());
                        if (res.previewResetCode) {
                          setResetHint(res.previewResetCode);
                          setResetCode(res.previewResetCode);
                        }
                        setResetStep('confirm');
                        toast({ title: 'Reset code issued', description: res.message });
                      } catch (err) {
                        toast({
                          title: 'Reset failed',
                          description: err instanceof Error ? err.message : 'Please check your email.',
                          variant: 'destructive',
                        });
                      } finally {
                        setResetBusy(false);
                      }
                    }}
                    className="btn btn-primary !px-3 !py-1.5 !text-xs"
                    data-testid="button-send-settings-reset-code"
                  >
                    {resetBusy ? 'Sending…' : 'Send reset code'}
                  </button>
                </>
              ) : (
                <div className="space-y-2.5">
                  {resetHint && (
                    <div className="rounded bg-primary/10 px-2.5 py-1.5 font-mono text-[11px] text-primary">
                      Preview reset code: {resetHint}
                    </div>
                  )}
                  <input
                    className="field !py-1.5 font-mono !text-xs"
                    placeholder="6-digit reset code"
                    value={resetCode}
                    onChange={(e) => setResetCode(e.target.value)}
                    maxLength={6}
                  />
                  <input
                    className="field !py-1.5 !text-xs"
                    type="password"
                    placeholder="New password (6+ characters)"
                    value={resetNewPassword}
                    onChange={(e) => setResetNewPassword(e.target.value)}
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="btn btn-outline !px-3 !py-1.5 !text-xs"
                      onClick={() => setResetOpen(false)}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={resetBusy || resetCode.trim().length !== 6 || resetNewPassword.length < 6}
                      onClick={async () => {
                        setResetBusy(true);
                        try {
                          await confirmLecturerPasswordReset({
                            email: email.trim(),
                            code: resetCode.trim(),
                            newPassword: resetNewPassword,
                          });
                          setResetOpen(false);
                          toast({
                            title: 'Password updated',
                            description: 'Your password was changed and older sessions were signed out.',
                          });
                        } catch (err) {
                          toast({
                            title: 'Reset failed',
                            description: err instanceof Error ? err.message : 'Check code and password.',
                            variant: 'destructive',
                          });
                        } finally {
                          setResetBusy(false);
                        }
                      }}
                      className="btn btn-primary !px-3 !py-1.5 !text-xs"
                      data-testid="button-confirm-settings-reset"
                    >
                      {resetBusy ? 'Saving…' : 'Confirm new password'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </section>

        <section className="rounded-xl bg-[#263a43] p-5 text-white">
          <div className="eyebrow !text-white/55">Audit & Privacy Controls</div>
          <p className="mt-3 text-xs leading-6 text-white/75">
            All roster edits, photo confirmations, disputes, manual attendance overrides, and session reopen actions are recorded in your immutable lecturer audit log.
          </p>
        </section>
      </aside>
    </div>
  );
}
