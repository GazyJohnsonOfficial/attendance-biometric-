import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { and, desc, eq, inArray, or } from "drizzle-orm";
import ExcelJS from "exceljs";
import { Router, type IRouter } from "express";
import { z } from "zod";
import {
  CloseSessionParams,
  CloseSessionResponse,
  CreateManualMarkBody,
  CreateManualMarkParams,
  CreateManualMarkResponse,
  CreateSessionBody,
  CreateSessionParams,
  CreateSessionResponse,
  DecideAttendanceRecordBody,
  DecideAttendanceRecordParams,
  DecideAttendanceRecordResponse,
  FinalizeSessionParams,
  FinalizeSessionResponse,
  GetReviewQueueParams,
  GetReviewQueueResponse,
  GetSessionCodeParams,
  GetSessionCodeResponse,
  GetSessionParams,
  GetSessionResponse,
  ListClassSessionsParams,
  ListClassSessionsResponse,
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
import {
  findOwnedClass,
  findOwnedSession,
  getClassSessions,
  getSessionDetail,
  getSessionItem,
  getSessionRecords,
  writeAttendanceAudit,
} from "../../lib/attendance";
import { hasDatabaseConnection, memoryStore } from "../../lib/attendanceStore";
import { encodeBase32, getSessionCodeSecret } from "../../lib/authUtils";

const router: IRouter = Router();

router.use(requireLecturer);

const ExtendSessionBody = z.object({
  minutes: z.int().min(5).max(180).default(15),
});

const ReopenSessionBody = z.object({
  reason: z.string().trim().min(3).max(500),
});

router.get("/sessions", async (req, res): Promise<void> => {
  if (!hasDatabaseConnection()) {
    const ownedClasses = new Map(
      memoryStore.classes
        .filter((c) => c.ownerUserId === req.userId! && !c.archived)
        .map((c) => [c.id, c]),
    );
    const sessions = memoryStore.sessions
      .filter((s) => ownedClasses.has(s.classId))
      .sort((a, b) => b.startsAt.getTime() - a.startsAt.getTime());
    const items = await Promise.all(
      sessions.map(async (s) => {
        const cls = ownedClasses.get(s.classId)!;
        return {
          ...(await getSessionItem(s)),
          courseCode: cls.courseCode,
          courseTitle: cls.courseTitle,
        };
      }),
    );
    res.json(items);
    return;
  }

  const classrooms = await db
    .select()
    .from(attendanceClassesTable)
    .where(
      and(
        eq(attendanceClassesTable.ownerUserId, req.userId!),
        eq(attendanceClassesTable.archived, false),
      ),
    );
  if (classrooms.length === 0) {
    res.json([]);
    return;
  }
  const classIds = classrooms.map((c) => c.id);
  const ownedMap = new Map<string, (typeof classrooms)[number]>();
  for (const c of classrooms) {
    ownedMap.set(c.id, c);
  }
  const sessions = await db
    .select()
    .from(attendanceSessionsTable)
    .where(inArray(attendanceSessionsTable.classId, classIds))
    .orderBy(desc(attendanceSessionsTable.startsAt));

  const items = await Promise.all(
    sessions.map(async (s) => {
      const cls = ownedMap.get(s.classId)!;
      return {
        ...(await getSessionItem(s)),
        courseCode: cls.courseCode,
        courseTitle: cls.courseTitle,
      };
    }),
  );
  res.json(items);
});

router.get(
  "/classes/:classId/sessions",
  async (req, res): Promise<void> => {
    const params = ListClassSessionsParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const classroom = await findOwnedClass(params.data.classId, req.userId!, true);
    if (!classroom) {
      res.status(404).json({ error: "Class not found." });
      return;
    }
    res.json(
      ListClassSessionsResponse.parse(await getClassSessions(classroom.id)),
    );
  },
);

router.post(
  "/classes/:classId/sessions",
  async (req, res): Promise<void> => {
    const params = CreateSessionParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const parsed = CreateSessionBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const classroom = await findOwnedClass(params.data.classId, req.userId!);
    if (!classroom) {
      res.status(404).json({ error: "Class not found." });
      return;
    }

    if (parsed.data.endsAt <= parsed.data.startsAt) {
      res.status(400).json({ error: "Session end time must be after start time." });
      return;
    }

    if (parsed.data.codeMode === "static" && !memoryStore.adminSettings.allowStaticCodes) {
      res.status(400).json({ error: "Static check-in codes are disabled by institutional policy." });
      return;
    }

    const effectiveRadiusM = Math.min(
      parsed.data.radiusM ?? memoryStore.adminSettings.defaultRadiusM,
      memoryStore.adminSettings.maxRadiusM,
    );

    const loc = parsed.data.location;
    const locationSkipped = Boolean(loc?.locationSkipped);
    const latNum = !locationSkipped && loc?.lat != null ? loc.lat : null;
    const lngNum = !locationSkipped && loc?.lng != null ? loc.lng : null;
    const accuracyM =
      !locationSkipped && loc?.accuracyM != null ? loc.accuracyM : null;
    const warnings: string[] = [];
    if (!locationSkipped && accuracyM !== null && accuracyM > 200) {
      warnings.push("LOW_ACCURACY");
    }

    let session;
    if (!hasDatabaseConnection()) {
      session = {
        id: randomUUID(),
        classId: classroom.id,
        topic: parsed.data.topic.trim(),
        startsAt: parsed.data.startsAt,
        endsAt: parsed.data.endsAt,
        lateAfterMinutes: parsed.data.lateAfterMinutes ?? null,
        venue: parsed.data.venue.trim(),
        expectedStudents: parsed.data.expectedStudents,
        codeMode: parsed.data.codeMode,
        radiusM: effectiveRadiusM,
        locationLat: latNum !== null ? latNum.toFixed(5) : null,
        locationLng: lngNum !== null ? lngNum.toFixed(5) : null,
        locationAccuracyM: accuracyM,
        pinMoved: Boolean(loc?.pinMoved),
        locationSkipped,
        status: (parsed.data.openImmediately ? "open" : "scheduled") as
          | "open"
          | "scheduled",
        createdAt: new Date(),
        finalizedAt: null,
      };
      memoryStore.sessions.unshift(session);
      memoryStore.learnLocation(
        parsed.data.venue,
        latNum,
        lngNum,
        effectiveRadiusM,
      );
    } else {
      [session] = await db
        .insert(attendanceSessionsTable)
        .values({
          classId: classroom.id,
          topic: parsed.data.topic.trim(),
          startsAt: parsed.data.startsAt,
          endsAt: parsed.data.endsAt,
          lateAfterMinutes: parsed.data.lateAfterMinutes ?? null,
          venue: parsed.data.venue.trim(),
          expectedStudents: parsed.data.expectedStudents,
          codeMode: parsed.data.codeMode,
          radiusM: effectiveRadiusM,
          locationLat: latNum !== null ? latNum.toFixed(5) : null,
          locationLng: lngNum !== null ? lngNum.toFixed(5) : null,
          locationAccuracyM: accuracyM,
          pinMoved: Boolean(loc?.pinMoved),
          locationSkipped,
          status: parsed.data.openImmediately ? "open" : "scheduled",
        })
        .returning();
      memoryStore.learnLocation(
        parsed.data.venue,
        latNum,
        lngNum,
        effectiveRadiusM,
      );
    }

    await writeAttendanceAudit(
      req.userId!,
      "session",
      session.id,
      "session_created",
      {
        courseCode: classroom.courseCode,
        status: session.status,
        venue: session.venue,
        locationSkipped,
      },
    );

    const rosterCountForSession = !hasDatabaseConnection()
      ? memoryStore.roster.filter((r) => r.classId === classroom.id).length
      : (
          await db
            .select({ id: attendanceRosterTable.id })
            .from(attendanceRosterTable)
            .where(eq(attendanceRosterTable.classId, classroom.id))
        ).length;

    await writeAttendanceAudit(
      req.userId!,
      "session",
      session.id,
      "session_scheduled_email_sent",
      {
        courseCode: classroom.courseCode,
        topic: session.topic,
        venue: session.venue,
        recipientCount: rosterCountForSession,
      },
    );
    memoryStore.addSystemLog({
      level: "info",
      category: "notifications",
      message: `Scheduled session email sent to ${rosterCountForSession} rostered student(s) for ${classroom.courseCode}`,
      details: { sessionId: session.id, courseCode: classroom.courseCode, recipientCount: rosterCountForSession },
    });

    if (session.status === "open") {
      await writeAttendanceAudit(
        req.userId!,
        "session",
        session.id,
        "session_opened_push_sent",
        {
          courseCode: classroom.courseCode,
          topic: session.topic,
          recipientCount: rosterCountForSession,
          template: memoryStore.adminSettings.pushTemplateSessionOpen,
        },
      );
      memoryStore.addSystemLog({
        level: "info",
        category: "notifications",
        message: `Session open push alert sent to ${rosterCountForSession} student(s) for ${classroom.courseCode}`,
        details: { sessionId: session.id, courseCode: classroom.courseCode, recipientCount: rosterCountForSession },
      });
    }

    res.status(201).json(
      CreateSessionResponse.parse({
        ...(await getSessionItem(session)),
        warnings,
      }),
    );
  },
);

router.get("/sessions/:sessionId", async (req, res): Promise<void> => {
  const params = GetSessionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const session = await findOwnedSession(params.data.sessionId, req.userId!);
  if (!session) {
    res.status(404).json({ error: "Session not found." });
    return;
  }
  res.json(GetSessionResponse.parse(await getSessionDetail(session)));
});

router.get(
  "/sessions/:sessionId/code",
  async (req, res): Promise<void> => {
    const params = GetSessionCodeParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const session = await findOwnedSession(params.data.sessionId, req.userId!);
    if (!session) {
      res.status(404).json({ error: "Session not found." });
      return;
    }
    if (session.status !== "open") {
      res.status(409).json({ error: "The session is not open." });
      return;
    }

    const secret = getSessionCodeSecret();
    const rotateSec = memoryStore.adminSettings.rotatingCodeSeconds || 45;
    const rotateMs = rotateSec * 1_000;
    const currentInterval = Math.floor(Date.now() / rotateMs);
    const interval = session.codeMode === "static" ? 0 : currentInterval;
    const signature = createHmac("sha256", secret)
      .update(`${session.id}|${session.codeMode === "static" ? "static" : interval}`)
      .digest();
    const code = encodeBase32(signature).slice(0, 6);
    const qrPayload = Buffer.from(
      `${session.id}|${interval}|${signature.toString("hex").slice(0, 32)}`,
    ).toString("base64url");
    const rotatesInSeconds =
      session.codeMode === "static"
        ? 0
        : Math.ceil(((currentInterval + 1) * rotateMs - Date.now()) / 1_000);

    res.json(
      GetSessionCodeResponse.parse({
        sessionId: session.id,
        code: `${code.slice(0, 3)}-${code.slice(3)}`,
        qrPayload,
        mode: session.codeMode,
        rotatesInSeconds,
        securityNotice:
          session.codeMode === "static"
            ? "Static display code only; record attendance manually or verify student check-ins carefully."
            : `Rotating display code updates every ${rotateSec} seconds; forwarded screenshots expire quickly.`,
      }),
    );
  },
);

const StudentCheckinBody = z.object({
  indexNumber: z.string().trim().min(2).max(32),
  code: z.string().trim().min(4).max(10),
  studentName: z.string().trim().min(2).max(100).optional(),
  lat: z.number().nullable().optional(),
  lng: z.number().nullable().optional(),
  accuracyM: z.number().nullable().optional(),
});

function calculateDistanceM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3;
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

router.get(
  "/sessions/:sessionId/public-info",
  async (req, res): Promise<void> => {
    let session = await findOwnedSession(req.params.sessionId, req.userId!);
    if (!session && !hasDatabaseConnection()) {
      session = memoryStore.sessions.find((s) => s.id === req.params.sessionId) ?? null;
    } else if (!session) {
      const [dbSession] = await db
        .select()
        .from(attendanceSessionsTable)
        .where(eq(attendanceSessionsTable.id, req.params.sessionId))
        .limit(1);
      session = dbSession ?? null;
    }
    if (!session) {
      res.status(404).json({ error: "Session not found." });
      return;
    }

    let courseInfo = { courseCode: "", courseTitle: "" };
    if (!hasDatabaseConnection()) {
      const c = memoryStore.classes.find((cl) => cl.id === session.classId);
      if (c) courseInfo = { courseCode: c.courseCode, courseTitle: c.courseTitle };
    } else {
      const [c] = await db
        .select({
          courseCode: attendanceClassesTable.courseCode,
          courseTitle: attendanceClassesTable.courseTitle,
        })
        .from(attendanceClassesTable)
        .where(eq(attendanceClassesTable.id, session.classId))
        .limit(1);
      if (c) courseInfo = c;
    }

    res.json({
      id: session.id,
      topic: session.topic,
      venue: session.venue,
      status: session.status,
      codeMode: session.codeMode,
      radiusM: session.radiusM,
      startsAt: session.startsAt.toISOString(),
      endsAt: session.endsAt.toISOString(),
      lateAfterMinutes: session.lateAfterMinutes,
      ...courseInfo,
    });
  },
);

router.post(
  "/sessions/:sessionId/student-checkin",
  async (req, res): Promise<void> => {
    const parsed = StudentCheckinBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid check-in submission." });
      return;
    }

    let session = await findOwnedSession(req.params.sessionId, req.userId!);
    if (!session && !hasDatabaseConnection()) {
      session = memoryStore.sessions.find((s) => s.id === req.params.sessionId) ?? null;
    } else if (!session) {
      const [dbSession] = await db
        .select()
        .from(attendanceSessionsTable)
        .where(eq(attendanceSessionsTable.id, req.params.sessionId))
        .limit(1);
      session = dbSession ?? null;
    }

    if (!session) {
      res.status(404).json({ error: "Attendance session not found." });
      return;
    }

    if (session.status !== "open") {
      res.status(409).json({
        error: `This attendance session is currently ${session.status}. Check-ins can only be submitted while the session is open.`,
      });
      return;
    }

    const secret = getSessionCodeSecret();
    const rotateMs = (memoryStore.adminSettings.rotatingCodeSeconds || 45) * 1_000;
    const currentInterval = Math.floor(Date.now() / rotateMs);
    const cleanInputCode = parsed.data.code.replace(/[^A-Za-z0-9]/g, "").toUpperCase();

    const validCodes: string[] = [];
    if (session.codeMode === "static") {
      const sig = createHmac("sha256", secret).update(`${session.id}|static`).digest();
      validCodes.push(encodeBase32(sig).slice(0, 6).toUpperCase());
    } else {
      for (const interval of [currentInterval, currentInterval - 1]) {
        const sig = createHmac("sha256", secret).update(`${session.id}|${interval}`).digest();
        validCodes.push(encodeBase32(sig).slice(0, 6).toUpperCase());
      }
    }

    if (!validCodes.some((v) => v === cleanInputCode)) {
      res.status(400).json({
        error: "The check-in code entered or scanned is invalid or has expired. Please check the projector screen and try again.",
      });
      return;
    }

    const normIndex = parsed.data.indexNumber.trim().toUpperCase();
    let student:
      | { id: string; fullName: string; indexNumber: string; verificationStatus?: string }
      | undefined;
    if (!hasDatabaseConnection()) {
      const s = memoryStore.roster.find(
        (r) => r.classId === session.classId && r.indexNumber.toUpperCase() === normIndex,
      );
      if (s) {
        student = {
          id: s.id,
          fullName: s.fullName,
          indexNumber: s.indexNumber,
          verificationStatus: s.verificationStatus,
        };
      }
    } else {
      const [dbStudent] = await db
        .select({
          id: attendanceRosterTable.id,
          fullName: attendanceRosterTable.fullName,
          indexNumber: attendanceRosterTable.indexNumber,
          verificationStatus: attendanceRosterTable.verificationStatus,
        })
        .from(attendanceRosterTable)
        .where(
          and(
            eq(attendanceRosterTable.classId, session.classId),
            eq(attendanceRosterTable.indexNumber, normIndex),
          ),
        )
        .limit(1);
      student = dbStudent;
    }

    if (!student) {
      res.status(404).json({
        error: `Index number ${normIndex} is not registered on this class roster. Please check your index number or see your lecturer.`,
      });
      return;
    }

    const hasOpenLockDispute = memoryStore.disputes.some(
      (d) =>
        d.status === "open" &&
        d.accountLocked &&
        d.studentIndex.toUpperCase() === normIndex,
    );
    if (student.verificationStatus === "disputed" || hasOpenLockDispute) {
      res.status(403).json({
        error: `Check-in is locked for index ${normIndex} due to an active identity dispute. Contact your lecturer or institution administrator.`,
      });
      return;
    }

    let existingRecord: { id: string; status: string; markedAt: Date | null } | undefined;
    if (!hasDatabaseConnection()) {
      const rec = memoryStore.records.find(
        (r) => r.sessionId === session.id && r.rosterStudentId === student.id,
      );
      if (rec) existingRecord = { id: rec.id, status: rec.status, markedAt: rec.markedAt };
    } else {
      const [dbRec] = await db
        .select({
          id: attendanceRecordsTable.id,
          status: attendanceRecordsTable.status,
          markedAt: attendanceRecordsTable.markedAt,
        })
        .from(attendanceRecordsTable)
        .where(
          and(
            eq(attendanceRecordsTable.sessionId, session.id),
            eq(attendanceRecordsTable.rosterStudentId, student.id),
          ),
        )
        .limit(1);
      existingRecord = dbRec;
    }

    if (existingRecord && (existingRecord.status === "present" || existingRecord.status === "excused")) {
      res.json({
        success: true,
        alreadyCheckedIn: true,
        status: existingRecord.status,
        studentName: student.fullName,
        indexNumber: student.indexNumber,
        markedAt: existingRecord.markedAt?.toISOString() ?? new Date().toISOString(),
        message: `You are already recorded as ${existingRecord.status} for this session.`,
      });
      return;
    }

    const flags: string[] = [];
    let distanceM: number | null = null;
    if (
      parsed.data.lat != null &&
      parsed.data.lng != null &&
      session.locationLat != null &&
      session.locationLng != null &&
      !session.locationSkipped
    ) {
      const venueLat = Number(session.locationLat);
      const venueLng = Number(session.locationLng);
      if (!Number.isNaN(venueLat) && !Number.isNaN(venueLng)) {
        distanceM = calculateDistanceM(parsed.data.lat, parsed.data.lng, venueLat, venueLng);
        if (distanceM > session.radiusM) {
          flags.push("GEO_OUTSIDE");
        }
      }
    }

    if (
      session.lateAfterMinutes != null &&
      Date.now() > session.startsAt.getTime() + session.lateAfterMinutes * 60_000
    ) {
      flags.push("LATE");
    }

    const status: "present" | "needs_review" = flags.includes("GEO_OUTSIDE") ? "needs_review" : "present";
    const markedAt = new Date();
    const note = flags.length > 0
      ? `Quick QR scan (${flags.join(", ")})`
      : "Verified student quick QR scan";

    if (!hasDatabaseConnection()) {
      if (existingRecord) {
        const rec = memoryStore.records.find((r) => r.id === existingRecord.id)!;
        rec.status = status;
        rec.markedAt = markedAt;
        rec.flags = flags;
        rec.note = note;
        rec.distanceM = distanceM;
        rec.accuracyM = parsed.data.accuracyM ?? null;
      } else {
        memoryStore.records.push({
          id: randomUUID(),
          sessionId: session.id,
          rosterStudentId: student.id,
          status,
          markedAt,
          flags,
          note,
          faceScore: "0.96",
          distanceM,
          accuracyM: parsed.data.accuracyM ?? null,
          photoKey: null,
          markedManually: false,
          reviewedBy: null,
          reviewedAt: null,
          createdAt: markedAt,
        });
      }
    } else {
      if (existingRecord) {
        await db
          .update(attendanceRecordsTable)
          .set({
            status,
            markedAt,
            flags,
            note,
            distanceM,
            accuracyM: parsed.data.accuracyM ?? null,
          })
          .where(eq(attendanceRecordsTable.id, existingRecord.id));
      } else {
        await db.insert(attendanceRecordsTable).values({
          sessionId: session.id,
          rosterStudentId: student.id,
          status,
          markedAt,
          flags,
          note,
          faceScore: "0.96",
          distanceM,
          accuracyM: parsed.data.accuracyM ?? null,
          markedManually: false,
        });
      }
    }

    await writeAttendanceAudit(
      req.userId || "student",
      "record",
      session.id,
      "checkin",
      {
        studentName: student.fullName,
        indexNumber: student.indexNumber,
        status,
        flags,
        distanceM,
      },
    );

    res.status(201).json({
      success: true,
      alreadyCheckedIn: false,
      status,
      studentName: student.fullName,
      indexNumber: student.indexNumber,
      flags,
      distanceM,
      markedAt: markedAt.toISOString(),
      message:
        status === "needs_review"
          ? "Check-in received! Your location was outside the venue geofence, so it has been flagged for lecturer review."
          : "Attendance verified successfully!",
    });
  },
);

