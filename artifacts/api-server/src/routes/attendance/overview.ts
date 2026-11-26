import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray } from "drizzle-orm";
import ExcelJS from "exceljs";
import { Router, type IRouter } from "express";
import { z } from "zod";
import {
  GetAttendanceActivityResponse,
  GetAttendanceOverviewResponse,
  GetClassReportParams,
  GetClassReportResponse,
} from "@workspace/api-zod";
import {
  attendanceAuditTable,
  attendanceClassesTable,
  attendanceRecordsTable,
  attendanceRosterTable,
  attendanceSessionsTable,
  db,
} from "@workspace/db";
import requireLecturer from "../../middlewares/requireLecturer";
import { findOwnedClass, getClassItem, getSessionItem, writeAttendanceAudit } from "../../lib/attendance";
import { hasDatabaseConnection, memoryStore } from "../../lib/attendanceStore";
import { hashPassword } from "../../lib/authUtils";

const router: IRouter = Router();

router.use(requireLecturer);

const UpdateProfileBody = z.object({
  staffId: z.string().trim().min(2).max(40).optional(),
  fullName: z.string().trim().min(2).max(120).optional(),
  email: z.string().trim().email().max(254).optional(),
  phone: z.string().trim().min(4).max(32).optional(),
  departments: z.array(z.string().trim().min(2).max(120)).min(1).max(10).optional(),
});

const RegisterLecturerBody = z.object({
  staffId: z.string().trim().min(2).max(40),
  fullName: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(254),
  phone: z.string().trim().min(4).max(32),
  departments: z.array(z.string().trim().min(2).max(120)).min(1).max(10),
  password: z.string().min(6).max(128).optional(),
});

router.get("/lecturer/profile", async (req, res): Promise<void> => {
  const profile = memoryStore.getOrCreateProfile(req.userId!);
  res.json(profile);
});

router.post("/lecturer/register", async (req, res): Promise<void> => {
  const parsed = RegisterLecturerBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { password, ...profileFields } = parsed.data;
  const emailLower = profileFields.email.trim().toLowerCase();
  const domain = emailLower.split("@")[1] ?? "";
  const allowedDomains = memoryStore.adminSettings.allowedStaffDomains;
  if (
    allowedDomains.length > 0 &&
    !allowedDomains.some((d) => domain === d.trim().toLowerCase())
  ) {
    res.status(400).json({
      error: `Staff email must belong to an approved institutional domain (${allowedDomains.join(", ")}).`,
    });
    return;
  }

  const activeDepts = new Set(
    memoryStore.departmentRecords.filter((d) => d.active).map((d) => d.name.toLowerCase()),
  );
  const selectedDepts = parsed.data.departments.filter((d) =>
    activeDepts.has(d.trim().toLowerCase()),
  );
  if (selectedDepts.length === 0) {
    res.status(400).json({
      error: "Select at least one active institutional department.",
    });
    return;
  }

  const profile = memoryStore.getOrCreateProfile(req.userId!);
  Object.assign(profile, {
    ...profileFields,
    departments: selectedDepts,
    reviewStatus: "not_yet_reviewed" as const,
    emailVerified: true,
    lastActiveAt: new Date(),
  });
  if (password) {
    memoryStore.lecturerPasswordHashes.set(emailLower, hashPassword(password));
  }
  await writeAttendanceAudit(
    req.userId!,
    "lecturer",
    req.userId!,
    "lecturer_registered",
    {
      staffId: profile.staffId,
      email: profile.email,
      departments: profile.departments,
    },
  );
  res.status(201).json(profile);
});

router.patch("/lecturer/profile", async (req, res): Promise<void> => {
  const parsed = UpdateProfileBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const profile = memoryStore.getOrCreateProfile(req.userId!);
  if (parsed.data.departments) {
    const activeDepts = new Set(
      memoryStore.departmentRecords.filter((d) => d.active).map((d) => d.name.toLowerCase()),
    );
    const valid = parsed.data.departments.filter((d) =>
      activeDepts.has(d.trim().toLowerCase()),
    );
    if (valid.length === 0) {
      res.status(400).json({ error: "Select at least one active institutional department." });
      return;
    }
    parsed.data.departments = valid;
  }
  Object.assign(profile, parsed.data);
  profile.lastActiveAt = new Date();
  await writeAttendanceAudit(
    req.userId!,
    "lecturer",
    req.userId!,
    "profile_updated",
    { fields: Object.keys(parsed.data) },
  );
  res.json(profile);
});

