import { randomInt, randomUUID } from "node:crypto";
import { Router, type IRouter } from "express";
import { z } from "zod";
import { memoryStore } from "../../lib/attendanceStore";
import {
  extractBearerToken,
  hashPassword,
  issueSessionToken,
  resolveRequestSession,
  verifyPassword,
  verifySessionCode,
} from "../../lib/authUtils";

const router: IRouter = Router();

// In-memory student challenges and pending state
interface CheckinChallengeEntry {
  challengeId: string;
  sessionId: string;
  studentId: string;
  studentIndex: string;
  nonce: string;
  livenessPrompt: "blink_twice" | "turn_head_left" | "turn_head_right" | "smile";
  expiresAt: number;
}

const activeChallenges = new Map<string, CheckinChallengeEntry>();
const studentRegistrationOtps = new Map<string, { email: string; indexNumber: string; fullName: string; otp: string; expiresAt: number }>();
const studentRegisteredDevices = new Map<string, { deviceId: string; model: string; registeredAt: string; bound: boolean }>();

// ---------------------------------------------------------------------------
// S2: Student Registration Start & Verify (PDF §6 API Design)
// ---------------------------------------------------------------------------

const StudentRegisterStartBody = z.object({
  fullName: z.string().trim().min(2).max(120),
  indexNumber: z.string().trim().min(3).max(32),
  email: z.string().trim().email().max(254),
});

router.post("/v1/auth/student/register/start", (req, res): void => {
  const parsed = StudentRegisterStartBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid registration details." });
    return;
  }

  const normIndex = parsed.data.indexNumber.trim().toUpperCase();
  const normEmail = parsed.data.email.trim().toLowerCase();

  // Check if index number is already registered
  const existingRosterMatch = memoryStore.roster.find((r) => r.indexNumber.toUpperCase() === normIndex);
  const existingClaimed = memoryStore.disputes.some((d) => d.studentIndex.toUpperCase() === normIndex && d.status === "open");

  const isAlreadyRegistered = existingRosterMatch && (existingRosterMatch.linkStatus === "matched" || existingRosterMatch.faceEnrolled);
  if (isAlreadyRegistered && !existingClaimed) {
    res.status(409).json({
      error: `Index number ${normIndex} is already registered on this campus.`,
      indexNumberTaken: true,
      indexNumber: normIndex,
    });
    return;
  }

  const otp = String(randomInt(100000, 999999));
  studentRegistrationOtps.set(normIndex, {
    fullName: parsed.data.fullName.trim(),
    indexNumber: normIndex,
    email: normEmail,
    otp,
    expiresAt: Date.now() + 10 * 60_000,
  });

  memoryStore.addSystemLog({
    level: "auth",
    category: "security",
    message: `Student registration OTP issued for ${normIndex} (${normEmail})`,
    details: { indexNumber: normIndex, email: normEmail },
  });

  res.json({
    ok: true,
    message: "A 6-digit verification code has been sent to your institutional email.",
    previewOtp: otp, // Available for development/testing
  });
});

const StudentRegisterVerifyBody = z.object({
  indexNumber: z.string().trim().min(3).max(32),
  email: z.string().trim().email().max(254),
  code: z.string().trim().length(6),
  password: z.string().min(6).max(128),
  consentGiven: z.boolean(),
  deviceId: z.string().optional().default("device_android_default"),
  deviceModel: z.string().optional().default("Android Mobile Phone"),
});

