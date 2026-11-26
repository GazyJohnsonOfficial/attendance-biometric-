import { randomInt, randomUUID } from "node:crypto";
import { Router, type IRouter } from "express";
import { z } from "zod";
import { memoryStore } from "../../lib/attendanceStore";
import {
  extractBearerToken,
  hashPassword,
  issueReauthToken,
  issueSessionToken,
  requireAdmin,
  resolveRequestSession,
  revokeAllUserSessions,
  revokeSessionToken,
  verifyPasscodeConstantTime,
  verifyPassword,
} from "../../lib/authUtils";

const router: IRouter = Router();

const KNOWN_ADMINS: Record<
  string,
  { id: string; fullName: string; role: "super_admin" | "department_admin"; departments?: string[] }
> = {
  "admin@school.edu.gh": {
    id: "admin_super_1",
    fullName: "Super Administrator",
    role: "super_admin",
  },
  "co.admin@school.edu.gh": {
    id: "admin_super_2",
    fullName: "Co-Administrator (Provost)",
    role: "super_admin",
  },
  "dept.admin@school.edu.gh": {
    id: "admin_dept_cs_1",
    fullName: "CS Department Admin",
    role: "department_admin",
    departments: ["Computer Science"],
  },
};

function getEnvAdminPasscode(): string {
  return process.env.ADMIN_PASSCODE?.trim() || "";
}

function isAdminPasswordConfigured(): boolean {
  return Boolean(getEnvAdminPasscode() || memoryStore.adminCredentialHash);
}

function isPreviewDemoAvailable(): boolean {
  return process.env.NODE_ENV !== "production" && !isAdminPasswordConfigured();
}

function isRecognizedAdminEmail(emailLower: string): boolean {
  return (
    Boolean(KNOWN_ADMINS[emailLower]) ||
    (Boolean(memoryStore.claimedAdminEmail) &&
      memoryStore.claimedAdminEmail?.toLowerCase() === emailLower)
  );
}

function resolveAdminProfile(emailLower: string) {
  const known = KNOWN_ADMINS[emailLower];
  if (known) {
    return {
      ...known,
      email: emailLower,
    };
  }
  return {
    id: "admin_super_1",
    fullName: "Institutional Administrator",
    email: emailLower,
    role: "super_admin" as const,
  };
}

function verifyAdminPassword(password: string): boolean {
  const envPasscode = getEnvAdminPasscode();
  if (envPasscode) {
    return verifyPasscodeConstantTime(password, envPasscode);
  }
  if (memoryStore.adminCredentialHash) {
    return verifyPassword(password, memoryStore.adminCredentialHash);
  }
  return false;
}

function checkLockout(emailLower: string): { locked: boolean; retryAfterSec: number } {
  const rec = memoryStore.loginAttempts.get(emailLower);
  if (rec?.lockedUntil && Date.now() < rec.lockedUntil) {
    return { locked: true, retryAfterSec: Math.ceil((rec.lockedUntil - Date.now()) / 1000) };
  }
  return { locked: false, retryAfterSec: 0 };
}

function recordFailedAttempt(emailLower: string, ip: string): boolean {
  const limit = memoryStore.adminSettings.failedLoginLockoutAttempts || 5;
  const rec = memoryStore.loginAttempts.get(emailLower) ?? {
    failedCount: 0,
    lockedUntil: null,
    knownIps: [],
  };
  rec.failedCount += 1;
  let justLocked = false;
  if (rec.failedCount >= limit) {
    rec.lockedUntil = Date.now() + 10 * 60 * 1000;
    justLocked = true;
    memoryStore.addSystemLog({
      level: "warn",
      category: "security",
      message: `Account temporarily locked after ${rec.failedCount} failed login attempts (${emailLower})`,
      details: { email: emailLower, ip, failedCount: rec.failedCount },
    });
  }
  memoryStore.loginAttempts.set(emailLower, rec);
  return justLocked;
}

