import { randomUUID } from "node:crypto";
import ExcelJS from "exceljs";
import { Router, type IRouter, type Request } from "express";
import { z } from "zod";
import {
  memoryStore,
  type StoredCourse,
  type StoredDepartment,
  type StoredLocation,
  type StoredProgramme,
} from "../../lib/attendanceStore";
import { requireAdmin } from "../../lib/authUtils";

const router: IRouter = Router();
router.use("/admin/reference", requireAdmin);

function isSuperAdmin(req: Request): boolean {
  return req.authSession?.role === "super_admin";
}

function auditRefAction(
  req: Request,
  entityType: string,
  entityId: string,
  action: string,
  before?: Record<string, unknown> | null,
  after?: Record<string, unknown> | null,
  details?: Record<string, unknown>,
) {
  memoryStore.recordAdminAudit({
    actorUserId: req.authSession?.userId ?? "admin_super_1",
    actorEmail: req.authSession?.email ?? "admin@school.edu.gh",
    actorRole: req.authSession?.role ?? "super_admin",
    ip: req.ip,
    entityType,
    entityId,
    action,
    before,
    after,
    details,
  });
}

// ---------- DEPARTMENTS ----------
const CreateDepartmentBody = z.object({
  name: z.string().trim().min(2, "Department name must be at least 2 characters").max(120),
  code: z.string().trim().min(2, "Department code must be at least 2 characters").max(16).optional(),
});

const UpdateDepartmentBody = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    code: z.string().trim().min(2).max(16).optional(),
    active: z.boolean().optional(),
  })
  .refine((d) => d.name !== undefined || d.code !== undefined || d.active !== undefined, {
    message: "At least one field (name, code, or active) must be provided.",
  });

function buildDepartmentResponse(dept: StoredDepartment) {
  const nameLower = dept.name.toLowerCase();
  const linkedClasses = memoryStore.classes.filter((c) => c.department.toLowerCase() === nameLower);
  const classIds = new Set(linkedClasses.map((c) => c.id));
  const studentsCount = memoryStore.roster.filter((r) => classIds.has(r.classId)).length;
  const lecturersCount = memoryStore.lecturerProfiles.filter((l) =>
    l.departments.some((d) => d.toLowerCase() === nameLower),
  ).length;

  return {
    id: dept.id,
    name: dept.name,
    code: dept.code,
    active: dept.active,
    classesCount: linkedClasses.length,
    studentsCount,
    lecturersCount,
    createdAt: dept.createdAt.toISOString(),
    updatedAt: dept.updatedAt.toISOString(),
  };
}

router.get("/admin/reference/departments", (_req, res): void => {
  const items = memoryStore.departmentRecords
    .slice()
    .sort((a, b) => (a.active !== b.active ? (a.active ? -1 : 1) : a.name.localeCompare(b.name)))
    .map(buildDepartmentResponse);
  res.json(items);
});

router.post("/admin/reference/departments", (req, res): void => {
  if (!isSuperAdmin(req)) {
    res.status(403).json({ error: "Only super administrators can add departments." });
    return;
  }
  const parsed = CreateDepartmentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? parsed.error.message });
    return;
  }

  const name = parsed.data.name.trim();
  if (memoryStore.departmentRecords.some((d) => d.name.toLowerCase() === name.toLowerCase())) {
    res.status(409).json({ error: `Department "${name}" already exists.` });
    return;
  }

  const rawCode =
    parsed.data.code?.trim().toUpperCase() ||
    name
      .split(/\s+/)
      .filter((w) => !["and", "of", "&", "the"].includes(w.toLowerCase()))
      .map((w) => w[0] ?? "")
      .join("")
      .toUpperCase()
      .slice(0, 6) ||
    "DEPT";
  const dupCode = memoryStore.departmentRecords.some((d) => d.code.toLowerCase() === rawCode.toLowerCase());
  const code = dupCode ? `${rawCode.slice(0, 4)}${memoryStore.departmentRecords.length + 1}` : rawCode;

  const now = new Date();
  const created: StoredDepartment = { id: randomUUID(), name, code, active: true, createdAt: now, updatedAt: now };
  memoryStore.departmentRecords.push(created);
  memoryStore.syncActiveDepartmentNames();
  auditRefAction(req, "reference_department", created.id, "department_created", null, {
    name: created.name,
    code: created.code,
    active: created.active,
  });
  res.status(201).json(buildDepartmentResponse(created));
});