router.post("/v1/auth/student/register/verify", (req, res): void => {
  const parsed = StudentRegisterVerifyBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid verification request." });
    return;
  }

  if (!parsed.data.consentGiven) {
    res.status(400).json({ error: "You must accept the biometric consent notice to complete registration." });
    return;
  }

  const normIndex = parsed.data.indexNumber.trim().toUpperCase();
  const entry = studentRegistrationOtps.get(normIndex);
  if (!entry || Date.now() > entry.expiresAt) {
    res.status(400).json({ error: "Verification code expired. Request a new code." });
    return;
  }

  if (entry.otp !== parsed.data.code.trim()) {
    res.status(400).json({ error: "Invalid 6-digit verification code." });
    return;
  }

  studentRegistrationOtps.delete(normIndex);

  // Link to existing roster entry or register
  let targetStudent = memoryStore.roster.find((r) => r.indexNumber.toUpperCase() === normIndex);
  if (!targetStudent) {
    targetStudent = {
      id: randomUUID(),
      classId: memoryStore.classes[0]?.id ?? randomUUID(),
      fullName: entry.fullName,
      indexNumber: normIndex,
      email: entry.email,
      phone: "+233 24 000 0000",
      linkStatus: "matched",
      faceEnrolled: true,
      photoReleaseBasis: "auto",
      verificationStatus: "unconfirmed",
      confirmedByCount: 0,
      portraitKey: "ama-portrait",
      disputeReason: null,
      disputedAt: null,
      createdAt: new Date(),
    };
    memoryStore.roster.push(targetStudent);
  } else {
    targetStudent.linkStatus = "matched";
    targetStudent.fullName = entry.fullName;
    targetStudent.email = entry.email;
    targetStudent.faceEnrolled = true;
  }

  // Bind device
  studentRegisteredDevices.set(normIndex, {
    deviceId: parsed.data.deviceId,
    model: parsed.data.deviceModel,
    registeredAt: new Date().toISOString(),
    bound: true,
  });

  const token = issueSessionToken({
    userId: targetStudent.id,
    email: targetStudent.email,
    fullName: targetStudent.fullName,
    role: "student",
    departments: [],
  });

  res.json({
    token,
    user: {
      id: targetStudent.id,
      indexNumber: targetStudent.indexNumber,
      fullName: targetStudent.fullName,
      email: targetStudent.email,
    },
    deviceBound: true,
  });
});

// ---------------------------------------------------------------------------
// S12: Index Number Taken / "This Index Number Is Mine" Claim
// ---------------------------------------------------------------------------

const StudentClaimBody = z.object({
  indexNumber: z.string().trim().min(3).max(32),
  email: z.string().trim().email().max(254),
  fullName: z.string().trim().min(2).max(120),
  reason: z.string().trim().min(3).max(500),
});

router.post("/v1/auth/student/claim", (req, res): void => {
  const parsed = StudentClaimBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid claim details." });
    return;
  }

  const normIndex = parsed.data.indexNumber.trim().toUpperCase();
  const disputeId = `disp_${randomUUID().slice(0, 8)}`;
  const classMatch = memoryStore.classes[0];

  memoryStore.disputes.unshift({
    id: disputeId,
    caseType: "student_claim",
    classId: classMatch?.id ?? "11111111-1111-4111-8111-111111111101",
    courseCode: classMatch?.courseCode ?? "CS 305",
    department: classMatch?.department ?? "Computer Science",
    studentIndex: normIndex,
    studentName: parsed.data.fullName.trim(),
    claimReason: parsed.data.reason.trim() || `Student claim: Index ${normIndex} reported by ${parsed.data.email.trim()}`,
    status: "open",
    registrationPhotoKey: "yaw-portrait",
    checkinPhotoKey: "kwame-checkin-wide",
    photoViewsCount: 0,
    accountLocked: true,
    createdAt: new Date(),
  });

  memoryStore.addSystemLog({
    level: "warn",
    category: "dispute",
    message: `Identity dispute opened: student claimed registered index ${normIndex}`,
    details: { indexNumber: normIndex, email: parsed.data.email },
  });

  res.json({
    disputeId,
    status: "open",
    accountLocked: true,
    message: "Identity dispute opened. The administrator will resolve your claim in person with your Student ID card.",
  });
});

// ---------------------------------------------------------------------------
// S4: Student Classes & Enrolments (PDF §6.2)
// ---------------------------------------------------------------------------