function recordSuccessfulLoginTelemetry(emailLower: string, ip: string): void {
  const rec = memoryStore.loginAttempts.get(emailLower) ?? {
    failedCount: 0,
    lockedUntil: null,
    knownIps: [],
  };
  rec.failedCount = 0;
  rec.lockedUntil = null;
  if (ip && !rec.knownIps.includes(ip)) {
    if (rec.knownIps.length > 0) {
      memoryStore.addSystemLog({
        level: "auth",
        category: "login_alert",
        message: `New device/IP login alert for ${emailLower} from ${ip}`,
        details: { email: emailLower, newIp: ip, previousIps: rec.knownIps },
      });
    }
    rec.knownIps.push(ip);
  }
  memoryStore.loginAttempts.set(emailLower, rec);
}

const ClaimAdminBody = z.object({
  email: z.string().trim().email("Enter a valid institutional admin email.").max(254),
  fullName: z.string().trim().min(2).max(120).optional(),
  password: z.string().min(6, "Admin password must be at least 6 characters.").max(128),
});

const LoginBody = z.object({
  email: z.string().trim().email("Enter a valid institutional email.").max(254),
  password: z.string().max(128).optional(),
  accountType: z.enum(["auto", "lecturer", "admin"]).optional().default("auto"),
  demo: z.boolean().optional().default(false),
});

const VerifyTwoFactorBody = z.object({
  challengeId: z.string().min(1),
  code: z.string().trim().length(6, "Enter the 6-digit verification code."),
});

const ReauthBody = z.object({
  password: z.string().max(128).optional(),
  confirmDemo: z.boolean().optional().default(false),
});

const LecturerPasswordResetRequestBody = z.object({
  email: z.string().trim().email("Enter a valid institutional email.").max(254),
});

const LecturerPasswordResetConfirmBody = z.object({
  email: z.string().trim().email("Enter a valid institutional email.").max(254),
  code: z.string().trim().length(6, "Enter the 6-digit reset code."),
  newPassword: z.string().min(6, "New password must be at least 6 characters.").max(128),
});

const authRateWindows = new Map<string, { count: number; resetAt: number }>();
const lecturerResetCodes = new Map<string, { email: string; code: string; expiresAt: number }>();

function checkAuthRateLimit(ip: string): { allowed: boolean; retryAfterSec: number } {
  const limit = Math.max(10, memoryStore.adminSettings.apiRateLimitPerMin || 120);
  const now = Date.now();
  const entry = authRateWindows.get(ip);
  if (!entry || now > entry.resetAt) {
    authRateWindows.set(ip, { count: 1, resetAt: now + 60_000 });
    return { allowed: true, retryAfterSec: 0 };
  }
  entry.count += 1;
  if (entry.count > limit) {
    return { allowed: false, retryAfterSec: Math.ceil((entry.resetAt - now) / 1000) };
  }
  return { allowed: true, retryAfterSec: 0 };
}

router.get("/auth/status", (_req, res): void => {
  res.json({
    hasEnvAdminPasscode: Boolean(getEnvAdminPasscode()),
    adminPasswordConfigured: isAdminPasswordConfigured(),
    previewDemoAvailable: isPreviewDemoAvailable(),
    claimedAdminEmail: memoryStore.claimedAdminEmail,
    twoFactorRequiredForAdmins: memoryStore.adminSettings.twoFactorRequiredForAdmins,
    sessionTimeoutMinutes: memoryStore.adminSettings.sessionTimeoutMinutes,
  });
});

router.get("/auth/me", (req, res): void => {
  const session = resolveRequestSession(req);
  if (!session) {
    res.status(401).json({ error: "Not authenticated." });
    return;
  }
  res.json({
    user: {
      id: session.userId,
      fullName: session.fullName,
      email: session.email,
      role: session.role,
      departments: session.departments ?? [],
    },
  });
});