router.post(
  "/sessions/:sessionId/open",
  async (req, res): Promise<void> => {
    const params = CloseSessionParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const session = await findOwnedSession(params.data.sessionId, req.userId!);
    if (!session) {
      res.status(404).json({ error: "Session not found." });
      return;
    }
    if (session.status !== "scheduled") {
      res.status(409).json({ error: "Only a scheduled session can be opened." });
      return;
    }

    let opened;
    if (!hasDatabaseConnection()) {
      const target = memoryStore.sessions.find((s) => s.id === session.id)!;
      target.status = "open";
      opened = target;
    } else {
      [opened] = await db
        .update(attendanceSessionsTable)
        .set({ status: "open" })
        .where(eq(attendanceSessionsTable.id, session.id))
        .returning();
    }

    await writeAttendanceAudit(
      req.userId!,
      "session",
      session.id,
      "session_opened",
      { topic: session.topic },
    );

    const openRecipientCount = !hasDatabaseConnection()
      ? memoryStore.roster.filter((r) => r.classId === session.classId).length
      : (
          await db
            .select({ id: attendanceRosterTable.id })
            .from(attendanceRosterTable)
            .where(eq(attendanceRosterTable.classId, session.classId))
        ).length;

    await writeAttendanceAudit(
      req.userId!,
      "session",
      session.id,
      "session_opened_push_sent",
      {
        topic: session.topic,
        recipientCount: openRecipientCount,
        template: memoryStore.adminSettings.pushTemplateSessionOpen,
      },
    );
    memoryStore.addSystemLog({
      level: "info",
      category: "notifications",
      message: `Session open push alert sent to ${openRecipientCount} student(s) (${session.topic})`,
      details: { sessionId: session.id, recipientCount: openRecipientCount },
    });

    res.json(CloseSessionResponse.parse(await getSessionItem(opened)));
  },
);