router.patch("/admin/reference/departments/:departmentId", (req, res): void => {
  if (!isSuperAdmin(req)) {
    res.status(403).json({ error: "Only super administrators can modify departments." });
    return;
  }
  const parsed = UpdateDepartmentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? parsed.error.message });
    return;
  }
  const dept = memoryStore.departmentRecords.find((d) => d.id === req.params.departmentId);
  if (!dept) {
    res.status(404).json({ error: "Department not found." });
    return;
  }

  const before = { name: dept.name, code: dept.code, active: dept.active };
  if (parsed.data.name !== undefined) {
    const nextName = parsed.data.name.trim();
    if (memoryStore.departmentRecords.some((d) => d.id !== dept.id && d.name.toLowerCase() === nextName.toLowerCase())) {
      res.status(409).json({ error: `Department "${nextName}" already exists.` });
      return;
    }
    const oldLower = dept.name.toLowerCase();
    if (nextName !== dept.name) {
      for (const cls of memoryStore.classes) if (cls.department.toLowerCase() === oldLower) cls.department = nextName;
      for (const p of memoryStore.programmeRecords) if (p.departmentId === dept.id) p.departmentName = nextName;
      for (const c of memoryStore.courseRecords) if (c.departmentId === dept.id) c.departmentName = nextName;
      for (const l of memoryStore.lecturerProfiles) {
        l.departments = l.departments.map((d) => (d.toLowerCase() === oldLower ? nextName : d));
      }
      dept.name = nextName;
    }
  }
  if (parsed.data.code !== undefined) {
    const nextCode = parsed.data.code.trim().toUpperCase();
    if (memoryStore.departmentRecords.some((d) => d.id !== dept.id && d.code.toLowerCase() === nextCode.toLowerCase())) {
      res.status(409).json({ error: `Department code "${nextCode}" is already in use.` });
      return;
    }
    dept.code = nextCode;
  }
  if (parsed.data.active !== undefined) dept.active = parsed.data.active;
  dept.updatedAt = new Date();
  memoryStore.syncActiveDepartmentNames();
  memoryStore.syncActiveCourseNames();

  const action =
    parsed.data.active !== undefined && parsed.data.active !== before.active
      ? parsed.data.active
        ? "department_reactivated"
        : "department_deactivated"
      : "department_updated";
  auditRefAction(req, "reference_department", dept.id, action, before, {
    name: dept.name,
    code: dept.code,
    active: dept.active,
  });
  res.json(buildDepartmentResponse(dept));
});

// ---------- PROGRAMMES ----------
const CreateProgrammeBody = z.object({
  name: z.string().trim().min(2).max(140),
  code: z.string().trim().min(2).max(20).optional(),
  departmentId: z.string().trim().min(1),
});

const UpdateProgrammeBody = z.object({
  name: z.string().trim().min(2).max(140).optional(),
  code: z.string().trim().min(2).max(20).optional(),
  departmentId: z.string().trim().min(1).optional(),
  active: z.boolean().optional(),
});

