import { useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getGetClassQueryKey, getGetClassRosterQueryKey } from '@workspace/api-client-react';
import type { RosterItem } from '@workspace/api-client-react';
import { AlertTriangle, Check, EyeOff, LoaderCircle, ShieldCheck, UserCheck, X } from 'lucide-react';
import {
  lecturerKeys,
  useClassIdentity,
  useConfirmStudentPhoto,
  useDisputeStudentPhoto,
} from '@/lib/lecturerApi';
import { getStudentPhotoUrl } from '@/lib/studentPhotos';

export function IdentityCheckTab({ classId }: { classId: string }) {
  const qc = useQueryClient();
  const identity = useClassIdentity(classId, true);
  const confirm = useConfirmStudentPhoto();
  const dispute = useDisputeStudentPhoto();

  const [disputeTarget, setDisputeTarget] = useState<RosterItem | null>(null);
  const [reason, setReason] = useState('');

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: lecturerKeys.identity(classId) });
    qc.invalidateQueries({ queryKey: getGetClassRosterQueryKey(classId) });
    qc.invalidateQueries({ queryKey: getGetClassQueryKey(classId) });
  };

  const handleConfirm = (indexNumber: string) => {
    confirm.mutate({ classId, indexNumber }, { onSuccess: invalidate });
  };

  const handleDispute = (e: FormEvent) => {
    e.preventDefault();
    if (!disputeTarget) return;
    dispute.mutate(
      { classId, indexNumber: disputeTarget.indexNumber, reason: reason.trim() },
      {
        onSuccess: () => {
          invalidate();
          setDisputeTarget(null);
          setReason('');
        },
      },
    );
  };

  if (identity.isLoading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3].map((k) => (
          <div key={k} className="h-56 animate-pulse rounded-xl bg-muted/70" />
        ))}
      </div>
    );
  }

  if (identity.isError || !identity.data) {
    return (
      <div className="surface p-6 text-sm text-muted-foreground">
        Could not load identity check gallery.{' '}
        <button className="underline text-primary cursor-pointer" onClick={() => identity.refetch()}>
          Retry
        </button>
      </div>
    );
  }

  const rows = identity.data.rows;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-muted/25 px-4 py-3 text-xs">
        <div className="flex items-center gap-2 text-muted-foreground">
          <ShieldCheck size={15} className="text-primary shrink-0" />
          <span>
            Registration portraits are released only for matched or approved roster links. All photo views are audit-logged.
          </span>
        </div>
        <span className="font-mono font-semibold tabular-nums">
          {rows.filter((r) => r.verificationStatus === 'confirmed').length} / {rows.length} confirmed
        </span>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((st) => {
          const photoUrl = getStudentPhotoUrl(st.portraitKey);
          const released = st.photoReleaseBasis === 'auto' || st.photoReleaseBasis === 'approved';
          const status = st.verificationStatus ?? 'unconfirmed';

          return (
            <article
              key={st.id}
              className="surface flex flex-col overflow-hidden"
              data-testid={`identity-card-${st.indexNumber}`}
            >
              <div className="relative h-48 w-full bg-[#e9e5dc]">
                {released && photoUrl ? (
                  <img
                    src={photoUrl}
                    alt={st.fullName}
                    className="h-full w-full object-cover object-top"
                  />
                ) : (
                  <div className="flex h-full flex-col items-center justify-center px-5 text-center text-xs text-muted-foreground">
                    <EyeOff size={22} className="mb-2 text-muted-foreground/70" />
                    <div className="font-semibold text-foreground">Photo hidden</div>
                    <p className="mt-1 leading-5">
                      {st.photoReleaseBasis === 'pending'
                        ? 'Awaiting email change approval.'
                        : 'Student has not completed biometric registration.'}
                    </p>
                  </div>
                )}
              </div>

              <div className="flex flex-1 flex-col p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate font-semibold">{st.fullName}</div>
                    <div className="mt-0.5 font-mono text-xs text-muted-foreground">{st.indexNumber}</div>
                  </div>
                  <span
                    className={`text-xs font-semibold whitespace-nowrap ${
                      status === 'confirmed'
                        ? 'text-emerald-700'
                        : status === 'disputed'
                          ? 'text-destructive'
                          : 'text-amber-800'
                    }`}
                  >
                    {status === 'confirmed' ? 'Confirmed' : status === 'disputed' ? 'Disputed' : 'To confirm'}
                  </span>
                </div>

                <div className="mt-2 space-y-0.5 text-[11px] text-muted-foreground">
                  <div className="truncate">{st.email}</div>
                  <div className="font-mono">{st.phone || 'No phone on file'}</div>
                </div>

                <div className="mt-2 text-xs text-muted-foreground">
                  {(st.confirmedByCount ?? 0) > 0
                    ? `Confirmed by ${st.confirmedByCount} lecturer${st.confirmedByCount === 1 ? '' : 's'}`
                    : 'Not yet confirmed by a lecturer'}
                </div>

                {status === 'disputed' && st.disputeReason && (
                  <div className="mt-2 rounded-lg bg-red-50 px-2.5 py-1.5 text-[11px] text-red-900">
                    <b>Locked:</b> {st.disputeReason}
                  </div>
                )}

                <div className="mt-auto flex flex-wrap gap-2 pt-4">
                  <button
                    type="button"
                    disabled={!released || confirm.isPending}
                    onClick={() => handleConfirm(st.indexNumber)}
                    className="btn btn-primary flex-1 !px-3 !py-1.5 !text-xs whitespace-nowrap"
                    data-testid={`button-confirm-photo-${st.indexNumber}`}
                  >
                    <UserCheck size={13} /> {status === 'confirmed' ? 'Confirmed' : 'Confirm'}
                  </button>
                  <button
                    type="button"
                    disabled={!released || dispute.isPending}
                    onClick={() => {
                      setDisputeTarget(st);
                      setReason(st.disputeReason ?? '');
                    }}
                    className="btn btn-outline !px-3 !py-1.5 !text-xs whitespace-nowrap"
                    data-testid={`button-dispute-photo-${st.indexNumber}`}
                  >
                    <AlertTriangle size={13} /> Dispute
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      {disputeTarget && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-[#182630]/45 p-0 backdrop-blur-[2px] sm:items-center sm:p-5"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setDisputeTarget(null);
          }}
        >
          <section className="w-full max-w-md rounded-t-2xl border bg-card p-5 shadow-2xl sm:rounded-2xl sm:p-6">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-serif text-lg font-extrabold">Dispute registration photo</h3>
              <button className="rounded-lg p-2 hover:bg-muted cursor-pointer" onClick={() => setDisputeTarget(null)}>
                <X size={17} />
              </button>
            </div>
            <p className="text-xs leading-5 text-muted-foreground">
              Disputing <b>{disputeTarget.fullName}</b> ({disputeTarget.indexNumber}) locks student check-in until the profile is verified.
            </p>
            <form onSubmit={handleDispute} className="mt-4 space-y-4">
              <label className="block text-xs font-semibold">
                Reason for dispute
                <textarea
                  className="field mt-1.5 min-h-24"
                  placeholder="e.g. Photo does not match student ID card or wrong person enrolled."
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  required
                  minLength={3}
                  data-testid="input-dispute-reason"
                />
              </label>
              <div className="flex justify-end gap-2">
                <button type="button" className="btn btn-outline" onClick={() => setDisputeTarget(null)}>
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={dispute.isPending}
                  className="btn bg-destructive text-destructive-foreground hover:brightness-110"
                  data-testid="button-submit-dispute"
                >
                  {dispute.isPending ? <LoaderCircle size={14} className="animate-spin" /> : <Check size={14} />}
                  Lock & dispute
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