const ReferenceRequestBody = z.object({
  type: z.enum(["course", "location"]),
  departmentName: z.string().trim().max(120).optional(),
  programmeName: z.string().trim().max(140).optional(),
  level: z.number().int().min(100).max(900).optional(),
  courseCode: z.string().trim().max(24).optional(),
  courseTitle: z.string().trim().max(160).optional(),
  locationName: z.string().trim().max(120).optional(),
  building: z.string().trim().max(120).optional(),
  note: z.string().trim().max(300).optional(),
});

router.get("/lists/requests", async (req, res): Promise<void> => {
  const items = memoryStore.referenceRequests
    .filter((r) => r.lecturerUserId === req.userId!)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .map((r) => ({
      ...r,
      createdAt: r.createdAt.toISOString(),
      resolvedAt: r.resolvedAt ? r.resolvedAt.toISOString() : null,
    }));
  res.json(items);
});

router.post("/lists/requests", async (req, res): Promise<void> => {
  const parsed = ReferenceRequestBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? parsed.error.message });
    return;
  }
  if (parsed.data.type === "course" && (!parsed.data.courseCode || !parsed.data.courseTitle)) {
    res.status(400).json({ error: "Enter both the missing course code and course title." });
    return;
  }
  if (parsed.data.type === "location" && !parsed.data.locationName) {
    res.status(400).json({ error: "Enter the missing lecture hall or location name." });
    return;
  }

  const profile = memoryStore.getOrCreateProfile(req.userId!);
  const item = {
    id: randomUUID(),
    type: parsed.data.type,
    lecturerUserId: profile.userId,
    lecturerName: profile.fullName,
    lecturerEmail: profile.email,
    departmentName: parsed.data.departmentName,
    programmeName: parsed.data.programmeName,
    level: parsed.data.level,
    courseCode: parsed.data.courseCode?.toUpperCase(),
    courseTitle: parsed.data.courseTitle,
    locationName: parsed.data.locationName,
    building: parsed.data.building,
    note: parsed.data.note,
    status: "pending" as const,
    createdAt: new Date(),
  };
  memoryStore.referenceRequests.unshift(item);

  await writeAttendanceAudit(
    req.userId!,
    "reference_request",
    item.id,
    "reference_request_submitted",
    {
      type: item.type,
      courseCode: item.courseCode,
      locationName: item.locationName,
    },
  );

  res.status(201).json({
    ...item,
    createdAt: item.createdAt.toISOString(),
    resolvedAt: null,
  });
});