function buildProgrammeResponse(p: StoredProgramme) {
  const coursesCount = memoryStore.courseRecords.filter((c) => c.programmeIds.includes(p.id)).length;
  return {
    id: p.id,
    name: p.name,
    code: p.code,
    departmentId: p.departmentId,
    departmentName: p.departmentName,
    active: p.active,
    coursesCount,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

router.get("/admin/reference/programmes", (_req, res): void => {
  const items = memoryStore.programmeRecords
    .slice()
    .sort((a, b) => (a.active !== b.active ? (a.active ? -1 : 1) : a.name.localeCompare(b.name)))
    .map(buildProgrammeResponse);
  res.json(items);
});

router.post("/admin/reference/programmes", (req, res): void => {
  if (!isSuperAdmin(req)) {
    res.status(403).json({ error: "Only super administrators can manage programmes." });
    return;
  }
  const parsed = CreateProgrammeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? parsed.error.message });
    return;
  }
  const dept = memoryStore.departmentRecords.find((d) => d.id === parsed.data.departmentId);
  if (!dept) {
    res.status(404).json({ error: "Parent department not found." });
    return;
  }
  const name = parsed.data.name.trim();
  if (memoryStore.programmeRecords.some((p) => p.name.toLowerCase() === name.toLowerCase())) {
    res.status(409).json({ error: `Programme "${name}" already exists.` });
    return;
  }
  const code =
    parsed.data.code?.trim().toUpperCase() ||
    name
      .split(/\s+/)
      .map((w) => w[0] ?? "")
      .join("")
      .toUpperCase()
      .slice(0, 8);
  const now = new Date();
  const created: StoredProgramme = {
    id: randomUUID(),
    name,
    code,
    departmentId: dept.id,
    departmentName: dept.name,
    active: true,
    createdAt: now,
    updatedAt: now,
  };
  memoryStore.programmeRecords.push(created);
  memoryStore.syncActiveProgrammeNames();
  auditRefAction(req, "reference_programme", created.id, "programme_created", null, {
    name: created.name,
    code: created.code,
    departmentName: created.departmentName,
    active: created.active,
  });
  res.status(201).json(buildProgrammeResponse(created));
});

router.patch("/admin/reference/programmes/:programmeId", (req, res): void => {
  if (!isSuperAdmin(req)) {
    res.status(403).json({ error: "Only super administrators can modify programmes." });
    return;
  }
  const parsed = UpdateProgrammeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? parsed.error.message });
    return;
  }
  const prog = memoryStore.programmeRecords.find((p) => p.id === req.params.programmeId);
  if (!prog) {
    res.status(404).json({ error: "Programme not found." });
    return;
  }
  const before = { name: prog.name, code: prog.code, departmentName: prog.departmentName, active: prog.active };
  if (parsed.data.name !== undefined) {
    const nextName = parsed.data.name.trim();
    if (memoryStore.programmeRecords.some((p) => p.id !== prog.id && p.name.toLowerCase() === nextName.toLowerCase())) {
      res.status(409).json({ error: `Programme "${nextName}" already exists.` });
      return;
    }
    const oldName = prog.name;
    prog.name = nextName;
    for (const c of memoryStore.courseRecords) {
      c.programmeNames = c.programmeNames.map((n) => (n === oldName ? nextName : n));
    }
    for (const cls of memoryStore.classes) {
      if (cls.programme === oldName) cls.programme = nextName;
    }
  }
  if (parsed.data.code !== undefined) prog.code = parsed.data.code.trim().toUpperCase();
  if (parsed.data.departmentId !== undefined) {
    const dept = memoryStore.departmentRecords.find((d) => d.id === parsed.data.departmentId);
    if (!dept) {
      res.status(404).json({ error: "Department not found." });
      return;
    }
    prog.departmentId = dept.id;
    prog.departmentName = dept.name;
  }
  if (parsed.data.active !== undefined) prog.active = parsed.data.active;
  prog.updatedAt = new Date();
  memoryStore.syncActiveProgrammeNames();
  memoryStore.syncActiveCourseNames();
  auditRefAction(req, "reference_programme", prog.id, "programme_updated", before, {
    name: prog.name,
    code: prog.code,
    departmentName: prog.departmentName,
    active: prog.active,
  });
  res.json(buildProgrammeResponse(prog));
});