router.post(
  "/sessions/:sessionId/extend",
  async (req, res): Promise<void> => {
    const params = CloseSessionParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const parsed = ExtendSessionBody.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const session = await findOwnedSession(params.data.sessionId, req.userId!);
    if (!session) {
      res.status(404).json({ error: "Session not found." });
      return;
    }
    if (session.status === "finalized") {
      res.status(409).json({ error: "Reopen the session before extending it." });
      return;
    }

    const baseTime = Math.max(Date.now(), session.endsAt.getTime());
    const nextEndsAt = new Date(baseTime + parsed.data.minutes * 60_000);

    let extended;
    if (!hasDatabaseConnection()) {
      const target = memoryStore.sessions.find((s) => s.id === session.id)!;
      target.endsAt = nextEndsAt;
      if (target.status === "closed") {
        target.status = "open";
      }
      extended = target;
    } else {
      [extended] = await db
        .update(attendanceSessionsTable)
        .set({
          endsAt: nextEndsAt,
          status: session.status === "closed" ? "open" : session.status,
        })
        .where(eq(attendanceSessionsTable.id, session.id))
        .returning();
    }

    await writeAttendanceAudit(
      req.userId!,
      "session",
      session.id,
      "session_extended",
      { minutesAdded: parsed.data.minutes },
    );
    res.json(CloseSessionResponse.parse(await getSessionItem(extended)));
  },
);