router.get("/lists/:type", async (req, res): Promise<void> => {
  const { type } = req.params;
  if (type === "departments") {
    const active = memoryStore.departmentRecords
      .filter((d) => d.active)
      .sort((a, b) => a.name.localeCompare(b.name));
    res.json({
      items: active.map((d) => d.name),
      records: active.map((d) => ({ id: d.id, name: d.name, code: d.code })),
    });
    return;
  }
  if (type === "programmes") {
    const activeDeptIds = new Set(
      memoryStore.departmentRecords.filter((d) => d.active).map((d) => d.id),
    );
    const active = memoryStore.programmeRecords
      .filter((p) => p.active && activeDeptIds.has(p.departmentId))
      .sort((a, b) => a.name.localeCompare(b.name));
    res.json({
      items: active.map((p) => p.name),
      records: active.map((p) => ({
        id: p.id,
        name: p.name,
        code: p.code,
        departmentId: p.departmentId,
        departmentName: p.departmentName,
      })),
    });
    return;
  }
  if (type === "courses") {
    const activeDeptIds = new Set(
      memoryStore.departmentRecords.filter((d) => d.active).map((d) => d.id),
    );
    const active = memoryStore.courseRecords
      .filter((c) => c.active && activeDeptIds.has(c.departmentId))
      .sort((a, b) => a.code.localeCompare(b.code));
    res.json({
      items: active.map((c) => ({
        id: c.id,
        courseCode: c.code,
        courseTitle: c.title,
        department: c.departmentName,
        programme: c.programmeNames[0] ?? "",
        programmeNames: c.programmeNames,
        level: c.level,
      })),
    });
    return;
  }
  if (type === "locations") {
    const active = memoryStore.locationRecords
      .filter((l) => l.active)
      .sort((a, b) => a.name.localeCompare(b.name));
    res.json({
      items: active.map((loc) => {
        const learned = memoryStore.learnedLocations.find(
          (ll) => ll.name.toLowerCase() === loc.name.toLowerCase(),
        );
        return {
          id: loc.id,
          name: loc.name,
          building: loc.building,
          lat: learned?.lat ?? null,
          lng: learned?.lng ?? null,
          radiusM: learned?.lastRadiusM ?? memoryStore.adminSettings.defaultRadiusM,
        };
      }),
    });
    return;
  }
  if (type === "academic") {
    res.json({
      ...memoryStore.academicConfig,
      defaults: {
        attendanceThresholdPct: memoryStore.adminSettings.attendanceThresholdPct,
        defaultRadiusM: memoryStore.adminSettings.defaultRadiusM,
        maxRadiusM: memoryStore.adminSettings.maxRadiusM,
        allowLateStatus: memoryStore.adminSettings.allowLateStatus,
        lateAfterMinutesDefault: memoryStore.adminSettings.lateAfterMinutesDefault,
        allowStaticCodes: memoryStore.adminSettings.allowStaticCodes,
        rotatingCodeSeconds: memoryStore.adminSettings.rotatingCodeSeconds,
        privacyPolicyVersion: memoryStore.adminSettings.privacyPolicyVersion,
        privacyPolicyText: memoryStore.adminSettings.privacyPolicyText,
        consentNoticeText: memoryStore.adminSettings.consentNoticeText,
      },
    });
    return;
  }
  res.status(404).json({ error: "Unknown reference list type." });
});

router.get("/overview", async (req, res): Promise<void> => {
  const classrooms = !hasDatabaseConnection()
    ? memoryStore.classes.filter(
        (c) => c.ownerUserId === req.userId! && !c.archived,
      )
    : await db
        .select()
        .from(attendanceClassesTable)
        .where(
          and(
            eq(attendanceClassesTable.ownerUserId, req.userId!),
            eq(attendanceClassesTable.archived, false),
          ),
        );

  const classIds = classrooms.map((classroom) => classroom.id);
  const classItems = await Promise.all(classrooms.map(getClassItem));
  const rosterCounts = new Map(
    classItems.map((classroom) => [classroom.id, classroom.rosterCount]),
  );
  const rosterCount = classItems.reduce(
    (total, classroom) => total + classroom.rosterCount,
    0,
  );
  const sessions =
    classIds.length > 0
      ? !hasDatabaseConnection()
        ? memoryStore.sessions
            .filter((s) => classIds.includes(s.classId))
            .sort((a, b) => b.startsAt.getTime() - a.startsAt.getTime())
        : await db
            .select()
            .from(attendanceSessionsTable)
            .where(inArray(attendanceSessionsTable.classId, classIds))
            .orderBy(desc(attendanceSessionsTable.startsAt))
      : [];

  const now = new Date();
  const thisWeekStart = startOfUtcWeek(now);
  const finalizedSessions = sessions.filter(
    (session) => session.status === "finalized",
  );
  const finalizedIds = finalizedSessions.map((session) => session.id);
  const finalRecords =
    finalizedIds.length > 0
      ? !hasDatabaseConnection()
        ? memoryStore.records
            .filter((r) => finalizedIds.includes(r.sessionId))
            .map((r) => ({ sessionId: r.sessionId, status: r.status }))
        : await db
            .select({
              sessionId: attendanceRecordsTable.sessionId,
              status: attendanceRecordsTable.status,
            })
            .from(attendanceRecordsTable)
            .where(inArray(attendanceRecordsTable.sessionId, finalizedIds))
      : [];
  const checkedInFinalRecords = finalRecords.filter(
    (record) => record.status === "present" || record.status === "excused",
  );
  const expectedFinal = finalizedSessions.reduce(
    (total, session) =>
      total + (rosterCounts.get(session.classId) ?? 0),
    0,
  );
  const activeSessions = sessions.filter((session) => session.status === "open");
  const reviewSessionIds = sessions.map((session) => session.id);
  const reviewRecords =
    reviewSessionIds.length > 0
      ? !hasDatabaseConnection()
        ? memoryStore.records
            .filter(
              (r) =>
                reviewSessionIds.includes(r.sessionId) &&
                r.status === "needs_review",
            )
            .map((r) => ({ id: r.id }))
        : await db
            .select({ id: attendanceRecordsTable.id })
            .from(attendanceRecordsTable)
            .where(
              and(
                inArray(attendanceRecordsTable.sessionId, reviewSessionIds),
                eq(attendanceRecordsTable.status, "needs_review"),
              ),
            )
      : [];

  const attendanceByWeek = buildWeekBuckets(
    now,
    finalizedSessions,
    checkedInFinalRecords,
    rosterCounts,
  );
  const overview = {
    classCount: classrooms.length,
    rosterCount,
    sessionsThisWeek: sessions.filter(
      (session) =>
        session.startsAt >= thisWeekStart &&
        session.startsAt <= endOfUtcWeek(now),
    ).length,
    reviewCount: reviewRecords.length,
    attendanceRate:
      expectedFinal > 0
        ? Math.round((checkedInFinalRecords.length / expectedFinal) * 100)
        : 0,
    attendanceByWeek,
    activeSessions: await Promise.all(
      activeSessions.map((session) => getSessionItem(session)),
    ),
  };

  res.json(GetAttendanceOverviewResponse.parse(overview));
});