// ---------- COURSES ----------
const CreateCourseBody = z.object({
  code: z.string().trim().min(2).max(24),
  title: z.string().trim().min(2).max(160),
  departmentId: z.string().trim().min(1),
  programmeIds: z.array(z.string().trim().min(1)).min(1, "Select at least one programme."),
  level: z.number().int().min(100).max(900),
});

const UpdateCourseBody = z.object({
  code: z.string().trim().min(2).max(24).optional(),
  title: z.string().trim().min(2).max(160).optional(),
  departmentId: z.string().trim().min(1).optional(),
  programmeIds: z.array(z.string().trim().min(1)).min(1).optional(),
  level: z.number().int().min(100).max(900).optional(),
  active: z.boolean().optional(),
});

function buildCourseResponse(c: StoredCourse) {
  return {
    id: c.id,
    code: c.code,
    title: c.title,
    departmentId: c.departmentId,
    departmentName: c.departmentName,
    programmeIds: c.programmeIds,
    programmeNames: c.programmeNames,
    level: c.level,
    active: c.active,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}

router.get("/admin/reference/courses", (_req, res): void => {
  const items = memoryStore.courseRecords
    .slice()
    .sort((a, b) => (a.active !== b.active ? (a.active ? -1 : 1) : a.code.localeCompare(b.code)))
    .map(buildCourseResponse);
  res.json(items);
});

router.post("/admin/reference/courses", (req, res): void => {
  if (!isSuperAdmin(req)) {
    res.status(403).json({ error: "Only super administrators can add courses." });
    return;
  }
  const parsed = CreateCourseBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? parsed.error.message });
    return;
  }
  const dept = memoryStore.departmentRecords.find((d) => d.id === parsed.data.departmentId);
  if (!dept) {
    res.status(404).json({ error: "Department not found." });
    return;
  }
  const code = parsed.data.code.trim().toUpperCase();
  if (memoryStore.courseRecords.some((c) => c.code.toLowerCase() === code.toLowerCase())) {
    res.status(409).json({ error: `Course code "${code}" already exists.` });
    return;
  }
  const progs = memoryStore.programmeRecords.filter((p) => parsed.data.programmeIds.includes(p.id));
  if (progs.length === 0) {
    res.status(400).json({ error: "Select at least one valid programme." });
    return;
  }
  const now = new Date();
  const created: StoredCourse = {
    id: randomUUID(),
    code,
    title: parsed.data.title.trim(),
    departmentId: dept.id,
    departmentName: dept.name,
    programmeIds: progs.map((p) => p.id),
    programmeNames: progs.map((p) => p.name),
    level: parsed.data.level,
    active: true,
    createdAt: now,
    updatedAt: now,
  };
  memoryStore.courseRecords.push(created);
  memoryStore.syncActiveCourseNames();
  auditRefAction(req, "reference_course", created.id, "course_created", null, {
    code: created.code,
    title: created.title,
    level: created.level,
    programmes: created.programmeNames,
  });
  res.status(201).json(buildCourseResponse(created));
});

