import { randomUUID } from "node:crypto";

export interface StoredLecturerProfile {
  userId: string;
  staffId: string;
  fullName: string;
  email: string;
  phone: string;
  departments: string[];
  reviewStatus: "not_yet_reviewed" | "kept" | "suspended" | "removed";
  emailVerified: boolean;
  lastActiveAt: Date;
}

export interface StoredDepartment {
  id: string;
  name: string;
  code: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface StoredProgramme {
  id: string;
  name: string;
  code: string;
  departmentId: string;
  departmentName: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface StoredCourse {
  id: string;
  code: string;
  title: string;
  departmentId: string;
  departmentName: string;
  programmeIds: string[];
  programmeNames: string[];
  level: number;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface StoredLocation {
  id: string;
  name: string;
  building: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface StoredAcademicConfig {
  levels: number[];
  semesters: string[];
  currentAcademicYear: string;
  academicYears: string[];
  updatedAt: string;
}

export interface StoredReferenceRequest {
  id: string;
  type: "course" | "location";
  lecturerUserId: string;
  lecturerName: string;
  lecturerEmail: string;
  departmentName?: string;
  programmeName?: string;
  level?: number;
  courseCode?: string;
  courseTitle?: string;
  locationName?: string;
  building?: string;
  note?: string;
  status: "pending" | "approved" | "rejected";
  adminNote?: string;
  createdAt: Date;
  resolvedAt?: Date | null;
}

export interface StoredLearnedCourse {
  courseCode: string;
  courseTitle: string;
  department: string;
  programme: string;
  level: number;
}

export interface StoredLearnedLocation {
  name: string;
  building?: string;
  lat: number | null;
  lng: number | null;
  lastRadiusM: number;
}

export interface StoredClass {
  id: string;
  ownerUserId: string;
  department: string;
  programme: string;
  level: number;
  courseCode: string;
  courseTitle: string;
  semester: string;
  academicYear: string;
  archived: boolean;
  createdAt: Date;
}

export interface StoredRosterStudent {
  id: string;
  classId: string;
  fullName: string;
  indexNumber: string;
  email: string;
  phone: string | null;
  linkStatus: "invited" | "matched" | "needs_approval" | "conflict";
  faceEnrolled: boolean;
  photoReleaseBasis: "auto" | "approved" | "pending" | "none";
  verificationStatus: "unconfirmed" | "confirmed" | "disputed";
  confirmedByCount: number;
  portraitKey: string | null;
  disputeReason: string | null;
  disputedAt: Date | null;
  createdAt: Date;
}

export interface StoredSession {
  id: string;
  classId: string;
  topic: string;
  startsAt: Date;
  endsAt: Date;
  lateAfterMinutes: number | null;
  venue: string;
  expectedStudents: number;
  codeMode: "rotating" | "static";
  radiusM: number;
  locationLat: string | null;
  locationLng: string | null;
  locationAccuracyM: number | null;
  pinMoved: boolean;
  locationSkipped: boolean;
  status: "scheduled" | "open" | "closed" | "finalized";
  createdAt: Date;
  finalizedAt: Date | null;
}

export interface StoredRecord {
  id: string;
  sessionId: string;
  rosterStudentId: string;
  status: "present" | "needs_review" | "absent" | "excused";
  markedAt: Date | null;
  flags: string[];
  note: string | null;
  faceScore: string | null;
  distanceM: number | null;
  accuracyM: number | null;
  photoKey: string | null;
  markedManually: boolean;
  reviewedBy: string | null;
  reviewedAt: Date | null;
  createdAt: Date;
}

export interface StoredAuditEvent {
  id: string;
  actorUserId: string;
  actorEmail?: string;
  actorRole?: string;
  ip?: string;
  entityType: string;
  entityId: string;
  action: string;
  reason?: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  details: Record<string, unknown>;
  createdAt: Date;
}

export interface StoredSystemLog {
  id: string;
  level: "info" | "warn" | "error" | "auth";
  category: string;
  message: string;
  details: Record<string, unknown>;
  timestamp: string;
}

export interface StoredAuthSession {
  tokenId: string;
  userId: string;
  email: string;
  fullName: string;
  role: "lecturer" | "super_admin" | "department_admin" | "student";
  departments?: string[];
  expiresAt: number;
}

export interface StoredDispute {
  id: string;
  caseType: "lecturer_dispute" | "student_claim";
  classId: string;
  courseCode: string;
  department: string;
  studentIndex: string;
  studentName: string;
  claimReason: string;
  status: "open" | "resolved";
  resolution?: "keep" | "reset" | "reassign";
  reassignedIndex?: string;
  resolutionNote?: string;
  registrationPhotoKey: string;
  checkinPhotoKey: string;
  photoViewsCount: number;
  accountLocked: boolean;
  createdAt: Date;
  resolvedAt?: Date | null;
}

export interface StoredPhotoRecaptureRequest {
  id: string;
  studentIndex: string;
  courseCode: string;
  department: string;
  reason: string;
  status: "pending" | "approved" | "rejected";
  requestedAt: Date;
  resolvedAt?: Date | null;
}

export interface StoredDeviceRequest {
  id: string;
  studentIndex: string;
  courseCode: string;
  department: string;
  currentDevice: string;
  newDevice: string;
  reason: string;
  status: "pending" | "approved" | "denied" | "revoked";
  accountLocked: boolean;
  requestedAt: Date;
  resolvedAt?: Date | null;
}

export interface StoredAdminSettings {
  attendanceThresholdPct: number;
  defaultRadiusM: number;
  maxRadiusM: number;
  rotatingCodeSeconds: number;
  strictGeofence: boolean;
  allowStaticCodes: boolean;
  sessionGraceBeforeMin: number;
  sessionGraceAfterMin: number;
  allowLateStatus: boolean;
  lateAfterMinutesDefault: number;
  faceAutoPassMin: number;
  faceMiddleBandMin: number;
  middleBandPolicy: "lecturer_review" | "require_recapture" | "flag_only";
  registrationPhotoRetentionDays: number;
  attendancePhotoRetentionDays: number;
  purgeSchedule: "weekly" | "monthly" | "end_of_semester";
  allowedStaffDomains: string[];
  apiRateLimitPerMin: number;
  ipAllowList: string[];
  failedLoginLockoutAttempts: number;
  sessionTimeoutMinutes: number;
  twoFactorRequiredForAdmins: boolean;
  privacyPolicyVersion: string;
  privacyPolicyText: string;
  consentNoticeText: string;
  requireReconsentOnUpdate: boolean;
  emailTemplateInvite: string;
  pushTemplateSessionOpen: string;
}

export interface StoredDataRequest {
  id: string;
  requestType: "deletion" | "data_access";
  requesterIndex: string;
  requesterEmail: string;
  department: string;
  status: "pending" | "fulfilled" | "rejected";
  createdAt: Date;
  resolvedAt?: Date | null;
}

export interface StoredAnnouncement {
  id: string;
  audience: "all_lecturers" | "all_students";
  title: string;
  message: string;
  sentByEmail: string;
  sentAt: Date;
}

export interface StoredPendingApproval {
  id: string;
  actionType: "reassign_index" | "lower_security_threshold";
  summary: string;
  payload: Record<string, unknown>;
  requestedByUserId: string;
  requestedByEmail: string;
  status: "pending" | "approved" | "rejected";
  reviewedByEmail?: string | null;
  reason: string;
  createdAt: Date;
  resolvedAt?: Date | null;
}

export interface StoredBackupRecord {
  id: string;
  label: string;
  sizeKb: number;
  status: "verified";
  triggeredBy: string;
  createdAt: Date;
}

export interface StoredTwoFactorChallenge {
  challengeId: string;
  email: string;
  code: string;
  userId: string;
  fullName: string;
  role: "super_admin" | "department_admin";
  departments?: string[];
  expiresAt: number;
}

export interface StoredReauthToken {
  token: string;
  userId: string;
  expiresAt: number;
}

const DEFAULT_OWNER = "user_mock_lecturer";

function daysAgo(days: number, hourUtc = 10, minuteUtc = 0): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  d.setUTCHours(hourUtc, minuteUtc, 0, 0);
  return d;
}

function minutesFromNow(minutes: number): Date {
  return new Date(Date.now() + minutes * 60_000);
}

class MemoryAttendanceStore {
  lecturerProfiles: StoredLecturerProfile[] = [];
  departmentRecords: StoredDepartment[] = [
    {
      id: "dept-cs",
      name: "Computer Science",
      code: "CS",
      active: true,
      createdAt: daysAgo(90, 9, 0),
      updatedAt: daysAgo(90, 9, 0),
    },
    {
      id: "dept-it",
      name: "Information Technology",
      code: "IT",
      active: true,
      createdAt: daysAgo(90, 9, 0),
      updatedAt: daysAgo(90, 9, 0),
    },
    {
      id: "dept-math",
      name: "Mathematics & Statistics",
      code: "MATH",
      active: true,
      createdAt: daysAgo(90, 9, 0),
      updatedAt: daysAgo(90, 9, 0),
    },
    {
      id: "dept-ee",
      name: "Electrical Engineering",
      code: "EE",
      active: true,
      createdAt: daysAgo(90, 9, 0),
      updatedAt: daysAgo(90, 9, 0),
    },
  ];
  programmeRecords: StoredProgramme[] = [
    {
      id: "prog-bsc-it",
      name: "BSc Information Technology",
      code: "BSC-IT",
      departmentId: "dept-it",
      departmentName: "Information Technology",
      active: true,
      createdAt: daysAgo(90, 9, 0),
      updatedAt: daysAgo(90, 9, 0),
    },
    {
      id: "prog-bsc-cs",
      name: "BSc Computer Science",
      code: "BSC-CS",
      departmentId: "dept-cs",
      departmentName: "Computer Science",
      active: true,
      createdAt: daysAgo(90, 9, 0),
      updatedAt: daysAgo(90, 9, 0),
    },
    {
      id: "prog-bsc-ds",
      name: "BSc Data Science",
      code: "BSC-DS",
      departmentId: "dept-math",
      departmentName: "Mathematics & Statistics",
      active: true,
      createdAt: daysAgo(90, 9, 0),
      updatedAt: daysAgo(90, 9, 0),
    },
    {
      id: "prog-hnd-cs",
      name: "HND Computer Science",
      code: "HND-CS",
      departmentId: "dept-cs",
      departmentName: "Computer Science",
      active: true,
      createdAt: daysAgo(90, 9, 0),
      updatedAt: daysAgo(90, 9, 0),
    },
  ];
  courseRecords: StoredCourse[] = [
    {
      id: "course-cs-305",
      code: "CS 305",
      title: "Computer Networks",
      departmentId: "dept-cs",
      departmentName: "Computer Science",
      programmeIds: ["prog-bsc-it", "prog-bsc-cs"],
      programmeNames: ["BSc Information Technology", "BSc Computer Science"],
      level: 300,
      active: true,
      createdAt: daysAgo(60, 9, 0),
      updatedAt: daysAgo(60, 9, 0),
    },
    {
      id: "course-cs-411",
      code: "CS 411",
      title: "Distributed Systems",
      departmentId: "dept-cs",
      departmentName: "Computer Science",
      programmeIds: ["prog-bsc-cs"],
      programmeNames: ["BSc Computer Science"],
      level: 400,
      active: true,
      createdAt: daysAgo(60, 9, 0),
      updatedAt: daysAgo(60, 9, 0),
    },
    {
      id: "course-cs-215",
      code: "CS 215",
      title: "Discrete Mathematics",
      departmentId: "dept-cs",
      departmentName: "Computer Science",
      programmeIds: ["prog-bsc-cs", "prog-hnd-cs"],
      programmeNames: ["BSc Computer Science", "HND Computer Science"],
      level: 200,
      active: true,
      createdAt: daysAgo(60, 9, 0),
      updatedAt: daysAgo(60, 9, 0),
    },
    {
      id: "course-it-204",
      code: "IT 204",
      title: "Database Administration",
      departmentId: "dept-it",
      departmentName: "Information Technology",
      programmeIds: ["prog-bsc-it"],
      programmeNames: ["BSc Information Technology"],
      level: 200,
      active: true,
      createdAt: daysAgo(60, 9, 0),
      updatedAt: daysAgo(60, 9, 0),
    },
    {
      id: "course-ds-310",
      code: "DS 310",
      title: "Statistical Machine Learning",
      departmentId: "dept-math",
      departmentName: "Mathematics & Statistics",
      programmeIds: ["prog-bsc-ds"],
      programmeNames: ["BSc Data Science"],
      level: 300,
      active: true,
      createdAt: daysAgo(60, 9, 0),
      updatedAt: daysAgo(60, 9, 0),
    },
  ];
  locationRecords: StoredLocation[] = [
    {
      id: "loc-lt2",
      name: "Lecture Theatre 2 (LT2)",
      building: "Science Complex",
      active: true,
      createdAt: daysAgo(90, 9, 0),
      updatedAt: daysAgo(90, 9, 0),
    },
    {
      id: "loc-cs-sem1",
      name: "CS Seminar Room 1",
      building: "IT Block",
      active: true,
      createdAt: daysAgo(90, 9, 0),
      updatedAt: daysAgo(90, 9, 0),
    },
    {
      id: "loc-eng-aud",
      name: "Engineering Auditorium",
      building: "Engineering Hall",
      active: true,
      createdAt: daysAgo(90, 9, 0),
      updatedAt: daysAgo(90, 9, 0),
    },
    {
      id: "loc-ict-3",
      name: "ICT Lab 3",
      building: "IT Block",
      active: true,
      createdAt: daysAgo(90, 9, 0),
      updatedAt: daysAgo(90, 9, 0),
    },
  ];
  academicConfig: StoredAcademicConfig = {
    levels: [100, 200, 300, 400],
    semesters: ["Semester 1", "Semester 2"],
    currentAcademicYear: "2026/2027",
    academicYears: ["2025/2026", "2026/2027", "2027/2028"],
    updatedAt: daysAgo(30, 8, 0).toISOString(),
  };
  referenceRequests: StoredReferenceRequest[] = [
    {
      id: "req-course-1",
      type: "course",
      lecturerUserId: "user_mock_lecturer_2",
      lecturerName: "Prof. Abena Kwarteng",
      lecturerEmail: "akwarteng@school.edu.gh",
      departmentName: "Mathematics & Statistics",
      programmeName: "BSc Data Science",
      level: 400,
      courseCode: "DS 408",
      courseTitle: "Applied Bayesian Inference",
      note: "New elective starting this semester.",
      status: "pending",
      createdAt: daysAgo(1, 14, 20),
    },
    {
      id: "req-loc-1",
      type: "location",
      lecturerUserId: "user_mock_lecturer",
      lecturerName: "Dr. Kwesi Mensah",
      lecturerEmail: "mensah@school.edu.gh",
      locationName: "New Innovation Lab 2B",
      building: "IT Block",
      note: "Used for CS 305 practical lab sessions.",
      status: "pending",
      createdAt: daysAgo(0, 8, 10),
    },
  ];
  departments: string[] = [
    "Computer Science",
    "Information Technology",
    "Mathematics & Statistics",
    "Electrical Engineering",
  ];
  programmes: string[] = [
    "BSc Information Technology",
    "BSc Computer Science",
    "BSc Data Science",
    "HND Computer Science",
  ];
  learnedCourses: StoredLearnedCourse[] = [];
  learnedLocations: StoredLearnedLocation[] = [
    {
      name: "Lecture Theatre 2 (LT2)",
      building: "Science Complex",
      lat: 4.9016,
      lng: -1.7831,
      lastRadiusM: 100,
    },
    {
      name: "CS Seminar Room 1",
      building: "IT Block",
      lat: 4.9022,
      lng: -1.7824,
      lastRadiusM: 50,
    },
    {
      name: "Engineering Auditorium",
      building: "Engineering Hall",
      lat: 4.9009,
      lng: -1.784,
      lastRadiusM: 100,
    },
    {
      name: "ICT Lab 3",
      building: "IT Block",
      lat: 4.9028,
      lng: -1.7836,
      lastRadiusM: 50,
    },
  ];
  classes: StoredClass[] = [];
  roster: StoredRosterStudent[] = [];
  sessions: StoredSession[] = [];
  records: StoredRecord[] = [];
  audits: StoredAuditEvent[] = [];
  disputes: StoredDispute[] = [
    {
      id: "disp-1",
      caseType: "student_claim",
      classId: "11111111-1111-4111-8111-111111111101",
      courseCode: "CS 305",
      department: "Computer Science",
      studentIndex: "5231003",
      studentName: "Yaw Boateng",
      claimReason: 'Student submitted "This index number is mine" claim after middle-band mismatch.',
      status: "open",
      registrationPhotoKey: "yaw-portrait",
      checkinPhotoKey: "yaw-checkin-wide",
      photoViewsCount: 0,
      accountLocked: true,
      createdAt: daysAgo(1, 11, 15),
    },
    {
      id: "disp-2",
      caseType: "lecturer_dispute",
      classId: "11111111-1111-4111-8111-111111111101",
      courseCode: "CS 305",
      department: "Computer Science",
      studentIndex: "5231005",
      studentName: "Kwame Ofori",
      claimReason: "Lecturer disputed registration portrait pending in-person ID card check.",
      status: "open",
      registrationPhotoKey: "kofi-portrait",
      checkinPhotoKey: "kwame-checkin-wide",
      photoViewsCount: 0,
      accountLocked: true,
      createdAt: daysAgo(0, 9, 45),
    },
  ];
  photoRecaptureRequests: StoredPhotoRecaptureRequest[] = [
    {
      id: "recap-1",
      studentIndex: "5231003",
      courseCode: "CS 305",
      department: "Computer Science",
      reason: "Original registration photo captured under heavy backlight; student requests verified re-capture.",
      status: "pending",
      requestedAt: daysAgo(1, 16, 0),
    },
  ];
  deviceRequests: StoredDeviceRequest[] = [
    {
      id: "dev-req-1",
      studentIndex: "5231002",
      courseCode: "CS 305",
      department: "Computer Science",
      currentDevice: "Samsung Galaxy A32 (Android 13)",
      newDevice: "Google Pixel 7a (Android 15)",
      reason: "Replaced damaged handset; student presented campus ID at registry.",
      status: "pending",
      accountLocked: false,
      requestedAt: daysAgo(0, 10, 30),
    },
    {
      id: "dev-req-2",
      studentIndex: "5231007",
      courseCode: "CS 305",
      department: "Computer Science",
      currentDevice: "iPhone 13 (iOS 17)",
      newDevice: "iPhone 13 (iOS 17)",
      reason: "Primary enrolled handset",
      status: "approved",
      accountLocked: false,
      requestedAt: daysAgo(14, 9, 0),
      resolvedAt: daysAgo(14, 12, 0),
    },
  ];
  adminSettings: StoredAdminSettings = {
    attendanceThresholdPct: 75,
    defaultRadiusM: 100,
    maxRadiusM: 500,
    rotatingCodeSeconds: 45,
    strictGeofence: true,
    allowStaticCodes: true,
    sessionGraceBeforeMin: 15,
    sessionGraceAfterMin: 15,
    allowLateStatus: true,
    lateAfterMinutesDefault: 15,
    faceAutoPassMin: 0.8,
    faceMiddleBandMin: 0.5,
    middleBandPolicy: "lecturer_review",
    registrationPhotoRetentionDays: 365,
    attendancePhotoRetentionDays: 90,
    purgeSchedule: "monthly",
    allowedStaffDomains: ["school.edu.gh"],
    apiRateLimitPerMin: 120,
    ipAllowList: [],
    failedLoginLockoutAttempts: 5,
    sessionTimeoutMinutes: 30,
    twoFactorRequiredForAdmins: false,
    privacyPolicyVersion: "v2.1",
    privacyPolicyText:
      "Institutional attendance records, geofence distance flags, and verification portraits are collected solely for academic attendance verification and retained according to senate retention limits.",
    consentNoticeText:
      "By enrolling your face reference and checking into lectures, you consent to campus attendance verification under policy v2.1.",
    requireReconsentOnUpdate: true,
    emailTemplateInvite:
      "Hello {{studentName}}, you have been added to {{courseCode}} ({{semester}}). Sign in with your campus email to complete verification.",
    pushTemplateSessionOpen:
      "{{courseCode}} attendance is now open at {{venue}}. Check in before {{endsAt}}.",
  };
  dataRequests: StoredDataRequest[] = [
    {
      id: "dreq-1",
      requestType: "data_access",
      requesterIndex: "5231006",
      requesterEmail: "5231006@student.school.edu.gh",
      department: "Computer Science",
      status: "pending",
      createdAt: daysAgo(2, 13, 0),
    },
  ];
  announcements: StoredAnnouncement[] = [
    {
      id: "ann-1",
      audience: "all_lecturers",
      title: "Semester 1 Attendance Finalisation Reminder",
      message: "Please finalise closed attendance sessions within 48 hours so departmental adoption reports stay accurate.",
      sentByEmail: "admin@school.edu.gh",
      sentAt: daysAgo(3, 9, 0),
    },
  ];
  pendingApprovals: StoredPendingApproval[] = [];
  backups: StoredBackupRecord[] = [
    {
      id: "bak-1",
      label: "Daily Automated Encrypted Snapshot",
      sizeKb: 4280,
      status: "verified",
      triggeredBy: "system-scheduler",
      createdAt: daysAgo(0, 2, 0),
    },
    {
      id: "bak-2",
      label: "Pre-Semester Reference Data Snapshot",
      sizeKb: 3910,
      status: "verified",
      triggeredBy: "admin@school.edu.gh",
      createdAt: daysAgo(7, 2, 0),
    },
  ];
  adminCredentialHash: string | null = null;
  claimedAdminEmail: string | null = null;
  lecturerPasswordHashes: Map<string, string> = new Map();
  authSessions: Map<string, StoredAuthSession> = new Map();
  twoFactorChallenges: Map<string, StoredTwoFactorChallenge> = new Map();
  reauthTokens: Map<string, StoredReauthToken> = new Map();
  loginAttempts: Map<string, { failedCount: number; lockedUntil: number | null; knownIps: string[] }> = new Map();
  systemLogs: StoredSystemLog[] = [
    {
      id: "log-1",
      level: "warn",
      category: "geofence",
      message: "Student check-in outside permitted geofence radius (193,207 m from venue pin)",
      details: { studentIndex: "5231005", session: "33333333-3333-4333-8333-333333333101", flag: "GEO_OUTSIDE" },
      timestamp: new Date(Date.now() - 120_000).toISOString(),
    },
    {
      id: "log-2",
      level: "auth",
      category: "security",
      message: "Failed login attempt with unrecognized staff credentials",
      details: { email: "unauthorized.faculty@school.edu.gh", ip: "192.168.1.45" },
      timestamp: new Date(Date.now() - 450_000).toISOString(),
    },
    {
      id: "log-3",
      level: "error",
      category: "api",
      message: "Validation error on student check-in: missing index number field",
      details: { endpoint: "/api/sessions/33333333-3333-4333-8333-333333333101/student-checkin", status: 400 },
      timestamp: new Date(Date.now() - 900_000).toISOString(),
    },
    {
      id: "log-4",
      level: "info",
      category: "session",
      message: "Rotating 45s attendance code successfully cycled for active session",
      details: { sessionId: "33333333-3333-4333-8333-333333333101", code: "GVW-7I7" },
      timestamp: new Date(Date.now() - 1200_000).toISOString(),
    },
    {
      id: "log-5",
      level: "info",
      category: "database",
      message: "Attendance store initialized and reference data ready",
      details: { mode: "in-memory" },
      timestamp: new Date(Date.now() - 3600_000).toISOString(),
    },
  ];

  constructor() {
    this.seed(DEFAULT_OWNER);
  }

  addSystemLog(entry: Omit<StoredSystemLog, "id" | "timestamp">): StoredSystemLog {
    const log: StoredSystemLog = {
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      ...entry,
    };
    this.systemLogs.unshift(log);
    if (this.systemLogs.length > 200) {
      this.systemLogs.length = 200;
    }
    return log;
  }

  getOrCreateProfile(userId: string): StoredLecturerProfile {
    let profile = this.lecturerProfiles.find((p) => p.userId === userId);
    if (!profile) {
      profile = {
        userId,
        staffId: "TTU-0412",
        fullName: "Dr. Kwesi Mensah",
        email: "mensah@school.edu.gh",
        phone: "024 123 4567",
        departments: ["Computer Science", "Information Technology"],
        reviewStatus: "kept",
        emailVerified: true,
        lastActiveAt: minutesFromNow(-10),
      };
      this.lecturerProfiles.push(profile);
    }
    return profile;
  }

  syncActiveDepartmentNames(): void {
    this.departments = this.departmentRecords
      .filter((d) => d.active)
      .map((d) => d.name);
  }

  syncActiveProgrammeNames(): void {
    this.programmes = this.programmeRecords
      .filter((p) => p.active)
      .map((p) => p.name);
  }

  syncActiveCourseNames(): void {
    this.learnedCourses = this.courseRecords
      .filter((c) => c.active)
      .map((c) => ({
        courseCode: c.code,
        courseTitle: c.title,
        department: c.departmentName,
        programme: c.programmeNames[0] ?? "",
        level: c.level,
      }));
  }

  syncActiveLocationNames(): void {
    this.learnedLocations = this.locationRecords
      .filter((loc) => loc.active)
      .map((loc) => ({
        name: loc.name,
        building: loc.building,
        lat: null,
        lng: null,
        lastRadiusM: this.adminSettings.defaultRadiusM,
      }));
  }

  recordAdminAudit(params: {
    actorUserId: string;
    actorEmail?: string;
    actorRole?: string;
    ip?: string;
    entityType: string;
    entityId: string;
    action: string;
    reason?: string;
    before?: Record<string, unknown> | null;
    after?: Record<string, unknown> | null;
    details?: Record<string, unknown>;
  }): StoredAuditEvent {
    const event: StoredAuditEvent = {
      id: randomUUID(),
      actorUserId: params.actorUserId,
      actorEmail: params.actorEmail,
      actorRole: params.actorRole,
      ip: params.ip ?? "127.0.0.1",
      entityType: params.entityType,
      entityId: params.entityId,
      action: params.action,
      reason: params.reason,
      before: params.before ?? null,
      after: params.after ?? null,
      details: {
        ...(params.details ?? {}),
        ...(params.reason ? { reason: params.reason } : {}),
        ...(params.before ? { before: params.before } : {}),
        ...(params.after ? { after: params.after } : {}),
      },
      createdAt: new Date(),
    };
    this.audits.unshift(event);
    return event;
  }

  learnFromClass(_c: Pick<StoredClass, "department" | "programme" | "courseCode" | "courseTitle" | "level">): void {
    // Reference data is owned exclusively by administrators.
  }

  learnLocation(name: string, lat: number | null, lng: number | null, radiusM: number): void {
    const trimmed = name.trim();
    if (!trimmed) return;
    const isAdminLocation = this.locationRecords.some(
      (l) => l.active && l.name.toLowerCase() === trimmed.toLowerCase(),
    );
    if (!isAdminLocation) return;
    const existing = this.learnedLocations.find(
      (loc) => loc.name.toLowerCase() === trimmed.toLowerCase(),
    );
    if (existing) {
      if (lat !== null && lng !== null) {
        existing.lat = lat;
        existing.lng = lng;
      }
      existing.lastRadiusM = radiusM;
    } else {
      this.learnedLocations.push({
        name: trimmed,
        lat: lat ?? 4.9016,
        lng: lng ?? -1.7831,
        lastRadiusM: radiusM,
      });
    }
  }

  seed(ownerUserId: string): void {
    this.getOrCreateProfile(ownerUserId);
    if (!this.lecturerProfiles.some((p) => p.userId === "user_mock_lecturer_2")) {
      this.lecturerProfiles.push({
        userId: "user_mock_lecturer_2",
        staffId: "TTU-0488",
        fullName: "Prof. Abena Kwarteng",
        email: "akwarteng@school.edu.gh",
        phone: "020 987 6543",
        departments: ["Mathematics & Statistics"],
        reviewStatus: "not_yet_reviewed",
        emailVerified: true,
        lastActiveAt: daysAgo(1, 14, 20),
      });
    }
    if (!this.lecturerProfiles.some((p) => p.userId === "user_mock_lecturer_3")) {
      this.lecturerProfiles.push({
        userId: "user_mock_lecturer_3",
        staffId: "TTU-0519",
        fullName: "Dr. Kojo Boateng",
        email: "kboateng@school.edu.gh",
        phone: "024 888 1122",
        departments: ["Computer Science"],
        reviewStatus: "not_yet_reviewed",
        emailVerified: true,
        lastActiveAt: daysAgo(4, 9, 15),
      });
    }
    this.syncActiveCourseNames();

    const classCs305Id = "11111111-1111-4111-8111-111111111101";
    const classCs411Id = "11111111-1111-4111-8111-111111111102";

    const initialClasses: StoredClass[] = [
      {
        id: classCs305Id,
        ownerUserId,
        department: "Computer Science",
        programme: "BSc Information Technology",
        level: 300,
        courseCode: "CS 305",
        courseTitle: "Computer Networks",
        semester: "Semester 1",
        academicYear: "2026/2027",
        archived: false,
        createdAt: daysAgo(28, 8, 30),
      },
      {
        id: classCs411Id,
        ownerUserId,
        department: "Computer Science",
        programme: "BSc Computer Science",
        level: 400,
        courseCode: "CS 411",
        courseTitle: "Distributed Systems",
        semester: "Semester 1",
        academicYear: "2026/2027",
        archived: false,
        createdAt: daysAgo(25, 9, 0),
      },
    ];

    this.classes.push(...initialClasses);
    initialClasses.forEach((c) => this.learnFromClass(c));
    this.learnedCourses.push({
      courseCode: "CS 215",
      courseTitle: "Discrete Mathematics",
      department: "Computer Science",
      programme: "BSc Computer Science",
      level: 200,
    });

    const cs305Students: Array<{
      id: string;
      fullName: string;
      indexNumber: string;
      email: string;
      phone: string | null;
      linkStatus: StoredRosterStudent["linkStatus"];
      faceEnrolled: boolean;
      photoReleaseBasis: StoredRosterStudent["photoReleaseBasis"];
      verificationStatus: StoredRosterStudent["verificationStatus"];
      confirmedByCount: number;
      portraitKey: string | null;
    }> = [
      {
        id: "22222222-2222-4222-8222-222222222101",
        fullName: "Ama Boateng",
        indexNumber: "5231001",
        email: "ama.boateng@school.edu.gh",
        phone: "0241234567",
        linkStatus: "matched",
        faceEnrolled: true,
        photoReleaseBasis: "auto",
        verificationStatus: "confirmed",
        confirmedByCount: 2,
        portraitKey: "ama-portrait",
      },
      {
        id: "22222222-2222-4222-8222-222222222102",
        fullName: "Kofi Asare",
        indexNumber: "5231002",
        email: "kofi.asare@school.edu.gh",
        phone: "0207654321",
        linkStatus: "matched",
        faceEnrolled: true,
        photoReleaseBasis: "auto",
        verificationStatus: "unconfirmed",
        confirmedByCount: 1,
        portraitKey: "kofi-portrait",
      },
      {
        id: "22222222-2222-4222-8222-222222222103",
        fullName: "Yaw Darko",
        indexNumber: "5231003",
        email: "yaw.darko@school.edu.gh",
        phone: "0551112233",
        linkStatus: "matched",
        faceEnrolled: true,
        photoReleaseBasis: "auto",
        verificationStatus: "unconfirmed",
        confirmedByCount: 0,
        portraitKey: "yaw-portrait",
      },
      {
        id: "22222222-2222-4222-8222-222222222104",
        fullName: "Efua Mensah",
        indexNumber: "5231004",
        email: "efua.mensah@school.edu.gh",
        phone: "0248899001",
        linkStatus: "matched",
        faceEnrolled: true,
        photoReleaseBasis: "auto",
        verificationStatus: "confirmed",
        confirmedByCount: 2,
        portraitKey: "ama-portrait",
      },
      {
        id: "22222222-2222-4222-8222-222222222105",
        fullName: "Kwame Ofori",
        indexNumber: "5231005",
        email: "kwame.ofori@school.edu.gh",
        phone: "0273344556",
        linkStatus: "needs_approval",
        faceEnrolled: true,
        photoReleaseBasis: "pending",
        verificationStatus: "unconfirmed",
        confirmedByCount: 0,
        portraitKey: null,
      },
      {
        id: "22222222-2222-4222-8222-222222222106",
        fullName: "Nana Yaw Agyemang",
        indexNumber: "5231006",
        email: "nana.agyemang@school.edu.gh",
        phone: "0542233445",
        linkStatus: "matched",
        faceEnrolled: true,
        photoReleaseBasis: "approved",
        verificationStatus: "confirmed",
        confirmedByCount: 1,
        portraitKey: "kofi-portrait",
      },
      {
        id: "22222222-2222-4222-8222-222222222107",
        fullName: "Abena Osei",
        indexNumber: "5231007",
        email: "abena.osei@school.edu.gh",
        phone: "0246677889",
        linkStatus: "invited",
        faceEnrolled: false,
        photoReleaseBasis: "none",
        verificationStatus: "unconfirmed",
        confirmedByCount: 0,
        portraitKey: null,
      },
      {
        id: "22222222-2222-4222-8222-222222222108",
        fullName: "Kojo Appiah",
        indexNumber: "5231008",
        email: "kojo.appiah@school.edu.gh",
        phone: "0209988776",
        linkStatus: "matched",
        faceEnrolled: true,
        photoReleaseBasis: "auto",
        verificationStatus: "unconfirmed",
        confirmedByCount: 1,
        portraitKey: "yaw-portrait",
      },
    ];

    for (const s of cs305Students) {
      this.roster.push({
        ...s,
        classId: classCs305Id,
        disputeReason: null,
        disputedAt: null,
        createdAt: daysAgo(27),
      });
    }

    const cs411Students: Array<{
      id: string;
      fullName: string;
      indexNumber: string;
      email: string;
      phone: string | null;
      linkStatus: StoredRosterStudent["linkStatus"];
      faceEnrolled: boolean;
      photoReleaseBasis: StoredRosterStudent["photoReleaseBasis"];
      verificationStatus: StoredRosterStudent["verificationStatus"];
      confirmedByCount: number;
      portraitKey: string | null;
    }> = [
      {
        id: "22222222-2222-4222-8222-222222222201",
        fullName: "Akosua Frimpong",
        indexNumber: "4231011",
        email: "akosua.frimpong@school.edu.gh",
        phone: "0245011223",
        linkStatus: "matched",
        faceEnrolled: true,
        photoReleaseBasis: "auto",
        verificationStatus: "confirmed",
        confirmedByCount: 3,
        portraitKey: "ama-portrait",
      },
      {
        id: "22222222-2222-4222-8222-222222222202",
        fullName: "Selorm Tetteh",
        indexNumber: "4231012",
        email: "selorm.tetteh@school.edu.gh",
        phone: "0204455667",
        linkStatus: "matched",
        faceEnrolled: true,
        photoReleaseBasis: "auto",
        verificationStatus: "unconfirmed",
        confirmedByCount: 1,
        portraitKey: "kofi-portrait",
      },
      {
        id: "22222222-2222-4222-8222-222222222203",
        fullName: "Adwoa Dankwa",
        indexNumber: "4231013",
        email: "adwoa.dankwa@school.edu.gh",
        phone: "0556677880",
        linkStatus: "needs_approval",
        faceEnrolled: true,
        photoReleaseBasis: "pending",
        verificationStatus: "unconfirmed",
        confirmedByCount: 0,
        portraitKey: null,
      },
      {
        id: "22222222-2222-4222-8222-222222222204",
        fullName: "Fiifi Boadi",
        indexNumber: "4231014",
        email: "fiifi.boadi@school.edu.gh",
        phone: "0243322110",
        linkStatus: "matched",
        faceEnrolled: true,
        photoReleaseBasis: "auto",
        verificationStatus: "confirmed",
        confirmedByCount: 2,
        portraitKey: "yaw-portrait",
      },
    ];

    for (const s of cs411Students) {
      this.roster.push({
        ...s,
        classId: classCs411Id,
        disputeReason: null,
        disputedAt: null,
        createdAt: daysAgo(24),
      });
    }

    const sessLiveId = "33333333-3333-4333-8333-333333333101";
    const sessPast1Id = "33333333-3333-4333-8333-333333333102";
    const sessPast2Id = "33333333-3333-4333-8333-333333333103";
    const sess411PastId = "33333333-3333-4333-8333-333333333201";

    this.sessions.push(
      {
        id: sessLiveId,
        classId: classCs305Id,
        topic: "Week 5 · Transport Layer & Congestion Control",
        startsAt: minutesFromNow(-12),
        endsAt: minutesFromNow(48),
        lateAfterMinutes: null,
        venue: "Lecture Theatre 2 (LT2)",
        expectedStudents: 8,
        codeMode: "rotating",
        radiusM: 100,
        locationLat: "4.90160",
        locationLng: "-1.78310",
        locationAccuracyM: 35,
        pinMoved: true,
        locationSkipped: false,
        status: "open",
        createdAt: minutesFromNow(-15),
        finalizedAt: null,
      },
      {
        id: sessPast1Id,
        classId: classCs305Id,
        topic: "Week 4 · Network Layer & IP Routing",
        startsAt: daysAgo(7, 10, 0),
        endsAt: daysAgo(7, 11, 30),
        lateAfterMinutes: null,
        venue: "Lecture Theatre 2 (LT2)",
        expectedStudents: 8,
        codeMode: "rotating",
        radiusM: 100,
        locationLat: "4.90160",
        locationLng: "-1.78310",
        locationAccuracyM: 30,
        pinMoved: false,
        locationSkipped: false,
        status: "finalized",
        createdAt: daysAgo(7, 9, 55),
        finalizedAt: daysAgo(7, 11, 35),
      },
      {
        id: sessPast2Id,
        classId: classCs305Id,
        topic: "Week 3 · Data Link Protocols & Switching",
        startsAt: daysAgo(14, 10, 0),
        endsAt: daysAgo(14, 11, 30),
        lateAfterMinutes: null,
        venue: "Lecture Theatre 2 (LT2)",
        expectedStudents: 8,
        codeMode: "rotating",
        radiusM: 100,
        locationLat: "4.90160",
        locationLng: "-1.78310",
        locationAccuracyM: 42,
        pinMoved: false,
        locationSkipped: false,
        status: "finalized",
        createdAt: daysAgo(14, 9, 55),
        finalizedAt: daysAgo(14, 11, 35),
      },
      {
        id: sess411PastId,
        classId: classCs411Id,
        topic: "Week 4 · Raft Consensus & Replication",
        startsAt: daysAgo(5, 14, 0),
        endsAt: daysAgo(5, 15, 30),
        lateAfterMinutes: null,
        venue: "CS Seminar Room 1",
        expectedStudents: 4,
        codeMode: "rotating",
        radiusM: 50,
        locationLat: "4.90220",
        locationLng: "-1.78240",
        locationAccuracyM: 25,
        pinMoved: true,
        locationSkipped: false,
        status: "finalized",
        createdAt: daysAgo(5, 13, 55),
        finalizedAt: daysAgo(5, 15, 35),
      },
    );

    this.records.push(
      {
        id: "44444444-4444-4444-8444-444444444101",
        sessionId: sessLiveId,
        rosterStudentId: cs305Students[0].id,
        status: "present",
        markedAt: minutesFromNow(-10),
        flags: [],
        note: null,
        faceScore: "0.94",
        distanceM: 18,
        accuracyM: 24,
        photoKey: null,
        markedManually: false,
        reviewedBy: null,
        reviewedAt: null,
        createdAt: minutesFromNow(-10),
      },
      {
        id: "44444444-4444-4444-8444-444444444102",
        sessionId: sessLiveId,
        rosterStudentId: cs305Students[1].id,
        status: "present",
        markedAt: minutesFromNow(-9),
        flags: [],
        note: null,
        faceScore: "0.91",
        distanceM: 22,
        accuracyM: 28,
        photoKey: null,
        markedManually: false,
        reviewedBy: null,
        reviewedAt: null,
        createdAt: minutesFromNow(-9),
      },
      {
        id: "44444444-4444-4444-8444-444444444103",
        sessionId: sessLiveId,
        rosterStudentId: cs305Students[2].id,
        status: "needs_review",
        markedAt: minutesFromNow(-8),
        flags: ["FACE_MID"],
        note: "Middle-band face match score (0.52); poor lighting in back row",
        faceScore: "0.52",
        distanceM: 28,
        accuracyM: 22,
        photoKey: "yaw-checkin-wide",
        markedManually: false,
        reviewedBy: null,
        reviewedAt: null,
        createdAt: minutesFromNow(-8),
      },
      {
        id: "44444444-4444-4444-8444-444444444104",
        sessionId: sessLiveId,
        rosterStudentId: cs305Students[3].id,
        status: "present",
        markedAt: minutesFromNow(-7),
        flags: [],
        note: null,
        faceScore: "0.89",
        distanceM: 14,
        accuracyM: 19,
        photoKey: null,
        markedManually: false,
        reviewedBy: null,
        reviewedAt: null,
        createdAt: minutesFromNow(-7),
      },
      {
        id: "44444444-4444-4444-8444-444444444105",
        sessionId: sessLiveId,
        rosterStudentId: cs305Students[4].id,
        status: "needs_review",
        markedAt: minutesFromNow(-5),
        flags: ["GEO_OUTSIDE", "NO_REFERENCE"],
        note: "145 m from LT2 pin; student photo release pending approval",
        faceScore: "0.68",
        distanceM: 145,
        accuracyM: 180,
        photoKey: "kwame-checkin-wide",
        markedManually: false,
        reviewedBy: null,
        reviewedAt: null,
        createdAt: minutesFromNow(-5),
      },
    );

    cs305Students.forEach((student, idx) => {
      const present1 = idx !== 4 && idx !== 6;
      const present2 = idx !== 4 && idx !== 6 && idx !== 5;
      this.records.push(
        {
          id: randomUUID(),
          sessionId: sessPast1Id,
          rosterStudentId: student.id,
          status: present1 ? "present" : "absent",
          markedAt: present1 ? daysAgo(7, 10, 4 + idx) : null,
          flags: [],
          note: null,
          faceScore: present1 ? "0.90" : null,
          distanceM: present1 ? 20 + idx : null,
          accuracyM: present1 ? 25 : null,
          photoKey: null,
          markedManually: false,
          reviewedBy: null,
          reviewedAt: null,
          createdAt: daysAgo(7, 10, 4 + idx),
        },
        {
          id: randomUUID(),
          sessionId: sessPast2Id,
          rosterStudentId: student.id,
          status: idx === 5 ? "excused" : present2 ? "present" : "absent",
          markedAt: present2 || idx === 5 ? daysAgo(14, 10, 3 + idx) : null,
          flags: idx === 5 ? ["MANUAL_MARK"] : [],
          note: idx === 5 ? "Approved medical excuse" : null,
          faceScore: present2 ? "0.92" : null,
          distanceM: present2 ? 18 + idx : null,
          accuracyM: present2 ? 24 : null,
          photoKey: null,
          markedManually: idx === 5,
          reviewedBy: idx === 5 ? ownerUserId : null,
          reviewedAt: idx === 5 ? daysAgo(14, 11, 30) : null,
          createdAt: daysAgo(14, 10, 3 + idx),
        },
      );
    });

    cs411Students.forEach((student, idx) => {
      const present = idx !== 2;
      this.records.push({
        id: randomUUID(),
        sessionId: sess411PastId,
        rosterStudentId: student.id,
        status: present ? "present" : "absent",
        markedAt: present ? daysAgo(5, 14, 3 + idx) : null,
        flags: [],
        note: null,
        faceScore: present ? "0.93" : null,
        distanceM: present ? 12 + idx : null,
        accuracyM: present ? 18 : null,
        photoKey: null,
        markedManually: false,
        reviewedBy: null,
        reviewedAt: null,
        createdAt: daysAgo(5, 14, 3 + idx),
      });
    });

    this.audits.push(
      {
        id: randomUUID(),
        actorUserId: ownerUserId,
        entityType: "session",
        entityId: sessLiveId,
        action: "session_created",
        details: { courseCode: "CS 305", status: "open" },
        createdAt: minutesFromNow(-15),
      },
      {
        id: randomUUID(),
        actorUserId: ownerUserId,
        entityType: "session",
        entityId: sess411PastId,
        action: "session_finalized",
        details: { absencesAdded: 1 },
        createdAt: daysAgo(5, 15, 35),
      },
      {
        id: randomUUID(),
        actorUserId: ownerUserId,
        entityType: "session",
        entityId: sessPast1Id,
        action: "session_finalized",
        details: { absencesAdded: 2 },
        createdAt: daysAgo(7, 11, 35),
      },
      {
        id: randomUUID(),
        actorUserId: ownerUserId,
        actorEmail: "mensah@school.edu.gh",
        actorRole: "lecturer",
        ip: "10.24.8.14",
        entityType: "class",
        entityId: classCs305Id,
        action: "roster_committed",
        details: { rowCount: 8, courseCode: "CS 305" },
        createdAt: daysAgo(27, 9, 15),
      },
      {
        id: randomUUID(),
        actorUserId: ownerUserId,
        actorEmail: "mensah@school.edu.gh",
        actorRole: "lecturer",
        ip: "10.24.8.14",
        entityType: "session",
        entityId: sessPast1Id,
        action: "session_reopened",
        reason: "Late medical excuse document submitted by two students.",
        details: {
          courseCode: "CS 305",
          lecturerName: "Dr. Kwesi Mensah",
          reason: "Late medical excuse document submitted by two students.",
        },
        createdAt: daysAgo(6, 10, 12),
      },
      {
        id: randomUUID(),
        actorUserId: "user_mock_lecturer_3",
        actorEmail: "kboateng@school.edu.gh",
        actorRole: "lecturer",
        ip: "10.24.9.33",
        entityType: "roster",
        entityId: "11111111-1111-4111-8111-111111111103",
        action: "roster_high_unmatched_alert",
        details: {
          courseCode: "CS 215",
          unmatchedCount: 14,
          totalCount: 18,
        },
        createdAt: daysAgo(3, 15, 10),
      },
    );
  }
}

export const memoryStore = new MemoryAttendanceStore();

export function hasDatabaseConnection(): boolean {
  return Boolean(process.env.DATABASE_URL);
}
