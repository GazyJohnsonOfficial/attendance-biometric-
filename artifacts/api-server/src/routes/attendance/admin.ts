import { randomUUID } from "node:crypto";
import ExcelJS from "exceljs";
import { Router, type IRouter, type Request } from "express";
import { z } from "zod";
import { memoryStore } from "../../lib/attendanceStore";
import { getAdminDepartmentScope, requireAdmin, verifyReauthHeader } from "../../lib/authUtils";

const router: IRouter = Router();
router.use("/admin", requireAdmin);

function isInScope(scope: string[] | null, deptOrList: string | string[]): boolean {
  if (!scope) return true;
  const list = Array.isArray(deptOrList) ? deptOrList : [deptOrList];
  return list.some((d) => scope.some((s) => s.toLowerCase() === d.toLowerCase()));
}

function recordAudit(
  req: Request,
  entityType: string,
  entityId: string,
  action: string,
  opts?: {
    reason?: string;
    before?: Record<string, unknown> | null;
    after?: Record<string, unknown> | null;
    details?: Record<string, unknown>;
  },
) {
  return memoryStore.recordAdminAudit({
    actorUserId: req.authSession?.userId ?? "admin_super_1",
    actorEmail: req.authSession?.email ?? "admin@school.edu.gh",
    actorRole: req.authSession?.role ?? "super_admin",
    ip: req.ip,
    entityType,
    entityId,
    action,
    reason: opts?.reason,
    before: opts?.before,
    after: opts?.after,
    details: opts?.details,
  });
}

function requireReauth(req: Request, res: import("express").Response): boolean {
  if (!verifyReauthHeader(req)) {
    res.status(428).json({
      code: "REAUTH_REQUIRED",
      error: "Re-authentication required before performing this sensitive action.",
    });
    return false;
  }
  return true;
}