router.post("/auth/admin/claim", (req, res): void => {
  if (isAdminPasswordConfigured()) {
    res.status(409).json({
      error: "Admin password is already configured. Please sign in with your password.",
    });
    return;
  }

  const parsed = ClaimAdminBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? parsed.error.message });
    return;
  }

  const emailLower = parsed.data.email.trim().toLowerCase();
  const adminProfile = resolveAdminProfile(emailLower);
  if (parsed.data.fullName) {
    adminProfile.fullName = parsed.data.fullName;
  }

  memoryStore.adminCredentialHash = hashPassword(parsed.data.password);
  memoryStore.claimedAdminEmail = emailLower;

  const ttlMs = (memoryStore.adminSettings.sessionTimeoutMinutes || 30) * 60_000;
  const token = issueSessionToken(
    {
      userId: adminProfile.id,
      email: adminProfile.email,
      fullName: adminProfile.fullName,
      role: adminProfile.role,
      departments: adminProfile.departments,
    },
    ttlMs,
  );

  recordSuccessfulLoginTelemetry(emailLower, req.ip ?? "127.0.0.1");

  memoryStore.addSystemLog({
    level: "auth",
    category: "security",
    message: `Initial administrator password claimed by ${adminProfile.email}`,
    details: { email: adminProfile.email, role: adminProfile.role, ip: req.ip },
  });

  memoryStore.recordAdminAudit({
    actorUserId: adminProfile.id,
    actorEmail: adminProfile.email,
    actorRole: adminProfile.role,
    ip: req.ip,
    entityType: "admin_auth",
    entityId: adminProfile.id,
    action: "admin_password_claimed",
    details: { email: adminProfile.email, role: adminProfile.role },
  });

  res.status(201).json({
    token,
    accountType: "admin",
    user: adminProfile,
    sessionTimeoutMinutes: memoryStore.adminSettings.sessionTimeoutMinutes,
  });
});

