import express, { type NextFunction, type Request, type Response } from "express";
import cookieParser from "cookie-parser";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import apiRouter from "./artifacts/api-server/src/routes/index.js";
import { extractBearerToken, resolveRequestSession } from "./artifacts/api-server/src/lib/authUtils.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

  app.set("trust proxy", true);
  app.use(cookieParser());
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: true }));

  // Resolve bearer session when provided; attach built-in mock lecturer identity for preview mode only when no Bearer token is present
  app.use((req, _res, next) => {
    const session = resolveRequestSession(req);
    if (!session && !extractBearerToken(req) && !req.userId) {
      req.userId = "user_mock_lecturer";
    }
    next();
  });

  // API routes
  app.use("/api", apiRouter);

  // Structured JSON error handler for API routes
  app.use("/api", (err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    console.error("API error:", err);
    if (res.headersSent) return;
    const message =
      err instanceof Error ? err.message : "An unexpected server error occurred.";
    res.status(500).json({ error: message });
  });

  // Vite development middleware or static production serving
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.resolve(distPath, "index.html"));
    });
  }

  app.listen(port, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${port}`);
  });
}

startServer().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
