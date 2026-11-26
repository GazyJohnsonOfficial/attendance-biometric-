import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, inArray, or } from "drizzle-orm";
import {
  attendanceAuditTable,
  attendanceClassesTable,
  attendanceRecordsTable,
  attendanceRosterTable,
  attendanceSessionsTable,
  db,
  type AttendanceClass,
  type AttendanceSession,
} from "@workspace/db";
import { hasDatabaseConnection, memoryStore } from "./attendanceStore";

export async function findOwnedClass(
  classId: string,
  ownerUserId: string,
  includeArchived = false,
): Promise<AttendanceClass | null> {
  if (!hasDatabaseConnection()) {
    return (
      memoryStore.classes.find(
        (c) =>
          c.id === classId &&
          c.ownerUserId === ownerUserId &&
          (includeArchived || c.archived === false),
      ) ?? null
    );
  }

  const conditions = [
    eq(attendanceClassesTable.id, classId),
    eq(attendanceClassesTable.ownerUserId, ownerUserId),
  ];
  if (!includeArchived) {
    conditions.push(eq(attendanceClassesTable.archived, false));
  }

  const [classroom] = await db
    .select()
    .from(attendanceClassesTable)
    .where(and(...conditions))
    .limit(1);

  return classroom ?? null;
}

export async function findOwnedSession(
  sessionId: string,
  ownerUserId: string,
): Promise<AttendanceSession | null> {
  if (!hasDatabaseConnection()) {
    const session = memoryStore.sessions.find((s) => s.id === sessionId);
    if (!session) return null;
    const classroom = memoryStore.classes.find(
      (c) => c.id === session.classId && c.ownerUserId === ownerUserId,
    );
    return classroom ? session : null;
  }

  const [result] = await db
    .select({ session: attendanceSessionsTable })
    .from(attendanceSessionsTable)
    .innerJoin(
      attendanceClassesTable,
      eq(attendanceSessionsTable.classId, attendanceClassesTable.id),
    )
    .where(
      and(
        eq(attendanceSessionsTable.id, sessionId),
        eq(attendanceClassesTable.ownerUserId, ownerUserId),
      ),
    )
    .limit(1);

  return result?.session ?? null;
}

export async function getClassItem(classroom: AttendanceClass) {
  let rosterRows: Array<{
    linkStatus: string;
    faceEnrolled: boolean;
    verificationStatus: string;
  }>;
  let sessions: AttendanceSession[];

  if (!hasDatabaseConnection()) {
    rosterRows = memoryStore.roster
      .filter((r) => r.classId === classroom.id)
      .map((r) => ({
        linkStatus: r.linkStatus,
        faceEnrolled: r.faceEnrolled,
        verificationStatus: r.verificationStatus,
      }));
    sessions = memoryStore.sessions
      .filter((s) => s.classId === classroom.id)
      .sort((a, b) => b.startsAt.getTime() - a.startsAt.getTime());
  } else {
    [rosterRows, sessions] = await Promise.all([
      db
        .select({
          linkStatus: attendanceRosterTable.linkStatus,
          faceEnrolled: attendanceRosterTable.faceEnrolled,
          verificationStatus: attendanceRosterTable.verificationStatus,
        })
        .from(attendanceRosterTable)
        .where(eq(attendanceRosterTable.classId, classroom.id)),
      db
        .select()
        .from(attendanceSessionsTable)
        .where(eq(attendanceSessionsTable.classId, classroom.id))
        .orderBy(desc(attendanceSessionsTable.startsAt)),
    ]);
  }

  const finalizedSessions = sessions.filter(
    (session) => session.status === "finalized",
  );
  const finalizedIds = finalizedSessions.map((session) => session.id);

  let finalizedRecords: Array<{ status: string }> = [];
  if (finalizedIds.length > 0) {
    if (!hasDatabaseConnection()) {
      finalizedRecords = memoryStore.records
        .filter(
          (r) =>
            finalizedIds.includes(r.sessionId) &&
            (r.status === "present" || r.status === "excused"),
        )
        .map((r) => ({ status: r.status }));
    } else {
      finalizedRecords = await db
        .select({ status: attendanceRecordsTable.status })
        .from(attendanceRecordsTable)
        .where(
          and(
            inArray(attendanceRecordsTable.sessionId, finalizedIds),
            or(
              eq(attendanceRecordsTable.status, "present"),
              eq(attendanceRecordsTable.status, "excused"),
            ),
          ),
        );
    }
  }

  const denominator = finalizedSessions.reduce(
    (total) => total + rosterRows.length,
    0,
  );

  return {
    id: classroom.id,
    department: classroom.department,
    programme: classroom.programme,
    level: classroom.level,
    courseCode: classroom.courseCode,
    courseTitle: classroom.courseTitle,
    semester: classroom.semester,
    academicYear: classroom.academicYear,
    archived: classroom.archived,
    rosterCount: rosterRows.length,
    registeredCount: rosterRows.filter(
      (row) => row.linkStatus === "matched" || row.linkStatus === "needs_approval",
    ).length,
    faceEnrolledCount: rosterRows.filter((row) => row.faceEnrolled).length,
    toConfirmCount: rosterRows.filter(
      (row) =>
        row.linkStatus === "matched" && row.verificationStatus === "unconfirmed",
    ).length,
    averageAttendance:
      denominator > 0
        ? Math.round((finalizedRecords.length / denominator) * 1000) / 10
        : 0,
    lastSessionAt: sessions[0]?.startsAt ?? null,
    createdAt: classroom.createdAt,
  };
}