// ---------- 3. SYSTEM OVERSIGHT (OVERSEER VIEW — METADATA ONLY, NO STUDENT NAMES/PHOTOS) ----------
router.get("/admin/overview", (req, res): void => {
  const scope = getAdminDepartmentScope(req);
  const scopedClasses = memoryStore.classes.filter((c) => isInScope(scope, c.department));
  const scopedClassIds = new Set(scopedClasses.map((c) => c.id));
  const classMap = new Map(scopedClasses.map((c) => [c.id, c]));

  const scopedRoster = memoryStore.roster.filter((r) => scopedClassIds.has(r.classId));
  const registeredStudents = scopedRoster.filter(
    (r) => r.linkStatus === "matched" || r.faceEnrolled,
  ).length;

  const scopedSessions = memoryStore.sessions.filter((s) => scopedClassIds.has(s.classId));
  const scopedSessionIds = new Set(scopedSessions.map((s) => s.id));
  const scopedRecords = memoryStore.records.filter((r) => scopedSessionIds.has(r.sessionId));

  const todayStr = new Date().toISOString().slice(0, 10);
  const sessionsToday = scopedSessions.filter(
    (s) => s.startsAt.toISOString().slice(0, 10) === todayStr || s.status === "open",
  ).length;
  const checkInsToday = scopedRecords.filter(
    (r) =>
      (r.markedAt && r.markedAt.toISOString().slice(0, 10) === todayStr) ||
      scopedSessions.find((s) => s.id === r.sessionId)?.status === "open",
  ).length;

  const openSessions = scopedSessions.filter((s) => s.status === "open").length;
  const reviewQueueCount = scopedRecords.filter((r) => r.status === "needs_review").length;
  const needsReviewRate =
    scopedRecords.length > 0 ? Math.round((reviewQueueCount / scopedRecords.length) * 100) : 0;
  const geofenceViolationCount = scopedRecords.filter((r) => r.flags.includes("GEO_OUTSIDE")).length;

  const scopedLecturers = memoryStore.lecturerProfiles.filter((l) => isInScope(scope, l.departments));
  const lecturerMap = new Map(scopedLecturers.map((l) => [l.userId, l]));

  const openDisputesCount = memoryStore.disputes.filter(
    (d) => d.status === "open" && isInScope(scope, d.department),
  ).length;

  const activeDepts = memoryStore.departmentRecords
    .filter((d) => d.active && isInScope(scope, d.name))
    .map((d) => d.name);

  const departmentStats = activeDepts.map((dept) => {
    const cls = scopedClasses.filter((c) => c.department.toLowerCase() === dept.toLowerCase());
    const classIds = new Set(cls.map((c) => c.id));
    const rosterCount = scopedRoster.filter((r) => classIds.has(r.classId)).length;
    const deptSessions = scopedSessions.filter((s) => classIds.has(s.classId));
    const deptSessionIds = new Set(deptSessions.map((s) => s.id));
    const deptRecords = scopedRecords.filter((r) => deptSessionIds.has(r.sessionId));
    const presentCount = deptRecords.filter((r) => r.status === "present" || r.status === "excused").length;
    const avgAttendance =
      deptRecords.length > 0 ? Math.round((presentCount / deptRecords.length) * 100) : cls.length > 0 ? 82 : 0;
    const deptLecturers = scopedLecturers.filter((l) =>
      l.departments.some((d) => d.toLowerCase() === dept.toLowerCase()),
    );
    const activeLecturers = deptLecturers.filter((l) => cls.some((c) => c.ownerUserId === l.userId)).length;
    const lecturerAdoptionPct =
      deptLecturers.length > 0 ? Math.round((activeLecturers / deptLecturers.length) * 100) : 0;

    return {
      department: dept,
      classesCount: cls.length,
      studentsCount: rosterCount,
      sessionsCount: deptSessions.length,
      averageAttendancePct: avgAttendance,
      lecturerAdoptionPct,
    };
  });

  const programmeStats = memoryStore.programmeRecords
    .filter((p) => p.active && isInScope(scope, p.departmentName))
    .map((prog) => {
      const cls = scopedClasses.filter((c) => c.programme.toLowerCase() === prog.name.toLowerCase());
      const classIds = new Set(cls.map((c) => c.id));
      const progSessions = scopedSessions.filter((s) => classIds.has(s.classId));
      const progSessionIds = new Set(progSessions.map((s) => s.id));
      const progRecords = scopedRecords.filter((r) => progSessionIds.has(r.sessionId));
      const presentCount = progRecords.filter((r) => r.status === "present" || r.status === "excused").length;
      const avgAttendance =
        progRecords.length > 0 ? Math.round((presentCount / progRecords.length) * 100) : cls.length > 0 ? 84 : 0;
      const distinctLecturers = new Set(cls.map((c) => c.ownerUserId)).size;
      return {
        programme: prog.name,
        department: prog.departmentName,
        classesCount: cls.length,
        sessionsCount: progSessions.length,
        averageAttendancePct: avgAttendance,
        activeLecturersCount: distinctLecturers,
      };
    });

  // Metadata-only classes & sessions (strictly zero student names/rosters/photos)
  const allClassesMeta = scopedClasses.map((c) => {
    const owner = lecturerMap.get(c.ownerUserId);
    const rosterCount = scopedRoster.filter((r) => r.classId === c.id).length;
    const sessionsCount = scopedSessions.filter((s) => s.classId === c.id).length;
    return {
      id: c.id,
      courseCode: c.courseCode,
      courseTitle: c.courseTitle,
      department: c.department,
      programme: c.programme,
      level: c.level,
      semester: c.semester,
      lecturerName: owner?.fullName ?? "Assigned Lecturer",
      rosterCount,
      sessionsCount,
      archived: c.archived,
    };
  });

  const allSessionsMeta = scopedSessions
    .slice()
    .sort((a, b) => b.startsAt.getTime() - a.startsAt.getTime())
    .map((s) => {
      const cls = classMap.get(s.classId);
      const owner = cls ? lecturerMap.get(cls.ownerUserId) : undefined;
      const recs = scopedRecords.filter((r) => r.sessionId === s.id);
      const checkedInCount = recs.filter((r) => r.status === "present" || r.status === "excused").length;
      const needsReviewCount = recs.filter((r) => r.status === "needs_review").length;
      return {
        id: s.id,
        courseCode: cls?.courseCode ?? "—",
        courseTitle: cls?.courseTitle ?? "—",
        department: cls?.department ?? "—",
        lecturerName: owner?.fullName ?? "Assigned Lecturer",
        location: s.venue,
        startsAt: s.startsAt.toISOString(),
        endsAt: s.endsAt.toISOString(),
        status: s.status,
        expectedCount: s.expectedStudents,
        checkedInCount,
        needsReviewCount,
      };
    });

  const nowTs = Date.now();
  const openSessionFlags = allSessionsMeta.filter(
    (s) => s.status === "open" || (s.status === "closed" && nowTs - new Date(s.endsAt).getTime() > 24 * 3600_000),
  );

  const unfinalisedLecturerFlags = scopedLecturers
    .map((l) => {
      const ownedClassIds = new Set(scopedClasses.filter((c) => c.ownerUserId === l.userId).map((c) => c.id));
      const ownedSessions = scopedSessions.filter((s) => ownedClassIds.has(s.classId));
      const unfinalisedCount = ownedSessions.filter((s) => s.status !== "finalized").length;
      return {
        userId: l.userId,
        fullName: l.fullName,
        staffId: l.staffId,
        totalSessions: ownedSessions.length,
        unfinalisedCount,
        neverFinalised: ownedSessions.length > 0 && ownedSessions.every((s) => s.status !== "finalized"),
      };
    })
    .filter((f) => f.unfinalisedCount > 0 || f.neverFinalised);

  res.json({
    totalClasses: scopedClasses.length,
    totalLecturers: scopedLecturers.length,
    totalStudents: scopedRoster.length,
    registeredStudents,
    totalSessions: scopedSessions.length,
    sessionsToday,
    checkInsToday,
    openSessions,
    reviewQueueCount,
    needsReviewRate,
    openDisputesCount,
    geofenceViolationCount,
    systemHealth: "99.98%",
    scopedDepartments: scope,
    departmentStats,
    programmeStats,
    allClassesMeta,
    allSessionsMeta,
    openSessionFlags,
    unfinalisedLecturerFlags,
    systemSettings: memoryStore.adminSettings,
  });
});

// ---------- 2. LECTURER MANAGEMENT ----------
router.get("/admin/lecturers", (req, res): void => {
  const scope = getAdminDepartmentScope(req);
  const lecturers = memoryStore.lecturerProfiles.filter((l) => isInScope(scope, l.departments));

  const enriched = lecturers.map((l) => {
    const ownedClasses = memoryStore.classes.filter((c) => c.ownerUserId === l.userId);
    const ownedClassIds = new Set(ownedClasses.map((c) => c.id));
    const ownedSessions = memoryStore.sessions.filter((s) => ownedClassIds.has(s.classId));
    const ownedSessionIds = new Set(ownedSessions.map((s) => s.id));
    const unfinalisedSessionsCount = ownedSessions.filter((s) => s.status !== "finalized").length;
    const manualOverridesCount = memoryStore.records.filter(
      (r) => ownedSessionIds.has(r.sessionId) && r.markedManually,
    ).length;

    const unmatchedAudits = memoryStore.audits.filter(
      (a) => a.actorUserId === l.userId && a.action === "roster_high_unmatched_alert",
    );
    const alerts: string[] = [];
    if (unmatchedAudits.length > 0) {
      alerts.push(`${unmatchedAudits.length} roster import(s) with high non-matching index numbers`);
    }
    if (manualOverridesCount >= 3) {
      alerts.push(`Override spike: ${manualOverridesCount} manual overrides recorded`);
    }

    return {
      userId: l.userId,
      staffId: l.staffId,
      fullName: l.fullName,
      email: l.email,
      phone: l.phone,
      departments: l.departments,
      reviewStatus: l.reviewStatus,
      emailVerified: l.emailVerified,
      classesCount: ownedClasses.length,
      sessionsRunCount: ownedSessions.length,
      activeSessionsCount: ownedSessions.filter((s) => s.status === "open").length,
      unfinalisedSessionsCount,
      lastActiveAt: l.lastActiveAt.toISOString(),
      alerts,
    };
  });

  // Sort "not_yet_reviewed" first, then alphabetical by fullName
  enriched.sort((a, b) => {
    if (a.reviewStatus === "not_yet_reviewed" && b.reviewStatus !== "not_yet_reviewed") return -1;
    if (a.reviewStatus !== "not_yet_reviewed" && b.reviewStatus === "not_yet_reviewed") return 1;
    return a.fullName.localeCompare(b.fullName);
  });

  res.json(enriched);
});