router.patch("/admin/reference/courses/:courseId", (req, res): void => {
  if (!isSuperAdmin(req)) {
    res.status(403).json({ error: "Only super administrators can edit courses." });
    return;
  }
  const parsed = UpdateCourseBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? parsed.error.message });
    return;
  }
  const course = memoryStore.courseRecords.find((c) => c.id === req.params.courseId);
  if (!course) {
    res.status(404).json({ error: "Course not found." });
    return;
  }
  const before = {
    code: course.code,
    title: course.title,
    level: course.level,
    active: course.active,
    programmeNames: course.programmeNames,
  };
  if (parsed.data.code !== undefined) {
    const nextCode = parsed.data.code.trim().toUpperCase();
    if (memoryStore.courseRecords.some((c) => c.id !== course.id && c.code.toLowerCase() === nextCode.toLowerCase())) {
      res.status(409).json({ error: `Course code "${nextCode}" already exists.` });
      return;
    }
    course.code = nextCode;
  }
  if (parsed.data.title !== undefined) course.title = parsed.data.title.trim();
  if (parsed.data.departmentId !== undefined) {
    const dept = memoryStore.departmentRecords.find((d) => d.id === parsed.data.departmentId);
    if (!dept) {
      res.status(404).json({ error: "Department not found." });
      return;
    }
    course.departmentId = dept.id;
    course.departmentName = dept.name;
  }
  if (parsed.data.programmeIds !== undefined) {
    const progs = memoryStore.programmeRecords.filter((p) => parsed.data.programmeIds!.includes(p.id));
    if (progs.length === 0) {
      res.status(400).json({ error: "Select at least one valid programme." });
      return;
    }
    course.programmeIds = progs.map((p) => p.id);
    course.programmeNames = progs.map((p) => p.name);
  }
  if (parsed.data.level !== undefined) course.level = parsed.data.level;
  if (parsed.data.active !== undefined) course.active = parsed.data.active;
  course.updatedAt = new Date();
  memoryStore.syncActiveCourseNames();
  auditRefAction(req, "reference_course", course.id, "course_updated", before, {
    code: course.code,
    title: course.title,
    level: course.level,
    active: course.active,
    programmeNames: course.programmeNames,
  });
  res.json(buildCourseResponse(course));
});

// ---------- ACADEMIC CONFIG (LEVELS, SEMESTERS, CURRENT ACADEMIC YEAR) ----------
const UpdateAcademicBody = z.object({
  levels: z.array(z.number().int().min(100).max(900)).min(1),
  semesters: z.array(z.string().trim().min(2).max(40)).min(1),
  currentAcademicYear: z.string().trim().min(4).max(32),
  academicYears: z.array(z.string().trim().min(4).max(32)).min(1),
});

router.get("/admin/reference/academic", (_req, res): void => {
  res.json(memoryStore.academicConfig);
});

router.post("/admin/reference/academic", (req, res): void => {
  if (!isSuperAdmin(req)) {
    res.status(403).json({ error: "Only super administrators can update academic term lists." });
    return;
  }
  const parsed = UpdateAcademicBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? parsed.error.message });
    return;
  }
  const before = { ...memoryStore.academicConfig };
  const years = Array.from(new Set([...parsed.data.academicYears, parsed.data.currentAcademicYear]));
  memoryStore.academicConfig = {
    levels: Array.from(new Set(parsed.data.levels)).sort((a, b) => a - b),
    semesters: Array.from(new Set(parsed.data.semesters)),
    currentAcademicYear: parsed.data.currentAcademicYear,
    academicYears: years,
    updatedAt: new Date().toISOString(),
  };
  auditRefAction(
    req,
    "reference_academic",
    "academic_config",
    "academic_config_updated",
    before,
    { ...memoryStore.academicConfig },
  );
  res.json(memoryStore.academicConfig);
});

// ---------- LOCATIONS (NAMES & BUILDING ONLY — NO COORDINATES OR RADIUS) ----------
const CreateLocationBody = z.object({
  name: z.string().trim().min(2).max(120),
  building: z.string().trim().max(120).optional().default(""),
});

const UpdateLocationBody = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  building: z.string().trim().max(120).optional(),
  active: z.boolean().optional(),
});

function buildLocationResponse(loc: StoredLocation) {
  return {
    id: loc.id,
    name: loc.name,
    building: loc.building,
    active: loc.active,
    createdAt: loc.createdAt.toISOString(),
    updatedAt: loc.updatedAt.toISOString(),
  };
}

router.get("/admin/reference/locations", (_req, res): void => {
  const items = memoryStore.locationRecords
    .slice()
    .sort((a, b) => (a.active !== b.active ? (a.active ? -1 : 1) : a.name.localeCompare(b.name)))
    .map(buildLocationResponse);
  res.json(items);
});