router.get("/activity", async (req, res): Promise<void> => {
  const rawLimit = Number(req.query.limit ?? 12);
  const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(1, rawLimit), 50) : 12;

  const events = !hasDatabaseConnection()
    ? memoryStore.audits
        .filter((e) => e.actorUserId === req.userId!)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .slice(0, limit)
    : await db
        .select()
        .from(attendanceAuditTable)
        .where(eq(attendanceAuditTable.actorUserId, req.userId!))
        .orderBy(desc(attendanceAuditTable.createdAt))
        .limit(limit);

  res.json(
    GetAttendanceActivityResponse.parse(
      events.map((event) => {
        const details = event.details ?? {};
        const detail = describeActivity(event.action, details);
        return {
          id: event.id,
          action: labelActivity(event.action),
          detail,
          occurredAt: event.createdAt,
          tone:
            event.action.includes("dispute") ||
            event.action.includes("reopened") ||
            event.action.includes("removed")
              ? "warning"
              : event.action.includes("created") ||
                  event.action.includes("committed") ||
                  event.action.includes("finalized") ||
                  event.action.includes("confirmed")
                ? "success"
                : "neutral",
        };
      }),
    ),
  );
});

router.get("/lecturer/notifications", async (req, res): Promise<void> => {
  const now = new Date();
  const ownedClasses: Array<{ id: string; courseCode: string }> = !hasDatabaseConnection()
    ? memoryStore.classes.filter((c) => c.ownerUserId === req.userId!)
    : await db
        .select({
          id: attendanceClassesTable.id,
          courseCode: attendanceClassesTable.courseCode,
        })
        .from(attendanceClassesTable)
        .where(eq(attendanceClassesTable.ownerUserId, req.userId!));

  const ownedClassIds = new Set(ownedClasses.map((c) => c.id));
  const ownedClassById = new Map(ownedClasses.map((c) => [c.id, c]));
  const ownedCourseCodes = new Set(ownedClasses.map((c) => c.courseCode.toUpperCase()));

  const ownedSessions: Array<{
    id: string;
    classId: string;
    topic: string;
    status: string;
    endsAt: Date;
  }> = !hasDatabaseConnection()
    ? memoryStore.sessions.filter((s) => ownedClassIds.has(s.classId))
    : ownedClasses.length > 0
      ? await db
          .select({
            id: attendanceSessionsTable.id,
            classId: attendanceSessionsTable.classId,
            topic: attendanceSessionsTable.topic,
            status: attendanceSessionsTable.status,
            endsAt: attendanceSessionsTable.endsAt,
          })
          .from(attendanceSessionsTable)
          .where(inArray(attendanceSessionsTable.classId, ownedClasses.map((c) => c.id)))
      : [];

  type LecturerNotification = {
    id: string;
    type: "unfinalised_session" | "dispute" | "photo_request" | "reference_request";
    title: string;
    detail: string;
    tone: "warning" | "success" | "neutral";
    href: string;
    createdAt: string;
  };

  const notifications: LecturerNotification[] = [];

  for (const s of ownedSessions) {
    const isPastEnd = s.endsAt.getTime() < now.getTime();
    if (s.status === "closed" || (s.status === "open" && isPastEnd)) {
      const cls = ownedClassById.get(s.classId);
      notifications.push({
        id: `unfinalised-${s.id}`,
        type: "unfinalised_session",
        title: `Session left unfinalised · ${cls?.courseCode ?? "Class"}`,
        detail: `${s.topic} (${s.status === "closed" ? "Closed, awaiting finalization" : "Ended, still open"})`,
        tone: "warning",
        href: `/sessions/${s.id}`,
        createdAt: s.endsAt.toISOString(),
      });
    }
  }

  for (const d of memoryStore.disputes) {
    if (!ownedClassIds.has(d.classId) && !ownedCourseCodes.has(d.courseCode.toUpperCase())) {
      continue;
    }
    notifications.push({
      id: `dispute-${d.id}`,
      type: "dispute",
      title:
        d.status === "open"
          ? `Identity dispute open · ${d.courseCode}`
          : `Identity dispute resolved · ${d.courseCode}`,
      detail: `${d.studentName} (${d.studentIndex}) — ${
        d.status === "open"
          ? "Check-in locked pending admin resolution."
          : `Resolution: ${d.resolution ?? "resolved"}${d.resolutionNote ? ` · ${d.resolutionNote}` : ""}`
      }`,
      tone: d.status === "open" ? "warning" : "success",
      href: ownedClassIds.has(d.classId) ? `/classes/${d.classId}` : "/classes",
      createdAt: (d.resolvedAt ?? d.createdAt).toISOString(),
    });
  }

  for (const pr of memoryStore.photoRecaptureRequests) {
    if (!ownedCourseCodes.has(pr.courseCode.toUpperCase())) continue;
    notifications.push({
      id: `photo-recapture-${pr.id}`,
      type: "photo_request",
      title: `Photo recapture ${pr.status} · ${pr.courseCode}`,
      detail: `Student ${pr.studentIndex}: ${pr.reason}`,
      tone: pr.status === "rejected" ? "warning" : pr.status === "approved" ? "success" : "neutral",
      href: "/classes",
      createdAt: (pr.resolvedAt ?? pr.requestedAt).toISOString(),
    });
  }

  for (const rr of memoryStore.referenceRequests) {
    if (rr.lecturerUserId !== req.userId!) continue;
    if (rr.status === "pending") continue;
    const label = rr.type === "course" ? `${rr.courseCode ?? ""} ${rr.courseTitle ?? ""}`.trim() : rr.locationName ?? "Venue";
    notifications.push({
      id: `ref-req-${rr.id}`,
      type: "reference_request",
      title: `${rr.type === "course" ? "Course" : "Location"} request ${rr.status}`,
      detail: `${label}${rr.adminNote ? ` · ${rr.adminNote}` : ""}`,
      tone: rr.status === "approved" ? "success" : "warning",
      href: "/classes",
      createdAt: (rr.resolvedAt ?? rr.createdAt).toISOString(),
    });
  }

  notifications.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  res.json(notifications.slice(0, 20));
});