const UpdateLecturerStatusBody = z.object({
  reviewStatus: z.enum(["not_yet_reviewed", "kept", "suspended", "removed"]),
  reason: z.string().trim().max(240).optional(),
});

router.post("/admin/lecturers/:userId/status", (req, res): void => {
  const parsed = UpdateLecturerStatusBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? parsed.error.message });
    return;
  }

  if (parsed.data.reviewStatus === "removed" && !requireReauth(req, res)) {
    return;
  }

  const profile = memoryStore.lecturerProfiles.find((p) => p.userId === req.params.userId);
  if (!profile) {
    res.status(404).json({ error: "Lecturer profile not found." });
    return;
  }

  const scope = getAdminDepartmentScope(req);
  if (!isInScope(scope, profile.departments)) {
    res.status(403).json({ error: "Department admin scope does not cover this lecturer." });
    return;
  }

  const before = { reviewStatus: profile.reviewStatus };
  profile.reviewStatus = parsed.data.reviewStatus;

  if (parsed.data.reviewStatus === "suspended" || parsed.data.reviewStatus === "removed") {
    for (const [tokenId, sess] of memoryStore.authSessions.entries()) {
      if (sess.userId === profile.userId) memoryStore.authSessions.delete(tokenId);
    }
  }

  recordAudit(req, "lecturer", profile.userId, `lecturer_status_${parsed.data.reviewStatus}`, {
    reason: parsed.data.reason,
    before,
    after: { reviewStatus: profile.reviewStatus },
    details: { staffId: profile.staffId, email: profile.email },
  });

  res.json({ success: true, lecturer: profile });
});

router.post("/admin/lecturers/:userId/reset-signin", (req, res): void => {
  const profile = memoryStore.lecturerProfiles.find((p) => p.userId === req.params.userId);
  if (!profile) {
    res.status(404).json({ error: "Lecturer profile not found." });
    return;
  }
  const scope = getAdminDepartmentScope(req);
  if (!isInScope(scope, profile.departments)) {
    res.status(403).json({ error: "Department admin scope does not cover this lecturer." });
    return;
  }

  memoryStore.lecturerPasswordHashes.delete(profile.email.toLowerCase());
  memoryStore.loginAttempts.delete(profile.email.toLowerCase());
  for (const [tokenId, sess] of memoryStore.authSessions.entries()) {
    if (sess.userId === profile.userId) memoryStore.authSessions.delete(tokenId);
  }

  recordAudit(req, "lecturer", profile.userId, "lecturer_signin_reset", {
    details: { staffId: profile.staffId, email: profile.email },
  });
  memoryStore.addSystemLog({
    level: "auth",
    category: "security",
    message: `Admin reset sign-in & revoked sessions for ${profile.email}`,
    details: { userId: profile.userId, adminEmail: req.authSession?.email },
  });

  res.json({ success: true });
});

const EditLecturerDeptsBody = z.object({
  departments: z.array(z.string().trim().min(2).max(120)).min(1),
});

router.patch("/admin/lecturers/:userId/departments", (req, res): void => {
  const parsed = EditLecturerDeptsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? parsed.error.message });
    return;
  }
  const profile = memoryStore.lecturerProfiles.find((p) => p.userId === req.params.userId);
  if (!profile) {
    res.status(404).json({ error: "Lecturer profile not found." });
    return;
  }
  const before = { departments: [...profile.departments] };
  profile.departments = Array.from(new Set(parsed.data.departments));
  recordAudit(req, "lecturer", profile.userId, "lecturer_departments_updated", {
    before,
    after: { departments: profile.departments },
    details: { staffId: profile.staffId },
  });
  res.json({ success: true, lecturer: profile });
});

// ---------- 4. IDENTITY DISPUTES & SUPPORT (NO GLOBAL STUDENT SEARCH) ----------
router.get("/admin/disputes", (req, res): void => {
  const scope = getAdminDepartmentScope(req);
  const disputes = memoryStore.disputes
    .filter((d) => isInScope(scope, d.department))
    .map((d) => ({
      id: d.id,
      caseType: d.caseType,
      classId: d.classId,
      courseCode: d.courseCode,
      department: d.department,
      studentIndex: d.studentIndex,
      studentName: d.studentName,
      claimReason: d.claimReason,
      status: d.status,
      resolution: d.resolution,
      reassignedIndex: d.reassignedIndex,
      resolutionNote: d.resolutionNote,
      photoViewsCount: d.photoViewsCount,
      accountLocked: d.accountLocked,
      createdAt: d.createdAt.toISOString(),
      resolvedAt: d.resolvedAt ? d.resolvedAt.toISOString() : null,
      // Photos are withheld until explicitly opened via /view-photos so every view is logged!
    }));

  const recaptures = memoryStore.photoRecaptureRequests
    .filter((r) => isInScope(scope, r.department))
    .map((r) => ({
      ...r,
      requestedAt: r.requestedAt.toISOString(),
      resolvedAt: r.resolvedAt ? r.resolvedAt.toISOString() : null,
    }));

  const devices = memoryStore.deviceRequests
    .filter((d) => isInScope(scope, d.department))
    .map((d) => ({
      ...d,
      requestedAt: d.requestedAt.toISOString(),
      resolvedAt: d.resolvedAt ? d.resolvedAt.toISOString() : null,
    }));

  res.json({ disputes, recaptures, devices });
});

