import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import ExcelJS from "exceljs";
import { Router, type IRouter } from "express";
import { z } from "zod";
import {
  CommitRosterBody,
  CommitRosterParams,
  CommitRosterResponse,
  CreateClassBody,
  CreateClassResponse,
  GetClassParams,
  GetClassResponse,
  GetClassRosterParams,
  GetClassRosterResponse,
  ListClassesResponse,
  PreviewRosterBody,
  PreviewRosterParams,
  PreviewRosterResponse,
  UpdateClassBody,
  UpdateClassParams,
  UpdateClassResponse,
} from "@workspace/api-zod";
import {
  attendanceClassesTable,
  attendanceRecordsTable,
  attendanceRosterTable,
  attendanceSessionsTable,
  db,
} from "@workspace/db";
import requireLecturer from "../../middlewares/requireLecturer";
import {
  findOwnedClass,
  getClassItem,
  getClassSessions,
  getRosterResponse,
  writeAttendanceAudit,
} from "../../lib/attendance";
import { hasDatabaseConnection, memoryStore } from "../../lib/attendanceStore";

const router: IRouter = Router();

router.use(requireLecturer);

const SingleStudentBody = z.object({
  fullName: z.string().trim().min(2).max(100),
  indexNumber: z
    .string()
    .trim()
    .min(2)
    .max(32)
    .regex(/^[A-Za-z0-9]+$/, "Index number must use letters and numbers only."),
  email: z.string().trim().email().max(254),
  phone: z.string().trim().max(32).nullish(),
});

const UpdateStudentBody = z.object({
  fullName: z.string().trim().min(2).max(100).optional(),
  email: z.string().trim().email().max(254).optional(),
  phone: z.string().trim().max(32).nullish(),
});

const StudentParams = z.object({
  classId: z.uuid(),
  indexNumber: z.string().trim().min(1).max(32),
});

const DisputeBody = z.object({
  reason: z.string().trim().min(3).max(500),
});

const CopyClassBody = z.object({
  semester: z.string().trim().min(1).max(80),
  academicYear: z.string().trim().min(1).max(30),
  includeRoster: z.boolean().optional().default(true),
});

router.get("/classes", async (req, res): Promise<void> => {
  const includeArchived = req.query.includeArchived === "true";
  const classrooms = !hasDatabaseConnection()
    ? memoryStore.classes
        .filter(
          (c) =>
            c.ownerUserId === req.userId! && (includeArchived || !c.archived),
        )
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    : await db
        .select()
        .from(attendanceClassesTable)
        .where(
          includeArchived
            ? eq(attendanceClassesTable.ownerUserId, req.userId!)
            : and(
                eq(attendanceClassesTable.ownerUserId, req.userId!),
                eq(attendanceClassesTable.archived, false),
              ),
        )
        .orderBy(desc(attendanceClassesTable.createdAt));

  const data = await Promise.all(classrooms.map((row) => getClassItem(row)));
  res.json(ListClassesResponse.parse(data));
});

router.post("/classes", async (req, res): Promise<void> => {
  const parsed = CreateClassBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  let classroom;
  if (!hasDatabaseConnection()) {
    const duplicate = memoryStore.classes.some(
      (c) =>
        c.ownerUserId === req.userId! &&
        c.courseCode.toLowerCase() === parsed.data.courseCode.trim().toLowerCase() &&
        c.semester.toLowerCase() === parsed.data.semester.trim().toLowerCase() &&
        c.academicYear.toLowerCase() === parsed.data.academicYear.trim().toLowerCase(),
    );
    if (duplicate) {
      res.status(409).json({
        error: "A class with this course, semester, and year already exists.",
      });
      return;
    }
    classroom = {
      id: randomUUID(),
      ownerUserId: req.userId!,
      department: parsed.data.department.trim(),
      programme: parsed.data.programme.trim(),
      level: parsed.data.level,
      courseCode: parsed.data.courseCode.trim(),
      courseTitle: parsed.data.courseTitle.trim(),
      semester: parsed.data.semester.trim(),
      academicYear: parsed.data.academicYear.trim(),
      archived: false,
      createdAt: new Date(),
    };
    memoryStore.classes.unshift(classroom);
    memoryStore.learnFromClass(classroom);
  } else {
    try {
      [classroom] = await db
        .insert(attendanceClassesTable)
        .values({
          ...parsed.data,
          ownerUserId: req.userId!,
        })
        .returning();
      memoryStore.learnFromClass(classroom);
    } catch (error) {
      if ((error as { code?: string }).code === "23505") {
        res.status(409).json({
          error: "A class with this course, semester, and year already exists.",
        });
        return;
      }
      throw error;
    }
  }

  await writeAttendanceAudit(
    req.userId!,
    "class",
    classroom.id,
    "class_created",
    { courseCode: classroom.courseCode, courseTitle: classroom.courseTitle },
  );

  res.status(201).json(
    CreateClassResponse.parse(await getClassItem(classroom)),
  );
});

router.get("/classes/:classId", async (req, res): Promise<void> => {
  const params = GetClassParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const classroom = await findOwnedClass(params.data.classId, req.userId!, true);
  if (!classroom) {
    res.status(404).json({ error: "Class not found." });
    return;
  }

  const [classItem, recentSessions] = await Promise.all([
    getClassItem(classroom),
    getClassSessions(classroom.id),
  ]);
  res.json(GetClassResponse.parse({ classroom: classItem, recentSessions }));
});