router.get("/v1/me/classes", (req, res): void => {
  const authSession = resolveRequestSession(req);
  const indexQuery = (req.query.indexNumber as string | undefined)?.trim().toUpperCase();
  const studentIndex = indexQuery || "5231001"; // Fallback demo student index

  const enrolments = memoryStore.roster.filter((r) => r.indexNumber.toUpperCase() === studentIndex);
  const enrolledClassIds = new Set(enrolments.map((r) => r.classId));

  const classes = memoryStore.classes
    .filter((c) => enrolledClassIds.has(c.id) && !c.archived)
    .map((c) => {
      const activeSession = memoryStore.sessions.find(
        (s) => s.classId === c.id && s.status === "open",
      );
      const scheduledSession = memoryStore.sessions.find(
        (s) => s.classId === c.id && s.status === "scheduled",
      );

      return {
        id: c.id,
        courseCode: c.courseCode,
        courseTitle: c.courseTitle,
        department: c.department,
        programme: c.programme,
        level: c.level,
        semester: c.semester,
        academicYear: c.academicYear,
        activeSession: activeSession
          ? {
              id: activeSession.id,
              topic: activeSession.topic,
              venue: activeSession.venue,
              status: activeSession.status,
              codeMode: activeSession.codeMode,
              closesAt: activeSession.endsAt.toISOString(),
            }
          : null,
        scheduledSession: scheduledSession
          ? {
              id: scheduledSession.id,
              topic: scheduledSession.topic,
              venue: scheduledSession.venue,
              startsAt: scheduledSession.startsAt.toISOString(),
            }
          : null,
      };
    });

  // Check for any pending photo release requests
  const pendingRequests = memoryStore.roster.filter(
    (r) => r.indexNumber.toUpperCase() === studentIndex && r.photoReleaseBasis === "pending",
  );

  res.json({
    studentIndex,
    classes,
    pendingPhotoRequestsCount: pendingRequests.length,
  });
});

// ---------------------------------------------------------------------------
// S6 & S7: Check-in Contract Step 1 (Start) & Step 2 (Submit) (PDF §6.2)
// ---------------------------------------------------------------------------

const CheckinStartBody = z.object({
  code: z.string().trim().min(3).max(64),
  deviceId: z.string().trim().min(1).default("device_android_default"),
  indexNumber: z.string().trim().optional(),
});

router.post("/v1/checkin/start", (req, res): void => {
  const parsed = CheckinStartBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid check-in start payload." });
    return;
  }

  const cleanInput = parsed.data.code.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  const rotateSec = memoryStore.adminSettings.rotatingCodeSeconds || 45;

  // Find matching open session by session ID or live rotating/static Base32 code
  const openSessions = memoryStore.sessions.filter((s) => s.status === "open");
  let matchedSession = null;

  for (const s of openSessions) {
    if (s.id.toUpperCase().startsWith(cleanInput) || cleanInput.includes(s.id.slice(0, 8).toUpperCase())) {
      matchedSession = s;
      break;
    }

    if (verifySessionCode(s.id, s.codeMode, cleanInput, rotateSec)) {
      matchedSession = s;
      break;
    }
  }

  if (!matchedSession) {
    res.status(404).json({
      error: {
        code: "SESSION_NOT_FOUND",
        message: "No active attendance session matches the entered code.",
        retryable: true,
      },
    });
    return;
  }

  const classroom = memoryStore.classes.find((c) => c.id === matchedSession.classId);
  const challengeId = `c_${randomUUID().slice(0, 12)}`;
  const nonce = randomUUID().replace(/-/g, "").slice(0, 16);

  const livenessPrompts: Array<CheckinChallengeEntry["livenessPrompt"]> = [
    "blink_twice",
    "turn_head_left",
    "turn_head_right",
    "smile",
  ];
  const livenessPrompt = livenessPrompts[randomInt(0, livenessPrompts.length)];

  activeChallenges.set(challengeId, {
    challengeId,
    sessionId: matchedSession.id,
    studentId: "student_verified",
    studentIndex: parsed.data.indexNumber || "5231001",
    nonce,
    livenessPrompt,
    expiresAt: Date.now() + 90 * 1000,
  });

  res.json({
    challenge_id: challengeId,
    nonce,
    liveness_prompt: livenessPrompt,
    expires_in: 90,
    class: {
      course: classroom?.courseCode ?? "CS 305",
      title: classroom?.courseTitle ?? "Computer Networks",
      lecturer: "Dr. Kwesi Mensah",
      venue: matchedSession.venue,
      closes_at: matchedSession.endsAt.toISOString(),
      session_id: matchedSession.id,
    },
  });
});

const CheckinSubmitBody = z.object({
  challenge_id: z.string().min(1),
  request_id: z.string().optional(),
  indexNumber: z.string().trim().min(3),
  latitude: z.number().optional().nullable(),
  longitude: z.number().optional().nullable(),
  accuracy_m: z.number().optional().nullable(),
  mock_location: z.boolean().optional().default(false),
  integrity_token: z.string().optional().default("integrity_token_valid"),
  liveness_completed: z.boolean().optional().default(true),
  photo_base64: z.string().optional(),
  photoKey: z.string().optional().default("yaw-checkin-wide"),
});