router.post("/auth/login", (req, res): void => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? parsed.error.message });
    return;
  }

  const emailLower = parsed.data.email.trim().toLowerCase();
  const password = parsed.data.password ?? "";
  const requestedType = parsed.data.accountType;
  const ip = req.ip ?? "127.0.0.1";

  const rate = checkAuthRateLimit(ip);
  if (!rate.allowed) {
    res.status(429).json({
      error: `Too many authentication requests. Try again in ${rate.retryAfterSec}s.`,
    });
    return;
  }

  const lockState = checkLockout(emailLower);
  if (lockState.locked) {
    res.status(423).json({
      error: `Account temporarily locked due to repeated failed login attempts. Try again in ${lockState.retryAfterSec}s.`,
    });
    return;
  }

  const resolvedType =
    requestedType === "auto"
      ? isRecognizedAdminEmail(emailLower)
        ? "admin"
        : "lecturer"
      : requestedType;

  if (resolvedType === "admin") {
    const allowList = memoryStore.adminSettings.ipAllowList;
    if (allowList.length > 0 && !allowList.includes(ip) && !allowList.includes("127.0.0.1")) {
      memoryStore.addSystemLog({
        level: "auth",
        category: "security",
        message: `Blocked admin sign-in from unlisted IP (${ip})`,
        details: { email: emailLower, ip },
      });
      res.status(403).json({ error: `IP ${ip} is not in the administrator IP allow-list.` });
      return;
    }

    if (!isRecognizedAdminEmail(emailLower) && requestedType === "admin") {
      recordFailedAttempt(emailLower, ip);
      memoryStore.addSystemLog({
        level: "auth",
        category: "security",
        message: "Failed admin login attempt with unrecognized administrator email",
        details: { email: emailLower, ip },
      });
      res.status(401).json({
        error:
          "Unrecognized administrator email. Use admin@school.edu.gh or dept.admin@school.edu.gh.",
      });
      return;
    }

    if (parsed.data.demo) {
      if (!isPreviewDemoAvailable()) {
        res.status(401).json({
          error: "Demo sign-in is disabled once an admin password is set. Enter your password.",
        });
        return;
      }
    } else {
      if (!isAdminPasswordConfigured()) {
        res.status(409).json({
          code: "ADMIN_SETUP_REQUIRED",
          error:
            "No admin password has been set yet. Create an initial admin password or use Preview Demo.",
        });
        return;
      }

      if (!password) {
        recordFailedAttempt(emailLower, ip);
        memoryStore.addSystemLog({
          level: "auth",
          category: "security",
          message: "Failed admin login attempt: missing password",
          details: { email: emailLower, ip },
        });
        res.status(401).json({ error: "Enter your administrator password." });
        return;
      }

      if (!verifyAdminPassword(password)) {
        const locked = recordFailedAttempt(emailLower, ip);
        memoryStore.addSystemLog({
          level: "auth",
          category: "security",
          message: "Failed admin login attempt: invalid password",
          details: { email: emailLower, ip, locked },
        });
        res.status(locked ? 423 : 401).json({
          error: locked
            ? "Too many failed login attempts. Account temporarily locked for 10 minutes."
            : "Invalid administrator email or password.",
        });
        return;
      }
    }

    const adminProfile = resolveAdminProfile(emailLower);

    if (memoryStore.adminSettings.twoFactorRequiredForAdmins && !parsed.data.demo) {
      const challengeId = randomUUID();
      const code = String(randomInt(100000, 999999));
      memoryStore.twoFactorChallenges.set(challengeId, {
        challengeId,
        email: adminProfile.email,
        code,
        userId: adminProfile.id,
        fullName: adminProfile.fullName,
        role: adminProfile.role,
        departments: adminProfile.departments,
        expiresAt: Date.now() + 5 * 60 * 1000,
      });
      memoryStore.addSystemLog({
        level: "auth",
        category: "security",
        message: `2FA verification code issued for ${adminProfile.email}`,
        details: { email: adminProfile.email, ip },
      });
      res.status(200).json({
        requiresTwoFactor: true,
        challengeId,
        accountType: "admin",
        ...(process.env.NODE_ENV !== "production" ? { previewTwoFactorCode: code } : {}),
      });
      return;
    }

    const ttlMs = (memoryStore.adminSettings.sessionTimeoutMinutes || 30) * 60_000;
    const token = issueSessionToken(
      {
        userId: adminProfile.id,
        email: adminProfile.email,
        fullName: adminProfile.fullName,
        role: adminProfile.role,
        departments: adminProfile.departments,
      },
      ttlMs,
    );

    recordSuccessfulLoginTelemetry(emailLower, ip);

    memoryStore.addSystemLog({
      level: "auth",
      category: "security",
      message: `Administrator signed in (${adminProfile.email})`,
      details: { email: adminProfile.email, role: adminProfile.role, demo: parsed.data.demo, ip },
    });

    memoryStore.recordAdminAudit({
      actorUserId: adminProfile.id,
      actorEmail: adminProfile.email,
      actorRole: adminProfile.role,
      ip,
      entityType: "admin_auth",
      entityId: adminProfile.id,
      action: "admin_signed_in",
      details: { email: adminProfile.email, role: adminProfile.role, demo: parsed.data.demo },
    });

    res.json({
      token,
      accountType: "admin",
      user: adminProfile,
      sessionTimeoutMinutes: memoryStore.adminSettings.sessionTimeoutMinutes,
    });
    return;
  }

  // Lecturer sign-in
  const lecturer =
    memoryStore.lecturerProfiles.find((p) => p.email.toLowerCase() === emailLower) ??
    (parsed.data.demo || emailLower === "mensah@school.edu.gh"
      ? memoryStore.getOrCreateProfile("user_mock_lecturer")
      : undefined);

  if (!lecturer) {
    recordFailedAttempt(emailLower, ip);
    memoryStore.addSystemLog({
      level: "auth",
      category: "security",
      message: "Failed lecturer login attempt with unrecognized staff email",
      details: { email: emailLower, ip },
    });
    res.status(401).json({
      error: "No lecturer account found for that email. Try mensah@school.edu.gh or create an account.",
    });
    return;
  }

  if (lecturer.reviewStatus === "removed" || lecturer.reviewStatus === "suspended") {
    memoryStore.addSystemLog({
      level: "auth",
      category: "security",
      message: `${lecturer.reviewStatus === "suspended" ? "Suspended" : "Removed"} lecturer attempted sign-in`,
      details: { email: lecturer.email, userId: lecturer.userId, ip },
    });
    res.status(403).json({
      error:
        lecturer.reviewStatus === "suspended"
          ? "This lecturer account has been temporarily suspended by an administrator."
          : "This lecturer account has been removed by an administrator.",
    });
    return;
  }

  const storedHash = memoryStore.lecturerPasswordHashes.get(lecturer.email.toLowerCase());
  if (!parsed.data.demo && storedHash) {
    if (!password || !verifyPassword(password, storedHash)) {
      const locked = recordFailedAttempt(emailLower, ip);
      memoryStore.addSystemLog({
        level: "auth",
        category: "security",
        message: "Failed lecturer login attempt: invalid password",
        details: { email: lecturer.email, ip, locked },
      });
      res.status(locked ? 423 : 401).json({
        error: locked
          ? "Too many failed login attempts. Account temporarily locked."
          : "Invalid email or password.",
      });
      return;
    }
  }

  lecturer.lastActiveAt = new Date();
  recordSuccessfulLoginTelemetry(emailLower, ip);

  const token = issueSessionToken(
    {
      userId: lecturer.userId,
      email: lecturer.email,
      fullName: lecturer.fullName,
      role: "lecturer",
      departments: lecturer.departments,
    },
    8 * 60 * 60 * 1000,
  );

  memoryStore.addSystemLog({
    level: "auth",
    category: "security",
    message: `Lecturer signed in (${lecturer.email})`,
    details: { email: lecturer.email, userId: lecturer.userId, ip },
  });

  res.json({
    token,
    accountType: "lecturer",
    user: {
      id: lecturer.userId,
      staffId: lecturer.staffId,
      fullName: lecturer.fullName,
      email: lecturer.email,
      departments: lecturer.departments,
      reviewStatus: lecturer.reviewStatus,
    },
  });
});