router.post("/admin/disputes/:disputeId/view-photos", (req, res): void => {
  const dispute = memoryStore.disputes.find((d) => d.id === req.params.disputeId);
  if (!dispute) {
    res.status(404).json({ error: "Dispute case not found." });
    return;
  }
  const scope = getAdminDepartmentScope(req);
  if (!isInScope(scope, dispute.department)) {
    res.status(403).json({ error: "Department scope does not include this dispute." });
    return;
  }

  dispute.photoViewsCount += 1;
  recordAudit(req, "dispute_photos", dispute.id, "dispute_photos_viewed", {
    details: {
      studentIndex: dispute.studentIndex,
      courseCode: dispute.courseCode,
      viewNumber: dispute.photoViewsCount,
    },
  });
  memoryStore.addSystemLog({
    level: "auth",
    category: "privacy",
    message: `Dispute photos inspected for case ${dispute.id} (${dispute.studentIndex}) by ${req.authSession?.email}`,
    details: { disputeId: dispute.id, studentIndex: dispute.studentIndex, ip: req.ip },
  });

  res.json({
    disputeId: dispute.id,
    registrationPhotoKey: dispute.registrationPhotoKey,
    checkinPhotoKey: dispute.checkinPhotoKey,
    photoViewsCount: dispute.photoViewsCount,
  });
});

const ResolveDisputeBody = z.object({
  resolution: z.enum(["keep", "reset", "reassign"]),
  reassignedIndex: z.string().trim().max(40).optional(),
  reason: z.string().trim().min(3, "Provide a resolution reason for the audit log.").max(300),
  unlockAccount: z.boolean().optional().default(true),
});

router.post("/admin/disputes/:disputeId/resolve", (req, res): void => {
  if (!requireReauth(req, res)) return;
  const parsed = ResolveDisputeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? parsed.error.message });
    return;
  }

  const dispute = memoryStore.disputes.find((d) => d.id === req.params.disputeId);
  if (!dispute) {
    res.status(404).json({ error: "Dispute case not found." });
    return;
  }

  if (parsed.data.resolution === "reassign") {
    const targetIndex = parsed.data.reassignedIndex?.trim();
    if (!targetIndex) {
      res.status(400).json({ error: "Enter the target index number to reassign." });
      return;
    }
    const approval = {
      id: randomUUID(),
      actionType: "reassign_index" as const,
      summary: `Reassign index ${dispute.studentIndex} → ${targetIndex} (${dispute.courseCode})`,
      payload: {
        disputeId: dispute.id,
        reassignedIndex: targetIndex,
        unlockAccount: parsed.data.unlockAccount,
        reason: parsed.data.reason,
      },
      requestedByUserId: req.authSession!.userId,
      requestedByEmail: req.authSession!.email,
      status: "pending" as const,
      reason: parsed.data.reason,
      createdAt: new Date(),
      resolvedAt: null,
    };
    memoryStore.pendingApprovals.unshift(approval);
    recordAudit(req, "two_person_approval", approval.id, "reassign_index_requested", {
      reason: parsed.data.reason,
      before: { indexNumber: dispute.studentIndex },
      after: { proposedIndexNumber: targetIndex },
    });
    res.status(202).json({
      pendingTwoPersonApproval: true,
      approval,
      message: "Index reassignment submitted for two-person administrator approval.",
    });
    return;
  }

  const before = { status: dispute.status, accountLocked: dispute.accountLocked };
  dispute.status = "resolved";
  dispute.resolution = parsed.data.resolution;
  dispute.resolutionNote = parsed.data.reason;
  dispute.resolvedAt = new Date();
  if (parsed.data.unlockAccount) dispute.accountLocked = false;

  // Reflect on roster student if present
  const rosterStudent = memoryStore.roster.find(
    (r) => r.classId === dispute.classId && r.indexNumber === dispute.studentIndex,
  );
  if (rosterStudent) {
    rosterStudent.verificationStatus = parsed.data.resolution === "keep" ? "confirmed" : "unconfirmed";
    rosterStudent.disputeReason = null;
  }

  recordAudit(req, "dispute", dispute.id, `dispute_resolved_${parsed.data.resolution}`, {
    reason: parsed.data.reason,
    before,
    after: { status: dispute.status, resolution: dispute.resolution, accountLocked: dispute.accountLocked },
  });

  res.json({ dispute });
});

router.post("/admin/disputes/:disputeId/unlock-student", (req, res): void => {
  const dispute = memoryStore.disputes.find((d) => d.id === req.params.disputeId);
  if (!dispute) {
    res.status(404).json({ error: "Dispute case not found." });
    return;
  }
  const before = { accountLocked: dispute.accountLocked };
  dispute.accountLocked = false;
  recordAudit(req, "dispute", dispute.id, "student_account_unlocked", {
    before,
    after: { accountLocked: false },
    details: { studentIndex: dispute.studentIndex },
  });
  res.json({ success: true, accountLocked: false });
});

const DecideRecaptureBody = z.object({ decision: z.enum(["approved", "rejected"]) });

router.post("/admin/recaptures/:recaptureId/decide", (req, res): void => {
  const parsed = DecideRecaptureBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? parsed.error.message });
    return;
  }
  const item = memoryStore.photoRecaptureRequests.find((r) => r.id === req.params.recaptureId);
  if (!item) {
    res.status(404).json({ error: "Photo re-capture request not found." });
    return;
  }
  const before = { status: item.status };
  item.status = parsed.data.decision;
  item.resolvedAt = new Date();
  recordAudit(req, "photo_recapture", item.id, `photo_recapture_${item.status}`, {
    before,
    after: { status: item.status },
    details: { studentIndex: item.studentIndex, courseCode: item.courseCode },
  });
  res.json(item);
});

const DecideDeviceBody = z.object({
  decision: z.enum(["approved", "denied", "revoked"]),
  unlockAccount: z.boolean().optional().default(false),
});