router.patch("/classes/:classId", async (req, res): Promise<void> => {
  const params = UpdateClassParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateClassBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const classroom = await findOwnedClass(params.data.classId, req.userId!, true);
  if (!classroom) {
    res.status(404).json({ error: "Class not found." });
    return;
  }
  if (Object.keys(parsed.data).length === 0) {
    res.status(400).json({ error: "Provide at least one class field to update." });
    return;
  }

  let updated;
  if (!hasDatabaseConnection()) {
    const nextCourseCode = (parsed.data.courseCode ?? classroom.courseCode).trim();
    const nextSemester = (parsed.data.semester ?? classroom.semester).trim();
    const nextAcademicYear = (parsed.data.academicYear ?? classroom.academicYear).trim();
    const duplicate = memoryStore.classes.some(
      (c) =>
        c.id !== classroom.id &&
        c.ownerUserId === req.userId! &&
        c.courseCode.toLowerCase() === nextCourseCode.toLowerCase() &&
        c.semester.toLowerCase() === nextSemester.toLowerCase() &&
        c.academicYear.toLowerCase() === nextAcademicYear.toLowerCase(),
    );
    if (duplicate) {
      res.status(409).json({
        error: "A class with this course, semester, and year already exists.",
      });
      return;
    }
    const target = memoryStore.classes.find((c) => c.id === classroom.id)!;
    Object.assign(target, parsed.data);
    updated = target;
  } else {
    try {
      [updated] = await db
        .update(attendanceClassesTable)
        .set(parsed.data)
        .where(eq(attendanceClassesTable.id, classroom.id))
        .returning();
    } catch (error) {
      if ((error as { code?: string }).code === "23505") {
        res.status(409).json({
          error: "A class with this course, semester, and year already exists.",
        });
        return;
      }
      throw error;
    }
  }

  await writeAttendanceAudit(
    req.userId!,
    "class",
    classroom.id,
    parsed.data.archived !== undefined ? "class_archived" : "class_updated",
    {
      courseCode: updated.courseCode,
      archived: updated.archived,
      fields: Object.keys(parsed.data),
    },
  );
  res.json(UpdateClassResponse.parse(await getClassItem(updated)));
});

router.post("/classes/:classId/copy", async (req, res): Promise<void> => {
  const params = GetClassParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = CopyClassBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? parsed.error.message });
    return;
  }

  const source = await findOwnedClass(params.data.classId, req.userId!, true);
  if (!source) {
    res.status(404).json({ error: "Source class not found." });
    return;
  }

  const nextSemester = parsed.data.semester.trim();
  const nextAcademicYear = parsed.data.academicYear.trim();
  let copied;
  let copiedRosterCount = 0;

  if (!hasDatabaseConnection()) {
    const duplicate = memoryStore.classes.some(
      (c) =>
        c.ownerUserId === req.userId! &&
        c.courseCode.toLowerCase() === source.courseCode.toLowerCase() &&
        c.semester.toLowerCase() === nextSemester.toLowerCase() &&
        c.academicYear.toLowerCase() === nextAcademicYear.toLowerCase(),
    );
    if (duplicate) {
      res.status(409).json({
        error: "A class with this course, semester, and academic year already exists.",
      });
      return;
    }

    copied = {
      id: randomUUID(),
      ownerUserId: req.userId!,
      department: source.department,
      programme: source.programme,
      level: source.level,
      courseCode: source.courseCode,
      courseTitle: source.courseTitle,
      semester: nextSemester,
      academicYear: nextAcademicYear,
      archived: false,
      createdAt: new Date(),
    };
    memoryStore.classes.unshift(copied);

    if (parsed.data.includeRoster) {
      const sourceRoster = memoryStore.roster.filter((r) => r.classId === source.id);
      for (const st of sourceRoster) {
        memoryStore.roster.push({
          ...st,
          id: randomUUID(),
          classId: copied.id,
          disputeReason: null,
          disputedAt: null,
          createdAt: new Date(),
        });
      }
      copiedRosterCount = sourceRoster.length;
    }
  } else {
    try {
      [copied] = await db
        .insert(attendanceClassesTable)
        .values({
          ownerUserId: req.userId!,
          department: source.department,
          programme: source.programme,
          level: source.level,
          courseCode: source.courseCode,
          courseTitle: source.courseTitle,
          semester: nextSemester,
          academicYear: nextAcademicYear,
          archived: false,
        })
        .returning();
    } catch (error) {
      if ((error as { code?: string }).code === "23505") {
        res.status(409).json({
          error: "A class with this course, semester, and academic year already exists.",
        });
        return;
      }
      throw error;
    }

    if (parsed.data.includeRoster) {
      const sourceRoster = await db
        .select()
        .from(attendanceRosterTable)
        .where(eq(attendanceRosterTable.classId, source.id));
      if (sourceRoster.length > 0) {
        await db.insert(attendanceRosterTable).values(
          sourceRoster.map((st) => ({
            classId: copied.id,
            fullName: st.fullName,
            indexNumber: st.indexNumber,
            email: st.email,
            phone: st.phone,
            linkStatus: st.linkStatus,
            faceEnrolled: st.faceEnrolled,
            photoReleaseBasis: st.photoReleaseBasis,
            verificationStatus: st.verificationStatus,
            confirmedByCount: st.confirmedByCount,
            portraitKey: st.portraitKey,
          })),
        );
        copiedRosterCount = sourceRoster.length;
      }
    }
  }

  await writeAttendanceAudit(
    req.userId!,
    "class",
    copied.id,
    "class_copied",
    {
      sourceClassId: source.id,
      courseCode: copied.courseCode,
      semester: copied.semester,
      academicYear: copied.academicYear,
      copiedRosterCount,
    },
  );

  res.status(201).json(CreateClassResponse.parse(await getClassItem(copied)));
});