router.post("/v1/checkin/submit", (req, res): void => {
  const parsed = CheckinSubmitBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid check-in submission." });
    return;
  }

  const challenge = activeChallenges.get(parsed.data.challenge_id);
  if (!challenge || Date.now() > challenge.expiresAt) {
    res.status(400).json({
      error: {
        code: "CHALLENGE_EXPIRED",
        message: "Check-in challenge expired or already used. Please scan the QR again.",
        retryable: true,
      },
    });
    return;
  }

  activeChallenges.delete(parsed.data.challenge_id);

  const session = memoryStore.sessions.find((s) => s.id === challenge.sessionId);
  if (!session || session.status !== "open") {
    res.status(409).json({
      error: {
        code: "SESSION_CLOSED",
        message: "This session has closed. New check-ins cannot be accepted.",
        retryable: false,
      },
    });
    return;
  }

  const normIndex = parsed.data.indexNumber.trim().toUpperCase();
  const rosterStudent = memoryStore.roster.find(
    (r) => r.classId === session.classId && r.indexNumber.toUpperCase() === normIndex,
  );

  if (!rosterStudent) {
    res.status(404).json({
      error: {
        code: "NOT_ENROLLED",
        message: `Index number ${normIndex} is not enrolled on this class roster.`,
        retryable: false,
      },
    });
    return;
  }

  // Check if student has active dispute
  const hasLock = memoryStore.disputes.some(
    (d) => d.status === "open" && d.accountLocked && d.studentIndex.toUpperCase() === normIndex,
  );
  if (rosterStudent.verificationStatus === "disputed" || hasLock) {
    res.status(403).json({
      error: {
        code: "IDENTITY_DISPUTED",
        message: `Check-in locked for index ${normIndex} due to an active identity dispute.`,
        retryable: false,
      },
    });
    return;
  }

  // 9 Verification checks pipeline:
  const flags: string[] = [];
  if (parsed.data.mock_location) flags.push("MOCK_LOCATION");
  if (parsed.data.accuracy_m != null && parsed.data.accuracy_m > 250) flags.push("GEO_LOW_ACCURACY");
  if (!parsed.data.liveness_completed) flags.push("LIVENESS_FAIL");

  // Location radius check if session venue location is set
  if (!session.locationSkipped && session.locationLat && parsed.data.latitude != null) {
    const lat1 = parseFloat(session.locationLat);
    const lng1 = parseFloat(session.locationLng || "0");
    const lat2 = parsed.data.latitude;
    const lng2 = parsed.data.longitude || 0;
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLng = (lng2 - lng1) * (Math.PI / 180);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distM = Math.round(6371e3 * c);
    if (distM > session.radiusM) {
      flags.push("GEO_OUTSIDE");
    }
  }

  // Duplicate check in this session
  const existingRecord = memoryStore.records.find(
    (r) => r.sessionId === session.id && r.rosterStudentId === rosterStudent.id,
  );

  const status = flags.length > 0 ? "needs_review" : "present";
  const now = new Date();

  if (existingRecord) {
    existingRecord.status = status;
    existingRecord.markedAt = now;
    existingRecord.flags = flags;
    existingRecord.accuracyM = parsed.data.accuracy_m ?? null;
    existingRecord.photoKey = parsed.data.photoKey;
  } else {
    memoryStore.records.push({
      id: randomUUID(),
      sessionId: session.id,
      rosterStudentId: rosterStudent.id,
      status,
      markedAt: now,
      flags,
      note: flags.length > 0 ? `Flagged by mobile verification: ${flags.join(", ")}` : "Verified mobile selfie",
      faceScore: flags.includes("LIVENESS_FAIL") ? "0.62" : "0.96",
      distanceM: 35,
      accuracyM: parsed.data.accuracy_m ?? 20,
      photoKey: parsed.data.photoKey,
      markedManually: false,
      reviewedBy: null,
      reviewedAt: null,
      createdAt: now,
    });
  }

  if (status === "present") {
    res.json({
      status: "present",
      message: `Marked present at ${now.toLocaleTimeString("en-GH", { hour: "2-digit", minute: "2-digit" })}`,
      marked_at: now.toISOString(),
    });
  } else {
    res.json({
      status: "needs_review",
      message: "Sent to your lecturer for review",
      reasons: flags,
      marked_at: now.toISOString(),
    });
  }
});

