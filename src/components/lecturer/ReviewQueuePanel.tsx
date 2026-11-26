import { useState } from 'react';
import type { AttendanceRecord } from '@workspace/api-client-react';
import { CheckCircle2, EyeOff, MapPin, ShieldAlert } from 'lucide-react';
import { getStudentPhotoUrl } from '@/lib/studentPhotos';

function getPriorityInfo(flags: string[]) {
  if (
    flags.some((f) =>
      ['FACE_LOW', 'LIVENESS_FAIL', 'MOCK_LOCATION', 'INTEGRITY_FAIL', 'DUPLICATE_DEVICE'].includes(f),
    )
  ) {
    return { label: 'High priority', cls: 'text-destructive' };
  }
  if (flags.some((f) => ['FACE_MID', 'NO_REFERENCE'].includes(f))) {
    return { label: 'Medium priority', cls: 'text-amber-800' };
  }
  return { label: 'Low priority', cls: 'text-muted-foreground' };
}

export function ReviewQueuePanel({
  records,
  sessionStatus,
  isPending,
  onDecide,
}: {
  records: AttendanceRecord[];
  sessionStatus: string;
  isPending: boolean;
  onDecide: (record: AttendanceRecord, status: 'present' | 'absent' | 'excused', note?: string) => void;
}) {
  const [notes, setNotes] = useState<Record<string, string>>({});

  if (!records.length) {
    return (
      <div className="mt-4 rounded-lg bg-primary/5 p-3.5 text-xs leading-5 text-muted-foreground">
        <CheckCircle2 size={15} className="mb-1 text-primary" /> Nothing waiting for a decision.
      </div>
    );
  }

  return (
    <div className="mt-3 space-y-3">
      {records.map((r) => {
        const portraitUrl = getStudentPhotoUrl(r.portraitKey);
        const checkinUrl = getStudentPhotoUrl(r.photoKey);
        const priority = getPriorityInfo(r.flags);
        const noteVal = notes[r.id] ?? r.note ?? '';

        return (
          <div className="rounded-xl border bg-card p-3.5" key={r.id} data-testid={`review-card-${r.id}`}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold">{r.studentName}</div>
                <div className="font-mono text-[11px] text-muted-foreground">{r.indexNumber}</div>
                {(r.studentEmail || r.studentPhone) && (
                  <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
                    {[r.studentEmail, r.studentPhone].filter(Boolean).join(' · ')}
                  </div>
                )}
              </div>
              <span className={`inline-flex items-center gap-1 text-[11px] font-bold whitespace-nowrap ${priority.cls}`}>
                <ShieldAlert size={12} /> {priority.label}
              </span>
            </div>

            {(portraitUrl || checkinUrl) && (
              <div className="mt-3 grid grid-cols-2 gap-2">
                <figure className="overflow-hidden rounded-lg border bg-muted/20">
                  {portraitUrl ? (
                    <img
                      src={portraitUrl}
                      alt={`${r.studentName} registration`}
                      className="h-24 w-full object-cover object-top"
                    />
                  ) : (
                    <div className="flex h-24 flex-col items-center justify-center text-[10px] text-muted-foreground">
                      <EyeOff size={14} className="mb-1" /> No portrait
                    </div>
                  )}
                  <figcaption className="px-2 py-1 text-[10px] font-semibold text-muted-foreground">
                    Registration
                  </figcaption>
                </figure>
                <figure className="overflow-hidden rounded-lg border bg-muted/20">
                  {checkinUrl ? (
                    <img
                      src={checkinUrl}
                      alt={`${r.studentName} check-in`}
                      className="h-24 w-full object-cover object-center"
                    />
                  ) : (
                    <div className="flex h-24 flex-col items-center justify-center text-[10px] text-muted-foreground">
                      <EyeOff size={14} className="mb-1" /> No check-in photo
                    </div>
                  )}
                  <figcaption className="px-2 py-1 text-[10px] font-semibold text-muted-foreground">
                    Classroom check-in
                  </figcaption>
                </figure>
              </div>
            )}

            <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground tabular-nums">
              {r.faceScore != null && !Number.isNaN(Number(r.faceScore)) && (
                <span>
                  Face score: <b className="text-foreground">{Math.round(Number(r.faceScore) * 100)}%</b>
                </span>
              )}
              {r.distanceM != null && (
                <span className="inline-flex items-center gap-1">
                  <MapPin size={11} /> {r.distanceM} m away
                  {r.accuracyM != null ? ` (±${r.accuracyM} m)` : ''}
                </span>
              )}
            </div>

            {r.flags.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {r.flags.map((flag) => (
                  <span key={flag} className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-foreground">
                    {flag}
                  </span>
                ))}
              </div>
            )}

            {sessionStatus === 'finalized' ? (
              <p className="mt-3 text-xs text-muted-foreground">Locked after finalization.</p>
            ) : (
              <>
                <input
                  className="field mt-2.5 !py-1.5 !text-xs"
                  placeholder="Optional decision note…"
                  value={noteVal}
                  onChange={(e) => setNotes((prev) => ({ ...prev, [r.id]: e.target.value }))}
                  data-testid={`input-review-note-${r.id}`}
                />
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    disabled={isPending}
                    className="btn btn-primary !px-2.5 !py-1.5 !text-xs whitespace-nowrap"
                    onClick={() => onDecide(r, 'present', noteVal || 'Confirmed by lecturer')}
                    data-testid={`button-queue-present-${r.id}`}
                  >
                    Confirm present
                  </button>
                  <button
                    type="button"
                    disabled={isPending}
                    className="btn btn-outline !px-2.5 !py-1.5 !text-xs whitespace-nowrap"
                    onClick={() => onDecide(r, 'absent', noteVal || 'Marked absent after review')}
                    data-testid={`button-queue-absent-${r.id}`}
                  >
                    Absent
                  </button>
                  <button
                    type="button"
                    disabled={isPending}
                    className="btn btn-outline !px-2.5 !py-1.5 !text-xs whitespace-nowrap"
                    onClick={() => onDecide(r, 'excused', noteVal || 'Excused by lecturer')}
                    data-testid={`button-queue-excused-${r.id}`}
                  >
                    Excused
                  </button>
                </div>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
