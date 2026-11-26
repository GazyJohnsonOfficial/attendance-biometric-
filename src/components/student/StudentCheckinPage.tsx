import { useEffect, useState, type FormEvent } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock3,
  GraduationCap,
  LoaderCircle,
  MapPin,
  QrCode,
  ShieldCheck,
} from 'lucide-react';
import { customFetch } from '@/api-client-react/custom-fetch';

interface SessionPublicInfo {
  id: string;
  topic: string;
  venue: string;
  status: 'scheduled' | 'open' | 'closed' | 'finalized';
  codeMode: 'rotating' | 'static';
  radiusM: number;
  startsAt: string;
  endsAt: string;
  courseCode?: string;
  courseTitle?: string;
}

interface CheckinResult {
  success: boolean;
  alreadyCheckedIn: boolean;
  status: 'present' | 'needs_review' | 'absent' | 'excused';
  studentName: string;
  indexNumber: string;
  flags: string[];
  distanceM?: number | null;
  markedAt: string;
  message: string;
}

export function StudentCheckinPage() {
  const query = new URLSearchParams(window.location.search);
  const sessionId = query.get('session') || '';
  const initialCode = query.get('code') || '';

  const [sessionInfo, setSessionInfo] = useState<SessionPublicInfo | null>(null);
  const [loadingInfo, setLoadingInfo] = useState(Boolean(sessionId));
  const [infoError, setInfoError] = useState('');

  const [indexNumber, setIndexNumber] = useState('');
  const [code, setCode] = useState(initialCode);
  const [studentName, setStudentName] = useState('');
  const [includeLocation, setIncludeLocation] = useState(true);
  const [coords, setCoords] = useState<{ lat: number; lng: number; accuracyM: number } | null>(null);
  const [gettingLocation, setGettingLocation] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [result, setResult] = useState<CheckinResult | null>(null);

  // Fetch session details
  useEffect(() => {
    if (!sessionId) {
      setLoadingInfo(false);
      setInfoError('No attendance session ID was provided. Please scan the QR code from the lecturer projector screen.');
      return undefined;
    }

    let active = true;
    setLoadingInfo(true);
    customFetch<SessionPublicInfo>(`/api/sessions/${sessionId}/public-info`)
      .then((data) => {
        if (!active) return;
        setSessionInfo(data);
        setInfoError('');
      })
      .catch((err) => {
        if (!active) return;
        setInfoError(err instanceof Error ? err.message : 'Could not load session details.');
      })
      .finally(() => {
        if (active) setLoadingInfo(false);
      });

    return () => {
      active = false;
    };
  }, [sessionId]);

  // Request browser GPS coordinates if supported
  useEffect(() => {
    if (includeLocation && 'geolocation' in navigator) {
      setGettingLocation(true);
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setCoords({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracyM: Math.round(pos.coords.accuracy),
          });
          setGettingLocation(false);
        },
        () => {
          setGettingLocation(false);
        },
        { timeout: 7000, enableHighAccuracy: true },
      );
    }
  }, [includeLocation]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!sessionId) return;
    setSubmitting(true);
    setSubmitError('');

    try {
      const response = await customFetch<CheckinResult>(`/api/sessions/${sessionId}/student-checkin`, {
        method: 'POST',
        body: JSON.stringify({
          indexNumber: indexNumber.trim().toUpperCase(),
          code: code.trim().toUpperCase(),
          studentName: studentName.trim() || undefined,
          lat: coords?.lat ?? null,
          lng: coords?.lng ?? null,
          accuracyM: coords?.accuracyM ?? null,
        }),
      });
      setResult(response);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Check-in failed. Please verify your index number and code.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-[100dvh] bg-background flex flex-col items-center justify-center p-4 sm:p-6">
      {/* Brand mark */}
      <div className="mb-6 flex items-center gap-2 text-sm font-bold">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary text-primary-foreground">
          <GraduationCap size={19} strokeWidth={2.1} />
        </span>
        <span>Attendance desk · Student check-in</span>
      </div>

      <div className="w-full max-w-md rounded-2xl border bg-card p-6 shadow-sm sm:p-8">
        {result ? (
          /* Confirmation Success Screen */
          <div className="text-center" data-testid="screen-checkin-success">
            <span
              className={`mx-auto grid h-14 w-14 place-items-center rounded-2xl ${
                result.status === 'present' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
              }`}
            >
              {result.status === 'present' ? <CheckCircle2 size={32} /> : <AlertTriangle size={32} />}
            </span>

            <h2 className="mt-4 font-serif text-2xl font-extrabold text-foreground">
              {result.alreadyCheckedIn
                ? 'Already Checked In'
                : result.status === 'present'
                  ? 'Attendance Recorded!'
                  : 'Check-in Received'}
            </h2>

            <p className="mt-2 text-xs leading-5 text-muted-foreground">{result.message}</p>

            <div className="mt-5 rounded-xl border bg-muted/20 p-4 text-left text-xs space-y-2.5">
              <div className="flex justify-between border-b pb-2">
                <span className="text-muted-foreground">Student Name</span>
                <span className="font-semibold text-foreground">{result.studentName}</span>
              </div>
              <div className="flex justify-between border-b pb-2">
                <span className="text-muted-foreground">Index Number</span>
                <span className="font-mono font-bold text-foreground">{result.indexNumber}</span>
              </div>
              <div className="flex justify-between border-b pb-2">
                <span className="text-muted-foreground">Attendance Status</span>
                <span
                  className={`font-semibold capitalize ${
                    result.status === 'present' ? 'text-emerald-700' : 'text-amber-800'
                  }`}
                >
                  {result.status.replace('_', ' ')}
                </span>
              </div>
              {result.distanceM != null && (
                <div className="flex justify-between border-b pb-2">
                  <span className="text-muted-foreground">Venue GPS Distance</span>
                  <span className="font-mono text-foreground">{result.distanceM} m</span>
                </div>
              )}
              {result.flags.length > 0 && (
                <div className="flex justify-between border-b pb-2">
                  <span className="text-muted-foreground">Flags</span>
                  <span className="font-mono text-amber-800 font-semibold">{result.flags.join(', ')}</span>
                </div>
              )}
              <div className="flex justify-between pt-1 text-[11px] text-muted-foreground">
                <span>Recorded At</span>
                <span className="font-mono">{new Date(result.markedAt).toLocaleTimeString()}</span>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-center gap-2 text-xs text-muted-foreground">
              <ShieldCheck size={15} className="text-primary" />
              <span>Verified and recorded in lecture audit log.</span>
            </div>

            <button
              type="button"
              onClick={() => setResult(null)}
              className="btn btn-outline mt-6 w-full !text-xs"
              data-testid="button-checkin-another"
            >
              Check in another student
            </button>
          </div>
        ) : (
          /* Check-in Form Screen */
          <div>
            <div className="eyebrow flex items-center gap-1.5">
              <QrCode size={13} className="text-primary" />
              <span>Quick attendance scan</span>
            </div>

            {loadingInfo ? (
              <div className="mt-4 space-y-2 animate-pulse">
                <div className="h-6 w-3/4 rounded bg-muted" />
                <div className="h-4 w-1/2 rounded bg-muted/60" />
              </div>
            ) : sessionInfo ? (
              <div className="mt-2 border-b pb-4">
                <h1 className="font-serif text-xl font-extrabold text-foreground">
                  {sessionInfo.courseCode ? `${sessionInfo.courseCode} · ` : ''}
                  {sessionInfo.topic}
                </h1>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <MapPin size={12} className="text-primary" /> {sessionInfo.venue}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock3 size={12} /> {sessionInfo.status === 'open' ? 'Live session open' : sessionInfo.status}
                  </span>
                </div>
              </div>
            ) : (
              <div className="mt-2">
                <h1 className="font-serif text-xl font-extrabold text-foreground">Classroom Check-in</h1>
                <p className="mt-1 text-xs text-muted-foreground">Enter your student index number and the code on the screen.</p>
              </div>
            )}

            {infoError && (
              <div className="mt-4 rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-xs text-destructive">
                {infoError}
              </div>
            )}

            <form onSubmit={handleSubmit} className="mt-5 space-y-4">
              <label className="block text-xs font-semibold">
                Student Index Number
                <input
                  className="field mt-1.5 font-mono text-sm uppercase"
                  placeholder="e.g. 5231001"
                  value={indexNumber}
                  onChange={(e) => setIndexNumber(e.target.value)}
                  required
                  autoFocus
                  data-testid="input-student-index"
                />
              </label>

              <label className="block text-xs font-semibold">
                Session Check-in Code
                <input
                  className="field mt-1.5 font-mono text-sm tracking-widest uppercase font-bold text-primary"
                  placeholder="e.g. ABC-DEF"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  required
                  data-testid="input-student-code"
                />
                <span className="mt-1 block text-[11px] text-muted-foreground">
                  {sessionInfo?.codeMode === 'static' ? 'Static 6-character code' : 'Displayed on projector screen (updates every 45s)'}
                </span>
              </label>

              <label className="block text-xs font-semibold">
                Full Name (Optional)
                <input
                  className="field mt-1.5 text-xs"
                  placeholder="e.g. Kwame Mensah"
                  value={studentName}
                  onChange={(e) => setStudentName(e.target.value)}
                  data-testid="input-student-name"
                />
              </label>

              {/* GPS Geofence checkbox */}
              <label className="flex items-start gap-2.5 rounded-lg border bg-muted/20 p-3 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeLocation}
                  onChange={(e) => setIncludeLocation(e.target.checked)}
                  className="mt-0.5 accent-primary cursor-pointer"
                />
                <div>
                  <span className="font-semibold text-foreground">Verify in-room GPS location</span>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {gettingLocation
                      ? 'Acquiring GPS location…'
                      : coords
                        ? `GPS acquired (±${coords.accuracyM} m accuracy)`
                        : 'Confirms your device is inside the lecture hall'}
                  </p>
                </div>
              </label>

              {submitError && (
                <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-xs text-destructive">
                  {submitError}
                </div>
              )}

              <button
                type="submit"
                disabled={submitting || !indexNumber.trim() || !code.trim()}
                className="btn btn-primary w-full py-2.5 text-sm font-semibold"
                data-testid="button-submit-checkin"
              >
                {submitting ? (
                  <>
                    <LoaderCircle size={15} className="animate-spin" /> Verifying attendance…
                  </>
                ) : (
                  <>
                    Confirm Attendance <ArrowRight size={15} />
                  </>
                )}
              </button>
            </form>
          </div>
        )}
      </div>

      <p className="mt-6 text-center text-xs text-muted-foreground">
        Biometric Attendance System · Takoradi Technical University
      </p>
    </main>
  );
}