router.post("/auth/2fa/verify", (req, res): void => {
  const parsed = VerifyTwoFactorBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? parsed.error.message });
    return;
  }

  const challenge = memoryStore.twoFactorChallenges.get(parsed.data.challengeId);
  if (!challenge || Date.now() > challenge.expiresAt) {
    memoryStore.twoFactorChallenges.delete(parsed.data.challengeId);
    res.status(401).json({ error: "2FA challenge expired. Sign in again." });
    return;
  }

  if (challenge.code !== parsed.data.code) {
    memoryStore.addSystemLog({
      level: "auth",
      category: "security",
      message: `Failed 2FA verification code for ${challenge.email}`,
      details: { email: challenge.email, ip: req.ip },
    });
    res.status(401).json({ error: "Invalid 6-digit verification code." });
    return;
  }

  memoryStore.twoFactorChallenges.delete(challenge.challengeId);
  const ttlMs = (memoryStore.adminSettings.sessionTimeoutMinutes || 30) * 60_000;
  const token = issueSessionToken(
    {
      userId: challenge.userId,
      email: challenge.email,
      fullName: challenge.fullName,
      role: challenge.role,
      departments: challenge.departments,
    },
    ttlMs,
  );

  recordSuccessfulLoginTelemetry(challenge.email, req.ip ?? "127.0.0.1");

  memoryStore.recordAdminAudit({
    actorUserId: challenge.userId,
    actorEmail: challenge.email,
    actorRole: challenge.role,
    ip: req.ip,
    entityType: "admin_auth",
    entityId: challenge.userId,
    action: "admin_2fa_verified",
    details: { email: challenge.email },
  });

  res.json({
    token,
    accountType: "admin",
    user: {
      id: challenge.userId,
      fullName: challenge.fullName,
      email: challenge.email,
      role: challenge.role,
      departments: challenge.departments,
    },
    sessionTimeoutMinutes: memoryStore.adminSettings.sessionTimeoutMinutes,
  });
});

router.post("/auth/reauth", requireAdmin, (req, res): void => {
  const parsed = ReauthBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? parsed.error.message });
    return;
  }

  if (isAdminPasswordConfigured()) {
    if (!parsed.data.password || !verifyAdminPassword(parsed.data.password)) {
      memoryStore.addSystemLog({
        level: "auth",
        category: "security",
        message: `Failed sensitive-action re-authentication for ${req.authSession?.email}`,
        details: { email: req.authSession?.email, ip: req.ip },
      });
      res.status(401).json({ error: "Incorrect administrator password." });
      return;
    }
  } else if (!parsed.data.confirmDemo && !parsed.data.password) {
    res.status(400).json({ error: "Confirm re-authentication to proceed." });
    return;
  }

  const reauthToken = issueReauthToken(req.authSession!.userId);
  res.json({ reauthToken, expiresInSeconds: 300 });
});