router.get(
  "/classes/:classId/roster",
  async (req, res): Promise<void> => {
    const params = GetClassRosterParams.safeParse(req.params);
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
      GetClassRosterResponse.parse(await getRosterResponse(classroom.id)),
    );
  },
);

router.get(
  "/classes/:classId/roster/export",
  async (req, res): Promise<void> => {
    const params = GetClassParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const classroom = await findOwnedClass(params.data.classId, req.userId!, true);
    if (!classroom) {
      res.status(404).json({ error: "Class not found." });
      return;
    }

    const [rosterRows, sessions] = !hasDatabaseConnection()
      ? [
          memoryStore.roster
            .filter((r) => r.classId === classroom.id)
            .sort((a, b) => a.fullName.localeCompare(b.fullName)),
          memoryStore.sessions
            .filter((s) => s.classId === classroom.id)
            .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime()),
        ]
      : await Promise.all([
          db
            .select()
            .from(attendanceRosterTable)
            .where(eq(attendanceRosterTable.classId, classroom.id))
            .orderBy(asc(attendanceRosterTable.fullName)),
          db
            .select()
            .from(attendanceSessionsTable)
            .where(eq(attendanceSessionsTable.classId, classroom.id))
            .orderBy(asc(attendanceSessionsTable.startsAt)),
        ]);

    const sessionIds = sessions.map((s) => s.id);
    const records =
      sessionIds.length > 0
        ? !hasDatabaseConnection()
          ? memoryStore.records
              .filter((r) => sessionIds.includes(r.sessionId))
              .map((r) => ({
                sessionId: r.sessionId,
                rosterStudentId: r.rosterStudentId,
                status: r.status,
                markedAt: r.markedAt,
              }))
          : await db
              .select({
                sessionId: attendanceRecordsTable.sessionId,
                rosterStudentId: attendanceRecordsTable.rosterStudentId,
                status: attendanceRecordsTable.status,
                markedAt: attendanceRecordsTable.markedAt,
              })
              .from(attendanceRecordsTable)
              .where(inArray(attendanceRecordsTable.sessionId, sessionIds))
        : [];

    const recordMap = new Map<
      string,
      { status: string; markedAt: Date | null }
    >();
    for (const rec of records) {
      recordMap.set(`${rec.sessionId}:${rec.rosterStudentId}`, {
        status: rec.status,
        markedAt: rec.markedAt,
      });
    }

    const finalizedSessions = sessions.filter((s) => s.status === "finalized");
    const sessionHeaders = sessions.map((s) => {
      const dateStr = s.startsAt.toISOString().slice(0, 10);
      return `${dateStr} · ${s.topic} (${s.status})`;
    });

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Attendance Desk";
    workbook.created = new Date();

    const rosterSheet = workbook.addWorksheet("Roster & Attendance");
    rosterSheet.addRow([`${classroom.courseCode} — ${classroom.courseTitle}`]);
    rosterSheet.getRow(1).font = { bold: true, size: 13 };
    rosterSheet.addRow([
      `Department: ${classroom.department}`,
      `Programme: ${classroom.programme}`,
      `Level: ${classroom.level}`,
      `${classroom.semester} · ${classroom.academicYear}`,
    ]);
    rosterSheet.addRow([
      `Students on Roster: ${rosterRows.length}`,
      `Total Sessions: ${sessions.length}`,
      `Finalized Sessions: ${finalizedSessions.length}`,
      `Exported: ${new Date().toISOString()}`,
    ]);
    rosterSheet.addRow([]);

    const headers = [
      "Full Name",
      "Index Number",
      "Email",
      "Phone",
      "Account Link",
      "Face Profile",
      "Identity Verification",
      "Sessions Attended",
      "Total Finalized Sessions",
      "Attendance Rate (%)",
      "Below 75% Threshold",
      ...sessionHeaders,
    ];
    const headerRow = rosterSheet.addRow(headers);
    headerRow.font = { bold: true };
    headerRow.eachCell((cell) => {
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFF1F5F9" },
      };
      cell.border = {
        bottom: { style: "thin", color: { argb: "FFCBD5E1" } },
      };
    });

    const formatCellStatus = (
      session: (typeof sessions)[number],
      rec?: { status: string; markedAt: Date | null },
    ): string => {
      if (!rec) {
        return session.status === "finalized" ? "absent" : "unmarked";
      }
      if (
        rec.status === "present" &&
        session.lateAfterMinutes != null &&
        rec.markedAt != null &&
        rec.markedAt.getTime() >
          session.startsAt.getTime() + session.lateAfterMinutes * 60_000
      ) {
        return "present (late)";
      }
      return rec.status;
    };

    for (const student of rosterRows) {
      let attendedFinalized = 0;
      for (const fs of finalizedSessions) {
        const rec = recordMap.get(`${fs.id}:${student.id}`);
        if (rec && (rec.status === "present" || rec.status === "excused")) {
          attendedFinalized += 1;
        }
      }
      const totalFinalized = finalizedSessions.length;
      const ratePct =
        totalFinalized > 0
          ? Math.round((attendedFinalized / totalFinalized) * 100)
          : 0;
      const below75 =
        totalFinalized > 0 ? (ratePct < 75 ? "Yes" : "No") : "—";

      const perSessionStatuses = sessions.map((s) =>
        formatCellStatus(s, recordMap.get(`${s.id}:${student.id}`)),
      );

      rosterSheet.addRow([
        student.fullName,
        student.indexNumber,
        student.email,
        student.phone ?? "—",
        student.linkStatus.replace("_", " "),
        student.faceEnrolled ? "Enrolled" : "Pending",
        student.verificationStatus,
        attendedFinalized,
        totalFinalized,
        totalFinalized > 0 ? ratePct : "—",
        below75,
        ...perSessionStatuses,
      ]);
    }

    rosterSheet.columns.forEach((col, idx) => {
      const headerText = headers[idx] ?? "";
      let maxLength = headerText.length;
      col.eachCell?.({ includeEmpty: false }, (cell, rowNum) => {
        if (rowNum <= 3) return;
        const len = String(cell.value ?? "").length;
        if (len > maxLength) maxLength = len;
      });
      col.width = Math.min(Math.max(maxLength + 3, 14), 38);
    });

    const sessionsSheet = workbook.addWorksheet("Sessions");
    const sessionSummaryHeaders = [
      "Date",
      "Topic",
      "Venue",
      "Status",
      "Code Mode",
      "Late Cut-Off (min)",
      "Starts At (UTC)",
      "Ends At (UTC)",
    ];
    const sHeaderRow = sessionsSheet.addRow(sessionSummaryHeaders);
    sHeaderRow.font = { bold: true };
    for (const s of sessions) {
      sessionsSheet.addRow([
        s.startsAt.toISOString().slice(0, 10),
        s.topic,
        s.venue,
        s.status,
        s.codeMode === "static" ? "static (lower security)" : "rotating (45s)",
        s.lateAfterMinutes ?? "—",
        s.startsAt.toISOString(),
        s.endsAt.toISOString(),
      ]);
    }
    sessionsSheet.columns.forEach((col) => {
      col.width = 24;
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const safeName = `${classroom.courseCode.toLowerCase().replace(/[^a-z0-9_-]+/g, "-")}-roster-attendance`;
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

router.post(
  "/classes/:classId/roster/preview",
  async (req, res): Promise<void> => {
    const params = PreviewRosterParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const parsed = PreviewRosterBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const classroom = await findOwnedClass(params.data.classId, req.userId!);
    if (!classroom) {
      res.status(404).json({ error: "Class not found." });
      return;
    }

    const existingRoster = !hasDatabaseConnection()
      ? memoryStore.roster.filter((r) => r.classId === classroom.id)
      : await db
          .select({
            indexNumber: attendanceRosterTable.indexNumber,
            fullName: attendanceRosterTable.fullName,
            email: attendanceRosterTable.email,
            linkStatus: attendanceRosterTable.linkStatus,
          })
          .from(attendanceRosterTable)
          .where(eq(attendanceRosterTable.classId, classroom.id));

    res.json(
      PreviewRosterResponse.parse(
        buildRosterPreview(parsed.data.rows, existingRoster),
      ),
    );
  },
);

router.post(
  "/classes/:classId/roster/commit",
  async (req, res): Promise<void> => {
    const params = CommitRosterParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const parsed = CommitRosterBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const classroom = await findOwnedClass(params.data.classId, req.userId!);
    if (!classroom) {
      res.status(404).json({ error: "Class not found." });
      return;
    }

    const preview = buildRosterPreview(parsed.data.rows);
    const invalidRows = preview.rows.filter(
      (row) => row.status === "error" || row.status === "conflict",
    );
    if (invalidRows.length > 0) {
      res.status(400).json({
        error: "Fix roster errors and duplicate index numbers before saving.",
        rows: invalidRows,
      });
      return;
    }

    const rows = parsed.data.rows.map((row) => ({
      classId: classroom.id,
      fullName: row.fullName.trim(),
      indexNumber: row.indexNumber.trim().toUpperCase(),
      email: row.email.trim().toLowerCase(),
      phone: normalizePhone(row.phone).value,
      linkStatus: "invited" as const,
      faceEnrolled: false,
      photoReleaseBasis: "none" as const,
      verificationStatus: "unconfirmed" as const,
      confirmedByCount: 0,
      portraitKey: null,
      disputeReason: null,
      disputedAt: null,
    }));

    if (rows.length > 0) {
      if (!hasDatabaseConnection()) {
        for (const row of rows) {
          const existing = memoryStore.roster.find(
            (r) => r.classId === row.classId && r.indexNumber === row.indexNumber,
          );
          if (existing) {
            const emailChanged = existing.email !== row.email;
            existing.fullName = row.fullName;
            existing.email = row.email;
            existing.phone = row.phone;
            if (emailChanged) {
              existing.linkStatus = "needs_approval";
              existing.photoReleaseBasis = "pending";
              existing.portraitKey = null;
            }
          } else {
            const isMatchedDemoEmail =
              row.email.endsWith("@school.edu.gh") &&
              row.indexNumber.startsWith("523");
            memoryStore.roster.push({
              id: randomUUID(),
              ...row,
              linkStatus: isMatchedDemoEmail ? "matched" : "invited",
              faceEnrolled: isMatchedDemoEmail,
              photoReleaseBasis: isMatchedDemoEmail ? "auto" : "none",
              portraitKey: isMatchedDemoEmail ? "kofi-portrait" : null,
              createdAt: new Date(),
            });
          }
        }
      } else {
        await db
          .insert(attendanceRosterTable)
          .values(rows)
          .onConflictDoUpdate({
            target: [
              attendanceRosterTable.classId,
              attendanceRosterTable.indexNumber,
            ],
            set: {
              fullName: sql`excluded.full_name`,
              email: sql`excluded.email`,
              phone: sql`excluded.phone`,
              linkStatus: sql`case
                when ${attendanceRosterTable.email} <> excluded.email then 'invited'
                else ${attendanceRosterTable.linkStatus}
              end`,
            },
          });
      }
    }

    await writeAttendanceAudit(
      req.userId!,
      "class",
      classroom.id,
      "roster_committed",
      { rowCount: rows.length, courseCode: classroom.courseCode },
    );

    const rosterResp = await getRosterResponse(classroom.id);
    const committedSet = new Set(rows.map((r) => r.indexNumber));
    const committedInvitedCount = rosterResp.rows.filter(
      (r) => committedSet.has(r.indexNumber) && r.linkStatus === "invited",
    ).length;
    if (committedInvitedCount > 0) {
      await writeAttendanceAudit(
        req.userId!,
        "roster",
        classroom.id,
        "student_invite_email_sent",
        {
          courseCode: classroom.courseCode,
          recipientCount: committedInvitedCount,
          template: memoryStore.adminSettings.emailTemplateInvite,
        },
      );
      memoryStore.addSystemLog({
        level: "info",
        category: "notifications",
        message: `Roster invitation emails queued for ${committedInvitedCount} student(s) in ${classroom.courseCode}`,
        details: { classId: classroom.id, courseCode: classroom.courseCode, recipientCount: committedInvitedCount },
      });
    }
    if (rows.length >= 4 && committedInvitedCount / rows.length > 0.6) {
      await writeAttendanceAudit(
        req.userId!,
        "class",
        classroom.id,
        "roster_high_unmatched_alert",
        {
          courseCode: classroom.courseCode,
          unmatchedCount: committedInvitedCount,
          totalCount: rows.length,
        },
      );
    }

    res.json(CommitRosterResponse.parse(rosterResp));
  },
);

router.post(
  "/classes/:classId/students",
  async (req, res): Promise<void> => {
    const params = GetClassParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const parsed = SingleStudentBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const classroom = await findOwnedClass(params.data.classId, req.userId!);
    if (!classroom) {
      res.status(404).json({ error: "Class not found." });
      return;
    }

    const indexNumber = parsed.data.indexNumber.toUpperCase();
    const email = parsed.data.email.toLowerCase();
    const phone = normalizePhone(parsed.data.phone).value;

    if (!hasDatabaseConnection()) {
      const exists = memoryStore.roster.some(
        (r) => r.classId === classroom.id && r.indexNumber === indexNumber,
      );
      if (exists) {
        res.status(409).json({
          error: `Index number ${indexNumber} is already on this class roster.`,
        });
        return;
      }
      memoryStore.roster.push({
        id: randomUUID(),
        classId: classroom.id,
        fullName: parsed.data.fullName,
        indexNumber,
        email,
        phone,
        linkStatus: "invited",
        faceEnrolled: false,
        photoReleaseBasis: "none",
        verificationStatus: "unconfirmed",
        confirmedByCount: 0,
        portraitKey: null,
        disputeReason: null,
        disputedAt: null,
        createdAt: new Date(),
      });
    } else {
      try {
        await db.insert(attendanceRosterTable).values({
          classId: classroom.id,
          fullName: parsed.data.fullName,
          indexNumber,
          email,
          phone,
          linkStatus: "invited",
          faceEnrolled: false,
          photoReleaseBasis: "none",
          verificationStatus: "unconfirmed",
          confirmedByCount: 0,
        });
      } catch (error) {
        if ((error as { code?: string }).code === "23505") {
          res.status(409).json({
            error: `Index number ${indexNumber} is already on this class roster.`,
          });
          return;
        }
        throw error;
      }
    }

    await writeAttendanceAudit(
      req.userId!,
      "roster",
      classroom.id,
      "student_added",
      { indexNumber, fullName: parsed.data.fullName, courseCode: classroom.courseCode },
    );
    await writeAttendanceAudit(
      req.userId!,
      "roster",
      classroom.id,
      "student_invite_email_sent",
      {
        courseCode: classroom.courseCode,
        indexNumber,
        recipientCount: 1,
        email,
        template: memoryStore.adminSettings.emailTemplateInvite,
      },
    );
    memoryStore.addSystemLog({
      level: "info",
      category: "notifications",
      message: `Invitation email sent to ${email} for ${classroom.courseCode}`,
      details: { classId: classroom.id, indexNumber, email },
    });
    res.status(201).json(
      GetClassRosterResponse.parse(await getRosterResponse(classroom.id)),
    );
  },
);

router.patch(
  "/classes/:classId/students/:indexNumber",
  async (req, res): Promise<void> => {
    const params = StudentParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const parsed = UpdateStudentBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const classroom = await findOwnedClass(params.data.classId, req.userId!);
    if (!classroom) {
      res.status(404).json({ error: "Class not found." });
      return;
    }
    const indexNumber = params.data.indexNumber.toUpperCase();

    if (!hasDatabaseConnection()) {
      const student = memoryStore.roster.find(
        (r) => r.classId === classroom.id && r.indexNumber === indexNumber,
      );
      if (!student) {
        res.status(404).json({ error: "Student not found on this roster." });
        return;
      }
      if (parsed.data.fullName !== undefined) {
        student.fullName = parsed.data.fullName;
      }
      if (parsed.data.phone !== undefined) {
        student.phone = normalizePhone(parsed.data.phone).value;
      }
      if (parsed.data.email !== undefined) {
        const nextEmail = parsed.data.email.toLowerCase();
        if (nextEmail !== student.email) {
          student.email = nextEmail;
          if (student.faceEnrolled) {
            student.linkStatus = "needs_approval";
            student.photoReleaseBasis = "pending";
            student.portraitKey = null;
          } else {
            student.linkStatus = "invited";
            student.photoReleaseBasis = "none";
          }
        }
      }
    } else {
      const [student] = await db
        .select()
        .from(attendanceRosterTable)
        .where(
          and(
            eq(attendanceRosterTable.classId, classroom.id),
            eq(attendanceRosterTable.indexNumber, indexNumber),
          ),
        )
        .limit(1);
      if (!student) {
        res.status(404).json({ error: "Student not found on this roster." });
        return;
      }
      const nextEmail = parsed.data.email?.toLowerCase() ?? student.email;
      const emailChanged = nextEmail !== student.email;
      await db
        .update(attendanceRosterTable)
        .set({
          fullName: parsed.data.fullName ?? student.fullName,
          email: nextEmail,
          phone:
            parsed.data.phone !== undefined
              ? normalizePhone(parsed.data.phone).value
              : student.phone,
          ...(emailChanged
            ? {
                linkStatus: student.faceEnrolled ? "needs_approval" : "invited",
                photoReleaseBasis: student.faceEnrolled ? "pending" : "none",
              }
            : {}),
        })
        .where(eq(attendanceRosterTable.id, student.id));
    }

    await writeAttendanceAudit(
      req.userId!,
      "roster",
      classroom.id,
      "student_updated",
      { indexNumber, courseCode: classroom.courseCode },
    );
    res.json(GetClassRosterResponse.parse(await getRosterResponse(classroom.id)));
  },
);

router.delete(
  "/classes/:classId/students/:indexNumber",
  async (req, res): Promise<void> => {
    const params = StudentParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const classroom = await findOwnedClass(params.data.classId, req.userId!);
    if (!classroom) {
      res.status(404).json({ error: "Class not found." });
      return;
    }
    const indexNumber = params.data.indexNumber.toUpperCase();

    if (!hasDatabaseConnection()) {
      const idx = memoryStore.roster.findIndex(
        (r) => r.classId === classroom.id && r.indexNumber === indexNumber,
      );
      if (idx === -1) {
        res.status(404).json({ error: "Student not found on this roster." });
        return;
      }
      memoryStore.roster.splice(idx, 1);
    } else {
      const deleted = await db
        .delete(attendanceRosterTable)
        .where(
          and(
            eq(attendanceRosterTable.classId, classroom.id),
            eq(attendanceRosterTable.indexNumber, indexNumber),
          ),
        )
        .returning();
      if (deleted.length === 0) {
        res.status(404).json({ error: "Student not found on this roster." });
        return;
      }
    }

    await writeAttendanceAudit(
      req.userId!,
      "roster",
      classroom.id,
      "student_removed",
      { indexNumber, courseCode: classroom.courseCode },
    );
    res.json(GetClassRosterResponse.parse(await getRosterResponse(classroom.id)));
  },
);

router.get(
  "/classes/:classId/identity",
  async (req, res): Promise<void> => {
    const params = GetClassParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const classroom = await findOwnedClass(params.data.classId, req.userId!);
    if (!classroom) {
      res.status(404).json({ error: "Class not found." });
      return;
    }
    const roster = await getRosterResponse(classroom.id);
    const releasedCount = roster.rows.filter(
      (r) => r.photoReleaseBasis === "auto" || r.photoReleaseBasis === "approved",
    ).length;

    await writeAttendanceAudit(
      req.userId!,
      "photo_release",
      classroom.id,
      "photo_view_logged",
      { courseCode: classroom.courseCode, releasedCount },
    );

    res.json(GetClassRosterResponse.parse(roster));
  },
);

router.post(
  "/classes/:classId/students/:indexNumber/confirm",
  async (req, res): Promise<void> => {
    const params = StudentParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const classroom = await findOwnedClass(params.data.classId, req.userId!);
    if (!classroom) {
      res.status(404).json({ error: "Class not found." });
      return;
    }
    const indexNumber = params.data.indexNumber.toUpperCase();

    if (!hasDatabaseConnection()) {
      const student = memoryStore.roster.find(
        (r) => r.classId === classroom.id && r.indexNumber === indexNumber,
      );
      if (!student) {
        res.status(404).json({ error: "Student not found on this roster." });
        return;
      }
      if (
        student.photoReleaseBasis !== "auto" &&
        student.photoReleaseBasis !== "approved"
      ) {
        res.status(409).json({
          error: "Registration photo has not been released for this student yet.",
        });
        return;
      }
      if (student.verificationStatus !== "confirmed") {
        student.confirmedByCount += 1;
      }
      student.verificationStatus = "confirmed";
      student.disputeReason = null;
      student.disputedAt = null;
    } else {
      const [student] = await db
        .select()
        .from(attendanceRosterTable)
        .where(
          and(
            eq(attendanceRosterTable.classId, classroom.id),
            eq(attendanceRosterTable.indexNumber, indexNumber),
          ),
        )
        .limit(1);
      if (!student) {
        res.status(404).json({ error: "Student not found on this roster." });
        return;
      }
      if (
        student.photoReleaseBasis !== "auto" &&
        student.photoReleaseBasis !== "approved"
      ) {
        res.status(409).json({
          error: "Registration photo has not been released for this student yet.",
        });
        return;
      }
      await db
        .update(attendanceRosterTable)
        .set({
          verificationStatus: "confirmed",
          confirmedByCount:
            student.verificationStatus === "confirmed"
              ? student.confirmedByCount
              : student.confirmedByCount + 1,
          disputeReason: null,
          disputedAt: null,
        })
        .where(eq(attendanceRosterTable.id, student.id));
    }

    await writeAttendanceAudit(
      req.userId!,
      "identity",
      classroom.id,
      "photo_confirmed",
      { indexNumber, courseCode: classroom.courseCode },
    );
    res.json(GetClassRosterResponse.parse(await getRosterResponse(classroom.id)));
  },
);

router.post(
  "/classes/:classId/students/:indexNumber/dispute",
  async (req, res): Promise<void> => {
    const params = StudentParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const parsed = DisputeBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Provide a clear reason for disputing this photo." });
      return;
    }
    const classroom = await findOwnedClass(params.data.classId, req.userId!);
    if (!classroom) {
      res.status(404).json({ error: "Class not found." });
      return;
    }
    const indexNumber = params.data.indexNumber.toUpperCase();

    let disputedStudentName = indexNumber;
    let disputedPortraitKey: string | null = null;

    if (!hasDatabaseConnection()) {
      const student = memoryStore.roster.find(
        (r) => r.classId === classroom.id && r.indexNumber === indexNumber,
      );
      if (!student) {
        res.status(404).json({ error: "Student not found on this roster." });
        return;
      }
      student.verificationStatus = "disputed";
      student.disputeReason = parsed.data.reason;
      student.disputedAt = new Date();
      disputedStudentName = student.fullName;
      disputedPortraitKey = student.portraitKey;
    } else {
      const [student] = await db
        .select()
        .from(attendanceRosterTable)
        .where(
          and(
            eq(attendanceRosterTable.classId, classroom.id),
            eq(attendanceRosterTable.indexNumber, indexNumber),
          ),
        )
        .limit(1);
      if (!student) {
        res.status(404).json({ error: "Student not found on this roster." });
        return;
      }
      await db
        .update(attendanceRosterTable)
        .set({
          verificationStatus: "disputed",
          disputeReason: parsed.data.reason,
          disputedAt: new Date(),
        })
        .where(eq(attendanceRosterTable.id, student.id));
      disputedStudentName = student.fullName;
      disputedPortraitKey = student.portraitKey;
    }

    const existingDispute = memoryStore.disputes.find(
      (d) =>
        d.classId === classroom.id &&
        d.studentIndex.toUpperCase() === indexNumber &&
        d.status === "open",
    );
    if (existingDispute) {
      existingDispute.claimReason = parsed.data.reason;
      existingDispute.accountLocked = true;
    } else {
      memoryStore.disputes.unshift({
        id: randomUUID(),
        caseType: "lecturer_dispute",
        classId: classroom.id,
        courseCode: classroom.courseCode,
        department: classroom.department,
        studentIndex: indexNumber,
        studentName: disputedStudentName,
        claimReason: parsed.data.reason,
        status: "open",
        registrationPhotoKey: disputedPortraitKey ?? "kofi-portrait",
        checkinPhotoKey: "",
        photoViewsCount: 0,
        accountLocked: true,
        createdAt: new Date(),
        resolvedAt: null,
      });
    }

    memoryStore.addSystemLog({
      level: "warn",
      category: "dispute",
      message: `Lecturer disputed identity photo for ${disputedStudentName} (${indexNumber}) in ${classroom.courseCode}`,
      details: { classId: classroom.id, indexNumber, reason: parsed.data.reason },
    });

    await writeAttendanceAudit(
      req.userId!,
      "identity_dispute",
      classroom.id,
      "photo_disputed",
      {
        indexNumber,
        courseCode: classroom.courseCode,
        reason: parsed.data.reason,
      },
    );
    res.json(GetClassRosterResponse.parse(await getRosterResponse(classroom.id)));
  },
);

export default router;

function normalizePhone(raw?: string | null): {
  value: string | null;
  unnormalizable: boolean;
} {
  const trimmed = raw?.trim() ?? "";
  if (!trimmed) return { value: null, unnormalizable: false };
  const compact = trimmed.replace(/[\s\-().]/g, "");
  if (/^0\d{9}$/.test(compact)) {
    return { value: `+233${compact.slice(1)}`, unnormalizable: false };
  }
  if (/^233\d{9}$/.test(compact)) {
    return { value: `+${compact}`, unnormalizable: false };
  }
  if (/^\+[1-9]\d{7,14}$/.test(compact)) {
    return { value: compact, unnormalizable: false };
  }
  return { value: trimmed, unnormalizable: true };
}

function buildRosterPreview(
  inputRows: Array<{
    fullName: string;
    indexNumber: string;
    email: string;
    phone?: string | null;
  }>,
  existingRoster: Array<{
    indexNumber: string;
    fullName: string;
    email: string;
    linkStatus?: string;
  }> = [],
) {
  const existingByIndex = new Map(
    existingRoster.map((r) => [r.indexNumber.trim().toUpperCase(), r]),
  );

  const normalized = inputRows.map((row) => {
    const phoneResult = normalizePhone(row.phone);
    return {
      fullName: row.fullName.trim(),
      indexNumber: row.indexNumber.trim().toUpperCase(),
      email: row.email.trim().toLowerCase(),
      phone: phoneResult.value,
      phoneWarning: phoneResult.unnormalizable,
    };
  });
  const indexes = new Map<string, number[]>();

  normalized.forEach((row, index) => {
    indexes.set(row.indexNumber, [...(indexes.get(row.indexNumber) ?? []), index]);
  });

  const rows = normalized.map((row) => {
    const issues: string[] = [];
    const warnings: string[] = [];
    if (row.fullName.length < 2 || row.fullName.length > 100) {
      issues.push("Student name must be between 2 and 100 characters.");
    }
    if (row.indexNumber.length > 32 || !/^[A-Z0-9]+$/.test(row.indexNumber)) {
      issues.push("Index number must use up to 32 letters and numbers.");
    }
    if (
      row.email.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)
    ) {
      issues.push("Enter a valid email address.");
    }

    if (row.phoneWarning) {
      warnings.push("Phone number could not be normalized to +233 format.");
    }
    const matchedExisting = existingByIndex.get(row.indexNumber);
    if (
      matchedExisting &&
      matchedExisting.fullName.trim().toLowerCase() !== row.fullName.toLowerCase()
    ) {
      warnings.push(`Name differs from current roster (${matchedExisting.fullName}).`);
    }

    const duplicateIndexes = indexes.get(row.indexNumber) ?? [];
    let status: "ready" | "error" | "conflict" = "ready";
    if (issues.length > 0) {
      status = "error";
    } else if (duplicateIndexes.length > 1) {
      const duplicateEmails = new Set(
        duplicateIndexes.map((index) => normalized[index]?.email),
      );
      if (duplicateEmails.size > 1) {
        status = "conflict";
        issues.push("This index number appears with different email addresses.");
      } else {
        status = "error";
        issues.push("This index number appears more than once.");
      }
    }

    let linkStatus: "matched" | "needs_approval" | "invited" | "conflict" = "invited";
    if (status === "conflict") {
      linkStatus = "conflict";
    } else if (matchedExisting) {
      if (matchedExisting.email.trim().toLowerCase() !== row.email) {
        linkStatus = "needs_approval";
        warnings.push("Email differs from current roster — requires student approval.");
      } else if (
        matchedExisting.linkStatus === "matched" ||
        matchedExisting.linkStatus === "needs_approval"
      ) {
        linkStatus = matchedExisting.linkStatus;
      } else if (row.email.endsWith("@school.edu.gh") && row.indexNumber.startsWith("523")) {
        linkStatus = "matched";
      }
    } else if (row.email.endsWith("@school.edu.gh") && row.indexNumber.startsWith("523")) {
      linkStatus = "matched";
    }

    return {
      fullName: row.fullName,
      indexNumber: row.indexNumber,
      email: row.email,
      phone: row.phone,
      status,
      linkStatus,
      issues,
      warnings,
    };
  });

  return {
    totalRows: rows.length,
    validRows: rows.filter((row) => row.status === "ready").length,
    errorRows: rows.filter((row) => row.status === "error").length,
    conflictRows: rows.filter((row) => row.status === "conflict").length,
    rows,
  };
}
