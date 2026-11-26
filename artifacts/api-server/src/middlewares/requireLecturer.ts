import type { RequestHandler } from "express";

declare global {
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

const requireLecturer: RequestHandler = (req, res, next) => {
  const userId =
    req.userId ?? (req as { auth?: { userId?: string } }).auth?.userId;
  if (!userId) {
    res.status(401).json({ error: "Sign in to access lecturer records." });
    return;
  }

  req.userId = userId;
  next();
};

export default requireLecturer;