router.post("/auth/lecturer/password-reset/request", (req, res): void => {
  const ip = req.ip ?? "127.0.0.1";
  const rate = checkAuthRateLimit(ip);
  if (!rate.allowed) {
    res.status(429).json({
      error: `Too many reset attempts. Try again in ${rate.retryAfterSec}s.`,
    });
    return;
  }

  const parsed = LecturerPasswordResetRequestBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? parsed.error.message });
    return;
  }

  const emailLower = parsed.data.email.trim().toLowerCase();
  const lecturer =
    memoryStore.lecturerProfiles.find((p) => p.email.toLowerCase() === emailLower) ??
    (emailLower === "mensah@school.edu.gh"
      ? memoryStore.getOrCreateProfile("user_mock_lecturer")
      : undefined);

  if (!lecturer || lecturer.reviewStatus === "removed" || lecturer.reviewStatus === "suspended") {
    res.json({
      ok: true,
      message: "If a matching lecturer account exists, a 6-digit password reset code has been sent.",
    });
    return;
  }

  const code = String(randomInt(100000, 999999));
  lecturerResetCodes.set(emailLower, {
    email: emailLower,
    code,
    expiresAt: Date.now() + 15 * 60_000,
  });

  memoryStore.addSystemLog({
    level: "auth",
    category: "security",
    message: `Lecturer password reset code issued for ${lecturer.email}`,
    details: { email: lecturer.email, userId: lecturer.userId, ip },
  });

  res.json({
    ok: true,
    message: "A 6-digit password reset code has been sent to your institutional email.",
    ...(process.env.NODE_ENV !== "production" ? { previewResetCode: code } : {}),
  });
});

router.post("/auth/lecturer/password-reset/confirm", (req, res): void => {
  const ip = req.ip ?? "127.0.0.1";
  const rate = checkAuthRateLimit(ip);
  if (!rate.allowed) {
    res.status(429).json({
      error: `Too many reset attempts. Try again in ${rate.retryAfterSec}s.`,
    });
    return;
  }

  const parsed = LecturerPasswordResetConfirmBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? parsed.error.message });
    return;
  }

  const emailLower = parsed.data.email.trim().toLowerCase();
  const entry = lecturerResetCodes.get(emailLower);
  if (!entry || Date.now() > entry.expiresAt) {
    lecturerResetCodes.delete(emailLower);
    res.status(400).json({ error: "Password reset code expired. Request a new code." });
    return;
  }
  if (entry.code !== parsed.data.code.trim()) {
    res.status(400).json({ error: "Invalid 6-digit password reset code." });
    return;
  }

  const lecturer =
    memoryStore.lecturerProfiles.find((p) => p.email.toLowerCase() === emailLower) ??
    (emailLower === "mensah@school.edu.gh"
      ? memoryStore.getOrCreateProfile("user_mock_lecturer")
      : undefined);

  if (!lecturer) {
    res.status(404).json({ error: "Lecturer account not found." });
    return;
  }

  lecturerResetCodes.delete(emailLower);
  memoryStore.lecturerPasswordHashes.set(emailLower, hashPassword(parsed.data.newPassword));
  memoryStore.loginAttempts.delete(emailLower);
  const revokedCount = revokeAllUserSessions(lecturer.userId);

  memoryStore.addSystemLog({
    level: "auth",
    category: "security",
    message: `Lecturer password reset completed for ${lecturer.email}`,
    details: { email: lecturer.email, userId: lecturer.userId, revokedSessions: revokedCount, ip },
  });

  res.json({ ok: true, revokedSessions: revokedCount });
});

router.post("/auth/logout", (req, res): void => {
  const token = extractBearerToken(req);
  if (token) {
    revokeSessionToken(token);
  }
  res.json({ success: true });
});

router.post("/auth/logout-all", (req, res): void => {
  const session = resolveRequestSession(req);
  const targetUserId = session?.userId ?? req.userId;
  if (!targetUserId) {
    res.status(401).json({ error: "Sign in to revoke active sessions." });
    return;
  }

  const revokedCount = revokeAllUserSessions(targetUserId);
  memoryStore.addSystemLog({
    level: "auth",
    category: "security",
    message: `All active sessions revoked for user ${session?.email ?? targetUserId}`,
    details: { userId: targetUserId, revokedSessions: revokedCount, ip: req.ip },
  });

  res.json({ success: true, revokedSessions: revokedCount });
});

export default router;
