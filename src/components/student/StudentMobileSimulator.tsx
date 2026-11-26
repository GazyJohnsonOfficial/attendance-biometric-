import { useState, useEffect, useRef } from 'react';
import { Link } from 'wouter';
import {
  ArrowLeft, CheckCircle2, ChevronRight, Clock3, AlertTriangle, RefreshCw,
  QrCode, Camera, ShieldCheck, WifiOff, Smartphone, Award, User, BookOpen,
  LogOut, ShieldAlert, Sparkles, Check, X,
} from 'lucide-react';

interface EnrolledClass {
  id: string;
  courseCode: string;
  courseTitle: string;
  department: string;
  programme: string;
  level: number;
  semester: string;
  activeSession: {
    id: string;
    topic: string;
    venue: string;
    status: string;
    codeMode: string;
    closesAt: string;
  } | null;
}

export function StudentMobileSimulator() {
  const [screen, setScreen] = useState<
    'S1_LOGIN' | 'S2_REGISTER' | 'S3_FACE_CAPTURE' | 'S4_MY_CLASSES' |
    'S5_PHOTO_REQUEST' | 'S6_JOIN_SESSION' | 'S7_SELFIE_LIVENESS' |
    'S8_RESULT' | 'S9_HISTORY' | 'S10_OFFLINE_QUEUE' | 'S11_PROFILE' | 'S12_DISPUTE'
  >('S4_MY_CLASSES');

  // Auth / Student State
  const [studentIndex, setStudentIndex] = useState('5231001');
  const [studentName, setStudentName] = useState('Ama Boateng');
  const [studentEmail, setStudentEmail] = useState('ama.boateng@st.school.edu.gh');
  const [loginPass, setLoginPass] = useState('student123');

  // Registration State
  const [regName, setRegName] = useState('');
  const [regIndex, setRegIndex] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regOtp, setRegOtp] = useState('');
  const [regOtpSent, setRegOtpSent] = useState(false);
  const [regOtpHint, setRegOtpHint] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConsent, setRegConsent] = useState(false);

  // Classes & Session State
  const [classes, setClasses] = useState<EnrolledClass[]>([]);
  const [selectedClass, setSelectedClass] = useState<EnrolledClass | null>(null);
  const [inputCode, setInputCode] = useState('');
  const [challenge, setChallenge] = useState<{
    challenge_id: string;
    nonce: string;
    liveness_prompt: string;
    expires_in: number;
    class: { course: string; title: string; venue: string; session_id: string };
  } | null>(null);

  // Verification & Liveness State
  const [livenessDone, setLivenessDone] = useState(false);
  const [timerSeconds, setTimerSeconds] = useState(60);
  const [checkinResult, setCheckinResult] = useState<{
    status: string;
    message: string;
    marked_at: string;
    reasons?: string[];
  } | null>(null);

  // History & Profile State
  const [historyData, setHistoryData] = useState<{
    percentage: number;
    attendedCount: number;
    totalSessions: number;
    records: Array<{ id: string; courseCode: string; topic: string; date: string; status: string }>;
  } | null>(null);

  // Dispute state
  const [disputeReason, setDisputeReason] = useState('This is my genuine index number. I am reporting an unauthorized duplicate registration.');
  const [disputeSuccess, setDisputeSuccess] = useState(false);

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [offlineSimulated, setOfflineSimulated] = useState(false);

  // Fetch classes when on S4
  useEffect(() => {
    if (screen === 'S4_MY_CLASSES') {
      fetchClasses();
    }
  }, [screen, studentIndex]);

  const fetchClasses = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/v1/me/classes?indexNumber=${encodeURIComponent(studentIndex)}`);
      const data = await res.json();
      if (res.ok) {
        setClasses(data.classes || []);
      }
    } catch {
      // offline handling
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async () => {
    setErrorMsg('');
    if (!studentIndex || !loginPass) {
      setErrorMsg('Enter index number and password');
      return;
    }
    setScreen('S4_MY_CLASSES');
  };

  const handleSendOtp = async () => {
    setErrorMsg('');
    if (!regName || !regIndex || !regEmail) {
      setErrorMsg('Complete all fields to receive email code.');
      return;
    }
    try {
      setLoading(true);
      const res = await fetch('/api/v1/auth/student/register/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fullName: regName, indexNumber: regIndex, email: regEmail }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.indexNumberTaken) {
          setScreen('S12_DISPUTE');
          return;
        }
        setErrorMsg(data.error || 'Failed to send OTP.');
        return;
      }
      setRegOtpSent(true);
      setRegOtpHint(data.previewOtp || '123456');
      setRegOtp(data.previewOtp || '123456');
    } catch (e: any) {
      setErrorMsg(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyRegister = async () => {
    if (!regConsent) {
      setErrorMsg('Please accept the biometric consent notice.');
      return;
    }
    try {
      setLoading(true);
      const res = await fetch('/api/v1/auth/student/register/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: regName,
          indexNumber: regIndex,
          email: regEmail,
          code: regOtp,
          password: regPassword || 'student123',
          consentGiven: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || 'Verification failed.');
        return;
      }
      setStudentIndex(regIndex);
      setStudentName(regName);
      setStudentEmail(regEmail);
      setScreen('S3_FACE_CAPTURE');
    } catch (e: any) {
      setErrorMsg(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleStartCheckin = async () => {
    setErrorMsg('');
    if (!inputCode) {
      setErrorMsg('Scan the QR code or enter the typed code.');
      return;
    }
    try {
      setLoading(true);
      const res = await fetch('/api/v1/checkin/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: inputCode, indexNumber: studentIndex }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error?.message || 'Check-in code rejected.');
        return;
      }
      setChallenge(data);
      setLivenessDone(false);
      setTimerSeconds(60);
      setScreen('S7_SELFIE_LIVENESS');
    } catch (e: any) {
      setErrorMsg(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitCheckin = async () => {
    if (offlineSimulated) {
      setScreen('S10_OFFLINE_QUEUE');
      return;
    }
    if (!challenge) return;
    try {
      setLoading(true);
      const res = await fetch('/api/v1/checkin/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          challenge_id: challenge.challenge_id,
          indexNumber: studentIndex,
          latitude: 4.9016,
          longitude: -1.7831,
          accuracy_m: 20,
          mock_location: false,
          liveness_completed: livenessDone,
          photoKey: 'yaw-checkin-wide',
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error?.message || 'Check-in failed');
        return;
      }
      setCheckinResult(data);
      setScreen('S8_RESULT');
    } catch (e: any) {
      setScreen('S10_OFFLINE_QUEUE');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenHistory = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/v1/me/attendance?indexNumber=${encodeURIComponent(studentIndex)}`);
      const data = await res.json();
      if (res.ok) {
        setHistoryData(data);
      }
      setScreen('S9_HISTORY');
    } catch {
      setScreen('S9_HISTORY');
    } finally {
      setLoading(false);
    }
  };

  const handleClaimDispute = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/v1/auth/student/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          indexNumber: regIndex || studentIndex,
          email: regEmail || studentEmail,
          fullName: regName || studentName,
          reason: disputeReason,
        }),
      });
      if (res.ok) {
        setDisputeSuccess(true);
      }
    } catch {
      //
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-3 sm:p-6 text-foreground">
      {/* Top Bar Navigation */}
      <div className="w-full max-w-sm mb-3 flex items-center justify-between text-xs text-slate-400">
        <Link href="/app" className="inline-flex items-center gap-1.5 text-teal-400 hover:underline">
          <ArrowLeft size={13} /> Return to Lecturer Workspace
        </Link>
        <div className="flex items-center gap-2">
          <span className="font-mono bg-slate-800 px-2 py-0.5 rounded text-[10px] text-teal-300">
            Flutter Spec v1.1
          </span>
          <button
            type="button"
            onClick={() => setOfflineSimulated(!offlineSimulated)}
            className={`px-2 py-0.5 rounded text-[10px] font-semibold cursor-pointer ${
              offlineSimulated ? 'bg-amber-500 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            {offlineSimulated ? 'Simulating Offline' : 'Online'}
          </button>
        </div>
      </div>

      {/* Realistic Mobile Device Frame */}
      <div className="relative w-full max-w-[380px] h-[780px] bg-black rounded-[42px] p-3 shadow-2xl ring-1 ring-slate-700/60 overflow-hidden flex flex-col">
        {/* Device Notch & Status Bar */}
        <div className="w-full bg-slate-950 text-white rounded-t-[32px] pt-2 px-5 flex items-center justify-between text-[11px] font-semibold select-none shrink-0 z-20">
          <span>9:41</span>
          <div className="w-20 h-4 bg-black rounded-full mx-auto" />
          <div className="flex items-center gap-1.5">
            <Smartphone size={11} className="text-teal-400" />
            <span>4G</span>
            <span>100%</span>
          </div>
        </div>

        {/* Mobile Viewport Screen */}
        <div className="flex-1 bg-slate-50 text-slate-900 rounded-b-[32px] overflow-y-auto flex flex-col relative">

          {/* S1: LOGIN SCREEN */}
          {screen === 'S1_LOGIN' && (
            <div className="flex-1 p-6 flex flex-col justify-center">
              <div className="w-14 h-14 rounded-2xl bg-[#263a43] text-white flex items-center justify-center font-serif text-2xl font-bold mx-auto mb-4">
                A
              </div>
              <h2 className="text-xl font-bold text-center text-slate-900">Class Attendance</h2>
              <p className="text-xs text-center text-slate-500 mt-1 mb-6">
                Sign in with your student index number
              </p>

              {errorMsg && (
                <div className="mb-4 rounded-lg bg-red-50 border border-red-200 p-2.5 text-xs text-red-700">
                  {errorMsg}
                </div>
              )}

              <label className="text-xs font-semibold text-slate-700 mb-1">Index number</label>
              <input
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-mono mb-3"
                value={studentIndex}
                onChange={(e) => setStudentIndex(e.target.value)}
                placeholder="5231001"
              />

              <label className="text-xs font-semibold text-slate-700 mb-1">Password</label>
              <input
                type="password"
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm mb-4"
                value={loginPass}
                onChange={(e) => setLoginPass(e.target.value)}
                placeholder="••••••••"
              />

              <button
                type="button"
                onClick={handleLogin}
                className="w-full py-3 rounded-xl bg-teal-700 text-white font-bold text-sm hover:bg-teal-800 transition cursor-pointer"
              >
                Log in
              </button>

              <div className="mt-5 text-center text-xs text-slate-500">
                New student?{' '}
                <button
                  type="button"
                  onClick={() => setScreen('S2_REGISTER')}
                  className="font-bold text-teal-700 underline cursor-pointer"
                >
                  Register
                </button>
              </div>
            </div>
          )}

          {/* S2: REGISTER SCREEN */}
          {screen === 'S2_REGISTER' && (
            <div className="flex-1 p-5 overflow-y-auto">
              <div className="flex items-center gap-2 mb-4">
                <button type="button" onClick={() => setScreen('S1_LOGIN')} className="p-1 text-slate-500">
                  <ArrowLeft size={18} />
                </button>
                <h3 className="font-bold text-base">Register Student</h3>
              </div>

              <p className="text-xs text-slate-500 mb-4">
                No class is needed yet. Classes appear automatically once your lecturer adds you to their roster.
              </p>

              {errorMsg && (
                <div className="mb-3 rounded-lg bg-red-50 border border-red-200 p-2 text-xs text-red-700">
                  {errorMsg}
                </div>
              )}

              <label className="text-xs font-semibold text-slate-700">Full Name</label>
              <input
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm mt-1 mb-3"
                placeholder="Ama Boateng"
                value={regName}
                onChange={(e) => setRegName(e.target.value)}
              />

              <label className="text-xs font-semibold text-slate-700">Index Number</label>
              <input
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-mono mt-1 mb-3"
                placeholder="5231001"
                value={regIndex}
                onChange={(e) => setRegIndex(e.target.value)}
              />

              <label className="text-xs font-semibold text-slate-700">Institutional Email</label>
              <input
                type="email"
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm mt-1 mb-4"
                placeholder="ama@st.school.edu.gh"
                value={regEmail}
                onChange={(e) => setRegEmail(e.target.value)}
              />

              {!regOtpSent ? (
                <button
                  type="button"
                  onClick={handleSendOtp}
                  disabled={loading}
                  className="w-full py-2.5 rounded-xl bg-teal-700 text-white font-bold text-sm cursor-pointer"
                >
                  {loading ? 'Sending code…' : 'Send 6-digit code'}
                </button>
              ) : (
                <>
                  <div className="rounded-lg bg-teal-50 border border-teal-200 p-2 text-[11px] text-teal-800 mb-3">
                    Verification code sent. Preview code: <strong>{regOtpHint}</strong>
                  </div>
                  <label className="text-xs font-semibold text-slate-700">6-digit email code</label>
                  <input
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-center text-lg font-mono tracking-widest mt-1 mb-3"
                    maxLength={6}
                    value={regOtp}
                    onChange={(e) => setRegOtp(e.target.value)}
                  />

                  <label className="text-xs font-semibold text-slate-700">Sign-in password</label>
                  <input
                    type="password"
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm mt-1 mb-3"
                    placeholder="Set sign-in password"
                    value={regPassword}
                    onChange={(e) => setRegPassword(e.target.value)}
                  />

                  <label className="flex items-start gap-2 text-[11px] text-slate-600 mb-4 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={regConsent}
                      onChange={(e) => setRegConsent(e.target.checked)}
                      className="mt-0.5 accent-teal-700"
                    />
                    <span>
                      I consent to my face photo being used for attendance verification and shown to lecturers who add me to their roster (Act 843).
                    </span>
                  </label>

                  <button
                    type="button"
                    onClick={handleVerifyRegister}
                    disabled={loading}
                    className="w-full py-2.5 rounded-xl bg-teal-700 text-white font-bold text-sm cursor-pointer"
                  >
                    {loading ? 'Verifying…' : 'Continue to face capture'}
                  </button>
                </>
              )}
            </div>
          )}

          {/* S3: FACE CAPTURE SCREEN */}
          {screen === 'S3_FACE_CAPTURE' && (
            <div className="flex-1 bg-[#141f26] text-white p-5 flex flex-col justify-between">
              <div>
                <div className="text-xs text-teal-400 font-mono text-center">Step 2 of 4</div>
                <h3 className="text-base font-bold text-center mt-1">Turn your head slightly to the left</h3>
                <p className="text-[11px] text-slate-400 text-center mt-1">
                  Good light, no cap or sunglasses. This becomes your verified portrait.
                </p>
              </div>

              <div className="my-auto flex flex-col items-center">
                <div className="w-48 h-60 rounded-full border-4 border-teal-500 bg-slate-900/60 flex items-center justify-center relative overflow-hidden">
                  <div className="w-28 h-36 border border-dashed border-teal-300/40 rounded-full" />
                  <span className="absolute bottom-3 bg-teal-700 text-white text-[10px] font-bold px-3 py-0.5 rounded-full">
                    Turn left
                  </span>
                </div>
              </div>

              <div>
                <div className="flex justify-center gap-1.5 mb-4">
                  <span className="w-2.5 h-2.5 rounded-full bg-teal-400" />
                  <span className="w-2.5 h-2.5 rounded-full bg-teal-400" />
                  <span className="w-2.5 h-2.5 rounded-full bg-slate-700" />
                  <span className="w-2.5 h-2.5 rounded-full bg-slate-700" />
                </div>
                <button
                  type="button"
                  onClick={() => setScreen('S4_MY_CLASSES')}
                  className="w-full py-3 rounded-xl bg-teal-600 text-white font-bold text-sm hover:bg-teal-500 cursor-pointer"
                >
                  Capture & Complete
                </button>
              </div>
            </div>
          )}

          {/* S4: MY CLASSES SCREEN */}
          {screen === 'S4_MY_CLASSES' && (
            <div className="flex-1 flex flex-col">
              <div className="p-4 bg-white border-b flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-base text-slate-900">My Classes</h3>
                  <div className="text-[11px] text-slate-500">ID: {studentIndex} · Level 300</div>
                </div>
                <button
                  type="button"
                  onClick={fetchClasses}
                  className="p-1.5 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200"
                >
                  <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                </button>
              </div>

              <div className="flex-1 p-4 overflow-y-auto space-y-3">
                {/* Photo request banner (S5 trigger) */}
                <div
                  onClick={() => setScreen('S5_PHOTO_REQUEST')}
                  className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-center gap-3 cursor-pointer hover:bg-amber-100 transition"
                >
                  <ShieldAlert size={22} className="text-amber-600 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-bold text-amber-900">Photo request pending</div>
                    <div className="text-[11px] text-amber-700 truncate">
                      Dr. Mensah asks to view your verified registration portrait.
                    </div>
                  </div>
                  <ChevronRight size={15} className="text-amber-600" />
                </div>

                <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  Enrolled Classes
                </div>

                {classes.length === 0 ? (
                  <div className="p-6 text-center bg-white rounded-2xl border">
                    <BookOpen size={36} className="mx-auto text-slate-400 mb-2" />
                    <div className="text-sm font-bold">You are not in any class yet</div>
                    <p className="text-xs text-slate-500 mt-1">
                      Classes appear when your lecturer uploads the roster. Contact your lecturer.
                    </p>
                  </div>
                ) : (
                  classes.map((c) => {
                    const isOpen = Boolean(c.activeSession);
                    return (
                      <div
                        key={c.id}
                        onClick={() => {
                          setSelectedClass(c);
                          if (isOpen) {
                            setScreen('S6_JOIN_SESSION');
                          }
                        }}
                        className={`p-3.5 bg-white rounded-xl border transition cursor-pointer ${
                          isOpen ? 'border-teal-600 ring-2 ring-teal-500/10' : 'border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-bold text-sm text-slate-900">{c.courseCode}</span>
                          {isOpen ? (
                            <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full animate-pulse">
                              ● Open now
                            </span>
                          ) : (
                            <span className="text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                              Idle
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-slate-600 font-medium">{c.courseTitle}</div>
                        <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400">
                          <span>{c.activeSession?.venue ?? 'Campus venue'}</span>
                          {isOpen && <span className="text-teal-700 font-semibold">Join session →</span>}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Bottom Nav */}
              <div className="bg-white border-t p-2 flex items-center justify-around text-xs">
                <button
                  type="button"
                  onClick={() => setScreen('S4_MY_CLASSES')}
                  className="flex flex-col items-center gap-1 font-bold text-teal-700"
                >
                  <BookOpen size={16} /> Classes
                </button>
                <button
                  type="button"
                  onClick={handleOpenHistory}
                  className="flex flex-col items-center gap-1 text-slate-400 hover:text-slate-600"
                >
                  <Award size={16} /> History
                </button>
                <button
                  type="button"
                  onClick={() => setScreen('S11_PROFILE')}
                  className="flex flex-col items-center gap-1 text-slate-400 hover:text-slate-600"
                >
                  <User size={16} /> Profile
                </button>
              </div>
            </div>
          )}

          {/* S5: PHOTO REQUEST SCREEN */}
          {screen === 'S5_PHOTO_REQUEST' && (
            <div className="flex-1 p-5 flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <button type="button" onClick={() => setScreen('S4_MY_CLASSES')} className="p-1">
                    <ArrowLeft size={18} />
                  </button>
                  <h3 className="font-bold text-base">Photo Release Request</h3>
                </div>

                <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-3">
                  <div className="font-bold text-sm">Dr. Mensah, CS 305</div>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    added a row with your index number ({studentIndex}) but an alternate email address.
                  </p>
                  <div className="p-2.5 bg-slate-50 rounded-lg text-xs font-mono text-slate-600">
                    <div>Roster: kwame.a@mail.com</div>
                    <div className="font-bold text-teal-700">Account: {studentEmail}</div>
                  </div>
                  <p className="text-[11px] text-slate-500 leading-relaxed">
                    If you approve, he sees your registration photo, name and index number. You can still check in if you decline.
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setScreen('S4_MY_CLASSES')}
                    className="py-2.5 rounded-xl border border-slate-300 text-xs font-bold text-slate-700"
                  >
                    Decline
                  </button>
                  <button
                    type="button"
                    onClick={() => setScreen('S4_MY_CLASSES')}
                    className="py-2.5 rounded-xl bg-teal-700 text-white text-xs font-bold"
                  >
                    Approve
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => setScreen('S12_DISPUTE')}
                  className="w-full text-center text-xs text-red-600 hover:underline pt-2"
                >
                  Not you? Tell the administrator.
                </button>
              </div>
            </div>
          )}

          {/* S6: JOIN SESSION SCREEN */}
          {screen === 'S6_JOIN_SESSION' && (
            <div className="flex-1 p-5 flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <button type="button" onClick={() => setScreen('S4_MY_CLASSES')} className="p-1">
                    <ArrowLeft size={18} />
                  </button>
                  <h3 className="font-bold text-base">Join Attendance Session</h3>
                </div>

                <div className="bg-[#263a43] text-white p-4 rounded-xl mb-4">
                  <div className="text-xs text-teal-300 font-mono font-bold">
                    {selectedClass?.courseCode ?? 'CS 305'}
                  </div>
                  <div className="font-bold text-sm mt-0.5">
                    {selectedClass?.courseTitle ?? 'Computer Networks'}
                  </div>
                  <div className="text-xs text-slate-300 mt-2">
                    Room {selectedClass?.activeSession?.venue ?? 'LT2'} · 10:00 to 11:30
                  </div>
                </div>

                {errorMsg && (
                  <div className="mb-3 rounded-lg bg-red-50 border border-red-200 p-2 text-xs text-red-700">
                    {errorMsg}
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => setInputCode('K7Q2XP')}
                  className="w-full py-3 rounded-xl border-2 border-teal-600 text-teal-700 font-bold text-xs flex items-center justify-center gap-2 mb-3 cursor-pointer bg-teal-50"
                >
                  <QrCode size={16} /> Scan Projector QR Code
                </button>

                <div className="text-center text-xs text-slate-400 my-2">or type the code</div>

                <label className="text-xs font-semibold text-slate-700">Session code (e.g. K7Q-2XP)</label>
                <input
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-center text-lg font-mono tracking-widest mt-1 mb-3"
                  value={inputCode}
                  onChange={(e) => setInputCode(e.target.value.toUpperCase())}
                  placeholder="K7Q-2XP"
                />

                <div className="p-3 bg-slate-100 rounded-xl text-xs text-slate-600">
                  <span className="text-slate-400 block text-[10px]">Marking attendance as:</span>
                  <strong>{studentName}</strong> · <span className="font-mono">{studentIndex}</span>
                </div>
              </div>

              <button
                type="button"
                onClick={handleStartCheckin}
                disabled={loading || !inputCode}
                className="w-full py-3 rounded-xl bg-teal-700 text-white font-bold text-sm cursor-pointer"
              >
                {loading ? 'Verifying code…' : 'Continue to selfie verification'}
              </button>
            </div>
          )}

          {/* S7: SELFIE AND LIVENESS SCREEN */}
          {screen === 'S7_SELFIE_LIVENESS' && (
            <div className="flex-1 bg-[#141f26] text-white p-5 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between text-xs font-mono text-teal-400 mb-2">
                  <span>Device OK</span>
                  <span>Location OK</span>
                  <span>Time: 0:{timerSeconds.toString().padStart(2, '0')}</span>
                </div>
                <div className="bg-teal-900/60 border border-teal-500/40 p-2.5 rounded-xl text-center">
                  <div className="text-xs font-bold text-teal-200">
                    {livenessDone ? '✓ Liveness verified' : `Prompt: ${challenge?.liveness_prompt.replace('_', ' ').toUpperCase()}`}
                  </div>
                  <div className="text-[10px] text-slate-300 mt-0.5">
                    Keep your face in the oval and classroom behind you
                  </div>
                </div>
              </div>

              <div className="my-auto flex flex-col items-center">
                <div className="w-52 h-64 rounded-full border-4 border-teal-400 bg-slate-900 flex items-center justify-center relative overflow-hidden shadow-inner">
                  <Camera size={48} className="text-teal-500/50" />
                  {!livenessDone && (
                    <button
                      type="button"
                      onClick={() => setLivenessDone(true)}
                      className="absolute bottom-4 bg-teal-600 text-white text-[11px] font-bold px-3 py-1 rounded-full cursor-pointer hover:bg-teal-500 shadow"
                    >
                      Blink / Turn Now
                    </button>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <button
                  type="button"
                  onClick={handleSubmitCheckin}
                  disabled={loading}
                  className="w-full py-3 rounded-xl bg-teal-600 text-white font-bold text-sm cursor-pointer hover:bg-teal-500"
                >
                  {loading ? 'Submitting…' : 'Submit verification'}
                </button>
                <button
                  type="button"
                  onClick={() => setScreen('S6_JOIN_SESSION')}
                  className="w-full py-2 text-xs text-slate-400 text-center"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* S8: RESULT SCREEN */}
          {screen === 'S8_RESULT' && (
            <div className="flex-1 p-6 flex flex-col justify-between text-center">
              <div className="my-auto">
                <div className={`w-16 h-16 rounded-full mx-auto flex items-center justify-center mb-4 ${
                  checkinResult?.status === 'present' ? 'bg-emerald-100 text-emerald-600' : 'bg-amber-100 text-amber-600'
                }`}>
                  <CheckCircle2 size={36} />
                </div>
                <h2 className="text-2xl font-bold text-slate-900">
                  {checkinResult?.status === 'present' ? 'Present' : 'Sent for Review'}
                </h2>
                <div className="text-xs text-slate-500 mt-1">
                  {selectedClass?.courseCode ?? 'CS 305'} · 10:02 AM
                </div>

                <div className="mt-6 bg-white p-4 rounded-xl border border-slate-200 text-left text-xs space-y-2.5">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500">Face match:</span>
                    <strong className="text-emerald-700">Verified (High match)</strong>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500">Device signature:</span>
                    <strong className="text-slate-700">Hardware Keystore OK</strong>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500">Location:</span>
                    <strong className="text-slate-700">Near classroom (20 m)</strong>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setScreen('S4_MY_CLASSES')}
                className="w-full py-3 rounded-xl bg-teal-700 text-white font-bold text-sm cursor-pointer"
              >
                Done
              </button>
            </div>
          )}

          {/* S9: ATTENDANCE HISTORY SCREEN */}
          {screen === 'S9_HISTORY' && (
            <div className="flex-1 flex flex-col">
              <div className="p-4 bg-white border-b flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => setScreen('S4_MY_CLASSES')} className="p-1">
                    <ArrowLeft size={16} />
                  </button>
                  <h3 className="font-bold text-base text-slate-900">Attendance History</h3>
                </div>
              </div>

              <div className="flex-1 p-4 overflow-y-auto space-y-3">
                <div className="p-5 bg-white rounded-2xl border text-center">
                  <div className="text-3xl font-extrabold text-teal-800">
                    {historyData?.percentage ?? 87}%
                  </div>
                  <div className="text-xs text-slate-500 mt-1">
                    {historyData?.attendedCount ?? 13} of {historyData?.totalSessions ?? 15} sessions · minimum 75%
                  </div>
                  <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden mt-3">
                    <div
                      className="bg-teal-600 h-full rounded-full"
                      style={{ width: `${historyData?.percentage ?? 87}%` }}
                    />
                  </div>
                </div>

                <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                  Session Log
                </div>

                {['24 Nov · Present', '17 Nov · Needs review', '10 Nov · Present', '03 Nov · Absent', '27 Oct · Excused'].map((item, idx) => {
                  const [date, st] = item.split(' · ');
                  const isPresent = st === 'Present';
                  const isReview = st === 'Needs review';
                  return (
                    <div key={idx} className="p-3 bg-white rounded-xl border flex items-center justify-between text-xs">
                      <div>
                        <div className="font-bold text-slate-900">{date}</div>
                        <div className="text-[11px] text-slate-500">CS 305 · Lecture Session</div>
                      </div>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        isPresent ? 'bg-emerald-100 text-emerald-800' : isReview ? 'bg-amber-100 text-amber-800' : 'bg-red-100 text-red-800'
                      }`}>
                        {st}
                      </span>
                    </div>
                  );
                })}
              </div>

              <div className="bg-white border-t p-2 flex items-center justify-around text-xs">
                <button type="button" onClick={() => setScreen('S4_MY_CLASSES')} className="flex flex-col items-center gap-1 text-slate-400">
                  <BookOpen size={16} /> Classes
                </button>
                <button type="button" onClick={() => setScreen('S9_HISTORY')} className="flex flex-col items-center gap-1 font-bold text-teal-700">
                  <Award size={16} /> History
                </button>
                <button type="button" onClick={() => setScreen('S11_PROFILE')} className="flex flex-col items-center gap-1 text-slate-400">
                  <User size={16} /> Profile
                </button>
              </div>
            </div>
          )}

          {/* S10: OFFLINE QUEUE SCREEN */}
          {screen === 'S10_OFFLINE_QUEUE' && (
            <div className="flex-1 p-5 flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <button type="button" onClick={() => setScreen('S4_MY_CLASSES')} className="p-1">
                    <ArrowLeft size={18} />
                  </button>
                  <h3 className="font-bold text-base">Offline Check-in</h3>
                </div>

                <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl mb-4">
                  <div className="flex items-center gap-2 text-amber-900 font-bold text-sm">
                    <WifiOff size={18} /> No Connection
                  </div>
                  <p className="text-xs text-amber-800 mt-1 leading-relaxed">
                    Your check-in selfie and signature are saved securely on this phone and will be sent automatically as soon as you are back online.
                  </p>
                </div>

                <div className="p-3 bg-white rounded-xl border flex items-center justify-between text-xs mb-4">
                  <div>
                    <strong className="block text-slate-900">{selectedClass?.courseCode ?? 'CS 305'}</strong>
                    <span className="text-[11px] text-slate-500">Saved 10:02 · waiting to send</span>
                  </div>
                  <span className="px-2 py-0.5 bg-amber-100 text-amber-800 text-[10px] font-bold rounded-full">
                    Queued
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setOfflineSimulated(false);
                    handleSubmitCheckin();
                  }}
                  className="w-full py-2.5 rounded-xl bg-teal-700 text-white font-bold text-xs"
                >
                  Retry now (Online)
                </button>
              </div>

              <div className="p-3 bg-slate-100 rounded-xl text-xs text-slate-500">
                <strong className="text-slate-700 block mb-0.5">Phone problem?</strong>
                Dead battery or lost phone: your lecturer can mark you manually with an approved excuse reason.
              </div>
            </div>
          )}

          {/* S11: PROFILE SCREEN */}
          {screen === 'S11_PROFILE' && (
            <div className="flex-1 flex flex-col">
              <div className="p-4 bg-white border-b flex items-center justify-between">
                <h3 className="font-bold text-base text-slate-900">Student Profile</h3>
              </div>

              <div className="flex-1 p-4 space-y-3 overflow-y-auto">
                <div className="p-4 bg-white rounded-xl border flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-teal-700 text-white flex items-center justify-center font-bold text-lg">
                    AB
                  </div>
                  <div>
                    <div className="font-bold text-sm">{studentName}</div>
                    <div className="text-xs text-slate-500 font-mono">Index: {studentIndex}</div>
                    <div className="text-[11px] text-slate-400">{studentEmail}</div>
                  </div>
                </div>

                <div className="p-3 bg-white rounded-xl border flex items-center justify-between text-xs">
                  <div>
                    <strong className="block text-slate-800">Registration photo</strong>
                    <span className="text-[11px] text-slate-500">Confirmed by 2 lecturers</span>
                  </div>
                  <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 text-[10px] font-bold rounded-full">
                    Active
                  </span>
                </div>

                <div className="p-3 bg-white rounded-xl border flex items-center justify-between text-xs">
                  <div>
                    <strong className="block text-slate-800">This phone</strong>
                    <span className="text-[11px] text-slate-500">Registered hardware keystore</span>
                  </div>
                  <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 text-[10px] font-bold rounded-full">
                    Bound
                  </span>
                </div>

                <div className="space-y-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setScreen('S3_FACE_CAPTURE')}
                    className="w-full py-2.5 rounded-xl border border-slate-300 text-xs font-bold text-slate-700 bg-white"
                  >
                    Re-capture photo
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      alert('Device re-bind request submitted with email verification.');
                    }}
                    className="w-full py-2.5 rounded-xl border border-slate-300 text-xs font-bold text-slate-700 bg-white"
                  >
                    Request new phone re-bind
                  </button>
                  <button
                    type="button"
                    onClick={() => setScreen('S1_LOGIN')}
                    className="w-full py-2.5 rounded-xl border border-red-300 text-xs font-bold text-red-600 bg-white"
                  >
                    Log out
                  </button>
                </div>
              </div>

              <div className="bg-white border-t p-2 flex items-center justify-around text-xs">
                <button type="button" onClick={() => setScreen('S4_MY_CLASSES')} className="flex flex-col items-center gap-1 text-slate-400">
                  <BookOpen size={16} /> Classes
                </button>
                <button type="button" onClick={handleOpenHistory} className="flex flex-col items-center gap-1 text-slate-400">
                  <Award size={16} /> History
                </button>
                <button type="button" onClick={() => setScreen('S11_PROFILE')} className="flex flex-col items-center gap-1 font-bold text-teal-700">
                  <User size={16} /> Profile
                </button>
              </div>
            </div>
          )}

          {/* S12: DISPUTE CLAIM SCREEN */}
          {screen === 'S12_DISPUTE' && (
            <div className="flex-1 p-5 flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <button type="button" onClick={() => setScreen('S2_REGISTER')} className="p-1">
                    <ArrowLeft size={18} />
                  </button>
                  <h3 className="font-bold text-base">Index Number Taken</h3>
                </div>

                <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl mb-4 space-y-2">
                  <div className="font-bold text-sm text-amber-900">
                    Index {regIndex || studentIndex} is already registered
                  </div>
                  <p className="text-xs text-amber-800 leading-relaxed">
                    If this is your genuine index number, claim it. The administrator will check you in person with your Student ID card.
                  </p>
                </div>

                {!disputeSuccess ? (
                  <>
                    <label className="text-xs font-semibold text-slate-700">Explanation for administrator</label>
                    <textarea
                      className="w-full rounded-xl border border-slate-300 bg-white p-2.5 text-xs mt-1 mb-3 h-24"
                      value={disputeReason}
                      onChange={(e) => setDisputeReason(e.target.value)}
                    />
                    <button
                      type="button"
                      onClick={handleClaimDispute}
                      disabled={loading}
                      className="w-full py-3 rounded-xl bg-teal-700 text-white font-bold text-xs cursor-pointer"
                    >
                      {loading ? 'Submitting…' : 'This index number is mine'}
                    </button>
                  </>
                ) : (
                  <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800">
                    <strong>Dispute case opened.</strong>
                    <p className="mt-1">
                      Check-in is locked for this index until an administrator verifies your student ID card in person.
                    </p>
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={() => setScreen('S1_LOGIN')}
                className="w-full py-2 text-xs text-slate-500 text-center"
              >
                Return to sign in
              </button>
            </div>
          )}

        </div>

        {/* Mobile Home Bar */}
        <div className="w-full bg-slate-950 py-1.5 flex justify-center shrink-0">
          <div className="w-28 h-1 bg-slate-700 rounded-full" />
        </div>
      </div>
    </div>
  );
}