async function buildClassReportData(classId: string, threshold: number) {
  const [roster, sessions] = !hasDatabaseConnection()
    ? [
        memoryStore.roster
          .filter((r) => r.classId === classId)
          .sort((a, b) => a.fullName.localeCompare(b.fullName)),
        memoryStore.sessions
          .filter((s) => s.classId === classId && s.status === "finalized")
          .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime()),
      ]
    : await Promise.all([
        db
          .select()
          .from(attendanceRosterTable)
          .where(eq(attendanceRosterTable.classId, classId))
          .orderBy(attendanceRosterTable.fullName),
        db
          .select()
          .from(attendanceSessionsTable)
          .where(
            and(
              eq(attendanceSessionsTable.classId, classId),
              eq(attendanceSessionsTable.status, "finalized"),
            ),
          )
          .orderBy(attendanceSessionsTable.startsAt),
      ]);

  const sessionIds = sessions.map((session) => session.id);
  const records =
    sessionIds.length > 0
      ? !hasDatabaseConnection()
        ? memoryStore.records
            .filter((r) => sessionIds.includes(r.sessionId))
            .map((r) => ({
              sessionId: r.sessionId,
              rosterStudentId: r.rosterStudentId,
              status: r.status,
            }))
        : await db
            .select({
              sessionId: attendanceRecordsTable.sessionId,
              rosterStudentId: attendanceRecordsTable.rosterStudentId,
              status: attendanceRecordsTable.status,
            })
            .from(attendanceRecordsTable)
            .where(inArray(attendanceRecordsTable.sessionId, sessionIds))
      : [];

  const studentSummaries = roster.map((student) => {
    const attended = records.filter(
      (record) =>
        record.rosterStudentId === student.id &&
        (record.status === "present" || record.status === "excused"),
    ).length;
    const percentage =
      sessions.length > 0
        ? Math.round((attended / sessions.length) * 100)
        : 0;
    return {
      fullName: student.fullName,
      indexNumber: student.indexNumber,
      attended,
      total: sessions.length,
      percentage,
    };
  });

  const sessionTrend = sessions.map((s) => {
    const attended = records.filter(
      (r) =>
        r.sessionId === s.id &&
        (r.status === "present" || r.status === "excused"),
    ).length;
    const total = roster.length;
    const percentage = total > 0 ? Math.round((attended / total) * 100) : 0;
    return {
      sessionId: s.id,
      label: s.startsAt.toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        timeZone: "UTC",
      }),
      topic: s.topic,
      percentage,
      attended,
      total,
    };
  });

  return {
    classId,
    attendanceThreshold: threshold,
    totalSessions: sessions.length,
    sessionTrend,
    students: studentSummaries,
    belowThreshold:
      sessions.length > 0
        ? studentSummaries.filter(
            (student) => student.percentage < threshold,
          )
        : [],
  };
}