router.post("/admin/reference/locations", (req, res): void => {
  if (!isSuperAdmin(req)) {
    res.status(403).json({ error: "Only super administrators can add locations." });
    return;
  }
  const parsed = CreateLocationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? parsed.error.message });
    return;
  }
  const name = parsed.data.name.trim();
  if (memoryStore.locationRecords.some((l) => l.name.toLowerCase() === name.toLowerCase())) {
    res.status(409).json({ error: `Location "${name}" already exists.` });
    return;
  }
  const now = new Date();
  const created: StoredLocation = {
    id: randomUUID(),
    name,
    building: parsed.data.building.trim(),
    active: true,
    createdAt: now,
    updatedAt: now,
  };
  memoryStore.locationRecords.push(created);
  memoryStore.syncActiveLocationNames();
  auditRefAction(req, "reference_location", created.id, "location_created", null, {
    name: created.name,
    building: created.building,
  });
  res.status(201).json(buildLocationResponse(created));
});

router.patch("/admin/reference/locations/:locationId", (req, res): void => {
  if (!isSuperAdmin(req)) {
    res.status(403).json({ error: "Only super administrators can edit locations." });
    return;
  }
  const parsed = UpdateLocationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? parsed.error.message });
    return;
  }
  const loc = memoryStore.locationRecords.find((l) => l.id === req.params.locationId);
  if (!loc) {
    res.status(404).json({ error: "Location not found." });
    return;
  }
  const before = { name: loc.name, building: loc.building, active: loc.active };
  if (parsed.data.name !== undefined) {
    const nextName = parsed.data.name.trim();
    if (memoryStore.locationRecords.some((l) => l.id !== loc.id && l.name.toLowerCase() === nextName.toLowerCase())) {
      res.status(409).json({ error: `Location "${nextName}" already exists.` });
      return;
    }
    loc.name = nextName;
  }
  if (parsed.data.building !== undefined) loc.building = parsed.data.building.trim();
  if (parsed.data.active !== undefined) loc.active = parsed.data.active;
  loc.updatedAt = new Date();
  memoryStore.syncActiveLocationNames();
  auditRefAction(req, "reference_location", loc.id, "location_updated", before, {
    name: loc.name,
    building: loc.building,
    active: loc.active,
  });
  res.json(buildLocationResponse(loc));
});

// ---------- BULK IMPORT FROM EXCEL / CSV ----------
const BulkImportBody = z.object({
  target: z.enum(["departments", "programmes", "courses", "locations"]),
  fileBase64: z.string().optional(),
  csvText: z.string().optional(),
});

function parseCsvLines(csvText: string): string[][] {
  return csvText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split(",").map((cell) => cell.trim().replace(/^"|"$/g, "")));
}