export async function getRosterResponse(classId: string) {
  const rows = !hasDatabaseConnection()
    ? memoryStore.roster
        .filter((r) => r.classId === classId)
        .sort((a, b) => a.fullName.localeCompare(b.fullName))
    : await db
        .select()
        .from(attendanceRosterTable)
        .where(eq(attendanceRosterTable.classId, classId))
        .orderBy(asc(attendanceRosterTable.fullName));

  return {
    rows: rows.map((row) => {
      const canSeePortrait =
        row.photoReleaseBasis === "auto" || row.photoReleaseBasis === "approved";
      return {
        id: row.id,
        fullName: row.fullName,
        indexNumber: row.indexNumber,
        email: row.email,
        phone: row.phone,
        linkStatus: row.linkStatus,
        faceEnrolled: row.faceEnrolled,
        photoReleaseBasis: row.photoReleaseBasis,
        verificationStatus: row.verificationStatus,
        confirmedByCount: row.confirmedByCount,
        portraitKey: canSeePortrait ? row.portraitKey : null,
        disputeReason: row.disputeReason,
      };
    }),
    rosterCount: rows.length,
    registeredCount: rows.filter(
      (row) => row.linkStatus === "matched" || row.linkStatus === "needs_approval",
    ).length,
    faceEnrolledCount: rows.filter((row) => row.faceEnrolled).length,
  };
}

export async function getSessionItem(session: AttendanceSession) {
  let rosterRows: Array<{ id: string; linkStatus: string; faceEnrolled: boolean }>;
  let recordRows: Array<{ status: string }>;

  if (!hasDatabaseConnection()) {
    rosterRows = memoryStore.roster
      .filter((r) => r.classId === session.classId)
      .map((r) => ({
        id: r.id,
        linkStatus: r.linkStatus,
        faceEnrolled: r.faceEnrolled,
      }));
    recordRows = memoryStore.records
      .filter((r) => r.sessionId === session.id)
      .map((r) => ({ status: r.status }));
  } else {
    [rosterRows, recordRows] = await Promise.all([
      db
        .select({
          id: attendanceRosterTable.id,
          linkStatus: attendanceRosterTable.linkStatus,
          faceEnrolled: attendanceRosterTable.faceEnrolled,
        })
        .from(attendanceRosterTable)
        .where(eq(attendanceRosterTable.classId, session.classId)),
      db
        .select({ status: attendanceRecordsTable.status })
        .from(attendanceRecordsTable)
        .where(eq(attendanceRecordsTable.sessionId, session.id)),
    ]);
  }

  return {
    id: session.id,
    classId: session.classId,
    topic: session.topic,
    startsAt: session.startsAt,
    endsAt: session.endsAt,
    lateAfterMinutes: session.lateAfterMinutes ?? null,
    venue: session.venue,
    expectedStudents: session.expectedStudents,
    codeMode: session.codeMode,
    radiusM: session.radiusM,
    locationLat: session.locationLat ?? null,
    locationLng: session.locationLng ?? null,
    locationAccuracyM: session.locationAccuracyM ?? null,
    pinMoved: Boolean(session.pinMoved),
    locationSkipped: Boolean(session.locationSkipped),
    status: session.status,
    rosterCount: rosterRows.length,
    registeredCount: rosterRows.filter(
      (row) => row.linkStatus === "matched" || row.linkStatus === "needs_approval",
    ).length,
    faceEnrolledCount: rosterRows.filter((row) => row.faceEnrolled).length,
    checkedInCount: recordRows.filter(
      (record) =>
        record.status === "present" ||
        record.status === "needs_review" ||
        record.status === "excused",
    ).length,
    reviewCount: recordRows.filter((record) => record.status === "needs_review")
      .length,
    createdAt: session.createdAt,
  };
}