router.get(
  "/classes/:classId/reports/summary",
  async (req, res): Promise<void> => {
    const params = GetClassReportParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const classroom = await findOwnedClass(params.data.classId, req.userId!, true);
    if (!classroom) {
      res.status(404).json({ error: "Class not found." });
      return;
    }
    const rawThreshold = Number(req.query.threshold ?? 75);
    const threshold = Number.isFinite(rawThreshold)
      ? Math.min(Math.max(50, Math.round(rawThreshold)), 100)
      : 75;

    const reportData = await buildClassReportData(classroom.id, threshold);
    res.json(GetClassReportResponse.parse(reportData));
  },
);

router.get(
  "/classes/:classId/reports/export",
  async (req, res): Promise<void> => {
    const params = GetClassReportParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const classroom = await findOwnedClass(params.data.classId, req.userId!, true);
    if (!classroom) {
      res.status(404).json({ error: "Class not found." });
      return;
    }
    const rawThreshold = Number(req.query.threshold ?? 75);
    const threshold = Number.isFinite(rawThreshold)
      ? Math.min(Math.max(50, Math.round(rawThreshold)), 100)
      : 75;
    const format = req.query.format === "csv" ? "csv" : "xlsx";

    const reportData = await buildClassReportData(classroom.id, threshold);
    const safeName = `${classroom.courseCode.toLowerCase().replace(/[^a-z0-9_-]+/g, "-")}-attendance-report`;

    if (format === "csv") {
      const escapeCsv = (val: string | number) =>
        `"${String(val).replaceAll('"', '""')}"`;
      const csv = [
        [
          "full_name",
          "index_number",
          "attended_sessions",
          "total_sessions",
          "attendance_percentage",
          "below_threshold",
        ].join(","),
        ...reportData.students.map((st) =>
          [
            st.fullName,
            st.indexNumber,
            st.attended,
            st.total,
            `${st.percentage}%`,
            st.percentage < threshold ? "YES" : "NO",
          ]
            .map(escapeCsv)
            .join(","),
        ),
      ].join("\n");
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${safeName}.csv"`,
      );
      res.send(csv);
      return;
    }

    const workbook = new ExcelJS.Workbook();
    const summarySheet = workbook.addWorksheet("Student Summary");
    summarySheet.addRow([
      `${classroom.courseCode} — ${classroom.courseTitle} (${classroom.semester} ${classroom.academicYear})`,
    ]);
    summarySheet.addRow([
      `Threshold: ${threshold}%`,
      `Finalized Sessions: ${reportData.totalSessions}`,
      `Students Below Threshold: ${reportData.belowThreshold.length}`,
    ]);
    summarySheet.addRow([]);
    summarySheet.addRow([
      "Full Name",
      "Index Number",
      "Attended Sessions",
      "Total Sessions",
      "Attendance %",
      "Status",
    ]);
    summarySheet.getRow(4).font = { bold: true };
    for (const st of reportData.students) {
      summarySheet.addRow([
        st.fullName,
        st.indexNumber,
        st.attended,
        st.total,
        `${st.percentage}%`,
        st.percentage < threshold ? `Below ${threshold}%` : "On Track",
      ]);
    }
    summarySheet.columns.forEach((col) => {
      col.width = 22;
    });

    const trendSheet = workbook.addWorksheet("Session Breakdown");
    trendSheet.addRow(["Date", "Topic", "Attended", "Roster Size", "Attendance %"]);
    trendSheet.getRow(1).font = { bold: true };
    for (const s of reportData.sessionTrend) {
      trendSheet.addRow([s.label, s.topic, s.attended, s.total, `${s.percentage}%`]);
    }
    trendSheet.columns.forEach((col) => {
      col.width = 24;
    });

    const buffer = await workbook.xlsx.writeBuffer();
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${safeName}.xlsx"`,
    );
    res.send(Buffer.from(buffer));
  },
);