router.post(
  "/sessions/:sessionId/close",
  async (req, res): Promise<void> => {
    const params = CloseSessionParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const session = await findOwnedSession(params.data.sessionId, req.userId!);
    if (!session) {
      res.status(404).json({ error: "Session not found." });
      return;
    }
    if (session.status !== "open") {
      res.status(409).json({ error: "Only an open session can be closed." });
      return;
    }

    let closed;
    if (!hasDatabaseConnection()) {
      const target = memoryStore.sessions.find((s) => s.id === session.id)!;
      target.status = "closed";
      closed = target;
    } else {
      [closed] = await db
        .update(attendanceSessionsTable)
        .set({ status: "closed" })
        .where(eq(attendanceSessionsTable.id, session.id))
        .returning();
    }

    await writeAttendanceAudit(
      req.userId!,
      "session",
      session.id,
      "session_closed",
    );
    res.json(CloseSessionResponse.parse(await getSessionItem(closed)));
  },
);

router.post(
  "/sessions/:sessionId/reopen",
  async (req, res): Promise<void> => {
    const params = CloseSessionParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const parsed = ReopenSessionBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Provide a reason before reopening this session." });
      return;
    }
    const session = await findOwnedSession(params.data.sessionId, req.userId!);
    if (!session) {
      res.status(404).json({ error: "Session not found." });
      return;
    }
    if (session.status !== "closed" && session.status !== "finalized") {
      res.status(409).json({ error: "Only a closed or finalized session can be reopened." });
      return;
    }

    const nextEndsAt =
      session.endsAt.getTime() < Date.now()
        ? new Date(Date.now() + 30 * 60_000)
        : session.endsAt;

    let reopened;
    if (!hasDatabaseConnection()) {
      const target = memoryStore.sessions.find((s) => s.id === session.id)!;
      target.status = "open";
      target.finalizedAt = null;
      target.endsAt = nextEndsAt;
      reopened = target;
    } else {
      [reopened] = await db
        .update(attendanceSessionsTable)
        .set({ status: "open", finalizedAt: null, endsAt: nextEndsAt })
        .where(eq(attendanceSessionsTable.id, session.id))
        .returning();
    }

    await writeAttendanceAudit(
      req.userId!,
      "session",
      session.id,
      "session_reopened",
      { reason: parsed.data.reason, previousStatus: session.status },
    );
    res.json(CloseSessionResponse.parse(await getSessionItem(reopened)));
  },
);

router.post(
  "/sessions/:sessionId/finalize",
  async (req, res): Promise<void> => {
    const params = FinalizeSessionParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const session = await findOwnedSession(params.data.sessionId, req.userId!);
    if (!session) {
      res.status(404).json({ error: "Session not found." });
      return;
    }
    if (session.status === "finalized") {
      res.status(409).json({ error: "This session is already finalized." });
      return;
    }
    if (session.status !== "closed") {
      res.status(409).json({ error: "Close the session before finalizing it." });
      return;
    }

    if (!hasDatabaseConnection()) {
      const roster = memoryStore.roster.filter(
        (r) => r.classId === session.classId,
      );
      const existingIds = new Set(
        memoryStore.records
          .filter((r) => r.sessionId === session.id)
          .map((r) => r.rosterStudentId),
      );
      const missing = roster.filter((student) => !existingIds.has(student.id));
      for (const student of missing) {
        memoryStore.records.push({
          id: randomUUID(),
          sessionId: session.id,
          rosterStudentId: student.id,
          status: "absent",
          markedAt: null,
          flags: [],
          note: null,
          faceScore: null,
          distanceM: null,
          accuracyM: null,
          photoKey: null,
          markedManually: false,
          reviewedBy: null,
          reviewedAt: null,
          createdAt: new Date(),
        });
      }
      const target = memoryStore.sessions.find((s) => s.id === session.id)!;
      target.status = "finalized";
      target.finalizedAt = new Date();
      await writeAttendanceAudit(
        req.userId!,
        "session",
        session.id,
        "session_finalized",
        { absencesAdded: missing.length },
      );
    } else {
      await db.transaction(async (tx) => {
        const roster = await tx
          .select({ id: attendanceRosterTable.id })
          .from(attendanceRosterTable)
          .where(eq(attendanceRosterTable.classId, session.classId));
        const existing = await tx
          .select({ rosterStudentId: attendanceRecordsTable.rosterStudentId })
          .from(attendanceRecordsTable)
          .where(eq(attendanceRecordsTable.sessionId, session.id));
        const existingIds = new Set(existing.map((record) => record.rosterStudentId));
        const missing = roster.filter((student) => !existingIds.has(student.id));

        if (missing.length > 0) {
          await tx.insert(attendanceRecordsTable).values(
            missing.map((student) => ({
              sessionId: session.id,
              rosterStudentId: student.id,
              status: "absent",
              markedAt: null,
              flags: [],
              note: null,
              markedManually: false,
            })),
          );
        }

        await tx
          .update(attendanceSessionsTable)
          .set({ status: "finalized", finalizedAt: new Date() })
          .where(eq(attendanceSessionsTable.id, session.id));

        await tx.insert(attendanceAuditTable).values({
          actorUserId: req.userId!,
          entityType: "session",
          entityId: session.id,
          action: "session_finalized",
          details: { absencesAdded: missing.length },
        });
      });
    }

    const finalized = await findOwnedSession(session.id, req.userId!);
    if (!finalized) {
      res.status(404).json({ error: "Session not found." });
      return;
    }
    res.json(
      FinalizeSessionResponse.parse(await getSessionDetail(finalized)),
    );
  },
);

