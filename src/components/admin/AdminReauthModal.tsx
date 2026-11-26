import { useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Lock, ShieldAlert, X, LoaderCircle } from 'lucide-react';
import { customFetch } from '@/api-client-react/custom-fetch';
import { fetchAuthStatus } from '@/lib/lecturerApi';

export interface PendingReauthRequest {
  actionLabel: string;
  onVerified: (reauthToken: string) => void | Promise<void>;
}

export function useAdminReauth() {
  const [pending, setPending] = useState<PendingReauthRequest | null>(null);

  const requireReauth = (
    actionLabel: string,
    onVerified: (reauthToken: string) => void | Promise<void>,
  ) => {
    setPending({ actionLabel, onVerified });
  };

  return {
    pendingReauth: pending,
    closeReauth: () => setPending(null),
    requireReauth,
  };
}

export function AdminReauthModal({
  request,
  onClose,
}: {
  request: PendingReauthRequest | null;
  onClose: () => void;
}) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const authStatus = useQuery({
    queryKey: ['auth-status'],
    queryFn: fetchAuthStatus,
    enabled: Boolean(request),
  });

  if (!request) return null;

  const passwordConfigured = Boolean(authStatus.data?.adminPasswordConfigured);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const res = await customFetch<{ reauthToken: string; expiresInSeconds: number }>(
        '/api/auth/reauth',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(
            passwordConfigured ? { password } : { confirmDemo: true, password: password || undefined },
          ),
        },
      );
      const callback = request.onVerified;
      setPassword('');
      onClose();
      await callback(res.reauthToken);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Re-authentication failed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-[2px]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      data-testid="modal-admin-reauth"
    >
      <section className="w-full max-w-md rounded-2xl border bg-card p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b pb-4">
          <div className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-amber-500/15 text-amber-700">
              <ShieldAlert size={18} />
            </span>
            <div>
              <h3 className="font-serif text-lg font-bold">Re-authentication required</h3>
              <p className="text-xs text-muted-foreground">Verify administrator identity before continuing</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted cursor-pointer"
            aria-label="Close re-authentication modal"
          >
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div className="rounded-lg border bg-muted/40 px-3.5 py-2.5 text-xs">
            <span className="text-muted-foreground">Protected action: </span>
            <strong className="font-semibold text-foreground">{request.actionLabel}</strong>
          </div>

          {passwordConfigured ? (
            <label className="block text-xs font-semibold">
              Administrator password
              <div className="relative mt-1.5">
                <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="password"
                  className="field pl-9"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your administrator password"
                  required
                  autoFocus
                  data-testid="input-reauth-password"
                />
              </div>
            </label>
          ) : (
            <p className="text-xs leading-relaxed text-muted-foreground">
              Preview demo mode is active (no admin password configured). Confirm below to issue a short-lived security verification token and log this action.
            </p>
          )}

          {error && (
            <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-xs font-semibold text-destructive">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="btn btn-outline whitespace-nowrap shrink-0" onClick={onClose}>
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="btn btn-primary whitespace-nowrap shrink-0"
              data-testid="button-confirm-reauth"
            >
              {submitting ? <LoaderCircle size={14} className="animate-spin" /> : null}
              Verify &amp; Continue
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