export default router;

function startOfUtcWeek(date: Date): Date {
  const result = new Date(date);
  result.setUTCHours(0, 0, 0, 0);
  result.setUTCDate(result.getUTCDate() - ((result.getUTCDay() + 6) % 7));
  return result;
}

function endOfUtcWeek(date: Date): Date {
  const result = startOfUtcWeek(date);
  result.setUTCDate(result.getUTCDate() + 7);
  result.setUTCMilliseconds(result.getUTCMilliseconds() - 1);
  return result;
}

function buildWeekBuckets(
  now: Date,
  sessions: Array<{
    id: string;
    classId: string;
    startsAt: Date;
  }>,
  attendedRecords: Array<{ sessionId: string }>,
  rosterCounts: Map<string, number>,
) {
  const currentWeek = startOfUtcWeek(now);
  return Array.from({ length: 6 }, (_, index) => {
    const weekStart = new Date(currentWeek);
    weekStart.setUTCDate(weekStart.getUTCDate() - (5 - index) * 7);
    const weekEnd = new Date(weekStart);
    weekEnd.setUTCDate(weekEnd.getUTCDate() + 7);
    const weekSessions = sessions.filter(
      (session) => session.startsAt >= weekStart && session.startsAt < weekEnd,
    );
    const sessionIds = new Set(weekSessions.map((session) => session.id));
    const attended = attendedRecords.filter((record) =>
      sessionIds.has(record.sessionId),
    ).length;
    const expected = weekSessions.reduce(
      (total, session) => total + (rosterCounts.get(session.classId) ?? 0),
      0,
    );
    const label = weekStart.toLocaleDateString("en-GB", {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });

    return {
      week: label,
      attended,
      expected,
    };
  });
}

function labelActivity(action: string): string {
  const labels: Record<string, string> = {
    class_created: "Class created",
    class_copied: "Class copied to new semester",
    class_updated: "Class details updated",
    class_archived: "Class archive status changed",
    roster_committed: "Roster saved",
    student_invite_email_sent: "Roster invitation emails sent",
    roster_high_unmatched_alert: "High unmatched roster alert",
    student_added: "Student added to roster",
    student_updated: "Roster student updated",
    student_removed: "Student removed from roster",
    photo_view_logged: "Identity check viewed",
    photo_confirmed: "Registration photo confirmed",
    photo_disputed: "Identity photo disputed",
    session_created: "Attendance session created",
    session_scheduled_email_sent: "Scheduled session email sent",
    session_opened: "Scheduled session opened",
    session_opened_push_sent: "Session open push sent",
    session_extended: "Session window extended",
    session_closed: "Session closed",
    session_reopened: "Session reopened",
    session_finalized: "Attendance finalized",
    manual_mark: "Manual mark recorded",
    review_decision: "Review decision saved",
    bulk_review_decision: "Bulk attendance updated",
    lecturer_registered: "Lecturer account registered",
    profile_updated: "Lecturer profile updated",
  };
  return labels[action] ?? "Attendance activity";
}