router.post("/admin/reference/import", async (req, res): Promise<void> => {
  if (!isSuperAdmin(req)) {
    res.status(403).json({ error: "Only super administrators can bulk import reference data." });
    return;
  }
  const parsed = BulkImportBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? parsed.error.message });
    return;
  }

  let rows: string[][] = [];
  if (parsed.data.fileBase64) {
    try {
      const buf = Buffer.from(parsed.data.fileBase64, "base64");
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buf as unknown as ArrayBuffer);
      const sheet = workbook.worksheets[0];
      if (sheet) {
        sheet.eachRow((row) => {
          const vals = row.values;
          if (Array.isArray(vals)) {
            rows.push(vals.slice(1).map((v) => String(v ?? "").trim()));
          }
        });
      }
    } catch {
      res.status(400).json({ error: "Could not parse uploaded Excel workbook. Try CSV or a valid .xlsx file." });
      return;
    }
  } else if (parsed.data.csvText) {
    rows = parseCsvLines(parsed.data.csvText);
  } else {
    res.status(400).json({ error: "Provide either CSV text or an Excel (.xlsx) file." });
    return;
  }

  if (rows.length === 0) {
    res.status(400).json({ error: "No rows found in import input." });
    return;
  }

  // Skip header row if detected
  const firstRowLower = rows[0].map((c) => c.toLowerCase()).join(" ");
  const dataRows =
    firstRowLower.includes("name") || firstRowLower.includes("code") || firstRowLower.includes("title")
      ? rows.slice(1)
      : rows;

  let added = 0;
  let skipped = 0;
  const errors: string[] = [];
  const now = new Date();

  for (let i = 0; i < dataRows.length; i++) {
    const cols = dataRows[i];
    if (!cols.some(Boolean)) continue;

    if (parsed.data.target === "departments") {
      const [name, codeRaw] = cols;
      if (!name || name.length < 2) {
        errors.push(`Row ${i + 1}: missing department name.`);
        continue;
      }
      if (memoryStore.departmentRecords.some((d) => d.name.toLowerCase() === name.toLowerCase())) {
        skipped += 1;
        continue;
      }
      const code =
        (codeRaw || name.slice(0, 4)).toUpperCase().replace(/[^A-Z0-9]/g, "") || `D${memoryStore.departmentRecords.length + 1}`;
      memoryStore.departmentRecords.push({ id: randomUUID(), name, code, active: true, createdAt: now, updatedAt: now });
      added += 1;
    } else if (parsed.data.target === "programmes") {
      const [name, codeRaw, deptName] = cols;
      if (!name || !deptName) {
        errors.push(`Row ${i + 1}: requires Name, Code, Department.`);
        continue;
      }
      const dept = memoryStore.departmentRecords.find((d) => d.name.toLowerCase() === deptName.toLowerCase());
      if (!dept) {
        errors.push(`Row ${i + 1}: unknown department "${deptName}".`);
        continue;
      }
      if (memoryStore.programmeRecords.some((p) => p.name.toLowerCase() === name.toLowerCase())) {
        skipped += 1;
        continue;
      }
      memoryStore.programmeRecords.push({
        id: randomUUID(),
        name,
        code: (codeRaw || name.slice(0, 6)).toUpperCase(),
        departmentId: dept.id,
        departmentName: dept.name,
        active: true,
        createdAt: now,
        updatedAt: now,
      });
      added += 1;
    } else if (parsed.data.target === "courses") {
      const [codeRaw, title, deptName, progName, levelRaw] = cols;
      if (!codeRaw || !title || !deptName || !progName) {
        errors.push(`Row ${i + 1}: requires Code, Title, Department, Programme, Level.`);
        continue;
      }
      const code = codeRaw.toUpperCase();
      if (memoryStore.courseRecords.some((c) => c.code.toLowerCase() === code.toLowerCase())) {
        skipped += 1;
        continue;
      }
      const dept = memoryStore.departmentRecords.find((d) => d.name.toLowerCase() === deptName.toLowerCase());
      const prog = memoryStore.programmeRecords.find((p) => p.name.toLowerCase() === progName.toLowerCase());
      if (!dept || !prog) {
        errors.push(`Row ${i + 1}: unknown department or programme ("${deptName}" / "${progName}").`);
        continue;
      }
      const levelNum = Number(levelRaw) || 100;
      memoryStore.courseRecords.push({
        id: randomUUID(),
        code,
        title,
        departmentId: dept.id,
        departmentName: dept.name,
        programmeIds: [prog.id],
        programmeNames: [prog.name],
        level: levelNum,
        active: true,
        createdAt: now,
        updatedAt: now,
      });
      added += 1;
    } else if (parsed.data.target === "locations") {
      const [name, building = ""] = cols;
      if (!name || name.length < 2) {
        errors.push(`Row ${i + 1}: missing location name.`);
        continue;
      }
      if (memoryStore.locationRecords.some((l) => l.name.toLowerCase() === name.toLowerCase())) {
        skipped += 1;
        continue;
      }
      memoryStore.locationRecords.push({
        id: randomUUID(),
        name,
        building,
        active: true,
        createdAt: now,
        updatedAt: now,
      });
      added += 1;
    }
  }

  memoryStore.syncActiveDepartmentNames();
  memoryStore.syncActiveProgrammeNames();
  memoryStore.syncActiveCourseNames();
  memoryStore.syncActiveLocationNames();

  auditRefAction(req, `reference_${parsed.data.target}`, "bulk-import", "reference_bulk_imported", null, {
    target: parsed.data.target,
    added,
    skipped,
    errorsCount: errors.length,
  });

  res.json({ added, skipped, errors });
});

