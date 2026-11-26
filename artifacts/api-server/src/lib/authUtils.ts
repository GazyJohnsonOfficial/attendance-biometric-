import {
  createHash,
  createHmac,
  randomBytes,
  randomUUID,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import type { Request, RequestHandler } from "express";
import { memoryStore, type StoredAuthSession } from "./attendanceStore";

declare global {
  namespace Express {
    interface Request {
      userId?: string;
      authSession?: StoredAuthSession;
    }
  }
}

const EPHEMERAL_SESSION_SECRET = randomBytes(32).toString("hex");

function getSessionSecret(): string {
  return process.env.AUTH_SESSION_SECRET?.trim() || EPHEMERAL_SESSION_SECRET;
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const [salt, expectedHex] = storedHash.split(":");
  if (!salt || !expectedHex) return false;
  try {
    const actualBuf = scryptSync(password, salt, 64);
    const expectedBuf = Buffer.from(expectedHex, "hex");
    if (actualBuf.length !== expectedBuf.length) return false;
    return timingSafeEqual(actualBuf, expectedBuf);
  } catch {
    return false;
  }
}

export function verifyPasscodeConstantTime(input: string, configured: string): boolean {
  const inputDigest = createHash("sha256").update(input, "utf8").digest();
  const expectedDigest = createHash("sha256").update(configured, "utf8").digest();
  return timingSafeEqual(inputDigest, expectedDigest);
}

function signTokenId(tokenId: string): string {
  return createHmac("sha256", getSessionSecret()).update(tokenId).digest("hex");
}

export function issueSessionToken(
  sessionData: Omit<StoredAuthSession, "tokenId" | "expiresAt">,
  ttlMs = 8 * 60 * 60 * 1000,
): string {
  const tokenId = randomUUID();
  const session: StoredAuthSession = {
    ...sessionData,
    tokenId,
    expiresAt: Date.now() + ttlMs,
  };
  memoryStore.authSessions.set(tokenId, session);
  const sig = signTokenId(tokenId);
  return `${tokenId}.${sig}`;
}

export function verifySessionToken(token: string): StoredAuthSession | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [tokenId, providedSig] = parts;
  if (!tokenId || !providedSig) return null;

  const expectedSig = signTokenId(tokenId);
  try {
    const providedBuf = Buffer.from(providedSig, "hex");
    const expectedBuf = Buffer.from(expectedSig, "hex");
    if (providedBuf.length !== expectedBuf.length) return null;
    if (!timingSafeEqual(providedBuf, expectedBuf)) return null;
  } catch {
    return null;
  }

  const session = memoryStore.authSessions.get(tokenId);
  if (!session) return null;
  if (Date.now() > session.expiresAt) {
    memoryStore.authSessions.delete(tokenId);
    return null;
  }
  return session;
}

export function revokeSessionToken(token: string): boolean {
  const session = verifySessionToken(token);
  if (!session) return false;
  return memoryStore.authSessions.delete(session.tokenId);
}

export function revokeAllUserSessions(userId: string): number {
  let count = 0;
  for (const [tokenId, session] of memoryStore.authSessions.entries()) {
    if (session.userId === userId) {
      memoryStore.authSessions.delete(tokenId);
      count += 1;
    }
  }
  return count;
}

export function extractBearerToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (!authHeader) return null;
  const match = /^Bearer\s+(.+)$/i.exec(authHeader.trim());
  return match?.[1]?.trim() || null;
}

export function resolveRequestSession(req: Request): StoredAuthSession | null {
  if (req.authSession) return req.authSession;
  const token = extractBearerToken(req);
  if (!token) return null;
  const session = verifySessionToken(token);
  if (session) {
    req.authSession = session;
    if (session.role === "lecturer") {
      req.userId = session.userId;
    }
  }
  return session;
}

export const requireAdmin: RequestHandler = (req, res, next) => {
  const session = resolveRequestSession(req);
  if (!session) {
    res.status(401).json({ error: "Administrator sign-in required." });
    return;
  }
  if (session.role !== "super_admin" && session.role !== "department_admin") {
    res.status(403).json({ error: "Administrator privileges required for this route." });
    return;
  }
  req.userId = session.userId;
  next();
};

export function issueReauthToken(userId: string): string {
  const token = randomBytes(24).toString("hex");
  memoryStore.reauthTokens.set(token, {
    token,
    userId,
    expiresAt: Date.now() + 5 * 60 * 1000,
  });
  return token;
}

export function verifyReauthHeader(req: Request): boolean {
  const headerVal = req.headers["x-admin-reauth"];
  const token = Array.isArray(headerVal) ? headerVal[0] : headerVal;
  if (!token || !req.authSession) return false;
  const entry = memoryStore.reauthTokens.get(token.trim());
  if (!entry) return false;
  if (entry.userId !== req.authSession.userId || Date.now() > entry.expiresAt) {
    memoryStore.reauthTokens.delete(token.trim());
    return false;
  }
  return true;
}

export function getAdminDepartmentScope(req: Request): string[] | null {
  if (req.authSession?.role === "department_admin") {
    return req.authSession.departments ?? [];
  }
  return null;
}