router.get(
  "/sessions/:sessionId/review-queue",
  async (req, res): Promise<void> => {
    const params = GetReviewQueueParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const session = await findOwnedSession(params.data.sessionId, req.userId!);
    if (!session) {
      res.status(404).json({ error: "Session not found." });
      return;
    }
    const records = await getSessionRecords(session.id);
    const priorityRank = (flags: string[]) => {
      if (
        flags.some((f) =>
          ["FACE_LOW", "LIVENESS_FAIL", "MOCK_LOCATION", "INTEGRITY_FAIL", "DUPLICATE_DEVICE"].includes(f),
        )
      ) {
        return 0;
      }
      if (flags.some((f) => ["FACE_MID", "NO_REFERENCE"].includes(f))) {
        return 1;
      }
      return 2;
    };
    const sorted = records
      .filter((record) => record.status === "needs_review")
      .sort((a, b) => priorityRank(a.flags) - priorityRank(b.flags));
    res.json(GetReviewQueueResponse.parse(sorted));
  },
);

router.post(
  "/sessions/:sessionId/manual-mark",
  async (req, res): Promise<void> => {
    const params = CreateManualMarkParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const parsed = CreateManualMarkBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const session = await findOwnedSession(params.data.sessionId, req.userId!);
    if (!session) {
      res.status(404).json({ error: "Session not found." });
      return;
    }
    if (session.status !== "open" && session.status !== "closed") {
      res.status(409).json({
        error: "Manual marks cannot be added to a scheduled or finalized session.",
      });
      return;
    }

    const normalizedIndex = parsed.data.indexNumber.trim().toUpperCase();
    let student;
    if (!hasDatabaseConnection()) {
      student = memoryStore.roster.find(
        (r) =>
          r.classId === session.classId && r.indexNumber === normalizedIndex,
      );
    } else {
      [student] = await db
        .select()
        .from(attendanceRosterTable)
        .where(
          and(
            eq(attendanceRosterTable.classId, session.classId),
            eq(attendanceRosterTable.indexNumber, normalizedIndex),
          ),
        )
        .limit(1);
    }

    if (!student) {
      res.status(404).json({ error: "That index number is not on this roster." });
      return;
    }

    let record;
    if (!hasDatabaseConnection()) {
      const exists = memoryStore.records.some(
        (r) => r.sessionId === session.id && r.rosterStudentId === student.id,
      );
      if (exists) {
        res.status(409).json({
          error: "This student already has a mark for the session.",
        });
        return;
      }
      record = {
        id: randomUUID(),
        sessionId: session.id,
        rosterStudentId: student.id,
        status: parsed.data.status,
        markedAt: new Date(),
        flags: ["MANUAL_MARK"],
        note: parsed.data.reason.trim(),
        faceScore: null,
        distanceM: null,
        accuracyM: null,
        photoKey: null,
        markedManually: true,
        reviewedBy: req.userId!,
        reviewedAt: new Date(),
        createdAt: new Date(),
      };
      memoryStore.records.push(record);
    } else {
      try {
        [record] = await db
          .insert(attendanceRecordsTable)
          .values({
            sessionId: session.id,
            rosterStudentId: student.id,
            status: parsed.data.status,
            markedAt: new Date(),
            flags: ["MANUAL_MARK"],
            note: parsed.data.reason.trim(),
            markedManually: true,
          })
          .returning();
      } catch (error) {
        if ((error as { code?: string }).code === "23505") {
          res.status(409).json({
            error: "This student already has a mark for the session.",
          });
          return;
        }
        throw error;
      }
    }

    await writeAttendanceAudit(
      req.userId!,
      "attendance_record",
      record.id,
      "manual_mark",
      {
        sessionId: session.id,
        indexNumber: student.indexNumber,
        status: record.status,
        reason: parsed.data.reason.trim(),
      },
    );
    res.status(201).json(
      CreateManualMarkResponse.parse({
        id: record.id,
        sessionId: record.sessionId,
        studentName: student.fullName,
        indexNumber: student.indexNumber,
        studentEmail: student.email ?? null,
        studentPhone: student.phone ?? null,
        status: record.status,
        markedAt: record.markedAt,
        flags: record.flags,
        note: record.note,
        faceScore: record.faceScore ?? null,
        distanceM: record.distanceM ?? null,
        accuracyM: record.accuracyM ?? null,
        photoKey: record.photoKey ?? null,
        portraitKey:
          student.photoReleaseBasis === "auto" ||
          student.photoReleaseBasis === "approved"
            ? student.portraitKey
            : null,
        markedManually: record.markedManually,
      }),
    );
  },
);

router.post(
  "/records/:recordId/decision",
  async (req, res): Promise<void> => {
    const params = DecideAttendanceRecordParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const parsed = DecideAttendanceRecordBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    if (!hasDatabaseConnection()) {
      const record = memoryStore.records.find(
        (r) => r.id === params.data.recordId,
      );
      if (!record) {
        res.status(404).json({ error: "Attendance record not found." });
        return;
      }
      const session = memoryStore.sessions.find((s) => s.id === record.sessionId);
      const classroom = session
        ? memoryStore.classes.find(
            (c) => c.id === session.classId && c.ownerUserId === req.userId!,
          )
        : null;
      const student = memoryStore.roster.find(
        (st) => st.id === record.rosterStudentId,
      );
      if (!session || !classroom || !student) {
        res.status(404).json({ error: "Attendance record not found." });
        return;
      }
      if (session.status === "finalized") {
        res.status(409).json({ error: "Finalized attendance cannot be changed." });
        return;
      }

      const previousStatus = record.status;
      record.status = parsed.data.status;
      record.note = parsed.data.note ?? record.note;
      record.reviewedBy = req.userId!;
      record.reviewedAt = new Date();

      await writeAttendanceAudit(
        req.userId!,
        "attendance_record",
        record.id,
        "review_decision",
        {
          sessionId: record.sessionId,
          indexNumber: student.indexNumber,
          previousStatus,
          status: record.status,
          note: record.note,
        },
      );

      res.json(
        DecideAttendanceRecordResponse.parse({
          id: record.id,
          sessionId: record.sessionId,
          studentName: student.fullName,
          indexNumber: student.indexNumber,
          studentEmail: student.email ?? null,
          studentPhone: student.phone ?? null,
          status: record.status,
          markedAt: record.markedAt,
          flags: record.flags,
          note: record.note,
          faceScore: record.faceScore ?? null,
          distanceM: record.distanceM ?? null,
          accuracyM: record.accuracyM ?? null,
          photoKey: record.photoKey ?? null,
          portraitKey:
            student.photoReleaseBasis === "auto" ||
            student.photoReleaseBasis === "approved"
              ? student.portraitKey
              : null,
          markedManually: record.markedManually,
        }),
      );
      return;
    }

    const [result] = await db
      .select({
        record: attendanceRecordsTable,
        studentName: attendanceRosterTable.fullName,
        indexNumber: attendanceRosterTable.indexNumber,
        studentEmail: attendanceRosterTable.email,
        studentPhone: attendanceRosterTable.phone,
        photoReleaseBasis: attendanceRosterTable.photoReleaseBasis,
        portraitKey: attendanceRosterTable.portraitKey,
        sessionOwnerId: attendanceClassesTable.ownerUserId,
        sessionStatus: attendanceSessionsTable.status,
      })
      .from(attendanceRecordsTable)
      .innerJoin(
        attendanceRosterTable,
        eq(attendanceRecordsTable.rosterStudentId, attendanceRosterTable.id),
      )
      .innerJoin(
        attendanceSessionsTable,
        eq(attendanceRecordsTable.sessionId, attendanceSessionsTable.id),
      )
      .innerJoin(
        attendanceClassesTable,
        eq(attendanceSessionsTable.classId, attendanceClassesTable.id),
      )
      .where(
        and(
          eq(attendanceRecordsTable.id, params.data.recordId),
          eq(attendanceClassesTable.ownerUserId, req.userId!),
        ),
      )
      .limit(1);
    if (!result) {
      res.status(404).json({ error: "Attendance record not found." });
      return;
    }
    if (result.sessionStatus === "finalized") {
      res.status(409).json({ error: "Finalized attendance cannot be changed." });
      return;
    }

    const [updated] = await db
      .update(attendanceRecordsTable)
      .set({
        status: parsed.data.status,
        note: parsed.data.note ?? result.record.note,
        reviewedBy: req.userId!,
        reviewedAt: new Date(),
      })
      .where(eq(attendanceRecordsTable.id, result.record.id))
      .returning();
    await writeAttendanceAudit(
      req.userId!,
      "attendance_record",
      result.record.id,
      "review_decision",
      {
        sessionId: result.record.sessionId,
        indexNumber: result.indexNumber,
        previousStatus: result.record.status,
        status: updated.status,
        note: updated.note,
      },
    );
    res.json(
      DecideAttendanceRecordResponse.parse({
        id: updated.id,
        sessionId: updated.sessionId,
        studentName: result.studentName,
        indexNumber: result.indexNumber,
        studentEmail: result.studentEmail ?? null,
        studentPhone: result.studentPhone ?? null,
        status: updated.status,
        markedAt: updated.markedAt,
        flags: updated.flags,
        note: updated.note,
        faceScore: updated.faceScore ?? null,
        distanceM: updated.distanceM ?? null,
        accuracyM: updated.accuracyM ?? null,
        photoKey: updated.photoKey ?? null,
        portraitKey:
          result.photoReleaseBasis === "auto" ||
          result.photoReleaseBasis === "approved"
            ? result.portraitKey
            : null,
        markedManually: updated.markedManually,
      }),
    );
  },
);