function describeActivity(
  action: string,
  details: Record<string, unknown>,
): string {
  const course = typeof details.courseCode === "string" ? details.courseCode : "";
  const index = typeof details.indexNumber === "string" ? details.indexNumber : "";
  const rowCount =
    typeof details.rowCount === "number" ? details.rowCount : undefined;
  const absencesAdded =
    typeof details.absencesAdded === "number" ? details.absencesAdded : undefined;
  const minutesAdded =
    typeof details.minutesAdded === "number" ? details.minutesAdded : undefined;
  const bulkCount = typeof details.count === "number" ? details.count : undefined;
  const bulkStatus = typeof details.status === "string" ? details.status : undefined;

  if (action === "lecturer_registered") {
    const staffId = typeof details.staffId === "string" ? details.staffId : "";
    return `${staffId ? `Staff ID ${staffId} · ` : ""}Pending admin review (instant access active)`;
  }
  if (action === "class_copied") {
    const sem = typeof details.semester === "string" ? details.semester : "";
    const yr = typeof details.academicYear === "string" ? details.academicYear : "";
    const copiedRoster = typeof details.copiedRosterCount === "number" ? details.copiedRosterCount : 0;
    return `${course ? `${course} · ` : ""}${sem} ${yr} (${copiedRoster} students copied)`.trim();
  }
  if (action === "student_invite_email_sent") {
    const count = typeof details.recipientCount === "number" ? details.recipientCount : 1;
    return `${course ? `${course} · ` : ""}${count} student invite email${count === 1 ? "" : "s"} queued`;
  }
  if (action === "session_scheduled_email_sent") {
    const count = typeof details.recipientCount === "number" ? details.recipientCount : 0;
    return `${course ? `${course} · ` : ""}Scheduled notice emailed to ${count} rostered student${count === 1 ? "" : "s"}`;
  }
  if (action === "session_opened_push_sent") {
    const count = typeof details.recipientCount === "number" ? details.recipientCount : 0;
    return `${course ? `${course} · ` : ""}Push alert dispatched to ${count} rostered student${count === 1 ? "" : "s"}`;
  }
  if (action === "roster_high_unmatched_alert") {
    const unmatched = typeof details.unmatchedCount === "number" ? details.unmatchedCount : 0;
    const total = typeof details.totalCount === "number" ? details.totalCount : 0;
    return `${course ? `${course} · ` : ""}${unmatched} of ${total} rows not matched to registered accounts`;
  }
  if (action === "bulk_review_decision" && bulkCount !== undefined && bulkStatus) {
    return `${bulkCount} student${bulkCount === 1 ? "" : "s"} marked ${bulkStatus}`;
  }
  if (action === "roster_committed" && rowCount !== undefined) {
    return `${course ? `${course} · ` : ""}${rowCount} roster rows saved`;
  }
  if (action === "session_finalized" && absencesAdded !== undefined) {
    return `${absencesAdded} unmarked students set absent`;
  }
  if (action === "session_extended" && minutesAdded !== undefined) {
    return `Extended by ${minutesAdded} minutes`;
  }
  if (action === "photo_disputed" && index) {
    return `${course ? `${course} · ` : ""}Index ${index} locked for dispute`;
  }
  if (action === "photo_confirmed" && index) {
    return `${course ? `${course} · ` : ""}Index ${index} identity confirmed`;
  }
  if ((action === "student_added" || action === "student_updated" || action === "student_removed") && index) {
    return `${course ? `${course} · ` : ""}Index ${index}`;
  }
  if (course) {
    return course;
  }
  if (action === "manual_mark" && index) {
    return `Index ${index}`;
  }
  return "Your attendance workspace was updated";
}