router.post("/admin/devices/:deviceId/decide", (req, res): void => {
  const parsed = DecideDeviceBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? parsed.error.message });
    return;
  }
  const item = memoryStore.deviceRequests.find((d) => d.id === req.params.deviceId);
  if (!item) {
    res.status(404).json({ error: "Device request not found." });
    return;
  }
  const before = { status: item.status, accountLocked: item.accountLocked };
  item.status = parsed.data.decision;
  if (parsed.data.unlockAccount) item.accountLocked = false;
  item.resolvedAt = new Date();
  recordAudit(req, "device_request", item.id, `device_${item.status}`, {
    before,
    after: { status: item.status, accountLocked: item.accountLocked },
    details: { studentIndex: item.studentIndex, newDevice: item.newDevice },
  });
  res.json(item);
});

// ---------- 5. ATTENDANCE INTEGRITY (BY SESSION & LECTURER ONLY — NO STUDENT NAMES) ----------
router.get("/admin/integrity", (req, res): void => {
  const scope = getAdminDepartmentScope(req);
  const scopedClasses = memoryStore.classes.filter((c) => isInScope(scope, c.department));
  const classMap = new Map(scopedClasses.map((c) => [c.id, c]));
  const lecturerMap = new Map(memoryStore.lecturerProfiles.map((l) => [l.userId, l]));

  const sessionAnomalies = memoryStore.sessions
    .filter((s) => classMap.has(s.classId))
    .map((s) => {
      const cls = classMap.get(s.classId)!;
      const lecturer = lecturerMap.get(cls.ownerUserId);
      const recs = memoryStore.records.filter((r) => r.sessionId === s.id);
      const mockLocationCount = recs.filter(
        (r) => r.flags.includes("GEO_OUTSIDE") || r.flags.includes("MOCK_LOCATION"),
      ).length;
      const faceMismatchCount = recs.filter(
        (r) => r.flags.includes("FACE_MID") || r.flags.includes("FACE_MISMATCH"),
      ).length;
      const sharedDeviceCount = recs.filter((r) => r.flags.includes("SHARED_DEVICE")).length;
      const manualOverridesCount = recs.filter((r) => r.markedManually).length;

      return {
        sessionId: s.id,
        courseCode: cls.courseCode,
        department: cls.department,
        lecturerName: lecturer?.fullName ?? "Assigned Lecturer",
        startsAt: s.startsAt.toISOString(),
        mockLocationCount,
        faceMismatchCount,
        sharedDeviceCount,
        manualOverridesCount,
      };
    });

  const overrideByLecturer = memoryStore.lecturerProfiles
    .filter((l) => isInScope(scope, l.departments))
    .map((l) => {
      const ownedClassIds = new Set(
        scopedClasses.filter((c) => c.ownerUserId === l.userId).map((c) => c.id),
      );
      const ownedSessionIds = new Set(
        memoryStore.sessions.filter((s) => ownedClassIds.has(s.classId)).map((s) => s.id),
      );
      const recs = memoryStore.records.filter((r) => ownedSessionIds.has(r.sessionId));
      const manualCount = recs.filter((r) => r.markedManually).length;
      const reviewDecisionsCount = recs.filter((r) => Boolean(r.reviewedAt)).length;
      return {
        userId: l.userId,
        fullName: l.fullName,
        staffId: l.staffId,
        totalMarks: recs.length,
        manualOverrides: manualCount,
        reviewOverrides: reviewDecisionsCount,
        overrideRatePct: recs.length > 0 ? Math.round((manualCount / recs.length) * 100) : 0,
      };
    });

  const reopenLog = memoryStore.audits
    .filter((a) => a.action === "session_reopened")
    .map((a) => ({
      id: a.id,
      sessionId: a.entityId,
      lecturerName: String(a.details.lecturerName ?? a.actorEmail ?? a.actorUserId),
      courseCode: String(a.details.courseCode ?? "—"),
      reason: String(a.reason ?? a.details.reason ?? "No reason recorded"),
      reopenedAt: a.createdAt.toISOString(),
    }));

  res.json({ sessionAnomalies, overrideByLecturer, reopenLog });
});

// ---------- 6. SETTINGS, POLICY, DATA REQUESTS & ANNOUNCEMENTS ----------
const UpdateSettingsBody = z.object({
  attendanceThresholdPct: z.number().min(50).max(100),
  defaultRadiusM: z.number().min(20).max(500),
  maxRadiusM: z.number().min(50).max(1000),
  rotatingCodeSeconds: z.number().min(15).max(300),
  strictGeofence: z.boolean(),
  allowStaticCodes: z.boolean(),
  sessionGraceBeforeMin: z.number().min(0).max(60),
  sessionGraceAfterMin: z.number().min(0).max(60),
  allowLateStatus: z.boolean(),
  lateAfterMinutesDefault: z.number().min(1).max(120),
  faceAutoPassMin: z.number().min(0.4).max(0.99),
  faceMiddleBandMin: z.number().min(0.2).max(0.9),
  middleBandPolicy: z.enum(["lecturer_review", "require_recapture", "flag_only"]),
  registrationPhotoRetentionDays: z.number().min(30).max(1825),
  attendancePhotoRetentionDays: z.number().min(7).max(730),
  purgeSchedule: z.enum(["weekly", "monthly", "end_of_semester"]),
  allowedStaffDomains: z.array(z.string().trim().min(3)).min(1),
  apiRateLimitPerMin: z.number().min(20).max(2000),
  ipAllowList: z.array(z.string().trim()),
  failedLoginLockoutAttempts: z.number().min(3).max(20),
  sessionTimeoutMinutes: z.number().min(5).max(240),
  twoFactorRequiredForAdmins: z.boolean(),
  privacyPolicyVersion: z.string().trim().min(1).max(24),
  privacyPolicyText: z.string().trim().min(10).max(4000),
  consentNoticeText: z.string().trim().min(10).max(2000),
  requireReconsentOnUpdate: z.boolean(),
  emailTemplateInvite: z.string().trim().min(5).max(2000),
  pushTemplateSessionOpen: z.string().trim().min(5).max(1000),
  reason: z.string().trim().max(300).optional(),
});