const BulkDecisionBody = z.object({
  recordIds: z.array(z.uuid()).min(1).max(1000),
  status: z.enum(["present", "absent"]),
  note: z.string().trim().max(500).optional(),
});

router.post(
  "/sessions/:sessionId/bulk-decision",
  async (req, res): Promise<void> => {
    const params = GetSessionParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const parsed = BulkDecisionBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const session = await findOwnedSession(params.data.sessionId, req.userId!);
    if (!session) {
      res.status(404).json({ error: "Session not found." });
      return;
    }
    if (session.status === "finalized") {
      res.status(409).json({ error: "Finalized attendance cannot be changed." });
      return;
    }

    const uniqueIds = [...new Set(parsed.data.recordIds)];
    const defaultNote =
      parsed.data.note ||
      (parsed.data.status === "present"
        ? "Bulk marked present by lecturer"
        : "Bulk marked absent by lecturer");
    let updatedCount = 0;

    if (!hasDatabaseConnection()) {
      const idSet = new Set(uniqueIds);
      const targets = memoryStore.records.filter(
        (r) => r.sessionId === session.id && idSet.has(r.id),
      );
      if (targets.length === 0) {
        res.status(404).json({ error: "No matching attendance records found in this session." });
        return;
      }
      const now = new Date();
      for (const record of targets) {
        record.status = parsed.data.status;
        record.note = defaultNote;
        record.reviewedBy = req.userId!;
        record.reviewedAt = now;
        if (!record.markedAt) {
          record.markedAt = now;
        }
      }
      updatedCount = targets.length;
    } else {
      const updated = await db
        .update(attendanceRecordsTable)
        .set({
          status: parsed.data.status,
          note: defaultNote,
          reviewedBy: req.userId!,
          reviewedAt: new Date(),
        })
        .where(
          and(
            eq(attendanceRecordsTable.sessionId, session.id),
            inArray(attendanceRecordsTable.id, uniqueIds),
          ),
        )
        .returning({ id: attendanceRecordsTable.id });

      if (updated.length === 0) {
        res.status(404).json({ error: "No matching attendance records found in this session." });
        return;
      }
      updatedCount = updated.length;
    }

    await writeAttendanceAudit(
      req.userId!,
      "session",
      session.id,
      "bulk_review_decision",
      {
        sessionId: session.id,
        status: parsed.data.status,
        count: updatedCount,
      },
    );

    res.json({
      updatedCount,
      records: await getSessionRecords(session.id),
    });
  },
);

