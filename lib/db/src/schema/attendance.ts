import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const attendanceClassesTable = pgTable(
  "attendance_classes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ownerUserId: text("owner_user_id").notNull(),
    department: text("department").notNull(),
    programme: text("programme").notNull(),
    level: integer("level").notNull(),
    courseCode: text("course_code").notNull(),
    courseTitle: text("course_title").notNull(),
    semester: text("semester").notNull(),
    academicYear: text("academic_year").notNull(),
    archived: boolean("archived").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("attendance_classes_owner_created_idx").on(
      table.ownerUserId,
      table.createdAt,
    ),
    uniqueIndex("attendance_classes_owner_course_term_unique").on(
      table.ownerUserId,
      table.courseCode,
      table.semester,
      table.academicYear,
    ),
  ],
);

export const attendanceRosterTable = pgTable(
  "attendance_roster",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    classId: uuid("class_id")
      .notNull()
      .references(() => attendanceClassesTable.id, { onDelete: "cascade" }),
    fullName: text("full_name").notNull(),
    indexNumber: text("index_number").notNull(),
    email: text("email").notNull(),
    phone: text("phone"),
    linkStatus: text("link_status").notNull().default("invited"),
    faceEnrolled: boolean("face_enrolled").notNull().default(false),
    photoReleaseBasis: text("photo_release_basis").notNull().default("none"),
    verificationStatus: text("verification_status")
      .notNull()
      .default("unconfirmed"),
    confirmedByCount: integer("confirmed_by_count").notNull().default(0),
    portraitKey: text("portrait_key"),
    disputeReason: text("dispute_reason"),
    disputedAt: timestamp("disputed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("attendance_roster_class_index_unique").on(
      table.classId,
      table.indexNumber,
    ),
    index("attendance_roster_class_name_idx").on(table.classId, table.fullName),
  ],
);

export const attendanceSessionsTable = pgTable(
  "attendance_sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    classId: uuid("class_id")
      .notNull()
      .references(() => attendanceClassesTable.id, { onDelete: "cascade" }),
    topic: text("topic").notNull().default(""),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    lateAfterMinutes: integer("late_after_minutes"),
    venue: text("venue").notNull().default(""),
    expectedStudents: integer("expected_students").notNull(),
    codeMode: text("code_mode").notNull().default("rotating"),
    radiusM: integer("radius_m").notNull().default(100),
    locationLat: text("location_lat"),
    locationLng: text("location_lng"),
    locationAccuracyM: integer("location_accuracy_m"),
    pinMoved: boolean("pin_moved").notNull().default(false),
    locationSkipped: boolean("location_skipped").notNull().default(false),
    status: text("status").notNull().default("scheduled"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    finalizedAt: timestamp("finalized_at", { withTimezone: true }),
  },
  (table) => [
    index("attendance_sessions_class_start_idx").on(
      table.classId,
      table.startsAt,
    ),
  ],
);

export const attendanceRecordsTable = pgTable(
  "attendance_records",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => attendanceSessionsTable.id, { onDelete: "cascade" }),
    rosterStudentId: uuid("roster_student_id")
      .notNull()
      .references(() => attendanceRosterTable.id, { onDelete: "cascade" }),
    status: text("status").notNull(),
    markedAt: timestamp("marked_at", { withTimezone: true }),
    flags: jsonb("flags").$type<string[]>().notNull().default([]),
    note: text("note"),
    faceScore: text("face_score"),
    distanceM: integer("distance_m"),
    accuracyM: integer("accuracy_m"),
    photoKey: text("photo_key"),
    markedManually: boolean("marked_manually").notNull().default(false),
    reviewedBy: text("reviewed_by"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("attendance_records_session_roster_unique").on(
      table.sessionId,
      table.rosterStudentId,
    ),
    index("attendance_records_session_status_idx").on(
      table.sessionId,
      table.status,
    ),
    index("attendance_records_student_marked_idx").on(
      table.rosterStudentId,
      table.markedAt,
    ),
  ],
);

export const attendanceAuditTable = pgTable(
  "attendance_audit_log",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    actorUserId: text("actor_user_id").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    action: text("action").notNull(),
    details: jsonb("details")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("attendance_audit_actor_created_idx").on(
      table.actorUserId,
      table.createdAt,
    ),
    index("attendance_audit_entity_idx").on(
      table.entityType,
      table.entityId,
    ),
  ],
);

export type AttendanceClass = typeof attendanceClassesTable.$inferSelect;
export type AttendanceRosterStudent =
  typeof attendanceRosterTable.$inferSelect;
export type AttendanceSession = typeof attendanceSessionsTable.$inferSelect;
export type AttendanceRecord = typeof attendanceRecordsTable.$inferSelect;