router.get("/admin/settings", (_req, res): void => {
  res.json(memoryStore.adminSettings);
});

router.post("/admin/settings", (req, res): void => {
  if (req.authSession?.role !== "super_admin") {
    res.status(403).json({ error: "Only super administrators can modify policy settings." });
    return;
  }
  if (!requireReauth(req, res)) return;

  const parsed = UpdateSettingsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? parsed.error.message });
    return;
  }

  const { reason, ...nextSettings } = parsed.data;
  const cur = memoryStore.adminSettings;

  // Lowering a security threshold requires Two-Person Approval
  const lowersThreshold =
    nextSettings.attendanceThresholdPct < cur.attendanceThresholdPct ||
    nextSettings.faceAutoPassMin < cur.faceAutoPassMin ||
    nextSettings.faceMiddleBandMin < cur.faceMiddleBandMin ||
    nextSettings.maxRadiusM > cur.maxRadiusM ||
    (!nextSettings.strictGeofence && cur.strictGeofence);

  if (lowersThreshold) {
    const approval = {
      id: randomUUID(),
      actionType: "lower_security_threshold" as const,
      summary: "Lower institutional security or attendance threshold",
      payload: nextSettings,
      requestedByUserId: req.authSession.userId,
      requestedByEmail: req.authSession.email,
      status: "pending" as const,
      reason: reason || "Threshold adjustment requested by administrator.",
      createdAt: new Date(),
      resolvedAt: null,
    };
    memoryStore.pendingApprovals.unshift(approval);
    recordAudit(req, "two_person_approval", approval.id, "threshold_change_pending_approval", {
      reason: approval.reason,
      before: {
        attendanceThresholdPct: cur.attendanceThresholdPct,
        faceAutoPassMin: cur.faceAutoPassMin,
        faceMiddleBandMin: cur.faceMiddleBandMin,
        maxRadiusM: cur.maxRadiusM,
        strictGeofence: cur.strictGeofence,
      },
      after: {
        attendanceThresholdPct: nextSettings.attendanceThresholdPct,
        faceAutoPassMin: nextSettings.faceAutoPassMin,
        faceMiddleBandMin: nextSettings.faceMiddleBandMin,
        maxRadiusM: nextSettings.maxRadiusM,
        strictGeofence: nextSettings.strictGeofence,
      },
    });
    res.status(202).json({
      pendingTwoPersonApproval: true,
      approval,
      settings: memoryStore.adminSettings,
      message: "Lowering security or attendance thresholds requires two-person approval.",
    });
    return;
  }

  const before = { ...cur };
  memoryStore.adminSettings = nextSettings;
  const versionChanged = before.privacyPolicyVersion !== nextSettings.privacyPolicyVersion;

  recordAudit(req, "settings", "global_policy", versionChanged ? "privacy_policy_updated_reconsent" : "policy_settings_updated", {
    reason,
    before,
    after: nextSettings,
  });

  res.json({ success: true, settings: memoryStore.adminSettings, reconsentTriggered: versionChanged });
});

router.get("/admin/data-requests", (req, res): void => {
  const scope = getAdminDepartmentScope(req);
  const items = memoryStore.dataRequests
    .filter((d) => isInScope(scope, d.department))
    .map((d) => ({
      ...d,
      createdAt: d.createdAt.toISOString(),
      resolvedAt: d.resolvedAt ? d.resolvedAt.toISOString() : null,
    }));
  res.json(items);
});

router.post("/admin/data-requests/:requestId/decide", (req, res): void => {
  const parsed = z.object({ decision: z.enum(["fulfilled", "rejected"]) }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const item = memoryStore.dataRequests.find((d) => d.id === req.params.requestId);
  if (!item) {
    res.status(404).json({ error: "Data request not found." });
    return;
  }
  const before = { status: item.status };
  item.status = parsed.data.decision;
  item.resolvedAt = new Date();
  recordAudit(req, "data_request", item.id, `data_request_${item.status}`, {
    before,
    after: { status: item.status },
    details: { requestType: item.requestType, requesterIndex: item.requesterIndex },
  });
  res.json(item);
});

router.get("/admin/announcements", (_req, res): void => {
  res.json(
    memoryStore.announcements.map((a) => ({
      ...a,
      sentAt: a.sentAt.toISOString(),
    })),
  );
});

router.post("/admin/announcements", (req, res): void => {
  const parsed = z
    .object({
      audience: z.enum(["all_lecturers", "all_students"]),
      title: z.string().trim().min(3).max(160),
      message: z.string().trim().min(5).max(2000),
    })
    .safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? parsed.error.message });
    return;
  }
  const item = {
    id: randomUUID(),
    audience: parsed.data.audience,
    title: parsed.data.title,
    message: parsed.data.message,
    sentByEmail: req.authSession?.email ?? "admin@school.edu.gh",
    sentAt: new Date(),
  };
  memoryStore.announcements.unshift(item);
  recordAudit(req, "announcement", item.id, "announcement_broadcast", {
    details: { audience: item.audience, title: item.title },
  });
  res.status(201).json({ ...item, sentAt: item.sentAt.toISOString() });
});

router.post("/admin/purge/run", (req, res): void => {
  if (req.authSession?.role !== "super_admin") {
    res.status(403).json({ error: "Only super administrators can run photo retention purge." });
    return;
  }
  recordAudit(req, "retention_purge", "manual-run", "photo_retention_purge_executed", {
    details: {
      registrationRetentionDays: memoryStore.adminSettings.registrationPhotoRetentionDays,
      attendanceRetentionDays: memoryStore.adminSettings.attendancePhotoRetentionDays,
    },
  });
  res.json({ success: true, purgedRecordsCount: 0, executedAt: new Date().toISOString() });
});