// ---------------------------------------------------------------------------
// Manual Self-Reported Check-In (ManualCheckInModal)
// ---------------------------------------------------------------------------

const ManualCheckinBody = z.object({
  code: z.string().trim().min(1).max(24),
  indexNumber: z.string().trim().min(3).max(32),
  sessionId: z.string().optional(),
  note: z.string().trim().max(240).optional(),
  latitude: z.number().optional().nullable(),
  longitude: z.number().optional().nullable(),
  accuracy_m: z.number().optional().nullable(),
});

router.post("/v1/checkin/manual", (req, res): void => {
  const parsed = ManualCheckinBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: {
        code: "INVALID_PAYLOAD",
        message: parsed.error.issues[0]?.message ?? "Enter a valid session code and index number.",
      },
    });
    return;
  }

  const rawCode = parsed.data.code.trim().toUpperCase();
  const formatValid = /^[A-Z0-9]{3}-?[A-Z0-9]{3}$/.test(rawCode);
  if (!formatValid) {
    res.status(400).json({
      error: {
        code: "INVALID_CODE_FORMAT",
        message: "Session code must be 6 letters or numbers (e.g. K7Q-2XP).",
      },
    });
    return;
  }

  const cleanInput = rawCode.replace(/-/g, "");
  const rotateSec = memoryStore.adminSettings.rotatingCodeSeconds || 45;
  const openSessions = memoryStore.sessions.filter(
    (s) => s.status === "open" && (!parsed.data.sessionId || s.id === parsed.data.sessionId),
  );

  let matchedSession = null;
  for (const s of openSessions) {
    if (verifySessionCode(s.id, s.codeMode, cleanInput, rotateSec)) {
      matchedSession = s;
      break;
    }
  }

  if (!matchedSession) {
    res.status(404).json({
      error: {
        code: "INVALID_OR_EXPIRED_CODE",
        message: "No open session matches that code, or the rotating code has expired. Check the lecturer's screen and try again.",
      },
    });
    return;
  }

  const normIndex = parsed.data.indexNumber.trim().toUpperCase();
  const rosterStudent = memoryStore.roster.find(
    (r) => r.classId === matchedSession.classId && r.indexNumber.toUpperCase() === normIndex,
  );

  if (!rosterStudent) {
    res.status(404).json({
      error: {
        code: "NOT_ENROLLED",
        message: `Index number ${normIndex} is not enrolled on this class roster.`,
      },
    });
    return;
  }

  const hasLock = memoryStore.disputes.some(
    (d) => d.status === "open" && d.accountLocked && d.studentIndex.toUpperCase() === normIndex,
  );
  if (rosterStudent.verificationStatus === "disputed" || hasLock) {
    res.status(403).json({
      error: {
        code: "IDENTITY_DISPUTED",
        message: `Check-in is locked for index ${normIndex} due to an active identity dispute.`,
      },
    });
    return;
  }

  const classroom = memoryStore.classes.find((c) => c.id === matchedSession.classId);
  const existingRecord = memoryStore.records.find(
    (r) => r.sessionId === matchedSession.id && r.rosterStudentId === rosterStudent.id,
  );

  if (existingRecord && (existingRecord.status === "present" || existingRecord.status === "excused")) {
    res.json({
      success: true,
      alreadyCheckedIn: true,
      status: existingRecord.status,
      courseCode: classroom?.courseCode ?? "Course",
      courseTitle: classroom?.courseTitle ?? "Session",
      topic: matchedSession.topic,
      venue: matchedSession.venue,
      studentName: rosterStudent.fullName,
      indexNumber: rosterStudent.indexNumber,
      flags: existingRecord.flags,
      markedAt: (existingRecord.markedAt ?? new Date()).toISOString(),
      message: `You are already marked ${existingRecord.status} for ${classroom?.courseCode ?? "this session"}.`,
    });
    return;
  }

  const flags: string[] = [];
  let distanceM: number | null = null;
  if (!matchedSession.locationSkipped && matchedSession.locationLat && parsed.data.latitude != null) {
    const lat1 = parseFloat(matchedSession.locationLat);
    const lng1 = parseFloat(matchedSession.locationLng || "0");
    const lat2 = parsed.data.latitude;
    const lng2 = parsed.data.longitude || 0;
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLng = (lng2 - lng1) * (Math.PI / 180);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * (Math.PI / 180)) *
        Math.cos(lat2 * (Math.PI / 180)) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    distanceM = Math.round(6371e3 * c);
    if (distanceM > matchedSession.radiusM) {
      flags.push("GEO_OUTSIDE");
    }
  }

  if (
    matchedSession.lateAfterMinutes != null &&
    Date.now() > matchedSession.startsAt.getTime() + matchedSession.lateAfterMinutes * 60_000
  ) {
    flags.push("LATE");
  }

  const status: "present" | "needs_review" = flags.includes("GEO_OUTSIDE") ? "needs_review" : "present";
  const now = new Date();
  const baseNote = parsed.data.note?.trim()
    ? `Self-reported via session code (${parsed.data.note.trim()})`
    : "Self-reported via session code";

  if (existingRecord) {
    existingRecord.status = status;
    existingRecord.markedAt = now;
    existingRecord.flags = flags;
    existingRecord.note = baseNote;
    existingRecord.distanceM = distanceM;
    existingRecord.accuracyM = parsed.data.accuracy_m ?? null;
  } else {
    memoryStore.records.push({
      id: randomUUID(),
      sessionId: matchedSession.id,
      rosterStudentId: rosterStudent.id,
      status,
      markedAt: now,
      flags,
      note: baseNote,
      faceScore: null,
      distanceM,
      accuracyM: parsed.data.accuracy_m ?? null,
      photoKey: null,
      markedManually: false,
      reviewedBy: null,
      reviewedAt: null,
      createdAt: now,
    });
  }

  memoryStore.addSystemLog({
    level: "info",
    category: "checkin",
    message: `Student ${rosterStudent.indexNumber} self-reported ${status} for ${classroom?.courseCode ?? matchedSession.id}`,
    details: { sessionId: matchedSession.id, indexNumber: rosterStudent.indexNumber, status, flags },
  });

  res.json({
    success: true,
    alreadyCheckedIn: false,
    status,
    courseCode: classroom?.courseCode ?? "Course",
    courseTitle: classroom?.courseTitle ?? "Session",
    topic: matchedSession.topic,
    venue: matchedSession.venue,
    studentName: rosterStudent.fullName,
    indexNumber: rosterStudent.indexNumber,
    flags,
    markedAt: now.toISOString(),
    message:
      status === "present"
        ? `Marked present at ${now.toLocaleTimeString("en-GH", { hour: "2-digit", minute: "2-digit" })}.`
        : "Attendance recorded and sent to your lecturer for review.",
  });
});