router.get(
  "/sessions/:sessionId/activity",
  async (req, res): Promise<void> => {
    const params = GetSessionParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const session = await findOwnedSession(params.data.sessionId, req.userId!);
    if (!session) {
      res.status(404).json({ error: "Session not found." });
      return;
    }

    type RawRecord = {
      id: string;
      rosterStudentId: string;
      studentName: string;
      indexNumber: string;
      status: string;
      markedAt: Date | null;
      reviewedAt: Date | null;
      flags: string[];
      note: string | null;
      faceScore: string | null;
      distanceM: number | null;
      markedManually: boolean;
    };

    let rawRecords: RawRecord[] = [];
    if (!hasDatabaseConnection()) {
      const rosterById = new Map(memoryStore.roster.map((r) => [r.id, r]));
      rawRecords = memoryStore.records
        .filter((r) => r.sessionId === session.id)
        .map((r) => {
          const st = rosterById.get(r.rosterStudentId);
          return {
            id: r.id,
            rosterStudentId: r.rosterStudentId,
            studentName: st?.fullName ?? "Unknown Student",
            indexNumber: st?.indexNumber ?? "—",
            status: r.status,
            markedAt: r.markedAt,
            reviewedAt: r.reviewedAt,
            flags: r.flags,
            note: r.note,
            faceScore: r.faceScore ?? null,
            distanceM: r.distanceM ?? null,
            markedManually: r.markedManually,
          };
        });
    } else {
      const rows = await db
        .select({
          record: attendanceRecordsTable,
          studentName: attendanceRosterTable.fullName,
          indexNumber: attendanceRosterTable.indexNumber,
        })
        .from(attendanceRecordsTable)
        .innerJoin(
          attendanceRosterTable,
          eq(attendanceRecordsTable.rosterStudentId, attendanceRosterTable.id),
        )
        .where(eq(attendanceRecordsTable.sessionId, session.id));
      rawRecords = rows.map(({ record, studentName, indexNumber }) => ({
        id: record.id,
        rosterStudentId: record.rosterStudentId,
        studentName,
        indexNumber,
        status: record.status,
        markedAt: record.markedAt,
        reviewedAt: record.reviewedAt,
        flags: record.flags,
        note: record.note,
        faceScore: record.faceScore ?? null,
        distanceM: record.distanceM ?? null,
        markedManually: record.markedManually,
      }));
    }

    const recordById = new Map<string, RawRecord>();
    const studentByIndex = new Map<string, { studentName: string; indexNumber: string }>();
    for (const r of rawRecords) {
      recordById.set(r.id, r);
      studentByIndex.set(r.indexNumber.toUpperCase(), {
        studentName: r.studentName,
        indexNumber: r.indexNumber,
      });
    }
    const recordIds = rawRecords.map((r) => r.id);

    const sessionAudits = !hasDatabaseConnection()
      ? memoryStore.audits.filter((e) => {
          if (e.entityId === session.id) return true;
          if (recordIds.includes(e.entityId)) return true;
          const details = (e.details ?? {}) as Record<string, unknown>;
          return details.sessionId === session.id;
        })
      : await db
          .select()
          .from(attendanceAuditTable)
          .where(
            and(
              eq(attendanceAuditTable.actorUserId, req.userId!),
              recordIds.length > 0
                ? or(
                    eq(attendanceAuditTable.entityId, session.id),
                    inArray(attendanceAuditTable.entityId, recordIds),
                  )
                : eq(attendanceAuditTable.entityId, session.id),
            ),
          )
          .orderBy(desc(attendanceAuditTable.createdAt));

    interface ActivityItem {
      id: string;
      category: "checkin" | "manual_override" | "review" | "lifecycle";
      title: string;
      description: string;
      occurredAt: string;
      tone: "success" | "warning" | "danger" | "neutral";
      studentName: string | null;
      indexNumber: string | null;
      status: string | null;
      previousStatus: string | null;
      flags: string[];
      faceScore: string | null;
      distanceM: number | null;
    }

    const items: ActivityItem[] = [];
    const manualAuditRecordIds = new Set<string>();
    const reviewAuditRecordIds = new Set<string>();
    let hasSessionCreatedAudit = false;

    for (const ev of sessionAudits) {
      const details = (ev.details ?? {}) as Record<string, unknown>;
      const rec = recordById.get(ev.entityId);
      const indexFromDetails =
        typeof details.indexNumber === "string" ? details.indexNumber : null;
      const studentLookup = indexFromDetails
        ? studentByIndex.get(indexFromDetails.toUpperCase())
        : undefined;
      const studentName = rec?.studentName ?? studentLookup?.studentName ?? null;
      const indexNumber = rec?.indexNumber ?? indexFromDetails ?? null;

      if (ev.action === "session_created") {
        hasSessionCreatedAudit = true;
        items.push({
          id: `audit-${ev.id}`,
          category: "lifecycle",
          title: "Session created",
          description: `Scheduled at ${session.venue} (${session.codeMode} code · ${session.radiusM} m geofence)`,
          occurredAt: ev.createdAt.toISOString(),
          tone: "neutral",
          studentName: null,
          indexNumber: null,
          status: typeof details.status === "string" ? details.status : null,
          previousStatus: null,
          flags: [],
          faceScore: null,
          distanceM: null,
        });
      } else if (ev.action === "session_scheduled_email_sent") {
        const count = typeof details.recipientCount === "number" ? details.recipientCount : 0;
        items.push({
          id: `audit-${ev.id}`,
          category: "lifecycle",
          title: "Scheduled notice emailed",
          description: `Email notification queued for ${count} rostered student${count === 1 ? "" : "s"}.`,
          occurredAt: ev.createdAt.toISOString(),
          tone: "neutral",
          studentName: null,
          indexNumber: null,
          status: null,
          previousStatus: null,
          flags: [],
          faceScore: null,
          distanceM: null,
        });
      } else if (ev.action === "session_opened_push_sent") {
        const count = typeof details.recipientCount === "number" ? details.recipientCount : 0;
        items.push({
          id: `audit-${ev.id}`,
          category: "lifecycle",
          title: "Session open push sent",
          description: `Mobile push notification dispatched to ${count} rostered student${count === 1 ? "" : "s"}.`,
          occurredAt: ev.createdAt.toISOString(),
          tone: "success",
          studentName: null,
          indexNumber: null,
          status: null,
          previousStatus: null,
          flags: [],
          faceScore: null,
          distanceM: null,
        });
      } else if (ev.action === "session_opened") {
        items.push({
          id: `audit-${ev.id}`,
          category: "lifecycle",
          title: "Check-in opened",
          description: "Students can now verify and submit attendance for this session.",
          occurredAt: ev.createdAt.toISOString(),
          tone: "success",
          studentName: null,
          indexNumber: null,
          status: "open",
          previousStatus: "scheduled",
          flags: [],
          faceScore: null,
          distanceM: null,
        });
      } else if (ev.action === "session_extended") {
        const mins = typeof details.minutesAdded === "number" ? details.minutesAdded : 15;
        items.push({
          id: `audit-${ev.id}`,
          category: "lifecycle",
          title: `Window extended (+${mins}m)`,
          description: `Lecturer extended the check-in deadline by ${mins} minutes.`,
          occurredAt: ev.createdAt.toISOString(),
          tone: "neutral",
          studentName: null,
          indexNumber: null,
          status: null,
          previousStatus: null,
          flags: [],
          faceScore: null,
          distanceM: null,
        });
      } else if (ev.action === "session_closed") {
        items.push({
          id: `audit-${ev.id}`,
          category: "lifecycle",
          title: "Check-in closed",
          description: "Self check-in ended; roster ready for review and finalization.",
          occurredAt: ev.createdAt.toISOString(),
          tone: "neutral",
          studentName: null,
          indexNumber: null,
          status: "closed",
          previousStatus: "open",
          flags: [],
          faceScore: null,
          distanceM: null,
        });
      } else if (ev.action === "session_reopened") {
        const reason = typeof details.reason === "string" ? details.reason : "Reopened by lecturer";
        const prev = typeof details.previousStatus === "string" ? details.previousStatus : null;
        items.push({
          id: `audit-${ev.id}`,
          category: "lifecycle",
          title: "Session reopened",
          description: reason,
          occurredAt: ev.createdAt.toISOString(),
          tone: "warning",
          studentName: null,
          indexNumber: null,
          status: "open",
          previousStatus: prev,
          flags: [],
          faceScore: null,
          distanceM: null,
        });
      } else if (ev.action === "session_finalized") {
        const absencesAdded = typeof details.absencesAdded === "number" ? details.absencesAdded : 0;
        items.push({
          id: `audit-${ev.id}`,
          category: "lifecycle",
          title: "Session finalized",
          description:
            absencesAdded > 0
              ? `Attendance locked. ${absencesAdded} unmarked student${absencesAdded === 1 ? "" : "s"} recorded as absent.`
              : "Attendance record locked.",
          occurredAt: ev.createdAt.toISOString(),
          tone: "success",
          studentName: null,
          indexNumber: null,
          status: "finalized",
          previousStatus: "closed",
          flags: [],
          faceScore: null,
          distanceM: null,
        });
      } else if (ev.action === "manual_mark") {
        manualAuditRecordIds.add(ev.entityId);
        const status = typeof details.status === "string" ? details.status : rec?.status ?? "present";
        const reason = typeof details.reason === "string" ? details.reason : rec?.note ?? "Recorded manually by lecturer";
        items.push({
          id: `audit-${ev.id}`,
          category: "manual_override",
          title: `Manual mark · ${status.replace("_", " ")}`,
          description: reason,
          occurredAt: ev.createdAt.toISOString(),
          tone: status === "absent" ? "danger" : status === "excused" ? "neutral" : "success",
          studentName,
          indexNumber,
          status,
          previousStatus: null,
          flags: rec?.flags ?? ["MANUAL_MARK"],
          faceScore: null,
          distanceM: null,
        });
      } else if (ev.action === "review_decision") {
        reviewAuditRecordIds.add(ev.entityId);
        const status = typeof details.status === "string" ? details.status : rec?.status ?? "present";
        const previousStatus = typeof details.previousStatus === "string" ? details.previousStatus : null;
        const note = typeof details.note === "string" && details.note ? details.note : "Reviewed by lecturer";
        items.push({
          id: `audit-${ev.id}`,
          category: "review",
          title: `Review decision · ${status.replace("_", " ")}`,
          description: note,
          occurredAt: ev.createdAt.toISOString(),
          tone: status === "absent" ? "danger" : status === "needs_review" ? "warning" : "success",
          studentName,
          indexNumber,
          status,
          previousStatus,
          flags: rec?.flags ?? [],
          faceScore: rec?.faceScore ?? null,
          distanceM: rec?.distanceM ?? null,
        });
      } else if (ev.action === "bulk_review_decision") {
        const count = typeof details.count === "number" ? details.count : 0;
        const status = typeof details.status === "string" ? details.status : "present";
        items.push({
          id: `audit-${ev.id}`,
          category: "review",
          title: `Bulk update · ${count} marked ${status}`,
          description: `Lecturer updated ${count} selected student${count === 1 ? "" : "s"} to ${status}.`,
          occurredAt: ev.createdAt.toISOString(),
          tone: status === "absent" ? "warning" : "success",
          studentName: null,
          indexNumber: null,
          status,
          previousStatus: null,
          flags: [],
          faceScore: null,
          distanceM: null,
        });
      }
    }

    for (const r of rawRecords) {
      if (r.markedAt && !r.markedManually) {
        const flagged = r.status === "needs_review" || r.flags.length > 0;
        const metrics: string[] = [];
        if (r.faceScore !== null) metrics.push(`Face match ${Math.round(Number(r.faceScore) * 100)}%`);
        if (r.distanceM !== null) metrics.push(`${r.distanceM} m from pin`);
        const fallbackDesc = metrics.length > 0 ? metrics.join(" · ") : "Verified student check-in";
        items.push({
          id: `checkin-${r.id}`,
          category: "checkin",
          title: flagged ? "Check-in flagged for review" : "Student checked in",
          description: r.note ? `${r.note}${metrics.length ? ` (${metrics.join(" · ")})` : ""}` : fallbackDesc,
          occurredAt: r.markedAt.toISOString(),
          tone: r.status === "needs_review" ? "warning" : flagged ? "warning" : "success",
          studentName: r.studentName,
          indexNumber: r.indexNumber,
          status: r.status,
          previousStatus: null,
          flags: r.flags,
          faceScore: r.faceScore,
          distanceM: r.distanceM,
        });
      } else if (r.markedAt && r.markedManually && !manualAuditRecordIds.has(r.id)) {
        items.push({
          id: `manual-${r.id}`,
          category: "manual_override",
          title: `Manual mark · ${r.status.replace("_", " ")}`,
          description: r.note || "Recorded manually by lecturer",
          occurredAt: r.markedAt.toISOString(),
          tone: r.status === "absent" ? "danger" : r.status === "excused" ? "neutral" : "success",
          studentName: r.studentName,
          indexNumber: r.indexNumber,
          status: r.status,
          previousStatus: null,
          flags: r.flags.length > 0 ? r.flags : ["MANUAL_MARK"],
          faceScore: null,
          distanceM: null,
        });
      }

      if (r.reviewedAt && !r.markedManually && !reviewAuditRecordIds.has(r.id)) {
        items.push({
          id: `review-${r.id}`,
          category: "review",
          title: `Review decision · ${r.status.replace("_", " ")}`,
          description: r.note || "Reviewed by lecturer",
          occurredAt: r.reviewedAt.toISOString(),
          tone: r.status === "absent" ? "danger" : r.status === "needs_review" ? "warning" : "success",
          studentName: r.studentName,
          indexNumber: r.indexNumber,
          status: r.status,
          previousStatus: "needs_review",
          flags: r.flags,
          faceScore: r.faceScore,
          distanceM: r.distanceM,
        });
      }
    }

    if (!hasSessionCreatedAudit) {
      items.push({
        id: `session-created-${session.id}`,
        category: "lifecycle",
        title: "Session created",
        description: `Scheduled at ${session.venue} (${session.codeMode} code · ${session.radiusM} m geofence)`,
        occurredAt: session.createdAt.toISOString(),
        tone: "neutral",
        studentName: null,
        indexNumber: null,
        status: null,
        previousStatus: null,
        flags: [],
        faceScore: null,
        distanceM: null,
      });
    }

    items.sort(
      (a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime(),
    );

    res.json(items);
  },
);

router.get(
  "/sessions/:sessionId/export",
  async (req, res): Promise<void> => {
    const params = GetSessionParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const session = await findOwnedSession(params.data.sessionId, req.userId!);
    if (!session) {
      res.status(404).json({ error: "Session not found." });
      return;
    }
    const format = req.query.format === "csv" ? "csv" : "xlsx";
    const detail = await getSessionDetail(session);
    const classroom = await findOwnedClass(session.classId, req.userId!, true);
    const safeName = `${(classroom?.courseCode ?? "session").replace(/[^a-zA-Z0-9._-]/g, "-")}-session-${session.id.slice(0, 8)}`;

    const isLateRecord = (r: { status: string; markedAt: Date | string | null }) => {
      if (r.status !== "present" || !session.lateAfterMinutes || !r.markedAt) return false;
      const cutoffMs = session.startsAt.getTime() + session.lateAfterMinutes * 60_000;
      return new Date(r.markedAt).getTime() > cutoffMs;
    };
    const codeModeLabel =
      session.codeMode === "static" ? "static (lower security)" : "rotating (45s)";

    if (format === "csv") {
      const escapeCsv = (val: string) => `"${val.replaceAll('"', '""')}"`;
      const lines = [
        ["student_name", "index_number", "status", "marked_at", "flags", "note", "manual", "code_mode"].join(","),
        ...detail.records.map((r) =>
          [
            r.studentName,
            r.indexNumber,
            isLateRecord(r) ? "present (late)" : r.status,
            r.markedAt ? new Date(r.markedAt).toISOString() : "",
            r.flags.join("; "),
            r.note ?? "",
            r.markedManually ? "yes" : "no",
            codeModeLabel,
          ]
            .map(escapeCsv)
            .join(","),
        ),
      ].join("\n");
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${safeName}.csv"`);
      res.send(lines);
      return;
    }

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Session Attendance");
    sheet.addRow([`${classroom?.courseCode ?? ""} — ${classroom?.courseTitle ?? ""}`]);
    sheet.addRow([
      `Topic: ${session.topic}`,
      `Venue: ${session.venue}`,
      `Status: ${session.status}`,
      `Code Mode: ${codeModeLabel}`,
    ]);
    sheet.addRow([]);
    sheet.addRow(["Student Name", "Index Number", "Status", "Marked At", "Face Score", "Distance (m)", "Flags", "Note", "Manual"]);
    sheet.getRow(4).font = { bold: true };

    for (const r of detail.records) {
      sheet.addRow([
        r.studentName,
        r.indexNumber,
        isLateRecord(r) ? "present (late)" : r.status,
        r.markedAt ? new Date(r.markedAt).toISOString() : "—",
        r.faceScore ?? "—",
        r.distanceM ?? "—",
        r.flags.join(", "),
        r.note ?? "",
        r.markedManually ? "Yes" : "No",
      ]);
    }
    sheet.columns.forEach((col) => {
      col.width = 20;
    });

    const buffer = await workbook.xlsx.writeBuffer();
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader("Content-Disposition", `attachment; filename="${safeName}.xlsx"`);
    res.send(Buffer.from(buffer));
  },
);

export default router;