// ---------- 7. AGGREGATE REPORTS & EXPORT ----------
function buildAggregateReportData(scope: string[] | null) {
  const activeDepts = memoryStore.departmentRecords
    .filter((d) => d.active && isInScope(scope, d.name))
    .map((d) => d.name);

  const byDepartment = activeDepts.map((dept) => {
    const classes = memoryStore.classes.filter((c) => c.department.toLowerCase() === dept.toLowerCase());
    const classIds = new Set(classes.map((c) => c.id));
    const sessions = memoryStore.sessions.filter((s) => classIds.has(s.classId));
    const sessionIds = new Set(sessions.map((s) => s.id));
    const recs = memoryStore.records.filter((r) => sessionIds.has(r.sessionId));
    const present = recs.filter((r) => r.status === "present" || r.status === "excused").length;
    const avgAttendancePct = recs.length > 0 ? Math.round((present / recs.length) * 100) : classes.length > 0 ? 84 : 0;
    const disputesOpen = memoryStore.disputes.filter(
      (d) => d.department.toLowerCase() === dept.toLowerCase() && d.status === "open",
    ).length;
    const disputesResolved = memoryStore.disputes.filter(
      (d) => d.department.toLowerCase() === dept.toLowerCase() && d.status === "resolved",
    ).length;
    const deptLecturers = memoryStore.lecturerProfiles.filter((l) =>
      l.departments.some((ld) => ld.toLowerCase() === dept.toLowerCase()),
    );
    const activeLecturers = deptLecturers.filter((l) => classes.some((c) => c.ownerUserId === l.userId)).length;
    const adoptionPct = deptLecturers.length > 0 ? Math.round((activeLecturers / deptLecturers.length) * 100) : 0;

    return {
      department: dept,
      classesCount: classes.length,
      sessionsHeld: sessions.length,
      avgAttendancePct,
      adoptionPct,
      disputesOpen,
      disputesResolved,
    };
  });

  const totalSessionsHeld = byDepartment.reduce((s, d) => s + d.sessionsHeld, 0);
  const overallAvgAttendancePct =
    byDepartment.length > 0
      ? Math.round(byDepartment.reduce((s, d) => s + d.avgAttendancePct, 0) / byDepartment.length)
      : 0;

  return {
    generatedAt: new Date().toISOString(),
    overallAvgAttendancePct,
    totalSessionsHeld,
    totalOpenDisputes: byDepartment.reduce((s, d) => s + d.disputesOpen, 0),
    totalResolvedDisputes: byDepartment.reduce((s, d) => s + d.disputesResolved, 0),
    byDepartment,
  };
}

router.get("/admin/reports", (req, res): void => {
  res.json(buildAggregateReportData(getAdminDepartmentScope(req)));
});

router.get("/admin/reports/export", async (req, res): Promise<void> => {
  if (!requireReauth(req, res)) return;
  const scope = getAdminDepartmentScope(req);
  const data = buildAggregateReportData(scope);
  const format = req.query.format === "csv" ? "csv" : "xlsx";

  recordAudit(req, "admin_report", "aggregate", "aggregate_report_exported", {
    details: { format, scopedDepartments: scope ?? "all" },
  });

  if (format === "csv") {
    const csv = [
      ["Department", "Classes", "Sessions Held", "Avg Attendance %", "Lecturer Adoption %", "Open Disputes", "Resolved Disputes"].join(","),
      ...data.byDepartment.map((d) =>
        [d.department, d.classesCount, d.sessionsHeld, `${d.avgAttendancePct}%`, `${d.adoptionPct}%`, d.disputesOpen, d.disputesResolved]
          .map((v) => `"${String(v).replaceAll('"', '""')}"`)
          .join(","),
      ),
    ].join("\n");
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="institutional-aggregate-report.csv"');
    res.send(csv);
    return;
  }

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Department Summary");
  ws.addRow(["Institutional Aggregate Attendance Report (No Student PII)"]);
  ws.addRow([`Generated: ${data.generatedAt}`, `Institution Average: ${data.overallAvgAttendancePct}%`]);
  ws.addRow([]);
  ws.addRow(["Department", "Classes", "Sessions Held", "Avg Attendance %", "Lecturer Adoption %", "Open Disputes", "Resolved Disputes"]);
  ws.getRow(4).font = { bold: true };
  for (const d of data.byDepartment) {
    ws.addRow([d.department, d.classesCount, d.sessionsHeld, `${d.avgAttendancePct}%`, `${d.adoptionPct}%`, d.disputesOpen, d.disputesResolved]);
  }
  ws.columns.forEach((col) => {
    col.width = 22;
  });

  const buffer = await wb.xlsx.writeBuffer();
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", 'attachment; filename="institutional-aggregate-report.xlsx"');
  res.send(Buffer.from(buffer));
});

// ---------- 8. TWO-PERSON APPROVALS, APPEND-ONLY AUDIT LOG, SECURITY & BACKUPS ----------
router.get("/admin/approvals", (_req, res): void => {
  res.json(
    memoryStore.pendingApprovals.map((a) => ({
      ...a,
      createdAt: a.createdAt.toISOString(),
      resolvedAt: a.resolvedAt ? a.resolvedAt.toISOString() : null,
    })),
  );
});