// ---------- LECTURER REQUESTS INBOX ----------
const ResolveRequestBody = z.object({
  decision: z.enum(["approved", "rejected"]),
  adminNote: z.string().trim().max(240).optional(),
});

router.get("/admin/reference/requests", (_req, res): void => {
  const items = memoryStore.referenceRequests
    .slice()
    .sort((a, b) => {
      if (a.status === "pending" && b.status !== "pending") return -1;
      if (a.status !== "pending" && b.status === "pending") return 1;
      return b.createdAt.getTime() - a.createdAt.getTime();
    })
    .map((r) => ({
      ...r,
      createdAt: r.createdAt.toISOString(),
      resolvedAt: r.resolvedAt ? r.resolvedAt.toISOString() : null,
    }));
  res.json(items);
});

router.post("/admin/reference/requests/:requestId/resolve", (req, res): void => {
  if (!isSuperAdmin(req)) {
    res.status(403).json({ error: "Only super administrators can approve or reject reference requests." });
    return;
  }
  const parsed = ResolveRequestBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? parsed.error.message });
    return;
  }
  const reqItem = memoryStore.referenceRequests.find((r) => r.id === req.params.requestId);
  if (!reqItem) {
    res.status(404).json({ error: "Reference request not found." });
    return;
  }
  if (reqItem.status !== "pending") {
    res.status(409).json({ error: "This request has already been resolved." });
    return;
  }

  const now = new Date();
  reqItem.status = parsed.data.decision;
  reqItem.adminNote = parsed.data.adminNote;
  reqItem.resolvedAt = now;

  if (parsed.data.decision === "approved") {
    if (reqItem.type === "course" && reqItem.courseCode && reqItem.courseTitle) {
      const dept =
        memoryStore.departmentRecords.find(
          (d) => d.name.toLowerCase() === (reqItem.departmentName ?? "").toLowerCase(),
        ) ?? memoryStore.departmentRecords[0];
      const prog =
        memoryStore.programmeRecords.find(
          (p) => p.name.toLowerCase() === (reqItem.programmeName ?? "").toLowerCase(),
        ) ?? memoryStore.programmeRecords[0];
      if (!memoryStore.courseRecords.some((c) => c.code.toLowerCase() === reqItem.courseCode!.toLowerCase())) {
        memoryStore.courseRecords.push({
          id: randomUUID(),
          code: reqItem.courseCode.toUpperCase(),
          title: reqItem.courseTitle,
          departmentId: dept.id,
          departmentName: dept.name,
          programmeIds: prog ? [prog.id] : [],
          programmeNames: prog ? [prog.name] : [],
          level: reqItem.level ?? 300,
          active: true,
          createdAt: now,
          updatedAt: now,
        });
        memoryStore.syncActiveCourseNames();
      }
    } else if (reqItem.type === "location" && reqItem.locationName) {
      if (
        !memoryStore.locationRecords.some(
          (l) => l.name.toLowerCase() === reqItem.locationName!.toLowerCase(),
        )
      ) {
        memoryStore.locationRecords.push({
          id: randomUUID(),
          name: reqItem.locationName,
          building: reqItem.building ?? "",
          active: true,
          createdAt: now,
          updatedAt: now,
        });
        memoryStore.syncActiveLocationNames();
      }
    }
  }

  auditRefAction(
    req,
    "reference_request",
    reqItem.id,
    parsed.data.decision === "approved" ? "reference_request_approved" : "reference_request_rejected",
    { status: "pending" },
    { status: reqItem.status, adminNote: reqItem.adminNote },
    { type: reqItem.type },
  );

  res.json({
    ...reqItem,
    createdAt: reqItem.createdAt.toISOString(),
    resolvedAt: reqItem.resolvedAt?.toISOString() ?? null,
  });
});

export default router;