export async function getSessionRecords(sessionId: string) {
  if (!hasDatabaseConnection()) {
    const rosterById = new Map(memoryStore.roster.map((r) => [r.id, r]));
    return memoryStore.records
      .filter((r) => r.sessionId === sessionId)
      .map((record) => {
        const student = rosterById.get(record.rosterStudentId);
        const canSeePortrait =
          student &&
          (student.photoReleaseBasis === "auto" ||
            student.photoReleaseBasis === "approved");
        return {
          id: record.id,
          sessionId: record.sessionId,
          studentName: student?.fullName ?? "Unknown Student",
          indexNumber: student?.indexNumber ?? "—",
          studentEmail: student?.email ?? null,
          studentPhone: student?.phone ?? null,
          status: record.status,
          markedAt: record.markedAt,
          flags: record.flags,
          note: record.note,
          faceScore: record.faceScore ?? null,
          distanceM: record.distanceM ?? null,
          accuracyM: record.accuracyM ?? null,
          photoKey: record.photoKey ?? null,
          portraitKey: canSeePortrait ? student.portraitKey : null,
          markedManually: record.markedManually,
        };
      })
      .sort((a, b) => a.studentName.localeCompare(b.studentName));
  }

  const rows = await db
    .select({
      record: attendanceRecordsTable,
      studentName: attendanceRosterTable.fullName,
      indexNumber: attendanceRosterTable.indexNumber,
      studentEmail: attendanceRosterTable.email,
      studentPhone: attendanceRosterTable.phone,
      photoReleaseBasis: attendanceRosterTable.photoReleaseBasis,
      portraitKey: attendanceRosterTable.portraitKey,
    })
    .from(attendanceRecordsTable)
    .innerJoin(
      attendanceRosterTable,
      eq(attendanceRecordsTable.rosterStudentId, attendanceRosterTable.id),
    )
    .where(eq(attendanceRecordsTable.sessionId, sessionId))
    .orderBy(asc(attendanceRosterTable.fullName));

  return rows.map(
    ({
      record,
      studentName,
      indexNumber,
      studentEmail,
      studentPhone,
      photoReleaseBasis,
      portraitKey,
    }) => ({
      id: record.id,
      sessionId: record.sessionId,
      studentName,
      indexNumber,
      studentEmail: studentEmail ?? null,
      studentPhone: studentPhone ?? null,
      status: record.status,
      markedAt: record.markedAt,
      flags: record.flags,
      note: record.note,
      faceScore: record.faceScore ?? null,
      distanceM: record.distanceM ?? null,
      accuracyM: record.accuracyM ?? null,
      photoKey: record.photoKey ?? null,
      portraitKey:
        photoReleaseBasis === "auto" || photoReleaseBasis === "approved"
          ? portraitKey
          : null,
      markedManually: record.markedManually,
    }),
  );
}

export async function getSessionDetail(session: AttendanceSession) {
  const [sessionItem, records] = await Promise.all([
    getSessionItem(session),
    getSessionRecords(session.id),
  ]);

  return { session: sessionItem, records };
}

export async function writeAttendanceAudit(
  actorUserId: string,
  entityType: string,
  entityId: string,
  action: string,
  details: Record<string, unknown> = {},
): Promise<void> {
  if (!hasDatabaseConnection()) {
    memoryStore.audits.unshift({
      id: randomUUID(),
      actorUserId,
      entityType,
      entityId,
      action,
      details,
      createdAt: new Date(),
    });
    return;
  }

  await db.insert(attendanceAuditTable).values({
    actorUserId,
    entityType,
    entityId,
    action,
    details,
  });
}

export async function getClassSessions(classId: string) {
  const sessions = !hasDatabaseConnection()
    ? memoryStore.sessions
        .filter((s) => s.classId === classId)
        .sort((a, b) => b.startsAt.getTime() - a.startsAt.getTime())
    : await db
        .select()
        .from(attendanceSessionsTable)
        .where(eq(attendanceSessionsTable.classId, classId))
        .orderBy(desc(attendanceSessionsTable.startsAt));

  return Promise.all(sessions.map((session) => getSessionItem(session)));
}