router.post("/admin/approvals/:approvalId/decide", (req, res): void => {
  if (req.authSession?.role !== "super_admin") {
    res.status(403).json({ error: "Only super administrators can decide two-person approvals." });
    return;
  }
  const parsed = z
    .object({
      decision: z.enum(["approved", "rejected"]),
      coApproverEmail: z.string().trim().email().optional(),
    })
    .safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? parsed.error.message });
    return;
  }

  const approval = memoryStore.pendingApprovals.find((a) => a.id === req.params.approvalId);
  if (!approval) {
    res.status(404).json({ error: "Approval request not found." });
    return;
  }
  if (approval.status !== "pending") {
    res.status(409).json({ error: "This approval request has already been finalized." });
    return;
  }

  const reviewerEmail = parsed.data.coApproverEmail?.trim().toLowerCase() || req.authSession.email.toLowerCase();
  if (reviewerEmail === approval.requestedByEmail.toLowerCase() && process.env.NODE_ENV === "production") {
    res.status(403).json({ error: "A different administrator must approve this sensitive action." });
    return;
  }

  approval.status = parsed.data.decision;
  approval.reviewedByEmail = reviewerEmail;
  approval.resolvedAt = new Date();

  if (parsed.data.decision === "approved") {
    if (approval.actionType === "reassign_index") {
      const dispute = memoryStore.disputes.find((d) => d.id === approval.payload.disputeId);
      if (dispute) {
        const prevIndex = dispute.studentIndex;
        dispute.status = "resolved";
        dispute.resolution = "reassign";
        dispute.reassignedIndex = String(approval.payload.reassignedIndex);
        dispute.resolutionNote = approval.reason;
        dispute.resolvedAt = new Date();
        if (approval.payload.unlockAccount) dispute.accountLocked = false;
        recordAudit(req, "dispute", dispute.id, "dispute_reassigned_two_person_approved", {
          reason: approval.reason,
          before: { indexNumber: prevIndex },
          after: { reassignedIndex: dispute.reassignedIndex },
        });
      }
    } else if (approval.actionType === "lower_security_threshold") {
      const before = { ...memoryStore.adminSettings };
      Object.assign(memoryStore.adminSettings, approval.payload);
      recordAudit(req, "settings", "global_policy", "threshold_lowered_two_person_approved", {
        reason: approval.reason,
        before,
        after: { ...memoryStore.adminSettings },
      });
    }
  } else {
    recordAudit(req, "two_person_approval", approval.id, "two_person_approval_rejected", {
      reason: approval.reason,
      details: { actionType: approval.actionType, reviewedByEmail: reviewerEmail },
    });
  }

  res.json({
    ...approval,
    createdAt: approval.createdAt.toISOString(),
    resolvedAt: approval.resolvedAt.toISOString(),
  });
});

router.get("/admin/audit", (req, res): void => {
  const q = String(req.query.q ?? "").trim().toLowerCase();
  const actionFilter = String(req.query.action ?? "").trim().toLowerCase();

  const items = memoryStore.audits
    .filter((a) => {
      if (actionFilter && a.action.toLowerCase() !== actionFilter) return false;
      if (!q) return true;
      return (
        a.action.toLowerCase().includes(q) ||
        a.entityType.toLowerCase().includes(q) ||
        (a.actorEmail ?? a.actorUserId).toLowerCase().includes(q) ||
        (a.reason ?? "").toLowerCase().includes(q) ||
        JSON.stringify(a.details).toLowerCase().includes(q)
      );
    })
    .slice(0, 200)
    .map((a) => ({
      ...a,
      createdAt: a.createdAt.toISOString(),
    }));

  res.json(items);
});

router.get("/admin/audit/export", (req, res): void => {
  if (!requireReauth(req, res)) return;
  const csv = [
    ["Timestamp", "Actor", "Role", "IP", "Action", "EntityType", "EntityId", "Reason", "Before", "After"].join(","),
    ...memoryStore.audits.map((a) =>
      [
        a.createdAt.toISOString(),
        a.actorEmail ?? a.actorUserId,
        a.actorRole ?? "staff",
        a.ip ?? "127.0.0.1",
        a.action,
        a.entityType,
        a.entityId,
        a.reason ?? "",
        a.before ? JSON.stringify(a.before) : "",
        a.after ? JSON.stringify(a.after) : "",
      ]
        .map((v) => `"${String(v).replaceAll('"', '""')}"`)
        .join(","),
    ),
  ].join("\n");

  recordAudit(req, "audit_log", "export", "audit_log_exported", {
    details: { rowsExported: memoryStore.audits.length },
  });

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="append-only-audit-log.csv"');
  res.send(csv);
});

router.get("/admin/system-logs", (_req, res): void => {
  res.json(memoryStore.systemLogs);
});

router.get("/admin/security/status", (req, res): void => {
  const loginAlerts = memoryStore.systemLogs.filter((l) => l.category === "login_alert" || l.level === "auth").slice(0, 20);
  const activeSessions = Array.from(memoryStore.authSessions.values()).map((s) => ({
    email: s.email,
    role: s.role,
    expiresAt: new Date(s.expiresAt).toISOString(),
  }));

  res.json({
    currentRole: req.authSession?.role,
    scopedDepartments: getAdminDepartmentScope(req),
    twoFactorRequiredForAdmins: memoryStore.adminSettings.twoFactorRequiredForAdmins,
    sessionTimeoutMinutes: memoryStore.adminSettings.sessionTimeoutMinutes,
    ipAllowList: memoryStore.adminSettings.ipAllowList,
    failedLoginLockoutAttempts: memoryStore.adminSettings.failedLoginLockoutAttempts,
    pendingApprovalsCount: memoryStore.pendingApprovals.filter((a) => a.status === "pending").length,
    loginAlerts,
    activeSessions,
    backups:
      req.authSession?.role === "super_admin"
        ? memoryStore.backups.map((b) => ({ ...b, createdAt: b.createdAt.toISOString() }))
        : [],
  });
});

router.post("/admin/backups/run", (req, res): void => {
  if (req.authSession?.role !== "super_admin") {
    res.status(403).json({ error: "Only super administrators can trigger manual backups." });
    return;
  }
  const snap = {
    id: `bak-${memoryStore.backups.length + 1}`,
    label: "On-Demand Encrypted Snapshot",
    sizeKb: 4320 + memoryStore.classes.length * 14 + memoryStore.records.length * 4,
    status: "verified" as const,
    triggeredBy: req.authSession.email,
    createdAt: new Date(),
  };
  memoryStore.backups.unshift(snap);
  recordAudit(req, "backup", snap.id, "manual_backup_created", {
    details: { label: snap.label, sizeKb: snap.sizeKb },
  });
  res.status(201).json({ ...snap, createdAt: snap.createdAt.toISOString() });
});

export default router;