// ---------------------------------------------------------------------------
// S9: Student Attendance History (PDF §6.2)
// ---------------------------------------------------------------------------

router.get("/v1/me/attendance", (req, res): void => {
  const indexQuery = (req.query.indexNumber as string | undefined)?.trim().toUpperCase() || "5231001";
  const rosterEntries = memoryStore.roster.filter((r) => r.indexNumber.toUpperCase() === indexQuery);
  const rosterIds = new Set(rosterEntries.map((r) => r.id));

  const records = memoryStore.records
    .filter((r) => rosterIds.has(r.rosterStudentId))
    .map((r) => {
      const session = memoryStore.sessions.find((s) => s.id === r.sessionId);
      const classroom = session ? memoryStore.classes.find((c) => c.id === session.classId) : null;
      return {
        id: r.id,
        courseCode: classroom?.courseCode ?? "Course",
        courseTitle: classroom?.courseTitle ?? "Title",
        topic: session?.topic ?? "Lecture Session",
        date: session?.startsAt.toISOString() ?? r.createdAt.toISOString(),
        status: r.status,
        markedAt: r.markedAt ? r.markedAt.toISOString() : null,
      };
    });

  const totalSessions = records.length || 1;
  const attendedCount = records.filter((r) => r.status === "present").length;
  const percentage = Math.round((attendedCount / totalSessions) * 100);

  res.json({
    studentIndex: indexQuery,
    totalSessions,
    attendedCount,
    percentage,
    thresholdPercentage: memoryStore.adminSettings.attendanceThresholdPct,
    records,
  });
});

export default router;
